import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, cp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { precipitationCandidate, stagePrecipitationCandidate, verifyPrecipitationCandidate } from "../scripts/package_precipitation.mjs";
import { snowCandidate, verifySnowCandidate } from "../scripts/package_snow_cover.mjs";

test("rain candidate preserves all six previous APIs and recursively retains prior scientific/licence evidence", async () => {
  const manifest = await verifyPrecipitationCandidate(), previous = await verifySnowCandidate();
  assert.equal(manifest.publication_allowed, false);
  for (const row of previous.files) {
    let destination;
    if (/^weather_global\/(?:europe-api|continents-api|history-comparison-api|sea-ice-api|ice-sheets-api|snow-cover-api)\//.test(row.file)) {
      destination = row.file;
    } else if (!row.file.startsWith("weather_global/")) destination = `prior-evidence/snow-cover-7d3/${row.file}`;
    else continue;
    assert.deepEqual(await readFile(join(precipitationCandidate, destination)), await readFile(join(snowCandidate, row.file)));
  }
  const before = await readFile(join(precipitationCandidate, "manifest.json"));
  await assert.rejects(stagePrecipitationCandidate(), { code: "EEXIST" });
  assert.deepEqual(await readFile(join(precipitationCandidate, "manifest.json")), before);
});

test("rain candidate verification rejects tampered bytes and extra inventory files", async t => {
  const temporary = await mkdtemp(join(tmpdir(), "wg-precipitation-package-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const copied = join(temporary, "candidate");
  await cp(precipitationCandidate, copied, { recursive: true });
  await verifyPrecipitationCandidate(copied);
  await writeFile(join(copied, "unexpected.txt"), "not in inventory");
  await assert.rejects(verifyPrecipitationCandidate(copied), /inventory/);
  await rm(join(copied, "unexpected.txt"));
  await writeFile(join(copied, "weather_global", "precipitation-api", "v1", "bundle.json"), "{}");
  await assert.rejects(verifyPrecipitationCandidate(copied), /changed/);
});
