/* ====================================================
   CLIMATE API CONTRACT TESTS
   Protects compatibility with the prototype and phase 6 releases.
   ==================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateClimateSnapshot,
  validateOceanSnapshot,
} from "../src/climate-data.js";

const series = { co2: [{}], temperature: [{}], roni: [{}] };
const band = (firstYear, count, members = 19) => Array.from({ length: count }, (_, index) => ({
  date: String(firstYear + index),
  minimum: -0.5,
  median: 0.2,
  maximum: 1.1,
  members,
}));
const ensemble = (commit) => {
  const members = Array.from({ length: 19 }, (_, index) => `Model-${index}|r1i1p1f1`);
  return {
    schema_version: 1,
    commit,
    reference_period: "1850-1900",
    reference_months: 612,
    model_count: members.length,
    available_common_member_count: 29,
    members,
    excluded_members: Array.from({ length: 10 }, (_, index) => ({
      member: `Excluded-${index}|r1i1p1f1`,
      reason: "historical coverage is incomplete",
    })),
    baseline_units: "degC absolute tas mean",
    baseline_means: Object.fromEntries(members.map((member) => [member, 13.5])),
    source_manifest_sha256: "a".repeat(64),
    historical: band(1850, 165),
    scenarios: Object.fromEntries(
      ["ssp126", "ssp245", "ssp370", "ssp585"].map((id) => [id, band(2015, 86)]),
    ),
  };
};
const snapshot = () => ({
  snapshot: "2026-11-04",
  commit: "ed29da33d38ae767d19caafd4cde06042cbe00f4",
  series,
  projections: [{ model: "legacy", scenario: "ssp245", points: [{ date: "2015", value: 0.1 }] }],
});
const monthDate = (offset) => {
  const date = new Date(Date.UTC(1850, offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};
const oceanMetadata = Object.fromEntries(["sst", "ohc", "gmsl"].map((id) => [id, {
  provider: "Verified provider",
  product: "Verified product",
  version: "1",
  unit: id === "sst"
    ? "°C anomaly"
    : id === "ohc"
      ? "ZJ (converted from 10²² J; 1 source unit = 10 ZJ)"
      : "mm sea-level anomaly",
  baseline: "Documented product reference",
  geography: "Global",
  cadence: "Native source cadence",
  citation: "Provider citation",
  license: "Provider terms",
  license_url: "https://example.test/license",
  data_url: "https://example.test/data",
  documentation_url: "https://example.test/docs",
  uncertainty: "Source definition",
  ...(id === "gmsl" ? { corrections: "Source correction" } : {}),
  ...(id === "ohc" ? { source_unit: "10²² J" } : {}),
}]));
const oceans = () => ({
  schema_version: 1,
  metadata: oceanMetadata,
  series: {
    sst: Array.from({ length: 2000 }, (_, index) => ({
      date: monthDate(index),
      value: 0.1,
      total_uncertainty: 0.05,
    })),
    ohc: [
      {
        date: "2005-Q1",
        year: 2005,
        quarter: 1,
        source_time: 2005.125,
        value: 89.73,
        source_value_1e22_j: 8.973,
        standard_error: 12.92,
        source_standard_error_1e22_j: 1.292,
      },
      {
        date: "2005-Q2",
        year: 2005,
        quarter: 2,
        source_time: 2005.375,
        value: 90,
        source_value_1e22_j: 9,
        standard_error: 10,
        source_standard_error_1e22_j: 1,
      },
    ],
    gmsl: {
      source_version: "RADS 4.7.1",
      source_generated_at: "2025-02-19T19:57:10Z",
      points: [
        "topex-poseidon",
        "jason-1",
        "jason-2",
        "jason-3",
        "sentinel-6mf",
      ].map((platform, index) => ({
        date: "2025-02-16",
        year: 2025,
        source_time: 2025.1268 + index * 0.01,
        platform,
        value: 80 + index,
      })),
    },
  },
});

test("the API contract continues to accept the current two-model release", () => {
  assert.equal(validateClimateSnapshot(snapshot()), true);
});

test("the API contract accepts complete historical and four-scenario ranges", () => {
  const data = snapshot();
  data.projection_ensemble = ensemble(data.commit);
  assert.equal(validateClimateSnapshot(data), true);
});

test("legacy snapshots remain valid until a 7A release is published", () => {
  assert.equal(validateClimateSnapshot(snapshot()), true);
});

test("the API contract validates complete native-cadence ocean series", () => {
  const data = oceans();
  assert.equal(validateOceanSnapshot(data), true);
  const climate = snapshot();
  climate.oceans = data;
  assert.equal(validateClimateSnapshot(climate), true);
});

test("older ocean payloads remain valid when provider license URLs are absent", () => {
  const data = oceans();
  for (const metadata of Object.values(data.metadata)) {
    delete metadata.license_url;
  }
  assert.equal(validateOceanSnapshot(data), true);
});

test("the API contract rejects missing periods, sentinels, and malformed ocean schema", () => {
  const data = oceans();
  data.series.sst[1].date = "1850-03";
  assert.equal(validateOceanSnapshot(data), false);

  const sentinel = oceans();
  sentinel.series.sst[0].value = "***";
  assert.equal(validateOceanSnapshot(sentinel), false);

  const missingQuarter = oceans();
  missingQuarter.series.ohc[1].date = "2005-Q3";
  assert.equal(validateOceanSnapshot(missingQuarter), false);

  const wrongUnit = oceans();
  wrongUnit.metadata.ohc.unit = "°C";
  assert.equal(validateOceanSnapshot(wrongUnit), false);
  const missingCorrections = oceans();
  delete missingCorrections.metadata.gmsl.corrections;
  assert.equal(validateOceanSnapshot(missingCorrections), false);
  const incorrectQuarter = oceans();
  incorrectQuarter.series.ohc[0].source_time = 2005.5;
  assert.equal(validateOceanSnapshot(incorrectQuarter), false);

  const invalidClimate = snapshot();
  invalidClimate.oceans = { schema_version: 1 };
  assert.equal(validateClimateSnapshot(invalidClimate), false);
});

test("the API contract rejects missing years and malformed model ranges", () => {
  const data = snapshot();
  data.projection_ensemble = ensemble(data.commit);
  data.projection_ensemble.historical = band(1850, 164);
  assert.equal(validateClimateSnapshot(data), false);
  data.projection_ensemble.historical = band(1850, 165);
  data.projection_ensemble.scenarios.ssp245[0].minimum = 2;
  assert.equal(validateClimateSnapshot(data), false);
});
