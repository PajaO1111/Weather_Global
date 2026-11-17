import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, request } from "node:http";
import { readFile } from "node:fs/promises";
import {
  historyComparisonApiBase,
  validateHistoryComparisonCatalog,
} from "../src/history-comparison.js";
import {
  createHistoryComparisonMiddleware,
  verifyHistoryComparisonArtifact,
} from "../scripts/history-comparison-api.mjs";

const catalogPath = new URL("../../data_samples/2026-11-06/continents-history-7c8/catalog.json", import.meta.url);
const bundlePath = new URL("../../data_samples/2026-11-06/continents-history-7c8/history_comparison_v1.json", import.meta.url);

async function loadArtifacts() {
  const [catalogBytes, bundleBytes] = await Promise.all([readFile(catalogPath), readFile(bundlePath)]);
  return { catalogBytes, bundleBytes, catalog: JSON.parse(catalogBytes) };
}

async function serve(options) {
  const middleware = createHistoryComparisonMiddleware(options);
  const server = createServer((request, response) => middleware(request, response, () => {
    response.statusCode = 404;
    response.end("Not found");
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin };
}

test("artifact delivery requires exact current bytes, checksum, contract and catalogue identity", async () => {
  const { catalog, bundleBytes, catalogBytes } = await loadArtifacts();
  assert.equal(validateHistoryComparisonCatalog(catalog), true);
  assert.equal(verifyHistoryComparisonArtifact(catalog, bundleBytes), bundleBytes);
  assert.equal(catalog.product.sha256, createHash("sha256").update(bundleBytes).digest("hex"));
  assert.throws(() => verifyHistoryComparisonArtifact(catalog, Buffer.concat([bundleBytes, Buffer.from(" ")])),
    /byte-length|checksum/);
  assert.throws(() => verifyHistoryComparisonArtifact(catalog, Buffer.from("{}")), /byte-length|checksum/);
  const mismatchedCatalog = structuredClone(catalog);
  mismatchedCatalog.regions[0].name.en = "Wrong name";
  assert.throws(() => verifyHistoryComparisonArtifact(mismatchedCatalog, bundleBytes), /identity/);
  const corruptCatalog = structuredClone(catalog);
  corruptCatalog.product.sha256 = "0".repeat(64);
  assert.throws(() => verifyHistoryComparisonArtifact(corruptCatalog, bundleBytes), /checksum/);
  assert.ok(catalogBytes.length > 0);
});

test("loopback API serves verified catalogue and bundle with no-store GET and HEAD semantics", async (t) => {
  const { bundleBytes } = await loadArtifacts();
  const { server, origin } = await serve();
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const catalogResponse = await fetch(`${origin}/weather_global/${historyComparisonApiBase}catalog.json`);
  assert.equal(catalogResponse.status, 200);
  assert.equal(catalogResponse.headers.get("cache-control"), "no-store");
  assert.equal(catalogResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(catalogResponse.headers.get("content-type"), "application/json; charset=utf-8");
  const catalog = await catalogResponse.json();
  const bundleResponse = await fetch(`${origin}/${historyComparisonApiBase}bundle.json`);
  assert.equal(bundleResponse.status, 200);
  assert.equal(bundleResponse.headers.get("content-length"), String(bundleBytes.length));
  assert.equal(createHash("sha256").update(Buffer.from(await bundleResponse.arrayBuffer())).digest("hex"), catalog.product.sha256);
  const head = await fetch(`${origin}/${historyComparisonApiBase}bundle.json`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const post = await fetch(`${origin}/${historyComparisonApiBase}catalog.json`, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  assert.equal((await fetch(`${origin}/${historyComparisonApiBase}catalog.json?x=1`)).status, 400);
  assert.equal((await fetch(`${origin}/${historyComparisonApiBase}unknown.json`)).status, 404);
  assert.equal((await fetch(`${origin}/unrelated.json`)).status, 404);
  const remoteHostStatus = await new Promise((resolve, reject) => {
    const probe = request(`${origin}/${historyComparisonApiBase}catalog.json`, {
      headers: { Host: "remote.example" },
    }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    probe.on("error", reject);
    probe.end();
  });
  assert.equal(remoteHostStatus, 403);
});

test("corrupt local artifacts produce logged 503 responses instead of stale data", async (t) => {
  const errors = [];
  const { catalogBytes } = await loadArtifacts();
  const { server, origin } = await serve({
    logger: { error: (message) => errors.push(message) },
    readCatalog: async () => catalogBytes,
    readBundle: async () => Buffer.from("{}"),
  });
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const response = await fetch(`${origin}/${historyComparisonApiBase}bundle.json`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Verified local historical comparison unavailable.",
  });
  const head = await fetch(`${origin}/${historyComparisonApiBase}bundle.json`, { method: "HEAD" });
  assert.equal(head.status, 503);
  assert.equal(await head.text(), "");
  assert.equal(errors.length, 2);
  assert.match(errors[0], /byte-length|checksum/);
});
