import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { readFile } from "node:fs/promises";
import { createSeaIceMiddleware, verifySeaIceArtifact } from "../scripts/sea-ice-api.mjs";
import { seaIceDirectory } from "../scripts/build_sea_ice.mjs";
import { resolve } from "node:path";

async function serve(t, options) {
  const middleware = createSeaIceMiddleware(options);
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}/weather_global/sea-ice-api/v1/`;
}

test("sea ice API validates checksums, both endpoint contracts and GET/HEAD semantics", async t => {
  const base = await serve(t);
  const bytes = await readFile(resolve(seaIceDirectory, "sea_ice_v1.json"));
  const response = await fetch(base + "catalog.json");
  const catalog = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(verifySeaIceArtifact(catalog, bytes), bytes);
  const bundle = await fetch(base + "bundle.json");
  assert.deepEqual(Buffer.from(await bundle.arrayBuffer()), bytes);
  for (const name of ["catalog.json", "bundle.json"]) {
    const head = await fetch(base + name, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.ok(Number(head.headers.get("content-length")) > 0);
  }
  assert.throws(() => verifySeaIceArtifact(catalog, Buffer.from("{}")), /checksum/);
  const changed = structuredClone(catalog);
  changed.product.sha256 = "0".repeat(64);
  assert.throws(() => verifySeaIceArtifact(changed, bytes), /checksum/);
});

test("sea ice API rejects unsupported methods, queries, paths and remote hosts", async t => {
  const base = await serve(t);
  assert.equal((await fetch(base + "bundle.json?x=1")).status, 400);
  assert.equal((await fetch(base + "wrong.json")).status, 404);
  const post = await fetch(base + "bundle.json", { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  const status = await new Promise((resolve, reject) => {
    const probe = request(base + "bundle.json", { headers: { Host: "remote.example" } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    probe.on("error", reject); probe.end();
  });
  assert.equal(status, 403);
});

test("missing and corrupt products fail closed with logged 503 and no stale fallback", async t => {
  const errors = [];
  const catalog = await readFile(resolve(seaIceDirectory, "catalog.json"));
  for (const readBundle of [
    async () => Buffer.from("{}"),
    async () => { throw new Error("Missing file"); },
  ]) {
    const base = await serve(t, { readCatalog: async () => catalog, readBundle,
      logger: { error: message => errors.push(message) } });
    for (const name of ["catalog.json", "bundle.json"]) {
      assert.equal((await fetch(base + name)).status, 503);
    }
  }
  assert.equal(errors.length, 4);
});
