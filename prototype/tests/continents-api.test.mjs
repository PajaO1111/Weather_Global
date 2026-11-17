import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createContinentsMiddleware, verifyContinentsArtifact } from "../scripts/continents-api.mjs";
import { continentIds, continentModels, continentScenarios } from "../src/continents-preview.js";

const localized = (cs, en) => ({ cs, en });

function model(sourceId, shift) {
  const rows = (first, last, offset = 0) => Array.from({ length: last - first + 1 }, (_unused, index) => ({
    date: String(first + index),
    value: (first + index) / 1000 + offset + shift,
    coverage: 0.95,
  }));
  return {
    source_id: sourceId,
    member: "r1i1p1f1",
    calendar: "noleap",
    baseline_temperature_K: 287 + shift,
    baseline_days: 10950,
    grid: { weighted_area_m2: 1e12 },
    historical: rows(1850, 2014),
    scenarios: Object.fromEntries(continentScenarios.map((scenario, index) => [
      scenario,
      rows(2015, 2100, index / 10),
    ])),
  };
}

function ranges(series) {
  return series[0].map((row, index) => ({
    date: row.date,
    min: Math.min(...series.map((item) => item[index].value)),
    max: Math.max(...series.map((item) => item[index].value)),
    model_count: 2,
  }));
}

function makeBundle() {
  const regions = continentIds.map((id, index) => {
    const models = continentModels.map((sourceId, modelIndex) => model(sourceId, index / 100 + modelIndex / 10));
    const range = {
      historical: ranges(models.map((item) => item.historical)),
      scenarios: Object.fromEntries(continentScenarios.map((scenario) => [
        scenario,
        ranges(models.map((item) => item.scenarios[scenario])),
      ])),
    };
    const common = {
      id,
      name: localized(id, id),
      status: id === "antarctica" ? "blocked-grounding" : "validated-local",
      publication_allowed: false,
      mask: {
        file: `${id}.geojson`,
        sha256: "b".repeat(64),
        version: "v2",
        area_m2: 1e12,
        grounding_line_verified: id !== "antarctica",
      },
      limitations: { cs: ["Lokálně."], en: ["Local."] },
    };
    if (id === "antarctica") return { ...common, models: [], range: null, history: null };
    const annual = Array.from({ length: 147 }, (_unused, idx) => ({
      date: String(1880 + idx),
      value: idx === 0 ? null : idx / 10,
      minimum_monthly_coverage: idx === 0 ? 0.5 : 0.95,
      source_months: 12,
      status: idx === 0 ? "missing" : "valid",
      missing_reasons: idx === 0 ? ["insufficient-spatial-coverage"] : [],
      absent_source_months: [],
      below_coverage_months: idx === 0 ? [1] : [],
    }));
    return {
      ...common,
      models,
      range,
      history: {
        status: "available",
        unit: "degC anomaly",
        baseline: [1981, 2010],
        baseline_offset_K: 287.1,
        annual,
        monthly_coverage: [{ date: "1880-01", coverage: 0.5 }],
        source: { id: "nasa" },
        usage_review: { status: "pending" },
      },
    };
  });
  return {
    schema_version: 1,
    version: "7c7-continental-temperatures-v1",
    publication_allowed: false,
    baseline: [1981, 2010],
    unit: "degC anomaly",
    regions,
    method: { cs: "Metoda", en: "Method" },
    sources: [{ id: "cmip6", name: localized("CMIP6", "CMIP6") }],
    legacy_comparison: { europe: { status: "legacy" } },
    source_review: { status: "reviewed" },
  };
}

function fixture() {
  const bundleBytes = Buffer.from(JSON.stringify(makeBundle()));
  const catalog = {
    schema_version: 1,
    version: "7c7-continental-catalog-v1",
    publication_allowed: false,
    product: {
      endpoint: "continents-api/v1/bundle.json",
      version: "7c7-continental-temperatures-v1",
      sha256: createHash("sha256").update(bundleBytes).digest("hex"),
      bytes: bundleBytes.length,
    },
    regions: makeBundle().regions.map(({ id, name, status }) => ({ id, name, status })),
    gates: [{ code: "local", cs: "Lokálně", en: "Local only" }],
  };
  return { bundleBytes, catalogBytes: Buffer.from(JSON.stringify(catalog)) };
}

function serve(readCatalog, readBundle, logger = { error() {} }) {
  const options = { logger };
  if (readCatalog) options.readCatalog = readCatalog;
  if (readBundle) options.readBundle = readBundle;
  const server = createServer(createContinentsMiddleware(options));
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    resolve({ server, origin });
  }));
}

