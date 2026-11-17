/* ====================================================
   OCEAN PERIOD REGRESSIONS
   Official NOAA missions have different end years and must not share bounds.
   ==================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { oceanBounds, oceanShortcut, validOceanPeriod } from "../src/ocean-period.js";

const rows = readFileSync(new URL("../../data_samples/2026-11-04/noaa_gmsl_global_keep_reference.csv", import.meta.url), "utf8")
  .split(/\r?\n/).filter((line) => line && !line.startsWith("#")).slice(1).map((line) => line.split(","));
const missions = ["topex-poseidon", "jason-1", "jason-2", "jason-3", "sentinel-6mf"];
const expected = [[1992, 2005, 438, 337], [2002, 2013, 412, 340], [2008, 2017, 324, 324], [2016, 2025, 329, 329], [2020, 2025, 154, 154]];

for (const [index, mission] of missions.entries()) {
  test(`${mission}: full/10/50-year windows use actual selected-mission coverage`, () => {
    const points = rows.filter((row) => row[index + 1]?.trim()).map((row) => ({
      source_time: Number(row[0]), year: Math.floor(Number(row[0])), value: Number(row[index + 1]),
    }));
    const [first, last, count, decadeCount] = expected[index];
    const bounds = oceanBounds(points);
    assert.deepEqual(bounds, { first, last });
    assert.equal(points.length, count);
    assert.deepEqual(oceanShortcut(bounds, "all"), bounds);
    assert.deepEqual(oceanShortcut(bounds, "50"), bounds);
    const decade = oceanShortcut(bounds, "10");
    assert.equal(decade.first, Math.max(first, last - 9));
    assert.equal(points.filter((point) => point.year >= decade.first && point.year <= decade.last).length, decadeCount);
    assert.equal(validOceanPeriod(bounds, decade.first, decade.last), true);
    assert.equal(validOceanPeriod(bounds, "", last), false);
    assert.equal(validOceanPeriod(bounds, first, last + 1), false);
    // Filtering never aggregates or rewrites scientific timestamps.
    assert.equal(points[0].source_time, Number(rows.find((row) => row[index + 1]?.trim())[0]));
  });
}

test("inclusive decade counts, invalid and empty states are explicit", () => {
  const bounds = { first: 1900, last: 2025 };
  assert.deepEqual(oceanShortcut(bounds, 10), { first: 2016, last: 2025 });
  assert.deepEqual(oceanShortcut(bounds, 50), { first: 1976, last: 2025 });
  assert.equal(oceanBounds([]), null);
  assert.equal(oceanBounds([{ date: "invalid" }]), null);
  assert.equal(oceanShortcut(null, 10), null);
  assert.equal(oceanShortcut(bounds, 0), null);
  for (const [from, to] of [["", ""], ["2025", "2020"], ["1900.1", "2025"], ["1900", "9999"], ["1899", "2025"]]) {
    assert.equal(validOceanPeriod(bounds, from, to), false);
  }
  assert.equal(validOceanPeriod(null, 2020, 2025), false);
});
