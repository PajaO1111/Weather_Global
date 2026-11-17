import { validPublicationState } from "./public-release.js";

export const carbonBudgetApiBase = "carbon-budget-api/v1/";
export const carbonBudgetVersion = "gcb-2025-v1.0-7d6-local-v3";
export const carbonBudgetSources = {
  global: {
    file: "Global_Carbon_Budget_2025_v1.0.xlsx",
    sha256: "a928cf06c57576b66761d1fec8224c9a41a781eb63442afc03ba902858dd64a9",
    doi: "10.18160/GCP-2025",
  },
  nationalFossil: {
    file: "National_Fossil_Carbon_Emissions_2025_v1.0.xlsx",
    sha256: "968097cacb1a6a5bfa0cf74ee90763f74a90ef10499e060ab43d1a74c671d46b",
    doi: "10.18160/GCP-2025",
  },
  nationalLandUse: {
    file: "National_LandUseChange_Carbon_Emissions_2025_v1.0.xlsx",
    sha256: "9a29536d6925d06f8c4a97581b720121fcf219732c240e970bc24167d74e38d1",
    doi: "10.18160/GCP-2025",
  },
};
export const carbonBudgetSource = carbonBudgetSources.global;

const seriesColumns = [
  ["fossil_gtc", 1],
  ["land_use_gtc", 2],
  ["atmospheric_growth_gtc", 3],
  ["ocean_sink_gtc", 4],
  ["terrestrial_sink_gtc", 5],
  ["cement_carbonation_gtc", 6],
  ["imbalance_gtc", 7],
];

function valueAt(row, index, label) {
  const value = row?.[index] ?? null;
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`Invalid ${label} value in GCB workbook`);
  }
  return value;
}

function yearRows(table, first, last, firstRowIndex, mapRow) {
  const rows = [];
  for (let year = first; year <= last; year++) {
    const row = table[firstRowIndex + year - first];
    if (row?.[0] !== year) throw new Error(`Unexpected GCB year row ${year}`);
    rows.push(mapRow(row, year));
  }
  return rows;
}

function budgetPoint(row, year) {
  return {
    year,
    ...Object.fromEntries(seriesColumns.map(([key, column]) => [
      key,
      valueAt(row, column, key),
    ])),
  };
}

function normalizedName(value) {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
}

function stableId(value) {
  return normalizedName(value).replace(/\s+/g, "-");
}

function checkedTable(tables, name) {
  const table = tables?.[name];
  if (!Array.isArray(table)) throw new Error(`Missing parsed GCB table: ${name}`);
  return table;
}

function tableYearHeader(table, name) {
  const index = table.findIndex(row => normalizedName(row?.[0]) === "year");
  if (index < 0) throw new Error(`Missing year header in GCB table: ${name}`);
  return index;
}

function buildComponentEstimates(tables) {
  const definitions = [
    ["atmospheric-growth", "Atmospheric Growth"],
    ["ocean-sink", "Ocean Sink"],
    ["terrestrial-sink", "Terrestrial Sink"],
    ["cement-carbonation", "Cement Carbonation Sink"],
  ];
  return {
    unit: "GtC/yr",
    first: 1959,
    last: 2024,
    components: definitions.map(([id, sheet]) => {
      const table = checkedTable(tables, sheet);
      const headerIndex = tableYearHeader(table, sheet);
      const points = yearRows(table, 1959, 2024, headerIndex + 1, (row, year) => ({
        year,
        values: row,
      }));
      const header = table[headerIndex];
      const estimates = [];
      for (let column = 1; column < header.length; column++) {
        const label = header[column];
        if (typeof label !== "string" || !label.trim()) continue;
        const values = points.map(point => valueAt(point.values, column, `${sheet} ${label}`));
        if (!values.some(value => value !== null)) continue;
        const key = normalizedName(label);
        estimates.push({
          id: `${column + 1}-${stableId(label)}`,
          label: label.trim(),
          kind: /(^| )(sd|standard deviation|spread|uncertainty)( |$)/i.test(key)
            ? "uncertainty" : "estimate",
          values,
        });
      }
      if (!estimates.some(estimate => normalizedName(estimate.label) === "gcb")) {
        throw new Error(`Missing GCB estimate in ${sheet}`);
      }
      return { id, label: sheet, unit: "GtC/yr", estimates };
    }),
  };
}

