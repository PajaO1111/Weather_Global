/* Stage the two-view build for manual local review, never publish it. */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const input = join(root, "data_samples", "2026-11-06", "continents-history-7c8");
const previous = join(root, "data_samples", "2026-11-06", "continents-7c-completion");
const destination = join(input, "manual-review-candidate");
const publicRoot = join(destination, "weather_global");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const readJson = async path => JSON.parse(await readFile(path, "utf8"));

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

async function inventory(directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await inventory(path));
    else {
      const bytes = await readFile(path);
      rows.push({ file: relative(destination, path).split(sep).join("/"), bytes: bytes.length, sha256: digest(bytes) });
    }
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

const manifest = await readJson(join(input, "outputs.json"));
for (const row of manifest.files) {
  const path = resolve(input, row.file);
  if (!path.startsWith(`${input}${sep}`)) throw new Error("Output path escapes historical product.");
  const bytes = await readFile(path);
  if (bytes.length !== row.bytes || digest(bytes) !== row.sha256) throw new Error(`Stale output: ${row.file}`);
}
const bundleBytes = await readFile(join(input, "history_comparison_v1.json"));
const bundle = JSON.parse(bundleBytes);
const catalogBytes = await readFile(join(input, "catalog.json"));
const catalog = JSON.parse(catalogBytes);
const validation = await readJson(join(input, "validation.json"));
if (validation.status !== "PASS-two-local-views-with-explicit-estimates-and-scientific-limits"
    || validation.artifact_sha256 !== digest(bundleBytes)
    || catalog.product.sha256 !== digest(bundleBytes) || catalog.product.bytes !== bundleBytes.length
    || bundle.publication_allowed !== false
    || validation.validator_sha256 !== digest(await readFile(join(root, "prototype", "scripts", "validate_history_comparison.py")))
    || bundle.provenance.implementation_sha256 !== digest(await readFile(join(root, "prototype", "scripts", "build_history_comparison.py")))
    || bundle.source.sha256 !== digest(await readFile(join(root, bundle.provenance.source_file)))) {
  throw new Error("Historical candidate has stale numerical/source evidence.");
}
// Preserve the prior API data byte-for-byte, but always use the current frontend build.
const oldRoot = join(previous, "manual-review-candidate");
const oldManifest = await readJson(join(oldRoot, "manifest.json"));
for (const row of oldManifest.files) {
  if (!/^weather_global\/(?:continents-api|europe-api)\//.test(row.file)) continue;
  const bytes = await readFile(join(oldRoot, row.file));
  if (bytes.length !== row.bytes || digest(bytes) !== row.sha256) throw new Error(`Old API data changed: ${row.file}`);
}
await mkdir(destination); // Refuse to overwrite any existing candidate.
await copyTree(join(root, "prototype", "dist"), publicRoot);
for (const folder of ["continents-api", "europe-api"]) {
  await copyTree(join(oldRoot, "weather_global", folder), join(publicRoot, folder));
}
const api = join(publicRoot, "history-comparison-api", "v1");
await mkdir(api, { recursive: true });
await writeFile(join(api, "catalog.json"), catalogBytes);
await writeFile(join(api, "bundle.json"), bundleBytes);
await copyFile(join(oldRoot, "weather_global", "continents-api", "v1", ".htaccess"), join(api, ".htaccess"));
await copyFile(join(input, "validation.json"), join(destination, "validation.json"));
await copyFile(join(previous, "source-review", "source-review.json"), join(destination, "source-review.json"));
await writeFile(join(destination, "readme.txt"), `WEATHER GLOBAL - TWO HISTORICAL VIEWS - LOCAL MANUAL REVIEW ONLY

This is not a public release. No FTP, CRON or release pointer was changed.
The current frontend and all three local API product families are included.
The existing api.php still needs the externally configured private PHP backend.
NO configuration, credentials, private storage or raw source archives are copied.

Open #continental-history?lang=cs or lang=en.
Conservative: one NASA1200 analysis, no project filling.
Exploratory: bounded internal temporal estimates and same-continent spatial
estimates. No extension before/after the source. Missing remains missing when
rules fail. NASA is itself an observation-derived spatial analysis, not a direct
measurement in every cell. The continental map is not local spatial detail.
Antarctica is explicitly PROVISIONAL geography in the exploratory view only,
not a certified grounded-ice area, ice-mass observation or sea-level estimate.
The source ends in September2026; the partial2026 annual value stays missing.
The common six-region conservative period is1926-2025.

Read validation.json for scalar raw-source/reference checks, fixed-footprint
sensitivity and held-out estimate errors. These errors are not confidence
intervals; holdouts use already smoothed analysis, not independent stations.
NASA redistribution terms remain unresolved; publication_allowed is false.
Retain previous NASA250/CMIP6/CDS sources, warnings and separate identities.
Verify manifest.json and all CS/EN routes on a separately authorised staging
host before considering publication. Never upload the parent directory.
`);
await writeFile(join(destination, "manifest.json"), `${JSON.stringify({
  schema_version: 1, publication_allowed: false,
  status: "manual-review-two-historical-views-not-authorised-for-publication",
  product_sha256: digest(bundleBytes), files: await inventory(destination),
}, null, 2)}\n`);
console.log(`Staged ${destination}`);
