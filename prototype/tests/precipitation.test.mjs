import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validatePrecipitationBundle, validatePrecipitationCatalog, precipitationHistory, precipitationSeason } from "../src/precipitation.js";
const load = async name => JSON.parse(await readFile(new URL(`../../data_samples/2026-11-06/precipitation-7d4/${name}`, import.meta.url)));

test("GPCC product has pinned full history, fixed-support annual sums, complete references and missing Antarctic domain", async () => {
  const bundle = await load("precipitation_v1.json");
  assert.ok(validatePrecipitationCatalog(await load("catalog.json")));
  assert.ok(validatePrecipitationBundle(bundle));
  for (const region of bundle.regions.slice(0, 6)) {
    assert.equal(region.monthly.filter(p => p.value !== null).length, 1628);
    assert.equal(region.annual.filter(p => p.value !== null).length, 135);
    assert.equal(region.annual.at(-1).months, 8);
    assert.equal(region.annual.at(-1).reason, "incomplete-source-year");
    assert.ok(region.reference.every(p => p.count === 30));
    const actual = region.annual[0].value;
    assert.ok(Math.abs(actual - region.monthly.slice(0, 12).reduce((sum, p) => sum + p.value, 0)) < .000003);
    assert.ok(actual > region.monthly[0].value);
  }
  assert.ok(bundle.regions[6].monthly.every(p => p.value === null && p.reason === "no-source-domain"));
  const validation = await load("validation.json");
  assert.equal(validation.checked_month_records, 11396);
  assert.equal(validation.independent_geometry_cells, 42);
});

test("GPCC contract rejects altered science even if JSON parses", async () => {
  const bundle = await load("precipitation_v1.json");
  for (const mutate of [
    b => { b.source.variable = "precip_infill"; },
    b => { b.source.confidence_level = .95; },
    b => { b.regions[0].annual[0].value /= 12; },
    b => { b.regions[0].reference[0].mean += 1; },
    b => { b.regions[6].monthly[0].value = 0; },
    b => { b.regions[0].monthly[0].station_fraction = 2; },
    b => { b.regions[0].monthly[0].date = "1890-12"; },
    b => { b.regions[0].supported_area_km2 /= 2; },
  ]) {
    const altered = structuredClone(bundle); mutate(altered);
    assert.equal(validatePrecipitationBundle(altered), false);
  }
});

test("GPCC selections retain incomplete-year and outside-source gaps", async () => {
  const region = (await load("precipitation_v1.json")).regions[0];
  assert.equal(precipitationHistory(region, "annual", 2026, 2026)[0].value, null);
  assert.equal(precipitationHistory(region, "9", 2026, 2026).length, 0);
  assert.equal(precipitationSeason(region, 2026)[8].reason, "outside-source-period");
  assert.throws(() => precipitationHistory(region, "13", 1981, 2010));
  assert.throws(() => precipitationHistory(region, "annual", 2026, 1891));
  assert.throws(() => precipitationSeason(region, 2027));
});
