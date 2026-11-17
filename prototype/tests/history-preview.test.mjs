import test from "node:test";
import assert from "node:assert/strict";
import { validateHistoryPreview } from "../src/history-preview.js";

function fixture() {
  const monthly_coverage = Array.from({ length: 1761 }, (_, i) => ({
    date: `${1880 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}`,
    coverage: i < 14 * 12 ? 0.8 : 0.96, valid: i >= 14 * 12,
  }));
  const annual = Array.from({ length: 147 }, (_, i) => ({
    date: String(1880 + i), value: i >= 14 && i < 146 ? i / 100 : null,
    status: i >= 14 && i < 146 ? "valid" : "missing",
    missing_reasons: i < 14 ? ["insufficient-spatial-coverage"] : i === 146 ? ["incomplete-source-year"] : [],
    minimum_monthly_coverage: i < 14 ? 0.8 : 0.96, source_months: i === 146 ? 9 : 12,
    absent_source_months: i === 146 ? [10, 11, 12] : [],
    below_coverage_months: i < 14 ? Array.from({ length: 12 }, (_, j) => j + 1) : [],
  }));
  return {
    schema_version: 1, version: "7c4c-europe-nasa-history-v1",
    status: "local-observation-derived-history-not-public-release",
    series_type: "observation-derived-gridded-analysis", unit: "degC anomaly", calendar: "standard",
    baseline: { years: [1981, 2010] }, coverage: { threshold: 0.9 },
    mask: { version: "europe-kuma-manych-cyprus-v1", sha256: "a".repeat(64) },
    source: { sha256: "b".repeat(64) },
    provenance: { audit_sha256: "c".repeat(64), pilot_sha256: "d".repeat(64) },
    attribution: "NASA GISS", usage_review: {
      status: "official-product-use-and-citation-verification-required-before-publication",
    },
    source_period: { first_month: "1880-01", last_month: "2026-09" },
    summary: { annual_count: 147, valid_count: 132, missing_count: 15,
      valid_years: Array.from({ length: 132 }, (_, i) => 1894 + i) },
    annual, monthly_coverage,
  };
}

test("NASA history preserves full year axis, explicit gaps and coverage diagnostics", () => {
  assert.equal(validateHistoryPreview(fixture()), true);
});

test("NASA history rejects fabricated gaps/values, false coverage and changed scientific identity", () => {
  for (const mutate of [
    (data) => { data.annual[0].value = 0; },
    (data) => { data.annual[146].status = "valid"; },
    (data) => { data.annual[146].absent_source_months = []; },
    (data) => { data.annual[0].missing_reasons = []; },
    (data) => { data.annual[15].value = Infinity; },
    (data) => { data.annual[0].minimum_monthly_coverage = 0.99; },
    (data) => { data.annual.pop(); },
    (data) => { data.monthly_coverage[0].valid = true; },
    (data) => { data.monthly_coverage[0].coverage = null; },
    (data) => { data.baseline.years = [1991, 2020]; },
    (data) => { data.series_type = "model"; },
    (data) => { data.unit = "K"; },
    (data) => { data.provenance.audit_sha256 = ""; },
  ]) {
    const data = fixture();
    mutate(data);
    assert.equal(validateHistoryPreview(data), false);
  }
});
