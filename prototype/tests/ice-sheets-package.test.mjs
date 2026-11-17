import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { iceSheetCandidate, stageIceSheetCandidate, verifyIceSheetReviewCandidate } from "../scripts/package_ice_sheets.mjs";

test("7D.2 candidate verifies original land-ice product, all five APIs and honest uncertainty attribution", async () => {
  const manifest = await verifyIceSheetReviewCandidate();
  assert.equal(manifest.publication_allowed, false);
  for (const family of ["europe-api", "continents-api", "history-comparison-api", "sea-ice-api", "ice-sheets-api"]) {
    assert.ok(manifest.files.some(row => row.file === `weather_global/${family}/v1/catalog.json`));
  }
  assert.ok(manifest.files.every(row => !/\.(?:csv|nc|gz|xlsx)$/.test(row.file)));
  assert.ok(manifest.files.every(row => !/(?:config\.php|config\.example\.php|\/storage\/)/.test(row.file)));
  const source = await readFile(join(iceSheetCandidate, "attribution.txt"), "utf8");
  assert.match(source, /public.*chart/i);
  assert.match(source, /confidence level.*not stated/i);
  assert.match(source, /10\.5067\/TEMSC-GT634/);
  const before = await readFile(join(iceSheetCandidate, "manifest.json"));
  await assert.rejects(stageIceSheetCandidate(), error => error.code === "EEXIST");
  assert.deepEqual(await readFile(join(iceSheetCandidate, "manifest.json")), before);
});

test("land ice candidate checker rejects traversal and corrupted bytes without altering actual package", async t => {
  const directory = await mkdtemp(join(tmpdir(), "weather-land-ice-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = { publication_allowed: false, status: "local-manual-review-7d2-not-a-public-release",
    files: [{ file: "../outside.json", bytes: 2, sha256: "0".repeat(64) }] };
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  await assert.rejects(verifyIceSheetReviewCandidate(directory), /Unsafe candidate path/);
  manifest.files[0].file = "weather_global/bundle.json";
  await mkdir(join(directory, "weather_global"));
  await writeFile(join(directory, "weather_global", "bundle.json"), "{}");
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  await assert.rejects(verifyIceSheetReviewCandidate(directory), /Candidate changed/);
});
