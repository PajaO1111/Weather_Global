import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostingProducts, prepareHostingProduct, packageHostingProducts, hash } from "../scripts/hosting-products.mjs";
import { validPublicationState, publicReleaseVersion } from "../src/public-release.js";

test("public metadata requires the approved release version and original checksum", () => {
  assert.equal(validPublicationState({ publication_allowed: false }), true);
  for (const value of [null, {}, { publication_allowed: true },
    { publication_allowed: true, public_release: { version: "other", source_sha256: "a".repeat(64) } },
    { publication_allowed: true, public_release: { version: publicReleaseVersion, source_sha256: "" } }]) {
    assert.equal(validPublicationState(value), false);
  }
});

for (const definition of hostingProducts) {
  test(`${definition.api}: public packaging preserves every scientific value and archived bytes`, async () => {
    const sourcePath = new URL(`../../data_samples/2026-11-06/${definition.directory}/${definition.file}`, import.meta.url);
    const before = await readFile(sourcePath);
    const product = await prepareHostingProduct(definition);
    const bundle = JSON.parse(product.bundleBytes);
    const catalog = JSON.parse(product.catalogBytes);
    assert.equal(bundle.publication_allowed, true);
    assert.equal(catalog.publication_allowed, true);
    assert.equal(bundle.public_release.source_sha256, hash(before));
    assert.equal(catalog.product.bytes, product.bundleBytes.length);
    assert.equal(catalog.product.sha256, hash(product.bundleBytes));
    const original = JSON.parse(before);
    delete bundle.public_release;
    bundle.publication_allowed = false;
    if (definition.api === "continents-api") {
      assert.equal(bundle.regions.find(region => region.id === "antarctica").publication_allowed, false);
      for (const region of bundle.regions) region.publication_allowed = false;
    }
    assert.equal(JSON.stringify(bundle), JSON.stringify(original));
    assert.deepEqual(await readFile(sourcePath), before);
    const invalid = { ...catalog, publication_allowed: true, public_release: { version: "unapproved", source_sha256: "a".repeat(64) } };
    assert.throws(() => definition.verify(invalid, product.bundleBytes));
    assert.throws(() => definition.verify(catalog, Buffer.concat([product.bundleBytes, Buffer.from(" ")])));
    assert.throws(() => definition.verify({ ...catalog, publication_allowed: false, public_release: undefined }, product.bundleBytes));
  });
}

test("hosting package contains every public catalogue and bundle, licence offer and checked manifest, not private files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "weather-global-hosting-test-"));
  try {
    await packageHostingProducts(directory);
    const manifest = JSON.parse(await readFile(join(directory, "release-manifest.json")));
    assert.equal(manifest.publication_allowed, true);
    assert.equal(manifest.apis.length, 9);
    for (const definition of hostingProducts) {
      for (const file of ["catalog.json", "bundle.json", ".htaccess"]) {
        assert.ok(manifest.files.some(row => row.file === `${definition.api}/v1/${file}`));
      }
    }
    for (const row of manifest.files) {
      assert.doesNotMatch(row.file, /(^|\/)(storage|config\.php|sources|node_modules)(\/|$)/);
      const bytes = await readFile(join(directory, row.file));
      assert.equal(bytes.length, row.bytes);
      assert.equal(hash(bytes), row.sha256);
    }
    const attribution = await readFile(join(directory, "attribution.txt"), "utf8");
    assert.match(attribution, /ODbL 1\.0/);
    assert.match(attribution, /drought-api\/v1\/bundle\.json/);
    assert.match(attribution, /CC BY-SA 4\.0/);
    assert.match(attribution, /NASA/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
