/* ====================================================
   AR6 SEA-LEVEL CONTRACT
   Original confidence-output p-box quantiles, not a model min–max ensemble.
   ==================================================== */
export const seaLevelScenarios = ["ssp126", "ssp245", "ssp370", "ssp585"];
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const https = (value) => typeof value === "string" && value.startsWith("https://");

/** Validates the optional 7B payload while allowing older releases to omit it. */
export function validateSeaLevel(data) {
  if (!record(data) || data.schema_version !== 1 || data.version !== "20210809"
    || data.unit !== "mm" || data.reference_period !== "1995-2014" || data.location_id !== -1
    || data.confidence !== "medium_confidence" || data.statistic !== "confidence_output_pbox"
    || data.license !== "CC-BY-4.0" || !digest(data.source_manifest_sha256)
    || !["product", "provider", "geography", "central_definition", "interval_definition", "workflow_definition", "acknowledgement"]
      .every((key) => typeof data[key] === "string" && data[key].trim())
    || !["source_url", "record_url", "documentation_url", "baseline_documentation_url", "license_url"].every((key) => https(data[key]))
    || !Array.isArray(data.citations) || data.citations.length !== 3
    || !data.citations.every((item) => record(item) && typeof item.text === "string" && item.text && https(item.url))
    || !Array.isArray(data.quantiles) || data.quantiles.length !== 107
    || data.quantiles[0] !== 0 || data.quantiles.at(-1) !== 1
    || !data.quantiles.every((q, index, list) => Number.isFinite(q) && q >= 0 && q <= 1 && (!index || q > list[index - 1]))
    || ![0.17, 0.5, 0.83].every((q) => data.quantiles.filter((value) => Math.abs(value - q) < 1e-6).length === 1)
    || !record(data.scenarios)
    || Object.keys(data.scenarios).length !== 4
    || !seaLevelScenarios.every((id) => {
      const series = data.scenarios[id];
      return record(series) && digest(series.source_sha256)
        && series.source_file === `total_${id}_medium_confidence_values.nc`
        && typeof series.source_history === "string" && typeof series.source_workflows === "string"
        && Array.isArray(series.points) && series.points.length === 14
        && series.points.every((point, index) => record(point)
          && point.date === String(2020 + 10 * index)
          && Array.isArray(point.values) && point.values.length === 107
          && point.values.every((value, qi, list) => Number.isFinite(value)
            && value !== -32768 && (!qi || value >= list[qi - 1])));
    })) return false;
  return true;
}

/** Extracts published q17/q50/q83 without rounding, interpolation or rebasing. */
export function seaLevelPoints(data, scenario) {
  const indexes = [0.17, 0.5, 0.83].map((q) => data.quantiles.findIndex((value) => Math.abs(value - q) < 1e-6));
  return data.scenarios[scenario].points.map((point) => ({
    date: point.date, source_time: Number(point.date),
    minimum: point.values[indexes[0]], value: point.values[indexes[1]],
    maximum: point.values[indexes[2]], scenario,
  }));
}

/** Splits the methodology boundary, so 2100 and 2110 are never joined visually. */
export function seaLevelSegments(points) {
  return [points.filter((point) => Number(point.date) <= 2100), points.filter((point) => Number(point.date) > 2100)];
}

