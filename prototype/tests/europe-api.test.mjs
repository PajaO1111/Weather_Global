import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { createHash } from "node:crypto";
import { europeCatalog, legacyEuropeGeographyWarning, validateEuropeCatalog } from "../src/europe-api.js";
import { createEuropeMiddleware, verifyEuropeArtifact } from "../scripts/europe-api.mjs";

test("catalogue keeps three source identities and publication gates separate", () => {
  assert.equal(validateEuropeCatalog(structuredClone(europeCatalog)), true);
  assert.deepEqual(europeCatalog.products.map((p) => p.id), ["cmip6", "history", "cds"]);
  for (const product of europeCatalog.products) {
    assert.equal(product.publication_allowed, false);
    assert.ok(product.publication_gates.length);
    assert.match(product.sha256, /^[a-f0-9]{64}$/);
    for (const field of ["title", "geography", "measure", "scope", "interpretation"]) {
      assert.ok(product[field].cs && product[field].en);
    }
  }
  assert.equal(europeCatalog.products[1].license, null);
  for (const mutate of [
    (c) => { c.publication_allowed = true; },
    (c) => { c.products[0].publication_gates = []; },
    (c) => { c.products[1].license = "CC-BY-SA-4.0"; },
    (c) => { c.products[2].endpoint = "https://example.com/data"; },
    (c) => { c.products.pop(); },
  ]) {
    const changed = structuredClone(europeCatalog);
    mutate(changed);
    assert.equal(validateEuropeCatalog(changed), false);
  }
});

test("legacy custom-Europe results require recomputation without changing source bytes or CDS geography", () => {
  for (const id of ["cmip6", "history"]) {
    const product = europeCatalog.products.find((p) => p.id === id);
    assert.equal(product.geography_status, "invalid-legacy-mask-requires-recomputation");
    assert.deepEqual(product.geography_warning, legacyEuropeGeographyWarning);
    assert.ok(product.publication_gates.some((g) => g.code === "legacy-mask-geography-recomputation"));
    assert.ok(product.geography_warning.cs.includes("severní Afriky"));
    assert.ok(product.geography_warning.en.includes("North Africa"));
  }
  const cds = europeCatalog.products.find((p) => p.id === "cds");
  assert.equal(cds.geography_warning, undefined);
  assert.equal(cds.sha256, "0aee1c1d7617657451ea624be7206b73d43878d0ea43aa630bdeac278a76132f");
  assert.equal(europeCatalog.products[0].sha256, "ef75363408e5ad65cd14e20cf94be156ab139fc384f121415a489460f7cfb5f9");
  assert.equal(europeCatalog.products[1].sha256, "6798265e06d8e140452ed63bf9a5fdbe414aa039c3ffc7f9eb46f23926cfac70");
  const changed = structuredClone(europeCatalog);
  changed.products[0].geography_warning.en = "Validated";
  assert.equal(validateEuropeCatalog(changed), false);
});

test("artifact delivery requires both exact bytes and valid scientific contract", () => {
  const bytes = Buffer.from('{"valid":true}');
  const product = { sha256: createHash("sha256").update(bytes).digest("hex") };
  assert.equal(verifyEuropeArtifact(product, bytes, (data) => data.valid === true), bytes);
  assert.throws(() => verifyEuropeArtifact(product, Buffer.from("{}"), () => true), /checksum/);
  assert.throws(() => verifyEuropeArtifact(product, bytes, () => false), /contract/);
});

test("HTTP API enforces loopback, methods, allowlist, no-store and explicit errors", async (t) => {
  const errors = [];
  let corrupt = false;
  const middleware = createEuropeMiddleware({
    logger: { error: (message) => errors.push(message) },
    readArtifact: async () => {
      if (corrupt) return Buffer.from("{}");
      throw new Error("Missing test artifact");
    },
  });
  const server = createServer((request, response) => middleware(request, response, () => {
    response.statusCode = 404;
    response.end("Not found");
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const catalog = await fetch(`${origin}/weather_global/europe-api/v1/catalog.json`);
  assert.equal(catalog.status, 200);
  assert.equal(catalog.headers.get("cache-control"), "no-store");
  assert.equal(catalog.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await catalog.json(), europeCatalog);
  const head = await fetch(`${origin}/europe-api/v1/catalog.json`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const post = await fetch(`${origin}/europe-api/v1/catalog.json`, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  const nonlocalHostStatus = await new Promise((resolve, reject) => {
    const probe = request(`${origin}/europe-api/v1/catalog.json`, { headers: { Host: "remote.example" } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    probe.on("error", reject);
    probe.end();
  });
  assert.equal(nonlocalHostStatus, 403);
  assert.equal((await fetch(`${origin}/europe-api/v1/catalog.json?dataset=climate`)).status, 400);
  assert.equal((await fetch(`${origin}/europe-api/v1/unknown.json`)).status, 404);
  assert.equal((await fetch(`${origin}/europe-api/v2/catalog.json`)).status, 404);
  assert.equal((await fetch(`${origin}/api.php?dataset=climate`)).status, 404);
  for (const path of ["europe-api/v1/cmip6.json", "europe-api/v1/history.json", "europe-api/v1/cds.json",
    "cmip6-preview.json", "history-preview.json", "cds-preview.json"]) {
    const response = await fetch(`${origin}/weather_global/${path}`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Verified local European product unavailable." });
  }
  assert.equal(errors.length, 6);
  corrupt = true;
  assert.equal((await fetch(`${origin}/europe-api/v1/history.json`)).status, 503);
  const invalidHead = await fetch(`${origin}/europe-api/v1/history.json`, { method: "HEAD" });
  assert.equal(invalidHead.status, 503);
  assert.equal(await invalidHead.text(), "");
  assert.equal(errors.length, 8);
  assert.match(errors[7], /checksum/);
});
