import * as echarts from "echarts/core";
import { LineChart, MapChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { precipitationApiBase, validatePrecipitationCatalog, validatePrecipitationBundle, precipitationHistory, precipitationSeason } from "./precipitation.js";
import { routeHref } from "./routing.js";
import { chartExplanation } from "./chart-explanation.js";

echarts.use([LineChart, MapChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, SVGRenderer]);
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

export function mountPrecipitation({ content, language, baseUrl, isActive }) {
  const text = (cs, en) => language === "cs" ? cs : en;
  const title = text("Srážky a voda", "Precipitation and water");
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(2000, i, 1))));
  const number = value => value === null ? "—" : new Intl.NumberFormat(language, { maximumFractionDigits: 6 }).format(value);
  const percent = value => value === null ? "—" : `${number(value * 100)} %`;
  const refLabel = text("Projektová reference 1981–2010", "Project 1981–2010 reference");
  const missing = point => point?.reason === "no-source-domain" ? text("Mimo doménu GPCC", "Outside GPCC domain")
    : point?.reason === "incomplete-source-year" ? text("Neúplný rok zdroje", "Incomplete source year")
      : text("Mimo období zdroje", "Outside source period");
  const header = `<header class="page-heading"><p class="eyebrow">DWD / GPCC · Version 2025 · 2.5° · 7D.4</p>
    <h1>${title}</h1><p>${text("Plošně vážené srážkové úhrny nad pevninou světadílů. Měsíční sezónnost, úplné roční součty a odchylky; nikoli stav zásob vody.",
      "Area-weighted precipitation depths over continental land. Monthly seasonality, complete annual sums and departures; not the state of water storage.")}</p></header>`;
  const request = new AbortController();
  let disposed = false, charts = [], observer;
  const active = () => !disposed && isActive();
  const disposeCharts = () => { observer?.disconnect(); charts.forEach(chart => chart.dispose()); charts = []; };
  const fit = () => {
    for (const chart of charts) {
      const { width, height } = chart.getDom().getBoundingClientRect();
      if (width > 0 && height > 0) chart.resize({ width, height, animation: { duration: 0 } });
    }
  };
  window.addEventListener("resize", fit);
  document.addEventListener("visibilitychange", fit);

  function show(bundle) {
    const years = selected => Array.from({ length: 136 }, (_, i) => 2026 - i)
      .map(year => `<option${year === selected ? " selected" : ""}>${year}</option>`).join("");
    content.innerHTML = `${header}<p class="notice">${text("Ověřený datový pohled · leden 1891 až srpen 2026. Antarktida bez dat; rok 2026 má pouze osm měsíců, roční úhrn se nedopočítává.",
      "Verified data view · January 1891 to August 2026. No Antarctic data; 2026 has only eight months and its annual total is not estimated.")}</p>
      <form id="rain-selection" class="panel ice-controls">
        <label>${text("Světadíl", "Continent")}<select id="rain-region">${bundle.regions.map(region =>
          `<option value="${region.id}">${escape(region.name[language])}</option>`).join("")}</select></label>
        <label>${text("Období historie a mapy", "History and map period")}<select id="rain-period"><option value="annual">${text("Úplný rok", "Complete year")}</option>
          ${months.map((label, i) => `<option value="${i + 1}">${label}</option>`).join("")}</select></label>
        <label>${text("Veličina", "Metric")}<select id="rain-metric"><option value="value">${text("Úhrn", "Total depth")}</option>
          <option value="anomaly">${text("Odchylka od reference", "Departure from reference")}</option></select></label>
        <label>${text("Historie od roku", "History from year")}<select id="rain-first">${years(1891)}</select></label>
        <label>${text("Historie do roku", "History through year")}<select id="rain-last">${years(2026)}</select></label>
        <label>${text("Mapa · rok", "Map · year")}<select id="rain-map-year">${years(2025)}</select></label>
        <label>${text("Sezónnost · rok A", "Seasonality · year A")}<select id="rain-year-a">${years(2026)}</select></label>
        <label>${text("Sezónnost · rok B", "Seasonality · year B")}<select id="rain-year-b">${years(2025)}</select></label>
        <button type="submit">${text("Použít výběr", "Apply selection")}</button><p id="rain-selection-error" role="alert" hidden></p>
      </form>
      <section id="rain-support" class="panel"></section>
      <section id="rain-history" class="panel"></section>
      <section id="rain-season" class="panel"></section>
      <section id="rain-comparison" class="panel"></section>
      <section class="panel"><h2>${text("Co počítáme a co ne", "What is and is not calculated")}</h2>
        <p>${text("Zdroj GPCC je interpolovaná analýza srážkoměrných pozorování, nikoli přímé měření v každé buňce. Používáme pole precip, ne precip_infill s doplněním klimatologií. Rozlišení 2,5° je velikost mřížky, nikoli zaručená účinná rozlišovací schopnost. Řídké stanice a velké interpolační vzdálenosti snižují místní reprezentativnost, zejména na začátku historie.",
          "GPCC is an interpolated analysis of rain-gauge observations, not a direct measurement in every cell. We use precip, not climatologically filled precip_infill. The 2.5° resolution describes the grid, not guaranteed effective resolving power. Sparse stations and long interpolation distances reduce local representativeness, especially early in the record.")}</p>
        <p>${text("Nové váhy jsou průniky původní 2,5° mřížky s již prověřenými hranicemi světadílů, měřené na elipsoidu WGS84. Průměrujeme pouze stejnou společnou pevninskou plochu platnou ve všech 1 628 měsících. Nepokryté ostrůvky nepřesouváme a nezapočítáváme jako nulu. Zjednodušené obrysy mapy slouží pouze k zobrazení, nikoli výpočtu. Antarktida je mimo doménu tohoto srážkového produktu; její obrys neznamená datové pokrytí.",
          "New weights intersect the native 2.5° grid with the previously reviewed continent boundaries on the WGS84 ellipsoid. Means use the same common valid land support throughout all 1,628 months. Unsupported small islands are neither relocated nor counted as zero. Simplified map outlines are display-only, never calculation weights. Antarctica is outside this precipitation product's domain; its outline does not indicate data coverage.")}</p>
        <p>${text("Roční úhrn je SOUČET 12 měsíčních úhrnů na stejné ploše, ne průměr ani další násobení počtem dní. Jeden mm odpovídá jednomu litru na m²; světadílové hloubky se mezi světadíly nesčítají. Měsíční reference jsou průměry stejného kalendářního měsíce 1981–2010, roční reference průměr 30 úplných ročních součtů. Odchylka v mm může být záporná, samotný úhrn ne.",
          "Annual depth is the SUM of 12 monthly depths over identical support, not a mean or another multiplication by days. One mm equals one litre per m²; continental depths are not additive across continents. Monthly references average the same calendar month in 1981–2010; the annual reference averages 30 complete yearly sums. A departure in mm can be negative, precipitation depth cannot.")}</p>
        <p>${text("Podíl plochy buněk se stanicí používá gauge ≥ 1 a naše plošné váhy. Nejde o přesné polohy stanic, podíl přímo změřené plochy ani interval spolehlivosti. Vzdálenost je plošně vážený dist_int v km. U ročních řádků ukazujeme minimum měsíčního podílu a průměr 12 měsíčních vzdáleností. err není regionální 95% nejistota; nepřepočítáváme ji tak a nesčítáme opakovaně použité interpolační stanice. Na zveřejněné precip nepřidáváme další korekci sys_err. Šest desetinných míst slouží reprodukci výpočtu, nikoli tvrzení takové přesnosti měření.",
          "Area fraction in cells with a gauge uses gauge ≥ 1 and our area weights. It is not exact station positions, directly measured area or a confidence interval. Distance is area-weighted dist_int in km. Annual rows show the minimum monthly gauge-cell fraction and mean of 12 monthly distances. err is not a regional 95% uncertainty; we do not turn it into one or sum reused interpolation gauges. Published precip receives no extra sys_err correction. Six decimal places support reproducibility, not a claim of that measurement accuracy.")}</p>
        <h3>${text("Srážky nejsou dostupná voda ani sucho", "Precipitation is not available water or drought")}</h3>
        <p>${text("K posouzení zásob vody a sucha navíc potřebujeme výpar a evapotranspiraci, půdní vlhkost, odtok, podzemní vodu, sníh a lidské odběry. Světadílový průměr může zakrýt současné lokální povodně a sucho. Samotný pokles srážek zde neoznačujeme za úplnou diagnózu sucha.",
          "Water storage and drought assessment also require evaporation and evapotranspiration, soil moisture, runoff, groundwater, snow and human withdrawals. A continental mean can hide simultaneous local floods and drought. Declining precipitation alone is not labelled a complete drought diagnosis here.")}</p></section>
      <section class="panel"><h2>${text("Zdroj, licence a reprodukce", "Source, licence and reproduction")}</h2>
        <p class="history-comparison-hash">${escape(bundle.source.citation)}</p><p><a href="https://doi.org/10.5676/DWD_GPCC/MONTHLY_V2025_250">GPCC · DOI</a> ·
        <a href="https://opendata.dwd.de/climate_environment/GPCC/GPCC_Precipitation_Analysis_Monthly/Version_2025/250_degree/">${text("Původní soubory", "Original files")}</a> ·
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · <a href="https://www.dwd.de/EN/service/legal_notice/legal_notice_node.html">DWD · ${text("podmínky", "terms")}</a></p>
        <p>${text("47 původních NetCDF gzip souborů a jejich MD5; 96 archivovaných odpovědí se SHA-256. Nejde o oficiální světadílové řady DWD ani schválení projektu producentem.",
          "47 original NetCDF gzip files and producer MD5s; 96 archived responses with SHA-256. These are not official DWD continental series or producer endorsement.")}</p>
        <p class="history-comparison-hash">SHA-256 · ${escape(bundle.provenance.manifest_sha256)}</p>
        <p><a href="${routeHref("snow-cover", language)}">${text("Sněhová pokrývka", "Snow cover")}</a> ·
          <a href="${routeHref("ice-sheets", language)}">${text("Pevninský led", "Land ice")}</a> ·
          <a href="${routeHref("drought", language)}">${text("Sucho · SPEI", "Drought · SPEI")}</a> ·
          <a href="${routeHref("sources", language)}">${text("Metodika a zdroje", "Methods & sources")}</a></p></section>`;
    echarts.registerMap("rain-continents", bundle.display_geometry);
    const form = content.querySelector("#rain-selection"), selected = name => form.querySelector(`#rain-${name}`).value;
    let rows = [], page = 0, metric = "value", description = "", unit = "", reference;
    function table() {
      content.querySelector("#rain-history-table").innerHTML = `<div class="table-wrap" tabindex="0" role="region" aria-label="${text("Tabulka historie", "History table")}">
        <table><caption>${escape(description)} · ${unit}</caption><thead><tr>
        ${[text("Období", "Period"), text("Úhrn", "Depth"), text("Odchylka", "Departure"), refLabel, "n / 30",
          text("Plocha buněk se stanicí", "Area in cells with a gauge"), text("Vzdálenost (km)", "Distance (km)")].map(s => `<th scope="col">${s}</th>`).join("")}
        </tr></thead><tbody>${rows.slice(page * 20, page * 20 + 20).map(p => `<tr data-date="${p.date}"><th scope="row">${p.date}</th>
          <td>${number(p.value)}${p.reason ? ` · ${missing(p)}` : ""}</td><td>${number(p.anomaly)}</td><td>${number(reference.mean)}</td><td>${reference.count}</td>
          <td>${percent(p.station_fraction)}</td><td>${number(p.distance_km)}</td></tr>`).join("")}</tbody></table></div>
        <div class="table-tools"><button id="rain-prev" type="button"${page === 0 ? " disabled" : ""}>${text("Předchozí", "Previous")}</button>
        <span>${page + 1} / ${Math.max(1, Math.ceil(rows.length / 20))}</span><button id="rain-next" type="button"${(page + 1) * 20 >= rows.length ? " disabled" : ""}>${text("Další", "Next")}</button></div>`;
      content.querySelector("#rain-prev").onclick = () => { page--; table(); };
      content.querySelector("#rain-next").onclick = () => { page++; table(); };
    }
    function line(id, labels, series, chartUnit) {
      const node = content.querySelector(`#${id}`);
      node.setAttribute("role", "img"); node.setAttribute("aria-label", description);
      const chart = echarts.init(node, null, { renderer: "svg" }); charts.push(chart);
      chart.setOption({ animation: false, aria: { enabled: true }, color: ["#6ad5e2", "#ffc56e", "#c2a8ff"],
        textStyle: { color: "#a7b9cc" }, grid: { top: 70, left: 65, right: 20, bottom: 60 },
        legend: { top: 0, type: "scroll", textStyle: { color: "#edf3fa" } },
        tooltip: { trigger: "axis", confine: true, backgroundColor: "#182637", borderColor: "#304357", textStyle: { color: "#edf3fa" },
          valueFormatter: value => value === null ? "—" : `${number(value)} ${chartUnit}` },
        xAxis: { type: "category", data: labels, axisLabel: { hideOverlap: true, color: "#a7b9cc" } },
        yAxis: { type: "value", name: chartUnit, scale: metric === "anomaly", axisLabel: { color: "#a7b9cc" }, splitLine: { lineStyle: { color: "#27394c" } } },
        series: series.map(row => ({ type: "line", connectNulls: false, symbolSize: 4, ...row })),
      });
      observer.observe(node);
    }
    function draw(event) {
      event?.preventDefault();
      const first = Number(selected("first")), last = Number(selected("last"));
      const error = form.querySelector("#rain-selection-error");
      error.hidden = first <= last;
      error.textContent = first > last ? text("Začátek nesmí být po konci. Předchozí výběr zůstává.", "Start must not follow end. Previous selection remains.") : "";
      if (first > last) return;
      disposeCharts(); observer = new ResizeObserver(fit);
      const region = bundle.regions.find(row => row.id === selected("region"));
      const period = selected("period"), mapYear = Number(selected("map-year"));
      metric = selected("metric");
      reference = region.reference.find(row => row.period === period);
      unit = period === "annual" ? text("mm/rok", "mm/year") : text("mm/měsíc", "mm/month");
      const metricLabel = metric === "value" ? text("Úhrn", "Total depth") : text("Odchylka", "Departure");
      const periodLabel = period === "annual" ? text("Úplný rok", "Complete year") : months[Number(period) - 1];
      description = `${region.name[language]} · ${periodLabel} · ${metricLabel}`;
      const supportTarget = content.querySelector("#rain-support");
      supportTarget.innerHTML = `<h2>${text("Plošná podpora a dostupnost stanic", "Land support and gauge availability")}</h2>
        <p>${escape(region.name[language])}: ${text("geografická pevninská plocha", "geographic land area")} ${number(region.geographic_area_km2)} km² ·
        ${text("stálá podporovaná plocha", "fixed supported area")} ${number(region.supported_area_km2)} km² · ${percent(region.support_fraction)}.
        ${text("Nepokryto", "Unsupported")}: ${percent(1 - region.support_fraction)}.</p>
        <p>${text("Plocha je stejná v každém měsíci; počet a blízkost stanic se mění. Podrobná diagnostika je v tabulkách, nikoli interval spolehlivosti.",
          "Area is identical every month; gauge availability and proximity change. Detailed table diagnostics are not confidence intervals.")}</p>`;
      rows = precipitationHistory(region, period, first, last); page = 0;
      content.querySelector("#rain-history").innerHTML = `<h2>${text("Historie srážkových úhrnů", "Precipitation depth history")}</h2>
        <p id="rain-description" role="status">${escape(description)} · ${first}–${last} · ${unit}.</p>
        <p id="rain-reference">${refLabel}: ${number(reference.mean)} ${unit} · n=${reference.count}/30.</p>
        ${rows.length ? "" : `<p role="status">${text("Ve výběru není žádný zdrojový měsíc.", "No source month exists in this selection.")}</p>`}
        <div id="rain-history-chart" class="chart ice-chart"></div>
        ${chartExplanation("precipitation-history", language, [
          "Graf ukazuje měsíční nebo úplný roční srážkový úhrn pro vybraný světadíl a období. Přepínač veličiny volí absolutní úhrn, nebo odchylku od průměru stejného kalendářního období v letech 1981–2010; přerušovaná čára označuje referenci.",
          "The chart shows monthly or complete-year precipitation depth for the selected continent and period. The metric selector switches between absolute depth and departure from the mean for the same calendar period in 1981–2010; the dashed line marks the reference.",
        ], [
          [["Úhrn", "Total depth"], ["Výška srážek v milimetrech nad pevně vymezenou podporovanou pevninskou plochou.", "Precipitation depth in millimetres over a fixed supported continental land area."]],
          [["Odchylka", "Departure"], ["Rozdíl úhrnu od referenčního průměru; může být záporný, na rozdíl od samotného úhrnu.", "Difference from the reference mean; it can be negative, unlike the depth itself."]],
          [["Podporovaná plocha", "Supported area"], ["Stálá plocha použitá pro srovnání v celé řadě; nejde o celé území světadílu ani interval nejistoty.", "The fixed area used throughout the series; not the entire continent or an uncertainty interval."]],
        ])}
        <div id="rain-history-table"></div>`;
      line("rain-history-chart", rows.map(p => p.date.slice(0, 4)), [
        { id: "rain-values", name: metricLabel, data: rows.map(p => p[metric]) },
        { id: "rain-reference", name: refLabel, data: rows.map(() => reference.mean === null ? null : metric === "value" ? reference.mean : 0),
          symbol: "none", lineStyle: { type: "dashed" } },
      ], unit);
      table();
      const chosenYears = [...new Set([Number(selected("year-a")), Number(selected("year-b"))])];
      const seasons = chosenYears.map(year => ({ year, points: precipitationSeason(region, year) }));
      content.querySelector("#rain-season").innerHTML = `<h2>${text("Měsíční sezónnost", "Monthly seasonality")}</h2>
        <p>${escape(region.name[language])} · ${metricLabel} · ${text("mm/měsíc; neúplné roky se nedoplňují", "mm/month; incomplete years are not filled")}.</p>
        <div id="rain-season-chart" class="chart ice-chart"></div>
        ${chartExplanation("precipitation-season", language, [
          "Graf porovnává měsíční srážkové úhrny nebo jejich odchylky pro vybrané roky ve zvoleném světadílu. Každý bod je samostatný kalendářní měsíc; chybějící měsíce se nedoplňují.",
          "The chart compares monthly precipitation depths or departures for the selected years and continent. Each point is a separate calendar month; missing months are not filled.",
        ], [
          [["Sezónnost", "Seasonality"], ["Rozložení srážek mezi měsíci roku; nejde o roční úhrn ani dlouhodobý trend.", "Distribution of precipitation across months; not an annual total or a long-term trend."]],
          [["Měsíční reference", "Monthly reference"], ["Průměr stejného kalendářního měsíce v letech 1981–2010.", "Mean for the same calendar month in 1981–2010."]],
          [["Neúplný rok", "Incomplete year"], ["Chybějící zdrojové měsíce zůstávají prázdné; roční součet se z neúplných dat neodhaduje.", "Missing source months remain blank; an annual total is not estimated from incomplete data."]],
        ])}
        <div class="table-wrap" tabindex="0" role="region" aria-label="${text("Sezónní tabulka", "Seasonal table")}"><table><caption>${text("Měsíční sezónnost · mm/měsíc", "Monthly seasonality · mm/month")}</caption>
        <thead><tr><th scope="col">${text("Měsíc", "Month")}</th>${chosenYears.map(year => `<th scope="col">${year}</th>`).join("")}<th scope="col">${refLabel}</th><th scope="col">n / 30</th></tr></thead>
        <tbody>${months.map((month, i) => `<tr><th scope="row">${month}</th>${seasons.map(season => {
          const point = season.points[i]; return `<td>${number(point[metric])}${point.reason ? ` · ${missing(point)}` : ""}</td>`;
        }).join("")}<td>${number(region.reference[i].mean)}</td><td>${region.reference[i].count}</td></tr>`).join("")}</tbody></table></div>`;
      line("rain-season-chart", months, [
        ...seasons.map(season => ({ id: `rain-season-${season.year}`, name: String(season.year), data: season.points.map(p => p[metric]) })),
        { id: "rain-season-reference", name: refLabel, data: region.reference.slice(0, 12).map(ref => ref.mean === null ? null : metric === "value" ? ref.mean : 0),
          symbol: "none", lineStyle: { type: "dashed" } },
      ], text("mm/měsíc", "mm/month"));
      const comparison = bundle.regions.map(r => ({ region: r, point: precipitationHistory(r, period, mapYear, mapYear)[0] }));
      content.querySelector("#rain-comparison").innerHTML = `<h2>${text("Srovnání světadílů", "Continental comparison")}</h2>
        <p>${mapYear} · ${periodLabel} · ${metricLabel} · ${unit}. ${text("Jedna barva = průměr nad podporovanou pevninou světadílu, nikoli místní rozložení deště. Šedá = bez dat. Odchylky mají symetrickou škálu kolem nuly.",
          "One colour = mean over supported continental land, not local rainfall patterns. Grey = no data. Departures use a symmetric zero-centred scale.")}</p>
        <div id="rain-map" class="chart ice-chart" role="img" aria-label="${text("Mapa světadílových srážek", "Continental precipitation map")}"></div>
        ${chartExplanation("precipitation-map", language, [
          "Mapa barvou zobrazuje agregovaný srážkový úhrn nebo odchylku pro vybraný rok, období a světadíl. Jedna barva shrnuje průměr nad podporovanou pevninou; neukazuje místní rozložení srážek. Šedá označuje chybějící zdrojový údaj.",
          "The map colours the aggregated precipitation depth or departure for the selected year, period and continent. Each colour summarizes the mean over supported land; it does not show local rainfall patterns. Grey indicates a missing source value.",
        ], [
          [["Plošný průměr", "Area mean"], ["Průměr nad dostupnou pevninskou podporou vypočtený z plošných vah, nikoli součet územních zásob vody.", "Mean over available land support using area weights, not a sum of territorial water stocks."]],
          [["Podíl buněk se stanicí", "Area in cells with a gauge"], ["Diagnostika plošného podílu buněk s evidovanou stanicí; není to podíl přímo změřeného území ani jistota hodnoty.", "Diagnostic area fraction of cells associated with a gauge; not the fraction of directly measured land or certainty of the value."]],
          [["Šedá plocha", "Grey area"], ["Pro vybranou kombinaci není k dispozici platná hodnota; neznamená nulové srážky.", "No valid value is available for the selected combination; it does not mean zero precipitation."]],
        ])}
        <div class="table-wrap" tabindex="0" role="region" aria-label="${text("Tabulka světadílů", "Continental table")}"><table><caption>${mapYear} · ${periodLabel} · ${unit}</caption>
        <thead><tr>${[text("Světadíl", "Continent"), metricLabel, text("Podporovaná plocha", "Supported land fraction"),
          text("Plocha buněk se stanicí", "Area in cells with a gauge"), text("Vzdálenost (km)", "Distance (km)")].map(s => `<th scope="col">${s}</th>`).join("")}</tr></thead>
        <tbody>${comparison.map(({ region: r, point }) => `<tr data-region="${r.id}"><th scope="row">${escape(r.name[language])}</th>
          <td>${number(point?.[metric] ?? null)}${!point || point.reason ? ` · ${missing(point)}` : ""}</td>
          <td>${percent(r.support_fraction)}</td><td>${percent(point?.station_fraction ?? null)}</td><td>${number(point?.distance_km ?? null)}</td></tr>`).join("")}</tbody></table></div>`;
      const map = echarts.init(content.querySelector("#rain-map"), null, { renderer: "svg" }); charts.push(map);
      const max = Math.max(1, ...comparison.map(({ point }) => Math.abs(point?.[metric] ?? 0)));
      const labels = Object.fromEntries(bundle.regions.map(r => [r.id, r.name[language]]));
      map.setOption({ animation: false, aria: { enabled: true }, textStyle: { color: "#a7b9cc" },
        tooltip: { trigger: "item", confine: true, formatter: p => `${escape(labels[p.name])}: ${number(Number.isFinite(p.value) ? p.value : null)} ${unit}` },
        visualMap: { min: metric === "anomaly" ? -max : 0, max, calculable: false, orient: "horizontal", left: "center", bottom: 5,
          textStyle: { color: "#edf3fa" }, inRange: { color: metric === "anomaly" ? ["#b97836", "#eeeeee", "#256ba6"] : ["#e3f2ef", "#57a9ba", "#164f85"] } },
        series: [{ id: "rain-map-values", type: "map", map: "rain-continents", roam: false, top: 15, bottom: 75,
          itemStyle: { areaColor: "#526171", borderColor: "#c0cfdb", borderWidth: .5 },
          emphasis: { label: { show: false } }, select: { disabled: true },
          data: comparison.map(({ region: r, point }) => ({ name: r.id, value: point?.[metric] ?? null })) }],
      });
      observer.observe(map.getDom());
    }
    form.onsubmit = draw;
    draw();
  }
  async function load() {
    content.innerHTML = `${header}<p role="status">${text("Načítám ověřená data…", "Loading verified data…")}</p>`;
    try {
      const get = async name => {
        const response = await fetch(`${baseUrl}${precipitationApiBase}${name}`, { signal: request.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Precipitation ${name}: HTTP ${response.status}`);
        return response;
      };
      const catalog = await (await get("catalog.json")).json();
      if (!validatePrecipitationCatalog(catalog)) throw new Error("Invalid precipitation catalogue");
      const bytes = await (await get(catalog.product.file)).arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
      if (bytes.byteLength !== catalog.product.bytes || hash !== catalog.product.sha256) throw new Error("Precipitation checksum mismatch");
      const bundle = JSON.parse(new TextDecoder().decode(bytes));
      if (!validatePrecipitationBundle(bundle)) throw new Error("Invalid precipitation science contract");
      if (active()) show(bundle);
    } catch (error) {
      if (error.name === "AbortError" || !active()) return;
      console.error("Weather Global Precipitation:", error);
      disposeCharts();
      content.innerHTML = `${header}<section class="panel error" role="alert"><p>${text("Ověřená srážková data nejsou dostupná. Žádný odhad ani starší kopie nebyly dosazeny.",
        "Verified precipitation data are unavailable. No estimate or older copy was substituted.")}</p>
        <button id="rain-retry" type="button">${text("Zkusit znovu", "Retry")}</button></section>`;
      content.querySelector("#rain-retry").onclick = load;
    }
  }
  load();
  return { dispose() {
    disposed = true; request.abort(); disposeCharts();
    window.removeEventListener("resize", fit); document.removeEventListener("visibilitychange", fit);
  } };
}
