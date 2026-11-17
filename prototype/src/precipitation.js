import { continentIds } from "./continents-preview.js";
import { validPublicationState } from "./public-release.js";

export const precipitationApiBase = "precipitation-api/v1/";
export const precipitationVersion = "gpcc-v2025-250-20261106-7d4";
export const precipitationIds = continentIds;
const finite = value => typeof value === "number" && Number.isFinite(value);
const fraction = value => finite(value) && value >= 0 && value <= 1;
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const close = (a, b) => finite(a) && Math.abs(a - b) < 0.000003;
export function validatePrecipitationCatalog(catalog) {
  return catalog?.schema_version === 1 && catalog.version === precipitationVersion
    && catalog.api_base === precipitationApiBase && validPublicationState(catalog)
    && catalog.product?.file === "bundle.json" && catalog.product.version === precipitationVersion
    && Number.isInteger(catalog.product.bytes) && catalog.product.bytes > 0 && digest(catalog.product.sha256);
}
export function validatePrecipitationBundle(bundle) {
  if (bundle?.schema_version !== 1 || bundle.version !== precipitationVersion || !validPublicationState(bundle)
    || bundle.unit !== "mm" || bundle.quantity !== "land-precipitation-depth"
    || bundle.period?.first !== "1891-01" || bundle.period?.last !== "2026-08"
    || bundle.reference_period?.first !== 1981 || bundle.reference_period.last !== 2010
    || bundle.annual_method !== "sum-12-months-identical-fixed-support"
    || bundle.spatial_method !== "ellipsoidal-fractional-land-intersections-fixed-common-precip-support"
    || bundle.source?.variable !== "precip" || bundle.source.not_used !== "precip_infill"
    || bundle.source.doi !== "10.5676/DWD_GPCC/MONTHLY_V2025_250"
    || bundle.source.version !== "2025" || bundle.source.resolution_degrees !== 2.5
    || bundle.source.confidence_level !== null || bundle.source.gauge_correction_applied_by_project !== false
    || typeof bundle.source.citation !== "string" || !bundle.source.citation.includes("DWD/GPCC, CC BY 4.0")
    || !["manifest_sha256", "builder_sha256", "weights_sha256", "weights_metadata_sha256", "licence_sha256"]
      .every(key => digest(bundle.provenance?.[key]))
    || bundle.provenance.source_files !== 47 || bundle.provenance.archive_responses !== 96
    || !Array.isArray(bundle.regions) || bundle.regions.length !== 7
    || bundle.display_geometry?.type !== "FeatureCollection" || bundle.display_geometry.features?.length !== 7) return false;
  for (const [k, region] of bundle.regions.entries()) {
    const absent = k === 6;
    if (region?.id !== precipitationIds[k] || typeof region.name?.cs !== "string" || typeof region.name?.en !== "string"
      || !finite(region.geographic_area_km2) || region.geographic_area_km2 <= 0
      || !finite(region.supported_area_km2) || !fraction(region.support_fraction)
      || !close(region.supported_area_km2 / region.geographic_area_km2, region.support_fraction)
      || (absent ? region.support_fraction !== 0 : region.support_fraction < .95)
      || region.monthly?.length !== 1628 || region.annual?.length !== 136 || region.reference?.length !== 13) return false;
    for (const [index, point] of region.monthly.entries()) {
      const year = 1891 + Math.floor(index / 12), month = index % 12 + 1;
      if (point?.date !== `${year}-${String(month).padStart(2, "0")}` || !fraction(point.coverage)) return false;
      if (absent) {
        if (point.value !== null || point.anomaly !== null || point.reason !== "no-source-domain"
          || point.station_fraction !== null || point.distance_km !== null || point.coverage !== 0) return false;
      } else if (!finite(point.value) || point.value < 0 || point.value > 10000 || !finite(point.anomaly)
        || !fraction(point.station_fraction) || !finite(point.distance_km) || point.distance_km < 0
        || point.reason !== null || point.coverage !== 1) return false;
    }
    for (const [index, point] of region.annual.entries()) {
      const months = region.monthly.slice(index * 12, index * 12 + 12);
      if (point?.date !== String(1891 + index) || point.months !== months.length
        || point.coverage !== (absent ? 0 : 1)) return false;
      if (absent || months.length !== 12) {
        if (point.value !== null || point.anomaly !== null || point.station_fraction !== null || point.distance_km !== null
          || point.reason !== (absent ? "no-source-domain" : "incomplete-source-year")) return false;
      } else if (!close(point.value, months.reduce((sum, p) => sum + p.value, 0))
        || !close(point.station_fraction, Math.min(...months.map(p => p.station_fraction)))
        || !close(point.distance_km, months.reduce((sum, p) => sum + p.distance_km, 0) / 12) || point.reason !== null) return false;
    }
    for (const [index, ref] of region.reference.entries()) {
      const period = index === 12 ? "annual" : String(index + 1);
      const all = index === 12 ? region.annual : region.monthly.filter(p => Number(p.date.slice(5)) === index + 1);
      const base = all.filter(p => p.date.slice(0, 4) >= "1981" && p.date.slice(0, 4) <= "2010" && p.value !== null);
      if (ref?.period !== period || ref.count !== base.length || ref.count !== (absent ? 0 : 30)) return false;
      if (absent ? ref.mean !== null : !close(ref.mean, base.reduce((sum, p) => sum + p.value, 0) / 30)) return false;
      if (all.some(p => p.value !== null && !close(p.anomaly, p.value - ref.mean))) return false;
    }
    const feature = bundle.display_geometry.features[k];
    if (feature?.type !== "Feature" || feature.properties?.name !== region.id
      || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type) || !Array.isArray(feature.geometry.coordinates)) return false;
  }
  return true;
}

export function precipitationHistory(region, period, first, last) {
  if (!["annual", ...Array.from({ length: 12 }, (_, i) => String(i + 1))].includes(period)
    || !Number.isInteger(first) || !Number.isInteger(last) || first < 1891 || last > 2026 || first > last) {
    throw new RangeError("Invalid precipitation history selection");
  }
  const series = period === "annual" ? region.annual : region.monthly.filter(p => Number(p.date.slice(5)) === Number(period));
  return series.filter(p => Number(p.date.slice(0, 4)) >= first && Number(p.date.slice(0, 4)) <= last);
}
export function precipitationSeason(region, year) {
  if (!Number.isInteger(year) || year < 1891 || year > 2026) throw new RangeError("Invalid precipitation seasonal year");
  return Array.from({ length: 12 }, (_, i) => {
    const date = `${year}-${String(i + 1).padStart(2, "0")}`;
    return region.monthly.find(p => p.date === date)
      ?? { date, value: null, anomaly: null, coverage: 0, station_fraction: null, distance_km: null, reason: "outside-source-period" };
  });
}
