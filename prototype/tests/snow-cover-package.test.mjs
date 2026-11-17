import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snowCandidate, stageSnowCandidate, verifySnowCandidate } from "../scripts/package_snow_cover.mjs";

test("7D.3 candidate preserves six APIs, original snow values and attribution and refuses overwrite", async () => {
  const manifest = await verifySnowCandidate();
  assert.equal(manifest.publication_allowed, false);
  for (const family of ["europe-api", "continents-api", "history-comparison-api", "sea-ice-api", "ice-sheets-api", "snow-cover-api"]) {
    assert.ok(manifest.files.some(row => row.file === `weather_global/${family}/v1/catalog.json`));
  }
  assert.ok(manifest.files.every(row => !/\.(?:csv|nc|gz|xlsx)$/.test(row.file)));
  assert.ok(manifest.files.every(row => !/(?:config\.php|config\.example\.php|\/storage\/)/.test(row.file)));
  const attribution = await readFile(join(snowCandidate, "attribution.txt"), "utf8");
  assert.match(attribution, /10\.7289\/V5N014G9/);
  assert.match(attribution, /MAM/);
  assert.match(attribution, /not.*depth/i);
  const before = await readFile(join(snowCandidate, "manifest.json"));
  await assert.rejects(stageSnowCandidate(), error => error.code === "EEXIST");
  assert.deepEqual(await readFile(join(snowCandidate, "manifest.json")), before);
});

test("snow candidate checker rejects traversal and corruption without changing the persistent candidate", async t => {
  const directory = await mkdtemp(join(tmpdir(), "weather-snow-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = { publication_allowed: false, status: "local-manual-review-7d3-not-a-public-release",
    files: [{ file: "../outside.json", bytes: 2, sha256: "0".repeat(64) }] };
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  await assert.rejects(verifySnowCandidate(directory), /Unsafe candidate path/);
  manifest.files[0].file = "weather_global/bundle.json";
  await mkdir(join(directory, "weather_global"));
  await writeFile(join(directory, "weather_global", "bundle.json"), "{}");
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  await assert.rejects(verifySnowCandidate(directory), /Candidate changed/);
});
