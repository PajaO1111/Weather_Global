import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  carbonBudgetSource,
  carbonBudgetSources,
  carbonBudgetVersion,
  buildCarbonBudgetBundle,
  validateCarbonBudgetBundle,
  validateCarbonBudgetCatalog,
} from "../src/carbon-budget.js";
import { readXlsxSheets } from "../scripts/xlsx-reader.mjs";

const sourceFile = new URL(
  `../../data_samples/2026-11-06/phase7d-feasibility/sources/icos/${carbonBudgetSource.file}`,
  import.meta.url,
);
const bundleFile = new URL(
  "../../data_samples/2026-11-06/carbon-budget-7d6/bundle.json",
  import.meta.url,
);
const catalogFile = new URL(
  "../../data_samples/2026-11-06/carbon-budget-7d6/catalog.json",
  import.meta.url,
);
const tableNames = [
  "Global Carbon Budget",
  "Historical Budget",
  "Fossil Emissions by Category",
  "Land-Use Change Emissions",
  "Atmospheric Growth",
  "Ocean Sink",
  "Terrestrial Sink",
  "Cement Carbonation Sink",
];
const nationalFossilNames = [
  "Territorial Emissions",
  "Consumption Emissions",
  "Emissions Transfers",
  "Regions",
];
const nationalLandUseNames = ["BLUE", "OSCAR", "LUCE"];

async function loadSource(file) {
  const bytes = await readFile(new URL(
    `../../data_samples/2026-11-06/phase7d-feasibility/sources/icos/${file}`,
    import.meta.url,
  ));
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function buildFromArchivedSources() {
  const [global, nationalFossil, nationalLandUse] = await Promise.all([
    loadSource(carbonBudgetSources.global.file),
    loadSource(carbonBudgetSources.nationalFossil.file),
    loadSource(carbonBudgetSources.nationalLandUse.file),
  ]);
  return buildCarbonBudgetBundle({
    global: readXlsxSheets(global.bytes, tableNames),
    nationalFossil: readXlsxSheets(nationalFossil.bytes, nationalFossilNames),
    nationalLandUse: readXlsxSheets(nationalLandUse.bytes, nationalLandUseNames),
  }, {
    sourceSha256: {
      global: global.sha256,
      nationalFossil: nationalFossil.sha256,
      nationalLandUse: nationalLandUse.sha256,
    },
  });
}

test("GCB v1.0 workbook reader extracts exact tables and keeps blank cells null", async () => {
  const bytes = await readFile(sourceFile);
  assert.equal(bytes.length, 480363);
  const tables = readXlsxSheets(bytes, tableNames);
  assert.equal(tables["Global Carbon Budget"][22][0], 1959);
  assert.equal(tables["Global Carbon Budget"][87][0], 2024);
  assert.equal(tables["Historical Budget"][16][0], 1750);
  assert.equal(tables["Historical Budget"][16][2], null);
  assert.equal(tables["Fossil Emissions by Category"][9][0], 1850);
  assert.equal(tables["Fossil Emissions by Category"][7][0], "GtC/yr");
  assert.equal(tables["Land-Use Change Emissions"][40][0], 1959);
  assert.equal(tables["Land-Use Change Emissions"][40][18], 2.35341);
});

test("GCB views retain different coverage, missing values, units, and source-provided model results", async () => {
  const bytes = await readFile(sourceFile);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha256, carbonBudgetSource.sha256);
  const bundle = await buildFromArchivedSources();
  assert.equal(bundle.version, carbonBudgetVersion);
  assert.equal(bundle.publication_allowed, false);
  assert.deepEqual(
    [bundle.views.annual_budget.first, bundle.views.annual_budget.last, bundle.views.annual_budget.points.length],
    [1959, 2024, 66],
  );
  assert.deepEqual(
    [bundle.views.historical_budget.first, bundle.views.historical_budget.last, bundle.views.historical_budget.points.length],
    [1750, 2024, 275],
  );
  assert.equal(bundle.views.historical_budget.points[0].land_use_gtc, null);
  assert.equal(bundle.views.historical_budget.points[100].year, 1850);
  assert.equal(bundle.views.historical_budget.points[100].land_use_gtc, 0.740726666666667);
  assert.equal(bundle.views.annual_budget.points.at(-1).fossil_gtc, 10.5345464062896);
  assert.equal(bundle.views.historical_budget.points[0].fossil_gtc, 0.00253982996724891);
  assert.equal(bundle.views.fossil_categories.unit, "GtC/yr");
  assert.equal(bundle.views.fossil_categories.points.length, 175);
  assert.equal(bundle.views.fossil_categories.points.at(-1).total_gtc, 10.5345464062896);
  assert.equal(bundle.views.land_use.unit, "GtC/yr");
  assert.equal(bundle.views.land_use.points[0].year, 1850);
  assert.equal(bundle.views.land_use.points[0].gcb_gtc, 0.740726666666667);
  assert.equal(bundle.views.land_use.points.find(point => point.year === 1959).blue_gtc, 2.913);
  assert.equal(validateCarbonBudgetBundle(bundle), true);

  const invalid = structuredClone(bundle);
  invalid.views.annual_budget.points[1].year += 1;
  assert.equal(validateCarbonBudgetBundle(invalid), false);
});

