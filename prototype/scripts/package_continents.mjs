/* Stage a checksum-verified manual-review candidate, never upload or activate it. */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { europeCatalog } from "../src/europe-api.js";
import { verifyEuropeArtifact } from "./europe-api.mjs";
import { validateCdsPreview } from "../src/cds-preview.js";
import { validateCmip6Preview } from "../src/cmip6-preview.js";
import { validateHistoryPreview } from "../src/history-preview.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = join(root, "data_samples", "2026-11-06");
const completion = join(source, "continents-7c-completion");
const destination = join(completion, "manual-review-candidate");
const publicRoot = join(destination, "weather_global");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const readJson = async path => JSON.parse(await readFile(path, "utf8"));

async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.name !== entry.name.toLowerCase() || entry.isSymbolicLink()) {
      throw new Error(`Unsafe deployment filename or symlink: ${entry.name}`);
    }
    if (entry.isDirectory()) await copyTree(join(from, entry.name), join(to, entry.name));
    else await copyFile(join(from, entry.name), join(to, entry.name));
  }
}

async function inventory(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(path));
    else {
      const bytes = await readFile(path);
      files.push({ file: relative(destination, path).split(sep).join("/"), bytes: bytes.length, sha256: digest(bytes) });
    }
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}

const validation = await readJson(join(completion, "validation.json"));
const catalogBytes = await readFile(join(completion, "catalog.json"));
const catalog = JSON.parse(catalogBytes);
const bundle = await readFile(join(completion, "continental_temperatures_v1.json"));
const product = JSON.parse(bundle);
const sourceReview = await readFile(join(completion, "source-review", "source-review.json"));
const outputs = await readJson(join(completion, "outputs.json"));
for (const row of outputs.files) {
  const path = resolve(completion, row.file);
  if (!path.startsWith(`${completion}${sep}`) || relative(completion, path).startsWith("..")) {
    throw new Error("Output manifest path is outside the completion directory.");
  }
  const bytes = await readFile(path);
  if (bytes.length !== row.bytes || digest(bytes) !== row.sha256) {
    throw new Error(`Completion output changed: ${row.file}`);
  }
}
for (const [name, pin] of Object.entries(product.provenance.implementation_sha256)) {
  if (digest(await readFile(join(root, "prototype", "scripts", name))) !== pin) {
    throw new Error(`Numerical implementation changed: ${name}`);
  }
}
if (catalog.publication_allowed !== false || catalog.product.sha256 !== digest(bundle)
    || catalog.product.bytes !== bundle.length || validation.artifact_sha256 !== digest(bundle)
    || product.source_review.sha256 !== digest(sourceReview)
    || validation.validator_sha256 !== digest(await readFile(join(root, "prototype", "scripts", "validate_continental_temperatures.py")))
    || !outputs.files.some(row => row.file === "validation.json")
    || !outputs.files.some(row => row.file === "source-review/source-review.json")
    || validation.status !== "PASS-six-continental-products-Antarctic-temperatures-blocked") {
  throw new Error("Unverified or unexpected continental review candidate.");
}
try {
  await mkdir(destination);
} catch (error) {
  if (error.code === "EEXIST") throw new Error("Review candidate already exists; preserve it and select a new version.");
  throw error;
}
await copyTree(join(root, "prototype", "dist"), publicRoot);
const api = join(publicRoot, "continents-api", "v1");
await mkdir(api, { recursive: true });
await writeFile(join(api, "catalog.json"), catalogBytes);
await writeFile(join(api, "bundle.json"), bundle);
await writeFile(join(api, ".htaccess"), `Options -Indexes
<IfModule mod_headers.c>
Header set Cache-Control "no-store"
Header set X-Content-Type-Options "nosniff"
</IfModule>
`);
const europeApi = join(publicRoot, "europe-api", "v1");
await mkdir(europeApi, { recursive: true });
await writeFile(join(europeApi, "catalog.json"), `${JSON.stringify(europeCatalog)}\n`);
const legacyFiles = {
  cmip6: [join(source, "europe-cmip6-pair", "europe_pair_anomalies_v1.json"), validateCmip6Preview],
  history: [join(source, "europe-history", "europe_history_v1.json"), validateHistoryPreview],
  cds: [join(source, "europe-cds-annual", "validation", "eu27_preview.json"), validateCdsPreview],
};
for (const product of europeCatalog.products) {
  const [path, validate] = legacyFiles[product.id];
  const bytes = verifyEuropeArtifact(product, await readFile(path), validate);
  await writeFile(join(europeApi, `${product.id}.json`), bytes);
}
await copyFile(join(api, ".htaccess"), join(europeApi, ".htaccess"));
await copyFile(join(completion, "validation.json"), join(destination, "validation.json"));
await writeFile(join(destination, "source-review.json"), sourceReview);
await writeFile(join(destination, "readme.txt"), `WEATHER GLOBAL 7C - MANUAL REVIEW CANDIDATE, NOT A PUBLIC RELEASE

This directory is an offline staging result. No FTP, CRON, production API or
release pointer was contacted. Public deployment is NOT authorised by this build.
Antarctic temperatures are deliberately unavailable until independent grounding
geometry is verified. NASA 250km histories for Africa, South America and Oceania
are unavailable because their complete reference fails the coverage rule.
NASA product-specific redistribution terms and CDS EU27 methodology remain
unresolved. The archived alternative NASA 1200km binary source is NOT used.
Read validation.json and source-review.json before any release decision.

The weather_global directory is a candidate public tree. Never upload its parent
or repository data_samples, raw NetCDF, config, storage, logs or credentials.
The existing api.php/cron.php still require the previously configured private PHP
backend. This candidate contains NO private backend configuration or storage.
Preserve the hosting config.php, storage/current.json and production CRON.
Do not invoke the importer or change release pointers to stage these JSON files.

European legacy v1 endpoints are retained, explicitly flagged INVALID GEOGRAPHY.
The continents view contains newly calculated corrected Europe plus five other
non-Antarctic regions. Do not remove archive warnings or call old numbers v3.
Both catalogues/clients must be updated atomically together with their JSON.
The original raw-data SHA-256 provenance is retained in the products.

CMIP6 adaptations: CC BY-SA 4.0, attribution in bundle.sources and the UI.
Natural Earth: public domain. NASA use/citation evidence is in source-review.json;
do not apply the CMIP6 licence to NASA. CDS remains a separate technical preview.
Existing ECharts/zrender notices are preserved under assets.

Checks before a separately authorised deployment: verify every file against
manifest.json, test all CS/EN routes and GET/HEAD endpoints on a staging host,
check no-store headers, blocked Antarctica, NASA gaps, selectors and comparisons.
Keep a backup and test rollback. Any missing PHP backend must be configured
separately, never by copying this machine's private storage or secrets.
`);
await writeFile(join(destination, "manifest.json"), `${JSON.stringify({
  schema_version: 1, status: "manual-review-candidate-not-authorised-for-publication",
  publication_allowed: false, product_sha256: digest(bundle), files: await inventory(destination),
}, null, 2)}\n`);
console.log(`Staged ${destination}`);
