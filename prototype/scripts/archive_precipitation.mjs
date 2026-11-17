import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { boundedBody, sha256 } from "./audit_7d_sources.mjs";

export const precipitationDirectory = fileURLToPath(new URL("../../data_samples/2026-11-06/precipitation-7d4/", import.meta.url));
const base = "https://opendata.dwd.de/climate_environment/GPCC/";
const directory = `${base}GPCC_Precipitation_Analysis_Monthly/Version_2025/250_degree/`;
export const periods = [
  ...Array.from({ length: 26 }, (_, i) => `${1891 + i * 5}_${1895 + i * 5}`), "2021_2024",
  ...Array.from({ length: 12 }, (_, i) => `2025_${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 8 }, (_, i) => `2026_${String(i + 1).padStart(2, "0")}`),
];
export const precipitationRequests = [
  { file: "product.html", url: `${base}html/gpcc_precipitation_analysis_monthly_v2025_doi_download.html`, maxBytes: 100_000 },
  { file: "directory.html", url: directory, maxBytes: 100_000 },
  ...periods.flatMap(period => [
    { file: `gpcc_precipitation_analysis_monthly_${period}_v2025_250.nc.gz`,
      url: `${directory}gpcc_precipitation_analysis_monthly_${period}_v2025_250.nc.gz`, maxBytes: 6_000_000 },
    { file: `readme_md5_${period}_v2025_250.txt`, url: `${directory}readme_md5_${period}_v2025_250.txt`, maxBytes: 2_000 },
  ]),
];

export async function archivePrecipitation() {
  const sources = join(precipitationDirectory, "sources");
  await mkdir(sources, { recursive: true });
  let manifest = { schema_version: 1, product: "GPCC v2025 2.5 degree precip, not precip_infill", sources: [] };
  try { manifest = JSON.parse(await readFile(join(precipitationDirectory, "source-manifest.json"), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const request of precipitationRequests) {
    const cached = manifest.sources.find(row => row.file === request.file && row.url === request.url);
    if (cached) {
      const bytes = await readFile(join(sources, request.file));
      if (bytes.length !== cached.bytes || sha256(bytes) !== cached.sha256) throw new Error(`Changed GPCC source ${request.file}`);
      continue;
    }
    const response = await fetch(request.url, { signal: AbortSignal.timeout(90_000) });
    if (!response.ok) throw new Error(`GPCC ${request.file}: HTTP ${response.status}`);
    const bytes = await boundedBody(response, request.maxBytes);
    if (request.file.endsWith(".gz") && (bytes[0] !== 0x1f || bytes[1] !== 0x8b)) throw new Error("GPCC response is not gzip");
    await writeFile(join(sources, request.file), bytes, { flag: "wx" });
    manifest.sources.push({ file: request.file, url: request.url, retrieved_at: new Date().toISOString(),
      bytes: bytes.length, sha256: sha256(bytes), status: "archived" });
    await writeFile(join(precipitationDirectory, "source-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(`${request.file}: ${bytes.length}`);
  }
  for (const period of periods) {
    const filename = `gpcc_precipitation_analysis_monthly_${period}_v2025_250.nc.gz`;
    const checksum = await readFile(join(sources, `readme_md5_${period}_v2025_250.txt`), "utf8");
    const expected = checksum.match(/\b[a-f0-9]{32}\b/i)?.[0].toLowerCase();
    const actual = createHash("md5").update(await readFile(join(sources, filename))).digest("hex");
    if (!expected || expected !== actual) throw new Error(`Producer MD5 mismatch ${filename}`);
  }
  console.log(`Verified ${periods.length} original GPCC gzip files and producer MD5s.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await archivePrecipitation();
