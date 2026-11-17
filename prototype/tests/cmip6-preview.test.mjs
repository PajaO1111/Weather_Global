import test from "node:test";
import assert from "node:assert/strict";
import { validateCmip6Preview, pairRows, pairExperiments } from "../src/cmip6-preview.js";

function fixture() {
  const points = (id, offset) => Array.from({ length: id === "historical" ? 165 : 86 },
    (_, i) => ({ date: String((id === "historical" ? 1850 : 2015) + i), value: i / 100 + offset, coverage: 1 }));
  const data = {
    schema_version: 1, version: "7c3c-europe-pair-anomalies-v1",
    status: "local-technical-two-model-comparison-not-public-release",
    unit: "degC anomaly", license: "CC-BY-SA-4.0", baseline: [1981, 2010],
    model_count: 2, manifest_sha256: "a".repeat(64), validation_sha256: "b".repeat(64),
    mask: { version: "europe-kuma-manych-cyprus-v1", sha256: "c".repeat(64) },
    attribution: "CMIP6", models: ["ACCESS-CM2", "CanESM5"].map((source_id, i) => ({
      source_id, member: "r1i1p1f1", grid_label: "gn",
      calendar: i ? "365_day" : "proleptic_gregorian",
      baseline_temperature_K: 278, baseline_days: i ? 10950 : 10957,
      grid: { relative_signed_coast_area_difference: 0.01 },
      historical: points("historical", i), scenarios: Object.fromEntries(
        pairExperiments.slice(1).map((id) => [id, points(id, i)])),
      license_statement: "CC BY-SA 4.0",
      sources: Array.from({ length: 7 }, (_, j) => ({ file: `${j}.nc`, sha256: "d".repeat(64) })),
    })),
    range: { scenarios: {} },
  };
  for (const id of pairExperiments) {
    const range = pairRows(data, id).map((row) => ({
      date: row.date, min: row.minimum, max: row.maximum, model_count: 2,
    }));
    if (id === "historical") data.range.historical = range;
    else data.range.scenarios[id] = range;
  }
  return data;
}

test("CMIP6 comparison validates two complete models and five exact min/max series", () => {
  const data = fixture();
  assert.equal(validateCmip6Preview(data), true);
  assert.equal(pairRows(data, "ssp126").length, 86);
  assert.equal(pairRows(data, "historical").length, 165);
  assert.throws(() => pairRows(data, "rcp_4_5"));
});

test("CMIP6 comparison rejects changing model count, corrupted ranges and wrong scientific identity", () => {
  for (const mutate of [
    (data) => { data.models.pop(); },
    (data) => { data.models[1].historical.pop(); },
    (data) => { data.models[0].historical[0].value = null; },
    (data) => { data.range.scenarios.ssp245[0].max = 7; },
    (data) => { data.range.historical[0].model_count = 1; },
    (data) => { data.models[1].calendar = "standard"; },
    (data) => { data.baseline = [1991, 2020]; },
    (data) => { data.license = "CC-BY-4.0"; },
    (data) => { data.models[0].sources[0].sha256 = ""; },
    (data) => { data.models[0].historical[0].coverage = 0.89; },
  ]) {
    const data = fixture();
    mutate(data);
    assert.equal(validateCmip6Preview(data), false);
  }
});
