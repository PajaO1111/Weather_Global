import { copyFile, cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./audit_7d_sources.mjs";
import { verifyPrecipitationArtifact } from "./precipitation-api.mjs";
import { snowCandidate, verifySnowCandidate } from "./package_snow_cover.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const directory = join(root, "data_samples", "2026-11-06", "precipitation-7d4");
export const precipitationCandidate = join(directory, "manual-review-candidate");
const encode = value => JSON.stringify(value, null, 2) + "\n";
const json = bytes => JSON.parse(bytes.toString("utf8"));
const previousApis = /^weather_global\/(?:europe-api|continents-api|history-comparison-api|sea-ice-api|ice-sheets-api|snow-cover-api)\//;
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
export async function verifyPrecipitationCandidate(candidate = precipitationCandidate) {
  const manifest = json(await readFile(join(candidate, "manifest.json")));
  if (manifest.publication_allowed !== false || manifest.status !== "local-manual-review-7d4-not-a-public-release"
    || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Invalid precipitation candidate manifest");
  for (const row of manifest.files) {
    const bytes = await readFile(confined(candidate, row.file));
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw new Error(`Candidate changed: ${row.file}`);
  }
  const actual = (await inventory(candidate)).filter(row => row.file !== "manifest.json");
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error("Candidate inventory mismatch");
  for (const family of ["europe-api", "continents-api", "history-comparison-api", "sea-ice-api", "ice-sheets-api", "snow-cover-api", "precipitation-api"]) {
    if (!manifest.files.some(row => row.file === `weather_global/${family}/v1/catalog.json`)) throw new Error(`Missing API ${family}`);
  }
  const api = join(candidate, "weather_global", "precipitation-api", "v1");
  const bytes = await readFile(join(api, "bundle.json"));
  verifyPrecipitationArtifact(json(await readFile(join(api, "catalog.json"))), bytes);
  const validation = json(await readFile(join(candidate, "validation.json")));
  if (validation.status !== "PASS-independent-raw-netcdf-and-geodesic-samples" || validation.checked_month_records !== 11396
    || validation.checked_valid_month_values !== 9768 || validation.checked_annual_records !== 952
    || validation.checked_references !== 91 || validation.independent_geometry_cells !== 42
    || validation.artifact_sha256 !== sha256(bytes) || manifest.product_sha256 !== sha256(bytes)) throw new Error("Precipitation evidence mismatch");
  const review = json(await readFile(join(candidate, "source-review.json")));
  if (review.publication_allowed !== false || review.source.selected_variable !== "precip"
    || review.scientific_review.project_infill_or_extrapolation !== false
    || review.uncertainty.confidence_level !== null) throw new Error("Misrepresented precipitation review");
  return manifest;
}
export async function stagePrecipitationCandidate() {
  const catalogBytes = await readFile(join(directory, "catalog.json"));
  const bytes = verifyPrecipitationArtifact(json(catalogBytes), await readFile(join(directory, "precipitation_v1.json")));
  const bundle = json(bytes), pins = bundle.provenance;
  const validationBytes = await readFile(join(directory, "validation.json")), validation = json(validationBytes);
  const reviewBytes = await readFile(join(directory, "source-review.json")), review = json(reviewBytes);
  for (const [digest, path] of [
    [validation.validator_sha256, join(root, "prototype", "scripts", "validate_precipitation.py")],
    [pins.builder_sha256, join(root, "prototype", "scripts", "build_precipitation.py")],
    [pins.manifest_sha256, join(directory, "source-manifest.json")],
    [pins.weights_sha256, join(directory, "weights.npz")],
    [pins.weights_metadata_sha256, join(directory, "weights.json")],
    [pins.licence_sha256, join(root, "data_samples", "2026-11-06", "phase7d-feasibility", "sources", "gpcc-terms.html")],
    ...Object.entries(pins.geometry_dependencies).map(([path, digest]) => [digest, join(root, path)]),
  ]) if (digest !== sha256(await readFile(path))) throw new Error(`Stale precipitation dependency ${path}`);
  if (validation.artifact_sha256 !== sha256(bytes) || review.publication_allowed !== false
    || review.source.selected_variable !== "precip") throw new Error("Stale precipitation evidence");
  const previous = await verifySnowCandidate();
  await mkdir(precipitationCandidate);
  const publicRoot = join(precipitationCandidate, "weather_global");
  await cp(join(root, "prototype", "dist"), publicRoot, {
    recursive: true, errorOnExist: true, force: false,
    filter: async source => {
      if ((await lstat(source)).isSymbolicLink() || basename(source) !== basename(source).toLowerCase()) throw new Error(`Unsafe build entry ${source}`);
      return true;
    },
  });
  for (const row of previous.files) {
    const target = previousApis.test(row.file) ? row.file
      : !row.file.startsWith("weather_global/") ? `prior-evidence/snow-cover-7d3/${row.file}` : null;
    if (!target) continue;
    const destination = confined(precipitationCandidate, target);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(confined(snowCandidate, row.file), destination);
  }
  const api = join(publicRoot, "precipitation-api", "v1");
  await mkdir(api, { recursive: true });
  await writeFile(join(api, "catalog.json"), catalogBytes);
  await writeFile(join(api, "bundle.json"), bytes);
  await copyFile(join(snowCandidate, "weather_global", "snow-cover-api", "v1", ".htaccess"), join(api, ".htaccess"));
  for (const file of ["validation.json", "source-review.json", "weights.json"]) await copyFile(join(directory, file), join(precipitationCandidate, file));
  await copyFile(join(root, "data_samples", "2026-11-06", "phase7d-feasibility", "sources", "gpcc-terms.html"),
    join(precipitationCandidate, "dwd-terms.html"));
  await writeFile(join(precipitationCandidate, "attribution.txt"), bundle.source.citation + "\n"
    + "Licence: https://creativecommons.org/licenses/by/4.0/\n"
    + "Modified: fractional continental reductions, common fixed support, annual sums and project 1981-2010 references.\n"
    + "No DWD/GPCC endorsement. Previous source attribution/review is recursively preserved in prior-evidence/snow-cover-7d3/.\n");
  await writeFile(join(precipitationCandidate, "readme.txt"), `WEATHER GLOBAL - 7D.4 PRECIPITATION - LOCAL MANUAL REVIEW ONLY

Not a public release. No FTP, CRON, credentials, private configuration, raw
archives or production pointers are included or changed. api.php needs its
separately configured private immutable-release storage.
Current frontend plus seven API families. All six earlier API families
remain byte-identical. Open #precipitation?lang=cs or #precipitation?lang=en.

GPCC Version 2025, native 2.5 degree precip field, NOT precip_infill.
January 1891-August 2026: 1628 months for six continents. Antarctica null.
New WGS84 fractional grid/geography intersections; fixed common valid land
support for every month. Unsupported area explicitly retained.
Annual depths SUM twelve monthly depths on identical support. Never day
weighting. 2026 has only eight months and no annual total.
Project 1981-2010 references: thirty same-calendar-month values and thirty
complete yearly sums. No temporal filling or extrapolation.
Gauge-cell area fraction and interpolation distance are diagnostics, not
confidence intervals or directly observed area. No extra sys_err applied.
Regional err confidence bands are not invented. Rounded output supports
reproducibility, not a six-decimal measurement-precision claim.
Map colours are continental supported-land means, not local rainfall.
Precipitation is not groundwater, water storage, runoff or drought diagnosis.
Read source-review.json, validation.json, dwd-terms.html, attribution.txt
and recursively preserved prior-evidence/. All previous release gates,
including visible native interaction checks, remain. Never upload raw
parent source directories.
`);
  await writeFile(join(precipitationCandidate, "manifest.json"), encode({
    schema_version: 1, publication_allowed: false, status: "local-manual-review-7d4-not-a-public-release",
    product_sha256: sha256(bytes), previous_manifest_sha256: sha256(await readFile(join(snowCandidate, "manifest.json"))),
    files: await inventory(precipitationCandidate),
  }));
  return verifyPrecipitationCandidate();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await stagePrecipitationCandidate();
  console.log(JSON.stringify({ candidate: precipitationCandidate, files: manifest.files.length, publication_allowed: false }));
}