function groupNamesFromTable(table) {
  return new Set(table.map(row => normalizedName(row?.[0])).filter(Boolean));
}

function buildNationalSeries(table, {
  idRow,
  labelRow,
  first,
  last,
  dataStart,
  groups = new Set(),
  unit,
  aggregates = ["World", "International Shipping", "International Aviation", "Statistical Difference"],
}) {
  const points = yearRows(table, first, last, dataStart, (row, year) => ({
    year,
    values: row,
  }));
  const headers = table[idRow] ?? [];
  const labels = table[labelRow] ?? [];
  const series = [];
  const usedIds = new Set();
  for (let column = 1; column < Math.max(headers.length, labels.length); column++) {
    const header = headers[column];
    const label = labels[column];
    if (typeof label !== "string" || !label.trim()) continue;
    const normalized = normalizedName(label);
    const countryHeader = typeof header === "string"
      && header === header.toUpperCase()
      && /[A-Z]/.test(header);
    const aggregateLabel = aggregates.find(name => normalizedName(name) === normalized);
    if ((!countryHeader || groups.has(normalized)) && !aggregateLabel) continue;
    const id = aggregateLabel ? stableId(aggregateLabel) : stableId(label);
    if (!id || usedIds.has(id)) throw new Error(`Duplicate national series in GCB table: ${label}`);
    usedIds.add(id);
    series.push({
      id,
      label: label.trim(),
      kind: aggregateLabel ? "aggregate" : "country",
      values: points.map(point => valueAt(point.values, column, label)),
    });
  }
  if (!series.some(item => item.id === "world")) {
    throw new Error("Missing world series in national GCB table");
  }
  return { unit, first, last, series };
}

function buildNationalFossil(tables) {
  const territorial = checkedTable(tables, "Territorial Emissions");
  const consumption = checkedTable(tables, "Consumption Emissions");
  const transfers = checkedTable(tables, "Emissions Transfers");
  if (territorial[9]?.[0] !== "MtC/yr"
    || consumption[6]?.[0] !== "MtC/yr"
    || transfers[5]?.[0] !== "MtC/yr") {
    throw new Error("Unexpected national fossil emissions unit");
  }
  const groups = groupNamesFromTable(checkedTable(tables, "Regions"));
  return {
    territorial: buildNationalSeries(territorial, {
      idRow: 10, labelRow: 11, first: 1850, last: 2024, dataStart: 12, groups, unit: "MtC/yr",
    }),
    consumption: buildNationalSeries(consumption, {
      idRow: 7, labelRow: 8, first: 1990, last: 2020, dataStart: 9, groups, unit: "MtC/yr",
    }),
    transfers: buildNationalSeries(transfers, {
      idRow: 7, labelRow: 8, first: 1990, last: 2020, dataStart: 9, groups, unit: "MtC/yr",
    }),
  };
}

