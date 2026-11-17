import { copyFile, cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./audit_7d_sources.mjs";
import { verifyDroughtArtifact } from "./drought-api.mjs";
import { precipitationCandidate, verifyPrecipitationCandidate } from "./package_precipitation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const directory = join(root, "data_samples", "2026-11-06", "drought-7d5");
export const droughtCandidate = join(directory, "manual-review-candidate");
const json = bytes => JSON.parse(bytes.toString("utf8"));
const previousApis = /^weather_global\/(?:europe-api|continents-api|history-comparison-api|sea-ice-api|ice-sheets-api|snow-cover-api|precipitation-api)\//;
function confined(base, name) {
  const path = resolve(base, name);
  if (!path.startsWith(`${base}${sep}`)) throw new Error(`Unsafe candidate path: ${name}`);
  return path;
}
async function inventory(directory, base = directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name !== entry.name.toLowerCase()) throw new Error(`Unsafe candidate entry ${entry.name}`);
    const path = join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await inventory(path, base));
    else {
      const bytes = await readFile(path);
      rows.push({ file: relative(base, path).split(sep).join("/"), bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}
export async function verifyDroughtCandidate(candidate = droughtCandidate) {
  const manifest = json(await readFile(join(candidate, "manifest.json")));
  if (manifest.publication_allowed !== false || manifest.status !== "local-manual-review-7d5-not-a-public-release"
    || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Invalid drought candidate manifest");
  for (const row of manifest.files) {
    const bytes = await readFile(confined(candidate, row.file));
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw new Error(`Candidate changed: ${row.file}`);
  }
  if (JSON.stringify((await inventory(candidate)).filter(row => row.file !== "manifest.json")) !== JSON.stringify(manifest.files)) throw new Error("Candidate inventory mismatch");
  for (const family of ["europe-api", "continents-api", "history-comparison-api", "sea-ice-api", "ice-sheets-api", "snow-cover-api", "precipitation-api", "drought-api"]) {
    if (!manifest.files.some(row => row.file === `weather_global/${family}/v1/catalog.json`)) throw new Error(`Missing API ${family}`);
  }
  const api = join(candidate, "weather_global", "drought-api", "v1"), bytes = await readFile(join(api, "bundle.json"));
  verifyDroughtArtifact(json(await readFile(join(api, "catalog.json"))), bytes);
  const validation = json(await readFile(join(candidate, "validation.json")));
  if (validation.status !== "PASS-independent-raw-spei-histograms-and-geodesic-samples" || validation.monthly_records !== 20832
    || validation.valid_monthly_records !== 17778 || validation.annual_records !== 1736 || validation.geometry_samples !== 42
    || validation.artifact_sha256 !== sha256(bytes) || manifest.product_sha256 !== sha256(bytes)) throw new Error("Drought numerical evidence mismatch");
  const review = json(await readFile(join(candidate, "source-review.json")));
  if (review.publication_allowed !== false || review.use_review.database_licence !== "ODbL-1.0"
    || review.scientific_review.monitor_spliced !== false || review.uncertainty.confidence_level !== null) throw new Error("Misrepresented drought review");
  const notice = await readFile(join(candidate, "attribution.txt"), "utf8");
  if (!notice.includes("ODbL 1.0") || !notice.includes("drought-api/v1/bundle.json")) throw new Error("Missing adapted database offer");
  return manifest;
}
export async function stageDroughtCandidate() {
  const catalogBytes = await readFile(join(directory, "catalog.json"));
  const bytes = verifyDroughtArtifact(json(catalogBytes), await readFile(join(directory, "drought_v1.json")));
  const bundle = json(bytes), pins = bundle.provenance;
  const validation = json(await readFile(join(directory, "validation.json")));
  const review = json(await readFile(join(directory, "source-review.json")));
  for (const [digest, path] of [
    [validation.validator_sha256, join(root, "prototype", "scripts", "validate_drought.py")],
    [pins.builder_sha256, join(root, "prototype", "scripts", "build_drought.py")],
    [pins.manifest_sha256, join(directory, "source-manifest.json")],
    [pins.weights_sha256, join(directory, "weights.npz")], [pins.weights_metadata_sha256, join(directory, "weights.json")],
    ...Object.entries(pins.geometry_dependencies).map(([path, digest]) => [digest, join(root, path)]),
  ]) if (digest !== sha256(await readFile(path))) throw new Error(`Stale drought dependency ${path}`);
  if (validation.artifact_sha256 !== sha256(bytes) || review.publication_allowed !== false
    || review.use_review.database_licence !== "ODbL-1.0") throw new Error("Stale drought evidence");
  const previous = await verifyPrecipitationCandidate();
  await mkdir(droughtCandidate);
  const publicRoot = join(droughtCandidate, "weather_global");
  await cp(join(root, "prototype", "dist"), publicRoot, {
    recursive: true, errorOnExist: true, force: false,
    filter: async source => {
      if ((await lstat(source)).isSymbolicLink() || basename(source) !== basename(source).toLowerCase()) throw new Error(`Unsafe build entry ${source}`);
      return true;
    },
  });
  for (const row of previous.files) {
    const target = previousApis.test(row.file) ? row.file
      : !row.file.startsWith("weather_global/") ? `prior-evidence/precipitation-7d4/${row.file}` : null;
    if (!target) continue;
    const destination = confined(droughtCandidate, target); await mkdir(dirname(destination), { recursive: true });
    await copyFile(confined(precipitationCandidate, row.file), destination);
  }
  const api = join(publicRoot, "drought-api", "v1"); await mkdir(api, { recursive: true });
  await writeFile(join(api, "catalog.json"), catalogBytes); await writeFile(join(api, "bundle.json"), bytes);
  await copyFile(join(precipitationCandidate, "weather_global", "precipitation-api", "v1", ".htaccess"), join(api, ".htaccess"));
  for (const file of ["validation.json", "source-review.json", "weights.json", "source-manifest.json"]) await copyFile(join(directory, file), join(droughtCandidate, file));
  for (const file of ["odbl.html", "dbcl.html", "product.html"]) await copyFile(join(directory, "sources", file), join(droughtCandidate, file));
  await writeFile(join(droughtCandidate, "attribution.txt"), bundle.source.citation + "\n"
    + "This separate adapted drought database is made available under ODbL 1.0: https://opendatacommons.org/licenses/odbl/1-0/\n"
    + "Individual contents: DbCL 1.0. Original database: https://spei.csic.es/spei_database_2_11/\n"
    + "Complete machine-readable adapted database: weather_global/drought-api/v1/bundle.json (no technological restriction).\n"
    + "Modifications: native fractional WGS84 continental weights, explicit categories, available-area fractions, coverage and complete-year means.\n"
    + "Source index not recalculated, recentered or filled. No CSIC endorsement. Preserve notices and adapted-database access on any future public use.\n"
    + "GPCC and NASA remain separate existing API/database products with their own licences. Prior attribution recursively retained in prior-evidence/precipitation-7d4/.\n");
  await writeFile(join(droughtCandidate, "readme.txt"), `WEATHER GLOBAL - 7D.5 DROUGHT - LOCAL MANUAL REVIEW ONLY

Not a public release. No FTP, CRON, credentials, private configuration, raw
NetCDF archives or production pointers are included or changed. api.php needs
its separately configured private immutable storage.
Current frontend plus eight API families; all seven previous API families
remain byte-identical. Open #drought?lang=cs or #drought?lang=en.

SPEIbase 2.11 / CRU TS 4.09, FAO-56 Penman-Monteith, native 0.5 degree.
January 1901-December 2024, 1488 months, two scales: SPEI-3 and SPEI-12.
Initial 2/11 months missing. No Antarctic source domain; no invented values.
Native fractional WGS84 weights, monthly available-area denominator and
explicit source-domain/geographic-area shares. Rare missing values remain
missing, not zero drought and not excluded from every year.
Seven explicit mutually exclusive classes, plus overlapping cumulative dry
thresholds <=-1, <=-1.5, <=-2. No contour claiming local dry-cell locations.
Annual means of twelve monthly shares are average area burden, NOT unique
annual area. No annual 1901 result, index sum, mm conversion or recentering.
Calibration bounds not explicit in archived metadata; no invented baseline.
Separate GPCC precipitation and conservative NASA temperature retain their
own 1981-2010 references, support, methods and licences.
Not direct soil moisture, groundwater, hydrological impact or water access.
No operational Monitor splice, invented confidence interval or causation.

Read attribution.txt, odbl.html, dbcl.html, product.html, source-review.json,
validation.json and recursively preserved prior-evidence/. Entire adapted
drought database offered as drought-api/v1/bundle.json under ODbL 1.0.
Retain this unrestricted machine-readable offer and attribution on public use.
Earlier scientific/licensing/geography and visible native-interaction gates
remain. Never upload parent raw source archives or treat local candidate as
approved production deployment.
`);
  await writeFile(join(droughtCandidate, "manifest.json"), JSON.stringify({
    schema_version: 1, publication_allowed: false, status: "local-manual-review-7d5-not-a-public-release",
    product_sha256: sha256(bytes), previous_manifest_sha256: sha256(await readFile(join(precipitationCandidate, "manifest.json"))),
    files: await inventory(droughtCandidate),
  }, null, 2) + "\n");
  return verifyDroughtCandidate();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await stageDroughtCandidate();
  console.log(JSON.stringify({ candidate: droughtCandidate, files: manifest.files.length, publication_allowed: false }));
}
