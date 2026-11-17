import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { seaIceDirectory } from "./build_sea_ice.mjs";
import { verifySeaIceArtifact } from "./sea-ice-api.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const previous = join(root, "data_samples", "2026-11-06", "continents-history-7c8", "manual-review-candidate");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const json = bytes => JSON.parse(bytes.toString("utf8"));
const encode = value => JSON.stringify(value, null, 2) + "\n";
export const seaIceCandidate = join(seaIceDirectory, "manual-review-candidate");

function confined(directory, file) {
  const path = resolve(directory, file);
  if (!path.startsWith(`${directory}${sep}`)) throw new Error(`Unsafe candidate path: ${file}`);
  return path;
}

async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name !== entry.name.toLowerCase()) {
      throw new Error(`Unsafe candidate filename: ${entry.name}`);
    }
    if (entry.isDirectory()) await copyTree(join(from, entry.name), join(to, entry.name));
    else await copyFile(join(from, entry.name), join(to, entry.name));
  }
}

async function inventory(directory, base = directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Candidate symlink is forbidden");
    const path = join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await inventory(path, base));
    else {
      const bytes = await readFile(path);
      rows.push({ file: relative(base, path).split(sep).join("/"), bytes: bytes.length, sha256: sha(bytes) });
    }
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

export async function verifySeaIceReviewCandidate(directory = seaIceCandidate) {
  const manifest = json(await readFile(join(directory, "manifest.json")));
  if (manifest.publication_allowed !== false || manifest.status !== "local-manual-review-7d1-not-a-public-release"
    || !Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error("Invalid candidate manifest");
  for (const row of manifest.files) {
    const bytes = await readFile(confined(directory, row.file));
    if (bytes.length !== row.bytes || sha(bytes) !== row.sha256) throw new Error(`Candidate changed: ${row.file}`);
    if (row.file !== row.file.toLowerCase()) throw new Error("Uppercase candidate path");
  }
  const actual = (await inventory(directory)).filter(row => row.file !== "manifest.json");
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error("Candidate inventory mismatch");
  const api = join(directory, "weather_global", "sea-ice-api", "v1");
  const bytes = await readFile(join(api, "bundle.json"));
  const catalog = json(await readFile(join(api, "catalog.json")));
  verifySeaIceArtifact(catalog, bytes);
  const validation = json(await readFile(join(directory, "validation.json")));
  if (validation.status !== "PASS-independent-all-raw-months-and-references"
    || validation.checked_points !== 1152 || validation.checked_references !== 24
    || validation.artifact_sha256 !== sha(bytes) || manifest.product_sha256 !== sha(bytes)) {
    throw new Error("Candidate numerical evidence mismatch");
  }
  for (const family of ["europe-api", "continents-api", "history-comparison-api", "sea-ice-api"]) {
    if (!manifest.files.some(row => row.file === `weather_global/${family}/v1/catalog.json`)) {
      throw new Error(`Missing API family ${family}`);
    }
  }
  return manifest;
}

export async function stageSeaIceCandidate() {
  const catalogBytes = await readFile(join(seaIceDirectory, "catalog.json"));
  const bundleBytes = verifySeaIceArtifact(json(catalogBytes), await readFile(join(seaIceDirectory, "sea_ice_v1.json")));
  const bundle = json(bundleBytes);
  const validationBytes = await readFile(join(seaIceDirectory, "validation.json"));
  const validation = json(validationBytes);
  if (validation.status !== "PASS-independent-all-raw-months-and-references"
    || validation.artifact_sha256 !== sha(bundleBytes)
    || validation.validator_sha256 !== sha(await readFile(join(root, "prototype", "scripts", "validate_sea_ice.py")))
    || bundle.provenance.builder_sha256 !== sha(await readFile(join(root, "prototype", "scripts", "build_sea_ice.mjs")))) {
    throw new Error("Stale sea ice numerical evidence");
  }
  const previousManifest = json(await readFile(join(previous, "manifest.json")));
  const keep = row => /^weather_global\/(?:europe-api|continents-api|history-comparison-api)\//.test(row.file);
  for (const row of previousManifest.files.filter(keep)) {
    const bytes = await readFile(confined(previous, row.file));
    if (bytes.length !== row.bytes || sha(bytes) !== row.sha256) throw new Error(`Prior API changed: ${row.file}`);
  }
  await mkdir(seaIceCandidate); // A candidate is immutable; never merge into an older build.
  const publicRoot = join(seaIceCandidate, "weather_global");
  await copyTree(join(root, "prototype", "dist"), publicRoot);
  for (const family of ["europe-api", "continents-api", "history-comparison-api"]) {
    await copyTree(join(previous, "weather_global", family), join(publicRoot, family));
  }
  const api = join(publicRoot, "sea-ice-api", "v1");
  await mkdir(api, { recursive: true });
  await writeFile(join(api, "catalog.json"), catalogBytes);
  await writeFile(join(api, "bundle.json"), bundleBytes);
  await copyFile(join(previous, "weather_global", "history-comparison-api", "v1", ".htaccess"), join(api, ".htaccess"));
  await writeFile(join(seaIceCandidate, "validation.json"), validationBytes);
  await copyFile(join(previous, "source-review.json"), join(seaIceCandidate, "source-review.json"));
  await writeFile(join(seaIceCandidate, "attribution.txt"), bundle.source.citation + "\n"
    + "https://nsidc.org/about/data-use-and-copyright\nNSIDC does not endorse Weather Global.\n");
  await writeFile(join(seaIceCandidate, "readme.txt"), `WEATHER GLOBAL - 7D.1 SEA ICE - LOCAL MANUAL REVIEW ONLY

Not a public release. No FTP, CRON, credentials, config or production pointer changed.
Current static frontend plus unchanged earlier Europe/continental/history API
families. The api.php backend still requires its separately configured private
storage. Raw archives, secrets and private configuration are not included.

Open #sea-ice?lang=cs or #sea-ice?lang=en.
Separate Arctic/Antarctic monthly extent, November 1978 through October 2026.
Million km2. Monthly concentration threshold >=15%; not volume, mass or daily
extrema. Missing December 1987 and January 1988 stay null in both hemispheres.
1981-2010 project reference uses 29 available January/December values, otherwise
30. No filling or annual averages. 2026 contains January-October only.
Mixed quoted source identifiers are preserved, including NSIDC-0051,NSIDC-0081.
See attribution.txt and validation.json. NSIDC does not endorse this project.

Publication of the entire atlas still requires separate scientific/licensing
review, notably NASA redistribution and provisional Antarctic land geography.
The sea ice domain is not that continental land mask.
Verify manifest.json and validate all routes on separately authorised staging
before publication. Never upload the parent source archive directory.
`);
  await writeFile(join(seaIceCandidate, "manifest.json"), encode({
    schema_version: 1, publication_allowed: false,
    status: "local-manual-review-7d1-not-a-public-release",
    product_sha256: sha(bundleBytes), files: await inventory(seaIceCandidate),
  }));
  const manifest = await verifySeaIceReviewCandidate();
  console.log(`Verified ${manifest.files.length} immutable candidate files: ${seaIceCandidate}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await stageSeaIceCandidate();
}
