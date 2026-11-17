import { copyFile, cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./audit_7d_sources.mjs";
import { snowDirectory } from "./build_snow_cover.mjs";
import { verifySnowArtifact } from "./snow-cover-api.mjs";
import { iceSheetCandidate, verifyIceSheetReviewCandidate } from "./package_ice_sheets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const encode = value => JSON.stringify(value, null, 2) + "\n";
const json = bytes => JSON.parse(bytes.toString("utf8"));
const families = ["europe-api", "continents-api", "history-comparison-api", "sea-ice-api", "ice-sheets-api", "snow-cover-api"];
export const snowCandidate = join(snowDirectory, "manual-review-candidate");

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
      rows.push({ file: relative(base, path).split(sep).join("/"), bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}
export async function verifySnowCandidate(directory = snowCandidate) {
  const manifest = json(await readFile(join(directory, "manifest.json")));
  if (manifest.publication_allowed !== false || manifest.status !== "local-manual-review-7d3-not-a-public-release"
    || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Invalid snow candidate manifest");
  for (const row of manifest.files) {
    const bytes = await readFile(confined(directory, row.file));
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw new Error(`Candidate changed: ${row.file}`);
  }
  const actual = (await inventory(directory)).filter(row => row.file !== "manifest.json");
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error("Candidate inventory mismatch");
  for (const family of families) {
    if (!manifest.files.some(row => row.file === `weather_global/${family}/v1/catalog.json`)) throw new Error(`Missing API ${family}`);
  }
  const api = join(directory, "weather_global", "snow-cover-api", "v1");
  const bytes = await readFile(join(api, "bundle.json"));
  verifySnowArtifact(json(await readFile(join(api, "catalog.json"))), bytes);
  const validation = json(await readFile(join(directory, "validation.json")));
  if (validation.status !== "PASS-independent-all-producer-months" || validation.checked_original_values !== 2844
    || validation.checked_month_records !== 2880 || validation.checked_spring_records !== 244
    || validation.checked_reference_means !== 52 || validation.artifact_sha256 !== sha256(bytes)
    || manifest.product_sha256 !== sha256(bytes)) throw new Error("Snow numerical evidence mismatch");
  const review = json(await readFile(join(directory, "source-review.json")));
  if (review.publication_allowed !== false || review.uncertainty.provided !== false
    || review.uncertainty.confidence_level !== null) throw new Error("Misrepresented snow source review");
  return manifest;
}

export async function stageSnowCandidate() {
  const catalogBytes = await readFile(join(snowDirectory, "catalog.json"));
  const bytes = verifySnowArtifact(json(catalogBytes), await readFile(join(snowDirectory, "snow_cover_v1.json")));
  const bundle = json(bytes);
  const validationBytes = await readFile(join(snowDirectory, "validation.json"));
  const validation = json(validationBytes);
  const reviewBytes = await readFile(join(snowDirectory, "source-review.json"));
  const review = json(reviewBytes);
  if (validation.artifact_sha256 !== sha256(bytes)
    || validation.validator_sha256 !== sha256(await readFile(join(root, "prototype", "scripts", "validate_snow_cover.py")))
    || bundle.provenance.builder_sha256 !== sha256(await readFile(join(root, "prototype", "scripts", "build_snow_cover.mjs")))
    || review.publication_allowed !== false || review.uncertainty.provided !== false) throw new Error("Stale snow evidence");
  const previous = await verifyIceSheetReviewCandidate();
  await mkdir(snowCandidate);
  const publicRoot = join(snowCandidate, "weather_global");
  await cp(join(root, "prototype", "dist"), publicRoot, {
    recursive: true, errorOnExist: true, force: false,
    filter: async source => {
      if ((await lstat(source)).isSymbolicLink() || basename(source) !== basename(source).toLowerCase()) throw new Error(`Unsafe build entry ${source}`);
      return true;
    },
  });
  for (const row of previous.files) {
    let destination;
    if (/^weather_global\/(?:europe-api|continents-api|history-comparison-api|sea-ice-api|ice-sheets-api)\//.test(row.file)) {
      destination = confined(snowCandidate, row.file);
    } else if (!row.file.includes("/") && row.file !== "readme.txt") {
      destination = confined(snowCandidate, `prior-evidence/${row.file}`);
    } else continue;
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(confined(iceSheetCandidate, row.file), destination);
  }
  const api = join(publicRoot, "snow-cover-api", "v1");
  await mkdir(api, { recursive: true });
  await writeFile(join(api, "catalog.json"), catalogBytes);
  await writeFile(join(api, "bundle.json"), bytes);
  await copyFile(join(iceSheetCandidate, "weather_global", "ice-sheets-api", "v1", ".htaccess"), join(api, ".htaccess"));
  await writeFile(join(snowCandidate, "validation.json"), validationBytes);
  await writeFile(join(snowCandidate, "source-review.json"), reviewBytes);
  await writeFile(join(snowCandidate, "attribution.txt"), review.use_review.citation + "\n\n"
    + "Snow extent is not depth, water equivalent, glacier mass or a daily melt date.\n"
    + "MAM and references are project calculations; no source gaps filled or measurement confidence interval supplied.\n"
    + "No NOAA/Rutgers endorsement. Earlier product attribution and review are preserved in prior-evidence/.\n");
  await writeFile(join(snowCandidate, "readme.txt"), `WEATHER GLOBAL - 7D.3 SNOW COVER - LOCAL MANUAL REVIEW ONLY

Not a public release. No FTP, CRON, credentials, private configuration, raw
archives or production pointers are included or changed. The api.php backend
still requires its separate configured private storage.
Current frontend plus six API families; earlier five API families unchanged.
Open #snow-cover?lang=cs or #snow-cover?lang=en.

Official Rutgers/NOAA monthly regional aggregates, NH SCE CDR v01r01.
November 1966 through October 2026; 711 source values and 9 missing months
per domain. Four domains: NH, Eurasia, North America including Greenland,
North America excluding Greenland. The latter is an alternative, not additive.
Source integer km2 retained; charts display million km2.
Source monthly weighting retained, no own grid masks/rethresholding.
Project 1981-2010 monthly references: 30 values each.
MAM complete-month mean weights 31/30/31 days; not area sums or melt rate.
Source gaps and partial years retained. No Southern Hemisphere series,
snow depth/water equivalent, glacier mass or sea-level conversion.
No numerical measurement uncertainty supplied; no invented confidence band.
Read source-review.json, validation.json, attribution.txt and prior-evidence/.
All earlier scientific/licensing/native visible interaction release gates
remain. Never upload the parent source archive directory.
`);
  await writeFile(join(snowCandidate, "manifest.json"), encode({
    schema_version: 1, publication_allowed: false, status: "local-manual-review-7d3-not-a-public-release",
    product_sha256: sha256(bytes), files: await inventory(snowCandidate),
  }));
  const result = await verifySnowCandidate();
  console.log(`Verified ${result.files.length} immutable snow candidate files: ${snowCandidate}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stageSnowCandidate();
