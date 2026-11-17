import { readFile } from "node:fs/promises";
import { seaIceApiBase, validateSeaIceBundle, validateSeaIceCatalog } from "../src/sea-ice.js";
import { createLocalProductMiddleware, verifyLocalProduct } from "./local-product-api.mjs";

const artifact = name => new URL(`../../data_samples/2026-11-06/sea-ice-7d1/${name}`, import.meta.url);
const contract = { label: "Sea Ice", validateCatalog: validateSeaIceCatalog, validateBundle: validateSeaIceBundle };
export function verifySeaIceArtifact(catalog, bytes) {
  return verifyLocalProduct(catalog, bytes, contract);
}

export function createSeaIceMiddleware({
  logger = console,
  readCatalog = () => readFile(artifact("catalog.json")),
  readBundle = () => readFile(artifact("sea_ice_v1.json")),
} = {}) {
  return createLocalProductMiddleware({ apiBase: seaIceApiBase, logger, readCatalog, readBundle, ...contract });
}
