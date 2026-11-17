import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { snowApiBase, snowCitation, validateSnowCatalog, validateSnowBundle, snowHistory, snowSeason } from "./snow-cover.js";
import { chartExplanation } from "./chart-explanation.js";

echarts.use([LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

export function mountSnowCover({ content, language, baseUrl, isActive }) {
  const cs = language === "cs";
  const text = (czech, english) => cs ? czech : english;
  const title = text("Sněhová pokrývka severní polokoule", "Northern Hemisphere snow cover");
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(2000, i, 1))));
  const unit = text("mil. km²", "million km²");
  const springLabel = text("Jaro · březen–květen (MAM)", "Spring · March–May (MAM)");
  const refLabel = text("Projektový průměr 1981–2010", "Project mean 1981–2010");
  const nf = new Intl.NumberFormat(language, { maximumFractionDigits: 6 });
  const number = value => value === null ? "—" : nf.format(value);
  const reason = point => point.reason === "outside-source-period" ? text("Mimo období zdroje", "Outside source period")
    : point.reason === "incomplete-MAM" ? text("Neúplné jaro", "Incomplete spring") : text("Chybí ve zdroji", "Missing in source");
  const header = `<header class="page-heading"><p class="eyebrow">NOAA / Rutgers · NH SCE CDR v01r01 · 7D.3</p>
    <h1>${title}</h1><p>${text("Rozsah sněhem pokryté pevniny, nikoli výška sněhu nebo zásoba vody. Regiony a měsíční agregaci přebíráme od producenta.",
      "Snow-covered land extent, not snow depth or water storage. Regions and monthly aggregation come from the producer.")}</p></header>`;
  const request = new AbortController();
  let disposed = false;
  let charts = [];
  let observer;
  const active = () => !disposed && isActive();
  const disposeCharts = () => {
    observer?.disconnect();
    for (const chart of charts) chart.dispose();
    charts = [];
  };
  const fit = () => {
    for (const chart of charts) {
      const { width, height } = chart.getDom().getBoundingClientRect();
      if (width > 0 && height > 0) chart.resize({ width, height, animation: { duration: 0 } });
    }
  };
  window.addEventListener("resize", fit);
  document.addEventListener("visibilitychange", fit);

  function show(bundle) {
    const years = Array.from({ length: 61 }, (_, i) => 2026 - i);
    const options = selected => years.map(year => `<option${year === selected ? " selected" : ""}>${year}</option>`).join("");
    content.innerHTML = `${header}<p class="notice">${text("Ověřený datový pohled. Listopad 1966 až říjen 2026; rok 1966 a rok 2026 jsou neúplné. Žádné doplňování mezer ani jižní polokoule.",
      "Verified data view. November 1966 through October 2026; 1966 and 2026 are incomplete. No gap filling or Southern Hemisphere series.")}</p>
      <form id="snow-selection" class="panel ice-controls">
        <label>${text("Oblast producenta", "Producer region")}<select id="snow-region">${bundle.regions.map(region =>
          `<option value="${region.id}">${escape(region.name[language])}</option>`).join("")}</select></label>
        <label>${text("Historie měsíce nebo jara", "Month or spring history")}<select id="snow-period">
          ${months.map((label, i) => `<option value="${i + 1}">${label}</option>`).join("")}
          <option value="MAM" selected>${springLabel}</option></select></label>
        <label>${text("Veličina", "Metric")}<select id="snow-metric"><option value="extent">${text("Absolutní rozsah", "Absolute extent")}</option>
          <option value="anomaly">${text("Odchylka od reference", "Departure from reference")}</option></select></label>
        <label>${text("Historie od roku", "History from year")}<select id="snow-first">${options(1966)}</select></label>
        <label>${text("Historie do roku", "History through year")}<select id="snow-last">${options(2026)}</select></label>
        <label>${text("Sezónní srovnání · rok A", "Seasonal comparison · year A")}<select id="snow-year-a">${options(2026)}</select></label>
        <label>${text("Sezónní srovnání · rok B", "Seasonal comparison · year B")}<select id="snow-year-b">${options(2025)}</select></label>
        <button type="submit">${text("Použít výběr", "Apply selection")}</button><p id="snow-selection-error" role="alert" hidden></p>
      </form>
      <p class="meta">${text("Staženo", "Retrieved")}: 2026-11-06 · ${text("Grafy", "Charts")}: ${unit} ·
        ${text("Tabulky", "Tables")}: km² · ${text("Dostupných původních hodnot", "Available original values")}: 711/720 ${text("na oblast", "per region")}.</p>
      <section id="snow-history" class="panel"></section><section id="snow-season" class="panel"></section>
      <section class="panel"><h2>${text("Jak číst měsíce a jarní ústup", "Reading monthly coverage and spring retreat")}</h2>
        <p>${text("Historie porovnává vždy stejný měsíc mezi roky, nebo průměr rozsahu za březen–květen (MAM). Jarní průměr váží tři kompletní měsíce počtem dní 31/30/31; není součtem ploch ani celoročním výsledkem. Sezónní graf ukazuje vybrané roky po měsících: pokles od března k létu vyjadřuje ústup rozsahu, nikoli rychlost tání nebo přesné datum odtání.",
          "History compares the same month across years, or mean March–May (MAM) extent. The spring mean requires three complete source months and weights them by 31/30/31 days; it is not an area sum or whole-year result. The seasonal chart follows selected years month by month: declining extent from March towards summer shows retreat, not melt rate or an exact disappearance date.")}</p>
        <p>${text("Odchylka = rozsah minus projektový průměr stejného měsíce za 1981–2010; každý měsíc má 30 hodnot. Jarní reference je průměr 30 úplných ročních MAM průměrů. Záporná odchylka neznamená zápornou rozlohu. Referenční sloupce vždy uvádějí absolutní rozsah. Projektové reference nejsou oficiální anomálie Rutgers.",
          "Departure = extent minus the project 1981–2010 mean for that calendar month; every month has 30 values. The spring reference averages 30 complete yearly MAM means. Negative departures do not mean negative area. Reference columns always show absolute extent. These project references are not official Rutgers anomalies.")}</p>
        <h3>${text("Oblasti nejsou zaměnitelné", "Regions are not interchangeable")}</h3>
        <p>${text("Eurasie není samotná Evropa. Severní Amerika včetně Grónska tvoří s Eurasií severní polokouli (odchylka součtu nejvýše 1 km² kvůli zaokrouhlení zdroje). Varianta bez Grónska je alternativní pohled, nesčítá se znovu s celkem. Letní pokrývku výrazně ovlivňuje zaledněné Grónsko. Nepoužíváme naše kontinentální masky a nevytváříme řadu pro jižní polokouli.",
          "Eurasia is not Europe alone. North America including Greenland plus Eurasia form the Northern Hemisphere (source integer-rounding closure within 1 km²). The no-Greenland option is an alternative, not another additive region. Ice-covered Greenland strongly affects summer extent. We do not use our continental masks or create a Southern Hemisphere series.")}</p>
        <h3>${text("Mezery a změny měření", "Gaps and observing-system changes")}</h3>
        <p>${text("Ve všech oblastech chybí červenec 1968, červen–říjen 1969 a červenec–září 1971. Čáry se přes chybějící hodnoty nespojují. Oficiální měsíční soubory začínají v listopadu 1966; říjen nepřidáváme z odlišného týdenního produktu. Denní vstupy IMS nejsou denními hodnotami tohoto měsíčního produktu.",
          "All regions lack July 1968, June–October 1969 and July–September 1971. Lines do not bridge missing values. Official monthly files begin in November 1966; October is not added from the separate weekly product. Daily IMS inputs are not daily values in this monthly product.")}</p>
        <p>${text("Rutgers váží týdenní rozsahy počtem dní mapového týdne v daném měsíci; přebíráme hotová měsíční čísla, neprovádíme vlastní přepočet mřížky. Producent reanalyzoval roky 1966–1971, upravoval pevninskou masku a sjednotil přechod od ručních týdenních map na IMS v červnu 1999. Oblačnost, světelné podmínky, vegetace a hory omezují rozlišení. Historická dokumentace popisuje 89×89 buněk a 50% práh; archivovaný NetCDF má 88×88 a deklaruje přibližně 42 %. Tyto konvence nezaměňujeme ani znovu neprahujeme: zde jsou přímo oficiální měsíční regionální součty.",
          "Rutgers weights weekly extents by map-week days within each month. We retain the resulting monthly figures, not our own grid reduction. The producer reanalysed 1966–1971, corrected land masks and harmonised the June 1999 transition from manual weekly charts to IMS. Clouds, illumination, vegetation and mountains limit resolution. Historical documentation describes 89×89 cells and a 50% threshold; the archived NetCDF has 88×88 and declares about 42%. We do not equate or rethreshold these conventions: this view uses official monthly regional totals directly.")}</p>
        <p>${text("Vybrané soubory neobsahují číselnou nejistotu měření. Nevyrábíme pásmo 95 % ani 1σ; kolísání mezi roky není nejistota měření. Rozsah není výška, hustota ani vodní ekvivalent sněhu. Z této plochy neurčujeme zásobu vody, hmotnost ledovců nebo příspěvek hladině moře.",
          "Selected files provide no numerical measurement uncertainty. We create no 95% or 1-sigma band; year-to-year variability is not measurement uncertainty. Extent is not depth, density or snow water equivalent. It does not determine water storage, glacier mass or sea-level contribution.")}</p>
        <h3>${text("Slovníček", "Glossary")}</h3><dl>
          <dt>SCE</dt><dd>${text("Snow Cover Extent: rozsah sněhem pokryté pevniny podle produktu.", "Snow Cover Extent: snow-covered land extent as defined by the product.")}</dd>
          <dt>CDR</dt><dd>${text("Climate Data Record: dlouhodobá klimatická řada s úpravami návaznosti vstupů.", "Climate Data Record: long-term record with input-continuity adjustments.")}</dd>
          <dt>MAM</dt><dd>${text("Březen, duben, květen; severní meteorologické jaro.", "March, April, May; Northern Hemisphere meteorological spring.")}</dd>
          <dt>IMS</dt><dd>Interactive Multisensor Snow and Ice Mapping System.</dd>
        </dl><p><a href="#sea-ice?lang=${language}">${text("Jiná veličina: mořský led", "Different quantity: sea ice")}</a> ·
          <a href="#ice-sheets?lang=${language}">${text("Hmotnost pevninského ledu", "Land-ice mass")}</a></p>
      </section><section class="panel"><h2>${text("Zdroj a citace", "Source and citation")}</h2><p>${escape(snowCitation)}</p>
        <p><a href="https://climate.rutgers.edu/snowcover/190km/table_area.php?ui_set=2">Rutgers · ${text("původní regionální soubory", "original regional files")}</a> ·
          <a href="https://climate.rutgers.edu/snowcover/190km/docs.php?target=vis">${text("Metodika", "Methods")}</a> ·
          <a href="https://doi.org/10.7289/V5N014G9">NOAA CDR · DOI</a></p>
        <p class="meta">${text("CDR uvádí bez omezení přístupu a použití; uvádíme citaci, výběr a datum přístupu. Bez záštity NOAA/Rutgers.",
          "CDR states no restrictions on access or use; citation, subset and access date are provided. No NOAA/Rutgers endorsement.")}</p></section>`;
    const form = content.querySelector("#snow-selection");
    const selected = id => form.querySelector(`#snow-${id}`).value;
    let rows = [];
    let page = 0;
    let metric = "extent";
    let description = "";
    function table() {
      const host = content.querySelector("#snow-history-table");
      const count = Math.max(1, Math.ceil(rows.length / 20));
      host.innerHTML = `<div class="table-wrap" tabindex="0" role="region" aria-label="${text("Historická tabulka", "History table")}">
        <table><caption>${escape(description)} · ${text("přesné zdrojové km²; odvozené MAM a odchylky zaokrouhleny", "original km²; derived MAM and departures rounded")}</caption>
        <thead><tr><th scope="col">${text("Období", "Period")}</th><th scope="col">${text("Rozsah", "Extent")} (km²)</th>
          <th scope="col">${text("Odchylka", "Departure")} (km²)</th><th scope="col">${text("Stav", "Status")}</th></tr></thead><tbody>
        ${rows.slice(page * 20, (page + 1) * 20).map(point => `<tr><th scope="row">${point.date ?? point.year}</th>
          <td>${number(point.extent)}</td><td>${number(point.anomaly)}</td><td>${point.reason ? reason(point) : text("Dostupné", "Available")}</td></tr>`).join("")}
        </tbody></table></div><div class="table-pagination"><button id="snow-prev"${page === 0 ? " disabled" : ""}>${text("Předchozí", "Previous")}</button>
        <span>${page + 1} / ${count}</span><button id="snow-next"${page + 1 >= count ? " disabled" : ""}>${text("Další", "Next")}</button></div>`;
      for (const [id, delta] of [["snow-prev", -1], ["snow-next", 1]]) host.querySelector(`#${id}`).onclick = () => {
        page += delta; table(); host.querySelector(`#${id}`).focus();
      };
    }
    function chart(id, labels, series, label) {
      const element = content.querySelector(`#${id}`);
      element.setAttribute("role", "img"); element.setAttribute("aria-label", label);
      const instance = echarts.init(element, null, { renderer: "svg" });
      charts.push(instance);
      instance.setOption({
        animation: false, aria: { enabled: true, description: label }, color: ["#8abaff", "#ffba86", "#a7b9cc"],
        textStyle: { color: "#a7b9cc" }, grid: { top: 70, left: 62, right: 20, bottom: 60 },
        legend: { top: 0, type: "scroll", textStyle: { color: "#edf3fa" } },
        tooltip: { trigger: "axis", confine: true, backgroundColor: "#182637", borderColor: "#304357", textStyle: { color: "#edf3fa" },
          valueFormatter: value => value === null ? text("Chybí", "Missing") : `${number(value)} ${unit}` },
        xAxis: { type: "category", data: labels, axisLabel: { hideOverlap: true, color: "#a7b9cc" }, axisLine: { lineStyle: { color: "#304357" } } },
        yAxis: { type: "value", name: unit, scale: metric === "anomaly", axisLabel: { color: "#a7b9cc" }, splitLine: { lineStyle: { color: "#27394c" } } },
        series: series.map(row => ({ type: "line", connectNulls: false, symbolSize: 5, ...row,
          data: row.data.map(value => value === null ? null : value / 1e6) })),
      });
      observer.observe(element);
    }
    function draw(event) {
      event?.preventDefault();
      const first = Number(selected("first")), last = Number(selected("last"));
      const error = form.querySelector("#snow-selection-error");
      error.hidden = first <= last;
      error.textContent = first > last ? text("Začátek nesmí být po konci. Zůstává předchozí platný výběr.",
        "Start must not follow end. The previous valid selection remains.") : "";
      if (first > last) return;
      disposeCharts(); observer = new ResizeObserver(fit);
      const region = bundle.regions.find(row => row.id === selected("region"));
      const period = selected("period");
      metric = selected("metric");
      const metricLabel = metric === "extent" ? text("Rozsah", "Extent") : text("Odchylka", "Departure");
      const periodLabel = period === "MAM" ? springLabel : months[Number(period) - 1];
      rows = snowHistory(region, period, first, last); page = 0;
      const ref = region.reference.find(row => row.period === period);
      description = `${region.name[language]} · ${periodLabel} · ${metricLabel} · ${first}–${last}`;
      content.querySelector("#snow-history").innerHTML = `<h2>${text("Historie vybraného měsíce nebo jara", "Selected month or spring history")}</h2>
        <p id="snow-description" role="status">${escape(description)} · ${unit}.</p>
        <p id="snow-reference">${refLabel}: ${number(ref.mean)} km² · n=${ref.count}/30.
          ${text("Chybějících záznamů ve výběru", "Missing records in selection")}: ${rows.filter(row => row.extent === null).length}.</p>
        ${rows.length ? "" : `<p role="status">${text("Ve výběru není žádný zdrojový měsíc.", "No source month exists in this selection.")}</p>`}
        <div id="snow-history-chart" class="chart ice-chart"></div>
        ${chartExplanation("snow-history", language, [
          "Graf porovnává zvolený měsíc nebo denně vážený průměr března až května ve vybrané oblasti mezi roky. Osa y ukazuje rozsah sněhem pokryté plochy, nebo jeho odchylku od projektové reference 1981–2010.",
          "The chart compares the selected month or day-weighted March–May mean in the selected region across years. The y-axis shows snow-covered extent or its departure from the project 1981–2010 reference.",
        ], [
          [["Rozsah", "Extent"], ["Plocha pevniny klasifikovaná zdrojem jako sněhem pokrytá; není to výška sněhu ani zásoba vody.", "Land area classified as snow-covered by the source; not snow depth or water storage."]],
          [["Odchylka", "Departure"], ["Rozsah minus projektový průměr stejného měsíce nebo období za roky 1981–2010.", "Extent minus the project mean for the same month or period in 1981–2010."]],
          [["MAM", "MAM"], ["Průměr rozsahu za březen–květen, vážený počtem dní v měsících; není to roční součet.", "March–May mean extent weighted by days per month; not an annual sum."]],
        ])}
        <div id="snow-history-table"></div>`;
      chart("snow-history-chart", rows.map(point => String(point.year ?? point.date.slice(0, 4))), [
        { id: "snow-values", name: metricLabel, data: rows.map(point => point[metric]) },
        { id: "snow-reference", name: refLabel, data: rows.map(() => metric === "extent" ? ref.mean : 0),
          symbol: "none", lineStyle: { type: "dashed" } },
      ], description);
      table();
      const chosenYears = [...new Set([Number(selected("year-a")), Number(selected("year-b"))])];
      const seasons = chosenYears.map(year => ({ year, points: snowSeason(region, year) }));
      const seasonDescription = `${region.name[language]} · ${chosenYears.join(" / ")} · ${metricLabel}`;
      content.querySelector("#snow-season").innerHTML = `<h2>${text("Sezónní vývoj a jarní ústup", "Seasonal cycle and spring retreat")}</h2>
        <p>${escape(seasonDescription)} · ${unit}. ${text("Neúplné roky se nedoplňují; bez přesného dne odtání.", "Incomplete years are not filled; no exact snow-disappearance date.")}</p>
        <div id="snow-season-chart" class="chart ice-chart"></div>
        ${chartExplanation("snow-season", language, [
          "Graf ukazuje měsíční průběh rozsahu sněhové pokrývky ve dvou zvolených letech a referenční měsíční průměry. Osa x jsou kalendářní měsíce; neúplné roky se nedoplňují.",
          "The chart shows monthly snow-cover extent for two selected years alongside reference means by calendar month. The x-axis is calendar month; incomplete years are not filled.",
        ], [
          [["Sezónnost", "Seasonality"], ["Opakující se změna během roku; sama o sobě není dlouhodobým trendem.", "Recurring within-year variation; not by itself a long-term trend."]],
          [["Referenční průměr", "Reference mean"], ["Projektový průměr daného kalendářního měsíce v období 1981–2010.", "Project mean for that calendar month during 1981–2010."]],
          [["Neúplný měsíc", "Incomplete month"], ["Chybějící zdrojový údaj zůstává prázdný a není vykreslen jako nula.", "A missing source value remains blank and is not plotted as zero."]],
        ])}
        <div class="table-wrap" tabindex="0" role="region" aria-label="${text("Sezónní tabulka", "Seasonal table")}">
        <table><caption>${escape(seasonDescription)} · km²</caption><thead><tr><th scope="col">${text("Měsíc", "Month")}</th>
        ${chosenYears.map(year => `<th scope="col">${year}</th>`).join("")}<th scope="col">${refLabel} (km²)</th><th scope="col">n / 30</th></tr></thead><tbody>
        ${months.map((month, i) => `<tr><th scope="row">${month}</th>${seasons.map(season => {
          const point = season.points[i];
          return `<td>${number(point[metric])}${point.reason ? ` · ${reason(point)}` : ""}</td>`;
        }).join("")}<td>${number(region.reference[i].mean)}</td><td>30</td></tr>`).join("")}</tbody></table></div>`;
      chart("snow-season-chart", months, [
        ...seasons.map(season => ({ id: `season-${season.year}`, name: String(season.year), data: season.points.map(point => point[metric]) })),
        { id: "season-reference", name: refLabel, data: region.reference.slice(0, 12).map(row => metric === "extent" ? row.mean : 0),
          symbol: "none", lineStyle: { type: "dashed" } },
      ], seasonDescription);
    }
    form.onsubmit = draw;
    draw();
  }
  async function load() {
    content.innerHTML = `${header}<p role="status">${text("Načítám ověřená data…", "Loading verified data…")}</p>`;
    try {
      const get = async name => {
        const response = await fetch(`${baseUrl}${snowApiBase}${name}`, { signal: request.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Snow cover ${name}: HTTP ${response.status}`);
        return response;
      };
      const catalog = await (await get("catalog.json")).json();
      if (!validateSnowCatalog(catalog)) throw new Error("Invalid snow catalogue");
      const bytes = await (await get(catalog.product.file)).arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
      if (bytes.byteLength !== catalog.product.bytes || hash !== catalog.product.sha256) throw new Error("Snow checksum mismatch");
      const bundle = JSON.parse(new TextDecoder().decode(bytes));
      if (!validateSnowBundle(bundle)) throw new Error("Invalid snow science contract");
      if (active()) show(bundle);
    } catch (error) {
      if (error.name === "AbortError" || !active()) return;
      console.error("Weather Global Snow Cover:", error);
      disposeCharts();
      content.innerHTML = `${header}<section class="panel error" role="alert"><p>${text("Ověřená data sněhové pokrývky nejsou dostupná. Žádný odhad ani starší kopie nebyly dosazeny.",
        "Verified snow-cover data are unavailable. No estimate or older copy was substituted.")}</p>
        <button id="snow-retry" type="button">${text("Zkusit znovu", "Retry")}</button></section>`;
      content.querySelector("#snow-retry").onclick = load;
    }
  }
  load();
  return { dispose() {
    disposed = true; request.abort(); disposeCharts();
    window.removeEventListener("resize", fit);
    document.removeEventListener("visibilitychange", fit);
  } };
}
