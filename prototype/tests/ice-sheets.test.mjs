import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildIceSheetProduct, iceSheetDirectory, parseIceSheetChart } from "../scripts/build_ice_sheets.mjs";
import { validateIceSheetBundle, validateIceSheetCatalog, selectIceSheetPeriod, iceSheetGaps, iceSheetSegments } from "../src/ice-sheets.js";

test("land ice product is deterministic and preserves both published regional series and bounds", async () => {
  const { bundle, catalog, bundleBytes } = await buildIceSheetProduct();
  assert.equal(validateIceSheetBundle(bundle), true);
  assert.equal(validateIceSheetCatalog(catalog), true);
  assert.deepEqual(await readFile(join(iceSheetDirectory, "ice_sheets_v1.json")), bundleBytes);
  assert.equal(bundle.regions.length, 2);
  for (const region of bundle.regions) {
    assert.equal(region.points.length, 260);
    assert.equal(region.points.filter(p => p.value !== null).length, 259);
    assert.equal(region.points[0].value, 0);
    assert.equal(region.points[0].source_time, 2002.29);
    assert.equal(region.points[0].date, "2002-04-16");
    const gap = region.points.filter(point => point.date >= "2017-07" && point.date <= "2018-05");
    assert.equal(gap.length, 1);
    assert.ok(gap.every(point => point.value === null && point.reason === "between-missions"));
    assert.ok(region.points.filter(point => point.value === null)
      .every(point => point.lower === null && point.upper === null));
    assert.equal(region.points.filter(point => point.date.startsWith("2011-10")).length, 2);
    assert.equal(iceSheetGaps(region.points).length, 19);
    assert.equal(iceSheetSegments(region.points).flat().length, 259);
    for (const segment of iceSheetSegments(region.points)) {
      assert.ok(segment.every((point, index) => !index || point.source_time - segment[index - 1].source_time <= 0.125));
    }
  }
  assert.equal(bundle.regions[0].points.at(-1).value, -5776.89);
  assert.equal(bundle.regions[1].points.at(-1).value, -2676.92);
});

test("land ice parser rejects altered units, dates, source identities and invalid bounds", async () => {
  const original = JSON.parse(await readFile(join(iceSheetDirectory, "sources", "greenland.json")));
  for (const mutate of [
    b => { b.chart.category = "SeaLevel"; },
    b => { b.chart.source_url = "https://example.com"; },
    b => { b.items[0].units = "mm"; },
    b => { b.items[0].y_margin_min = 1; },
    b => { b.items[0].month = 13; },
    b => { b.items[0].day = 31; b.items[0].month = 2; },
    b => { b.items[0].y = Infinity; },
    b => { b.items[0].x = "2002.29"; },
    b => { b.items[0].status = 0; },
    b => { b.items[0].y_margin_max = null; },
    b => { b.items[1].id = b.items[0].id; },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(() => parseIceSheetChart(changed, "greenland"), /chart|source|record|bounds|date|duplicate|time/i);
  }
});

test("land ice contract rejects fake baselines, probability, filling, wrong chronology and geography", async () => {
  const { bundle } = await buildIceSheetProduct();
  for (const mutate of [
    b => { b.unit = "million km2"; },
    b => { b.publication_allowed = true; },
    b => { b.reference.id = "1981-2010"; },
    b => { b.uncertainty.confidence_level = 0.95; },
    b => { b.regions[1].id = "south-america"; },
    b => { b.regions[0].points[0].lower = 1; },
    b => { b.regions[0].points[0].source_time = null; },
    b => { b.regions[0].points[0].mission = "GRACE-FO"; },
    b => { b.regions[0].points[1].date = "2002-13"; },
    b => { b.regions[0].points[0].value = 1; },
    b => { b.regions[0].points.find(p => p.date === "2017-12-11").value = 0; },
    b => { b.regions[0].points.find(p => p.date === "2017-12-11").reason = null; },
    b => { b.regions[0].source.doi = "wrong"; },
    b => { b.provenance.files[0] = null; },
    b => { b.regions.pop(); },
  ]) {
    const changed = structuredClone(bundle);
    mutate(changed);
    assert.equal(validateIceSheetBundle(changed), false);
  }
  assert.equal(validateIceSheetBundle(null), false);
});

test("period selection retains gaps and never creates values outside the published record", async () => {
  const { bundle } = await buildIceSheetProduct();
  const region = bundle.regions[0];
  assert.equal(selectIceSheetPeriod(region, "2017-07", "2018-05").length, 1);
  assert.ok(selectIceSheetPeriod(region, "2017-07", "2018-05").every(point => point.value === null));
  assert.throws(() => selectIceSheetPeriod(region, "2018-05", "2017-07"), /period/);
  assert.throws(() => selectIceSheetPeriod(region, "2002-01", "2026-07"), /period/);
  assert.throws(() => selectIceSheetPeriod(region, "2002-04", "2026-13"), /period/);
  assert.equal(selectIceSheetPeriod(region, "2002-06", "2002-07").length, 0);
});
