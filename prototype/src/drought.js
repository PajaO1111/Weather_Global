import { continentIds } from "./continents-preview.js";
import { validPublicationState } from "./public-release.js";
export const droughtApiBase = "drought-api/v1/";
export const droughtVersion = "speibase-2.11-20261106-7d5";
export const droughtCategories = ["extreme-dry", "severe-dry", "moderate-dry", "near-normal", "moderate-wet", "severe-wet", "extreme-wet"];
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const finite = value => typeof value === "number" && Number.isFinite(value);
const fraction = value => finite(value) && value >= 0 && value <= 1;
const close = (a, b) => finite(a) && Math.abs(a - b) < 0.00000002;
const classes = value => Array.isArray(value) && value.length === 7 && value.every(fraction)
  && close(value.reduce((sum, p) => sum + p, 0), 1);
export function validateDroughtCatalog(catalog) {
  return catalog?.schema_version === 1 && catalog.version === droughtVersion
    && catalog.api_base === droughtApiBase && validPublicationState(catalog)
    && catalog.product?.file === "bundle.json" && catalog.product.version === droughtVersion
    && Number.isInteger(catalog.product.bytes) && catalog.product.bytes > 0 && digest(catalog.product.sha256);
}
export function validateDroughtBundle(bundle) {
  if (bundle?.schema_version !== 1 || bundle.version !== droughtVersion || !validPublicationState(bundle)
    || bundle.quantity !== "spei-category-area-fraction" || bundle.unit !== "fraction-of-available-source-land"
    || bundle.period?.first !== "1901-01" || bundle.period?.last !== "2024-12"
    || JSON.stringify(bundle.categories) !== JSON.stringify(droughtCategories)
    || JSON.stringify(bundle.boundaries) !== "[-2,-1.5,-1,1,1.5,2]"
    || bundle.boundary_rule !== "dry-upper-inclusive-wet-lower-inclusive"
    || bundle.denominator !== "available-source-land-per-month-no-infill"
    || bundle.annual_method !== "mean-of-12-monthly-area-fractions-not-unique-annual-area"
    || bundle.source?.version !== "2.11.0" || bundle.source.cru_version !== "4.09"
    || bundle.source.variable !== "spei" || bundle.source.unit !== "1" || bundle.source.pet !== "FAO-56-Penman-Monteith"
    || bundle.source.resolution_degrees !== .5 || bundle.source.calibration_period !== null
    || bundle.source.recentered_by_project !== false || bundle.source.confidence_level !== null
    || bundle.source.licence !== "ODbL-1.0" || bundle.source.contents_licence !== "DbCL-1.0"
    || typeof bundle.source.citation !== "string" || !bundle.source.citation.includes("10.1175/2009JCLI2909.1")
    || !["manifest_sha256", "builder_sha256", "weights_sha256", "weights_metadata_sha256"].every(k => digest(bundle.provenance?.[k]))
    || bundle.provenance.archive_responses !== 7 || bundle.scales?.length !== 2
    || bundle.display_geometry?.type !== "FeatureCollection" || bundle.display_geometry.features?.length !== 7) return false;
  for (const [s, product] of bundle.scales.entries()) {
    if (product?.months !== [3, 12][s] || product.source_domain_cells !== 66501
      || !Number.isInteger(product.intermittently_missing_cells) || product.intermittently_missing_cells < 0
      || product.regions?.length !== 7) return false;
    for (const [k, region] of product.regions.entries()) {
      if (region?.id !== continentIds[k] || typeof region.name?.cs !== "string" || typeof region.name?.en !== "string"
        || !finite(region.geographic_area_km2) || region.geographic_area_km2 <= 0
        || !finite(region.source_domain_area_km2) || region.source_domain_area_km2 < 0
        || !fraction(region.domain_fraction) || !close(region.domain_fraction, region.source_domain_area_km2 / region.geographic_area_km2)
        || (k === 6 ? region.domain_fraction !== 0 : region.domain_fraction <= 0)
        || !finite(region.ever_missing_domain_area_km2) || region.ever_missing_domain_area_km2 < 0
        || region.ever_missing_domain_area_km2 > region.source_domain_area_km2
        || region.points?.length !== 1488 || region.annual?.length !== 124) return false;
      for (const [t, p] of region.points.entries()) {
        const absent = k === 6 || t < product.months - 1;
        if (p?.date !== `${1901 + Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, "0")}`
          || !fraction(p.coverage) || !fraction(p.missing_fraction) || !close(p.coverage + p.missing_fraction, 1)
          || !finite(p.available_area_km2) || p.available_area_km2 < 0) return false;
        if (absent) {
          if (p.categories !== null || p.dry !== null || p.severe !== null || p.extreme !== null
            || p.coverage !== 0 || p.available_area_km2 !== 0
            || p.reason !== (k === 6 ? "no-source-domain" : "no-valid-source-values")) return false;
        } else if (!classes(p.categories) || !fraction(p.dry) || !fraction(p.severe) || !fraction(p.extreme)
          || !close(p.dry, p.categories.slice(0, 3).reduce((a, b) => a + b, 0))
          || !close(p.severe, p.categories[0] + p.categories[1]) || !close(p.extreme, p.categories[0])
          || p.coverage <= 0 || !close(p.coverage, p.available_area_km2 / region.source_domain_area_km2)
          || p.reason !== null) return false;
      }
      for (const [i, p] of region.annual.entries()) {
        const points = region.points.slice(i * 12, i * 12 + 12), valid = points.filter(p => p.dry !== null);
        if (p?.date !== String(1901 + i) || p.months !== 12 || p.valid_months !== valid.length
          || !close(p.coverage, Math.min(...points.map(p => p.coverage)))) return false;
        if (valid.length !== 12) {
          if (p.categories !== null || p.dry !== null || p.severe !== null || p.extreme !== null || p.reason !== "incomplete-year") return false;
        } else {
          if (!classes(p.categories) || p.reason !== null) return false;
          if (["dry", "severe", "extreme"].some(key => !close(p[key], valid.reduce((sum, p) => sum + p[key], 0) / 12))) return false;
          if (p.categories.some((value, c) => !close(value, valid.reduce((sum, p) => sum + p.categories[c], 0) / 12))) return false;
        }
      }
      const feature = bundle.display_geometry.features[k];
      if (feature?.type !== "Feature" || feature.properties?.name !== region.id
        || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type) || !Array.isArray(feature.geometry.coordinates)) return false;
    }
  }
  return true;
}
export function droughtValue(point, metric) {
  if (["dry", "severe", "extreme"].includes(metric)) return point?.[metric] ?? null;
  const index = droughtCategories.indexOf(metric);
  if (index < 0) throw new RangeError("Invalid drought category");
  return point?.categories?.[index] ?? null;
}
export function droughtHistory(region, period, first, last) {
  if (!["annual", ...Array.from({ length: 12 }, (_, i) => String(i + 1))].includes(period)
    || !Number.isInteger(first) || !Number.isInteger(last) || first < 1901 || last > 2024 || first > last) throw new RangeError("Invalid drought history selection");
  const points = period === "annual" ? region.annual : region.points.filter(p => Number(p.date.slice(5)) === Number(period));
  return points.filter(p => Number(p.date.slice(0, 4)) >= first && Number(p.date.slice(0, 4)) <= last);
}
