import { readFile } from "node:fs/promises";
import { droughtApiBase, validateDroughtBundle, validateDroughtCatalog } from "../src/drought.js";
import { createLocalProductMiddleware, verifyLocalProduct } from "./local-product-api.mjs";
const artifact = name => new URL(`../../data_samples/2026-11-06/drought-7d5/${name}`, import.meta.url);
const contract = { label: "Drought", validateCatalog: validateDroughtCatalog, validateBundle: validateDroughtBundle };
export const verifyDroughtArtifact = (catalog, bytes) => verifyLocalProduct(catalog, bytes, contract);
export function createDroughtMiddleware({
  logger = console, readCatalog = () => readFile(artifact("catalog.json")),
  readBundle = () => readFile(artifact("drought_v1.json")),
} = {}) {
  return createLocalProductMiddleware({ apiBase: droughtApiBase, logger, readCatalog, readBundle, ...contract });
}
