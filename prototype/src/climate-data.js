/* ====================================================
   CLIMATE API CONTRACT
   Validates legacy snapshots and the complete phase 6 ensemble payload.
   ==================================================== */

import { validateSeaLevel } from "./sea-level.js";

const scenarios = ["ssp126", "ssp245", "ssp370", "ssp585"];
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Validates the optional, versioned ocean payload without inventing time steps.
 */
export function validateOceanSnapshot(oceans) {
  if (
    !isRecord(oceans)
    || oceans.schema_version !== 1
    || !isRecord(oceans.series)
    || !isRecord(oceans.metadata)
  ) {
    return false;
  }

  const { sst, ohc, gmsl } = oceans.series;
  const { sst: sstMetadata, ohc: ohcMetadata, gmsl: gmslMetadata } = oceans.metadata;
  if (
    !Array.isArray(sst)
    || sst.length < 2000
    || sst[0]?.date !== "1850-01"
    || !Array.isArray(ohc)
    || ohc.length === 0
    || !isRecord(gmsl)
    || !Array.isArray(gmsl.points)
    || gmsl.points.length === 0
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(gmsl.source_generated_at)
    || typeof gmsl.source_version !== "string"
    || !["sst", "ohc", "gmsl"].every((key) => (
      isRecord(oceans.metadata[key])
      && [
        "provider",
        "product",
        "version",
        "unit",
        "baseline",
        "geography",
        "cadence",
        "citation",
        "license",
        "data_url",
        "documentation_url",
        "uncertainty",
      ].every((field) => typeof oceans.metadata[key][field] === "string")
    ))
    || !isRecord(sstMetadata)
    || !isRecord(ohcMetadata)
    || !isRecord(gmslMetadata)
    || typeof gmslMetadata.corrections !== "string"
    || sstMetadata.unit !== "°C anomaly"
    || ohcMetadata.unit !== "ZJ (converted from 10²² J; 1 source unit = 10 ZJ)"
    || ohcMetadata.source_unit !== "10²² J"
    || gmslMetadata.unit !== "mm sea-level anomaly"
  ) {
    return false;
  }

  let previousMonth = null;
  for (const point of sst) {
    if (
      !isRecord(point)
      || !/^\d{4}-(0[1-9]|1[0-2])$/.test(point.date)
      || !validNullableNumber(point.value)
      || !validNullableNumber(point.total_uncertainty)
      || (point.total_uncertainty !== null && point.total_uncertainty < 0)
    ) {
      return false;
    }
    const [year, month] = point.date.split("-").map(Number);
    const monthIndex = year * 12 + month;
    if (previousMonth !== null && monthIndex !== previousMonth + 1) return false;
    previousMonth = monthIndex;
  }

  let previousQuarter = null;
  for (const point of ohc) {
    if (
      !isRecord(point)
      || !Number.isInteger(point.year)
      || !Number.isInteger(point.quarter)
      || point.quarter < 1
      || point.quarter > 4
      || point.date !== `${point.year}-Q${point.quarter}`
      || !Number.isFinite(point.source_time)
      || !Number.isFinite(point.value)
      || !Number.isFinite(point.source_value_1e22_j)
      || !Number.isFinite(point.standard_error)
      || point.standard_error < 0
      || !Number.isFinite(point.source_standard_error_1e22_j)
      || point.source_standard_error_1e22_j < 0
    ) {
      return false;
    }
    const sourceFraction = point.source_time - point.year;
    const expectedFraction = (point.quarter * 2 - 1) / 8;
    if (Math.abs(sourceFraction - expectedFraction) > 0.002) return false;
    const quarterIndex = point.year * 4 + point.quarter;
    if (previousQuarter !== null && quarterIndex !== previousQuarter + 1) return false;
    previousQuarter = quarterIndex;
  }

  const validPlatforms = new Set([
    "topex-poseidon",
    "jason-1",
    "jason-2",
    "jason-3",
    "sentinel-6mf",
  ]);
  const previousTimes = new Map();
  for (const point of gmsl.points) {
    if (
      !isRecord(point)
      || !/^\d{4}-\d{2}-\d{2}$/.test(point.date)
      || !Number.isInteger(point.year)
      || point.year !== Number(point.date.slice(0, 4))
      || !Number.isFinite(point.source_time)
      || !validPlatforms.has(point.platform)
      || !Number.isFinite(point.value)
    ) {
      return false;
    }
    const previous = previousTimes.get(point.platform);
    if (previous !== undefined && point.source_time <= previous) return false;
    previousTimes.set(point.platform, point.source_time);
  }
  return [...validPlatforms].every((platform) => previousTimes.has(platform));
}

