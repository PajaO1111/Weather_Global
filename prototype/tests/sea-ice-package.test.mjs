import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seaIceCandidate, stageSeaIceCandidate, verifySeaIceReviewCandidate } from "../scripts/package_sea_ice.mjs";

test("7D.1 manual candidate verifies immutable bytes, all four API families and independent evidence", async () => {
  const manifest = await verifySeaIceReviewCandidate();
  assert.equal(manifest.publication_allowed, false);
  assert.ok(manifest.files.some(row => row.file === "attribution.txt"));
  assert.ok(manifest.files.every(row => !/\.(?:csv|nc|gz|xlsx)$/.test(row.file)));
  assert.ok(manifest.files.every(row => !/(?:config\.php|config\.example\.php|\/storage\/)/.test(row.file)));
  const source = await readFile(join(seaIceCandidate, "attribution.txt"), "utf8");
  assert.match(source, /10\.7265\/a98x-0f50/);
  const before = await readFile(join(seaIceCandidate, "manifest.json"));
  await assert.rejects(stageSeaIceCandidate(), error => error.code === "EEXIST");
  assert.deepEqual(await readFile(join(seaIceCandidate, "manifest.json")), before);
});

test("candidate checker rejects path traversal and changed bytes without touching real artefacts", async t => {
  const directory = await mkdtemp(join(tmpdir(), "weather-sea-ice-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = { publication_allowed: false, status: "local-manual-review-7d1-not-a-public-release",
    files: [{ file: "../outside.json", bytes: 2, sha256: "0".repeat(64) }] };
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  await assert.rejects(verifySeaIceReviewCandidate(directory), /Unsafe candidate path/);
  manifest.files[0].file = "weather_global/bundle.json";
  await mkdir(join(directory, "weather_global"));
  await writeFile(join(directory, "weather_global", "bundle.json"), "{}");
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  await assert.rejects(verifySeaIceReviewCandidate(directory), /Candidate changed/);
});
