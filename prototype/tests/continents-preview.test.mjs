import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { continentIds, continentModels, continentScenarios, validateContinentsCatalog, validateContinentalBundle } from "../src/continents-preview.js";

const localized = (cs, en) => ({ cs, en });

function annual(first, last, offset = 0) {
  return Array.from({ length: last - first + 1 }, (_unused, index) => {
    const year = first + index;
    return { date: String(year), value: year / 1000 + offset, coverage: 0.95 };
  });
}

function model(sourceId, offset) {
  const series = (rows, first) => rows.map((row, index) => ({
    date: String(first + index),
    value: row.value + offset,
    coverage: row.coverage,
  }));
  const historical = series(annual(1850, 2014), 1850);
  const scenarios = Object.fromEntries(continentScenarios.map((scenario, scenarioIndex) => [
    scenario,
    series(annual(2015, 2100, scenarioIndex / 10), 2015),
  ]));
  return {
    source_id: sourceId,
    member: "r1i1p1f1",
    calendar: "proleptic_gregorian",
    baseline_temperature_K: 287 + offset,
    baseline_days: 10957,
    grid: { weighted_area_m2: 1e12 },
    historical,
    scenarios,
  };
}

function minmax(modelRows) {
  return modelRows[0].map((row, index) => ({
    date: row.date,
    min: Math.min(...modelRows.map((series) => series[index].value)),
    max: Math.max(...modelRows.map((series) => series[index].value)),
    model_count: modelRows.length,
  }));
}

function history(offset = 0) {
  const annualRows = annual(1880, 2026, offset).map((row) => ({
    ...row,
    minimum_monthly_coverage: row.coverage,
    source_months: 12,
    status: "valid",
    missing_reasons: [],
    absent_source_months: [],
    below_coverage_months: [],
  }));
  annualRows[0] = {
    ...annualRows[0],
    value: null,
    minimum_monthly_coverage: 0.7,
    status: "missing",
    missing_reasons: ["insufficient-spatial-coverage"],
    below_coverage_months: [1],
  };
  return {
    status: "available",
    unit: "degC anomaly",
    baseline: [1981, 2010],
    baseline_offset_K: 287.1,
    annual: annualRows,
    monthly_coverage: [{ date: "1880-01", coverage: 0.7 }],
    source: { id: "nasa-gistemp" },
    usage_review: { status: "pending" },
  };
}

function makeBundle() {
  const regions = continentIds.map((id, index) => {
    const models = continentModels.map((sourceId, modelIndex) => model(sourceId, index / 100 + modelIndex / 10));
    const ranges = {
      historical: minmax(models.map((item) => item.historical)),
      scenarios: Object.fromEntries(continentScenarios.map((scenario) => [
        scenario,
        minmax(models.map((item) => item.scenarios[scenario])),
      ])),
    };
    const common = {
      id,
      name: localized(id === "europe" ? "Evropa" : id, id === "europe" ? "Europe" : id),
      status: id === "antarctica" ? "blocked-grounding" : "validated-local",
      publication_allowed: false,
      mask: {
        file: `${id}.geojson`,
        sha256: "a".repeat(64),
        version: "mask-v2",
        area_m2: 1e12,
        grounding_line_verified: id !== "antarctica",
      },
      limitations: { cs: ["Lokální náhled."], en: ["Local preview."] },
    };
    return id === "antarctica"
      ? { ...common, models: [], range: null, history: null }
      : { ...common, models, range: ranges, history: history(index / 100) };
  });
  return {
    schema_version: 1,
    version: "7c7-continental-temperatures-v1",
    publication_allowed: false,
    baseline: [1981, 2010],
    unit: "degC anomaly",
    regions,
    method: { cs: "Metoda", en: "Method" },
    sources: [{ id: "cmip6", name: localized("CMIP6", "CMIP6"), url: "https://example.test/source" }],
    legacy_comparison: { europe: { status: "legacy" } },
    source_review: { status: "reviewed" },
  };
}