export const seaLevelWords = {
  cs: {
    nav: "Budoucnost oceánů",
    title: "Globální hladina moře: scénáře AR6",
    intro: "Publikované projekce globální střední hladiny, nikoli pokračování satelitního měření ani předpověď lokálního zaplavení.",
    unavailable: "Toto vydání dat ještě neobsahuje ověřené oceánské projekce. Historická data zůstávají dostupná.",
    baseline: "Změna vůči průměru 1995–2014 · mm · globální průměr · původní verze 20210809",
    central: "q50: průměr mediánů pracovních postupů",
    interval: "Pásmo q17–q83: pravděpodobný rozsah (likely range)",
    method: "Soubor confidence_output je pravděpodobnostní obálka (p-box), nikoli jedna pravděpodobnostní distribuce. q50 je průměr mediánů zahrnutých pracovních postupů. Dolní q17 je minimum příslušného kvantilu a horní q83 maximum příslušného kvantilu napříč postupy. Nejde o minimum–maximum 19 modelů tas ani o meze možného vývoje. „Likely“ v terminologii IPCC znamená pravděpodobnost alespoň 66 %; nejde o záruku ani o pravděpodobnost emisního scénáře.",
    confidence: "Pouze procesy hodnocené se střední mírou důvěry (medium confidence). Důvěra v procesy není totéž co pravděpodobnost rozsahu. Větve zahrnující procesy s nízkou mírou důvěry nejsou zahrnuty; vyšší vzestup nelze vyloučit.",
    steps: "Pouze publikované body 2020–2150 po 10 letech. Symboly označují data; spojnice a pásma mezi nimi jsou jen grafická vodítka, nikoli roční hodnoty. Rok 2126 se neinterpoluje a rok 2300 není v tomto produktu střední důvěry. I body 2020 jsou projekce, nikoli pozorování.",
    boundary: "Mezera mezi 2100 a 2110 je záměrná: zdroj přechází z p-boxu 1e na 1f, protože se mění dostupné procesní modely. Možná nespojitost je metodická, ne odhad náhlého fyzikálního skoku.",
    limits: "Není to mapa povodní ani místní relativní hladina pobřeží. Místní pohyb pevniny a oceánská dynamika se mohou lišit. Historická NOAA LSA má jinou referenci a korekce; není zde spojena s projekcemi. Jde o jiný produkt než teplotní CMIP6 ensemble tas.",
    lower: "q17 (mm)", upper: "q83 (mm)", centralColumn: "q50 (mm)",
    source: "Zdroj, licence a reprodukovatelnost",
    all: "Všechny čtyři scénáře",
    sourceHashes: "Původní soubory a SHA-256",
  },
  en: {
    nav: "Ocean futures",
    title: "Global sea level: AR6 scenarios",
    intro: "Published global mean sea-level projections, not an extension of satellite observations or a forecast of local flooding.",
    unavailable: "This data release does not yet contain verified ocean projections. Historical data remain available.",
    baseline: "Change relative to the 1995–2014 mean · mm · global mean · original version 20210809",
    central: "q50: mean of workflow medians",
    interval: "q17–q83 band: likely range",
    method: "The confidence_output file is a probability box (p-box), not a single probability distribution. q50 is the mean of the included workflow medians. Lower q17 is the minimum of that quantile and upper q83 the maximum of that quantile across workflows. This is not the minimum–maximum of 19 tas models or the bounds of possible outcomes. IPCC “likely” means a probability of at least 66%; it is not a guarantee or a probability assigned to an emissions scenario.",
    confidence: "Only processes assessed with medium confidence are included. Confidence in processes is not the same as the likelihood of a range. Branches incorporating low-confidence processes are omitted; higher sea-level rise cannot be ruled out.",
    steps: "Only published 2020–2150 points at 10-year intervals. Symbols mark data; connecting lines and bands are visual guides, not annual values. No interpolation for 2126; 2300 is outside this medium-confidence product. Even 2020 points are projections, not observations.",
    boundary: "The gap between 2100 and 2110 is intentional: the source switches from p-box 1e to 1f because the available process models change. Any discontinuity is methodological, not an estimate of a sudden physical jump.",
    limits: "Not a flood map or local coastal relative sea level. Local land motion and ocean dynamics may differ. Historical NOAA LSA uses a different reference and corrections; it is not joined to these projections. This product is separate from the CMIP6 tas temperature ensemble.",
    lower: "q17 (mm)", upper: "q83 (mm)", centralColumn: "q50 (mm)",
    source: "Source, license and reproducibility",
    all: "All four scenarios",
    sourceHashes: "Original files and SHA-256",
  },
};
