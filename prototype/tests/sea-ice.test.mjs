import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateSeaIceBundle, validateSeaIceCatalog, seaIceHistory, seaIceSeason,
} from "../src/sea-ice.js";
import { buildSeaIceProduct } from "../scripts/build_sea_ice.mjs";

test("builder reproduces exact checked-in product and valid catalogue", async () => {
  const { bundle, catalog, bundleBytes } = await buildSeaIceProduct();
  assert.equal(validateSeaIceBundle(bundle), true);
  assert.equal(validateSeaIceCatalog(catalog), true);
  const bytes = await readFile(new URL("../../data_samples/2026-11-06/sea-ice-7d1/sea_ice_v1.json", import.meta.url));
  assert.deepEqual(bundleBytes, bytes);
  assert.equal(bundle.regions.length, 2);
  const northern = bundle.regions[0].points;
  assert.equal(northern.find(point => point.date === "1979-09").extent, 7.05);
  assert.equal(northern.find(point => point.date === "2012-09").extent, 3.57);
  assert.equal(northern.find(point => point.date === "1987-08").extent, 7.63);
  assert.equal(northern.find(point => point.date === "2026-10").extent, 6.69);
  assert.equal(bundle.regions[1].points.find(point => point.date === "2026-09").extent, 17.32);
  assert.equal(bundle.regions[1].points.find(point => point.date === "2024-05").source_dataset,
    "NSIDC-0051,NSIDC-0081");
  for (const region of bundle.regions) {
    assert.equal(region.points.length, 576);
    assert.deepEqual(region.points.filter(point => point.extent === null).map(point => point.date),
      ["1987-12", "1988-01"]);
    assert.deepEqual(region.reference.map(month => month.count),
      [29, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 29]);
  }
});

test("contract rejects fabricated source gaps, rebasing, geometry, units, counts and nonfinite values", async () => {
  const { bundle } = await buildSeaIceProduct();
  for (const mutate of [
    b => { b.unit = "Gt"; },
    b => { b.publication_allowed = true; },
    b => { b.regions[0].id = "europe"; },
    b => { b.regions[0].reference[0].count = 30; },
    b => { b.regions[0].reference[0].mean += 0.1; },
    b => { b.regions[0].points[0].anomaly = Infinity; },
    b => { b.regions[0].points[1].date = b.regions[0].points[0].date; },
    b => { b.regions[0].points[1].date = "1979-00"; },
    b => { b.regions[0].points.find(p => p.date === "1987-12").extent = 0; },
    b => { b.regions[0].points[0].reason = "missing-source"; },
    b => { b.regions[0].points[0].source_dataset = "unknown"; },
    b => { b.regions.pop(); },
    b => { b.source.doi = "wrong"; },
    b => { b.provenance.files[0] = null; },
  ]) {
    const altered = structuredClone(bundle);
    mutate(altered);
    assert.equal(validateSeaIceBundle(altered), false);
  }
});

test("history and seasonal helpers retain partial years and gaps without extending source", async () => {
  const { bundle } = await buildSeaIceProduct();
  const region = bundle.regions[0];
  const january = seaIceHistory(region, 1, 1978, 2026);
  assert.equal(january[0].date, "1979-01");
  assert.equal(january.find(p => p.date === "1988-01").extent, null);
  assert.equal(seaIceSeason(region, 2026).filter(p => p.extent !== null).length, 10);
  assert.equal(seaIceSeason(region, 1978).filter(p => p.extent !== null).length, 2);
  assert.equal(seaIceSeason(region, 2026)[10].reason, "outside-source-period");
  assert.equal(seaIceHistory(region, 9, 2025, 2026).length, 2);
  assert.throws(() => seaIceHistory(region, 0, 1978, 2026), /selection/);
  assert.throws(() => seaIceHistory(region, 1, 2026, 1978), /selection/);
  assert.throws(() => seaIceSeason(region, 2100), /year/);
});