function isRangePoint(point, year, modelCount) {
  return isRecord(point)
    && point.date === String(year)
    && point.members === modelCount
    && [point.minimum, point.median, point.maximum].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
    && point.minimum <= point.median
    && point.median <= point.maximum;
}

/**
 * Accepts both the existing two-model release and the phase 6 model range.
 */
export function validateClimateSnapshot(snapshot) {
  if (
    !isRecord(snapshot)
    || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.snapshot)
    || !/^[a-f0-9]{40}$/.test(snapshot.commit)
    || !isRecord(snapshot.series)
    || !["co2", "temperature", "roni"].every(
      (id) => Array.isArray(snapshot.series[id]) && snapshot.series[id].length > 0,
    )
    || !Array.isArray(snapshot.projections)
    || snapshot.projections.length === 0
    || (snapshot.ocean_projections !== undefined && !validateSeaLevel(snapshot.ocean_projections))
  ) {
    return false;
  }

  const ensemble = snapshot.projection_ensemble;
  if (ensemble === undefined) {
    return snapshot.oceans === undefined || validateOceanSnapshot(snapshot.oceans);
  }
  if (
    !isRecord(ensemble)
    || ensemble.schema_version !== 1
    || ensemble.commit !== snapshot.commit
    || ensemble.reference_period !== "1850-1900"
    || ensemble.reference_months !== 612
    || !Number.isInteger(ensemble.model_count)
    || ensemble.model_count < 2
    || !Number.isInteger(ensemble.available_common_member_count)
    || !Array.isArray(ensemble.members)
    || ensemble.members.length !== ensemble.model_count
    || !Array.isArray(ensemble.excluded_members)
    || ensemble.members.length + ensemble.excluded_members.length !== ensemble.available_common_member_count
    || !ensemble.members.every((member) => typeof member === "string" && /^[A-Za-z0-9.-]+\|r\d+i\d+p\d+f\d+$/.test(member))
    || new Set(ensemble.members).size !== ensemble.model_count
    || new Set(ensemble.members.map((member) => member.split("|")[0])).size !== ensemble.model_count
    || !isRecord(ensemble.baseline_means)
    || Object.keys(ensemble.baseline_means).length !== ensemble.model_count
    || ensemble.members.some(
      (member) => !Number.isFinite(ensemble.baseline_means[member]),
    )
    || ensemble.baseline_units !== "degC absolute tas mean"
    || !/^[a-f0-9]{64}$/.test(ensemble.source_manifest_sha256)
    || !Array.isArray(ensemble.historical)
    || ensemble.historical.length !== 165
    || !isRecord(ensemble.scenarios)
    || scenarios.some(
      (scenario) => !Array.isArray(ensemble.scenarios[scenario])
        || ensemble.scenarios[scenario].length !== 86,
    )
  ) {
    return false;
  }

  if (!ensemble.historical.every((point, index) => isRangePoint(point, 1850 + index, ensemble.model_count))) {
    return false;
  }
  return scenarios.every((scenario) => ensemble.scenarios[scenario].every(
    (point, index) => isRangePoint(point, 2015 + index, ensemble.model_count),
  )) && (snapshot.oceans === undefined || validateOceanSnapshot(snapshot.oceans));
}

/**
 * Accepts null for missing source values but rejects non-finite numeric values.
 */
function validNullableNumber(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}
