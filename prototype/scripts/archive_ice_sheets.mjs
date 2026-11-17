import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boundedBody, sha256 } from "./audit_7d_sources.mjs";

export const iceSheetDirectory = fileURLToPath(new URL("../../data_samples/2026-11-06/ice-sheets-7d2/", import.meta.url));
const chartBase = "https://assets.science.nasa.gov/content/dam/science/microapps/vital-signs/data/charts/";
export const iceSheetRequests = [
  ...["greenland", "antarctica"].map(id => ({
    file: `${id}.json`, url: `${chartBase}ice-sheets-${id}.json`, maxBytes: 500_000, type: "chart-json",
  })),
  { file: "nasa-indicator.html", url: "https://science.nasa.gov/earth/explore/earth-indicators/ice-sheets/", maxBytes: 1_000_000 },
  { file: "nasa-chart.html", url: "https://science.nasa.gov/specials/apps/vital-signs/ice-sheets-greenland-chart.html", maxBytes: 30_000 },
  { file: "nasa-chart-loader.js", url: "https://science.nasa.gov/specials/apps/vital-signs/assets/vital-signs.js", maxBytes: 2_000_000 },
  ...["GREENLAND", "ANTARCTICA"].map(id => ({
    file: `${id.toLowerCase()}-product.html`,
    url: `https://podaac.jpl.nasa.gov/dataset/${id}_MASS_TELLUS_MASCON_CRI_TIME_SERIES_RL06.3_V4`, maxBytes: 500_000,
  })),
  { file: "podaac-use.html", url: "https://podaac.jpl.nasa.gov/CitingPODAAC", maxBytes: 500_000 },
  { file: "jpl-method.html", url: "https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/", maxBytes: 400_000 },
  { file: "release-notes.txt", url: "https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-docs/gracefo/open/docs/GRACE_GRACE-FO_ReleaseNotes_JPL_MASCON.txt", maxBytes: 100_000 },
  { file: "nasa-use.html", url: "https://www.nasa.gov/nasa-brand-center/images-and-media/", maxBytes: 600_000 },
];

export async function archiveIceSheets() {
  const directory = resolve(iceSheetDirectory, "sources");
  await mkdir(directory, { recursive: true });
  let previous = [];
  try {
    previous = JSON.parse(await readFile(resolve(iceSheetDirectory, "source-manifest.json"), "utf8")).sources;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const sources = [...previous];
  for (const request of iceSheetRequests) {
    const path = resolve(directory, request.file);
    const cached = previous.find(row => row.file === request.file && row.url === request.url && row.status === "archived");
    if (cached) {
      const bytes = await readFile(path);
      if (bytes.length !== cached.bytes || sha256(bytes) !== cached.sha256) throw new Error(`Source changed: ${request.file}`);
      continue;
    }
    const response = await fetch(request.url, { signal: AbortSignal.timeout(90_000) });
    if (!response.ok) {
      const failed = { file: request.file, url: request.url, retrieved_at: new Date().toISOString(),
        status: "blocked", http_status: response.status, error: `HTTP ${response.status}` };
      const index = sources.findIndex(row => row.file === request.file);
      if (index >= 0) sources[index] = failed;
      else sources.push(failed);
      await writeFile(resolve(iceSheetDirectory, "source-manifest.json"), JSON.stringify({
        schema_version: 1,
        source_selection: "Public NASA Earth Indicator chart JSON; not an authenticated download of PO.DAAC scientific granules.",
        sources,
      }, null, 2) + "\n");
      console.error(`${request.file}: HTTP ${response.status}; recorded as unavailable documentation`);
      continue;
    }
    const bytes = await boundedBody(response, request.maxBytes);
    if (request.type === "chart-json") {
      const value = JSON.parse(bytes.toString("utf8"));
      if (!Array.isArray(value.items) || value.items.length < 200 || !value.chart_id?.startsWith("LandIce")) {
        throw new Error(`Unexpected public chart: ${request.file}`);
      }
    }
    await writeFile(path, bytes, { flag: "wx" });
    const row = {
      file: request.file, url: request.url, retrieved_at: new Date().toISOString(),
      status: "archived", http_status: response.status, bytes: bytes.length, sha256: sha256(bytes),
      content_type: response.headers.get("content-type"), last_modified: response.headers.get("last-modified"),
    };
    const index = sources.findIndex(source => source.file === request.file);
    if (index >= 0) sources[index] = row;
    else sources.push(row);
    await writeFile(resolve(iceSheetDirectory, "source-manifest.json"), JSON.stringify({
      schema_version: 1,
      source_selection: "Public NASA Earth Indicator chart JSON; not an authenticated download of PO.DAAC scientific granules.",
      sources,
    }, null, 2) + "\n");
    console.log(`${request.file}: ${bytes.length} bytes`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await archiveIceSheets();
