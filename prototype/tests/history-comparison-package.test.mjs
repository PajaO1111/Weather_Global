import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = join(root, "data_samples", "2026-11-06", "continents-history-7c8");
const candidate = join(source, "manual-review-candidate");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

async function files(directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false);
    const path = join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await files(path));
    else rows.push(relative(candidate, path).split(sep).join("/"));
  }
  return rows.sort();
}

test("two-view manual candidate contains exact products and no private backend files", {
  skip: !existsSync(join(candidate, "manifest.json")),
}, async () => {
  const manifest = JSON.parse(await readFile(join(candidate, "manifest.json"), "utf8"));
  assert.equal(manifest.publication_allowed, false);
  assert.deepEqual(await files(candidate), [...manifest.files.map(row => row.file), "manifest.json"].sort());
  for (const row of manifest.files) {
    assert.equal(/(?:^|\/)(?:private|storage|config\.php|config\.example\.php|logs)(?:\/|$)/i.test(row.file), false);
    assert.equal(/\.(?:nc|npz|gz|zip)$/i.test(row.file), false);
    const path = resolve(candidate, row.file);
    assert.ok(path.startsWith(`${candidate}${sep}`));
    const bytes = await readFile(path);
    assert.equal(bytes.length, row.bytes);
    assert.equal(digest(bytes), row.sha256);
  }
  const api = join(candidate, "weather_global", "history-comparison-api", "v1");
  const bytes = await readFile(join(api, "bundle.json"));
  const catalog = JSON.parse(await readFile(join(api, "catalog.json"), "utf8"));
  assert.equal(catalog.product.sha256, digest(bytes));
  assert.equal(catalog.product.bytes, bytes.length);
  assert.deepEqual(bytes, await readFile(join(source, "history_comparison_v1.json")));
  const publicRoot = join(candidate, "weather_global");
  for (const family of ["europe-api", "continents-api"]) {
    assert.ok(existsSync(join(publicRoot, family, "v1", "catalog.json")));
  }
});
