import * as echarts from "echarts/core";
import { CustomChart, LineChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import {
  iceSheetApiBase, iceSheetMonthIndex, iceSheetMonth, iceSheetSegments, iceSheetGaps,
  validateIceSheetBundle, validateIceSheetCatalog, selectIceSheetPeriod,
} from "./ice-sheets.js";
import { chartExplanation } from "./chart-explanation.js";

echarts.use([CustomChart, LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

export function mountIceSheets({ content, language, baseUrl, isActive }) {
  const cs = language === "cs";
  const text = (czech, english) => cs ? czech : english;
  const format = new Intl.NumberFormat(cs ? "cs" : "en", { maximumFractionDigits: 2 });
  const number = value => value === null ? "—" : format.format(value);
  const route = id => `#${id}?lang=${language}`;
  const title = text("Pevninský led: Grónsko a Antarktida", "Land ice: Greenland and Antarctica");
  const boundsName = text("Zveřejněné meze NASA", "Published NASA bounds");
  const header = `<header class="page-heading"><p class="eyebrow">NASA · GRACE / GRACE-FO · 7D.2</p><h1>${title}</h1>
    <p>${text("Změna hmotnosti ledových štítů v gigatunách, nikoli rozsah mořského ledu. Hotové regionální řady z veřejných grafů NASA; žádné vlastní prostorové masky.",
      "Ice-sheet mass change in gigatonnes, not sea ice extent. Producer-integrated regional series from public NASA charts; no project spatial masks.")}</p></header>`;
  const request = new AbortController();
  let disposed = false;
  let chart;
  let observer;
  const active = () => !disposed && isActive();
  const disposeChart = () => { observer?.disconnect(); chart?.dispose(); chart = null; };
  const fit = () => {
    if (!chart) return;
    const { width, height } = chart.getDom().getBoundingClientRect();
    if (width > 0 && height > 0) chart.resize({ width, height, animation: { duration: 0 } });
  };
  window.addEventListener("resize", fit);
  document.addEventListener("visibilitychange", fit);

  function show(bundle) {
    const months = Array.from({ length: 292 }, (_, index) => iceSheetMonth(iceSheetMonthIndex("2002-04") + index));
    const options = selected => months.map(month => `<option${month === selected ? " selected" : ""}>${month}</option>`).join("");
    content.innerHTML = `${header}
      <p class="notice">${text("Ověřený datový pohled. Zdrojový graf NASA má vlastní nulu a zveřejněné dolní/horní meze, ale neuvádí jejich hladinu spolehlivosti. Nejde o nové stažení vědeckých granúl PO.DAAC.",
        "Verified data view. The NASA source chart has its own zero and published lower/upper bounds, but does not state their confidence level. This is not a new download of scientific PO.DAAC granules.")}</p>
      <form id="land-selection" class="panel ice-controls">
        <label>${text("Ledový štít", "Ice sheet")}<select id="land-region">${bundle.regions.map(region =>
          `<option value="${region.id}">${escape(region.name[language])}</option>`).join("")}</select></label>
        <label>${text("Od měsíce", "From month")}<select id="land-first">${options("2002-04")}</select></label>
        <label>${text("Do měsíce", "Through month")}<select id="land-last">${options("2026-07")}</select></label>
        <label class="land-bound-control"><span>${text("Nejistota zdroje", "Source uncertainty")}</span>
          <span><input id="land-bounds" type="checkbox" checked> ${text("Zobrazit zveřejněné meze", "Show published bounds")}</span></label>
        <button type="submit">${text("Použít výběr", "Apply selection")}</button>
        <p id="land-selection-error" role="alert" hidden></p>
      </form>
      <p class="meta">${text("Zdrojový interval", "Source period")}: ${bundle.period.first} — ${bundle.period.last}
        · ${text("Graf aktualizován", "Chart updated")}: 2026-10-23 · ${text("Staženo", "Retrieved")}: 2026-11-06 · Gt.</p>
      <section id="land-result" class="panel"></section>
      <section class="panel"><h2>${text("Jak graf číst", "How to read the chart")}</h2>
        <p>${text("Body jsou změny hmotnosti publikované NASA v nepravidelných reprezentativních epochách měsíčních řešení GRACE/GRACE-FO. Vodorovná osa zachovává původní desetinný rok; datum v tabulce je štítek zdroje, nikoli denní měření. Někdy jsou dva body ve stejném kalendářním měsíci — neslučujeme je ani neposouváme do jiného měsíce.",
          "Points are NASA-published mass changes at irregular representative epochs of monthly GRACE/GRACE-FO solutions. The horizontal axis retains original decimal years; table dates are source labels, not daily measurements. Some calendar months contain two points: neither is merged or shifted to another month.")}</p>
        <p>${text("Nula je převzata z grafu NASA: první bod 2002-04-16 má hodnotu 0 Gt. Jde o změnu, nikoli celkovou hmotnost štítu nebo klimatologii 1981–2010. Projekt nic nepřebázuje a výběr kratšího období nulu neposouvá. JSON grafu nepopisuje úplnou referenční operaci; základnu vědecké mřížky nelze automaticky přisoudit tomuto grafu.",
          "Zero is retained from the NASA chart: the first point, labelled 2002-04-16, is 0 Gt. This is change, not total ice-sheet mass or a 1981–2010 climatology. The project does not rebase data, including shorter selections. The chart JSON does not document the full reference operation; the scientific grid's baseline cannot automatically be assigned to this graph.")}</p>
        <p>${text("Čára a pásmo se nepřemosťují přes původní chybějící bod ani přes interval delší než 0,125 desetinného roku (přibližně 46 dnů). To je pouze grafické pravidlo, nikoli doplněná data. Hlavní mezera leží mezi posledním bodem GRACE 2017-06-10 a prvním bodem GRACE-FO 2018-06-14. Mezera není nulová hmotnost ani důkaz, že se led neměnil.",
          "The line and band do not bridge the original null record or intervals longer than 0.125 decimal year (about 46 days). This is only a display rule, not filled data. The main gap lies between the last GRACE point labelled 2017-06-10 and first GRACE-FO point labelled 2018-06-14. A gap is not zero mass or evidence of no ice change.")}</p>
        <p>${text("Pásmo a svislé úsečky přesně zachovávají zveřejněné y_margin_min/y_margin_max, bez přepočtu. Grafový JSON neuvádí hladinu spolehlivosti ani kovarianci po změně reference: neoznačujeme je jako 95 %, 1σ nebo úplnou nejistotu úbytku od roku 2002. Obecné poznámky k mascon řešení popisují kalibraci 1σ, nikoli význam konkrétního pásma tohoto veřejného grafu.",
          "The band and vertical bars preserve published y_margin_min/y_margin_max exactly, without recalculation. The chart JSON provides no confidence level or covariance after reference changes: these bounds are not labelled 95%, 1σ or total uncertainty in loss since 2002. General mascon release notes discuss 1σ calibration, not the specific meaning of this public chart's band.")}</p>
        <p>${text("GRACE odvozuje změny hmotnosti ze změn gravitačního pole po zpracování producentem; nejde o přímé měření tloušťky ledu. Podkladové mascon řešení zahrnuje geofyzikální korekce včetně GIA. Nepřidáváme je znovu a nepoužíváme hydrologické škálovací faktory ani provizorní antarktickou teplotní masku projektu. Změny posledních řešení mohou zpětně upravit celý záznam.",
          "GRACE infers mass changes from gravity-field changes after producer processing; it is not direct ice-thickness measurement. The underlying mascon solution includes geophysical corrections, including GIA. We do not apply them again or use hydrological gain factors or the project's provisional Antarctic temperature mask. New solutions can revise the entire historical record.")}</p>
        <p>${text("Přírůstek sněhu a úbytek odtokem, táním či odlamováním společně ovlivňují čistou změnu hmotnosti. Růst v jednotlivém období nevyvrací dlouhodobý úbytek. Nezobrazujeme roční součty, extrapolace ani vlastní trendovou nejistotu. Rozdíly a součty nejistot nelze počítat jako nezávislé bez znalosti kovariancí.",
          "Snow accumulation and losses through flow, melting and calving jointly affect net mass change. A gain in one interval does not disprove long-term loss. No annual sums, extrapolations or project trend uncertainty are shown. Uncertainty of differences or sums cannot be computed as independent without covariance information.")}</p>
        <h3>${text("Slovníček", "Glossary")}</h3><dl>
          <dt>Gt</dt><dd>${text("Gigatuna = miliarda metrických tun; jednotka hmotnosti, nikoli plochy.", "Gigatonne = one billion metric tonnes; mass, not area.")}</dd>
          <dt>GRACE / GRACE-FO</dt><dd>${text("Družicové mise sledující změny gravitačního pole Země; ne úplná souvislá časová řada.", "Satellite missions tracking changes in Earth's gravity; not an uninterrupted time series.")}</dd>
          <dt>Mascon</dt><dd>${text("Hmotnostní blok použitý producentem k odhadu prostorových změn gravitace.", "A mass-concentration block used by the producer to estimate spatial gravity changes.")}</dd>
          <dt>GIA</dt><dd>${text("Glaciální izostatické vyrovnávání: dlouhodobá odezva pevné Země na dřívější zalednění.", "Glacial isostatic adjustment: the solid Earth's long-term response to past ice loading.")}</dd>
          <dt>${text("Hmotnostní bilance", "Mass balance")}</dt><dd>${text("Rozdíl mezi přírůstkem a úbytkem hmotnosti, nikoli velikost zaledněné plochy.", "The balance between mass gains and losses, not ice-covered area.")}</dd>
        </dl></section>
      <section class="panel"><h2>${text("Souvislost s hladinou moře", "Connection to sea level")}</h2>
        <p>${text("Úbytek pevninského ledu může přidávat vodu do oceánu. Není však jedinou příčinou růstu hladiny: patří sem i tepelná roztažnost oceánu a další zásoby vody. Příspěvek v Gt zde nepřevádíme na místní ani globální milimetry a nespojujeme jej s odlišně referencovanou řadou hladiny.",
          "Land-ice loss can add water to the ocean. It is not the only driver of sea-level rise: ocean thermal expansion and other water stores also contribute. We do not convert Gt into local or global millimetres or splice this into a differently referenced sea-level record.")}</p>
        <div class="hero-actions"><a class="button-link" href="${route("ocean/gmsl")}">${text("Pozorovaná hladina moře", "Observed sea level")}</a>
          <a class="button-link" href="${route("ocean-future")}">${text("Scénáře hladiny moře", "Sea-level scenarios")}</a>
          <a class="button-link" href="${route("sea-ice")}">${text("Odlišný ukazatel: mořský led", "Different indicator: sea ice")}</a></div>
      </section>
      <section class="panel"><h2>${text("Zdroj, citace a omezení produktu", "Source, citation and product limits")}</h2>
        <p>NASA Earth Indicator: Ice Sheets. ${text("Veřejná grafová data Grónska a Antarktidy, aktualizace 2026-10-23, přístup 2026-11-06; původní hodnoty, časové štítky a meze zachovány. Změna projektu: filtrace období a rozdělení grafických spojnic.",
          "Public Greenland and Antarctica chart data, updated 2026-10-23, accessed 2026-11-06; original values, time labels and bounds retained. Project changes: period filtering and splitting of graphical connecting lines.")}</p>
        <p><a href="https://science.nasa.gov/earth/explore/earth-indicators/ice-sheets/">NASA · Ice Sheets</a> ·
          ${bundle.regions.map(region => `<a href="${region.source.url}">${escape(region.name[language])} · JSON</a>`).join(" · ")} ·
          <a href="${baseUrl}${iceSheetApiBase}bundle.json">${text("Ověřený JSON s původem a SHA-256", "Verified JSON with provenance and SHA-256")}</a></p>
        <p>D. N. Wiese, D.-N. Yuan, C. Boening, F. W. Landerer, M. M. Watkins (2024). Tellus Level-4 Greenland / Antarctica Mass Anomaly Time Series from JPL GRACE/GRACE-FO Mascon CRI Filtered Release 06.3 version 04. PO.DAAC.
          <a href="https://doi.org/10.5067/TEMSC-GT634">Greenland DOI</a> · <a href="https://doi.org/10.5067/TEMSC-AT634">Antarctica DOI</a>.
          ${text("Kontext podkladového produktu, nikoli tvrzení, že jsme stáhli vědecké granule: jejich poslední rozsah může být novější než veřejný graf.",
            "Underlying-product context, not a claim that scientific granules were downloaded: their latest coverage may be newer than the public chart.")}</p>
        <p>Watkins et al. (2015), <a href="https://doi.org/10.1002/2014JB011547">doi:10.1002/2014JB011547</a>.
          Wiese et al. (2016), <a href="https://doi.org/10.1002/2016WR019344">doi:10.1002/2016WR019344</a>.</p>
        <p><a href="https://www.nasa.gov/nasa-brand-center/images-and-media/">${text("Pravidla NASA", "NASA use guidelines")}</a> ·
          <a href="https://podaac.jpl.nasa.gov/CitingPODAAC">${text("Použití a citace PO.DAAC", "PO.DAAC use and citation")}</a></p>
        <p>${text("NASA ani JPL projekt nezaštiťují. Použitá veřejná data a podmínky jsou archivovány. Přístup k původním granúlám přes Earthdata jsme neobcházeli. Zveřejnění celého atlasu a vědecká interpretace přesahující grafový produkt vyžadují samostatnou kontrolu.",
          "NASA and JPL do not endorse this project. The public data and use guidance are archived. Earthdata access controls for original granules were not bypassed. Publication of the full atlas and scientific interpretation beyond the chart product require separate review.")}</p>
      </section>`;
    const form = content.querySelector("#land-selection");
    let rows = [];
    let page = 0;
    let region;
    const status = point => point.reason ? text("Mezera mezi misemi", "Between-mission gap") : point.mission;
    function table() {
      const host = content.querySelector("#land-table");
      host.innerHTML = `<div class="table-wrap" tabindex="0" role="region" aria-label="${text("Tabulka změn hmotnosti", "Mass change table")}">
        <table><caption>${escape(region.name[language])} · ${text("hodnoty a meze veřejného grafu NASA, Gt", "public NASA chart values and bounds, Gt")}</caption>
        <thead><tr>${[text("Datum zdroje", "Source date"), text("Desetinný rok", "Decimal year"), text("Změna (Gt)", "Change (Gt)"),
          text("Dolní mez (Gt)", "Lower bound (Gt)"), text("Horní mez (Gt)", "Upper bound (Gt)"), text("Mise / stav", "Mission / status"), "NASA ID"]
          .map(label => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${rows.slice(page * 20, (page + 1) * 20).map(point =>
          `<tr><th scope="row">${point.date}</th><td>${point.source_time}</td><td>${number(point.value)}</td><td>${number(point.lower)}</td><td>${number(point.upper)}</td>
          <td>${status(point)}</td><td>${point.source_id}</td></tr>`).join("")}</tbody></table></div>
        <p role="status">${text("Strana", "Page")} ${page + 1} / ${Math.max(1, Math.ceil(rows.length / 20))} · ${rows.length} ${text("zdrojových záznamů", "source records")}</p>
        <div class="chart-toolbar"><button type="button" id="land-prev"${page === 0 ? " disabled" : ""}>${text("Předchozí", "Previous")}</button>
        <button type="button" id="land-next"${(page + 1) * 20 >= rows.length ? " disabled" : ""}>${text("Další", "Next")}</button></div>`;
      for (const [id, delta] of [["land-prev", -1], ["land-next", 1]]) {
        host.querySelector(`#${id}`).onclick = () => { page += delta; table(); host.querySelector(`#${id}`).focus(); };
      }
    }

    function draw(event) {
      event?.preventDefault();
      const first = form.querySelector("#land-first").value;
      const last = form.querySelector("#land-last").value;
      const error = form.querySelector("#land-selection-error");
      error.hidden = first <= last;
      error.textContent = first > last ? text("Začátek nesmí být po konci. Předchozí platný graf zůstává zobrazen.",
        "The start must not follow the end. The previous valid chart remains displayed.") : "";
      if (first > last) return;
      disposeChart();
      region = bundle.regions.find(region => region.id === form.querySelector("#land-region").value);
      rows = selectIceSheetPeriod(region, first, last);
      const valid = rows.filter(point => point.value !== null);
      const bounds = form.querySelector("#land-bounds").checked;
      const description = `${region.name[language]} · ${first} — ${last} · ${valid.length} ${text("platných hodnot", "valid values")} · Gt`;
      const gaps = iceSheetGaps(rows);
      page = 0;
      content.querySelector("#land-result").innerHTML = `<h2>${text("Změna hmotnosti ledového štítu", "Ice-sheet mass change")}</h2>
        <p id="land-description" role="status">${escape(description)}.</p>
        <p>${text("Nula převzata z grafu NASA, první bod 2002-04-16 = 0 Gt; výběr ji nemění.",
          "Zero retained from the NASA chart, first point 2002-04-16 = 0 Gt; selection does not change it.")}</p>
        <p id="land-bounds-description">${bounds ? boundsName : text("Meze v grafu vypnuté; v tabulce zůstávají.", "Chart bounds hidden; retained in the table.")}
        · ${text("Hladina spolehlivosti v grafovém JSON neurčena.", "Confidence level not stated in chart JSON.")}</p>
        ${valid.length ? `<p>${text("Poslední platný bod výběru", "Last valid point in selection")}: ${valid.at(-1).date} · <strong>${number(valid.at(-1).value)} Gt</strong>.
          ${text("Jde stále o změnu vůči zdrojové nule, ne o rozdíl od začátku výběru.", "Still relative to the source zero, not a difference from the selection start.")}</p>`
          : `<p role="status">${text("Ve výběru není platná hodnota. Mezera není nulový úbytek.", "No valid value in this selection. A gap is not zero loss.")}</p>`}
        <div id="land-chart" class="chart ice-chart"></div>
        ${chartExplanation("land-ice-mass", language, [
          "Graf zobrazuje publikovanou změnu hmotnosti vybraného ledového štítu v nepravidelných epochách GRACE/GRACE-FO. Nula je zdrojová hodnota prvního bodu, nikoli referenční období; pásmo a úsečky zachovávají zveřejněné meze bez určené hladiny spolehlivosti.",
          "The chart shows the published mass change of the selected ice sheet at irregular GRACE/GRACE-FO epochs. Zero is the source value of the first point, not a reference period; the band and bars preserve published bounds whose confidence level is unspecified.",
        ], [
          [["Gt", "Gt"], ["Gigatuna, tedy miliarda tun; zde změna hmotnosti, nikoli celková hmotnost štítu.", "Gigatonne, or one billion tonnes; here a mass change, not the total mass of the ice sheet."]],
          [["Epochy", "Epochs"], ["Reprezentativní časové body zdrojového řešení; nejde o pravidelná denní měření.", "Representative timestamps of the source solution; not regular daily measurements."]],
          [["Zveřejněné meze", "Published bounds"], ["Dolní a horní hodnoty převzaté z grafu NASA; bez doložené hladiny je neoznačujeme jako 1σ nebo 95% interval.", "Lower and upper values retained from the NASA chart; without a documented level they are not labelled as 1σ or 95% intervals."]],
        ])}
        <p class="meta">${text("Body = publikované epochy. Spojnice/pásmo jen mezi blízkými epochami; žádné doplněné měsíční hodnoty.",
          "Points = published epochs. Lines/band only between nearby epochs; no filled monthly values.")}</p>
        <div id="land-table"></div>
        <details id="land-gaps"><summary>${text("Delší intervaly bez bodů v aktuálním výběru", "Longer intervals without points in this selection")}: ${gaps.length}</summary>
          <ul>${gaps.map(gap => `<li>${gap.before} — ${gap.after}: ${gap.reason === "between-missions"
            ? text("mezera GRACE / GRACE-FO", "GRACE / GRACE-FO gap")
            : text("zdroj neobsahuje body uvnitř intervalu", "source has no points inside this interval")}</li>`).join("")}</ul>
          <p>${text("Seznam se tvoří jen z dvojic dostupných bodů ve výběru; výběr uvnitř mezery nemá jejich krajní body. Úplná mezera mezi misemi je 2017-06-10 — 2018-06-14.",
            "The list uses pairs of available points inside the selection; a selection within a gap has no bracketing points. The full mission gap is 2017-06-10 — 2018-06-14.")}</p>
        </details>`;
      table();
      const element = content.querySelector("#land-chart");
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", description);
      chart = echarts.init(element, null, { renderer: "svg" });
      const segments = iceSheetSegments(rows);
      const series = segments.map((segment, index) => ({
        id: `mass-${index}`, name: region.name[language], type: "line", connectNulls: false, symbolSize: 4,
        data: segment.map(point => [point.source_time, point.value]), itemStyle: { color: "#8abaff" },
      }));
      if (bounds) {
        const polygons = segments.flatMap(segment => segment.slice(1).map((point, index) => [
          segment[index].source_time, segment[index].lower, segment[index].upper,
          point.source_time, point.lower, point.upper,
        ]));
        series.unshift({
          id: "uncertainty-band", name: boundsName, type: "custom", silent: true, clip: true,
          data: polygons, encode: { x: [0, 3], y: [1, 2, 4, 5] },
          renderItem: (_, api) => ({
            type: "polygon", shape: { points: [
              api.coord([api.value(0), api.value(1)]), api.coord([api.value(3), api.value(4)]),
              api.coord([api.value(3), api.value(5)]), api.coord([api.value(0), api.value(2)]),
            ] }, style: { fill: "#8abaff", opacity: 0.22 },
          }),
        });
        series.push({
          id: "uncertainty-bars", name: boundsName, type: "custom", silent: true, clip: true,
          data: valid.map(point => [point.source_time, point.lower, point.upper]), encode: { x: 0, y: [1, 2] },
          renderItem: (_, api) => {
            const lower = api.coord([api.value(0), api.value(1)]);
            const upper = api.coord([api.value(0), api.value(2)]);
            return { type: "line", shape: { x1: lower[0], y1: lower[1], x2: upper[0], y2: upper[1] },
              style: { stroke: "#8abaff", opacity: 0.55, lineWidth: 1 } };
          },
        });
      }
      const min = Number(first.slice(0, 4)) + (Number(first.slice(5)) - 1) / 12;
      const max = Number(last.slice(0, 4)) + Number(last.slice(5)) / 12;
      series.push({ id: "source-zero", type: "line", name: text("Nula zdroje", "Source zero"),
        data: [[min, 0], [max, 0]], symbol: "none", lineStyle: { type: "dashed", color: "#a7b9cc" }, silent: true });
      const lookup = new Map(valid.map(point => [point.source_time, point]));
      chart.setOption({
        animation: false, aria: { enabled: true, description }, textStyle: { color: "#a7b9cc" },
        grid: { top: 65, left: 65, right: 20, bottom: 55 },
        legend: { top: 0, type: "scroll", textStyle: { color: "#edf3fa" } },
        tooltip: { trigger: "axis", confine: true, backgroundColor: "#182637", borderColor: "#304357",
          textStyle: { color: "#edf3fa" }, formatter: params => {
          const point = params.map(row => lookup.get(row.value?.[0])).find(Boolean);
          return point ? `${escape(region.name[language])} · ${point.date}<br>${point.source_time} · ${number(point.value)} Gt<br>${boundsName}: ${number(point.lower)} — ${number(point.upper)} Gt`
            : "";
        } },
        xAxis: { type: "value", min, max, axisLabel: { formatter: value => max - min < 2
          ? new Intl.NumberFormat(cs ? "cs" : "en", { maximumFractionDigits: 2, useGrouping: false }).format(value)
          : String(Math.round(value)), hideOverlap: true, color: "#a7b9cc" },
          axisLine: { lineStyle: { color: "#304357" } }, splitLine: { show: false } },
        yAxis: { type: "value", name: "Gt", scale: true, axisLabel: { color: "#a7b9cc" },
          splitLine: { lineStyle: { color: "#27394c" } } }, series,
      });
      observer = new ResizeObserver(fit);
      observer.observe(element);
    }
    form.onsubmit = draw;
    draw();
  }

  async function load() {
    content.innerHTML = `${header}<p role="status">${text("Načítám ověřené regionální řady…", "Loading verified regional series…")}</p>`;
    try {
      const get = async name => {
        const response = await fetch(`${baseUrl}${iceSheetApiBase}${name}`, {
          signal: request.signal, cache: "no-store", headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Ice sheets ${name}: HTTP ${response.status}`);
        return response;
      };
      const catalog = await (await get("catalog.json")).json();
      if (!validateIceSheetCatalog(catalog)) throw new Error("Invalid ice sheet catalogue");
      const bytes = await (await get(catalog.product.file)).arrayBuffer();
      const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map(value => value.toString(16).padStart(2, "0")).join("");
      if (bytes.byteLength !== catalog.product.bytes || sha !== catalog.product.sha256) throw new Error("Ice sheet checksum mismatch");
      const bundle = JSON.parse(new TextDecoder().decode(bytes));
      if (!validateIceSheetBundle(bundle)) throw new Error("Invalid ice sheet scientific contract");
      if (active()) show(bundle);
    } catch (error) {
      if (error.name === "AbortError" || !active()) return;
      console.error("Weather Global Ice Sheets:", error);
      disposeChart();
      content.innerHTML = `${header}<section class="panel error" role="alert"><p>${text("Ověřená data pevninského ledu nejsou dostupná. Nebyla nahrazena odhadem ani starší kopií.",
        "Verified land ice data are unavailable. No estimate or older copy was substituted.")}</p>
        <button id="land-retry" type="button">${text("Zkusit znovu", "Retry")}</button></section>`;
      content.querySelector("#land-retry").onclick = load;
    }
  }
  load();
  return {
    dispose() {
      disposed = true; request.abort(); disposeChart();
      window.removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", fit);
    },
  };
}
