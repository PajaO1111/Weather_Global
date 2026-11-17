const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const months = (value) => Array.isArray(value) && value.every((month, i) =>
  Number.isInteger(month) && month >= 1 && month <= 12 && (i === 0 || month > value[i - 1]));

export function validateHistoryPreview(data) {
  if (!record(data) || data.schema_version !== 1 || data.version !== "7c4c-europe-nasa-history-v1"
    || data.status !== "local-observation-derived-history-not-public-release"
    || data.series_type !== "observation-derived-gridded-analysis"
    || data.unit !== "degC anomaly" || data.calendar !== "standard"
    || data.baseline?.years?.length !== 2 || data.baseline.years[0] !== 1981 || data.baseline.years[1] !== 2010
    || data.coverage?.threshold !== 0.9 || data.mask?.version !== "europe-kuma-manych-cyprus-v1"
    || !hash(data.mask.sha256) || !hash(data.source?.sha256) || !hash(data.provenance?.audit_sha256)
    || !hash(data.provenance?.pilot_sha256) || typeof data.attribution !== "string"
    || data.usage_review?.status !== "official-product-use-and-citation-verification-required-before-publication"
    || !Array.isArray(data.annual) || data.annual.length !== 147
    || !Array.isArray(data.monthly_coverage) || data.monthly_coverage.length !== 1761
    || data.source_period?.first_month !== "1880-01" || data.source_period?.last_month !== "2026-09"
    || !record(data.summary)) return false;
  const monthlyValid = data.monthly_coverage.every((point, i) => {
    const date = `${1880 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}`;
    return record(point) && point.date === date && Number.isFinite(point.coverage)
      && point.coverage >= 0 && point.coverage <= 1
      && point.valid === (point.coverage + 1e-12 >= 0.9);
  });
  if (!monthlyValid) return false;
  const annualValid = data.annual.every((point, i) => {
    if (!record(point) || point.date !== String(1880 + i)
      || !months(point.absent_source_months) || !months(point.below_coverage_months)
      || point.source_months !== 12 - point.absent_source_months.length
      || !Array.isArray(point.missing_reasons)) return false;
    const monthly = data.monthly_coverage.slice(i * 12, i * 12 + 12);
    const absent = Array.from({ length: 12 - monthly.length }, (_, j) => monthly.length + j + 1);
    const below = monthly.flatMap((row, j) => row.valid ? [] : [j + 1]);
    const reasons = [...(absent.length ? ["incomplete-source-year"] : []),
      ...(below.length ? ["insufficient-spatial-coverage"] : [])];
    return JSON.stringify(point.absent_source_months) === JSON.stringify(absent)
      && JSON.stringify(point.below_coverage_months) === JSON.stringify(below)
      && JSON.stringify(point.missing_reasons) === JSON.stringify(reasons)
      && point.minimum_monthly_coverage === Math.min(...monthly.map((row) => row.coverage))
      && point.status === (reasons.length ? "missing" : "valid")
      && (reasons.length ? point.value === null : Number.isFinite(point.value));
  });
  const validYears = data.annual.filter((point) => point.status === "valid").map((point) => Number(point.date));
  return annualValid && validYears.length === 132 && data.summary.valid_count === 132
    && data.summary.missing_count === 15 && data.summary.annual_count === 147
    && JSON.stringify(data.summary.valid_years) === JSON.stringify(validYears)
    && validYears.every((year, i) => year === 1894 + i);
}
