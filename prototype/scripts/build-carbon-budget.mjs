import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  carbonBudgetApiBase,
  carbonBudgetSources,
  carbonBudgetVersion,
  buildCarbonBudgetBundle,
} from "../src/carbon-budget.js";
import { readXlsxSheets } from "./xlsx-reader.mjs";

const sourceDirectory = new URL(
  "../../data_samples/2026-11-06/phase7d-feasibility/sources/icos/",
  import.meta.url,
);
const outputDirectory = new URL("../../data_samples/2026-11-06/carbon-budget-7d6/", import.meta.url);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const sheetNames = {
  global: [
    "Global Carbon Budget",
    "Historical Budget",
    "Fossil Emissions by Category",
    "Land-Use Change Emissions",
    "Atmospheric Growth",
    "Ocean Sink",
    "Terrestrial Sink",
    "Cement Carbonation Sink",
  ],
  nationalFossil: [
    "Territorial Emissions",
    "Consumption Emissions",
    "Emissions Transfers",
    "Regions",
  ],
  nationalLandUse: ["BLUE", "OSCAR", "LUCE"],
};
const sources = {};
const sourceSha256 = {};
for (const [id, source] of Object.entries(carbonBudgetSources)) {
  const bytes = await readFile(new URL(source.file, sourceDirectory));
  sourceSha256[id] = sha256(bytes);
  if (sourceSha256[id] !== source.sha256) {
    throw new Error(`Archived GCB ${id} workbook checksum mismatch`);
  }
  sources[id] = readXlsxSheets(bytes, sheetNames[id]);
}
const bundle = buildCarbonBudgetBundle(sources, { sourceSha256 });
const bundleBytes = Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`);
const catalog = {
  schema_version: 1,
  version: carbonBudgetVersion,
  publication_allowed: false,
  api_base: carbonBudgetApiBase,
  product: {
    file: "bundle.json",
    version: carbonBudgetVersion,
    bytes: bundleBytes.length,
    sha256: sha256(bundleBytes),
  },
};
const catalogBytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`);

if (process.argv.includes("--check")) {
  const [existingBundle, existingCatalog] = await Promise.all([
    readFile(new URL("bundle.json", outputDirectory)),
    readFile(new URL("catalog.json", outputDirectory)),
  ]);
  if (!existingBundle.equals(bundleBytes) || !existingCatalog.equals(catalogBytes)) {
    throw new Error("Existing local GCB product differs from the verified workbook");
  }
  console.log(`Verified local GCB v1.0 product (${bundleBytes.length} bytes).`);
} else if (process.argv.includes("--replace")) {
  const [existingBundleBytes, existingCatalogBytes] = await Promise.all([
    readFile(new URL("bundle.json", outputDirectory)),
    readFile(new URL("catalog.json", outputDirectory)),
  ]);
  const existingBundle = JSON.parse(existingBundleBytes.toString("utf8"));
  const existingCatalog = JSON.parse(existingCatalogBytes.toString("utf8"));
  const intactCatalog = existingBundle.publication_allowed === false
    && existingCatalog.publication_allowed === false
    && existingCatalog.product?.file === "bundle.json"
    && existingCatalog.product.bytes === existingBundleBytes.length
    && existingCatalog.product.sha256 === sha256(existingBundleBytes)
    && existingCatalog.product.version === existingBundle.version;
  const pinnedSource = existingBundle.version === "gcb-2025-v1.0-7d6-local-v2"
    && existingBundle.provenance?.source_sha256 === carbonBudgetSources.global.sha256
    || existingBundle.version === carbonBudgetVersion
      && Object.entries(carbonBudgetSources).every(([id, source]) =>
        existingBundle.provenance?.source_sha256?.[id] === source.sha256);
  if (!intactCatalog || !pinnedSource) {
    throw new Error("Existing local GCB product is not an intact product of this source");
  }
  await writeFile(new URL("bundle.json", outputDirectory), bundleBytes);
  await writeFile(new URL("catalog.json", outputDirectory), catalogBytes);
  console.log(`Replaced verified local GCB product (${bundleBytes.length} bytes).`);
} else {
  await mkdir(outputDirectory, { recursive: false });
  await writeFile(new URL("bundle.json", outputDirectory), bundleBytes, { flag: "wx" });
  await writeFile(new URL("catalog.json", outputDirectory), catalogBytes, { flag: "wx" });
  console.log(`Created local GCB v1.0 product (${bundleBytes.length} bytes).`);
}
