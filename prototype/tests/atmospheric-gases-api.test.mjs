import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createAtmosphericGasesMiddleware, verifyAtmosphericGasesArtifact } from "../scripts/atmospheric-gases-api.mjs";

async function serve(t, options) {
  const middleware = createAtmosphericGasesMiddleware(options);
  const server = createServer((request, response) => middleware(request, response, () => {
    response.statusCode = 404;
    response.end();
  }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}/weather_global/atmospheric-gases-api/v1/`;
}

const artifact = name => readFile(new URL(`../../data_samples/2026-11-06/atmospheric-gases-7d7/${name}`, import.meta.url));

test("gas API serves verified NOAA concentration bundle and bodyless HEAD", async t => {
  const base = await serve(t);
  const catalogBytes = await artifact("catalog.json");
  const bundleBytes = await artifact("bundle.json");
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  const response = await fetch(`${base}catalog.json`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(verifyAtmosphericGasesArtifact(catalog, bundleBytes), bundleBytes);
  assert.deepEqual(Buffer.from(await (await fetch(`${base}bundle.json`)).arrayBuffer()), bundleBytes);
  const head = await fetch(`${base}bundle.json`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("gas API fails closed when catalogue or source product is corrupt", async t => {
  const errors = [];
  const validCatalog = JSON.parse((await artifact("catalog.json")).toString("utf8"));
  const base = await serve(t, {
    readCatalog: async () => Buffer.from(JSON.stringify(validCatalog)),
    readBundle: async () => Buffer.from("{}"),
    logger: { error: message => errors.push(message) },
  });
  assert.equal((await fetch(`${base}bundle.json`)).status, 503);
  assert.equal(errors.length, 1);
});
