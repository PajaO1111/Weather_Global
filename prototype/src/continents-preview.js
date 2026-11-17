import { validPublicationState } from "./public-release.js";

export const continentsApiBase = "continents-api/v1/";

export const continentIds = [
  "europe",
  "asia",
  "africa",
  "north-america",
  "south-america",
  "oceania",
  "antarctica",
];

export const continentScenarios = ["ssp126", "ssp245", "ssp370", "ssp585"];
export const continentModels = ["ACCESS-CM2", "CanESM5"];
const hashPattern = /^[a-f0-9]{64}$/;
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const localized = (value) => record(value) && typeof value.cs === "string" && value.cs.length > 0
  && typeof value.en === "string" && value.en.length > 0;
const between = (value, min, max) => finite(value) && value >= min && value <= max;
const annualRows = (rows, first, last, allowNull = false, coverageKey = "coverage") => Array.isArray(rows)
  && rows.length === last - first + 1
  && rows.every((row, index) => record(row)
    && row.date === String(first + index)
    && (allowNull ? row.value === null || finite(row.value) : finite(row.value))
    && between(row[coverageKey], 0, 1));

export function validateContinentsCatalog(value) {
  return record(value)
    && value.schema_version === 1
    && value.version === "7c7-continental-catalog-v1"
    && validPublicationState(value)
    && record(value.product)
    && value.product.endpoint === `${continentsApiBase}bundle.json`
    && value.product.version === "7c7-continental-temperatures-v1"
    && hashPattern.test(value.product.sha256)
    && Number.isSafeInteger(value.product.bytes)
    && value.product.bytes > 0
    && Array.isArray(value.regions)
    && value.regions.length === continentIds.length
    && value.regions.every((region, index) => record(region)
      && region.id === continentIds[index]
      && localized(region.name)
      && ["validated-local", "blocked-grounding", "provisional"].includes(region.status))
    && Array.isArray(value.gates)
    && value.gates.every((gate) => record(gate)
      && typeof gate.code === "string"
      && localized(gate));
}

function validHistory(history) {
  if (!record(history)
    || !["available", "blocked-incomplete-baseline"].includes(history.status)
    || history.unit !== "degC anomaly"
    || !Array.isArray(history.baseline)
    || history.baseline.length !== 2
    || history.baseline[0] !== 1981
    || history.baseline[1] !== 2010
    || !(history.baseline_offset_K === null || finite(history.baseline_offset_K))
    || !annualRows(history.annual, 1880, 2026, true, "minimum_monthly_coverage")
    || !Array.isArray(history.monthly_coverage)
    || !history.monthly_coverage.every((row) => record(row)
      && /^\d{4}-(0[1-9]|1[0-2])$/.test(row.date)
      && between(row.coverage, 0, 1))
    || !record(history.source)
    || !record(history.usage_review)) return false;
  if ((history.status === "available" && history.baseline_offset_K === null)
    || (history.status === "blocked-incomplete-baseline" && history.baseline_offset_K !== null)) return false;

  return history.annual.every((row) => {
    if (!["valid", "missing"].includes(row.status)
      || !Number.isInteger(row.source_months)
      || row.source_months < 1
      || row.source_months > 12
      || !Array.isArray(row.missing_reasons)
      || !Array.isArray(row.absent_source_months)
      || !Array.isArray(row.below_coverage_months)
      || !row.missing_reasons.every((reason) => typeof reason === "string")
      || !row.absent_source_months.every((month) => Number.isInteger(month) && month >= 1 && month <= 12)
      || !row.below_coverage_months.every((month) => Number.isInteger(month) && month >= 1 && month <= 12)) return false;

    if (row.value !== null) {
      return row.status === "valid"
        && row.source_months === 12
        && row.minimum_monthly_coverage >= 0.9
        && history.baseline_offset_K !== null
        && history.status === "available";
    }

    return row.status === "missing"
      && row.missing_reasons.length > 0
      && (history.status === "available"
        || (row.value === null && row.missing_reasons.includes("incomplete-reference")));
  });
}

