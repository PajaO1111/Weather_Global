import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { boundedBody, outputDirectory, requests, sha256 } from '../scripts/audit_7d_sources.mjs';

test('7D archive bounds reject empty and excessive bodies', async () => {
  assert.equal((await boundedBody(new Response('abcd'), 4)).toString(), 'abcd');
  await assert.rejects(boundedBody(new Response('abcde'), 4), /exceeds/);
  await assert.rejects(boundedBody(new Response(''), 4), /Empty/);
});

test('7D source list includes all 24 sea ice CSVs with unique bounded public requests', () => {
  assert.equal(new Set(requests.map(request => request.file)).size, requests.length);
  assert.equal(requests.filter(request => /^[NS]_\d\d_extent_v4\.0\.csv$/.test(request.file)).length, 24);
  for (const request of requests) {
    assert.equal(new URL(request.url).protocol, 'https:');
    assert.ok(request.maxBytes > 0 && request.maxBytes <= 30_000_000);
    assert.ok(!request.file.includes('/') && !request.file.includes('\\'));
  }
});

test('7D evidence registry preserves gates rather than treating HTTP 200 as numerical validation', async () => {
  const registry = JSON.parse(await readFile(resolve(outputDirectory, 'product-registry.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(resolve(outputDirectory, 'source-manifest.json'), 'utf8'));
  const inspection = JSON.parse(await readFile(resolve(outputDirectory, 'sample-inspection.json'), 'utf8'));
  assert.equal(registry.publication_ready, false);
  assert.equal(registry.products.length, 8);
  assert.equal(registry.next_phase.id, '7D.1');
  assert.equal(inspection.source_manifest_sha256,
    sha256(await readFile(resolve(outputDirectory, 'source-manifest.json'))));
  assert.equal(inspection.inspector_sha256,
    sha256(await readFile(new URL('../scripts/inspect_7d_samples.py', import.meta.url))));
  for (const product of registry.products) {
    assert.ok(product.source_page.startsWith('https:'));
    assert.ok(product.remaining_before_release.length > 0);
    assert.ok(product.licence.status);
  }
  const byId = Object.fromEntries(registry.products.map(product => [product.id, product]));
  assert.equal(byId['sea-ice-extent'].status, 'ready_for_local_implementation');
  assert.notEqual(byId['ice-sheet-mass'].status, 'ready_for_local_implementation');
  assert.notEqual(byId['drought-spei'].status, 'ready_for_local_implementation');
  assert.notEqual(byId['carbon-emissions'].status, 'ready_for_local_implementation');
  const carbon = manifest.sources.find(source => source.file === 'gcb-global.xlsx');
  assert.match(carbon.content_type, /text\/html/);
  assert.notEqual(carbon.bytes, byId['carbon-emissions'].expected_file.bytes);
  assert.equal(inspection.carbon_budget.status, 'consent_page_not_spreadsheet');
  assert.equal(inspection.spei.status, 'partial_header_only_not_numeric_validation');
});
