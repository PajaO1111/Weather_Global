import { validPublicationState } from "./public-release.js";

export const atmosphericGasesApiBase = "atmospheric-gases-api/v1/";
export const atmosphericGasesVersion = "noaa-gml-global-gases-2026-11-06-7d7";

export const atmosphericGasSources = {
  ch4: {
    file: "ch4-monthly.txt",
    sha256: "b51e4a4e65275290365977bc1c7490d0e4290e2a0fd980c8a75e848e1d09f629",
    rows: 516,
    first: "1983-07",
    last: "2026-06",
    url: "https://gml.noaa.gov/ccgg/trends_ch4/",
  },
  n2o: {
    file: "n2o-monthly.txt",
    sha256: "0e26d0e65593b894052cddda15c845442b03039df6385c7afb6e439e45944e76",
    rows: 306,
    first: "2001-01",
    last: "2026-06",
    url: "https://gml.noaa.gov/ccgg/trends_n2o/",
  },
};

const isDigest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const monthKey = date => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
const validNumber = value => Number.isFinite(value) && value >= 0;

export function parseAtmosphericGasSource(text, gas) {
  const expected = atmosphericGasSources[gas];
  if (!Object.hasOwn(atmosphericGasSources, gas) || typeof text !== "string") {
    throw new TypeError("Unknown atmospheric gas source");
  }
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(\d{4})\s+(\d{1,2})\s+(\d+\.\d+)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/);
    if (!match) throw new Error(`Malformed ${gas.toUpperCase()} monthly source row`);
    const [, yearText, monthText, decimalYear, average, averageUncertainty, trend, trendUncertainty] = match;
    const year = Number(yearText), month = Number(monthText);
    if (month < 1 || month > 12) throw new Error(`Invalid ${gas.toUpperCase()} month`);
    const nullableUncertainty = value => value === -9.9 || value === -9.99 ? null : value;
    const point = {
      date: `${yearText}-${String(month).padStart(2, "0")}`,
      decimal_year: Number(decimalYear),
      average: Number(average),
      average_uncertainty: nullableUncertainty(Number(averageUncertainty)),
      trend: Number(trend),
      trend_uncertainty: nullableUncertainty(Number(trendUncertainty)),
    };
    if (!validNumber(point.average) || !validNumber(point.trend)
      || (point.average_uncertainty !== null && !validNumber(point.average_uncertainty))
      || (point.trend_uncertainty !== null && !validNumber(point.trend_uncertainty))) {
      throw new Error(`Invalid ${gas.toUpperCase()} measurement`);
    }
    rows.push(point);
  }
  if (rows.length !== expected.rows || rows[0]?.date !== expected.first
    || rows.at(-1)?.date !== expected.last) {
    throw new Error(`Unexpected ${gas.toUpperCase()} coverage`);
  }
  for (let index = 1; index < rows.length; index++) {
    if (monthKey(rows[index].date) !== monthKey(rows[index - 1].date) + 1) {
      throw new Error(`Nonconsecutive ${gas.toUpperCase()} monthly series`);
    }
  }
  return rows;
}

export function validateAtmosphericGasesCatalog(catalog) {
  return catalog?.schema_version === 1
    && catalog.version === atmosphericGasesVersion
    && validPublicationState(catalog)
    && catalog.api_base === atmosphericGasesApiBase
    && catalog.product?.file === "bundle.json"
    && catalog.product.version === atmosphericGasesVersion
    && Number.isInteger(catalog.product.bytes) && catalog.product.bytes > 0
    && isDigest(catalog.product.sha256);
}

export function validateAtmosphericGasesBundle(bundle) {
  if (bundle?.schema_version !== 1 || bundle.version !== atmosphericGasesVersion
    || !validPublicationState(bundle) || bundle.quantity !== "global-atmospheric-concentration"
    || bundle.unit !== "ppb" || bundle.source?.provider !== "NOAA Global Monitoring Laboratory"
    || !Array.isArray(bundle.gases) || bundle.gases.length !== 2
    || !Array.isArray(bundle.provenance?.files) || bundle.provenance.files.length !== 2) return false;
  for (const [index, id] of ["ch4", "n2o"].entries()) {
    const expected = atmosphericGasSources[id];
    const gas = bundle.gases[index];
    const source = bundle.provenance.files[index];
    if (gas?.id !== id || gas.unit !== "ppb" || gas.quantity !== "global-atmospheric-concentration"
      || gas.first !== expected.first || gas.last !== expected.last
      || !Array.isArray(gas.points) || gas.points.length !== expected.rows
      || source?.file !== expected.file || source.sha256 !== expected.sha256
      || source.url !== expected.url || source.rows !== expected.rows
      || !isDigest(source.sha256)) return false;
    for (let pointIndex = 0; pointIndex < gas.points.length; pointIndex++) {
      const point = gas.points[pointIndex];
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(point?.date)
        || (pointIndex && monthKey(point.date) !== monthKey(gas.points[pointIndex - 1].date) + 1)
        || !validNumber(point.average) || !validNumber(point.trend)
        || !Number.isFinite(point.decimal_year)
        || (point.average_uncertainty !== null && !validNumber(point.average_uncertainty))
        || (point.trend_uncertainty !== null && !validNumber(point.trend_uncertainty))) return false;
    }
    if (gas.points[0].date !== expected.first || gas.points.at(-1).date !== expected.last
      || gas.points.filter(point => point.average_uncertainty === null).length !== 5
      || gas.points.filter(point => point.trend_uncertainty === null).length !== 5) return false;
  }
  return bundle.gases[0].id === "ch4" && bundle.gases[1].id === "n2o";
}