function buildNationalLandUse(tables) {
  const models = ["BLUE", "OSCAR", "LUCE"].map(name => {
    const table = checkedTable(tables, name);
    if (table[7]?.[0] !== "unit: Tg C/year") {
      throw new Error(`Unexpected unit in national land-use model ${name}`);
    }
    const points = yearRows(table, 1850, 2024, 8, (row, year) => ({ year, values: row }));
    const headers = table[7] ?? [];
    const countries = [];
    let global;
    for (let column = 1; column < headers.length; column++) {
      const label = headers[column];
      if (typeof label !== "string" || !label.trim()) continue;
      const normalized = normalizedName(label);
      const values = points.map(point => valueAt(point.values, column, `${name} ${label}`));
      if (normalized === "global") {
        global = { id: "global", label: "Global", kind: "aggregate", values };
      } else if (!["other", "disputed", "eu27"].includes(normalized)) {
        countries.push({ id: stableId(label), label: label.trim(), kind: "country", values });
      }
    }
    if (!global) throw new Error(`Missing global estimate in national land-use model ${name}`);
    const ids = countries.map(item => item.id);
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate countries in national land-use model ${name}`);
    return {
      id: name.toLowerCase(),
      label: name,
      series: [...countries, global],
    };
  });
  return { unit: "TgC/yr", first: 1850, last: 2024, models };
}

export function buildCarbonBudgetBundle(tables, { sourceSha256 }) {
  const hashes = typeof sourceSha256 === "string"
    ? { global: sourceSha256 }
    : sourceSha256;
  for (const [source, definition] of Object.entries(carbonBudgetSources)) {
    if (hashes?.[source] !== definition.sha256) {
      throw new Error(`GCB ${source} source checksum mismatch`);
    }
  }
  const globalTables = tables?.global;
  const nationalFossilTables = tables?.nationalFossil;
  const nationalLandUseTables = tables?.nationalLandUse;
  for (const [name, sourceTables] of Object.entries({
    global: globalTables,
    nationalFossil: nationalFossilTables,
    nationalLandUse: nationalLandUseTables,
  })) {
    if (!sourceTables || typeof sourceTables !== "object" || Array.isArray(sourceTables)) {
      throw new Error(`Missing parsed GCB source tables: ${name}`);
    }
  }
  for (const sheet of [
    "Global Carbon Budget",
    "Historical Budget",
    "Fossil Emissions by Category",
    "Land-Use Change Emissions",
  ]) {
    checkedTable(globalTables, sheet);
  }
  if (globalTables["Fossil Emissions by Category"][7]?.[0] !== "GtC/yr") {
    throw new Error("Unexpected fossil-category unit in GCB workbook");
  }
  const annual = yearRows(globalTables["Global Carbon Budget"], 1959, 2024, 22, budgetPoint);
  const historical = yearRows(globalTables["Historical Budget"], 1750, 2024, 16, budgetPoint);
  const fossil = yearRows(
    globalTables["Fossil Emissions by Category"],
    1850,
    2024,
    9,
    (row, year) => ({
      year,
      total_gtc: valueAt(row, 1, "fossil total"),
      coal_gtc: valueAt(row, 2, "coal"),
      oil_gtc: valueAt(row, 3, "oil"),
      gas_gtc: valueAt(row, 4, "gas"),
      cement_gtc: valueAt(row, 5, "cement"),
      flaring_gtc: valueAt(row, 6, "flaring"),
      other_gtc: valueAt(row, 7, "other"),
      per_capita_tc: valueAt(row, 8, "per capita"),
    }),
  );
  const landUseModels = yearRows(
    globalTables["Land-Use Change Emissions"],
    1959,
    2024,
    40,
    (row, year) => ({
      year,
      gcb_gtc: valueAt(row, 1, "GCB land-use"),
      blue_gtc: valueAt(row, 8, "BLUE land-use"),
      oscar_gtc: valueAt(row, 13, "OSCAR land-use"),
      luce_gtc: valueAt(row, 18, "LUCE land-use"),
    }),
  );
  const modelByYear = new Map(landUseModels.map(row => [row.year, row]));
  const historicalLandUse = historical.filter(row => row.land_use_gtc !== null);
  const landUse = historicalLandUse.map(row => ({
    year: row.year,
    gcb_gtc: row.land_use_gtc,
    blue_gtc: modelByYear.get(row.year)?.blue_gtc ?? null,
    oscar_gtc: modelByYear.get(row.year)?.oscar_gtc ?? null,
    luce_gtc: modelByYear.get(row.year)?.luce_gtc ?? null,
  }));
  const bundle = {
    schema_version: 3,
    version: carbonBudgetVersion,
    publication_allowed: false,
    source: {
      provider: "Global Carbon Project via ICOS Carbon Portal",
      citation: "Friedlingstein et al. (2025). Global Carbon Budget 2025. Earth System Science Data. https://doi.org/10.5194/essd-2025-659",
      doi: carbonBudgetSource.doi,
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      file: carbonBudgetSource.file,
    },
    sources: Object.fromEntries(Object.entries(carbonBudgetSources).map(([id, source]) => [
      id,
      { file: source.file, doi: source.doi, sha256: source.sha256 },
    ])),
    views: {
      annual_budget: {
        unit: "GtC/yr",
        first: 1959,
        last: 2024,
        points: annual,
      },
      historical_budget: {
        unit: "GtC/yr",
        first: 1750,
        last: 2024,
        points: historical,
      },
      fossil_categories: {
        unit: "GtC/yr",
        first: 1850,
        last: 2024,
        points: fossil,
      },
      land_use: {
        unit: "GtC/yr",
        first: 1850,
        last: 2024,
        points: landUse,
      },
      component_estimates: buildComponentEstimates(globalTables),
      national_fossil: buildNationalFossil(nationalFossilTables),
      national_land_use: buildNationalLandUse(nationalLandUseTables),
    },
    provenance: {
      source_sha256: hashes,
      historical_method_boundary_year: 1959,
    },
  };
  if (!validateCarbonBudgetBundle(bundle)) throw new Error("Generated GCB bundle failed validation");
  return bundle;
}

function sequential(points, first, last, fields, allowNull) {
  if (!Array.isArray(points) || points.length !== last - first + 1) return false;
  return points.every((point, index) => point?.year === first + index
    && fields.every(field => allowNull
      ? point[field] === null || (typeof point[field] === "number" && Number.isFinite(point[field]))
      : typeof point[field] === "number" && Number.isFinite(point[field])));
}

export function validateCarbonBudgetBundle(bundle) {
  if (bundle?.schema_version !== 3 || bundle.version !== carbonBudgetVersion
    || !validPublicationState(bundle)
    || bundle.source?.doi !== carbonBudgetSource.doi
    || bundle.source?.file !== carbonBudgetSource.file
    || bundle.source?.license !== "CC BY 4.0"
    || Object.entries(carbonBudgetSources).some(([id, source]) =>
      bundle.provenance?.source_sha256?.[id] !== source.sha256
      || bundle.sources?.[id]?.file !== source.file
      || bundle.sources?.[id]?.doi !== source.doi
      || bundle.sources?.[id]?.sha256 !== source.sha256)
    || bundle.provenance?.historical_method_boundary_year !== 1959
    || !bundle.views || typeof bundle.views !== "object") return false;
  const budgetFields = seriesColumns.map(([key]) => key);
  const annual = bundle.views.annual_budget;
  const historical = bundle.views.historical_budget;
  const fossil = bundle.views.fossil_categories;
  const landUse = bundle.views.land_use;
  const baseViewsValid = annual?.unit === "GtC/yr" && annual.first === 1959 && annual.last === 2024
    && sequential(annual.points, 1959, 2024, budgetFields, false)
    && historical?.unit === "GtC/yr" && historical.first === 1750 && historical.last === 2024
    && sequential(historical.points, 1750, 2024, budgetFields, true)
    && historical.points.slice(0, 100).every(point => point.land_use_gtc === null)
    && historical.points[100].land_use_gtc !== null
    && fossil?.unit === "GtC/yr" && fossil.first === 1850 && fossil.last === 2024
    && sequential(fossil.points, 1850, 2024, [
      "total_gtc", "coal_gtc", "oil_gtc", "gas_gtc", "cement_gtc",
      "flaring_gtc", "other_gtc", "per_capita_tc",
    ], false)
    && landUse?.unit === "GtC/yr" && landUse.first === 1850 && landUse.last === 2024
    && sequential(landUse.points, 1850, 2024, [
      "gcb_gtc", "blue_gtc", "oscar_gtc", "luce_gtc",
    ], true)
    && landUse.points.every(point => point.gcb_gtc !== null)
    && landUse.points.slice(0, 109).every(point =>
      point.blue_gtc === null && point.oscar_gtc === null && point.luce_gtc === null);
  if (!baseViewsValid) return false;
  const components = bundle.views.component_estimates;
  const componentIds = ["atmospheric-growth", "ocean-sink", "terrestrial-sink", "cement-carbonation"];
  if (components?.unit !== "GtC/yr" || components.first !== 1959 || components.last !== 2024
    || !Array.isArray(components.components)
    || components.components.length !== componentIds.length
    || components.components.some((component, index) =>
      component.id !== componentIds[index] || component.unit !== components.unit
      || !Array.isArray(component.estimates)
      || !component.estimates.some(estimate => estimate.kind === "estimate"
        && normalizedName(estimate.label) === "gcb")
      || component.estimates.some(estimate => !estimate.id || !estimate.label
        || !["estimate", "uncertainty"].includes(estimate.kind)
        || !validValues(estimate.values, 66)))) return false;
  const national = bundle.views.national_fossil;
  if (!validNationalTable(national?.territorial, 1850, 2024, "MtC/yr")
    || !validNationalTable(national?.consumption, 1990, 2020, "MtC/yr")
    || !validNationalTable(national?.transfers, 1990, 2020, "MtC/yr")
    || !national.territorial.series.some(series => series.id === "china" && series.kind === "country")
    || !national.territorial.series.some(series => series.id === "world" && series.kind === "aggregate")
    || national.consumption.series.some(series => series.values.length !== 31)
    || national.transfers.series.some(series => series.values.length !== 31)) return false;
  const nationalLandUse = bundle.views.national_land_use;
  return nationalLandUse?.unit === "TgC/yr"
    && nationalLandUse.first === 1850 && nationalLandUse.last === 2024
    && Array.isArray(nationalLandUse.models)
    && nationalLandUse.models.map(model => model.id).join(",") === "blue,oscar,luce"
    && nationalLandUse.models.every(model =>
      Array.isArray(model.series)
      && model.series.some(series => series.id === "china" && series.kind === "country")
      && model.series.some(series => series.id === "global" && series.kind === "aggregate")
      && validSeries(model.series, 175, ["country", "aggregate"]));
}

function validValues(values, length) {
  return Array.isArray(values) && values.length === length
    && values.every(value => value === null
      || (typeof value === "number" && Number.isFinite(value)));
}

function validSeries(series, length, kinds = ["country", "aggregate"]) {
  if (!Array.isArray(series) || series.length === 0) return false;
  const ids = new Set();
  return series.every(item => {
    if (typeof item?.id !== "string" || !item.id || ids.has(item.id)
      || typeof item.label !== "string" || !item.label
      || !kinds.includes(item.kind) || !validValues(item.values, length)) return false;
    ids.add(item.id);
    return true;
  });
}

function validNationalTable(table, first, last, unit) {
  return table?.unit === unit && table.first === first && table.last === last
    && validSeries(table.series, last - first + 1);
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function validateCarbonBudgetCatalog(catalog) {
  return catalog?.schema_version === 1
    && catalog.version === carbonBudgetVersion
    && validPublicationState(catalog)
    && catalog.api_base === carbonBudgetApiBase
    && catalog.product?.file === "bundle.json"
    && catalog.product.version === carbonBudgetVersion
    && Number.isInteger(catalog.product.bytes) && catalog.product.bytes > 0
    && isSha256(catalog.product.sha256);
}