function makeCatalog(bundle) {
  const bytes = Buffer.from(JSON.stringify(bundle));
  return {
    schema_version: 1,
    version: "7c7-continental-catalog-v1",
    publication_allowed: false,
    product: {
      endpoint: "continents-api/v1/bundle.json",
      version: "7c7-continental-temperatures-v1",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    },
    regions: bundle.regions.map(({ id, name, status }) => ({ id, name, status })),
    gates: [{ code: "local-only", cs: "Pouze lokálně", en: "Local only" }],
  };
}

test("catalogue and complete bundle enforce identity, order, and unpublished status", () => {
  const bundle = makeBundle();
  const catalog = makeCatalog(bundle);
  assert.equal(validateContinentsCatalog(catalog), true);
  assert.equal(validateContinentalBundle(bundle), true);
  assert.deepEqual(bundle.regions.map((region) => region.id), continentIds);
  assert.equal(catalog.publication_allowed, false);
  assert.equal(bundle.regions.at(-1).range, null);
});

test("bundle rejects invalid coverage, missing NASA gap reasons, and baseline fabrication", () => {
  const invalidModel = structuredClone(makeBundle());
  invalidModel.regions[0].models[0].historical[0].coverage = 0.89;
  assert.equal(validateContinentalBundle(invalidModel), false);

  const missingReason = structuredClone(makeBundle());
  missingReason.regions[0].history.annual[0].missing_reasons = [];
  assert.equal(validateContinentalBundle(missingReason), false);

  const fabricatedBaseline = structuredClone(makeBundle());
  fabricatedBaseline.regions[0].history.baseline_offset_K = null;
  assert.equal(validateContinentalBundle(fabricatedBaseline), false);
});

test("bundle rejects ranges inconsistent with aligned model values", () => {
  const bundle = structuredClone(makeBundle());
  bundle.regions[0].range.historical[0].max += 0.01;
  assert.equal(validateContinentalBundle(bundle), false);
});

test("blocked Antarctic records cannot carry temperature data", () => {
  const bundle = structuredClone(makeBundle());
  bundle.regions[6].models = [model("ACCESS-CM2", 0)];
  assert.equal(validateContinentalBundle(bundle), false);
});

test("history without a baseline keeps every annual result null with explicit reasons", () => {
  const bundle = structuredClone(makeBundle());
  const nasa = bundle.regions[0].history;
  nasa.status = "blocked-incomplete-baseline";
  nasa.baseline_offset_K = null;
  nasa.annual = nasa.annual.map((row) => ({
    ...row,
    value: null,
    status: "missing",
    missing_reasons: ["incomplete-reference"],
  }));
  assert.equal(validateContinentalBundle(bundle), true);
});

test("real generated catalogue and bundle satisfy the live contract without pinning draft hashes", async () => {
  const catalogBytes = await readFile(new URL("../../data_samples/2026-11-06/continents-7c-completion/catalog.json", import.meta.url));
  const bundleBytes = await readFile(new URL("../../data_samples/2026-11-06/continents-7c-completion/continental_temperatures_v1.json", import.meta.url));
  const catalog = JSON.parse(catalogBytes);
  const bundle = JSON.parse(bundleBytes);
  assert.equal(validateContinentsCatalog(catalog), true);
  assert.equal(validateContinentalBundle(bundle), true);
  assert.equal(catalog.product.bytes, bundleBytes.length);
  assert.equal(catalog.product.sha256, createHash("sha256").update(bundleBytes).digest("hex"));

  const byId = new Map(bundle.regions.map((region) => [region.id, region]));
  for (const id of ["africa", "south-america", "oceania"]) {
    const history = byId.get(id).history;
    assert.equal(history.status, "blocked-incomplete-baseline");
    assert.equal(history.baseline_offset_K, null);
    assert.ok(history.annual.every((row) => row.value === null
      && row.status === "missing"
      && row.missing_reasons.includes("incomplete-reference")));
  }
  for (const id of ["europe", "asia", "north-america"]) {
    assert.equal(byId.get(id).history.status, "available");
    assert.ok(byId.get(id).history.annual.some((row) => row.value !== null));
  }
  assert.equal(byId.get("antarctica").history, null);
});
