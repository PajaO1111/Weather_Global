import { readFile } from "node:fs/promises";
import { iceSheetApiBase, validateIceSheetBundle, validateIceSheetCatalog } from "../src/ice-sheets.js";
import { createLocalProductMiddleware, verifyLocalProduct } from "./local-product-api.mjs";

const artifact = name => new URL(`../../data_samples/2026-11-06/ice-sheets-7d2/${name}`, import.meta.url);
const contract = { label: "Ice Sheets", validateCatalog: validateIceSheetCatalog, validateBundle: validateIceSheetBundle };
export const verifyIceSheetArtifact = (catalog, bytes) => verifyLocalProduct(catalog, bytes, contract);
export function createIceSheetMiddleware({
  logger = console, readCatalog = () => readFile(artifact("catalog.json")),
  readBundle = () => readFile(artifact("ice_sheets_v1.json")),
} = {}) {
  return createLocalProductMiddleware({ apiBase: iceSheetApiBase, logger, readCatalog, readBundle, ...contract });
}
