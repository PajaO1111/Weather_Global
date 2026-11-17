import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createPrecipitationMiddleware, verifyPrecipitationArtifact } from "../scripts/precipitation-api.mjs";
const load = name => readFile(new URL(`../../data_samples/2026-11-06/precipitation-7d4/${name}`, import.meta.url));
async function serve(t, options) {
  const middleware = createPrecipitationMiddleware(options);
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}/weather_global/precipitation-api/v1/`;
}
test("precipitation API serves verified bytes, no-store/nosniff and bodyless HEAD", async t => {
  const base = await serve(t), bytes = await load("precipitation_v1.json");
  const response = await fetch(base + "catalog.json"), catalog = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(verifyPrecipitationArtifact(catalog, bytes), bytes);
  assert.deepEqual(Buffer.from(await (await fetch(base + "bundle.json")).arrayBuffer()), bytes);
  for (const name of ["catalog.json", "bundle.json"]) {
    const head = await fetch(base + name, { method: "HEAD" });
    assert.equal(head.status, 200); assert.equal(await head.text(), "");
    assert.ok(Number(head.headers.get("content-length")) > 0);
  }
});
test("precipitation API rejects queries, unknown paths, methods and nonlocal Host", async t => {
  const base = await serve(t);
  assert.equal((await fetch(base + "bundle.json?")).status, 400);
  assert.equal((await fetch(base + "wrong.json")).status, 404);
  const post = await fetch(base + "bundle.json", { method: "POST" });
  assert.equal(post.status, 405); assert.equal(post.headers.get("allow"), "GET, HEAD");
  const status = await new Promise((resolve, reject) => {
    const probe = request(base + "bundle.json", { headers: { Host: "remote.example" } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    probe.on("error", reject); probe.end();
  });
  assert.equal(status, 403);
});
test("precipitation API logs 503 on missing/corrupt and checksummed misleading precipitation science", async t => {
  const errors = [], catalog = JSON.parse(await load("catalog.json"));
  const invalid = JSON.parse(await load("precipitation_v1.json"));
  invalid.regions[0].annual.at(-1).value = 1;
  const bytes = Buffer.from(JSON.stringify(invalid)), altered = structuredClone(catalog);
  altered.product.bytes = bytes.length;
  altered.product.sha256 = createHash("sha256").update(bytes).digest("hex");
  for (const [current, readBundle] of [
    [catalog, async () => Buffer.from("{}")],
    [catalog, async () => { throw new Error("Missing file"); }],
    [altered, async () => bytes],
  ]) {
    const base = await serve(t, { readCatalog: async () => Buffer.from(JSON.stringify(current)), readBundle,
      logger: { error: message => errors.push(message) } });
    assert.equal((await fetch(base + "catalog.json")).status, 503);
    assert.equal((await fetch(base + "bundle.json")).status, 503);
  }
  assert.equal(errors.length, 6);
});
