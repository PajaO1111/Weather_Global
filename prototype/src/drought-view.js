import * as echarts from "echarts/core";
import { LineChart, MapChart, BarChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { droughtApiBase, droughtCategories, validateDroughtCatalog, validateDroughtBundle, droughtValue, droughtHistory } from "./drought.js";
import { precipitationApiBase, validatePrecipitationCatalog, validatePrecipitationBundle } from "./precipitation.js";
import { historyComparisonApiBase, validateHistoryComparisonCatalog, validateHistoryComparisonBundle } from "./history-comparison.js";
import { routeHref } from "./routing.js";
import { chartExplanation } from "./chart-explanation.js";

echarts.use([LineChart, MapChart, BarChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, SVGRenderer]);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function mountDrought({ content, language, baseUrl, isActive }) {
  const text = (cs, en) => language === "cs" ? cs : en;
  const title = text("Sucho · klimatický vodní deficit", "Drought · climatic water deficit");
  const nf = new Intl.NumberFormat(language, { maximumFractionDigits: 6 });
  const number = value => value == null ? "—" : nf.format(value);
  const percent = value => value == null ? "—" : `${number(value * 100)} %`;
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(2000, i, 1))));
  const categoryLabels = [
    text("Extrémně suché · SPEI ≤ −2", "Extremely dry · SPEI ≤ −2"),
    text("Silně suché · −2 < SPEI ≤ −1,5", "Severely dry · −2 < SPEI ≤ −1.5"),
    text("Mírně suché · −1,5 < SPEI ≤ −1", "Moderately dry · −1.5 < SPEI ≤ −1"),
    text("Blízko normálu · −1 < SPEI < 1", "Near normal · −1 < SPEI < 1"),
    text("Mírně vlhké · 1 ≤ SPEI < 1,5", "Moderately wet · 1 ≤ SPEI < 1.5"),
    text("Silně vlhké · 1,5 ≤ SPEI < 2", "Very wet · 1.5 ≤ SPEI < 2"),
    text("Extrémně vlhké · SPEI ≥ 2", "Extremely wet · SPEI ≥ 2"),
  ];
  const metrics = [["dry", text("Alespoň mírné sucho · SPEI ≤ −1", "At least moderate drought · SPEI ≤ −1")],
    ["severe", text("Alespoň silné sucho · SPEI ≤ −1,5", "At least severe drought · SPEI ≤ −1.5")],
    ["extreme", categoryLabels[0]], ...droughtCategories.map((id, i) => [id, categoryLabels[i]])];
  const missing = (point, antarctica = false) => antarctica || point?.reason === "no-source-domain"
    ? text("Mimo doménu zdroje", "Outside source domain")
    : text("Neúplné počáteční okno nebo chybějící zdrojové hodnoty", "Incomplete initial window or missing source values");
  const header = `<header class="page-heading"><p class="eyebrow">CSIC · SPEIbase 2.11 · CRU TS 4.09 · 7D.5</p>
    <h1>${title}</h1><p>${text("Podíl dostupné pevniny v kategoriích SPEI-3 a SPEI-12. Standardizovaná klimatická bilance srážek a potenciální evapotranspirace, nikoli přímé měření půdní vlhkosti.",
      "Share of available land in SPEI-3 and SPEI-12 classes. Standardized climatic precipitation–potential evapotranspiration balance, not direct soil moisture measurement.")}</p></header>`;
  const controller = new AbortController();
  let disposed = false, charts = [], observer, contextData, contextLoading = false, renderContext;
  const active = () => !disposed && isActive();
  const disposeCharts = () => { observer?.disconnect(); charts.forEach(c => c.dispose()); charts = []; };
  const fit = () => charts.forEach(chart => {
    const { width, height } = chart.getDom().getBoundingClientRect();
    if (width > 0 && height > 0) chart.resize({ width, height, animation: { duration: 0 } });
  });
  window.addEventListener("resize", fit); document.addEventListener("visibilitychange", fit);
  async function verified(api, catalogValid, bundleValid) {
    const get = async name => {
      const response = await fetch(`${baseUrl}${api}${name}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`${api}${name}: HTTP ${response.status}`);
      return response;
    };
    const catalog = await (await get("catalog.json")).json();
    if (!catalogValid(catalog)) throw new Error(`Invalid catalogue ${api}`);
    const bytes = await (await get("bundle.json")).arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
    if (bytes.byteLength !== catalog.product.bytes || digest !== catalog.product.sha256) throw new Error(`Checksum mismatch ${api}`);
    const bundle = JSON.parse(new TextDecoder().decode(bytes));
    if (!bundleValid(bundle)) throw new Error(`Invalid scientific contract ${api}`);
    return bundle;
  }
  async function loadContext() {
    if (contextLoading || !active()) return;
    contextLoading = true;
    const target = content.querySelector("#dry-context");
    target.innerHTML = `<p role="status">${text("Načítám samostatně ověřené srážky a teplotu…", "Loading separately verified precipitation and temperature…")}</p>`;
    try {
      const [rain, temperature] = await Promise.all([
        verified(precipitationApiBase, validatePrecipitationCatalog, validatePrecipitationBundle),
        verified(historyComparisonApiBase, validateHistoryComparisonCatalog, validateHistoryComparisonBundle),
      ]);
      if (active()) { contextData = { rain, temperature }; renderContext(); }
    } catch (error) {
      if (error.name === "AbortError" || !active()) return;
      console.error("Weather Global drought context:", error);
      target.innerHTML = `<p role="alert">${text("Kontext srážek a teploty není ověřeně dostupný. Data SPEI zůstávají samostatná; nic nebylo dosazeno.",
        "Verified precipitation/temperature context is unavailable. SPEI remains separate; no values were substituted.")}</p><button id="dry-context-retry" type="button">${text("Zkusit kontext znovu", "Retry context")}</button>`;
      target.querySelector("button").onclick = loadContext;
    } finally { contextLoading = false; }
  }
  function show(bundle) {
    const years = chosen => Array.from({ length: 124 }, (_, i) => 2024 - i).map(y => `<option${y === chosen ? " selected" : ""}>${y}</option>`).join("");
    content.innerHTML = `${header}<p class="notice">${text("Ověřený datový pohled · leden 1901 až prosinec 2024. SPEI-3 začíná platnými hodnotami v březnu 1901, SPEI-12 v prosinci 1901. Antarktida bez dat.",
      "Verified data view · January 1901 to December 2024. SPEI-3 valid values start in March 1901, SPEI-12 in December 1901. No Antarctic data.")}</p>
      <form id="dry-selection" class="panel ice-controls">
        <label>${text("Okno končící vybraným měsícem", "Window ending in selected month")}<select id="dry-scale"><option value="3">SPEI-3</option><option value="12">SPEI-12</option></select></label>
        <label>${text("Světadíl", "Continent")}<select id="dry-region">${bundle.scales[0].regions.map(r => `<option value="${r.id}">${escape(r.name[language])}</option>`).join("")}</select></label>
        <label>${text("Období", "Period")}<select id="dry-period">${months.map((label, i) => `<option value="${i + 1}"${i === 11 ? " selected" : ""}>${label}</option>`).join("")}
          <option value="annual">${text("Roční průměr měsíčních podílů", "Annual mean monthly shares")}</option></select></label>
        <label>${text("Kategorie nebo práh", "Category or threshold")}<select id="dry-metric">${metrics.map(([id, label]) => `<option value="${id}">${label}</option>`).join("")}</select></label>
        <label>${text("Historie od", "History from")}<select id="dry-first">${years(1901)}</select></label>
        <label>${text("Historie do", "History through")}<select id="dry-last">${years(2024)}</select></label>
        <label>${text("Mapa, kategorie a kontext · rok", "Map, categories and context · year")}<select id="dry-year">${years(2024)}</select></label>
        <button type="submit">${text("Použít výběr", "Apply selection")}</button><p id="dry-selection-error" role="alert" hidden></p>
      </form>
      <section id="dry-support" class="panel"></section><section id="dry-history" class="panel"></section>
      <section id="dry-categories" class="panel"></section><section id="dry-comparison" class="panel"></section>
      <section class="panel"><h2>${text("Společný roční kontext, oddělené veličiny", "Shared annual context, separate quantities")}</h2>
        <p>${text("Rok zvolený výše: průměr 12 měsíčních podílů sucha, úplný roční srážkový úhrn GPCC a konzervativní roční teplotní odchylka NASA. Srážky a teplota mají vlastní referenci 1981–2010; SPEI se znovu nenormalizuje. Odlišné mřížky, podporované plochy a metody zůstávají oddělené. Srovnání neprokazuje příčinu ani nevytváří společný index.",
          "Selected year: mean of 12 monthly drought shares, complete GPCC annual precipitation depth and conservative NASA annual temperature departure. Rain and temperature retain their own 1981–2010 references; SPEI is not renormalized. Different grids, land supports and methods remain separate. Comparison does not establish causation or create a combined index.")}</p>
        <div id="dry-context"></div></section>
      <section class="panel"><h2>${text("Jak číst SPEI a plochu sucha", "Reading SPEI and drought area")}</h2>
        <p>${text("SPEI-3 shrnuje klimatickou bilanci za tři měsíce končící označeným měsícem, SPEI-12 za dvanáct. Nejde o předpověď, součet standardizovaných indexů ani dva nezávislé experimenty. Záporné hodnoty znamenají relativně suchou, kladné vlhkou bilanci. Publikovaný index přebíráme bez vlastního přepočtu reference; archivovaná metadata neuvádějí výslovné meze kalibračního období. Nenahrazujeme je referencí 1981–2010.",
          "SPEI-3 summarizes climatic balance over three months ending in the labelled month, SPEI-12 over twelve. These are not forecasts, sums of standardized indices or independent experiments. Negative values indicate relatively dry balance, positive values wet balance. Published indices are retained without project recentering; archived metadata do not explicitly state calibration-period bounds. We do not substitute 1981–2010.")}</p>
        <p>${text("Sedm navzájem výlučných projektových tříd používá meze −2, −1,5, −1, 1, 1,5 a 2; suché třídy zahrnují horní mez, vlhké dolní. Názvy tříd nejsou kategoriemi dopadů nebo oficiálním místním varováním. Producentův webový prohlížeč používá také jinou barevnou škálu (např. ±0,84/1,28/1,65/2,33); naši explicitní klasifikaci s ní neztotožňujeme. Kumulativní prahy „alespoň“ se překrývají, nesčítají se znovu.",
          "Seven mutually exclusive project classes use boundaries −2, −1.5, −1, 1, 1.5 and 2; dry classes include their upper bound, wet classes their lower bound. Labels are not impact categories or official local warnings. The producer's web viewer also uses another colour scale (e.g. ±0.84/1.28/1.65/2.33); our explicit classification is not equated with it. Cumulative 'at least' thresholds overlap and must not be added again.")}</p>
        <p>${text("Nové váhy jsou průniky původní 0,5° mřížky a prověřených hranic světadílů na elipsoidu WGS84. Dostupná plocha je jmenovatelem každého měsíce. Stabilní doména je sjednocení buněk s alespoň jednou platnou hodnotou; chybějící buňky nejsou nula ani stav bez sucha. Vzácné výpadky neodstraňujeme ze všech 124 let, což by mohlo zkreslit prostorový výběr. Při porovnání sledujte současně měsíční pokrytí i podíl domény na celé geografické pevnině. Obrysy mapy jsou zjednodušené pouze pro zobrazení.",
          "New weights intersect the native 0.5° grid with reviewed continent boundaries on the WGS84 ellipsoid. Available land is each month's denominator. Stable source domain is the union of cells with at least one valid value; missing cells are neither zero nor 'no drought'. Rare gaps are not removed from all 124 years, which could bias spatial selection. Compare monthly coverage and source-domain share of geographic land alongside drought fractions. Map outlines are simplified for display only.")}</p>
        <p>${text("Roční výsledek je průměr 12 dostupných měsíčních podílů: průměrné plošné zatížení v čase, nikoli unikátní plocha zasažená alespoň jednou za rok. Vyžadujeme všech 12 měsíců, proto rok 1901 zůstává bez ročního výsledku. Roční pokrytí uvádí minimum měsíčních pokrytí. SPEI nesčítáme a nepřepočítáváme na mm.",
          "An annual result averages 12 available monthly shares: average area burden over time, not unique area affected at least once during the year. All 12 months are required, so 1901 has no annual result. Annual coverage is the minimum monthly coverage. SPEI is never summed or converted to mm.")}</p>
        <h3>${text("Omezení: klimatické, nikoli přímo hydrologické sucho", "Limitations: climatic, not direct hydrological drought")}</h3>
        <p>${text("SPEIbase vychází z CRU TS 4.09 a FAO-56 Penman–Monteith potenciální evapotranspirace. Není slučována s operativním SPEI Monitorem, který používá Thornthwaite. Index není přímá půdní vlhkost, stav podzemní vody, výška toku, zásoba nádrží, zemědělský dopad ani dostupnost pitné vody. Plošné průměry skryjí místní rozdíly; mapa obarvuje podíl světadílu, ne konkrétní suchá místa. Neuvádíme vymyšlené intervaly spolehlivosti.",
          "SPEIbase uses CRU TS 4.09 and FAO-56 Penman–Monteith potential evapotranspiration. It is not spliced to the operational SPEI Monitor, which uses Thornthwaite. The index is not direct soil moisture, groundwater, stream level, reservoir storage, agricultural impact or drinking-water availability. Regional summaries hide local differences; the map colours continental shares, not specific dry locations. No invented confidence intervals are displayed.")}</p></section>
      <section class="panel"><h2>${text("Zdroje, licence a upravená databáze", "Sources, licence and adapted database")}</h2>
        <p class="history-comparison-hash">${escape(bundle.source.citation)}</p>
        <p><a href="https://spei.csic.es/database.html">CSIC · SPEIbase 2.11</a> · <a href="https://spei.csic.es/spei_database_2_11/">CSIC · ${text("původní databáze", "original database")}</a> ·
          <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a> · <a href="https://opendatacommons.org/licenses/dbcl/1-0/">DbCL 1.0</a></p>
        <p><a id="dry-adapted-database" href="${baseUrl}${droughtApiBase}bundle.json" download="speibase-2.11-continental-drought.json">${text("Stáhnout úplnou upravenou databázi v JSON · ODbL 1.0", "Download complete adapted database as JSON · ODbL 1.0")}</a></p>
        <p>${text("Úpravy: nové plošné váhy, explicitní třídy a jejich podíly, diagnostika pokrytí a průměry úplných roků. Zdrojové indexy se nedoplňují ani nepřepočítávají. Nejde o oficiální světadílový produkt nebo schválení CSIC. ODbL se týká samostatné databáze sucha; oddělené GPCC a NASA produkty zůstávají pod vlastními licencemi.",
          "Adaptations: new area weights, explicit classes and shares, coverage diagnostics and complete-year means. Source indices are not filled or recalculated. Not an official continental product or CSIC endorsement. ODbL applies to the separate drought database; separate GPCC and NASA products retain their own licences.")}</p>
        <p class="history-comparison-hash">SHA-256 · ${bundle.provenance.manifest_sha256}</p>
        <p><a href="${routeHref("precipitation", language)}">${text("Srážky a voda", "Precipitation and water")}</a> ·
          <a href="${routeHref("continental-history", language)}">${text("Historické teploty", "Historical temperatures")}</a> ·
          <a href="${routeHref("sources", language)}">${text("Metodika a zdroje", "Methods & sources")}</a></p></section>`;
    echarts.registerMap("dry-continents", bundle.display_geometry);
    const form = content.querySelector("#dry-selection"), selected = name => form.querySelector(`#dry-${name}`).value;
    let rows = [], page = 0, metric = "dry", description = "";
    const table = () => {
      content.querySelector("#dry-history-table").innerHTML = `<div class="table-wrap" tabindex="0" role="region" aria-label="${text("Historie sucha", "Drought history")}"><table>
        <caption>${escape(description)} · %</caption><thead><tr>${[text("Období", "Period"), text("Vybraný podíl", "Selected share"), "SPEI ≤ −1", "SPEI ≤ −1.5", "SPEI ≤ −2",
          text("Dostupnost domény", "Domain availability")].map(s => `<th scope="col">${s}</th>`).join("")}</tr></thead><tbody>
        ${rows.slice(page * 20, page * 20 + 20).map(p => `<tr data-date="${p.date}"><th scope="row">${p.date}</th>
          <td>${percent(droughtValue(p, metric))}${p.reason ? ` · ${missing(p, selected("region") === "antarctica")}` : ""}</td>
          <td>${percent(p.dry)}</td><td>${percent(p.severe)}</td><td>${percent(p.extreme)}</td><td>${percent(p.coverage)}</td></tr>`).join("")}</tbody></table></div>
        <div class="table-tools"><button id="dry-prev" type="button"${page === 0 ? " disabled" : ""}>${text("Předchozí", "Previous")}</button>
        <span>${page + 1} / ${Math.max(1, Math.ceil(rows.length / 20))}</span><button id="dry-next" type="button"${(page + 1) * 20 >= rows.length ? " disabled" : ""}>${text("Další", "Next")}</button></div>`;
      content.querySelector("#dry-prev").onclick = () => { page--; table(); };
      content.querySelector("#dry-next").onclick = () => { page++; table(); };
    };
    const chart = (id, option) => {
      const node = content.querySelector(`#${id}`);
      node.setAttribute("role", "img"); node.setAttribute("aria-label", description);
      const instance = echarts.init(node, null, { renderer: "svg" }); charts.push(instance);
      instance.setOption({ animation: false, aria: { enabled: true }, textStyle: { color: "#a7b9cc" },
        tooltip: { confine: true, backgroundColor: "#182637", borderColor: "#304357", textStyle: { color: "#edf3fa" } }, ...option });
      observer.observe(node);
    };
    renderContext = () => {
      if (!contextData || !active()) return;
      const scale = bundle.scales.find(s => s.months === Number(selected("scale"))), year = selected("year");
      content.querySelector("#dry-context").innerHTML = `<div class="table-wrap" tabindex="0" role="region" aria-label="${text("Roční klimatický kontext", "Annual climate context")}">
        <table><caption>${year} · ${text("samostatné roční veličiny", "separate annual quantities")}</caption><thead><tr>
        ${[text("Světadíl", "Continent"), `SPEI-${scale.months} ≤ −1 · ${text("průměr podílů", "mean shares")} (%)`,
          text("Min. pokrytí SPEI", "Min. SPEI coverage"), text("Srážky (mm/rok)", "Rain (mm/year)"),
          text("Odchylka srážek (mm)", "Rain departure (mm)"), text("Podporovaná plocha GPCC", "GPCC supported land"),
          text("Teplotní odchylka (°C)", "Temperature departure (°C)"), text("Pokrytí NASA", "NASA coverage")].map(s => `<th scope="col">${s}</th>`).join("")}
        </tr></thead><tbody>${scale.regions.map(r => {
          const drought = r.annual.find(p => p.date === year);
          const rain = contextData.rain.regions.find(p => p.id === r.id);
          const rp = rain.annual.find(p => p.date === year);
          const temp = contextData.temperature.regions.find(p => p.id === r.id).conservative.annual.find(p => p.date === year);
          return `<tr data-region="${r.id}"><th scope="row">${escape(r.name[language])}</th><td>${percent(drought.dry)}</td><td>${percent(drought.coverage)}</td>
            <td>${number(rp.value)}</td><td>${number(rp.anomaly)}</td><td>${percent(rain.support_fraction)}</td><td>${number(temp.value)}</td><td>${percent(temp.source_coverage)}</td></tr>`;
        }).join("")}</tbody></table></div>`;
    };
    function draw(event) {
      event?.preventDefault();
      const first = Number(selected("first")), last = Number(selected("last")), year = Number(selected("year"));
      const error = form.querySelector("#dry-selection-error");
      error.hidden = first <= last; error.textContent = first > last ? text("Začátek nesmí být po konci. Předchozí výběr zůstává.", "Start must not follow end. Previous selection remains.") : "";
      if (first > last) return;
      disposeCharts(); observer = new ResizeObserver(fit);
      const scale = bundle.scales.find(s => s.months === Number(selected("scale")));
      const region = scale.regions.find(r => r.id === selected("region")), period = selected("period");
      metric = selected("metric");
      const metricLabel = metrics.find(([id]) => id === metric)[1];
      const periodLabel = period === "annual" ? text("Roční průměr měsíčních podílů", "Annual mean monthly shares") : months[Number(period) - 1];
      description = `${region.name[language]} · SPEI-${scale.months} · ${periodLabel} · ${metricLabel}`;
      content.querySelector("#dry-support").innerHTML = `<h2>${text("Geografická a měsíční dostupnost", "Geographic and monthly availability")}</h2>
        <p>${escape(region.name[language])}: ${text("geografická pevnina", "geographic land")} ${number(region.geographic_area_km2)} km² ·
        ${text("doména zdroje", "source domain")} ${number(region.source_domain_area_km2)} km² (${percent(region.domain_fraction)}).
        ${text("Plocha s alespoň jedním výpadkem po počátečním okně", "Area with at least one gap after initial window")}: ${number(region.ever_missing_domain_area_km2)} km².</p>
        <p>${text("Podíly kategorií se vztahují pouze k dostupné ploše v konkrétním měsíci, ne k celé pevnině. Pokrytí v tabulkách = dostupná plocha / doména zdroje.",
          "Category shares refer only to available land in the particular month, not all geographic land. Table coverage = available area / source domain.")}</p>`;
      rows = droughtHistory(region, period, first, last); page = 0;
      content.querySelector("#dry-history").innerHTML = `<h2>${text("Historie podílu zasažené plochy", "History of affected-area share")}</h2>
        <p id="dry-description" role="status">${escape(description)} · ${first}–${last} · %.</p>
        <div id="dry-history-chart" class="chart ice-chart"></div>
        ${chartExplanation("drought-history", language, [
          "Graf ukazuje podíl dostupné pevniny světadílu ve zvolené kategorii nebo pod zvoleným prahem SPEI-3 či SPEI-12 v čase. Osa y je procento dostupné plochy, nikoli procento celé geografické pevniny.",
          "The chart shows the share of available continental land in the selected SPEI-3 or SPEI-12 category or below the selected threshold over time. The y-axis is the percentage of available area, not all geographic land.",
        ], [
          [["SPEI", "SPEI"], ["Standardizovaný index srážkové a potenciální evapotranspirační bilance; nejde o přímé měření půdní vlhkosti.", "Standardized precipitation and potential evapotranspiration balance index; not a direct measurement of soil moisture."]],
          [["SPEI-3 / SPEI-12", "SPEI-3 / SPEI-12"], ["Index za klouzavé tříměsíční nebo dvanáctiměsíční okno končící vybraným měsícem.", "Index over a rolling three- or twelve-month window ending in the selected month."]],
          [["Podíl dostupné plochy", "Share of available area"], ["Plošně vážený podíl buněk v kategorii mezi buňkami s platným zdrojovým údajem.", "Area-weighted share of cells in a class among cells with valid source values."]],
        ])}
        <div id="dry-history-table"></div>`;
      chart("dry-history-chart", {
        grid: { top: 35, left: 60, right: 20, bottom: 60 }, tooltip: { trigger: "axis", confine: true, valueFormatter: v => v == null ? "—" : `${number(v)} %` },
        xAxis: { type: "category", data: rows.map(p => p.date.slice(0, 4)), axisLabel: { hideOverlap: true, color: "#a7b9cc" } },
        yAxis: { type: "value", min: 0, max: 100, name: "%", splitLine: { lineStyle: { color: "#27394c" } } },
        series: [{ id: "dry-values", type: "line", name: metricLabel, connectNulls: false, symbolSize: 4,
          lineStyle: { color: "#ffc56e" }, itemStyle: { color: "#ffc56e" }, data: rows.map(p => droughtValue(p, metric) === null ? null : droughtValue(p, metric) * 100) }],
      }); table();
      const chosen = Array.from({ length: 12 }, (_, i) => region.points.find(p => p.date === `${year}-${String(i + 1).padStart(2, "0")}`));
      content.querySelector("#dry-categories").innerHTML = `<h2>${text("Rozdělení dostupné plochy do kategorií", "Available land distribution across categories")}</h2>
        <p>${year} · SPEI-${scale.months} · ${escape(region.name[language])}. ${text("Výlučné kategorie dávají 100 % dostupné plochy; chybějící měsíc není 0 % sucha.", "Exclusive categories total 100% of available land; a missing month is not 0% drought.")}</p>
        <div id="dry-category-chart" class="chart ice-chart"></div>
        ${chartExplanation("drought-categories", language, [
          "Skládané sloupce rozdělují každého dostupného měsíce platnou plochu do sedmi vzájemně výlučných kategorií SPEI, od extrémně suché po extrémně vlhkou. Součet kategorií je 100 % dostupné plochy; chybějící měsíc není nulové sucho.",
          "Stacked columns divide valid land for each available month into seven mutually exclusive SPEI classes, from extremely dry to extremely wet. Classes total 100% of available area; a missing month is not zero drought.",
        ], [
          [["SPEI kategorie", "SPEI class"], ["Rozsah standardizovaných hodnot indexu definující suchou, normální nebo vlhkou třídu.", "Range of standardized index values defining a dry, near-normal or wet class."]],
          [["Skládaný podíl", "Stacked share"], ["Vzájemně výlučné podíly tříd; jejich součet pro měsíc odpovídá 100 % dostupné plochy.", "Mutually exclusive class shares; their monthly total equals 100% of available area."]],
          [["Dostupná plocha", "Available area"], ["Část zdrojové domény s platnou hodnotou pro daný měsíc; liší se od celé pevniny.", "Part of the source domain with a valid value for that month; differs from all geographic land."]],
        ])}
        <div class="table-wrap" tabindex="0" role="region" aria-label="${text("Tabulka kategorií", "Category table")}"><table>
        <caption>${year} · SPEI-${scale.months} · %</caption><thead><tr><th scope="col">${text("Měsíc", "Month")}</th>${categoryLabels.map(s => `<th scope="col">${s}</th>`).join("")}
        <th scope="col">${text("Dostupná plocha (km²)", "Available area (km²)")}</th><th scope="col">${text("Pokrytí domény", "Domain coverage")}</th></tr></thead>
        <tbody>${chosen.map((p, i) => `<tr><th scope="row">${months[i]}</th>${droughtCategories.map(id => `<td>${percent(droughtValue(p, id))}</td>`).join("")}
        <td>${number(p.available_area_km2)}</td><td>${percent(p.coverage)}</td></tr>`).join("")}</tbody></table></div>`;
      chart("dry-category-chart", { color: ["#e57173", "#f0a16b", "#f5d178", "#b6c4cf", "#91d5c9", "#6db1e5", "#b5a2ee"],
        grid: { top: 85, left: 55, right: 15, bottom: 60 }, legend: { top: 0, type: "scroll", textStyle: { color: "#edf3fa" } },
        tooltip: { trigger: "axis", confine: true, valueFormatter: v => v == null ? "—" : `${number(v)} %` },
        xAxis: { type: "category", data: months, axisLabel: { hideOverlap: true } }, yAxis: { type: "value", min: 0, max: 100, name: "%" },
        series: droughtCategories.map((id, c) => ({ id: `dry-category-${id}`, name: categoryLabels[c], type: "bar", stack: "categories",
          data: chosen.map(p => p.categories ? p.categories[c] * 100 : null) })),
      });
      const comparison = scale.regions.map(r => ({ region: r, point: droughtHistory(r, period, year, year)[0] }));
      content.querySelector("#dry-comparison").innerHTML = `<h2>${text("Mapa podílů podle kategorie", "Category-share map")}</h2>
        <p>${year} · SPEI-${scale.months} · ${periodLabel} · ${metricLabel}. ${text("Jedna barva = podíl dostupné plochy světadílu, nikoli poloha suchých buněk; šedá = bez dat. Škála 0–100 % je stejná mezi roky.",
          "One colour = share of available continental land, not the location of dry cells; grey = no data. The 0–100% scale is fixed across years.")}</p>
        <div id="dry-map" class="chart ice-chart"></div>
        ${chartExplanation("drought-map", language, [
          "Mapa porovnává agregovaný podíl dostupné plochy ve zvolené kategorii SPEI pro vybrané období a jednotlivé světadíly. Barva neoznačuje konkrétní suchá místa nebo pixely. Šedá znamená chybějící data.",
          "The map compares the aggregated share of available area in the selected SPEI class for the chosen period across continents. Colour does not identify particular drought locations or pixels. Grey means missing data.",
        ], [
          [["Světadílový podíl", "Continental share"], ["Plošně vážený souhrn zdrojových buněk daného světadílu; nezobrazuje jejich geografickou polohu.", "Area-weighted summary of source cells in a continent; does not show their geographic locations."]],
          [["Pevná škála 0–100 %", "Fixed 0–100% scale"], ["Umožňuje srovnání hodnot mezi světadíly a roky; sama nevypovídá o pokrytí domény.", "Enables comparison across continents and years; does not itself describe domain coverage."]],
          [["Mimo doménu / bez dat", "Outside domain / missing"], ["Neplatná nebo nedostupná hodnota, nikoli nulový podíl sucha či vlhka.", "An invalid or unavailable value, not zero drought or wetness share."]],
        ])}
        <div class="table-wrap" tabindex="0" role="region" aria-label="${text("Srovnání světadílů", "Continental comparison")}"><table>
        <caption>${year} · ${escape(metricLabel)} · %</caption><thead><tr>${[text("Světadíl", "Continent"), text("Vybraný podíl", "Selected share"),
          text("Pokrytí domény", "Domain coverage"), text("Doména / geografická pevnina", "Domain / geographic land")].map(s => `<th scope="col">${s}</th>`).join("")}</tr></thead><tbody>
        ${comparison.map(({ region: r, point }) => `<tr data-region="${r.id}"><th scope="row">${escape(r.name[language])}</th>
        <td>${percent(droughtValue(point, metric))}${point.reason ? ` · ${missing(point, r.id === "antarctica")}` : ""}</td>
        <td>${percent(point.coverage)}</td><td>${percent(r.domain_fraction)}</td></tr>`).join("")}</tbody></table></div>`;
      const labels = Object.fromEntries(scale.regions.map(r => [r.id, r.name[language]]));
      chart("dry-map", {
        tooltip: { trigger: "item", confine: true, formatter: p => `${escape(labels[p.name])}: ${Number.isFinite(p.value) ? number(p.value) + " %" : "—"}` },
        visualMap: { min: 0, max: 100, calculable: false, orient: "horizontal", left: "center", bottom: 5, textStyle: { color: "#edf3fa" },
          inRange: { color: droughtCategories.indexOf(metric) >= 4 ? ["#eff5ee", "#72b7c8", "#28548a"] : ["#f5eddc", "#e7a24f", "#9e2939"] } },
        series: [{ id: "dry-map-values", type: "map", map: "dry-continents", roam: false, top: 15, bottom: 75,
          itemStyle: { areaColor: "#526171", borderColor: "#c0cfdb", borderWidth: .5 }, emphasis: { label: { show: false } },
          select: { disabled: true }, data: comparison.map(({ region: r, point }) => ({ name: r.id, value: droughtValue(point, metric) === null ? null : droughtValue(point, metric) * 100 })) }],
      });
      renderContext();
    }
    form.onsubmit = draw; draw(); loadContext();
  }
  async function load() {
    content.innerHTML = `${header}<p role="status">${text("Načítám ověřená data…", "Loading verified data…")}</p>`;
    try {
      const bundle = await verified(droughtApiBase, validateDroughtCatalog, validateDroughtBundle);
      if (active()) show(bundle);
    } catch (error) {
      if (error.name === "AbortError" || !active()) return;
      console.error("Weather Global drought:", error); disposeCharts();
      content.innerHTML = `${header}<section class="panel error" role="alert"><p>${text("Ověřená data sucha nejsou dostupná. Žádné odhady ani starší kopie nebyly dosazeny.",
        "Verified drought data are unavailable. No estimates or older copies were substituted.")}</p><button id="dry-retry" type="button">${text("Zkusit znovu", "Retry")}</button></section>`;
      content.querySelector("#dry-retry").onclick = load;
    }
  }
  load();
  return { dispose() {
    disposed = true; controller.abort(); disposeCharts();
    window.removeEventListener("resize", fit); document.removeEventListener("visibilitychange", fit);
  } };
}
