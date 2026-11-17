import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const outputDirectory = fileURLToPath(new URL("../../data_samples/2026-11-06/phase7d-feasibility/", import.meta.url));
const nsidc = "https://noaadata.apps.nsidc.org/NOAA/G02135";
const gpcc = "https://opendata.dwd.de/climate_environment/GPCC";
export const requests = [
  ...["N", "S"].flatMap((region) => Array.from({ length: 12 }, (_, index) => {
    const name = `${region}_${String(index + 1).padStart(2, "0")}_extent_v4.0.csv`;
    return { file: name, url: `${nsidc}/${region === "N" ? "north" : "south"}/monthly/data/${name}`, maxBytes: 20_000 };
  })),
  { file: "nsidc-product.html", url: "https://nsidc.org/data/g02135/versions/4", maxBytes: 400_000 },
  { file: "nsidc-use.html", url: "https://nsidc.org/about/data-use-and-copyright", maxBytes: 200_000 },
  { file: "nsidc-guide.pdf", url: "https://nsidc.org/sites/default/files/g02135-v004-userguide.pdf", maxBytes: 8_000_000 },
  { file: "nsidc-guide-v4.pdf", url: "https://nsidc.org/sites/default/files/documents/user-guide/g02135-v004-userguide.pdf", maxBytes: 8_000_000 },
  { file: "nasa-ice-sheets.html", url: "https://science.nasa.gov/earth/explore/earth-indicators/ice-sheets/", maxBytes: 800_000 },
  { file: "grace-land-method.html", url: "https://grace.jpl.nasa.gov/data/get-data/monthly-mass-grids-land/", maxBytes: 250_000 },
  { file: "snow-product.html", url: "https://www.ncei.noaa.gov/products/climate-data-records/snow-cover-extent", maxBytes: 250_000 },
  { file: "snow-access.html", url: "https://www.ncei.noaa.gov/data/snow-cover-extent/access/", maxBytes: 30_000 },
  { file: "snow-sample.nc", url: "https://www.ncei.noaa.gov/data/snow-cover-extent/access/nhsce_v01r01_19661004_20261102.nc", maxBytes: 30_000_000 },
  { file: "noaa-use.html", url: "https://www.noaa.gov/disclaimer", maxBytes: 250_000 },
  { file: "gpcc-product.html", url: `${gpcc}/html/gpcc_precipitation_analysis_monthly_v2025_doi_download.html`, maxBytes: 100_000 },
  { file: "gpcc-files.html", url: `${gpcc}/GPCC_Precipitation_Analysis_Monthly/Version_2025/250_degree/`, maxBytes: 100_000 },
  { file: "gpcc-sample.nc.gz", url: `${gpcc}/GPCC_Precipitation_Analysis_Monthly/Version_2025/250_degree/gpcc_precipitation_analysis_monthly_2021_2025_v2025_250.nc.gz`, maxBytes: 8_000_000 },
  { file: "gpcc-2021-2024.nc.gz", url: `${gpcc}/GPCC_Precipitation_Analysis_Monthly/Version_2025/250_degree/gpcc_precipitation_analysis_monthly_2021_2024_v2025_250.nc.gz`, maxBytes: 8_000_000 },
  { file: "gpcc-use.html", url: "https://www.dwd.de/EN/service/copyright/copyright_artikel.html", maxBytes: 300_000 },
  { file: "gpcc-terms.html", url: "https://www.dwd.de/EN/service/legal_notice/legal_notice.html", maxBytes: 300_000 },
  { file: "spei-product.html", url: "https://spei.csic.es/database.html", maxBytes: 150_000 },
  { file: "spei-viewer-metadata.js", url: "https://spei.csic.es/spei_database_2_11/ncEnv.js", maxBytes: 100_000 },
  { file: "spei03-header.bin", url: "https://spei.csic.es/spei_database_2_11/nc/spei03-t.nc", range: "bytes=0-65535", maxBytes: 65536 },
  { file: "gcb-2025.html", url: "https://doi.org/10.18160/GCP-2025", maxBytes: 400_000 },
  { file: "gcb-global-metadata.html", url: "https://meta.icos-cp.eu/objects/qSjPBsV1drZnYdH-yCJMmkGn", maxBytes: 200_000 },
  { file: "gcb-global.xlsx", url: "https://data.icos-cp.eu/objects/qSjPBsV1drZnYdH-yCJMmkGn", maxBytes: 2_000_000 },
  { file: "ch4-product.html", url: "https://gml.noaa.gov/ccgg/trends_ch4/", maxBytes: 150_000 },
  { file: "n2o-product.html", url: "https://gml.noaa.gov/ccgg/trends_n2o/", maxBytes: 150_000 },
  { file: "ch4-monthly.txt", url: "https://gml.noaa.gov/webdata/ccgg/trends/ch4/ch4_mm_gl.txt", maxBytes: 200_000 },
  { file: "n2o-monthly.txt", url: "https://gml.noaa.gov/webdata/ccgg/trends/n2o/n2o_mm_gl.txt", maxBytes: 200_000 },
  { file: "gml-use.html", url: "https://gml.noaa.gov/about/disclaimer.html", maxBytes: 100_000 },
];

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function boundedBody(response, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  if (!size) throw new Error("Empty response");
  return Buffer.concat(chunks);
}

export async function archiveSources() {
  const sourceDirectory = resolve(outputDirectory, "sources");
  await mkdir(sourceDirectory, { recursive: true });
  let previous = [];
  try {
    previous = JSON.parse(await readFile(resolve(outputDirectory, "source-manifest.json"), "utf8")).sources;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const sources = [];
  for (const request of requests) {
    const path = resolve(sourceDirectory, request.file);
    const cached = previous.find((item) => item.file === request.file && item.url === request.url && item.status === "archived");
    if (cached) {
      const bytes = await readFile(path);
      if (sha256(bytes) !== cached.sha256 || bytes.length !== cached.bytes) {
        throw new Error(`Archived bytes changed: ${request.file}`);
      }
      sources.push(cached);
    } else {
      const result = { ...request, retrieved_at: new Date().toISOString() };
      try {
        const response = await fetch(request.url, {
          headers: request.range ? { Range: request.range } : {},
          signal: AbortSignal.timeout(90_000),
        });
        result.http_status = response.status;
        result.final_url = response.url;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (request.range && response.status !== 206) throw new Error("Server did not honor bounded range");
        const bytes = await boundedBody(response, request.maxBytes);
        if (request.range && bytes.length !== request.maxBytes) throw new Error("Incomplete requested range");
        Object.assign(result, {
          status: "archived",
          bytes: bytes.length,
          sha256: sha256(bytes),
          content_type: response.headers.get("content-type"),
          content_range: response.headers.get("content-range"),
          last_modified: response.headers.get("last-modified"),
        });
        await writeFile(path, bytes, { flag: "wx" });
        console.log(`${request.file}: ${bytes.length} bytes`);
      } catch (error) {
        result.status = "blocked";
        result.error = error.message;
        console.error(`${request.file}: ${error.message}`);
      }
      sources.push(result);
    }
    await writeFile(resolve(outputDirectory, "source-manifest.json"), JSON.stringify({
      schema_version: 1,
      purpose: "7D.0 local feasibility evidence; not a publishable release",
      sources: [...sources, ...previous.filter((item) =>
        !sources.some((source) => source.file === item.file))],
    }, null, 2) + "\n");
  }
  const blocked = sources.filter((source) => source.status !== "archived");
  console.log(`Archived ${sources.length - blocked.length}/${sources.length}; blocked ${blocked.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await archiveSources();
}