test("GCB catalogue pins the exact checked bundle bytes and forbids public release", async () => {
  const bundleBytes = await readFile(bundleFile);
  const catalog = JSON.parse(await readFile(catalogFile, "utf8"));
  const bundle = JSON.parse(bundleBytes.toString("utf8"));
  assert.equal(validateCarbonBudgetBundle(bundle), true);
  assert.equal(validateCarbonBudgetCatalog(catalog), true);
  assert.equal(catalog.publication_allowed, false);
  assert.equal(catalog.product.bytes, bundleBytes.length);
  assert.equal(
    catalog.product.sha256,
    createHash("sha256").update(bundleBytes).digest("hex"),
  );
});

test("GCB v1.0 adds model-by-model global component estimates with source gaps", async () => {
  const bundle = await buildFromArchivedSources();
  const components = bundle.views.component_estimates;
  assert.deepEqual([components.first, components.last], [1959, 2024]);
  assert.deepEqual(
    components.components.map(component => component.id),
    ["atmospheric-growth", "ocean-sink", "terrestrial-sink", "cement-carbonation"],
  );
  const ocean = components.components.find(component => component.id === "ocean-sink");
  assert.equal(ocean.unit, "GtC/yr");
  assert.equal(ocean.estimates.find(item => item.label === "GCB").values.at(-1), 3.38894731727194);
  assert.equal(ocean.estimates.find(item => item.label === "Multi-model mean").values.at(-1), 2.87909625971098);
  assert.equal(ocean.estimates.find(item => item.label === "Model Spread (sd)").kind, "uncertainty");
  assert.equal(ocean.estimates.find(item => item.label === "ACCESS").values[0], 0.843917443809232);
  assert.equal(validateCarbonBudgetBundle(bundle), true);
});

test("national fossil product keeps country, world, consumption and transfer series separate", async () => {
  const bundle = await buildFromArchivedSources();
  const fossil = bundle.views.national_fossil;
  assert.deepEqual([fossil.territorial.first, fossil.territorial.last], [1850, 2024]);
  assert.equal(fossil.territorial.unit, "MtC/yr");
  assert.equal(fossil.territorial.series.find(item => item.id === "china").label, "China");
  assert.equal(fossil.territorial.series.find(item => item.id === "china").values.at(-1), 3353.9947474704);
  assert.equal(fossil.territorial.series.find(item => item.id === "world").values.at(-1), 10534.5464062896);
  assert.deepEqual([fossil.consumption.first, fossil.consumption.last], [1990, 2020]);
  assert.equal(fossil.consumption.series.find(item => item.id === "world").values.at(-1), 9595.58674360229);
  assert.equal(fossil.transfers.series.find(item => item.id === "world").values.at(-1), 0);
  assert.equal(fossil.consumption.series.find(item => item.id === "afghanistan").values[0], null);
  assert.equal(validateCarbonBudgetBundle(bundle), true);
});

test("national land-use product keeps BLUE, OSCAR and LUCE country estimates independent", async () => {
  const bundle = await buildFromArchivedSources();
  const landUse = bundle.views.national_land_use;
  assert.deepEqual([landUse.first, landUse.last], [1850, 2024]);
  assert.equal(landUse.unit, "TgC/yr");
  assert.deepEqual(landUse.models.map(model => model.id), ["blue", "oscar", "luce"]);
  const blue = landUse.models.find(model => model.id === "blue");
  const luce = landUse.models.find(model => model.id === "luce");
  assert.equal(blue.series.find(item => item.id === "china").values.at(-1), -87.17728);
  assert.equal(luce.series.find(item => item.id === "global").values.at(-1), 1193.28905);
  assert.equal(luce.series.find(item => item.id === "china").values.at(-1), -9.34549);
  assert.equal(validateCarbonBudgetBundle(bundle), true);
});
