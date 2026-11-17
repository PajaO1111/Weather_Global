import { createHash } from "node:crypto";
import { copyFile, cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { iceSheetDirectory } from "./build_ice_sheets.mjs";
import { verifyIceSheetArtifact } from "./ice-sheets-api.mjs";
import { seaIceCandidate, verifySeaIceReviewCandidate } from "./package_sea_ice.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const json = bytes => JSON.parse(bytes.toString("utf8"));
const encode = value => JSON.stringify(value, null, 2) + "\n";
const families = ["europe-api", "continents-api", "history-comparison-api", "sea-ice-api", "ice-sheets-api"];
export const iceSheetCandidate = join(iceSheetDirectory, "manual-review-candidate-r2");

function confined(directory, file) {
  const path = resolve(directory, file);
  if (!path.startsWith(`${directory}${sep}`)) throw new Error(`Unsafe candidate path: ${file}`);
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
      rows.push({ file: relative(base, path).split(sep).join("/"), bytes: bytes.length, sha256: sha(bytes) });
    }
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

export async function verifyIceSheetReviewCandidate(directory = iceSheetCandidate) {
  const manifest = json(await readFile(join(directory, "manifest.json")));
  if (manifest.publication_allowed !== false || manifest.status !== "local-manual-review-7d2-not-a-public-release"
    || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Invalid land ice candidate manifest");
  for (const row of manifest.files) {
    const bytes = await readFile(confined(directory, row.file));
    if (bytes.length !== row.bytes || sha(bytes) !== row.sha256) throw new Error(`Candidate changed: ${row.file}`);
  }
  const actual = (await inventory(directory)).filter(row => row.file !== "manifest.json");
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error("Candidate inventory mismatch");
  for (const family of families) {
    if (!manifest.files.some(row => row.file === `weather_global/${family}/v1/catalog.json`)) {
      throw new Error(`Missing API family ${family}`);
    }
  }
  const api = join(directory, "weather_global", "ice-sheets-api", "v1");
  const bytes = await readFile(join(api, "bundle.json"));
  const catalog = json(await readFile(join(api, "catalog.json")));
  verifyIceSheetArtifact(catalog, bytes);
  const validation = json(await readFile(join(directory, "validation.json")));
  if (validation.status !== "PASS-independent-all-public-chart-records" || validation.checked_records !== 520
    || validation.checked_valid_mass_values !== 518 || validation.artifact_sha256 !== sha(bytes)
    || manifest.product_sha256 !== sha(bytes)) throw new Error("Candidate numerical evidence mismatch");
  const review = json(await readFile(join(directory, "source-review.json")));
  if (review.publication_allowed !== false || review.uncertainty.confidence_level !== null
    || review.access.restricted_granules_downloaded !== false) throw new Error("Misrepresented land ice source review");
  return manifest;
}

export async function stageIceSheetCandidate() {
  const catalogBytes = await readFile(join(iceSheetDirectory, "catalog.json"));
  const bundleBytes = verifyIceSheetArtifact(json(catalogBytes), await readFile(join(iceSheetDirectory, "ice_sheets_v1.json")));
  const bundle = json(bundleBytes);
  const validationBytes = await readFile(join(iceSheetDirectory, "validation.json"));
  const validation = json(validationBytes);
  const reviewBytes = await readFile(join(iceSheetDirectory, "source-review.json"));
  const review = json(reviewBytes);
  if (validation.status !== "PASS-independent-all-public-chart-records" || validation.artifact_sha256 !== sha(bundleBytes)
    || validation.validator_sha256 !== sha(await readFile(join(root, "prototype", "scripts", "validate_ice_sheets.py")))
    || bundle.provenance.builder_sha256 !== sha(await readFile(join(root, "prototype", "scripts", "build_ice_sheets.mjs")))
    || review.publication_allowed !== false || review.uncertainty.confidence_level !== null) {
    throw new Error("Stale or misleading land ice scientific evidence");
  }
  const previous = await verifySeaIceReviewCandidate();
  await mkdir(iceSheetCandidate);
  const publicRoot = join(iceSheetCandidate, "weather_global");
  await cp(join(root, "prototype", "dist"), publicRoot, {
    recursive: true, errorOnExist: true, force: false,
    filter: async source => {
      if ((await lstat(source)).isSymbolicLink() || basename(source) !== basename(source).toLowerCase()) {
        throw new Error(`Unsafe build entry ${source}`);
      }
      return true;
    },
  });
  for (const row of previous.files.filter(row => /^weather_global\/(?:europe-api|continents-api|history-comparison-api|sea-ice-api)\//.test(row.file))) {
    const destination = confined(iceSheetCandidate, row.file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(confined(seaIceCandidate, row.file), destination);
  }
  const api = join(publicRoot, "ice-sheets-api", "v1");
  await mkdir(api, { recursive: true });
  await writeFile(join(api, "catalog.json"), catalogBytes);
  await writeFile(join(api, "bundle.json"), bundleBytes);
  await copyFile(join(seaIceCandidate, "weather_global", "sea-ice-api", "v1", ".htaccess"), join(api, ".htaccess"));
  await writeFile(join(iceSheetCandidate, "validation.json"), validationBytes);
  await writeFile(join(iceSheetCandidate, "source-review.json"), reviewBytes);
  await copyFile(join(seaIceCandidate, "source-review.json"), join(iceSheetCandidate, "prior-source-review.json"));
  await copyFile(join(seaIceCandidate, "validation.json"), join(iceSheetCandidate, "sea-ice-validation.json"));
  await copyFile(join(seaIceCandidate, "attribution.txt"), join(iceSheetCandidate, "sea-ice-attribution.txt"));
  await writeFile(join(iceSheetCandidate, "attribution.txt"), review.use_review.citation + "\n\n"
    + "Public chart bounds are preserved. Their confidence level is not stated in chart JSON.\n"
    + "Original scientific PO.DAAC granules were not downloaded. No NASA/JPL endorsement.\n");
  await writeFile(join(iceSheetCandidate, "readme.txt"), `WEATHER GLOBAL - 7D.2 LAND ICE - LOCAL MANUAL REVIEW ONLY

Not a public release. No FTP, CRON, credentials, private configuration, raw
archives or production pointers are included or changed. The api.php backend
still requires its separate configured private storage.
Current frontend plus five API families; earlier four API families unchanged.
Open #ice-sheets?lang=cs or #ice-sheets?lang=en.

Separate producer-integrated Greenland/Antarctic public NASA chart series.
2002-04-16 through 2026-07-17; chart updated 2026-10-23.
259 valid mass values and 1 original mission null record per region.
Gt, source graph zero retained; first published value is zero.
This is not total mass or a 1981-2010 climatology. No project rebasing.
Retain irregular source decimal years, labelled dates and record IDs.
Multiple epochs in a calendar month remain separate, not averaged or moved.
No filled values. Original null and intervals >0.125 decimal year break lines
and uncertainty polygons. This is a display rule only.
NASA lower/upper chart bounds are unaltered. Confidence level and full
re-zeroing covariance are not stated in the chart JSON; no 95% or 1-sigma claim.
Public chart files, not authenticated PO.DAAC scientific granules.
No own spatial integration, hydrological scaling, repeated GIA correction,
annual sums, extrapolation or mass-to-sea-level conversion.

Read source-review.json, validation.json and attribution.txt.
The original raw/source documents stay outside the public candidate.
Full-atlas publication still requires separate scientific, licensing and
visible native interaction review. Prior NASA continental redistribution and
provisional Antarctic land-mask gates are not cleared by this new source.
Check manifest.json and all routes on separately authorised staging.
Never upload the parent source archive directory.
`);
  await writeFile(join(iceSheetCandidate, "manifest.json"), encode({
    schema_version: 1, publication_allowed: false, status: "local-manual-review-7d2-not-a-public-release",
    product_sha256: sha(bundleBytes), files: await inventory(iceSheetCandidate),
  }));
  const result = await verifyIceSheetReviewCandidate();
  console.log(`Verified ${result.files.length} immutable candidate files: ${iceSheetCandidate}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stageIceSheetCandidate();
