import { createHash } from "node:crypto";
import { mkdir, readFile, open, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const droughtDirectory = fileURLToPath(new URL("../../data_samples/2026-11-06/drought-7d5/", import.meta.url));
export const droughtRequests = [
  { file: "product.html", url: "https://spei.csic.es/database.html", max: 150_000 },
  { file: "viewer.html", url: "https://spei.csic.es/spei_database_2_11/", max: 100_000 },
  { file: "viewer-method.js", url: "https://spei.csic.es/spei_database_2_11/index_extra.js", max: 150_000 },
  { file: "odbl.html", url: "https://opendatacommons.org/licenses/odbl/1-0/", max: 200_000 },
  { file: "dbcl.html", url: "https://opendatacommons.org/licenses/dbcl/1-0/", max: 100_000 },
  { file: "spei03-t.nc", url: "https://spei.csic.es/spei_database_2_11/nc/spei03-t.nc", exact: 372677502 },
  { file: "spei12-t.nc", url: "https://spei.csic.es/spei_database_2_11/nc/spei12-t.nc", exact: 387068071 },
];
async function hashFile(path) {
  const file = await open(path, "r"), hash = createHash("sha256");
  let bytes = 0;
  try { for await (const chunk of file.createReadStream({ autoClose: false })) { bytes += chunk.length; hash.update(chunk); } }
  finally { await file.close(); }
  return { bytes, sha256: hash.digest("hex") };
}
export async function archiveDrought() {
  const sources = join(droughtDirectory, "sources"), manifestPath = join(droughtDirectory, "source-manifest.json");
  await mkdir(sources, { recursive: true });
  let manifest = { schema_version: 1, product: "SPEIbase 2.11 SPEI-3 and SPEI-12", sources: [] };
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const request of droughtRequests) {
    const path = join(sources, request.file);
    const prior = manifest.sources.find(row => row.file === request.file && row.url === request.url);
    if (prior) {
      const current = await hashFile(path);
      if (current.bytes !== prior.bytes || current.sha256 !== prior.sha256) throw new Error(`Changed drought original ${request.file}`);
      console.log(`Verified cached ${request.file}`); continue;
    }
    const response = await fetch(request.url, { signal: AbortSignal.timeout(900_000) });
    if (response.status !== 200 || !response.body) throw new Error(`${request.file}: HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length"));
    if (request.exact && length !== request.exact) throw new Error(`Changed producer size ${request.file}: ${length}`);
    const temporary = path + ".partial", file = await open(temporary, "wx"), hash = createHash("sha256");
    let bytes = 0;
    try {
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > (request.exact ?? request.max)) throw new Error(`Oversized drought source ${request.file}`);
        hash.update(chunk); await file.write(chunk);
      }
    } finally { await file.close(); }
    if (!bytes || (request.exact && bytes !== request.exact)) throw new Error(`Truncated drought source ${request.file}: ${bytes}`);
    if (request.exact) {
      const original = await open(temporary, "r");
      try {
        const header = Buffer.alloc(8); await original.read(header, 0, 8, 0);
        if (!header.equals(Buffer.from([137, 72, 68, 70, 13, 10, 26, 10]))) throw new Error(`Not NetCDF4/HDF5 ${request.file}`);
      } finally { await original.close(); }
    }
    try { await readFile(path); throw new Error(`Refusing existing original ${request.file}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await rename(temporary, path);
    manifest.sources.push({ file: request.file, url: request.url, final_url: response.url,
      bytes, sha256: hash.digest("hex"), status: "archived", retrieved_at: new Date().toISOString(),
      last_modified: response.headers.get("last-modified"), etag: response.headers.get("etag") });
    const output = await open(manifestPath, "w");
    try { await output.writeFile(JSON.stringify(manifest, null, 2) + "\n"); } finally { await output.close(); }
    console.log(`Archived ${request.file}: ${bytes}`, { flush: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await archiveDrought();
