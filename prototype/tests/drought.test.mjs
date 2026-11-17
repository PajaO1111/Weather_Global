import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validateDroughtCatalog, validateDroughtBundle, droughtValue, droughtHistory, droughtCategories } from "../src/drought.js";
import { droughtRequests } from "../scripts/archive_drought.mjs";
const load = async name => JSON.parse(await readFile(new URL(`../../data_samples/2026-11-06/drought-7d5/${name}`, import.meta.url)));

test("drought archive is bounded to two full original native files and five rights/method pages", () => {
  assert.equal(droughtRequests.length, 7);
  assert.equal(new Set(droughtRequests.map(p => p.file)).size, 7);
  assert.equal(droughtRequests.filter(p => p.exact).reduce((sum, p) => sum + p.exact, 0), 759745573);
  assert.ok(droughtRequests.every(p => p.url.startsWith("https://") && (p.exact > 0 || p.max > 0)));
});
test("drought scientific contract preserves full native history, spinup, domain gaps and area classes", async () => {
  const bundle = await load("drought_v1.json");
  assert.ok(validateDroughtCatalog(await load("catalog.json")));
  assert.ok(validateDroughtBundle(bundle));
  for (const product of bundle.scales) {
    for (const region of product.regions.slice(0, 6)) {
      assert.equal(region.points.filter(p => p.dry !== null).length, 1488 - product.months + 1);
      assert.equal(region.annual.filter(p => p.dry !== null).length, 123);
      assert.ok(region.points.slice(product.months - 1).some(p => p.coverage < 1));
      assert.equal(region.annual[0].reason, "incomplete-year");
    }
    assert.ok(product.regions[6].points.every(p => p.dry === null && p.reason === "no-source-domain"));
  }
  const audit = await load("validation.json");
  assert.equal(audit.monthly_records, 20832);
  assert.equal(audit.geometry_samples, 42);
});
test("drought contract rejects changed categories, missing denominators, filled spinup and false reference/uncertainty", async () => {
  const bundle = await load("drought_v1.json");
  for (const mutate of [
    b => { b.source.pet = "Thornthwaite"; },
    b => { b.source.recentered_by_project = true; },
    b => { b.source.calibration_period = [1981, 2010]; },
    b => { b.source.confidence_level = .95; },
    b => { b.source.licence = "CC-BY-4.0"; },
    b => { b.scales[0].regions[0].points[0].dry = 0; },
    b => { b.scales[0].regions[0].points[5].coverage = 0; },
    b => { b.scales[0].regions[0].points[5].categories[0] += .01; },
    b => { b.scales[1].regions[6].points[20].dry = 0; },
    b => { b.scales[0].regions[0].annual[1].dry = 100; },
    b => { b.boundaries[1] = -1.65; },
  ]) {
    const changed = structuredClone(bundle); mutate(changed);
    assert.equal(validateDroughtBundle(changed), false);
  }
});
test("drought category and history helpers retain missing windows and inclusive cumulative shares", async () => {
  const bundle = await load("drought_v1.json"), region = bundle.scales[1].regions[0];
  assert.equal(droughtHistory(region, "1", 1901, 1901)[0].dry, null);
  assert.equal(droughtHistory(region, "12", 1901, 1901)[0].reason, null);
  assert.equal(droughtHistory(region, "annual", 1901, 1901)[0].dry, null);
  const point = region.points[11];
  for (const [i, id] of droughtCategories.entries()) assert.equal(droughtValue(point, id), point.categories[i]);
  assert.equal(droughtValue(point, "dry"), point.dry);
  assert.throws(() => droughtValue(point, "bad"));
  assert.throws(() => droughtHistory(region, "13", 1901, 2024));
  assert.throws(() => droughtHistory(region, "1", 2024, 1901));
});
test("canonical drought numerical regression checks category edges, available-area weighting and incomplete years", () => {
  const command = process.env.WEATHER_GLOBAL_PYTHON || (process.platform === "win32" ? "py" : "python3");
  const launcher = !process.env.WEATHER_GLOBAL_PYTHON && process.platform === "win32" ? ["-3.10"] : [];
  const run = spawnSync(command, [...launcher, "-B", "-m", "unittest", "discover", "-s", join("prototype", "scripts"), "-p", "test_drought.py"],
    { cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8", timeout: 60000 });
  assert.ifError(run.error); assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`); assert.match(run.stderr, /Ran 5 tests/);
});
