import { validPublicationState } from "./public-release.js";

export const seaIceApiBase = "sea-ice-api/v1/";
export const seaIceVersion = "nsidc-g02135-v4-20261106-7d1";
export const seaIceCitation = "Fetterer, F., Knowles, K., Meier, W. N., Savoie, M., Windnagel, A. K. & Stafford, T. (2025). Sea Ice Index (G02135, Version 4). [Data Set]. NSIDC. https://doi.org/10.7265/a98x-0f50. Subset: monthly Northern/Southern Hemisphere extent CSVs. Accessed 2026-11-06.";
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const close = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= 0.0000011;
const monthKey = date => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
const names = { N: { cs: "Arktida", en: "Arctic" }, S: { cs: "Antarktida · mořský led", en: "Antarctic · sea ice" } };

export function validateSeaIceCatalog(catalog) {
  return catalog?.schema_version === 1 && catalog.version === seaIceVersion
    && validPublicationState(catalog) && catalog.api_base === seaIceApiBase
    && catalog.product?.file === "bundle.json" && catalog.product.version === seaIceVersion
    && Number.isInteger(catalog.product.bytes) && catalog.product.bytes > 0
    && digest(catalog.product.sha256);
}

export function validateSeaIceBundle(bundle) {
  if (bundle?.schema_version !== 1 || bundle.version !== seaIceVersion
    || !validPublicationState(bundle) || bundle.unit !== "million km2"
    || bundle.quantity !== "monthly-sea-ice-extent" || bundle.source?.doi !== "10.7265/a98x-0f50"
    || bundle.source.product !== "G02135" || bundle.source.version !== 4
    || bundle.source.citation !== seaIceCitation
    || bundle.source.retrieved !== "2026-11-06" || bundle.source.threshold_percent !== 15
    || bundle.period?.first !== "1978-11" || bundle.period?.last !== "2026-10"
    || bundle.reference_period?.first !== 1981 || bundle.reference_period?.last !== 2010
    || bundle.reference_period.method !== "available-calendar-month-mean-no-fill"
    || !digest(bundle.provenance?.manifest_sha256) || !digest(bundle.provenance?.builder_sha256)
    || !Array.isArray(bundle.provenance.files) || bundle.provenance.files.length !== 24
    || !Array.isArray(bundle.regions) || bundle.regions.length !== 2) return false;
  for (const [index, region] of bundle.regions.entries()) {
    const id = ["N", "S"][index];
    if (region?.id !== id || region.name?.cs !== names[id].cs || region.name?.en !== names[id].en
      || !Array.isArray(region.points) || region.points.length !== 576
      || !Array.isArray(region.reference) || region.reference.length !== 12) return false;
    for (const [pointIndex, point] of region.points.entries()) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(point?.date)
        || monthKey(point.date) !== monthKey("1978-11") + pointIndex) return false;
      const gap = ["1987-12", "1988-01"].includes(point.date);
      if (gap) {
        if (point.extent !== null || point.anomaly !== null || point.source_dataset !== null
          || point.reason !== "missing-source") return false;
      } else {
        if (!Number.isFinite(point.extent) || point.extent < 0 || point.extent > 40
          || !["NSIDC-0051", "NSIDC-0803", "NSIDC-0051,NSIDC-0081"].includes(point.source_dataset)
          || point.reason !== null || !Number.isFinite(point.anomaly)) return false;
      }
    }
    for (let month = 1; month <= 12; month++) {
      const reference = region.reference[month - 1];
      const selected = region.points.filter(point => Number(point.date.slice(5)) === month
        && point.date >= "1981-01" && point.date <= "2010-12" && point.extent !== null);
      const missing = month === 1 ? [1988] : month === 12 ? [1987] : [];
      if (reference?.month !== month || reference.count !== selected.length
        || reference.count !== (missing.length ? 29 : 30)
        || JSON.stringify(reference.missing_years) !== JSON.stringify(missing)
        || !close(reference.mean, selected.reduce((sum, point) => sum + point.extent, 0) / selected.length)) return false;
      for (const point of region.points.filter(point => Number(point.date.slice(5)) === month && point.extent !== null)) {
        if (!close(point.anomaly, point.extent - reference.mean)) return false;
      }
      const file = bundle.provenance.files.find(row => row?.file === `${id}_${String(month).padStart(2, "0")}_extent_v4.0.csv`);
      if (!file || !digest(file.sha256) || !Number.isInteger(file.bytes) || file.bytes <= 0
        || file.url !== `https://noaadata.apps.nsidc.org/NOAA/G02135/${id === "N" ? "north" : "south"}/monthly/data/${file.file}`) return false;
    }
  }
  return true;
}

export function seaIceHistory(region, month, first, last) {
  if (!Number.isInteger(month) || month < 1 || month > 12
    || !Number.isInteger(first) || !Number.isInteger(last) || first > last || first < 1978 || last > 2026) {
    throw new RangeError("Invalid sea ice history selection");
  }
  return region.points.filter(point => Number(point.date.slice(5)) === month
    && Number(point.date.slice(0, 4)) >= first && Number(point.date.slice(0, 4)) <= last);
}

export function seaIceSeason(region, year) {
  if (!Number.isInteger(year) || year < 1978 || year > 2026) throw new RangeError("Invalid sea ice year");
  return Array.from({ length: 12 }, (_, index) => {
    const date = `${year}-${String(index + 1).padStart(2, "0")}`;
    return region.points.find(point => point.date === date)
      ?? { date, extent: null, anomaly: null, source_dataset: null, reason: "outside-source-period" };
  });
}
