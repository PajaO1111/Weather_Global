export const pairExperiments = ["historical", "ssp126", "ssp245", "ssp370", "ssp585"];
const hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const series = (model, id) => id === "historical" ? model.historical : model.scenarios?.[id];
export function pairRows(data, id) {
  if (!pairExperiments.includes(id)) throw new Error("Invalid CMIP6 experiment");
  return series(data.models[0], id).map((point, index) => {
    const other = series(data.models[1], id)[index];
    return { date: point.date, value: point.value, canesm: other.value,
      minimum: Math.min(point.value, other.value), maximum: Math.max(point.value, other.value) };
  });
}
export function validateCmip6Preview(data) {
  if (!record(data) || data.schema_version !== 1
    || data.version !== "7c3c-europe-pair-anomalies-v1"
    || data.status !== "local-technical-two-model-comparison-not-public-release"
    || data.unit !== "degC anomaly" || data.license !== "CC-BY-SA-4.0"
    || data.baseline?.length !== 2 || data.baseline[0] !== 1981 || data.baseline[1] !== 2010
    || data.model_count !== 2 || !Array.isArray(data.models) || data.models.length !== 2
    || !hash(data.manifest_sha256) || !hash(data.validation_sha256)
    || data.mask?.version !== "europe-kuma-manych-cyprus-v1" || !hash(data.mask.sha256)
    || typeof data.attribution !== "string"
    || !record(data.range)) return false;
  for (const [index, model] of data.models.entries()) {
    if (!record(model) || model.source_id !== ["ACCESS-CM2", "CanESM5"][index]
      || model.member !== "r1i1p1f1" || model.grid_label !== "gn"
      || model.calendar !== ["proleptic_gregorian", "365_day"][index]
      || !Number.isFinite(model.baseline_temperature_K)
      || !record(model.grid) || !Number.isFinite(model.grid.relative_signed_coast_area_difference)
      || model.baseline_days !== [10957, 10950][index]
      || typeof model.license_statement !== "string"
      || !Array.isArray(model.sources) || model.sources.length !== 7
      || !model.sources.every((source) => record(source) && typeof source.file === "string" && hash(source.sha256))) return false;
    for (const id of pairExperiments) {
      const points = series(model, id);
      const start = id === "historical" ? 1850 : 2015;
      const count = id === "historical" ? 165 : 86;
      if (!Array.isArray(points) || points.length !== count
        || !points.every((point, i) => record(point) && point.date === String(start + i)
          && Number.isFinite(point.value) && Number.isFinite(point.coverage)
          && point.coverage >= 0.9 && point.coverage <= 1)) return false;
    }
  }
  return pairExperiments.every((id) => {
    const range = id === "historical" ? data.range.historical : data.range.scenarios?.[id];
    const rows = pairRows(data, id);
    return Array.isArray(range) && range.length === rows.length && range.every((point, i) =>
      record(point) && point.date === rows[i].date && point.model_count === 2
      && point.min === rows[i].minimum && point.max === rows[i].maximum);
  });
}
