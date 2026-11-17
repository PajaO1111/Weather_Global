import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import {
  atmosphericGasesApiBase,
  validateAtmosphericGasesBundle,
  validateAtmosphericGasesCatalog,
} from "./atmospheric-gases.js";
import { chartExplanation } from "./chart-explanation.js";

echarts.use([LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

export function mountAtmosphericGases({ content, language, baseUrl, isActive }) {
  const cs = language === "cs";
  const text = (czech, english) => cs ? czech : english;
  const api = `${baseUrl}${atmosphericGasesApiBase}`;
  const request = new AbortController();
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const monthFormat = new Intl.DateTimeFormat(language, { year: "numeric", month: "short", timeZone: "UTC" });
  let charts = [];
  let observer;
  let disposed = false;
  const active = () => !disposed && isActive();
  const title = text("Globální koncentrace CH₄ a N₂O", "Global CH₄ and N₂O concentrations");
  const unit = "ppb";
  const header = `<header class="page-heading"><p class="eyebrow">NOAA GML · CH₄ / N₂O · 7D.7</p>
    <h1>${title}</h1>
    <p>${text("Měsíční globální průměry a vyhlazené trendy molekulárních podílů v suchém vzduchu.",
      "Monthly global means and smoothed trends of dry-air mole fractions.")}</p></header>`;
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

  function chartFor(id, points, description) {
    const element = content.querySelector(`#${id}`);
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", description);
    const chart = echarts.init(element, null, { renderer: "svg" });
    charts.push(chart);
    const dates = points.map(point => Date.UTC(
      Number(point.date.slice(0, 4)),
      Number(point.date.slice(5, 7)) - 1,
      15,
    ));
    chart.setOption({
      animation: false,
      aria: { enabled: true, description },
      color: ["#075985", "#b45309"],
      grid: { top: 55, left: 65, right: 24, bottom: 60 },
      tooltip: {
        trigger: "axis",
        confine: true,
        valueFormatter: value => value === null ? "—" : `${number.format(value)} ${unit}`,
        axisPointer: { type: "line" },
      },
      legend: { top: 0 },
      xAxis: {
        type: "time",
        axisLabel: {
          hideOverlap: true,
          formatter: value => monthFormat.format(new Date(value)),
        },
      },
      yAxis: { type: "value", name: unit, scale: true },
      series: [
        {
          name: text("Měsíční průměr", "Monthly mean"),
          type: "line",
          showSymbol: false,
          connectNulls: false,
          data: points.map((point, index) => [dates[index], point.average]),
        },
        {
          name: text("Trend producenta", "Producer trend"),
          type: "line",
          showSymbol: false,
          connectNulls: false,
          lineStyle: { type: "dashed" },
          data: points.map((point, index) => [dates[index], point.trend]),
        },
      ],
    });
    observer.observe(element);
  }

  function show(bundle) {
    disposeCharts();
    observer = new ResizeObserver(fit);
    const rows = bundle.gases.map(gas => {
      const isCh4 = gas.id === "ch4";
      const gasTitle = isCh4 ? "Metan (CH₄)" : "Oxid dusný (N₂O)";
      const englishTitle = isCh4 ? "Methane (CH₄)" : "Nitrous oxide (N₂O)";
      const description = text(
        `${gasTitle} · globální měsíční průměr a vyhlazený trend · ${gas.first} až ${gas.last} · ppb`,
        `${englishTitle} · global monthly mean and smoothed trend · ${gas.first} to ${gas.last} · ppb`,
      );
      const education = chartExplanation(`gas-${gas.id}`, language, [
        `Graf zachycuje globální měsíční průměr koncentrace ${isCh4 ? "CH₄" : "N₂O"} a samostatnou vyhlazenou trendovou řadu NOAA od ${gas.first} do ${gas.last}. Osa x je čas, osa y molekulový podíl v suchém vzduchu.`,
        `The chart shows the global monthly mean concentration of ${isCh4 ? "CH₄" : "N₂O"} and NOAA's separate smoothed trend from ${gas.first} through ${gas.last}. The x-axis is time; the y-axis is dry-air mole fraction.`,
      ], [
        [["ppb", "ppb"], ["Nanomol/mol v suchém vzduchu; jde o koncentraci, ne emise.", "Nanomol/mol in dry air; this is concentration, not emissions."]],
        [["Měsíční průměr", "Monthly mean"], ["Zdrojová hodnota za měsíc; nenahrazuje vyhlazenou trendovou řadu.", "The source value for a month; distinct from the smoothed trend series."]],
        [["Vyhlazený trend", "Smoothed trend"], ["Trendová řada producenta, nikoli druhé nezávislé měření.", "The producer's trend series, not a second independent measurement."]],
      ]);
      const latest = gas.points.slice(-12);
      return `<section class="panel chart-panel"><h2>${text(gasTitle, englishTitle)}</h2>
        <p>${text("Období", "Period")}: ${gas.first} — ${gas.last} · ${gas.points.length} ${text("měsíců", "months")} · ${unit}.</p>
        <div id="gas-${gas.id}-chart" class="chart ice-chart"></div>
        ${education}
        <div class="table-wrap" tabindex="0" role="region" aria-label="${text("Posledních 12 měsíců", "Latest 12 months")} · ${gasTitle}">
          <table><caption>${escape(description)} · ${text("posledních 12 měsíců", "latest 12 months")}</caption>
            <thead><tr><th scope="col">${text("Měsíc", "Month")}</th>
              <th scope="col">${text("Průměr", "Mean")} (${unit})</th>
              <th scope="col">${text("Nejistota průměru", "Mean uncertainty")} (${unit})</th>
              <th scope="col">${text("Trend", "Trend")} (${unit})</th>
              <th scope="col">${text("Nejistota trendu", "Trend uncertainty")} (${unit})</th></tr></thead>
            <tbody>${latest.map(point => `<tr><th scope="row">${point.date}</th>
              <td>${number.format(point.average)}</td>
              <td>${point.average_uncertainty === null ? "—" : number.format(point.average_uncertainty)}</td>
              <td>${number.format(point.trend)}</td>
              <td>${point.trend_uncertainty === null ? "—" : number.format(point.trend_uncertainty)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </section>`;
    }).join("");
    content.innerHTML = `${header}
      <p class="notice">${text("Ověřený datový pohled. Jde o koncentrace v ppb, ne o emise, emise na obyvatele ani klimatickou příčinu samy o sobě. Poslední hodnoty mohou být předběžné a později revidované.",
        "Verified data view. These are concentrations in ppb, not emissions, per-capita emissions or a climate cause on their own. Recent values may be preliminary and later revised.")}</p>
      ${rows}
      <section class="panel"><h2>${text("Metoda, zdroje a omezení", "Method, sources and limitations")}</h2>
        <p>${text("Měsíční průměr a vyhlazený trend jsou oddělené řady převzaté od NOAA GML; trend není druhá nezávislá observace. Jednotka ppb je nanomol/mol v suchém vzduchu. CH₄ pokrývá 1983-07 až 2026-06; N₂O 2001-01 až 2026-06.",
          "Monthly mean and smoothed trend are separate NOAA GML series; the trend is not a second independent observation. The ppb unit is nanomol/mol in dry air. CH₄ covers 1983-07 through 2026-06; N₂O covers 2001-01 through 2026-06.")}</p>
        <p>${text("Pět nejnovějších hodnot nejistoty u každé řady nebylo vypočteno. Zachováváme je jako chybějící, nikoli nulu; NOAA uvádí nejistotu jako kombinaci síťového bootstrapu a analytické složky. Nedopočítáváme emise z koncentrací ani koncentrace z emisí.",
          "The five latest uncertainty values in each series have not been calculated. They remain missing, not zero; NOAA describes uncertainty as a combination of network bootstrap and analytical components. We do not infer emissions from concentrations or concentrations from emissions.")}</p>
        <p>${text("Zdrojová data byla zachována s kontrolními součty; poslední zveřejněné hodnoty se mohou měnit při kalibraci a kontrole kvality. Souvislost s emisemi, teplotou, ledem či oceánem je kontext, nikoli odhad příčinného účinku z těchto grafů.",
          "Source files are retained with checksums; latest published values can change through recalibration and quality control. Links to emissions, temperature, ice or ocean are context, not a causal-effect estimate from these charts.")}</p>
          <p><a href="${api}bundle.json" download="weather-global-noaa-gases-2026-11-06.json">${text("Stáhnout úplný ověřený balíček JSON", "Download the complete verified JSON bundle")}</a></p>
          <p>${text("Citace", "Citation")}: ${escape(bundle.source.citation)}</p>
        <p><a href="https://gml.noaa.gov/ccgg/trends_ch4/">NOAA GML · CH₄</a> ·
          <a href="https://gml.noaa.gov/ccgg/trends_n2o/">NOAA GML · N₂O</a></p>
      </section>`;
    for (const gas of bundle.gases) {
      const gasTitle = gas.id === "ch4" ? text("Metan (CH₄)", "Methane (CH₄)") : text("Oxid dusný (N₂O)", "Nitrous oxide (N₂O)");
      chartFor(`gas-${gas.id}-chart`, gas.points, `${gasTitle} · ${gas.first}–${gas.last} · ${unit}`);
    }
  }

  async function load() {
    if (!active()) return;
    disposeCharts();
    content.innerHTML = `${header}<p role="status">${text("Načítám ověřené řady NOAA…", "Loading verified NOAA series…")}</p>`;
    try {
      const catalogResponse = await fetch(`${api}catalog.json`, { signal: request.signal, headers: { Accept: "application/json" } });
      if (!catalogResponse.ok) throw new Error(`Catalogue HTTP ${catalogResponse.status}`);
      const catalog = await catalogResponse.json();
      if (!validateAtmosphericGasesCatalog(catalog)) throw new Error("Invalid atmospheric gases catalogue");
      const response = await fetch(`${api}bundle.json`, { signal: request.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Data HTTP ${response.status}`);
      const bundle = await response.json();
      if (!validateAtmosphericGasesBundle(bundle) || bundle.version !== catalog.product.version) {
        throw new Error("Invalid atmospheric gases response");
      }
      if (active()) show(bundle);
    } catch (error) {
      if (error.name === "AbortError" || !active()) return;
      console.error("Weather Global atmospheric gases API:", error);
      content.innerHTML = `${header}<section class="panel error">
        <p role="alert">${text("Ověřená data CH₄/N₂O nejsou dostupná. Zkuste načtení opakovat.",
          "Verified CH₄/N₂O data are unavailable. Try loading again.")}</p>
        <button id="gas-retry" type="button">${text("Zkusit znovu", "Retry")}</button></section>`;
      content.querySelector("#gas-retry").addEventListener("click", load, { once: true });
    }
  }

  void load();
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
