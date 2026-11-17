import * as echarts from "echarts/core";
import { LineChart, MapChart } from "echarts/charts";
import {
  AriaComponent,
  GeoComponent,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import {
  historyComparisonApiBase,
  historyComparisonMethods,
  historyRegionIds,
  historySymmetricExtent,
  validateHistoryComparisonBundle,
  validateHistoryComparisonCatalog,
} from "./history-comparison.js";
import { chartExplanation } from "./chart-explanation.js";

echarts.use([LineChart, MapChart, AriaComponent, GeoComponent, GridComponent, TooltipComponent,
  VisualMapComponent, SVGRenderer]);

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

const words = {
  cs: {
    title: "Pozorovací historická srovnání světadílů",
    subtitle: "Dvě oddělené analýzy stejného historického zdroje, nikoli projekce.",
    notice: "Ověřený datový pohled. Odhady a omezení jsou uvedeny samostatně.",
    loading: "Načítání ověřeného katalogu a dat…",
    method: "Způsob prostorového odhadu",
    conservative: "Konzervativní · bez projektového doplňování",
    exploratory: "Explorativní",
    region: "Světadíl",
    period: "Časové období",
    common: "Společné validní období šesti světadílů",
    all: "Všechna dostupná léta",
    year: "Rok mapy",
    compare: "Světadíly v čárovém grafu",
    multiHint: "Vyberte jeden nebo více světadílů (Ctrl/⌘ pro vícenásobný výběr).",
    mapHeading: "Roční anomálie podle světadílu",
    lineHeading: "Srovnání časových řad",
    mapHelp: "Každý vyplněný tvar ukazuje jednu plošně agregovanou roční hodnotu. Barva používá symetrickou škálu kolem nuly; nevykresluje místní prostorové gradienty. Šedá znamená chybějící hodnotu.",
    table: "Přístupná tabulka ročních hodnot a pokrytí",
    page: "Strana",
    previous: "Předchozí",
    next: "Další",
    yearLabel: "Rok",
    continent: "Světadíl",
    value: "Anomálie (°C)",
    coverage: "Celkové pokrytí",
    sourceCoverage: "Zdrojové pokrytí",
    spatial: "Prostorový odhad",
    temporal: "Časový odhad",
    estimate: "Odhadovaný podíl celkem",
    longRange: "Statický diagnostický podíl >250 km",
    longRangeNote: "Podíl >250 km je statický diagnostický údaj z metadat vzdálenosti buněk od stanic; není to podíl pozorovaných stanic v daném historickém roce.",
    status: "Stav",
    missing: "Chybí",
    availableStatus: "Dostupná hodnota",
    estimatedStatus: "Odhadnutá hodnota",
    blockedStatus: "Blokováno geometrií",
    missingReasons: {
      "incomplete-source-year": "Neúplný zdrojový rok",
      "insufficient-spatial-coverage": "Nedostatečné prostorové pokrytí",
      "provisional-antarctic-geography": "Předběžná antarktická geografie",
    },
    reasons: "Důvod chybějící hodnoty",
    localOnly: "Tento náhled zobrazuje pouze roční hodnoty pro vymezená prostorová a časová data. Neodhaduje hodnoty před začátkem ani po konci záznamu.",
    distinctionsTitle: "Jak tyto dvě řady souvisí",
    distinctions: "NASA GISTEMP 1200 km je analýza odvozená z pozorování s prostorovým odhadem, nikoli soubor surových přímých pozorování. Jde o anomálie vzduchu nad pevninou podle světadílu; oceán není zahrnut a sedm hodnot se nesmí průměrovat ani vydávat za globální index. Konzervativní a explorativní výsledek jsou dvě metodické varianty stejného zdroje; nejde o projekce, směrodatnou nejistotu ani dvě nezávislé klimatické realizace. Řady se nespojují s CMIP6 ani scénáři SSP.",
    fractionLegend: "Podíly jsou plošně vážené podle dnů a vztahují se k celé ploše světadílu: zdrojové pokrytí tvoří plocha s platnou hodnotou NASA, prostorový odhad doplňuje jinou část území a časový odhad doplňuje chybějící roky pouze uvnitř záznamu. Tři složky se nepřekrývají a jejich součet odpovídá celkovému pokrytí.",
    uncertainty: "Projektové podíly odhadů nejsou celkovou nejistotou původního NASA produktu. Podíl >250 km popisuje jen část zdrojového pokrytí vzdálenou od stanic; není to chyba ani nejistota.",
    holdoutTitle: "Zadržené kontroly",
    holdoutNote: "Kontroly používají jednotlivé buňky již prostorově vyhlazené analýzy NASA, nikoli nezávislé stanice; výsledky nejsou intervaly spolehlivosti ani meze nejistoty.",
    twoMonthHoldout: "Časová kontrola dvouměsíční mezery",
    sensitivity: "Citlivost 250 km proti 1200 km",
    sensitivityNote: "Rozdíl metod je citlivostní analýza, nikoli chyba vůči pravdě nebo interval nejistoty.",
    validYears: "platných let",
    methodHeading: "Metodika a omezení",
    conservativeText: "Konzervativní varianta používá NASA 1200 km bez projektového doplňování. Jde stále o pozorovací analýzu s vlastní prostorovou interpolací NASA, nikoli o přímá měření.",
    exploratoryText: "Explorativní varianta dovoluje omezený prostorový a interní časový odhad podle popisu balíčku. Odhady zůstávají uvnitř záznamu a nemění chybějící hodnotu na nulu.",
    methodsFromArtifact: "Metodický popis ověřeného datového balíčku",
    sourceHeading: "Zdroj a citace",
    source: "Zdroj",
    citation: "Citace",
    sourcePeriod: "Období zdroje",
    publication: "Regionální zpracování je úpravou projektu, nikoli oficiálním produktem NASA. Zdroj NASA GISS/GISTEMP citujeme; nejde o záštitu NASA.",
    glossaryHeading: "Slovníček",
    glossary: [
      ["Anomálie", "Odchylka teploty od referenčního průměru 1981–2010; nejde o absolutní teplotu."],
      ["Pokrytí", "Podíl plochy světadílu doložený zdrojem nebo interně odhadnutý podle zvolené metody; samo o sobě neudává nejistotu."],
      ["Prostorový odhad", "Plocha bez přímo platné zdrojové hodnoty doplněná prostorovým postupem uvnitř oblasti."],
      ["Časový odhad", "Chybějící rok doplněný pouze mezi roky existujícího zdrojového záznamu; žádné extrapolace."],
      ["Vzdálenost >250 km", "Podíl zdrojové podpory spojený se stanicemi vzdálenými přes 250 km; nejde o míru nejistoty."],
    ],
    provisionalAntarctica: "Antarktida používá předběžnou geometrii: nejde o certifikovanou plochu uzemněné pevniny a nepodporuje tvrzení o uzemněném území ani hmotnosti ledu.",
    noCommon: "Společné validní období šesti světadílů není k dispozici.",
    error: "Ověřený balíček historického srovnání není dostupný nebo neodpovídá kontraktu.",
    retry: "Zkusit znovu",
    allRegionsUnavailable: "Pro zvolené období nejsou dostupné hodnoty.",
  },
  en: {
    title: "Continental observational history comparison",
    subtitle: "Two separate analyses of the same historical source, not projections.",
    notice: "Verified data view. Estimates and limitations are stated separately.",
    loading: "Loading the verified catalogue and data…",
    method: "Spatial-estimation method",
    conservative: "Conservative · no project gap filling",
    exploratory: "Exploratory",
    region: "Continent",
    period: "Time period",
    common: "Common valid period across six continents",
    all: "All available years",
    year: "Map year",
    compare: "Continents in line chart",
    multiHint: "Select one or more continents (Ctrl/⌘ for multiple selection).",
    mapHeading: "Annual anomaly by continent",
    lineHeading: "Time-series comparison",
    mapHelp: "Each filled shape shows one area-aggregated annual value. Colour uses a symmetric scale around zero; it does not draw local spatial gradients. Grey means missing.",
    table: "Accessible annual values and coverage table",
    page: "Page",
    previous: "Previous",
    next: "Next",
    yearLabel: "Year",
    continent: "Continent",
    value: "Anomaly (°C)",
    coverage: "Total coverage",
    sourceCoverage: "Source coverage",
    spatial: "Spatial estimate",
    temporal: "Temporal estimate",
    estimate: "Estimated share total",
    longRange: "Static diagnostic share >250 km",
    longRangeNote: "The >250 km share is a static diagnostic from cell-to-station distance metadata; it is not the fraction of stations observed in each historical year.",
    status: "Status",
    missing: "Missing",
    availableStatus: "Available value",
    estimatedStatus: "Estimated value",
    blockedStatus: "Blocked by geography",
    missingReasons: {
      "incomplete-source-year": "Incomplete source year",
      "insufficient-spatial-coverage": "Insufficient spatial coverage",
      "provisional-antarctic-geography": "Provisional Antarctic geography",
    },
    reasons: "Missing-value reason",
    localOnly: "This preview displays annual values only for the bounded spatial and temporal record. It does not estimate values before the start or after the end of the record.",
    distinctionsTitle: "How the two series relate",
    distinctions: "NASA GISTEMP 1200 km is an observation-derived analysis with spatial estimation, not a set of raw direct observations. These are continental land-air anomalies; ocean is excluded, and the seven values must not be averaged or presented as a global index. Conservative and exploratory results are two methodological variants of the same source; they are not projections, statistical uncertainty, or two independent climate realizations. No series is spliced with CMIP6 or SSP scenarios.",
    fractionLegend: "Fractions are day-weighted area shares of the full continent: source coverage is area with a valid NASA value, spatial estimates fill another area share, and temporal estimates fill missing years only within the record. The three components are exclusive and sum to total coverage.",
    uncertainty: "Project-estimated fractions are not total upstream NASA product uncertainty. The >250 km share describes only source-supported area associated with stations farther than 250 km; it is not error or uncertainty.",
    holdoutTitle: "Withheld holdout checks",
    holdoutNote: "Checks use individual cells from the already spatially smoothed NASA analysis, not independent stations; results are not confidence intervals or uncertainty bounds.",
    twoMonthHoldout: "Two-month-gap temporal holdout",
    sensitivity: "250 km versus 1200 km sensitivity",
    sensitivityNote: "The method difference is a sensitivity analysis, not error against truth or an uncertainty interval.",
    validYears: "valid years",
    methodHeading: "Methods and limitations",
    conservativeText: "The conservative variant uses NASA 1200 km without project gap filling. It remains an observation-derived analysis with NASA's own spatial interpolation, not direct measurements.",
    exploratoryText: "The exploratory variant permits bounded spatial and within-record temporal estimation as described in the bundle. Estimates remain inside the record and never turn missing values into zero.",
    methodsFromArtifact: "Method description from the verified data bundle",
    sourceHeading: "Source and citation",
    source: "Source",
    citation: "Citation",
    sourcePeriod: "Source period",
    publication: "Regional processing is a project adaptation, not an official NASA product. NASA GISS/GISTEMP is cited as the source; no NASA endorsement.",
    glossaryHeading: "Glossary",
    glossary: [
      ["Anomaly", "Temperature departure from the 1981–2010 reference mean; not absolute temperature."],
      ["Coverage", "Share of continental area supported by the source or estimated internally under the selected method; it does not itself quantify uncertainty."],
      ["Spatial estimate", "Area without a valid direct source value filled using a spatial procedure within the region."],
      ["Temporal estimate", "Missing year completed only between years in the source record; no extrapolation."],
      [">250 km distance", "Share of source support associated with stations farther than 250 km; not an uncertainty measure."],
    ],
    provisionalAntarctica: "Antarctica uses provisional geometry: it is not certified grounded land and does not support grounded-area or ice-mass claims.",
    noCommon: "No common valid period across the six continents is available.",
    error: "The verified historical comparison bundle is unavailable or does not match its contract.",
    retry: "Retry",
    allRegionsUnavailable: "No values are available for the selected period.",
  },
};

function formatNumber(value, language, digits = 2) {
  if (value === null || !Number.isFinite(value)) return words[language].missing;
  return new Intl.NumberFormat(language === "cs" ? "cs-CZ" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function prepareLineRows(bundle, method, period, selectedIds) {
  const common = bundle.common_period;
  if (period === "common_period" && common.start === null) return [];
  return bundle.regions
    .filter((region) => selectedIds.includes(region.id)
      && (period !== "common_period" || region.id !== "antarctica"))
    .flatMap((region) => region[method].annual
      .filter((point) => period === "all_available"
        || (Number(point.date) >= common.start && Number(point.date) <= common.end))
      .map((point) => ({ ...point, region_id: region.id, region_name: region.name })));
}

function renderTable(target, rows, page, wordsForLanguage, language) {
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const htmlRows = shown.map((point) => {
    const estimated = point.spatial_estimate_fraction + point.temporal_estimate_fraction;
    return `<tr>
      <th scope="row">${escape(point.date)}</th>
      <td>${escape(point.region_name[language])}</td>
      <td>${escape(formatNumber(point.value, language))}</td>
      <td>${escape(formatNumber(point.coverage * 100, language))}%</td>
      <td>${escape(formatNumber(point.source_coverage * 100, language))}%</td>
      <td>${escape(formatNumber(point.spatial_estimate_fraction * 100, language))}%</td>
      <td>${escape(formatNumber(point.temporal_estimate_fraction * 100, language))}%</td>
      <td>${escape(formatNumber(estimated * 100, language))}%</td>
      <td>${escape(formatNumber(point.long_range_fraction * 100, language))}%</td>
      <td>${escape(point.status === "available" ? wordsForLanguage.availableStatus
        : point.status === "estimated" ? wordsForLanguage.estimatedStatus
          : point.status === "blocked-geography" ? wordsForLanguage.blockedStatus : wordsForLanguage.missing)}</td>
      <td>${escape(point.missing_reasons.length
        ? point.missing_reasons.map((reason) => wordsForLanguage.missingReasons[reason] ?? reason).join(", ")
        : "—")}</td>
    </tr>`;
  }).join("");
  target.innerHTML = `<div class="table-scroll"><table>
    <caption>${escape(wordsForLanguage.table)}</caption>
    <thead><tr>
      <th scope="col">${escape(wordsForLanguage.yearLabel)}</th>
      <th scope="col">${escape(wordsForLanguage.continent)}</th>
      <th scope="col">${escape(wordsForLanguage.value)}</th>
      <th scope="col">${escape(wordsForLanguage.coverage)}</th>
      <th scope="col">${escape(wordsForLanguage.sourceCoverage)}</th>
      <th scope="col">${escape(wordsForLanguage.spatial)}</th>
      <th scope="col">${escape(wordsForLanguage.temporal)}</th>
      <th scope="col">${escape(wordsForLanguage.estimate)}</th>
      <th scope="col">${escape(wordsForLanguage.longRange)}</th>
      <th scope="col">${escape(wordsForLanguage.status)}</th>
      <th scope="col">${escape(wordsForLanguage.reasons)}</th>
    </tr></thead><tbody>${htmlRows}</tbody>
  </table></div>
  <div class="range-buttons" aria-label="${escape(wordsForLanguage.table)}">
    <button type="button" data-page="previous" ${currentPage === 0 ? "disabled" : ""}>${escape(wordsForLanguage.previous)}</button>
    <span>${escape(wordsForLanguage.page)} ${currentPage + 1} / ${pageCount}</span>
    <button type="button" data-page="next" ${currentPage + 1 >= pageCount ? "disabled" : ""}>${escape(wordsForLanguage.next)}</button>
  </div>`;
  target.querySelector('[data-page="previous"]').addEventListener("click", () => target.dispatchEvent(
    new CustomEvent("history-table-page", { detail: currentPage - 1 }),
  ));
  target.querySelector('[data-page="next"]').addEventListener("click", () => target.dispatchEvent(
    new CustomEvent("history-table-page", { detail: currentPage + 1 }),
  ));
}

export function mountHistoryComparison({ content, language, baseUrl, isActive }) {
  const controller = new AbortController();
  let mapChart;
  let lineChart;
  let resizeObserver;
  let bundle;
  let selectedPage = 0;
  let disposed = false;
  const cs = language === "cs";
  const text = words[language];

  const dispose = () => {
    disposed = true;
    controller.abort();
    resizeObserver?.disconnect();
    mapChart?.dispose();
    lineChart?.dispose();
    mapChart = null;
    lineChart = null;
  };

  const load = async () => {
    content.innerHTML = `<header class="page-heading"><p class="eyebrow">${cs ? "POZOROVACÍ DATA / HISTORICKÉ SVĚTADÍLY" : "OBSERVATIONAL DATA / CONTINENTAL HISTORY"}</p>
      <h1>${escape(text.title)}</h1><p>${escape(text.subtitle)}</p></header>
      <p class="notice">${escape(text.notice)}</p><p id="history-comparison-loading" role="status">${escape(text.loading)}</p>`;
    const loading = content.querySelector("#history-comparison-loading");
    const stillCurrent = () => !disposed && !controller.signal.aborted
      && isActive() && loading.isConnected;
    try {
      const catalogResponse = await fetch(`${baseUrl}${historyComparisonApiBase}catalog.json`, {
        cache: "no-store", signal: controller.signal,
      });
      if (!catalogResponse.ok) throw new Error(`Catalogue HTTP ${catalogResponse.status}`);
      const catalog = await catalogResponse.json();
      if (!validateHistoryComparisonCatalog(catalog)) throw new Error("Catalogue contract mismatch");
      const bundleResponse = await fetch(`${baseUrl}${catalog.product.endpoint}`, {
        cache: "no-store", signal: controller.signal,
      });
      if (!bundleResponse.ok) throw new Error(`Bundle HTTP ${bundleResponse.status}`);
      const loaded = await bundleResponse.json();
      if (!validateHistoryComparisonBundle(loaded) || loaded.version !== catalog.product.version
        || loaded.regions.some((region, index) => {
          const entry = catalog.regions[index];
          return region.id !== entry.id
            || region.name.cs !== entry.name.cs
            || region.name.en !== entry.name.en;
        })) throw new Error("Bundle/catalogue identity mismatch");
      if (!stillCurrent()) return;
      bundle = loaded;
      render(catalog, loading);
    } catch (error) {
      if (error.name === "AbortError" || !stillCurrent()) return;
      console.error("Weather Global historical comparison:", error);
      content.innerHTML = `<header class="page-heading"><h1>${escape(text.title)}</h1></header>
        <p role="alert">${escape(text.error)}</p><button id="history-comparison-retry" type="button">${escape(text.retry)}</button>`;
      content.querySelector("#history-comparison-retry").addEventListener("click", load);
    }
  };

  const render = (catalog, loading) => {
    const common = bundle.common_period;
    const commonLabel = common.start === null ? text.noCommon : `${text.common} (${common.start}–${common.end})`;
    loading.outerHTML = `<section class="panel chart-panel">
      <div class="controls">
        <label>${escape(text.method)}<select id="history-comparison-method">
          ${historyComparisonMethods.map((method) => `<option value="${method}">${escape(text[method])}</option>`).join("")}
        </select></label>
        <label>${escape(text.region)}<select id="history-comparison-region">
          ${bundle.regions.map((region) => `<option value="${escape(region.id)}">${escape(region.name[language])}</option>`).join("")}
        </select></label>
        <label>${escape(text.period)}<select id="history-comparison-period">
          <option value="common_period" ${common.start === null ? "disabled" : ""}>${escape(commonLabel)}</option>
          <option value="all_available">${escape(text.all)}</option>
        </select></label>
        <label>${escape(text.year)}<select id="history-comparison-year"></select></label>
      </div>
      <p id="history-comparison-region-note" class="meta"></p>
      <h2>${escape(text.mapHeading)}</h2>
      <p>${escape(text.mapHelp)}</p>
      <div id="history-comparison-map" class="chart" role="img" aria-label="${escape(text.mapHeading)}"></div>
      ${chartExplanation("continental-history-map", language, [
        "Mapa zobrazuje jednu roční plošně agregovanou anomálii pro každý světadíl ve zvoleném roce a metodě. Barva používá symetrickou škálu kolem nuly; nevykresluje místní teplotu ani prostorový gradient.",
        "The map shows one annual area-aggregated anomaly per continent for the selected year and method. Colour uses a symmetric scale around zero; it does not show local temperature or spatial gradients.",
      ], [
        [["Anomálie", "Anomaly"], ["Odchylka teploty od referenčního průměru 1981–2010; nejde o absolutní teplotu.", "Temperature departure from the 1981–2010 reference mean; not absolute temperature."]],
        [["Plošná agregace", "Area aggregation"], ["Souhrn hodnot nad plochou světadílu; výsledná barva neukazuje, kde uvnitř oblasti se hodnota vyskytla.", "Summary over a continent's area; the colour does not locate where within the region values occurred."]],
        [["Šedá", "Grey"], ["Chybějící nebo metodou blokovaná hodnota; neznamená nulovou anomálii.", "A missing or method-blocked value; it does not mean a zero anomaly."]],
      ])}
      <h2>${escape(text.lineHeading)}</h2>
      <label>${escape(text.compare)}<select id="history-comparison-regions" multiple size="7" aria-describedby="history-comparison-multi-hint">
        ${bundle.regions.map((region) => `<option value="${escape(region.id)}" selected>${escape(region.name[language])}</option>`).join("")}
      </select></label>
      <p id="history-comparison-multi-hint" class="meta">${escape(text.multiHint)}</p>
      <p id="history-comparison-empty" role="status" hidden>${escape(text.allRegionsUnavailable)}</p>
      <div id="history-comparison-line" class="chart" role="img" aria-label="${escape(text.lineHeading)}"></div>
      ${chartExplanation("continental-history-lines", language, [
        "Čárový graf porovnává roční teplotní anomálie vybraných světadílů ve zvolené metodické variantě. Každá čára je samostatná plošně agregovaná řada; mezery se nepřemosťují a neukazují se hodnoty mimo období zdroje.",
        "The line chart compares annual temperature anomalies for selected continents under the chosen method. Each line is a separate area-aggregated series; gaps are not bridged and values outside the source period are not shown.",
      ], [
        [["Konzervativní / explorativní", "Conservative / exploratory"], ["Dvě metody zpracování stejného NASA zdroje, nikoli dvě nezávislá měření nebo interval nejistoty.", "Two processing methods for the same NASA source, not independent observations or an uncertainty interval."]],
        [["Pokrytí", "Coverage"], ["Podíl plochy s dostupnou zdrojovou hodnotou nebo výslovně označeným odhadem; není to pravděpodobnost správnosti.", "Fraction of area with a source value or explicitly marked estimate; not the probability that a value is correct."]],
        [["Min–max", "Min–max"], ["Pokud je vybráno více kontinentů, jejich rozsah není globální průměr ani soubor modelů.", "When multiple continents are selected, their range is not a global average or a model ensemble."]],
      ])}
      <div id="history-comparison-table"></div>
    </section>
    <section class="panel"><h2>${escape(text.distinctionsTitle)}</h2>
      <p>${escape(text.distinctions)}</p><p>${escape(text.fractionLegend)}</p><p>${escape(text.uncertainty)}</p>
      <p>${escape(text.longRangeNote)}</p>
      <p>${escape(text.localOnly)}</p><p class="notice">${escape(text.provisionalAntarctica)}</p>
    </section>
    <section class="panel"><h2>${escape(text.methodHeading)}</h2>
      <h3>${escape(text.conservative)}</h3><p>${escape(text.conservativeText)}</p>
      <p>${escape(bundle.methods.conservative[language])}</p>
      <h3>${escape(text.exploratory)}</h3><p>${escape(text.exploratoryText)}</p>
      <p>${escape(bundle.methods.exploratory[language])}</p>
      <h3>${escape(text.methodsFromArtifact)}</h3>
      <ul>${bundle.methods.limitations[language].map((item) => `<li>${escape(item)}</li>`).join("")}</ul>
      <h3>${escape(text.holdoutTitle)}</h3>
      <p>${escape(cs ? "Časová kontrola" : "Temporal holdout")}: ${bundle.validation.temporal_holdout.count.toLocaleString(cs ? "cs-CZ" : "en-GB")} · MAE ${formatNumber(bundle.validation.temporal_holdout.mae_degC, language, 6)} °C · RMSE ${formatNumber(bundle.validation.temporal_holdout.rmse_degC, language, 6)} °C</p>
      <p>${escape(cs ? "Prostorová kontrola" : "Spatial holdout")}: ${bundle.validation.spatial_holdout.count.toLocaleString(cs ? "cs-CZ" : "en-GB")} · MAE ${formatNumber(bundle.validation.spatial_holdout.mae_degC, language, 6)} °C · RMSE ${formatNumber(bundle.validation.spatial_holdout.rmse_degC, language, 6)} °C</p>
      <p>${escape(bundle.validation.note[language])} ${escape(text.holdoutNote)}</p>
      <p>${escape(text.twoMonthHoldout)}: ${bundle.validation.temporal_two_month_holdout.count.toLocaleString(cs ? "cs-CZ" : "en-GB")} · MAE ${formatNumber(bundle.validation.temporal_two_month_holdout.mae_degC, language, 5)} °C · RMSE ${formatNumber(bundle.validation.temporal_two_month_holdout.rmse_degC, language, 5)} °C</p>
      <h3>${escape(text.sensitivity)}</h3>
      <ul>${bundle.regions.map((region) => {
        const sensitivity = region.sensitivity_250km;
        const result = sensitivity.common_years === 0
          ? text.missing
          : `${sensitivity.common_years} ${cs ? "let" : "years"} · ${escape(cs ? "průměrný rozdíl" : "mean difference")} ${formatNumber(sensitivity.mean_difference_degC, language, 4)} °C · ${escape(cs ? "max. absolutní rozdíl" : "max. absolute difference")} ${formatNumber(sensitivity.max_absolute_difference_degC, language, 4)} °C`;
        return `<li>${escape(region.name[language])}: ${result}</li>`;
      }).join("")}</ul><p>${escape(text.sensitivityNote)}</p>
    </section>
    <section class="panel"><h2>${escape(text.sourceHeading)}</h2>
      <p>${escape(text.source)}: <a href="${escape(bundle.source.url)}" target="_blank" rel="noreferrer">${escape(bundle.source.title)} ↗</a></p>
      <p>${escape(text.citation)}: ${escape(bundle.source.citation)}</p>
      <p>${escape(text.sourcePeriod)}: ${bundle.source.first_year}–${bundle.source.last_year}${bundle.source.last_month < 12 ? `-${String(bundle.source.last_month).padStart(2, "0")}` : ""} · NASA GISTEMP ${bundle.source.smoothing_km} km</p>
      <p class="history-comparison-hash">SHA-256: <code>${escape(bundle.source.sha256)}</code></p>
      <p>${escape(text.publication)}</p>
      <p class="history-comparison-hash">${escape(text.methodsFromArtifact)}: <code>${escape(catalog.product.version)}</code> · ${escape(catalog.product.sha256)}</p>
    </section>
    <section class="panel"><h2>${escape(text.glossaryHeading)}</h2><dl>
      ${text.glossary.map(([term, definition]) => `<dt>${escape(term)}</dt><dd>${escape(definition)}</dd>`).join("")}
    </dl></section>`;

    const methodSelect = content.querySelector("#history-comparison-method");
    const regionSelect = content.querySelector("#history-comparison-region");
    const periodSelect = content.querySelector("#history-comparison-period");
    if (common.start === null) periodSelect.value = "all_available";
    const yearSelect = content.querySelector("#history-comparison-year");
    const compareSelect = content.querySelector("#history-comparison-regions");
    const mapTarget = content.querySelector("#history-comparison-map");
    const lineTarget = content.querySelector("#history-comparison-line");
    const tableTarget = content.querySelector("#history-comparison-table");
    const noteTarget = content.querySelector("#history-comparison-region-note");
    const noRows = content.querySelector("#history-comparison-empty");
    const byId = new Map(bundle.regions.map((region) => [region.id, region]));
    const regionNames = Object.fromEntries(bundle.regions.map((region) => [region.id, region.name[language]]));
    const selectedIds = () => [...compareSelect.selectedOptions].map((option) => option.value);
    const formatPercent = (value) => `${formatNumber(value * 100, language)}%`;
    const statusName = (status) => status === "available" ? text.availableStatus
      : status === "estimated" ? text.estimatedStatus
        : status === "blocked-geography" ? text.blockedStatus : text.missing;

    echarts.registerMap("history-comparison-continents", {
      type: "FeatureCollection",
      features: bundle.regions.map((region) => ({
        type: "Feature",
        id: region.id,
        properties: { name: region.id },
        geometry: region.geometry,
      })),
    });
    mapChart = echarts.init(mapTarget, null, { renderer: "svg" });
    lineChart = echarts.init(lineTarget, null, { renderer: "svg" });
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const instance = echarts.getInstanceByDom(entry.target);
        if (instance && entry.contentRect.width > 0) {
          instance.resize({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      }
    });
    resizeObserver.observe(mapTarget);
    resizeObserver.observe(lineTarget);

    const activeYears = () => {
      if (periodSelect.value === "common_period") {
        if (common.start === null) return [];
        return Array.from({ length: common.end - common.start + 1 }, (_unused, index) => common.start + index);
      }
      return bundle.regions.flatMap((region) => region[methodSelect.value].annual.map((point) => Number(point.date)))
        .filter((year, index, years) => years.indexOf(year) === index)
        .sort((left, right) => left - right);
    };

    const updateYears = () => {
      const years = activeYears();
      const previousYear = Number(yearSelect.value);
      yearSelect.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join("");
      if (years.includes(previousYear)) yearSelect.value = String(previousYear);
      else if (years.length) {
        const latestAvailable = [...years].reverse().find((year) => bundle.regions.some((region) =>
          region[methodSelect.value].annual.some((point) => Number(point.date) === year && point.value !== null)));
        yearSelect.value = String(latestAvailable ?? years.at(-1));
      }
    };

    const drawMap = () => {
      const method = methodSelect.value;
      const period = periodSelect.value;
      const year = Number(yearSelect.value);
      const commonPeriod = period === "common_period";
      const shownRegions = bundle.regions;
      const rows = shownRegions.map((region) => {
        const point = commonPeriod && region.id === "antarctica"
          ? null
          : region[method].annual.find((item) => Number(item.date) === year);
        return {
          name: region.id,
          value: point?.value ?? null,
          point,
          itemStyle: point?.value === null || !point
            ? { areaColor: "#78828d", borderColor: "#263440", borderWidth: 1.2 }
            : undefined,
        };
      });
      const fullRangeRows = shownRegions.filter((region) =>
        !commonPeriod || region.id !== "antarctica").flatMap((region) => region[method].annual
        .filter((point) => !commonPeriod || (common.start !== null
          && Number(point.date) >= common.start && Number(point.date) <= common.end)));
      const extent = historySymmetricExtent(fullRangeRows);
      mapChart.setOption({
        aria: { enabled: true, description: `${text.mapHeading}. ${text.mapHelp}` },
        tooltip: {
          trigger: "item",
          formatter: (params) => {
            const point = params.data?.point;
            if (!point) return `${escape(regionNames[params.name] ?? params.name)}<br>${escape(text.missing)}`;
            return `<strong>${escape(regionNames[params.name] ?? params.name)} · ${year}</strong><br>
              ${escape(text.value)}: ${escape(formatNumber(point.value, language))}<br>
              ${escape(text.coverage)}: ${escape(formatPercent(point.coverage))}<br>
              ${escape(text.sourceCoverage)}: ${escape(formatPercent(point.source_coverage))}<br>
              ${escape(text.spatial)}: ${escape(formatPercent(point.spatial_estimate_fraction))}<br>
              ${escape(text.temporal)}: ${escape(formatPercent(point.temporal_estimate_fraction))}<br>
              ${escape(text.estimate)}: ${escape(formatPercent(point.spatial_estimate_fraction + point.temporal_estimate_fraction))}<br>
              ${escape(text.longRange)}: ${escape(formatPercent(point.long_range_fraction))}<br>${escape(statusName(point.status))}`;
          },
        },
        visualMap: {
          type: "continuous",
          min: -extent,
          max: extent,
          calculable: false,
          orient: "horizontal",
          left: "center",
          bottom: 4,
          text: [`+${formatNumber(extent, language)} °C`, `−${formatNumber(extent, language)} °C`],
          textStyle: { color: "#a7b9cc" },
          inRange: { color: ["#4168a5", "#f2f1e7", "#bd4f4c"] },
          outOfRange: { color: "#78828d" },
        },
        series: [{
          type: "map",
          map: "history-comparison-continents",
          nameProperty: "name",
          data: rows,
          selectedMode: false,
          roam: true,
          emphasis: { label: { show: true }, itemStyle: { borderWidth: 2, borderColor: "#101820" } },
          label: {
            show: true,
            formatter: ({ name }) => regionNames[name] ?? name,
            color: "#17212a",
            fontSize: 10,
          },
          itemStyle: { areaColor: "#78828d", borderColor: "#263440", borderWidth: 1 },
        }],
      }, true);
    };

    const drawLine = () => {
      const method = methodSelect.value;
      const period = periodSelect.value;
      const ids = selectedIds().filter((id) => period !== "common_period" || id !== "antarctica");
      const rows = prepareLineRows(bundle, method, period, ids);
      const years = [...new Set(rows.map((point) => point.date))].sort();
      noRows.hidden = rows.length > 0;
      lineChart.setOption({
        aria: { enabled: true, description: `${text.lineHeading}; ${text.value}.` },
        color: ["#268e89", "#c65545", "#3e76a3", "#9467bd", "#d18b26", "#3d9660", "#44505e"],
        tooltip: { trigger: "axis" },
        legend: { type: "scroll", bottom: 0, data: ids.map((id) => regionNames[id]) },
        grid: { left: 58, right: 24, top: 24, bottom: 76, containLabel: true },
        xAxis: {
          type: "category",
          name: text.yearLabel,
          nameTextStyle: { color: "#a7b9cc" },
          axisLabel: { color: "#a7b9cc" },
          data: years,
          boundaryGap: false,
        },
        yAxis: {
          type: "value",
          name: text.value,
          nameTextStyle: { color: "#a7b9cc" },
          axisLabel: { color: "#a7b9cc" },
          scale: true,
        },
        series: ids.map((id) => {
          const region = byId.get(id);
          const values = rows.filter((point) => point.region_id === id);
          return {
            name: regionNames[id],
            type: "line",
            showSymbol: false,
            connectNulls: false,
            lineStyle: { width: id === regionSelect.value ? 3 : 1.7 },
            data: years.map((year) => values.find((point) => point.date === year)?.value ?? null),
          };
        }),
      }, true);
      const sortOrder = [regionSelect.value, ...historyRegionIds.filter((id) => id !== regionSelect.value)];
      const orderedRows = rows.sort((a, b) => a.date.localeCompare(b.date)
        || sortOrder.indexOf(a.region_id) - sortOrder.indexOf(b.region_id));
      renderTable(tableTarget, orderedRows, selectedPage, text, language);
    };

    const draw = () => {
      const selectedRegion = byId.get(regionSelect.value);
      const selectedSummary = selectedRegion[methodSelect.value].summary;
      noteTarget.textContent = `${selectedRegion.name[language]} · ${selectedSummary.valid_count} ${text.validYears}`
        + (selectedRegion.status === "provisional-geography" ? ` · ${text.provisionalAntarctica}` : "");
      drawMap();
      drawLine();
    };

    methodSelect.addEventListener("change", () => { selectedPage = 0; updateYears(); draw(); });
    regionSelect.addEventListener("change", draw);
    periodSelect.addEventListener("change", () => { selectedPage = 0; updateYears(); draw(); });
    yearSelect.addEventListener("change", drawMap);
    compareSelect.addEventListener("change", () => { selectedPage = 0; drawLine(); });
    tableTarget.addEventListener("history-table-page", (event) => {
      const direction = event.detail > selectedPage ? "next" : "previous";
      selectedPage = event.detail;
      drawLine();
      const focusTarget = tableTarget.querySelector(`[data-page="${direction}"]:not(:disabled)`)
        ?? tableTarget.querySelector("[data-page]:not(:disabled)");
      focusTarget?.focus();
    });
    updateYears();
    draw();
  };

  load();
  return { dispose };
}
