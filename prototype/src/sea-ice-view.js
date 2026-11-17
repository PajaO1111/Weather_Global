import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import {
  seaIceApiBase, validateSeaIceBundle, validateSeaIceCatalog, seaIceHistory, seaIceSeason,
} from "./sea-ice.js";
import { chartExplanation } from "./chart-explanation.js";

echarts.use([LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

export function mountSeaIce({ content, language, baseUrl, isActive }) {
  const cs = language === "cs";
  const text = (czech, english) => cs ? czech : english;
  const title = text("Mořský led Arktidy a Antarktidy", "Arctic and Antarctic sea ice");
  const months = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(cs ? "cs" : "en", { month: "long", timeZone: "UTC" })
      .format(new Date(Date.UTC(2000, index, 1))));
  const formatter = new Intl.NumberFormat(cs ? "cs" : "en", { maximumFractionDigits: 3 });
  const number = value => value === null ? "—" : formatter.format(value);
  const unit = text("mil. km²", "million km²");
  const referenceLabel = text("Projektový průměr 1981–2010", "Project mean 1981–2010");
  const missing = text("Chybí ve zdroji", "Missing in source");
  const outside = text("Mimo období zdroje", "Outside source period");
  const header = `<header class="page-heading"><p class="eyebrow">NSIDC · Sea Ice Index v4 · 7D.1</p><h1>${title}</h1>
    <p>${text("Rozsah mořského ledu ze zveřejněných měsíčních satelitních analýz. Obě polokoule zůstávají oddělené.",
      "Sea ice extent from published monthly satellite analyses. The two hemispheres remain separate.")}</p></header>`;
  const request = new AbortController();
  let disposed = false;
  let charts = [];
  let resizeObserver;
  const active = () => !disposed && isActive();
  const disposeCharts = () => {
    resizeObserver?.disconnect();
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
    const years = Array.from({ length: 49 }, (_, index) => 2026 - index);
    const yearOptions = selected => years.map(year =>
      `<option value="${year}"${year === selected ? " selected" : ""}>${year}</option>`).join("");
    content.innerHTML = `${header}
      <p class="notice">${text("Ověřený datový pohled. Měsíční údaje nejsou denní minima. Poslední data se mohou revidovat.",
        "Verified data view. Monthly values are not daily minima. Recent data may be revised.")}</p>
      <form id="ice-selection" class="panel ice-controls">
        <label>${text("Polokoule", "Hemisphere")}<select id="ice-region">${bundle.regions.map(region =>
          `<option value="${region.id}">${escape(region.name[language])}</option>`).join("")}</select></label>
        <label>${text("Měsíc historického grafu", "Historical chart month")}<select id="ice-month">${months.map((month, index) =>
          `<option value="${index + 1}"${index === 8 ? " selected" : ""}>${month}</option>`).join("")}</select></label>
        <label>${text("Zobrazení", "Display")}<select id="ice-metric">
          <option value="extent">${text("Absolutní rozsah", "Absolute extent")} (${unit})</option>
          <option value="anomaly">${text("Odchylka od měsíční reference", "Departure from monthly reference")} (${unit})</option></select></label>
        <label>${text("Historie od roku", "History from year")}<select id="ice-first">${yearOptions(1978)}</select></label>
        <label>${text("Historie do roku", "History through year")}<select id="ice-last">${yearOptions(2026)}</select></label>
        <label>${text("Sezónní srovnání · rok A", "Seasonal comparison · year A")}<select id="ice-year-a">${yearOptions(2026)}</select></label>
        <label>${text("Sezónní srovnání · rok B", "Seasonal comparison · year B")}<select id="ice-year-b">${yearOptions(2025)}</select></label>
        <button type="submit">${text("Použít výběr", "Apply selection")}</button>
        <p id="ice-selection-error" role="alert" hidden></p>
      </form>
      <p class="meta">${text("Data", "Data")}: 1978-11 — 2026-10 · ${text("Staženo", "Retrieved")}: 2026-11-06 · ${unit}.
        ${text("Rok 2026 je neúplný; leden–říjen. Rok 1978 obsahuje jen listopad a prosinec.",
          "2026 is incomplete: January–October. 1978 includes only November and December.")}</p>
      <section id="ice-history" class="panel"></section>
      <section id="ice-season" class="panel"></section>
      <section class="panel"><h2>${text("Jak grafy číst", "How to read the charts")}</h2>
        <p><a href="#ice-sheets?lang=${language}">${text("Jiný ukazatel: hmotnost pevninského ledu Grónska a Antarktidy", "Different indicator: Greenland and Antarctic land-ice mass")}</a></p>
        <p>${text("Historický graf porovnává vždy tentýž kalendářní měsíc mezi roky, nikoli celý rok. Sezónní graf ukazuje průběh dvou zvolených let po měsících. Změnu během roku nezaměňujte s dlouhodobým trendem; opačná roční období polokoulí neposuzujte jako srovnatelnou sezónu.",
          "The historical chart compares the same calendar month across years, not whole years. The seasonal chart follows two selected years month by month. Within-year seasonality is not a long-term trend; opposite hemispheric seasons are not equivalent seasons.")}</p>
        <p>${text("Odchylka = rozsah minus projektový průměr daného měsíce za dostupné roky 1981–2010. Leden má 29 hodnot (chybí 1988), prosinec 29 (chybí 1987), ostatní měsíce 30. Jde o výpočet projektu, nikoli převzetí oficiální anomálie NSIDC. Záporná odchylka znamená méně ledu než v referenci, ne záporný rozsah.",
          "Departure = extent minus the project mean for that calendar month using available 1981–2010 values. January has 29 values (1988 missing), December 29 (1987 missing), other months 30. This is a project calculation, not the official NSIDC anomaly. Negative departures mean less ice than the reference, not negative extent.")}</p>
        <p>${text("Chybějící hodnoty se nedopočítávají a čáry se přes ně nespojují. Rozsah není plocha čistého ledu, objem ani hmotnost. Tání plovoucího mořského ledu nepřevádíme na příspěvek hladině moře; pevninské ledovce jsou jiný produkt. Z měsíčních údajů neurčujeme přesné denní minimum, maximum ani jejich datum.",
          "Missing values are not filled and lines do not bridge gaps. Extent is not ice-covered area, volume or mass. Melting floating sea ice is not converted into sea-level contribution; land ice is a separate product. Monthly data cannot establish exact daily minima, maxima or dates.")}</p>
        <p>${text("Přebíráme měsíční agregaci producenta: součet ploch buněk s měsíční koncentrací ledu alespoň 15 %. Nejde nutně o průměr denních rozsahů. Produkt mění vstupní družicové řady (včetně AMSR2 ve v4); identifikátory vstupů zachovává tabulka. Polární domény NSIDC nejsou našimi maskami světadílů. Nejistotu měření zde nevyčíslujeme a variabilitu neznačíme jako interval spolehlivosti.",
          "We retain the producer's monthly aggregation: summed area of grid cells with monthly ice concentration at least 15%. It is not necessarily the mean of daily extents. Input satellite series change (including AMSR2 in v4); the table preserves input identifiers. NSIDC polar domains are not our continental masks. Measurement uncertainty is not quantified here; variability is not labelled a confidence interval.")}</p>
        <h3>${text("Slovníček", "Glossary")}</h3><dl>
          <dt>${text("Rozsah", "Extent")}</dt><dd>${text("Celá plocha buněk splňujících práh koncentrace ≥15 %.", "Full area of cells meeting the ≥15% concentration threshold.")}</dd>
          <dt>${text("Koncentrace", "Concentration")}</dt><dd>${text("Podíl povrchu buňky pokrytý ledem.", "Fraction of a grid cell covered by ice.")}</dd>
          <dt>${text("Měsíční reference", "Monthly reference")}</dt><dd>${text("Samostatný aritmetický průměr pro každý měsíc, bez doplnění mezer.", "A separate arithmetic mean for each calendar month, without filling gaps.")}</dd>
          <dt>${text("Sezónnost", "Seasonality")}</dt><dd>${text("Opakující se průběh roku, odlišný od změn mezi roky.", "The recurring annual cycle, distinct from changes across years.")}</dd>
        </dl></section>
      <section class="panel"><h2>${text("Zdroj a citace", "Source and citation")}</h2>
        <p>${escape(bundle.source.citation)}</p>
        <p><a href="https://nsidc.org/data/g02135/versions/4">NSIDC · G02135 v4</a> ·
          <a href="https://doi.org/10.7265/a98x-0f50">DOI</a> ·
          <a href="https://nsidc.org/sites/default/files/documents/user-guide/g02135-v004-userguide.pdf">${text("Metodika", "User guide")}</a> ·
          <a href="https://nsidc.org/about/data-use-and-copyright">${text("Podmínky použití", "Use terms")}</a> ·
          <a href="${baseUrl}${seaIceApiBase}bundle.json">${text("Ověřený JSON včetně původu a SHA-256", "Verified JSON including provenance and SHA-256")}</a></p>
        <p>${text("Uvádíme produkt, verzi, DOI, podmnožinu a datum přístupu. NSIDC projekt nezaštiťuje. Zveřejnění celého atlasu nadále podléhá samostatné kontrole jeho dalších produktů.",
          "Product, version, DOI, subset and access date are cited. NSIDC does not endorse this project. Publication of the full atlas remains subject to separate review of its other products.")}</p>
      </section>`;
    const form = content.querySelector("#ice-selection");
    const selected = id => form.querySelector(`#ice-${id}`).value;
    let page = 0;
    let history;
    let region;
    let metric;
    let month;
    const reason = point => point.reason === "outside-source-period" ? outside : point.reason ? missing : text("Dostupné", "Available");

    function table() {
      const host = content.querySelector("#ice-history-table");
      const rows = history.slice(page * 20, (page + 1) * 20);
      host.innerHTML = `<div class="table-wrap" tabindex="0" role="region" aria-label="${text("Historická tabulka", "History table")}">
        <table><caption>${escape(region.name[language])} · ${months[month - 1]} · ${text("rozsah a odchylka", "extent and departure")} (${unit})</caption>
        <thead><tr>${[text("Datum", "Date"), text("Rozsah", "Extent"), text("Odchylka", "Departure"),
          text("Počet referenčních roků", "Reference year count"), text("Vstupní datová řada", "Input dataset"), text("Stav", "Status")]
          .map(label => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${rows.map(point =>
          `<tr><th scope="row">${point.date}</th><td>${number(point.extent)}</td><td>${number(point.anomaly)}</td>
          <td>${region.reference[month - 1].count}</td><td>${escape(point.source_dataset ?? "—")}</td><td>${reason(point)}</td></tr>`).join("")}</tbody></table></div>
        <p class="meta" role="status">${text("Strana", "Page")} ${page + 1} / ${Math.max(1, Math.ceil(history.length / 20))}
        · ${history.length} ${text("záznamů", "records")}</p>
        <div class="chart-toolbar"><button type="button" id="ice-prev"${page === 0 ? " disabled" : ""}>${text("Předchozí", "Previous")}</button>
        <button type="button" id="ice-next"${(page + 1) * 20 >= history.length ? " disabled" : ""}>${text("Další", "Next")}</button></div>`;
      for (const [id, delta] of [["ice-prev", -1], ["ice-next", 1]]) {
        host.querySelector(`#${id}`).onclick = () => {
          page += delta; table();
          host.querySelector(`#${id}`).focus();
        };
      }
    }

    function chart(id, labels, series, description) {
      const element = content.querySelector(`#${id}`);
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", description);
      const instance = echarts.init(element, null, { renderer: "svg" });
      charts.push(instance);
      instance.setOption({
        animation: false, aria: { enabled: true, description },
        color: ["#075985", "#b45309", "#64748b"],
        grid: { top: 65, left: 60, right: 20, bottom: 60 },
        tooltip: { trigger: "axis", confine: true, valueFormatter: value => value === null ? missing : `${number(value)} ${unit}` },
        legend: { top: 0, type: "scroll" },
        xAxis: { type: "category", data: labels, axisLabel: { hideOverlap: true } },
        yAxis: { type: "value", name: unit, scale: metric === "anomaly" },
        series: series.map(row => ({ type: "line", connectNulls: false, symbolSize: 5, ...row })),
      });
      resizeObserver.observe(element);
    }

    function draw(event) {
      event?.preventDefault();
      const first = Number(selected("first"));
      const last = Number(selected("last"));
      const error = form.querySelector("#ice-selection-error");
      error.hidden = first <= last;
      error.textContent = first > last ? text("Začátek období nesmí být po jeho konci. Zobrazen zůstává předchozí platný výběr.",
        "The start must not follow the end. The previous valid selection remains displayed.") : "";
      if (first > last) return;
      disposeCharts();
      resizeObserver = new ResizeObserver(fit);
      region = bundle.regions.find(row => row.id === selected("region"));
      metric = selected("metric");
      month = Number(selected("month"));
      const metricLabel = metric === "extent" ? text("Rozsah", "Extent") : text("Odchylka od reference", "Departure from reference");
      history = seaIceHistory(region, month, first, last);
      page = 0;
      const reference = region.reference[month - 1];
      const description = `${region.name[language]} · ${months[month - 1]} · ${metricLabel} · ${first}–${last} · ${unit}`;
      const host = content.querySelector("#ice-history");
      host.innerHTML = `<h2>${text("Historie vybraného měsíce", "Selected month history")}</h2><p id="ice-history-description" role="status">${escape(description)}.</p>
        <p>${referenceLabel}: <strong>${number(reference.mean)} ${unit}</strong> · n=${reference.count}/30.
        ${reference.missing_years.length ? `${missing}: ${reference.missing_years.join(", ")}.` : ""}
        ${text("Chybějící záznamy ve výběru", "Missing records in selection")}: ${history.filter(point => point.extent === null).length}.</p>
        ${history.length ? "" : `<p role="status">${text("Ve výběru není žádný zdrojový měsíc.", "No source month exists in this selection.")}</p>`}
        <div id="ice-history-chart" class="chart ice-chart"></div>
        ${chartExplanation("sea-ice-history", language, [
          "Graf porovnává zvolený kalendářní měsíc v letech pro vybranou polokouli. Zobrazuje absolutní rozsah mořského ledu nebo odchylku od projektového průměru stejného měsíce v letech 1981–2010.",
          "The chart compares the selected calendar month across years for the chosen hemisphere. It shows absolute sea-ice extent or departure from the project mean for that calendar month in 1981–2010.",
        ], [
          [["Rozsah mořského ledu", "Sea-ice extent"], ["Součet ploch buněk s měsíční koncentrací ledu alespoň 15 %; nejde o čistou plochu ledu, objem ani hmotnost.", "Sum of grid-cell areas with monthly ice concentration of at least 15%; not ice-covered area, volume or mass."]],
          [["Odchylka", "Departure"], ["Rozsah minus projektový měsíční průměr za období 1981–2010.", "Extent minus the project calendar-month mean for 1981–2010."]],
          [["Polokoule", "Hemisphere"], ["Arktida a Antarktida jsou samostatné domény s opačnou sezónností, proto se přímo nesčítají.", "Arctic and Antarctic are separate domains with opposite seasonality and are not directly added."]],
        ])}
        <div id="ice-history-table"></div>`;
      const referenceSeries = { name: referenceLabel,
        data: history.map(() => metric === "extent" ? reference.mean : 0), symbol: "none", lineStyle: { type: "dashed" } };
      chart("ice-history-chart", history.map(point => point.date.slice(0, 4)),
        [{ name: metricLabel, data: history.map(point => point[metric]) }, referenceSeries], description);
      table();

      const chosenYears = [...new Set([Number(selected("year-a")), Number(selected("year-b"))])];
      const seasons = chosenYears.map(year => ({ year, points: seaIceSeason(region, year) }));
      const seasonalDescription = `${region.name[language]} · ${metricLabel} · ${chosenYears.join(" / ")} · ${unit}`;
      content.querySelector("#ice-season").innerHTML = `<h2>${text("Sezónní srovnání", "Seasonal comparison")}</h2>
        <p>${escape(seasonalDescription)}. ${text("Všechny kalendářní měsíce; neúplné roky zůstávají neúplné.",
          "All calendar months; incomplete years remain incomplete.")}</p>
        <div id="ice-season-chart" class="chart ice-chart"></div>
        ${chartExplanation("sea-ice-season", language, [
          "Graf zobrazuje měsíční sezónní průběh zvolených roků pro vybranou polokouli a měsíční referenci 1981–2010. Sezónní cyklus nevyjadřuje dlouhodobý trend; neúplné roky zůstávají neúplné.",
          "The chart shows the monthly seasonal cycle for the selected years and hemisphere alongside the 1981–2010 monthly reference. Seasonal variation is not a long-term trend; incomplete years remain incomplete.",
        ], [
          [["Měsíční reference", "Monthly reference"], ["Průměr rozsahu pro stejný kalendářní měsíc v dostupných letech 1981–2010.", "Mean extent for the same calendar month across available 1981–2010 years."]],
          [["Sezónní cyklus", "Seasonal cycle"], ["Pravidelný průběh během roku; měsíční data neurčují přesné denní minimum ani datum.", "The within-year pattern; monthly data do not determine an exact daily minimum or date."]],
          [["Chybějící hodnota", "Missing value"], ["Mezera zdroje, nikoli nulový rozsah; čára se přes ni nespojuje.", "A source gap, not zero extent; the line does not connect across it."]],
        ])}
        <div class="table-wrap" tabindex="0" role="region" aria-label="${text("Sezónní tabulka", "Seasonal table")}">
        <table><caption>${escape(seasonalDescription)} · ${text("zvolená veličina a měsíční reference", "selected metric and monthly reference")}</caption>
        <thead><tr><th scope="col">${text("Měsíc", "Month")}</th>${chosenYears.map(year => `<th scope="col">${year}</th>`).join("")}
        <th scope="col">${referenceLabel} (${unit})</th><th scope="col">n / 30</th></tr></thead><tbody>
        ${months.map((label, index) => `<tr><th scope="row">${label}</th>${seasons.map(season => {
          const point = season.points[index];
          return `<td>${number(point[metric])}${point.reason ? ` · ${reason(point)}` : ""}</td>`;
        }).join("")}<td>${number(region.reference[index].mean)}</td><td>${region.reference[index].count}</td></tr>`).join("")}</tbody></table></div>
        <p class="meta">${text("Referenční sloupec vždy uvádí absolutní rozsah; v grafu odchylek odpovídá referenci nula.",
          "The reference column always gives absolute extent; the departure chart uses zero for the reference.")}</p>`;
      chart("ice-season-chart", months,
        [...seasons.map(season => ({ name: String(season.year), data: season.points.map(point => point[metric]) })),
          { name: referenceLabel, data: region.reference.map(row => metric === "extent" ? row.mean : 0),
            symbol: "none", lineStyle: { type: "dashed" } }], seasonalDescription);
    }
    form.onsubmit = draw;
    draw();
  }

  async function load() {
    content.innerHTML = `${header}<p role="status">${text("Načítám ověřená měsíční data…", "Loading verified monthly data…")}</p>`;
    try {
      const get = async name => {
        const response = await fetch(`${baseUrl}${seaIceApiBase}${name}`, {
          signal: request.signal, cache: "no-store", headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Sea ice ${name}: HTTP ${response.status}`);
        return response;
      };
      const catalog = await (await get("catalog.json")).json();
      if (!validateSeaIceCatalog(catalog)) throw new Error("Invalid sea ice catalogue");
      const bytes = await (await get(catalog.product.file)).arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map(value => value.toString(16).padStart(2, "0")).join("");
      if (bytes.byteLength !== catalog.product.bytes || hash !== catalog.product.sha256) {
        throw new Error("Sea ice product checksum mismatch");
      }
      const bundle = JSON.parse(new TextDecoder().decode(bytes));
      if (!validateSeaIceBundle(bundle)) throw new Error("Invalid sea ice product");
      if (active()) show(bundle);
    } catch (error) {
      if (error.name === "AbortError" || !active()) return;
      console.error("Weather Global Sea Ice:", error);
      content.innerHTML = `${header}<section class="panel error" role="alert"><p>${text("Ověřená data mořského ledu nejsou dostupná. Nebyla nahrazena odhadem ani starší kopií.",
        "Verified sea ice data are unavailable. No estimate or older copy was substituted.")}</p>
        <button id="ice-retry" type="button">${text("Zkusit znovu", "Retry")}</button></section>`;
      content.querySelector("#ice-retry").onclick = load;
    }
  }
  load();
  return {
    dispose() {
      disposed = true;
      request.abort();
      disposeCharts();
      window.removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", fit);
    },
  };
}
