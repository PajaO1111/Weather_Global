import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import {
  createCarbonBudgetMiddleware,
  verifyCarbonBudgetArtifact,
} from "../scripts/carbon-budget-api.mjs";

async function serve(t, options) {
  const middleware = createCarbonBudgetMiddleware(options);
  const server = createServer((request, response) => middleware(request, response, () => {
    response.statusCode = 404;
    response.end();
  }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}/weather_global/carbon-budget-api/v1/`;
}

const artifact = name => readFile(
  new URL(`../../data_samples/2026-11-06/carbon-budget-7d6/${name}`, import.meta.url),
);

test("carbon-budget API serves only the integrity-checked local GCB bundle", async t => {
  const base = await serve(t);
  const catalogBytes = await artifact("catalog.json");
  const bundleBytes = await artifact("bundle.json");
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  const response = await fetch(`${base}catalog.json`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(verifyCarbonBudgetArtifact(catalog, bundleBytes), bundleBytes);
  assert.deepEqual(Buffer.from(await (await fetch(`${base}bundle.json`)).arrayBuffer()), bundleBytes);
  assert.equal((await fetch(`${base}bundle.json`, { method: "HEAD" })).status, 200);
});

test("carbon-budget API fails closed when the data bundle is corrupted", async t => {
  const errors = [];
  const catalog = JSON.parse((await artifact("catalog.json")).toString("utf8"));
  const base = await serve(t, {
    readCatalog: async () => Buffer.from(JSON.stringify(catalog)),
    readBundle: async () => Buffer.from("{}"),
    logger: { error: message => errors.push(message) },
  });
  assert.equal((await fetch(`${base}bundle.json`)).status, 503);
  assert.equal(errors.length, 1);
});
