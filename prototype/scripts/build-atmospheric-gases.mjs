import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  atmosphericGasSources,
  atmosphericGasesApiBase,
  atmosphericGasesVersion,
  parseAtmosphericGasSource,
  validateAtmosphericGasesBundle,
} from "../src/atmospheric-gases.js";

const sourceDirectory = new URL("../../data_samples/2026-11-06/phase7d-feasibility/sources/", import.meta.url);
const outputDirectory = new URL("../../data_samples/2026-11-06/atmospheric-gases-7d7/", import.meta.url);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sources = [];
const gases = [];

for (const id of ["ch4", "n2o"]) {
  const expected = atmosphericGasSources[id];
  const bytes = await readFile(new URL(expected.file, sourceDirectory));
  if (hash(bytes) !== expected.sha256) throw new Error(`Archived ${id.toUpperCase()} source checksum mismatch`);
  const rows = parseAtmosphericGasSource(bytes.toString("utf8"), id);
  sources.push({ file: expected.file, url: expected.url, sha256: expected.sha256, rows: rows.length });
  gases.push({
    id,
    unit: "ppb",
    quantity: "global-atmospheric-concentration",
    first: rows[0].date,
    last: rows.at(-1).date,
    points: rows,
  });
}

const bundle = {
  schema_version: 1,
  version: atmosphericGasesVersion,
  publication_allowed: false,
  quantity: "global-atmospheric-concentration",
  unit: "ppb",
  source: {
    provider: "NOAA Global Monitoring Laboratory",
    citation: "Lan, X., Tans, P. & Thoning, K. W. Trends in globally-averaged CH4 and N2O. NOAA Global Monitoring Laboratory. Data accessed 2026-11-06.",
    retrieved: "2026-11-06",
  },
  gases,
  provenance: { files: sources },
};
if (!validateAtmosphericGasesBundle(bundle)) throw new Error("Generated atmospheric gases bundle failed validation");
const bundleBytes = Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`);
const catalog = {
  schema_version: 1,
  version: atmosphericGasesVersion,
  publication_allowed: false,
  api_base: atmosphericGasesApiBase,
  product: { file: "bundle.json", version: atmosphericGasesVersion, bytes: bundleBytes.length, sha256: hash(bundleBytes) },
};
const catalogBytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`);
if (process.argv.includes("--check")) {
  const [existingBundle, existingCatalog] = await Promise.all([
    readFile(new URL("bundle.json", outputDirectory)),
    readFile(new URL("catalog.json", outputDirectory)),
  ]);
  if (!existingBundle.equals(bundleBytes) || !existingCatalog.equals(catalogBytes)) {
    throw new Error("Existing atmospheric gases product differs from the verified source build");
  }
  console.log(`Verified existing local CH4/N2O product (${bundleBytes.length} bytes).`);
} else {
  await mkdir(outputDirectory, { recursive: false });
  await writeFile(new URL("bundle.json", outputDirectory), bundleBytes, { flag: "wx" });
  await writeFile(new URL("catalog.json", outputDirectory), catalogBytes, { flag: "wx" });
  console.log(`Created verified local CH4/N2O product (${bundleBytes.length} bytes).`);
}