function validModel(model) {
  if (!record(model)
    || !continentModels.includes(model.source_id)
    || model.member !== "r1i1p1f1"
    || typeof model.calendar !== "string"
    || !finite(model.baseline_temperature_K)
    || !Number.isFinite(model.baseline_days)
    || model.baseline_days <= 0
    || !record(model.grid)
    || !finite(model.grid.weighted_area_m2)
    || model.grid.weighted_area_m2 <= 0
    || !annualRows(model.historical, 1850, 2014)
    || !record(model.scenarios)
    || !continentScenarios.every((scenario) => annualRows(model.scenarios[scenario], 2015, 2100))) {
    return false;
  }
  return [...model.historical, ...continentScenarios.flatMap((id) => model.scenarios[id])]
    .every((row) => row.coverage >= 0.9);
}

function rangeMatches(rows, modelRows, expectedCount) {
  if (!Array.isArray(rows) || rows.length !== modelRows[0].length) return false;
  return rows.every((row, index) => {
    if (!record(row)
      || row.date !== modelRows[0][index].date
      || !finite(row.min)
      || !finite(row.max)
      || row.min > row.max
      || row.model_count !== expectedCount) return false;
    const values = modelRows.map((series) => series[index].value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    return Math.abs(row.min - minimum) <= 1e-9
      && Math.abs(row.max - maximum) <= 1e-9;
  });
}

function validRanges(range, models) {
  if (!record(range) || models.length !== continentModels.length) return false;
  if (!rangeMatches(range.historical, models.map((model) => model.historical), models.length)) return false;
  return record(range.scenarios)
    && continentScenarios.every((scenario) => rangeMatches(
      range.scenarios[scenario],
      models.map((model) => model.scenarios[scenario]),
      models.length,
    ));
}

export function validateContinentalBundle(value) {
  if (!record(value)
    || value.schema_version !== 1
    || value.version !== "7c7-continental-temperatures-v1"
    || !validPublicationState(value)
    || !Array.isArray(value.baseline)
    || value.baseline.length !== 2
    || value.baseline[0] !== 1981
    || value.baseline[1] !== 2010
    || value.unit !== "degC anomaly"
    || !Array.isArray(value.regions)
    || value.regions.length !== continentIds.length
    || !record(value.method)
    || !Array.isArray(value.sources)
    || value.sources.length === 0
    || !record(value.legacy_comparison)
    || !record(value.source_review)) return false;

  return value.regions.every((region, index) => {
    if (!record(region)
      || region.id !== continentIds[index]
      || !localized(region.name)
      || !["validated-local", "blocked-grounding", "provisional"].includes(region.status)
      || (value.publication_allowed === false || region.status === "blocked-grounding"
        ? region.publication_allowed !== false : region.publication_allowed !== true)
      || !record(region.mask)
      || typeof region.mask.file !== "string"
      || !hashPattern.test(region.mask.sha256)
      || typeof region.mask.version !== "string"
      || !finite(region.mask.area_m2)
      || region.mask.area_m2 <= 0
      || typeof region.mask.grounding_line_verified !== "boolean"
      || !record(region.limitations)
      || !Array.isArray(region.limitations.cs)
      || !Array.isArray(region.limitations.en)
      || !region.limitations.cs.every((item) => typeof item === "string")
      || !region.limitations.en.every((item) => typeof item === "string")) return false;

    if (region.status === "blocked-grounding") {
      return region.id === "antarctica"
        && Array.isArray(region.models)
        && region.models.length === 0
        && region.range === null
        && region.history === null;
    }

    if (!Array.isArray(region.models)
      || region.models.length !== continentModels.length
      || !continentModels.every((id) => region.models.filter((model) => model.source_id === id).length === 1)
      || !region.models.every(validModel)
      || !validRanges(region.range, region.models)
      || !validHistory(region.history)) return false;

    return true;
  });
}
