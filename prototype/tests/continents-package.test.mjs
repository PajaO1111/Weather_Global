/* The offline candidate must retain its safety gates and complete file identity. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const completion = fileURLToPath(new URL("../../data_samples/2026-11-06/continents-7c-completion/", import.meta.url));
const digest = value => createHash("sha256").update(value).digest("hex");

test("staged candidate, when present, has exact immutable inventory and no private data", async t => {
  let manifest;
  const candidate = join(completion, "manual-review-candidate");
  try {
    manifest = JSON.parse(await readFile(join(candidate, "manifest.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    t.skip("Manual-review staging is not present; never generate it as a side effect of testing.");
    return;
  }
  assert.equal(manifest.publication_allowed, false);
  assert.equal(manifest.status, "manual-review-candidate-not-authorised-for-publication");
  const listed = new Set(manifest.files.map(row => row.file));
  assert.equal(listed.size, manifest.files.length);
  const discovered = [];
  async function collect(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.equal(entry.isSymbolicLink(), false);
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await collect(join(directory, entry.name), `${path}/`);
      else if (path !== "manifest.json") discovered.push(path);
    }
  }
  await collect(candidate);
  assert.deepEqual([...listed].sort(), discovered.sort());
  for (const row of manifest.files) {
    assert.ok(!/(^|\/)(config\.php|storage|\.env|.*\.nc|.*\.gz|.*\.npz)(\/|$)/i.test(row.file), row.file);
    assert.ok(!row.file.includes("..") && !row.file.startsWith("/"));
    const bytes = await readFile(join(candidate, ...row.file.split("/")));
    assert.equal(bytes.length, row.bytes, row.file);
    assert.equal(digest(bytes), row.sha256, row.file);
  }
  const catalog = JSON.parse(await readFile(join(candidate, "weather_global", "continents-api", "v1", "catalog.json"), "utf8"));
  const bytes = await readFile(join(candidate, "weather_global", "continents-api", "v1", "bundle.json"));
  assert.equal(catalog.product.sha256, digest(bytes));
  assert.equal(manifest.product_sha256, digest(bytes));
});
