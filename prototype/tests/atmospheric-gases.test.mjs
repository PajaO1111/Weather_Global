import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  atmosphericGasSources,
  atmosphericGasesVersion,
  parseAtmosphericGasSource,
  validateAtmosphericGasesBundle,
  validateAtmosphericGasesCatalog,
} from "../src/atmospheric-gases.js";

const source = name => readFile(new URL(`../../data_samples/2026-11-06/phase7d-feasibility/sources/${name}`, import.meta.url), "utf8");
const bundleBytes = () => readFile(new URL("../../data_samples/2026-11-06/atmospheric-gases-7d7/bundle.json", import.meta.url));
const catalogBytes = () => readFile(new URL("../../data_samples/2026-11-06/atmospheric-gases-7d7/catalog.json", import.meta.url));

test("NOAA monthly gases preserve complete axes, average/trend fields, and uncertainty sentinels", async () => {
  const ch4 = parseAtmosphericGasSource(await source(atmosphericGasSources.ch4.file), "ch4");
  const n2o = parseAtmosphericGasSource(await source(atmosphericGasSources.n2o.file), "n2o");
  assert.equal(ch4.length, 516);
  assert.equal(ch4[0].date, "1983-07");
  assert.equal(ch4.at(-1).date, "2026-06");
  assert.equal(n2o.length, 306);
  assert.equal(n2o[0].date, "2001-01");
  assert.equal(n2o.at(-1).date, "2026-06");
  assert.equal(ch4.at(-1).average, 1934.57);
  assert.equal(ch4.at(-1).average_uncertainty, null);
  assert.equal(n2o.at(-1).trend_uncertainty, null);
  assert.equal(ch4.filter(point => point.average_uncertainty === null).length, 5);
  assert.equal(n2o.filter(point => point.average_uncertainty === null).length, 5);
});

test("gas source parser rejects malformed, discontinuous, and altered-coverage inputs", async () => {
  const text = await source(atmosphericGasSources.ch4.file);
  assert.throws(() => parseAtmosphericGasSource(text, "toString"), /Unknown/);
  assert.throws(() => parseAtmosphericGasSource(`${text}\n1983 8 1983.625 1 1 1 1`, "ch4"), /coverage/);
  assert.throws(() => parseAtmosphericGasSource(text.replace("1983       8", "1983      13"), "ch4"), /month/);
  assert.throws(() => parseAtmosphericGasSource(text.replace("1983       8", "1983       9"), "ch4"), /consecutive/);
  assert.throws(() => parseAtmosphericGasSource(text.replace("1983       8", "1983       8 malformed"), "ch4"), /Malformed/);
});

test("local gas bundle and catalogue are complete, versioned, and unpublished", async () => {
  const bundle = JSON.parse((await bundleBytes()).toString("utf8"));
  const catalog = JSON.parse((await catalogBytes()).toString("utf8"));
  assert.equal(bundle.version, atmosphericGasesVersion);
  assert.equal(bundle.publication_allowed, false);
  assert.equal(validateAtmosphericGasesBundle(bundle), true);
  assert.equal(validateAtmosphericGasesCatalog(catalog), true);
  assert.equal(bundle.quantity, "global-atmospheric-concentration");
  assert.equal(bundle.unit, "ppb");
  const invalid = structuredClone(bundle);
  invalid.gases[0].points[0].average_uncertainty = -9.99;
  assert.equal(validateAtmosphericGasesBundle(invalid), false);
});