async function get(origin, path, method = "GET") {
  const response = await fetch(`${origin}${path}`, { method });
  const text = await response.text();
  return { response, text };
}

test("verification checks exact bytes, pinned checksum, shape, and catalogue identity", () => {
  const { bundleBytes, catalogBytes } = fixture();
  const catalog = JSON.parse(catalogBytes);
  assert.equal(verifyContinentsArtifact(catalog, bundleBytes), bundleBytes);
  assert.throws(() => verifyContinentsArtifact(catalog, Buffer.from(`${bundleBytes} `)), /byte-length|checksum/);
  assert.throws(() => verifyContinentsArtifact({ ...catalog, regions: [] }, bundleBytes), /catalogue contract mismatch/);
});

test("API verifier accepts the current real generated artifacts and dynamic draft checksum", async () => {
  const catalogBytes = await readFile(new URL("../../data_samples/2026-11-06/continents-7c-completion/catalog.json", import.meta.url));
  const bundleBytes = await readFile(new URL("../../data_samples/2026-11-06/continents-7c-completion/continental_temperatures_v1.json", import.meta.url));
  const catalog = JSON.parse(catalogBytes);
  assert.equal(verifyContinentsArtifact(catalog, bundleBytes), bundleBytes);
  assert.equal(catalog.product.sha256, createHash("sha256").update(bundleBytes).digest("hex"));
});

test("default API readers serve the real generated catalogue and bundle", async () => {
  const bundleBytes = await readFile(new URL("../../data_samples/2026-11-06/continents-7c-completion/continental_temperatures_v1.json", import.meta.url));
  const { server, origin } = await serve();
  try {
    const catalogResponse = await fetch(`${origin}/weather_global/continents-api/v1/catalog.json`);
    assert.equal(catalogResponse.status, 200);
    const catalog = await catalogResponse.json();
    const bundleResponse = await fetch(`${origin}/weather_global/continents-api/v1/bundle.json`);
    assert.equal(bundleResponse.status, 200);
    assert.equal(bundleResponse.headers.get("content-length"), String(bundleBytes.length));
    const bundle = await bundleResponse.json();
    assert.equal(bundle.version, catalog.product.version);
  } finally {
    server.close();
  }
});

test("middleware serves only loopback GET/HEAD allowlisted endpoints without caching", async () => {
  const { bundleBytes, catalogBytes } = fixture();
  const { server, origin } = await serve(async () => catalogBytes, async () => bundleBytes);
  try {
    const catalogResult = await get(origin, "/weather_global/continents-api/v1/catalog.json");
    assert.equal(catalogResult.response.status, 200);
    assert.equal(catalogResult.response.headers.get("cache-control"), "no-store");
    assert.deepEqual(JSON.parse(catalogResult.text).regions.map((region) => region.id), continentIds);

    const bundleResult = await get(origin, "/continents-api/v1/bundle.json");
    assert.equal(bundleResult.response.status, 200);
    assert.equal(JSON.parse(bundleResult.text).regions.length, 7);

    const head = await get(origin, "/continents-api/v1/bundle.json", "HEAD");
    assert.equal(head.response.status, 200);
    assert.equal(head.text, "");
    assert.equal(head.response.headers.get("content-length"), String(bundleBytes.length));

    assert.equal((await get(origin, "/continents-api/v1/bundle.json?x=1")).response.status, 400);
    assert.equal((await get(origin, "/continents-api/v1/unknown.json")).response.status, 404);
    const post = await fetch(`${origin}/continents-api/v1/bundle.json`, { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
  } finally {
    server.close();
  }
});

test("missing and corrupt artifacts fail closed with structured 503 responses", async () => {
  const { bundleBytes, catalogBytes } = fixture();
  const errors = [];
  const { server, origin } = await serve(async () => catalogBytes, async () => {
    throw new Error("fixture unavailable");
  }, { error: (message) => errors.push(message) });
  try {
    const result = await get(origin, "/continents-api/v1/bundle.json");
    assert.equal(result.response.status, 503);
    assert.deepEqual(JSON.parse(result.text), { error: "Verified local continental data unavailable." });
    const head = await get(origin, "/continents-api/v1/bundle.json", "HEAD");
    assert.equal(head.response.status, 503);
    assert.equal(head.text, "");
    assert.equal(errors.length, 2);
  } finally {
    server.close();
  }

  const corrupt = await serve(async () => catalogBytes, async () => Buffer.from(`${bundleBytes} `));
  try {
    const result = await get(corrupt.origin, "/continents-api/v1/bundle.json");
    assert.equal(result.response.status, 503);
    assert.match(result.text, /Verified local continental data unavailable/);
  } finally {
    corrupt.server.close();
  }
});
