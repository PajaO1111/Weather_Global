import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, cp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { droughtCandidate, stageDroughtCandidate, verifyDroughtCandidate } from "../scripts/package_drought.mjs";
import { precipitationCandidate, verifyPrecipitationCandidate } from "../scripts/package_precipitation.mjs";

test("drought candidate retains all seven prior APIs and recursive rights; adapted database offer and licence present", async () => {
  const manifest = await verifyDroughtCandidate(), previous = await verifyPrecipitationCandidate();
  assert.equal(manifest.publication_allowed, false);
  for (const row of previous.files) {
    const destination = /^weather_global\/(?:europe-api|continents-api|history-comparison-api|sea-ice-api|ice-sheets-api|snow-cover-api|precipitation-api)\//.test(row.file)
      ? row.file : !row.file.startsWith("weather_global/") ? `prior-evidence/precipitation-7d4/${row.file}` : null;
    if (destination) assert.deepEqual(await readFile(join(droughtCandidate, destination)), await readFile(join(precipitationCandidate, row.file)));
  }
  const before = await readFile(join(droughtCandidate, "manifest.json"));
  await assert.rejects(stageDroughtCandidate(), { code: "EEXIST" });
  assert.deepEqual(await readFile(join(droughtCandidate, "manifest.json")), before);
  assert.match(await readFile(join(droughtCandidate, "attribution.txt"), "utf8"), /ODbL/);
});
test("drought candidate fails verification on tampered product and extra inventory files", async t => {
  const temporary = await mkdtemp(join(tmpdir(), "wg-drought-package-")); t.after(() => rm(temporary, { recursive: true, force: true }));
  const copied = join(temporary, "candidate"); await cp(droughtCandidate, copied, { recursive: true }); await verifyDroughtCandidate(copied);
  await writeFile(join(copied, "unexpected.txt"), "extra");
  await assert.rejects(verifyDroughtCandidate(copied), /inventory/); await rm(join(copied, "unexpected.txt"));
  await writeFile(join(copied, "weather_global", "drought-api", "v1", "bundle.json"), "{}");
  await assert.rejects(verifyDroughtCandidate(copied), /changed/);
});
