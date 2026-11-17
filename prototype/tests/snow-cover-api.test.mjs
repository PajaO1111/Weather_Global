import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createSnowMiddleware, verifySnowArtifact } from "../scripts/snow-cover-api.mjs";
import { snowDirectory } from "../scripts/build_snow_cover.mjs";

async function serve(t, options) {
  const middleware = createSnowMiddleware(options);
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}/weather_global/snow-cover-api/v1/`;
}

test("snow API serves verified catalog/bundle, cache headers and bodyless HEAD", async t => {
  const base = await serve(t);
  const bytes = await readFile(join(snowDirectory, "snow_cover_v1.json"));
  const response = await fetch(base + "catalog.json");
  const catalog = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(verifySnowArtifact(catalog, bytes), bytes);
  assert.deepEqual(Buffer.from(await (await fetch(base + "bundle.json")).arrayBuffer()), bytes);
  for (const name of ["catalog.json", "bundle.json"]) {
    const head = await fetch(base + name, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.ok(Number(head.headers.get("content-length")) > 0);
  }
});

test("snow API rejects nonlocal host, methods, unknown paths and queries", async t => {
  const base = await serve(t);
  assert.equal((await fetch(base + "bundle.json?")).status, 400);
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

test("snow API logs and fails closed on absent/corrupt or valid-checksum misleading science", async t => {
  const errors = [];
  const catalog = JSON.parse(await readFile(join(snowDirectory, "catalog.json")));
  const invalid = JSON.parse(await readFile(join(snowDirectory, "snow_cover_v1.json")));
  invalid.regions[0].reference[0].count = 29;
  const bytes = Buffer.from(JSON.stringify(invalid));
  const altered = structuredClone(catalog);
  altered.product.bytes = bytes.length;
  altered.product.sha256 = createHash("sha256").update(bytes).digest("hex");
  for (const [current, readBundle] of [
    [catalog, async () => Buffer.from("{}")],
    [catalog, async () => { throw new Error("Missing file"); }],
    [altered, async () => bytes],
  ]) {
    const base = await serve(t, { readCatalog: async () => Buffer.from(JSON.stringify(current)),
      readBundle, logger: { error: message => errors.push(message) } });
    assert.equal((await fetch(base + "catalog.json")).status, 503);
    assert.equal((await fetch(base + "bundle.json")).status, 503);
  }
  assert.equal(errors.length, 6);
});
