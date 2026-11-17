import { validPublicationState } from "./public-release.js";

export const historyComparisonApiBase = "history-comparison-api/v1/";

export const historyRegionIds = [
  "europe",
  "asia",
  "africa",
  "north-america",
  "south-america",
  "oceania",
  "antarctica",
];

export const historyComparisonMethods = ["conservative", "exploratory"];
export const historyComparisonPeriods = ["common_period", "all_available"];

const hashPattern = /^[a-f0-9]{64}$/;
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const fraction = (value) => finite(value) && value >= 0 && value <= 1 + 1e-12;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const localized = (value) => record(value)
  && typeof value.cs === "string" && value.cs.trim().length > 0
  && typeof value.en === "string" && value.en.trim().length > 0;
const nasaUrl = (value) => {
  try {
    return typeof value === "string" && new URL(value).protocol === "https:"
      && new URL(value).hostname === "data.giss.nasa.gov";
  } catch {
    return false;
  }
};
const avoidsFalseClaims = (text) => !/\b(?:extrapolat(?:e|es|ed|ion|ing)\s+(?:beyond|outside)|global\s+mean\s+index|direct\s+measurements?\s+only|raw\s+(?:direct\s+)?observations?\s+only)\b/i.test(text);
const optionalMetric = (value) => value === null || finite(value);
const near = (left, right, tolerance = 0.000002) => Math.abs(left - right) <= tolerance;
const expectedHistoryVersion = "7c8-history-comparison-v1";

function validGeometry(geometry) {
  if (!record(geometry) || !["Polygon", "MultiPolygon"].includes(geometry.type)) return false;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || polygons.length === 0) return false;
  return polygons.every((polygon) => Array.isArray(polygon) && polygon.length > 0
    && polygon.every((ring) => Array.isArray(ring) && ring.length >= 4
      && ring.every((position) => Array.isArray(position) && position.length >= 2
        && finite(position[0]) && position[0] >= -180 && position[0] <= 180
        && finite(position[1]) && position[1] >= -90 && position[1] <= 90)
      && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]));
}

function validSummary(summary, rows) {
  if (!record(summary)
    || !Number.isInteger(summary.valid_count)
    || !Number.isInteger(summary.first_valid) && summary.first_valid !== null
    || !Number.isInteger(summary.last_valid) && summary.last_valid !== null) return false;
  const validYears = rows.filter((point) => point.value !== null).map((point) => Number(point.date));
  return summary.valid_count === validYears.length
    && summary.first_valid === (validYears[0] ?? null)
    && summary.last_valid === (validYears.at(-1) ?? null);
}

function validPoint(point, year, regionId, method) {
  if (!record(point)
    || point.date !== String(year)
    || !(point.value === null || finite(point.value))
    || !["coverage", "source_coverage", "spatial_estimate_fraction",
      "temporal_estimate_fraction", "long_range_fraction"].every((key) => fraction(point[key]))
    || !["available", "estimated", "missing", "blocked-geography"].includes(point.status)
    || !Array.isArray(point.missing_reasons)
    || !point.missing_reasons.every((reason) => typeof reason === "string" && reason.length > 0)) return false;

  const estimated = point.spatial_estimate_fraction + point.temporal_estimate_fraction;
  if (!near(point.coverage, point.source_coverage + estimated)
    || point.long_range_fraction > point.source_coverage + 0.000002) return false;

  if (point.value === null) {
    if (!["missing", "blocked-geography"].includes(point.status) || point.missing_reasons.length === 0) return false;
  } else if (point.missing_reasons.length > 0 || point.status === "missing" || point.status === "blocked-geography") {
    return false;
  }
  if (point.status === "available" && estimated !== 0) return false;
  if (point.status === "estimated" && estimated <= 0) return false;
  if (point.status === "blocked-geography"
    && (regionId !== "antarctica" || method !== "conservative" || point.value !== null)) return false;
  if (regionId === "antarctica" && method === "conservative" && point.value !== null) return false;
  return true;
}

function validMethodSeries(series, regionId, method, firstYear, lastYear) {
  if (!record(series)
    || !Array.isArray(series.annual)
    || series.annual.length !== lastYear - firstYear + 1
    || !series.annual.every((point, index) => validPoint(point, firstYear + index, regionId, method))
    || !validSummary(series.summary, series.annual)) return false;
  if (regionId === "antarctica" && method === "conservative"
    && !series.annual.every((point) => point.value === null && point.status === "blocked-geography")) return false;
  return true;
}

