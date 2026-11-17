import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { publicReleaseVersion } from "../src/public-release.js";
import { validateContinentsCatalog } from "../src/continents-preview.js";
import { verifyContinentsArtifact } from "./continents-api.mjs";
import { verifyHistoryComparisonArtifact } from "./history-comparison-api.mjs";
import { verifySeaIceArtifact } from "./sea-ice-api.mjs";
import { verifyIceSheetArtifact } from "./ice-sheets-api.mjs";
import { verifySnowArtifact } from "./snow-cover-api.mjs";
import { verifyPrecipitationArtifact } from "./precipitation-api.mjs";
import { verifyDroughtArtifact } from "./drought-api.mjs";
import { verifyCarbonBudgetArtifact } from "./carbon-budget-api.mjs";
import { verifyAtmosphericGasesArtifact } from "./atmospheric-gases-api.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const scripts = fileURLToPath(new URL("./", import.meta.url));
export const hostingProducts = [
  ["continents-api", "continents-7c-completion", "continental_temperatures_v1.json", verifyContinentsArtifact,
    "PASS-six-continental-products-Antarctic-temperatures-blocked", "validate_continental_temperatures.py"],
  ["history-comparison-api", "continents-history-7c8", "history_comparison_v1.json", verifyHistoryComparisonArtifact,
    "PASS-two-local-views-with-explicit-estimates-and-scientific-limits", "validate_history_comparison.py"],
  ["sea-ice-api", "sea-ice-7d1", "sea_ice_v1.json", verifySeaIceArtifact,
    "PASS-independent-all-raw-months-and-references", "validate_sea_ice.py"],
  ["ice-sheets-api", "ice-sheets-7d2", "ice_sheets_v1.json", verifyIceSheetArtifact,
    "PASS-independent-all-public-chart-records", "validate_ice_sheets.py"],
  ["snow-cover-api", "snow-cover-7d3", "snow_cover_v1.json", verifySnowArtifact,
    "PASS-independent-all-producer-months", "validate_snow_cover.py"],
  ["precipitation-api", "precipitation-7d4", "precipitation_v1.json", verifyPrecipitationArtifact,
    "PASS-independent-raw-netcdf-and-geodesic-samples", "validate_precipitation.py"],
  ["drought-api", "drought-7d5", "drought_v1.json", verifyDroughtArtifact,
    "PASS-independent-raw-spei-histograms-and-geodesic-samples", "validate_drought.py"],
  ["carbon-budget-api", "carbon-budget-7d6", "bundle.json", verifyCarbonBudgetArtifact],
  ["atmospheric-gases-api", "atmospheric-gases-7d7", "bundle.json", verifyAtmosphericGasesArtifact],
].map(([api, directory, file, verify, status, validator]) => ({ api, directory, file, verify, status, validator }));

export const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const json = bytes => JSON.parse(bytes.toString("utf8"));

async function checkPin(path, expected) {
  if (typeof expected !== "string" || hash(await readFile(path)) !== expected) {
    throw new Error(`Hosting release dependency changed: ${path}`);
  }
}

export async function prepareHostingProduct(definition) {
  const directory = join(root, "data_samples", "2026-11-06", definition.directory);
  const catalogBytes = await readFile(join(directory, "catalog.json"));
  const catalog = json(catalogBytes);
  const sourceBytes = await readFile(join(directory, definition.file));
  const source = json(sourceBytes);
  if (catalog.publication_allowed !== false || source.publication_allowed !== false
    || (definition.api === "continents-api" && !validateContinentsCatalog(catalog))) {
    throw new Error(`Unexpected archived publication state: ${definition.api}`);
  }
  definition.verify(catalog, sourceBytes);
  if (definition.status) {
    const validation = json(await readFile(join(directory, "validation.json")));
    if (validation.status !== definition.status || validation.artifact_sha256 !== hash(sourceBytes)) {
      throw new Error(`Unverified numerical evidence: ${definition.api}`);
    }
    await checkPin(join(scripts, definition.validator), validation.validator_sha256);
  }
  const provenance = source.provenance;
  if (provenance?.implementation_sha256 && typeof provenance.implementation_sha256 === "object") {
    for (const [file, pin] of Object.entries(provenance.implementation_sha256)) {
      if (!/^[a-z0-9_]+\.py$/.test(file)) throw new Error(`Unsafe implementation name: ${file}`);
      await checkPin(join(scripts, file), pin);
    }
  } else if (definition.api === "history-comparison-api") {
    await checkPin(join(scripts, "build_history_comparison.py"), provenance.implementation_sha256);
    await checkPin(join(directory, "sbbx_weights.npz"), provenance.weights_sha256);
  }
  const builder = {
    "sea-ice-api": "build_sea_ice.mjs", "ice-sheets-api": "build_ice_sheets.mjs",
    "snow-cover-api": "build_snow_cover.mjs", "precipitation-api": "build_precipitation.py",
    "drought-api": "build_drought.py",
  }[definition.api];
  if (builder) await checkPin(join(scripts, builder), provenance.builder_sha256);
  if (["precipitation-api", "drought-api"].includes(definition.api)) {
    await checkPin(join(directory, "weights.npz"), provenance.weights_sha256);
    await checkPin(join(directory, "weights.json"), provenance.weights_metadata_sha256);
    await checkPin(join(directory, "source-manifest.json"), provenance.manifest_sha256);
  }
  if (source.source_review) {
    await checkPin(join(directory, "source-review", "source-review.json"), source.source_review.sha256);
  }
  const bundle = {
    ...source, publication_allowed: true,
    public_release: { version: publicReleaseVersion, source_sha256: hash(sourceBytes) },
  };
  if (definition.api === "continents-api") {
    bundle.regions = source.regions.map(region => ({
      ...region, publication_allowed: region.status !== "blocked-grounding",
    }));
  }
  const bundleBytes = encode(bundle);
  const publicCatalog = {
    ...catalog, publication_allowed: true,
    public_release: { version: publicReleaseVersion, source_sha256: hash(catalogBytes) },
    product: { ...catalog.product, bytes: bundleBytes.length, sha256: hash(bundleBytes) },
  };
  if (definition.api === "continents-api") {
    publicCatalog.gates = catalog.gates.filter(gate => gate.code !== "public-release-review")
      .map(gate => gate.code === "nasa-redistribution-review" ? {
        ...gate,
        cs: "Odvozené hodnoty NASA jsou použity fakticky a vzdělávacím způsobem s citací podle NASA Data Use Guidance; netvrdíme licenci CC0 pro tento konkrétní GISTEMP produkt ani záštitu NASA.",
        en: "NASA-derived values are used factually for education with citation under NASA Data Use Guidance; no CC0 licence for this specific GISTEMP product or NASA endorsement is asserted.",
      } : gate);
  }
  definition.verify(publicCatalog, bundleBytes);
  if (definition.api === "continents-api" && !validateContinentsCatalog(publicCatalog)) {
    throw new Error("Public continental catalogue failed validation");
  }
  return { catalogBytes: encode(publicCatalog), bundleBytes, source };
}

