import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boundedBody, sha256 } from "./audit_7d_sources.mjs";

export const snowDirectory = fileURLToPath(new URL("../../data_samples/2026-11-06/snow-cover-7d3/", import.meta.url));
const base = "https://climate.rutgers.edu/snowcover/190km/";
export const snowRequests = [
  ...["nhland", "eurasia", "namgnld", "nam"].map(id => ({
    file: `moncov.${id}.txt`, url: `${base}files/moncov.${id}.txt`, maxBytes: 40_000,
  })),
  { file: "weekly-nh.txt", url: `${base}files/wkcov.nhland.txt`, maxBytes: 100_000 },
  { file: "downloads.html", url: `${base}table_area.php?ui_set=2`, maxBytes: 60_000 },
  { file: "methods.html", url: `${base}docs.php?target=vis`, maxBytes: 70_000 },
  { file: "cdr.html", url: `${base}docs.php?target=cdr`, maxBytes: 70_000 },
  { file: "citation.html", url: `${base}docs.php?target=datareq`, maxBytes: 70_000 },
];

export async function archiveSnowCover() {
  const directory = resolve(snowDirectory, "sources");
  await mkdir(directory, { recursive: true });
  let manifest = { schema_version: 1, purpose: "7D.3 original producer monthly regional aggregates", sources: [] };
  try {
    manifest = JSON.parse(await readFile(resolve(snowDirectory, "source-manifest.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const request of snowRequests) {
    const cached = manifest.sources.find(row => row.file === request.file && row.url === request.url);
    if (cached) {
      const bytes = await readFile(resolve(directory, request.file));
      if (cached.bytes !== bytes.length || cached.sha256 !== sha256(bytes)) throw new Error(`Changed snow source ${request.file}`);
      continue;
    }
    const response = await fetch(request.url, { signal: AbortSignal.timeout(90_000) });
    if (!response.ok) throw new Error(`Snow source ${request.file}: HTTP ${response.status}`);
    const bytes = await boundedBody(response, request.maxBytes);
    if (request.file.endsWith(".txt") && !/^\d{4}\s+\d{2}\s+\d+/.test(bytes.toString("utf8"))) {
      throw new Error(`Non-numerical snow source ${request.file}`);
    }
    await writeFile(resolve(directory, request.file), bytes, { flag: "wx" });
    manifest.sources.push({ file: request.file, url: request.url, final_url: response.url,
      retrieved_at: new Date().toISOString(), status: "archived", bytes: bytes.length,
      sha256: sha256(bytes), content_type: response.headers.get("content-type") });
    await writeFile(resolve(snowDirectory, "source-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(`${request.file}: ${bytes.length} bytes`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await archiveSnowCover();
