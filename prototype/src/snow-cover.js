import { validPublicationState } from "./public-release.js";

export const snowApiBase = "snow-cover-api/v1/";
export const snowVersion = "noaa-rutgers-v01r01-20261106-7d3";
export const snowCitation = "Robinson, D. A., Estilow, T. W. and NOAA CDR Program (2012). NOAA Climate Data Record (CDR) of Northern Hemisphere (NH) Snow Cover Extent (SCE), Version 1. NOAA NCEI. https://doi.org/10.7289/V5N014G9. Subset: Rutgers official monthly regional extent text files, accessed 2026-11-06. Project references and complete MAM means calculated separately.";
export const snowRegions = [
  { id: "nh", file: "moncov.nhland.txt", name: { cs: "Severní polokoule", en: "Northern Hemisphere" } },
  { id: "eurasia", file: "moncov.eurasia.txt", name: { cs: "Eurasie", en: "Eurasia" } },
  { id: "na-greenland", file: "moncov.namgnld.txt", name: { cs: "Severní Amerika včetně Grónska", en: "North America including Greenland" } },
  { id: "na", file: "moncov.nam.txt", name: { cs: "Severní Amerika bez Grónska", en: "North America excluding Greenland" } },
];
export const snowMissing = ["1968-07", "1969-06", "1969-07", "1969-08", "1969-09", "1969-10", "1971-07", "1971-08", "1971-09"];
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const close = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= 0.000002;
const key = date => Number(date.slice(0, 4)) * 12 + Number(date.slice(5));
export const snowRound = value => Math.round(value * 1e6) / 1e6;

export function validateSnowCatalog(catalog) {
  return catalog?.schema_version === 1 && catalog.version === snowVersion
    && catalog.api_base === snowApiBase && validPublicationState(catalog)
    && catalog.product?.file === "bundle.json" && catalog.product.version === snowVersion
    && Number.isInteger(catalog.product.bytes) && catalog.product.bytes > 0
    && digest(catalog.product.sha256);
}

export function validateSnowBundle(bundle) {
  if (bundle?.schema_version !== 1 || bundle.version !== snowVersion || !validPublicationState(bundle)
    || bundle.unit !== "km2" || bundle.quantity !== "monthly-land-snow-cover-extent"
    || bundle.period?.first !== "1966-11" || bundle.period?.last !== "2026-10"
    || bundle.source?.doi !== "10.7289/V5N014G9" || bundle.source.version !== "v01r01"
    || bundle.source.citation !== snowCitation || bundle.source.confidence_level !== null
    || bundle.source.aggregation !== "producer-monthly-day-weighted-weekly-extent"
    || bundle.reference_period?.first !== 1981 || bundle.reference_period?.last !== 2010
    || bundle.spring_method !== "MAM-complete-months-31-30-31-days"
    || !digest(bundle.provenance?.manifest_sha256) || !digest(bundle.provenance.builder_sha256)
    || !Array.isArray(bundle.provenance.files) || bundle.provenance.files.length !== 9
    || !Array.isArray(bundle.regions) || bundle.regions.length !== 4) return false;
  for (const [index, region] of bundle.regions.entries()) {
    const definition = snowRegions[index];
    if (region?.id !== definition.id || region.name?.cs !== definition.name.cs || region.name?.en !== definition.name.en
      || region.source_file !== definition.file || region.points?.length !== 720
      || region.reference?.length !== 13 || region.spring?.length !== 61) return false;
    for (const [pointIndex, point] of region.points.entries()) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(point?.date)
        || key(point.date) !== key("1966-11") + pointIndex) return false;
      if (snowMissing.includes(point.date)) {
        if (point.extent !== null || point.anomaly !== null || point.reason !== "missing-source") return false;
      } else if (!Number.isInteger(point.extent) || point.extent < 0 || point.extent > 80_000_000
        || !Number.isFinite(point.anomaly) || point.reason !== null) return false;
    }
    for (const [i, spring] of region.spring.entries()) {
      const year = 1966 + i;
      const values = region.points.filter(point => point.date >= `${year}-03` && point.date <= `${year}-05`);
      if (spring.year !== year) return false;
      if (values.length !== 3 || values.some(point => point.extent === null)) {
        if (spring.extent !== null || spring.anomaly !== null || spring.reason !== "incomplete-MAM") return false;
      } else if (!close(spring.extent, (values[0].extent * 31 + values[1].extent * 30 + values[2].extent * 31) / 92)
        || spring.reason !== null) return false;
    }
    for (const [i, ref] of region.reference.entries()) {
      const period = i === 12 ? "MAM" : String(i + 1);
      const values = i === 12
        ? region.spring.filter(point => point.year >= 1981 && point.year <= 2010)
        : region.points.filter(point => point.date >= "1981-01" && point.date <= "2010-12" && Number(point.date.slice(5)) === i + 1);
      if (ref.period !== period || ref.count !== 30 || values.length !== 30 || values.some(point => point.extent === null)
        || !close(ref.mean, values.reduce((sum, point) => sum + point.extent, 0) / 30)) return false;
      const all = i === 12 ? region.spring : region.points.filter(point => Number(point.date.slice(5)) === i + 1);
      if (all.some(point => point.extent !== null && !close(point.anomaly, point.extent - ref.mean))) return false;
    }
    const source = bundle.provenance.files.find(row => row?.file === definition.file);
    if (!source || !digest(source.sha256) || !Number.isInteger(source.bytes) || source.bytes <= 0
      || source.url !== `https://climate.rutgers.edu/snowcover/190km/files/${definition.file}`) return false;
  }
  for (let i = 0; i < 720; i++) {
    const [nh, eu, na, noGreenland] = bundle.regions.map(region => region.points[i].extent);
    if (nh !== null && (Math.abs(nh - eu - na) > 1 || noGreenland > na)) return false;
  }
  return bundle.provenance.files.every(row => digest(row.sha256) && row.bytes > 0 && row.url.startsWith("https://climate.rutgers.edu/snowcover/190km/"));
}

export function snowHistory(region, period, first, last) {
  if (!["MAM", ...Array.from({ length: 12 }, (_, i) => String(i + 1))].includes(period)
    || !Number.isInteger(first) || !Number.isInteger(last) || first < 1966 || last > 2026 || first > last) {
    throw new RangeError("Invalid snow history selection");
  }
  return period === "MAM" ? region.spring.filter(point => point.year >= first && point.year <= last)
    : region.points.filter(point => Number(point.date.slice(5)) === Number(period)
      && Number(point.date.slice(0, 4)) >= first && Number(point.date.slice(0, 4)) <= last);
}

export function snowSeason(region, year) {
  if (!Number.isInteger(year) || year < 1966 || year > 2026) throw new RangeError("Invalid snow season year");
  return Array.from({ length: 12 }, (_, i) => {
    const date = `${year}-${String(i + 1).padStart(2, "0")}`;
    return region.points.find(point => point.date === date)
      ?? { date, extent: null, anomaly: null, reason: "outside-source-period" };
  });
}