function validHoldout(holdout) {
  return record(holdout)
    && Number.isInteger(holdout.count) && holdout.count >= 0
    && optionalMetric(holdout.mae_degC) && optionalMetric(holdout.rmse_degC)
    && (holdout.count === 0
      ? holdout.mae_degC === null && holdout.rmse_degC === null
      : holdout.mae_degC !== null && holdout.rmse_degC !== null
        && holdout.mae_degC >= 0 && holdout.rmse_degC >= 0);
}

export function validateHistoryComparisonCatalog(value) {
  return record(value)
    && value.schema_version === 1
    && value.version === "7c8-history-catalog-v1"
    && validPublicationState(value)
    && record(value.product)
    && value.product.endpoint === `${historyComparisonApiBase}bundle.json`
    && value.product.version === expectedHistoryVersion
    && hashPattern.test(value.product.sha256)
    && Number.isSafeInteger(value.product.bytes)
    && value.product.bytes > 0
    && Array.isArray(value.regions)
    && value.regions.length === historyRegionIds.length
    && value.regions.every((region, index) => record(region)
      && region.id === historyRegionIds[index]
      && localized(region.name));
}

export function validateHistoryComparisonBundle(value) {
  if (!record(value)
    || value.schema_version !== 1
    || value.version !== expectedHistoryVersion
    || !validPublicationState(value)
    || !Array.isArray(value.baseline)
    || value.baseline.length !== 2
    || value.baseline[0] !== 1981
    || value.baseline[1] !== 2010
    || value.unit !== "degC anomaly"
    || !record(value.source)
    || typeof value.source.title !== "string" || value.source.title.length === 0
    || !nasaUrl(value.source.url)
    || !hashPattern.test(value.source.sha256)
    || value.source.smoothing_km !== 1200
    || value.source.months !== 1761
    || !Number.isInteger(value.source.first_year)
    || !Number.isInteger(value.source.last_year)
    || value.source.first_year > value.source.last_year
    || !Number.isInteger(value.source.last_month)
    || value.source.last_month < 1 || value.source.last_month > 12
    || typeof value.source.citation !== "string" || value.source.citation.length === 0
    || !record(value.methods)
    || !localized(value.methods.conservative)
    || !localized(value.methods.exploratory)
    || !avoidsFalseClaims(value.methods.conservative.cs)
    || !avoidsFalseClaims(value.methods.conservative.en)
    || !avoidsFalseClaims(value.methods.exploratory.cs)
    || !avoidsFalseClaims(value.methods.exploratory.en)
    || !record(value.methods.limitations)
    || !Array.isArray(value.methods.limitations.cs)
    || !Array.isArray(value.methods.limitations.en)
    || !value.methods.limitations.cs.every((item) => typeof item === "string" && item.length > 0)
    || !value.methods.limitations.en.every((item) => typeof item === "string" && item.length > 0)
    || !value.methods.conservative.cs.toLowerCase().includes("bez vlastního doplňování")
    || !value.methods.conservative.en.toLowerCase().includes("no project gap filling")
    || !value.methods.exploratory.cs.toLowerCase().includes("vnitřních mezer do 2 měsíců")
    || !value.methods.exploratory.en.toLowerCase().includes("internal gaps up to 2 months only")
    || !value.methods.exploratory.cs.toLowerCase().includes("prodlužování regionálního záznamu")
    || !value.methods.exploratory.en.toLowerCase().includes("extension of the regional record")
    || !value.methods.limitations.cs.some((item) =>
      item.toLowerCase().includes("prostorově odhadovaná analýza odvozená z pozorování"))
    || !value.methods.limitations.en.some((item) =>
      item.toLowerCase().includes("spatially estimated observation-derived analysis"))
    || !record(value.common_period)
    || !((Number.isInteger(value.common_period.start) && Number.isInteger(value.common_period.end)
      && value.common_period.start <= value.common_period.end)
      || (value.common_period.start === null && value.common_period.end === null))
    || !Array.isArray(value.common_period.regions)
    || JSON.stringify(value.common_period.regions) !== JSON.stringify(historyRegionIds.slice(0, 6))
    || !record(value.validation)
    || !validHoldout(value.validation.temporal_holdout)
    || !validHoldout(value.validation.temporal_two_month_holdout)
    || !validHoldout(value.validation.spatial_holdout)
    || !localized(value.validation.note)
    || !Array.isArray(value.regions)
    || value.regions.length !== historyRegionIds.length
    || !record(value.provenance)
    || typeof value.provenance.source_file !== "string"
    || typeof value.provenance.source_format !== "string"
    || typeof value.provenance.baseline_rule !== "string"
    || !["implementation_sha256", "weights_sha256", "previous_bundle_sha256"]
      .every((key) => hashPattern.test(value.provenance[key]))
    || !record(value.provenance.mask_diagnostics)
    || !record(value.provenance.mask_diagnostics.area_m2)
    || !record(value.provenance.mask_diagnostics.mask_tiling_error_m2)
    || !historyRegionIds.every((id) =>
      finite(value.provenance.mask_diagnostics.area_m2[id])
      && value.provenance.mask_diagnostics.area_m2[id] > 0
      && finite(value.provenance.mask_diagnostics.mask_tiling_error_m2[id]))) return false;

  const firstYear = value.source.first_year;
  const lastYear = value.source.last_year;
  if (firstYear !== 1880 || lastYear !== 2026 || value.source.last_month !== 9) return false;
  if (value.common_period.start !== 1926 || value.common_period.end !== 2025) return false;
  const regionsValid = value.regions.every((region, index) => {
    const id = historyRegionIds[index];
    if (!record(region)
      || region.id !== id
      || !localized(region.name)
      || !["validated-local", "provisional-geography"].includes(region.status)
      || !validGeometry(region.geometry)
      || typeof region.geometry_version !== "string" || region.geometry_version.length === 0
      || !finite(region.area_m2) || region.area_m2 <= 0
      || !validMethodSeries(region.conservative, id, "conservative", firstYear, lastYear)
      || !validMethodSeries(region.exploratory, id, "exploratory", firstYear, lastYear)
      || !record(region.sensitivity_250km)
      || !Number.isInteger(region.sensitivity_250km.common_years)
      || region.sensitivity_250km.common_years < 0
      || !optionalMetric(region.sensitivity_250km.mean_difference_degC)
      || !optionalMetric(region.sensitivity_250km.max_absolute_difference_degC)
      || (region.sensitivity_250km.common_years === 0
        && (region.sensitivity_250km.mean_difference_degC !== null
          || region.sensitivity_250km.max_absolute_difference_degC !== null))
      || (region.sensitivity_250km.common_years > 0
        && (region.sensitivity_250km.mean_difference_degC === null
          || region.sensitivity_250km.max_absolute_difference_degC === null))
      || (region.sensitivity_250km.mean_difference_degC !== null
        && region.sensitivity_250km.max_absolute_difference_degC !== null
        && region.sensitivity_250km.max_absolute_difference_degC
          < Math.abs(region.sensitivity_250km.mean_difference_degC))) return false;

    if (region.conservative.annual.at(-1).value !== null
      || region.exploratory.annual.at(-1).value !== null) return false;

    if (id === "antarctica") {
      if (region.status !== "provisional-geography") return false;
      if (!region.conservative.annual.every((point) => point.value === null
        && point.status === "blocked-geography")) return false;
    } else if (region.status !== "validated-local") return false;
    return true;
  });
  if (!regionsValid) return false;

  const common = value.common_period;
  return value.regions.slice(0, 6).every((region) =>
    region.conservative.annual.some((point) => Number(point.date) === common.start && point.value !== null)
      && region.conservative.annual.some((point) => Number(point.date) === common.end && point.value !== null)
      && region.conservative.annual
        .filter((point) => Number(point.date) >= common.start && Number(point.date) <= common.end)
        .every((point) => point.value !== null))
    && value.regions.slice(0, 6).every((region) =>
      region.conservative.annual.every((point) => {
        const year = Number(point.date);
        return (year < common.start || year > common.end) || point.value !== null;
      }));
}

export function historyComparisonRows(bundle, method, period, regionIds = historyRegionIds) {
  if (!historyComparisonMethods.includes(method) || !historyComparisonPeriods.includes(period)) return [];
  const common = bundle.common_period;
  if (period === "common_period" && common.start === null) return [];
  return bundle.regions
    .filter((region) => regionIds.includes(region.id)
      && (period !== "common_period" || (region.id !== "antarctica"
        && historyRegionIds.slice(0, 6).includes(region.id))))
    .flatMap((region) => region[method].annual
      .filter((point) => period !== "common_period"
        || (Number(point.date) >= common.start && Number(point.date) <= common.end))
      .map((point) => ({ ...point, region_id: region.id, region_name: region.name })));
}

export function historySymmetricExtent(points) {
  const maximum = points.reduce((extent, point) =>
    point.value === null ? extent : Math.max(extent, Math.abs(point.value)), 0);
  return maximum > 0 ? maximum : 1;
}
