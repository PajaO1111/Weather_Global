import { readFile } from "node:fs/promises";
import {
  carbonBudgetApiBase,
  validateCarbonBudgetBundle,
  validateCarbonBudgetCatalog,
} from "../src/carbon-budget.js";
import { createLocalProductMiddleware, verifyLocalProduct } from "./local-product-api.mjs";

const artifact = name => new URL(`../../data_samples/2026-11-06/carbon-budget-7d6/${name}`, import.meta.url);
const contract = {
  label: "Carbon budget",
  validateCatalog: validateCarbonBudgetCatalog,
  validateBundle: validateCarbonBudgetBundle,
};
export const verifyCarbonBudgetArtifact = (catalog, bytes) =>
  verifyLocalProduct(catalog, bytes, contract);

export function createCarbonBudgetMiddleware({
  logger = console,
  readCatalog = () => readFile(artifact("catalog.json")),
  readBundle = () => readFile(artifact("bundle.json")),
} = {}) {
  return createLocalProductMiddleware({
    apiBase: carbonBudgetApiBase,
    logger,
    readCatalog,
    readBundle,
    ...contract,
  });
}
