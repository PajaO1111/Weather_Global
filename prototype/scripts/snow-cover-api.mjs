import { readFile } from "node:fs/promises";
import { snowApiBase, validateSnowCatalog, validateSnowBundle } from "../src/snow-cover.js";
import { createLocalProductMiddleware, verifyLocalProduct } from "./local-product-api.mjs";

const artifact = name => new URL(`../../data_samples/2026-11-06/snow-cover-7d3/${name}`, import.meta.url);
const contract = { label: "Snow Cover", validateCatalog: validateSnowCatalog, validateBundle: validateSnowBundle };
export const verifySnowArtifact = (catalog, bytes) => verifyLocalProduct(catalog, bytes, contract);
export function createSnowMiddleware({
  logger = console, readCatalog = () => readFile(artifact("catalog.json")),
  readBundle = () => readFile(artifact("snow_cover_v1.json")),
} = {}) {
  return createLocalProductMiddleware({ apiBase: snowApiBase, logger, readCatalog, readBundle, ...contract });
}
