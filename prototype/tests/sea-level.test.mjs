/* ====================================================
   AR6 SOURCE REGRESSIONS
   Check original confidence-output numbers and reject invented scientific contracts.
   ==================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateSeaLevel, seaLevelPoints, seaLevelSegments } from "../src/sea-level.js";
import { validateClimateSnapshot } from "../src/climate-data.js";

const load = () => JSON.parse(readFileSync(new URL("../backend/private/data/ar6_sealevel.json", import.meta.url), "utf8"));
const expected = {
  ssp126: [[324, 437, 614], [463, 684, 1014]],
  ssp245: [[435, 556, 761], [664, 927, 1332]],
  ssp370: [[548, 678, 898], [893, 1196, 1643]],
  ssp585: [[625, 766, 1018], [984, 1332, 1893]],
};

test("original NetCDF hashes and published q17/q50/q83 values agree in every scenario", () => {
  const data = load();
  assert.equal(validateSeaLevel(data), true);
  assert.equal(data.quantiles.length, 107);
  assert.equal(data.quantiles.find((q) => Math.abs(q - 0.17) < 1e-6), 0.17000000178813934);
  for (const [scenario, values] of Object.entries(expected)) {
    const original = readFileSync(new URL(`../../data_samples/2026-11-04/ar6/${data.scenarios[scenario].source_file}`, import.meta.url));
    assert.equal(createHash("sha256").update(original).digest("hex"), data.scenarios[scenario].source_sha256);
    const points = seaLevelPoints(data, scenario);
    for (const [index, year] of [2100, 2150].entries()) {
      const point = points.find((item) => item.date === String(year));
      assert.deepEqual([point.minimum, point.value, point.maximum], values[index]);
    }
    assert.equal(points.length, 14);
    assert.equal(points.some((point) => point.date === "2126"), false);
    assert.deepEqual(seaLevelSegments(points).map((part) => part.length), [9, 5]);
  }
});

test("negative p-box values remain negative and correctly ordered for chart polygons", () => {
  const data = load();
  for (const series of Object.values(data.scenarios)) {
    for (const point of series.points) point.values = point.values.map((value) => value - 1000);
  }
  assert.equal(validateSeaLevel(data), true);
  const [point] = seaLevelPoints(data, "ssp126");
  assert.deepEqual([point.minimum, point.value, point.maximum], [-957, -950, -939]);
});

test("malformed quantiles, confidence, units, missing steps and interpolated years are rejected", () => {
  const mutations = [
    (data) => { data.unit = "m"; },
    (data) => { data.reference_period = "1850-1900"; },
    (data) => { data.confidence = "low_confidence"; },
    (data) => { data.statistic = "model_minmax"; },
    (data) => { data.quantiles[1] = 0; },
    (data) => { data.scenarios.ssp245.points.pop(); },
    (data) => { data.scenarios.ssp245.points[10].date = "2126"; },
    (data) => { data.scenarios.ssp245.points[0].values[0] = -32768; },
    (data) => { data.scenarios.ssp245.points[0].values[1] = null; },
    (data) => { data.scenarios.ssp245.points[0].values[1] = Infinity; },
    (data) => { data.scenarios.ssp245.points[0].values[1] = 99999; },
    (data) => { data.scenarios.ssp245.source_sha256 = "bad"; },
    (data) => { data.scenarios = {}; },
  ];
  for (const mutate of mutations) {
    const data = load();
    mutate(data);
    assert.equal(validateSeaLevel(data), false);
  }
});

test("legacy climate releases omit 7B safely; present but invalid 7B fails validation", () => {
  const climate = {
    snapshot: "2026-11-04", commit: "a".repeat(40),
    series: { co2: [{}], temperature: [{}], roni: [{}] }, projections: [{}],
  };
  assert.equal(validateClimateSnapshot(climate), true);
  climate.ocean_projections = load();
  assert.equal(validateClimateSnapshot(climate), true);
  climate.ocean_projections = {};
  assert.equal(validateClimateSnapshot(climate), false);
});
