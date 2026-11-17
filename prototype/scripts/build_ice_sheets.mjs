import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { iceSheetDirectory } from "./archive_ice_sheets.mjs";
import {
  iceSheetApiBase, iceSheetVersion, iceSheetRegions, iceSheetChartUrl,
  iceSheetMissionGap, validIceSheetSourceDate, validateIceSheetBundle,
} from "../src/ice-sheets.js";

export { iceSheetDirectory };
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const pad = value => String(value).padStart(2, "0");

export function parseIceSheetChart(chart, id) {
  const expected = iceSheetRegions.find(region => region.id === id);
  if (!expected || chart?.chart_id !== expected.chart_id || chart.chart?.category !== expected.category
    || chart.chart.abbr_units !== "Gt" || chart.margin_displayed !== true
    || chart.chart.source_url !== `https://cmr.earthdata.nasa.gov/virtual-directory/collections/${expected.collection}/temporal/2002/04/01`
    || chart.chart.uncertainties !== "" || !Array.isArray(chart.items) || chart.items.length !== 260) {
    throw new Error(`Unexpected public ice chart identity: ${id}`);
  }
  const points = [];
  const ids = new Set();
  let previousTime = -Infinity;
  for (const item of chart.items) {
    const date = `${item.year}-${pad(item.month)}`;
    const sourceDate = `${date}-${pad(item.day)}`;
    if (!Number.isInteger(item.year) || !Number.isInteger(item.month) || !Number.isInteger(item.day)
      || !validIceSheetSourceDate(sourceDate) || date < "2002-04" || date > "2026-07"
      || !Number.isFinite(item.x) || item.x <= previousTime || !Number.isInteger(item.id)
      || item.units !== "Gt" || item.status !== 1
      || JSON.stringify(item.category_titles) !== JSON.stringify([expected.category])) {
      throw new Error(`Invalid chart source record/date/time ${id}/${sourceDate}`);
    }
    if (ids.has(item.id)) throw new Error(`Duplicate chart source record ${id}/${date}`);
    if (item.y === null) {
      if (item.y_margin_min !== null || item.y_margin_max !== null || date !== "2017-12") {
        throw new Error(`Unexpected null chart record ${id}/${date}`);
      }
    } else if (![item.y, item.y_margin_min, item.y_margin_max].every(Number.isFinite)
      || item.y_margin_min > item.y || item.y_margin_max < item.y || iceSheetMissionGap(date)) {
      throw new Error(`Invalid chart source bounds ${id}/${date}`);
    }
    const present = item.y !== null;
    points.push({
      date: sourceDate, value: item.y, lower: item.y_margin_min, upper: item.y_margin_max,
      source_time: item.x, source_id: item.id,
      mission: present ? date <= "2017-06" ? "GRACE" : "GRACE-FO" : null,
      reason: present ? null : "between-missions",
    });
    ids.add(item.id);
    previousTime = item.x;
  }
  return { points, chart_updated: chart.chart.updated_at };
}

export async function buildIceSheetProduct() {
  const manifestBytes = await readFile(resolve(iceSheetDirectory, "source-manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  const files = [];
  const archived = new Map();
  for (const row of manifest.sources.filter(row => row.status === "archived")) {
    if (typeof row.file !== "string" || /[\\/]/.test(row.file)) throw new Error("Invalid source filename");
    const bytes = await readFile(resolve(iceSheetDirectory, "sources", row.file));
    if (bytes.length !== row.bytes || sha(bytes) !== row.sha256) throw new Error(`Unverified ice sheet source: ${row.file}`);
    files.push({ file: row.file, url: row.url, bytes: bytes.length, sha256: sha(bytes) });
    archived.set(row.file, bytes);
  }
  for (const name of ["nasa-indicator.html", "nasa-chart.html", "nasa-chart-loader.js", "podaac-use.html",
    "nasa-use.html", "release-notes.txt", "greenland-product.html", "antarctica-product.html"]) {
    if (!archived.has(name)) throw new Error(`Missing source evidence ${name}`);
  }
  const regions = iceSheetRegions.map(expected => {
    const row = files.find(row => row.file === `${expected.id}.json`);
    if (!row || row.url !== iceSheetChartUrl(expected.id)) throw new Error("Chart source URL mismatch");
    const parsed = parseIceSheetChart(JSON.parse(archived.get(row.file)), expected.id);
    return {
      id: expected.id, name: expected.name,
      source: { chart_id: expected.chart_id, url: row.url, sha256: row.sha256,
        retrieved: "2026-11-06", chart_updated: parsed.chart_updated,
        collection: expected.collection, doi: expected.doi, underlying_release: "RL06.3Mv04", records: 260 },
      points: parsed.points,
    };
  });
  const bundle = {
    schema_version: 1, version: iceSheetVersion, publication_allowed: false,
    source_product: "NASA-Earth-Indicator-public-chart",
    quantity: "producer-regional-land-ice-mass-change", unit: "Gt",
    period: { first: "2002-04-16", last: "2026-07-17" },
    reference: { id: "published-chart-zero-preserved", anchor_month: "2002-04",
      mean_period: null, rebased_by_project: false },
    uncertainty: { kind: "published-chart-lower-upper", confidence_level: null, recomputed: false },
    provenance: { manifest_sha256: sha(manifestBytes),
      builder_sha256: sha(await readFile(fileURLToPath(import.meta.url))), files },
    regions,
  };
  if (!validateIceSheetBundle(bundle)) throw new Error("Generated ice sheet product violates contract");
  const bundleBytes = encode(bundle);
  const catalog = {
    schema_version: 1, version: iceSheetVersion, publication_allowed: false, api_base: iceSheetApiBase,
    product: { file: "bundle.json", version: iceSheetVersion, bytes: bundleBytes.length, sha256: sha(bundleBytes) },
  };
  return { bundle, catalog, bundleBytes, catalogBytes: encode(catalog) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const product = await buildIceSheetProduct();
  for (const [file, bytes] of [["ice_sheets_v1.json", product.bundleBytes], ["catalog.json", product.catalogBytes]]) {
    const path = resolve(iceSheetDirectory, file);
    try {
      if (!(await readFile(path)).equals(bytes)) throw new Error(`Refusing changed immutable output ${file}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await writeFile(path, bytes, { flag: "wx" });
    }
  }
  console.log(`Verified ${product.bundleBytes.length} product bytes; ${product.catalog.product.sha256}`);
}
