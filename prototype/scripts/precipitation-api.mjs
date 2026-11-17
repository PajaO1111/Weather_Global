import { readFile } from "node:fs/promises";
import { precipitationApiBase, validatePrecipitationBundle, validatePrecipitationCatalog } from "../src/precipitation.js";
import { createLocalProductMiddleware, verifyLocalProduct } from "./local-product-api.mjs";
const artifact = name => new URL(`../../data_samples/2026-11-06/precipitation-7d4/${name}`, import.meta.url);
const contract = { label: "Precipitation", validateCatalog: validatePrecipitationCatalog, validateBundle: validatePrecipitationBundle };
export const verifyPrecipitationArtifact = (catalog, bytes) => verifyLocalProduct(catalog, bytes, contract);
export function createPrecipitationMiddleware({
  logger = console, readCatalog = () => readFile(artifact("catalog.json")),
  readBundle = () => readFile(artifact("precipitation_v1.json")),
} = {}) {
  return createLocalProductMiddleware({ apiBase: precipitationApiBase, logger, readCatalog, readBundle, ...contract });
}