export async function packageHostingProducts(destination) {
  const prepared = await Promise.all(hostingProducts.map(async definition => ({
    definition, product: await prepareHostingProduct(definition),
  })));
  const attribution = [
    "WEATHER GLOBAL 1.0 - DATA SOURCES AND LICENCES",
    "Public packaging approved by the project operator on 2026-11-07.",
    "Archived source products are unchanged. Public copies add release metadata only.",
    "Each database is separate; no blanket licence is asserted for the entire atlas.",
    "NASA factual educational use: https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance",
    "GISTEMP Team (2026); Lenssen et al. (2024), https://doi.org/10.1029/2023JD040179 .",
    "NASA-derived continental aggregation/referencing and limited estimates are project processing, not official NASA regional products.",
    "No NASA/NOAA/NSIDC/GPCC/CSIC/WCRP endorsement. No provider logos or raw scientific archives included.",
    "CMIP6 continental adaptations: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/ .",
    "Natural Earth geometry: public domain. Antarctic grounding limitations and missing data are retained.",
    "SPEI adapted drought database: ODbL 1.0; contents DbCL 1.0.",
    "https://opendatacommons.org/licenses/odbl/1-0/ ; https://opendatacommons.org/licenses/dbcl/1-0/ .",
    "Complete adapted drought database: drought-api/v1/bundle.json, available without technological restrictions.",
    "Drought modifications: fractional WGS84 weights, categories, area shares, coverage and complete-year means. Original SPEI not recalculated or filled.",
    "GPCC adaptations: CC BY 4.0. GCB 2025 adaptations: CC BY 4.0. NOAA/Rutgers and NSIDC citations follow below.",
    "European legacy pilots are excluded: invalid geography or unresolved annual-aggregation methods.",
  ];
  for (const { definition, product } of prepared) {
    const target = join(destination, definition.api, "v1");
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "catalog.json"), product.catalogBytes);
    await writeFile(join(target, "bundle.json"), product.bundleBytes);
    await writeFile(join(target, ".htaccess"), `Options -Indexes
<IfModule mod_headers.c>
Header set Cache-Control "no-store"
Header set X-Content-Type-Options "nosniff"
</IfModule>
`);
    attribution.push(`\n${definition.api}`, JSON.stringify(product.source.sources ?? product.source.source ?? {}, null, 2));
    if (definition.api === "ice-sheets-api") {
      const review = json(await readFile(join(root, "data_samples", "2026-11-06", definition.directory, "source-review.json")));
      attribution.push(review.use_review.citation);
    }
  }
  await writeFile(join(destination, "attribution.txt"), `${attribution.join("\n")}\n`);
  const files = [];
  async function inventory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name !== entry.name.toLowerCase()) {
        throw new Error(`Unsafe public release entry: ${entry.name}`);
      }
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await inventory(path);
      else if (entry.name !== "release-manifest.json") {
        const bytes = await readFile(path);
        files.push({ file: relative(destination, path).split(sep).join("/"), bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }
  await inventory(destination);
  await writeFile(join(destination, "release-manifest.json"), encode({
    version: publicReleaseVersion, publication_allowed: true,
    approval_date: "2026-11-07",
    apis: hostingProducts.map(product => `${product.api}/v1/`),
    files: files.sort((a, b) => a.file.localeCompare(b.file)),
  }));
}
