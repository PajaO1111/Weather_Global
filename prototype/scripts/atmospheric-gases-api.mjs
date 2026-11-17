import { readFile } from "node:fs/promises";
import {
  atmosphericGasesApiBase,
  validateAtmosphericGasesBundle,
  validateAtmosphericGasesCatalog,
} from "../src/atmospheric-gases.js";
import { createLocalProductMiddleware, verifyLocalProduct } from "./local-product-api.mjs";

const artifact = name => new URL(`../../data_samples/2026-11-06/atmospheric-gases-7d7/${name}`, import.meta.url);
const contract = {
  label: "Atmospheric gases",
  validateCatalog: validateAtmosphericGasesCatalog,
  validateBundle: validateAtmosphericGasesBundle,
};
export const verifyAtmosphericGasesArtifact = (catalog, bytes) => verifyLocalProduct(catalog, bytes, contract);

export function createAtmosphericGasesMiddleware({
  logger = console,
  readCatalog = () => readFile(artifact("catalog.json")),
  readBundle = () => readFile(artifact("bundle.json")),
} = {}) {
  return createLocalProductMiddleware({
    apiBase: atmosphericGasesApiBase,
    logger,
    readCatalog,
    readBundle,
    ...contract,
  });
}
