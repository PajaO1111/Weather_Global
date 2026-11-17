import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createIceSheetMiddleware, verifyIceSheetArtifact } from "../scripts/ice-sheets-api.mjs";
import { iceSheetDirectory } from "../scripts/build_ice_sheets.mjs";

async function serve(t, options) {
  const middleware = createIceSheetMiddleware(options);
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}/weather_global/ice-sheets-api/v1/`;
}

test("ice sheet API serves verified bytes, consistent catalogue and bodyless HEAD", async t => {
  const base = await serve(t);
  const bytes = await readFile(join(iceSheetDirectory, "ice_sheets_v1.json"));
  const response = await fetch(base + "catalog.json");
  const catalog = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(verifyIceSheetArtifact(catalog, bytes), bytes);
  assert.deepEqual(Buffer.from(await (await fetch(base + "bundle.json")).arrayBuffer()), bytes);
  for (const name of ["catalog.json", "bundle.json"]) {
    const head = await fetch(base + name, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.ok(Number(head.headers.get("content-length")) > 0);
  }
});

test("ice sheet API rejects queries, paths, methods and nonlocal Host", async t => {
  const base = await serve(t);
  assert.equal((await fetch(base + "bundle.json?")).status, 400);
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

test("ice sheet API fails closed for missing/corrupt bytes and valid-checksum invalid science", async t => {
  const errors = [];
  const catalog = JSON.parse(await readFile(join(iceSheetDirectory, "catalog.json")));
  const source = JSON.parse(await readFile(join(iceSheetDirectory, "ice_sheets_v1.json")));
  source.uncertainty.confidence_level = 0.95;
  const alteredBytes = Buffer.from(JSON.stringify(source));
  const alteredCatalog = structuredClone(catalog);
  alteredCatalog.product.bytes = alteredBytes.length;
  alteredCatalog.product.sha256 = createHash("sha256").update(alteredBytes).digest("hex");
  for (const [currentCatalog, readBundle] of [
    [catalog, async () => Buffer.from("{}")],
    [catalog, async () => { throw new Error("Missing file"); }],
    [alteredCatalog, async () => alteredBytes],
  ]) {
    const base = await serve(t, { readCatalog: async () => Buffer.from(JSON.stringify(currentCatalog)),
      readBundle, logger: { error: message => errors.push(message) } });
    assert.equal((await fetch(base + "catalog.json")).status, 503);
    assert.equal((await fetch(base + "bundle.json")).status, 503);
  }
  assert.equal(errors.length, 6);
});
