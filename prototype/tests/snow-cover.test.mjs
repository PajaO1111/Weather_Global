import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildSnowCover, parseSnowMonthly, snowDirectory } from "../scripts/build_snow_cover.mjs";
import { validateSnowBundle, validateSnowCatalog, snowHistory, snowSeason } from "../src/snow-cover.js";

test("snow product preserves four original regional records, gaps, references and complete spring means", async () => {
  const { bundle, catalog } = await buildSnowCover();
  assert.ok(validateSnowBundle(bundle));
  assert.ok(validateSnowCatalog(catalog));
  for (const region of bundle.regions) {
    assert.equal(region.points.length, 720);
    assert.equal(region.points.filter(p => p.extent !== null).length, 711);
    assert.equal(region.points.filter(p => p.reason === "missing-source").length, 9);
    assert.equal(region.reference.length, 13);
    assert.ok(region.reference.every(row => row.count === 30));
    assert.equal(region.spring.length, 61);
    assert.equal(region.spring[0].extent, null);
    assert.equal(region.spring.at(-1).year, 2026);
  }
  const nh = bundle.regions[0];
  assert.equal(nh.points[0].extent, 34943905);
  assert.equal(nh.points.at(-1).extent, 18321513);
  const months = nh.points.filter(p => p.date >= "2026-03" && p.date <= "2026-05");
  assert.ok(Math.abs(nh.spring.at(-1).extent - (months[0].extent * 31 + months[1].extent * 30 + months[2].extent * 31) / 92) < 0.000002);
  const bytes = await readFile(join(snowDirectory, "snow_cover_v1.json"));
  assert.equal(bytes.toString(), JSON.stringify(bundle) + "\n");
});

test("snow parsing and scientific contract reject malformed or misleading products", async () => {
  for (const value of ["<html>2000 01 4</html>", "2000 13 3", "2000 01 -1",
    "2000 01 5\n2000 01 6", "2000 02 4\n2000 01 3", "2000 01 1.5"]) {
    assert.throws(() => parseSnowMonthly(value));
  }
  const { bundle } = await buildSnowCover();
  for (const mutate of [
    b => { b.regions[0].points[20].extent = 0; },
    b => { b.regions[0].reference[0].mean += 1; },
    b => { b.regions[0].spring.at(-1).extent += 1; },
    b => { b.source.confidence_level = 0.95; },
    b => { b.regions[2].id = "europe"; },
    b => { b.regions[0].points[0].date = "1966-10"; },
  ]) {
    const changed = structuredClone(bundle); mutate(changed);
    assert.equal(validateSnowBundle(changed), false);
  }
});

test("snow selections preserve missing/outside months and reject invalid ranges", async () => {
  const { bundle } = await buildSnowCover();
  const region = bundle.regions[0];
  assert.equal(snowHistory(region, "7", 1968, 1968)[0].extent, null);
  assert.equal(snowHistory(region, "MAM", 1966, 1966)[0].extent, null);
  assert.equal(snowSeason(region, 2026).at(-1).reason, "outside-source-period");
  assert.equal(snowSeason(region, 1966)[0].reason, "outside-source-period");
  assert.throws(() => snowHistory(region, "13", 2000, 2026));
  assert.throws(() => snowHistory(region, "MAM", 2026, 2000));
  assert.throws(() => snowSeason(region, 2027));
});
