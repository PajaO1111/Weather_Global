import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createDroughtMiddleware, verifyDroughtArtifact } from "../scripts/drought-api.mjs";
const load = name => readFile(new URL(`../../data_samples/2026-11-06/drought-7d5/${name}`, import.meta.url));
async function serve(t, options) {
  const middleware = createDroughtMiddleware(options), server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}/weather_global/drought-api/v1/`;
}
test("drought API serves exact adapted ODbL database, verified headers and bodyless HEAD", async t => {
  const base = await serve(t), bytes = await load("drought_v1.json");
  const response = await fetch(base + "catalog.json"), catalog = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(verifyDroughtArtifact(catalog, bytes), bytes);
  assert.deepEqual(Buffer.from(await (await fetch(base + "bundle.json")).arrayBuffer()), bytes);
  for (const name of ["catalog.json", "bundle.json"]) {
    const head = await fetch(base + name, { method: "HEAD" });
    assert.equal(head.status, 200); assert.equal(await head.text(), "");
    assert.ok(Number(head.headers.get("content-length")) > 0);
  }
});
test("drought API rejects query, unknown path, write method and nonlocal Host", async t => {
  const base = await serve(t);
  assert.equal((await fetch(base + "bundle.json?")).status, 400);
  assert.equal((await fetch(base + "other.json")).status, 404);
  assert.equal((await fetch(base + "bundle.json", { method: "POST" })).status, 405);
  const status = await new Promise((resolve, reject) => {
    const req = request(base + "bundle.json", { headers: { Host: "remote.example" } }, res => { res.resume(); resolve(res.statusCode); });
    req.on("error", reject); req.end();
  });
  assert.equal(status, 403);
});
test("drought API logs fail-closed 503 on absent/corrupt or valid-checksum misleading science", async t => {
  const errors = [], catalog = JSON.parse(await load("catalog.json")), bundle = JSON.parse(await load("drought_v1.json"));
  bundle.scales[1].regions[0].points[0].dry = 0;
  const bytes = Buffer.from(JSON.stringify(bundle)), changed = structuredClone(catalog);
  changed.product.bytes = bytes.length; changed.product.sha256 = createHash("sha256").update(bytes).digest("hex");
  for (const [current, readBundle] of [
    [catalog, async () => Buffer.from("{}")], [catalog, async () => { throw new Error("Missing file"); }], [changed, async () => bytes],
  ]) {
    const base = await serve(t, { readCatalog: async () => Buffer.from(JSON.stringify(current)), readBundle,
      logger: { error: message => errors.push(message) } });
    for (const file of ["catalog.json", "bundle.json"]) assert.equal((await fetch(base + file)).status, 503);
  }
  assert.equal(errors.length, 6);
});
