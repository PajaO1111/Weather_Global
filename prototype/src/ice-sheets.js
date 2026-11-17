import { validPublicationState } from "./public-release.js";

export const iceSheetApiBase = "ice-sheets-api/v1/";
export const iceSheetVersion = "nasa-public-charts-20261023-7d2";
export const iceSheetRegions = [
  { id: "greenland", name: { cs: "Grónsko", en: "Greenland" }, category: "LandIceGreenland",
    chart_id: "LandIceGreenland_1949", collection: "C3206299308-POCLOUD", doi: "10.5067/TEMSC-GT634" },
  { id: "antarctica", name: { cs: "Antarktida · pevninský led", en: "Antarctica · land ice" }, category: "LandIceAntarctica",
    chart_id: "LandIceAntarctica_3202", collection: "C3206284786-POCLOUD", doi: "10.5067/TEMSC-AT634" },
];
export const iceSheetChartUrl = id =>
  `https://assets.science.nasa.gov/content/dam/science/microapps/vital-signs/data/charts/ice-sheets-${id}.json`;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const iceSheetMonthIndex = date => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
export const iceSheetMonth = index => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
export const iceSheetMissionGap = date => date >= "2017-07" && date <= "2018-05";
export const iceSheetLineGapYears = 0.125;
const monthFormat = value => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export function validIceSheetSourceDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateIceSheetCatalog(value) {
  return value?.schema_version === 1 && value.version === iceSheetVersion
    && validPublicationState(value) && value.api_base === iceSheetApiBase
    && value.product?.file === "bundle.json" && value.product.version === iceSheetVersion
    && Number.isInteger(value.product.bytes) && value.product.bytes > 0 && digest(value.product.sha256);
}

export function validateIceSheetBundle(value) {
  if (!record(value) || value.schema_version !== 1 || value.version !== iceSheetVersion
    || value.quantity !== "producer-regional-land-ice-mass-change" || value.unit !== "Gt"
    || !validPublicationState(value)
    || value.source_product !== "NASA-Earth-Indicator-public-chart"
    || value.period?.first !== "2002-04-16" || value.period?.last !== "2026-07-17"
    || value.reference?.id !== "published-chart-zero-preserved"
    || value.reference.anchor_month !== "2002-04" || value.reference.mean_period !== null
    || value.reference.rebased_by_project !== false
    || value.uncertainty?.kind !== "published-chart-lower-upper"
    || value.uncertainty.confidence_level !== null || value.uncertainty.recomputed !== false
    || !digest(value.provenance?.manifest_sha256) || !digest(value.provenance?.builder_sha256)
    || !Array.isArray(value.provenance?.files) || value.provenance.files.length !== 10
    || !value.provenance.files.every(row => record(row) && typeof row.file === "string"
      && !/[\\/]/.test(row.file) && digest(row.sha256) && Number.isInteger(row.bytes) && row.bytes > 0
      && typeof row.url === "string" && row.url.startsWith("https://"))
    || new Set(value.provenance.files.map(row => row.file)).size !== value.provenance.files.length
    || !Array.isArray(value.regions) || value.regions.length !== 2) return false;
  for (const [regionIndex, region] of value.regions.entries()) {
    const expected = iceSheetRegions[regionIndex];
    if (!record(region) || region.id !== expected.id || region.name?.cs !== expected.name.cs
      || region.name?.en !== expected.name.en || region.source?.chart_id !== expected.chart_id
      || region.source.url !== iceSheetChartUrl(expected.id) || region.source.doi !== expected.doi
      || region.source.collection !== expected.collection || region.source.underlying_release !== "RL06.3Mv04"
      || region.source.retrieved !== "2026-11-06" || typeof region.source.chart_updated !== "string"
      || region.source.chart_updated.slice(0, 10) !== "2026-10-23"
      || region.source.records !== 260 || !Array.isArray(region.points) || region.points.length !== 260) return false;
    const ids = new Set();
    let validCount = 0;
    let previousTime = -Infinity;
    const file = value.provenance.files.find(row => row.file === `${region.id}.json`);
    if (!file || file.url !== region.source.url || file.sha256 !== region.source.sha256) return false;
    for (const point of region.points) {
      if (!record(point) || !validIceSheetSourceDate(point.date)
        || point.date < "2002-04-16" || point.date > "2026-07-17"
        || !Number.isInteger(point.source_id) || ids.has(point.source_id)
        || !Number.isFinite(point.source_time) || point.source_time <= previousTime) return false;
      const gap = iceSheetMissionGap(point.date.slice(0, 7));
      if (point.value === null) {
        if (point.lower !== null || point.upper !== null || point.mission !== null
          || point.date !== "2017-12-11" || point.source_time !== 2017.945
          || point.reason !== "between-missions") return false;
      } else {
        validCount++;
        if (gap || !Number.isFinite(point.value) || Math.abs(point.value) > 20_000
          || !Number.isFinite(point.lower) || !Number.isFinite(point.upper)
          || point.lower > point.value || point.upper < point.value || point.reason !== null
          || point.mission !== (point.date.slice(0, 7) <= "2017-06" ? "GRACE" : "GRACE-FO")) return false;
      }
      const year = Number(point.date.slice(0, 4));
      const fraction = (Date.parse(`${point.date}T00:00:00Z`) - Date.UTC(year, 0, 1))
        / (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1));
      if (Math.abs(point.source_time - year - fraction) > 0.007) return false;
      ids.add(point.source_id);
      previousTime = point.source_time;
    }
    if (validCount !== 259 || region.points[0].value !== 0 || region.points[0].date !== "2002-04-16"
      || region.points[0].source_time !== 2002.29 || region.points.at(-1).date !== "2026-07-17") return false;
  }
  return true;
}

export function selectIceSheetPeriod(region, first, last) {
  if (!monthFormat(first) || !monthFormat(last) || first > last || first < "2002-04" || last > "2026-07") {
    throw new RangeError("Invalid ice sheet period");
  }
  return region.points.filter(point => point.date.slice(0, 7) >= first && point.date.slice(0, 7) <= last);
}

export function iceSheetSegments(points) {
  const segments = [];
  let current = [];
  for (const point of points) {
    if (point.value === null) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    if (current.length && point.source_time - current.at(-1).source_time > iceSheetLineGapYears) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

export function iceSheetGaps(points) {
  const valid = points.filter(point => point.value !== null);
  return valid.slice(1).flatMap((point, index) => {
    const previous = valid[index];
    return point.source_time - previous.source_time > iceSheetLineGapYears
      ? [{ before: previous.date, after: point.date,
        reason: previous.date === "2017-06-10" && point.date === "2018-06-14" ? "between-missions" : "unobserved-interval" }]
      : [];
  });
}
