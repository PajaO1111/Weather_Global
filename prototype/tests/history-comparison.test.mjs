import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  historyComparisonRows,
  historyRegionIds,
  historySymmetricExtent,
  validateHistoryComparisonBundle,
  validateHistoryComparisonCatalog,
} from "../src/history-comparison.js";

const catalogPath = new URL("../../data_samples/2026-11-06/continents-history-7c8/catalog.json", import.meta.url);
const bundlePath = new URL("../../data_samples/2026-11-06/continents-history-7c8/history_comparison_v1.json", import.meta.url);

async function realArtifacts() {
  const [catalogBytes, bundleBytes] = await Promise.all([readFile(catalogPath), readFile(bundlePath)]);
  return {
    catalogBytes,
    bundleBytes,
    catalog: JSON.parse(catalogBytes),
    bundle: JSON.parse(bundleBytes),
  };
}

test("real catalogue and bundle satisfy the bilingual v1 contract and pinned bytes", async () => {
  const { catalog, bundle, bundleBytes } = await realArtifacts();
  assert.equal(validateHistoryComparisonCatalog(catalog), true);
  assert.equal(validateHistoryComparisonBundle(bundle), true);
  assert.equal(catalog.product.bytes, bundleBytes.length);
  assert.equal(catalog.product.sha256, createHash("sha256").update(bundleBytes).digest("hex"));
  assert.equal(bundle.publication_allowed, false);
  assert.deepEqual(bundle.common_period, {
    start: 1926,
    end: 2025,
    regions: historyRegionIds.slice(0, 6),
  });
  assert.deepEqual(bundle.regions.map(({ id }) => id), historyRegionIds);
  for (const region of bundle.regions) {
    assert.equal(region.conservative.summary.valid_count,
      region.conservative.annual.filter((point) => point.value !== null).length);
    assert.equal(region.exploratory.summary.valid_count,
      region.exploratory.annual.filter((point) => point.value !== null).length);
  }
  assert.equal(bundle.regions.at(-1).status, "provisional-geography");
  assert.ok(bundle.regions.at(-1).conservative.annual.every((point) =>
    point.value === null && point.status === "blocked-geography"));
  assert.ok(bundle.regions.every((region) => region.conservative.annual.at(-1).value === null
    && region.exploratory.annual.at(-1).value === null));
  assert.ok(bundle.validation.temporal_two_month_holdout.count > 0);
  assert.ok(bundle.validation.spatial_holdout.mae_degC > 0);
});

test("validator rejects false release, source, geography, coverage, holdout and provenance claims", async () => {
  const { catalog, bundle } = await realArtifacts();
  for (const mutate of [
    (value) => { value.publication_allowed = true; },
    (value) => { value.source.url = "https://example.invalid/nasa"; },
    (value) => { value.methods.conservative.en = "Raw direct measurements only."; },
    (value) => { value.methods.exploratory.en += " Extrapolation beyond the regional record is included."; },
    (value) => { value.common_period.start = 1925; },
    (value) => { value.regions[0].geometry = { type: "Point" }; },
    (value) => { value.regions[0].conservative.annual[10].coverage += 0.1; },
    (value) => { value.regions[0].conservative.annual[0].source_coverage = 1.01; },
    (value) => { value.regions[0].conservative.annual.at(-1).value = 0; },
    (value) => { value.regions[0].conservative.summary.valid_count -= 1; },
    (value) => { value.regions.at(-1).conservative.annual[0].value = 0; },
    (value) => { value.regions.at(-1).status = "validated-local"; },
    (value) => { value.validation.temporal_two_month_holdout.count = -1; },
    (value) => { value.provenance.implementation_sha256 = "not-a-hash"; },
  ]) {
    const invalid = structuredClone(bundle);
    mutate(invalid);
    assert.equal(validateHistoryComparisonBundle(invalid), false);
  }
  for (const mutate of [
    (value) => { value.publication_allowed = true; },
    (value) => { value.product.endpoint = "https://example.invalid/bundle.json"; },
    (value) => { value.regions[0].id = "asia"; },
    (value) => { value.regions.pop(); },
  ]) {
    const invalid = structuredClone(catalog);
    mutate(invalid);
    assert.equal(validateHistoryComparisonCatalog(invalid), false);
  }
});

test("view helpers preserve common-period boundaries, region exclusion and symmetric colour limits", async () => {
  const { bundle } = await realArtifacts();
  const rows = historyComparisonRows(bundle, "conservative", "common_period");
  const expectedCommonRows = bundle.regions.slice(0, 6).reduce((count, region) =>
    count + region.conservative.annual.filter((point) => Number(point.date) >= bundle.common_period.start
      && Number(point.date) <= bundle.common_period.end).length, 0);
  assert.equal(rows.length, expectedCommonRows);
  assert.ok(rows.every((point) => Number(point.date) >= 1926 && Number(point.date) <= 2025));
  assert.equal(rows.some((point) => point.region_id === "antarctica"), false);
  const expectedAllRows = bundle.regions.reduce((count, region) => count + region.conservative.annual.length, 0);
  assert.equal(historyComparisonRows(bundle, "conservative", "all_available").length, expectedAllRows);
  assert.equal(historyComparisonRows(bundle, "invalid", "all_available").length, 0);
  assert.equal(historySymmetricExtent([{ value: -2 }, { value: 3 }, { value: null }]), 3);
  assert.equal(historySymmetricExtent([{ value: null }]), 1);
});

test("hash metadata wraps within the mobile panel width", async () => {
  const [view, stylesheet] = await Promise.all([
    readFile(new URL("../src/history-comparison-view.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(view, /class="history-comparison-hash"[^>]*>[\s\S]*catalog\.product\.sha256/);
  assert.match(stylesheet, /\.history-comparison-hash\s*\{[^}]*overflow-wrap:\s*anywhere\s*;/);
});

test("historical comparison chart labels use the atlas light foreground", async () => {
  const view = await readFile(new URL("../src/history-comparison-view.js", import.meta.url), "utf8");
  assert.doesNotMatch(view, /\btitle:\s*\{\s*text:\s*`\$\{text\.mapHeading\}/);
  assert.match(view, /visualMap:\s*\{[\s\S]*?textStyle:\s*\{\s*color:\s*"#a7b9cc"\s*\}/);
  assert.match(view, /xAxis:\s*\{[\s\S]*?nameTextStyle:\s*\{\s*color:\s*"#a7b9cc"\s*\}[\s\S]*?axisLabel:\s*\{\s*color:\s*"#a7b9cc"\s*\}/);
  assert.match(view, /yAxis:\s*\{[\s\S]*?nameTextStyle:\s*\{\s*color:\s*"#a7b9cc"\s*\}[\s\S]*?axisLabel:\s*\{\s*color:\s*"#a7b9cc"\s*\}/);
});
