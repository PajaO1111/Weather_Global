import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import {
  carbonBudgetApiBase,
  validateCarbonBudgetBundle,
  validateCarbonBudgetCatalog,
} from "./carbon-budget.js";
import { chartExplanation } from "./chart-explanation.js";

echarts.use([LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

const views = {
  annual_budget: {
    title: ["Globální uhlíková bilance", "Global carbon budget"],
    fields: [
      ["fossil_gtc", "Fosilní emise a průmysl", "Fossil fuel and industry", "#d97706"],
      ["land_use_gtc", "Změny využití půdy", "Land-use change", "#a855f7"],
      ["atmospheric_growth_gtc", "Růst CO₂ v atmosféře", "Atmospheric CO₂ growth", "#dc2626"],
      ["ocean_sink_gtc", "Oceánský propad", "Ocean sink", "#0284c7"],
      ["terrestrial_sink_gtc", "Pevninský propad", "Terrestrial sink", "#16a34a"],
      ["cement_carbonation_gtc", "Karbonatace cementu", "Cement carbonation", "#64748b"],
      ["imbalance_gtc", "Nerovnováha rozpočtu", "Budget imbalance", "#e11d48"],
    ],
    columns: [
      ["fossil_gtc", "Fosilní emise", "Fossil emissions"],
      ["land_use_gtc", "Změny využití půdy", "Land-use change"],
      ["atmospheric_growth_gtc", "Růst atmosférického CO₂", "Atmospheric CO₂ growth"],
      ["ocean_sink_gtc", "Oceánský propad", "Ocean sink"],
      ["terrestrial_sink_gtc", "Pevninský propad", "Terrestrial sink"],
      ["cement_carbonation_gtc", "Karbonatace cementu", "Cement carbonation"],
      ["imbalance_gtc", "Nerovnováha", "Imbalance"],
    ],
    data: bundle => bundle.views.annual_budget,
    education: {
      description: [
        "Roční globální uhlíková bilance od roku 1959. Jednotlivé křivky jsou odlišné zdrojové složky v GtC/rok; propady zachovávají znaménko publikované GCB a nerovnováha ukazuje neuzavření bilance.",
        "Annual global carbon budget from 1959. Each curve is a distinct source component in GtC/yr; sinks retain the GCB sign convention and the imbalance shows the budget's lack of closure.",
      ],
      glossary: [
        [["Emise", "Emissions"], ["Tok uhlíku do atmosféry z fosilních paliv, průmyslu a změn využití půdy.", "Carbon flux to the atmosphere from fossil fuels, industry and land-use change."]],
        [["Propad", "Sink"], ["Přenos uhlíku z atmosféry do oceánu nebo pevninských úložišť; znaménko odpovídá zdrojové konvenci.", "Transfer of carbon from the atmosphere to ocean or land reservoirs; the plotted sign follows the source convention."]],
        [["Nerovnováha rozpočtu", "Budget imbalance"], ["Rozdíl mezi zdroji uhlíku a součtem vykázaných změn v úložištích; není další samostatný zdroj emisí.", "Difference between carbon sources and the sum of reported reservoir changes; not another independent emissions source."]],
      ],
    },
    note: [
      "Úplná roční řada GCB 2025 v1.0 začíná rokem 1959. Propady jsou zobrazeny podle znaménkové konvence zdroje, nikoli odečteny z grafu. Položky bilance se nesčítají znovu.",
      "The complete annual GCB 2025 v1.0 series starts in 1959. Sinks follow the source sign convention and are not negated in the chart. Budget components are not summed again.",
    ],
  },
  historical_budget: {
    title: ["Dlouhodobá historie globální bilance", "Long-term global budget history"],
    fields: [
      ["fossil_gtc", "Fosilní emise a průmysl", "Fossil fuel and industry", "#d97706"],
      ["land_use_gtc", "Změny využití půdy", "Land-use change", "#a855f7"],
      ["atmospheric_growth_gtc", "Růst CO₂ v atmosféře", "Atmospheric CO₂ growth", "#dc2626"],
      ["ocean_sink_gtc", "Oceánský propad", "Ocean sink", "#0284c7"],
      ["terrestrial_sink_gtc", "Pevninský propad", "Terrestrial sink", "#16a34a"],
      ["cement_carbonation_gtc", "Karbonatace cementu", "Cement carbonation", "#64748b"],
      ["imbalance_gtc", "Nerovnováha rozpočtu", "Budget imbalance", "#e11d48"],
    ],
    columns: [
      ["fossil_gtc", "Fosilní emise", "Fossil emissions"],
      ["land_use_gtc", "Změny využití půdy", "Land-use change"],
      ["atmospheric_growth_gtc", "Růst atmosférického CO₂", "Atmospheric CO₂ growth"],
      ["ocean_sink_gtc", "Oceánský propad", "Ocean sink"],
      ["terrestrial_sink_gtc", "Pevninský propad", "Terrestrial sink"],
      ["cement_carbonation_gtc", "Karbonatace cementu", "Cement carbonation"],
      ["imbalance_gtc", "Nerovnováha", "Imbalance"],
    ],
    data: bundle => bundle.views.historical_budget,
    markYear: 1959,
    education: {
      description: [
        "Historické roční řady uhlíkového rozpočtu od roku 1750. Dostupnost složek a metody se v čase liší; hranice roku 1959 označuje začátek hlavní souvislé bilance GCB.",
        "Historical annual carbon-budget series from 1750. Component availability and methods vary over time; the 1959 marker denotes the start of the main continuous GCB budget.",
      ],
      glossary: [
        [["Historická řada", "Historical series"], ["Starší zdrojový odhad s jiným pokrytím a metodikou než hlavní řada od roku 1959.", "An earlier source estimate with different coverage and methods from the main series beginning in 1959."]],
        [["Chybějící hodnota", "Missing value"], ["Složka, kterou zdroj pro daný rok neuvádí; prázdné místo se nenahrazuje nulou.", "A component not reported by the source for that year; a gap is not replaced with zero."]],
        [["GtC/rok", "GtC/yr"], ["Miliardy tun uhlíku za rok; nejde o hmotnost CO₂.", "Billion tonnes of carbon per year; not the mass of CO₂."]],
      ],
    },
    note: [
      "Zdrojová historická tabulka začíná rokem 1750, ale jednotlivé složky mají různý počátek a obsahují mezery. Před rokem 1959 se používají odlišné metody než v hlavní bilanci. Zlom je vyznačen; mezery zůstávají prázdné, nejsou dopočteny ani nahrazeny nulou.",
      "The source historical table starts in 1750, but components have different start years and contain gaps. Methods before 1959 differ from the main budget. The boundary is marked; gaps remain missing, not interpolated or replaced with zero.",
    ],
  },
  fossil_categories: {
    title: ["Fosilní emise podle zdroje", "Fossil emissions by source"],
    fields: [
      ["coal_gtc", "Uhlí", "Coal", "#334155"],
      ["oil_gtc", "Ropa", "Oil", "#d97706"],
      ["gas_gtc", "Plyn", "Gas", "#0284c7"],
      ["cement_gtc", "Cement", "Cement", "#64748b"],
      ["flaring_gtc", "Spalování plynu", "Flaring", "#e11d48"],
      ["other_gtc", "Ostatní", "Other", "#a855f7"],
    ],
    columns: [
      ["total_gtc", "Fosilní emise celkem", "Total fossil emissions"],
      ["coal_gtc", "Uhlí", "Coal"],
      ["oil_gtc", "Ropa", "Oil"],
      ["gas_gtc", "Plyn", "Gas"],
      ["cement_gtc", "Cement", "Cement"],
      ["flaring_gtc", "Spalování plynu", "Flaring"],
      ["other_gtc", "Ostatní", "Other"],
      ["per_capita_tc", "Na obyvatele (tC/osobu/rok)", "Per capita (tC/person/yr)"],
    ],
    data: bundle => bundle.views.fossil_categories,
    education: {
      description: [
        "Roční emise z fosilních paliv a průmyslu rozdělené podle zdrojové kategorie od roku 1850. Čáry kategorií jsou složky celku a nemají se přičítat znovu k samostatné celkové řadě v tabulce.",
        "Annual fossil-fuel and industry emissions split by source category from 1850. Category lines are components of the total and should not be added again to the separate total series in the table.",
      ],
      glossary: [
        [["Fosilní emise", "Fossil emissions"], ["Uhlík uvolněný spalováním uhlí, ropy a plynu a souvisejícími průmyslovými procesy.", "Carbon released by coal, oil and gas use and associated industrial processes."]],
        [["Spalování plynu", "Flaring"], ["Spalování nebo odvětrávání doprovodného plynu při těžbě a zpracování fosilních paliv.", "Burning or venting associated gas during fossil-fuel production and processing."]],
        [["Na obyvatele", "Per capita"], ["Zdrojová hodnota vztažená na osobu v tC/osobu/rok; používá jinou jednotku než emisní kategorie.", "Source value normalized per person in tC/person/yr; it uses a different unit from emissions categories."]],
      ],
    },
    note: [
      "Zdrojová tabulka uvádí emisní kategorie v GtC/rok a hodnotu na obyvatele v tC/osobu/rok. Graf zobrazuje pouze emisní kategorie; hodnoty na obyvatele mají jinou jednotku a jsou dostupné v tabulce.",
      "The source table gives emissions categories in GtC/yr and per-capita values in tC/person/yr. The chart shows emissions only; per-capita values use a different unit and are available in the table.",
    ],
  },
  land_use: {
    title: ["Změny využití půdy", "Land-use change"],
    fields: [
      ["gcb_gtc", "Historický odhad GCB", "GCB historical estimate", "#111827"],
      ["blue_gtc", "BLUE", "BLUE", "#d97706"],
      ["oscar_gtc", "OSCAR", "OSCAR", "#0284c7"],
      ["luce_gtc", "LUCE", "LUCE", "#16a34a"],
    ],
    columns: [
      ["gcb_gtc", "Historický odhad GCB", "GCB historical estimate"],
      ["blue_gtc", "BLUE", "BLUE"],
      ["oscar_gtc", "OSCAR", "OSCAR"],
      ["luce_gtc", "LUCE", "LUCE"],
    ],
    data: bundle => bundle.views.land_use,
    markYear: 1959,
    education: {
      description: [
        "Roční emise ze změn využití půdy podle historického odhadu GCB a tří oddělených modelů od roku 1850. Modelové řady jsou alternativní odhady, nikoli složky určené k součtu.",
        "Annual land-use-change emissions from the GCB historical estimate and three separate models since 1850. Model series are alternative estimates, not components to be summed.",
      ],
      glossary: [
        [["Změna využití půdy", "Land-use change"], ["Emise a pohlcování uhlíku spojené se změnami krajiny a obhospodařováním půdy.", "Carbon emissions and uptake associated with land conversion and management." ]],
        [["BLUE / OSCAR / LUCE", "BLUE / OSCAR / LUCE"], ["Samostatné modelové odhady; jejich rozdíly vyjadřují odlišné modelové výsledky, ne pozorovací interval spolehlivosti.", "Separate model estimates; their differences show distinct model results, not an observational confidence interval."]],
        [["GtC/rok", "GtC/yr"], ["Miliardy tun uhlíku za rok; modelové řady nepřevádíme na emise CO₂.", "Billion tonnes of carbon per year; model series are not converted to CO₂ emissions."]],
      ],
    },
    note: [
      "Černá řada zachovává odhad z historického rozpočtu od roku 1850. BLUE, OSCAR a LUCE jsou samostatné modelové výsledky dostupné v tomto sešitu od roku 1959; nejsou to nezávislé emise určené k součtu. Před rokem 1959 se metodika zdroje liší.",
      "The black series preserves the historical-budget estimate from 1850. BLUE, OSCAR and LUCE are separate model results available in this workbook from 1959; they are not independent emissions to be summed. Source methods differ before 1959.",
    ],
  },
  component_estimates: {
    title: ["Srovnání globálních komponent", "Global component estimates"],
  },
  national_fossil: {
    title: ["Fosilní emise podle zemí", "Fossil emissions by country"],
  },
  national_land_use: {
    title: ["Změny využití půdy podle zemí", "Land-use change by country"],
  },
};

const escape = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

export function mountCarbonBudget({ content, language, baseUrl, isActive }) {
  const cs = language === "cs";
  const text = pair => pair[cs ? 0 : 1];
  const api = `${baseUrl}${carbonBudgetApiBase}`;
  const request = new AbortController();
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 3 });
  let chart;
  let observer;
  let disposed = false;
  const active = () => !disposed && isActive();
  const title = cs ? "Emise a uhlíkový cyklus" : "Emissions and the carbon cycle";
  const heading = `<header class="page-heading"><p class="eyebrow">GCB 2025 · 7D.6</p>
    <h1>${title}</h1><p>${cs
    ? "Globální uhlíkové řady s oddělenými obdobími, jednotkami a metodikou."
    : "Global carbon series with distinct periods, units and methods."}</p></header>`;
  const releaseNotice = cs
    ? "Ověřený datový pohled. Data: Global Carbon Budget 2025 v1.0, licencováno CC BY 4.0."
    : "Verified data view. Data: Global Carbon Budget 2025 v1.0, licensed CC BY 4.0.";

  function disposeChart() {
    observer?.disconnect();
    observer = null;
    chart?.dispose();
    chart = null;
  }

  function option(value, selected, label) {
    return `<option value="${escape(value)}"${value === selected ? " selected" : ""}>${escape(label)}</option>`;
  }

  function selectControl(id, label, options, selected) {
    return `<label for="${id}">${escape(label)}
      <select id="${id}" data-carbon-selection="${id}">${options.map(item =>
        option(item.value, selected, item.label)).join("")}</select></label>`;
  }

  const componentNames = {
    "atmospheric-growth": ["Růst CO₂ v atmosféře", "Atmospheric CO₂ growth"],
    "ocean-sink": ["Oceánský propad CO₂", "Ocean CO₂ sink"],
    "terrestrial-sink": ["Pevninský propad CO₂", "Terrestrial CO₂ sink"],
    "cement-carbonation": ["Karbonatace cementu", "Cement carbonation"],
  };

  function additionalView(bundle, viewId, selection) {
    const color = "#0284c7";
    if (viewId === "component_estimates") {
      const products = bundle.views.component_estimates;
      const component = products.components.find(item => item.id === selection.component)
        ?? products.components[0];
      const estimate = component.estimates.find(item => item.id === selection.estimate)
        ?? component.estimates.find(item => item.kind === "estimate"
          && item.label.toLowerCase() === "gcb")
        ?? component.estimates[0];
      const selectedComponentName = text(componentNames[component.id] ?? [component.label, component.label]);
      const selectedTitle = `${selectedComponentName} · ${estimate.label}`;
      const isUncertainty = estimate.kind === "uncertainty";
      return {
        title: [selectedTitle, selectedTitle],
        education: {
          description: [
            `${selectedComponentName} · ${estimate.label}: roční zdrojové odhady a dostupné modelové řady v ${component.unit} za roky ${products.first}–${products.last}. Odhady a nejistoty jsou oddělené řady.`,
            `${selectedComponentName} · ${estimate.label}: annual source estimates and available model series in ${component.unit} for ${products.first}–${products.last}. Estimates and uncertainty measures are separate series.`,
          ],
          glossary: [
            [["Zdrojový odhad", "Source estimate"], ["Veličina nebo souhrn, který zdroj vykazuje jako odhad toku dané uhlíkové komponenty.", "A quantity or summary reported by the source as an estimate of that carbon component's flux."]],
            [["Modelová řada", "Model series"], ["Výsledek konkrétního modelu; modely představují odlišné odhady a nesčítají se.", "The output of a particular model; models are distinct estimates and are not added together."]],
            [["Nejistota / rozptyl", "Uncertainty / spread"], ["Zdrojová míra variability nebo nejistoty, nikoli další tok uhlíku.", "A source measure of variability or uncertainty, not another carbon flux."]],
          ],
        },
        view: {
          first: products.first,
          last: products.last,
          unit: component.unit,
          points: estimate.values.map((value, index) => ({
            year: products.first + index,
            value,
          })),
        },
        fields: [["value", estimate.label, estimate.label, color]],
        columns: [["value", estimate.label, estimate.label]],
        controls: [
          selectControl("component", text(["Komponenta", "Component"]), products.components
            .map(item => ({
              value: item.id,
              label: text(componentNames[item.id] ?? [item.label, item.label]),
            })), component.id),
          selectControl("estimate", text(["Odhad / model", "Estimate / model"]),
            component.estimates.map(item => ({
              value: item.id,
              label: `${item.label}${item.kind === "uncertainty"
                ? text([" · směrodatná odchylka", " · standard deviation"]) : ""}`,
            })), estimate.id),
        ].join(""),
        note: isUncertainty
          ? [
            "Vybraná řada je zdrojová míra variability/nejistoty, nikoli odhad toku uhlíku. Význam nejistot se řídí popisem daného sloupce v sešitu.",
            "This is a source uncertainty/spread series, not an estimate of carbon flux. Interpret it according to the column description in the workbook.",
          ]
          : [
            "GCB, jednotlivé modely, pozorovací produkty a jejich souhrny jsou oddělené zdrojové odhady. Nejsou sčítány ani zprůměrovány. Prázdné roky zůstávají chybějící.",
            "GCB, individual models, observation products and source summaries are shown as separate estimates. They are not summed or averaged. Missing years remain blank.",
          ],
      };
    }

    if (viewId === "national_fossil") {
      const product = bundle.views.national_fossil;
      const modes = [
        ["territorial", text(["Územní emise", "Territorial emissions"])],
        ["consumption", text(["Emise podle spotřeby", "Consumption emissions"])],
        ["transfers", text(["Přenosy emisí", "Emissions transfers"])],
      ];
      const modeId = modes.some(([id]) => id === selection.mode) ? selection.mode : "territorial";
      const table = product[modeId];
      const series = table.series.find(item => item.id === selection.series)
        ?? table.series.find(item => item.id === "china")
        ?? table.series.find(item => item.id === "world");
      const note = modeId === "territorial"
        ? [
          "Územní emise jsou v MtC/rok. Jednotlivé země nezahrnují mezinárodní dopravu; světový součet ji uvádí zvlášť. Historické hranice a zpětné rozdělení států se řídí zdrojovým sešitem.",
          "Territorial emissions are in MtC/yr. Individual countries exclude international transport; the world total reports it separately. Historical borders and country splits follow the source workbook.",
        ]
        : [
          "Řada podle spotřeby nebo přenosů je dostupná jen pro roky 1990–2020. Jde o jinou účetní perspektivu než územní emise; hodnoty se mezi pohledy nesčítají.",
          "Consumption or transfer data are available only for 1990–2020. This accounting perspective differs from territorial emissions; values must not be added across views.",
        ];
      return {
        title: [`${text(views.national_fossil.title)} · ${series.label}`,
          `${text(views.national_fossil.title)} · ${series.label}`],
        education: {
          description: [
            `${series.label} · ${modeId === "territorial" ? "územní emise" : modeId === "consumption" ? "emise podle spotřeby" : "přenosy emisí"}: roční řada ${table.first}–${table.last} v ${table.unit}. Účetní pohled určuje, kde se emise evidují, nikoli jejich fyzické přičítání mezi pohledy.`,
            `${series.label} · ${modeId === "territorial" ? "territorial emissions" : modeId === "consumption" ? "consumption emissions" : "emissions transfers"}: annual series for ${table.first}–${table.last} in ${table.unit}. The accounting view determines how emissions are attributed, not an additional physical flux to add across views.`,
          ],
          glossary: [
            [["Územní emise", "Territorial emissions"], ["Emise přiřazené místu, kde vznikly.", "Emissions attributed to the place where they occur."]],
            [["Emise podle spotřeby", "Consumption emissions"], ["Emise připsané konečné spotřebě po zohlednění emisí obsažených v obchodě.", "Emissions attributed to final consumption after accounting for emissions embodied in trade."]],
            [["Přenosy emisí", "Emissions transfers"], ["Rozdíl mezi spotřebním a územním účetnictvím; nejde o další emise k součtu.", "Difference between consumption and territorial accounting; not additional emissions to sum."]],
          ],
        },
        view: {
          first: table.first,
          last: table.last,
          unit: table.unit,
          points: series.values.map((value, index) => ({ year: table.first + index, value })),
        },
        fields: [["value", series.label, series.label, color]],
        columns: [["value", series.label, series.label]],
        controls: [
          selectControl("mode", text(["Účetní pohled", "Accounting view"]), modes
            .map(([value, label]) => ({ value, label })), modeId),
          selectControl("series", text(["Země / souhrn", "Country / total"]), table.series
            .map(item => ({ value: item.id, label: item.label })), series.id),
        ].join(""),
        note,
      };
    }

    const product = bundle.views.national_land_use;
    const model = product.models.find(item => item.id === selection.model)
      ?? product.models[0];
    const series = model.series.find(item => item.id === selection.series)
      ?? model.series.find(item => item.id === "china")
      ?? model.series.find(item => item.id === "global");
    const title = `${text(views.national_land_use.title)} · ${model.label} · ${series.label}`;
    return {
      title: [title, title],
      education: {
        description: [
          `${series.label} · model ${model.label}: roční odhad emisí ze změn využití půdy ${product.first}–${product.last} v ${product.unit}. Volba modelu mění alternativní zdrojový odhad, nikoli jednotnou pozorovanou řadu.`,
          `${series.label} · ${model.label} model: annual land-use-change emissions estimate for ${product.first}–${product.last} in ${product.unit}. Selecting a model changes the alternative source estimate, not a single observed series.`,
        ],
        glossary: [
          [["Změna využití půdy", "Land-use change"], ["Emise a pohlcování uhlíku spojené se změnami krajiny a obhospodařováním půdy.", "Carbon emissions and uptake associated with land conversion and management."]],
          [["Modelový odhad", "Model estimate"], ["Výsledek konkrétního modelu BLUE, OSCAR nebo LUCE; hodnoty modelů se nesčítají.", "The output of a particular BLUE, OSCAR or LUCE model; model values are not summed."]],
          [["TgC/rok", "TgC/yr"], ["Teragramy uhlíku za rok; číselně odpovídají MtC/rok.", "Teragrams of carbon per year; numerically equivalent to MtC/yr."]],
        ],
      },
      view: {
        first: product.first,
        last: product.last,
        unit: product.unit,
        points: series.values.map((value, index) => ({
          year: product.first + index,
          value,
        })),
      },
      fields: [["value", series.label, series.label, color]],
      columns: [["value", series.label, series.label]],
      controls: [
        selectControl("model", text(["Model", "Model"]), product.models
          .map(item => ({ value: item.id, label: item.label })), model.id),
        selectControl("series", text(["Země / globální řada", "Country / global series"]),
          model.series.map(item => ({ value: item.id, label: item.label })), series.id),
      ].join(""),
      note: [
        "Modelové odhady BLUE, OSCAR a LUCE jsou alternativní řady v TgC/rok (číselně MtC/rok). Nejsou sčítány ani zaměňovány za jednu pozorovanou hodnotu. Zdrojové mezery zůstávají prázdné.",
        "BLUE, OSCAR and LUCE are alternative model series in TgC/yr (numerically equal to MtC/yr). They are not summed or treated as a single observed value. Source gaps remain blank.",
      ],
    };
  }

  function render(bundle, viewId, selection = {}) {
    disposeChart();
    const baseDefinition = views[viewId];
    const definition = baseDefinition.data
      ? {
        ...baseDefinition,
        title: text(baseDefinition.title),
        note: text(baseDefinition.note),
        view: baseDefinition.data(bundle),
        controls: "",
      }
      : additionalView(bundle, viewId, selection);
    const view = definition.view;
    const rows = view.points;
    const fields = definition.fields;
    const titleText = Array.isArray(definition.title) ? text(definition.title) : definition.title;
    const note = Array.isArray(definition.note) ? text(definition.note) : definition.note;
    const headings = definition.columns;
    content.innerHTML = `${heading}
      <p class="notice">${releaseNotice}</p>
      <section class="panel controls">
        <label for="carbon-view">${cs ? "Datový pohled" : "Data view"}
          <select id="carbon-view">${Object.entries(views).map(([id, item]) =>
            `<option value="${id}"${id === viewId ? " selected" : ""}>${escape(text(item.title))}</option>`).join("")}</select>
        </label>
        ${definition.controls}
        <span class="meta">${cs ? "Období" : "Period"}: ${view.first}–${view.last} · ${rows.length} ${cs ? "roků" : "years"} · ${view.unit}</span>
      </section>
      <section class="panel chart-panel"><h2>${escape(titleText)}</h2>
        <div id="carbon-budget-chart" class="chart" role="img" aria-label="${escape(`${titleText} · ${view.first}–${view.last} · ${view.unit}`)}"></div>
        <p class="muted">${escape(note)}</p>
      </section>
      ${chartExplanation(`carbon-${viewId}`, language, definition.education.description,
        definition.education.glossary, {
          label: "Friedlingstein et al. (2025) · Global Carbon Budget 2025",
          url: "https://doi.org/10.5194/essd-18-3211-2026",
        })}
      <section class="panel"><h2>${cs ? "Tabulka ročních dat" : "Annual data table"}</h2>
        <div class="table-wrap" tabindex="0" role="region" aria-label="${escape(`${titleText} · ${cs ? "roční data" : "annual data"}`)}">
          <table><caption>${escape(`${titleText} · ${view.first}–${view.last} · ${view.unit}`)}</caption>
            <thead><tr><th scope="col">${cs ? "Rok" : "Year"}</th>${headings.map(([, czech, english]) =>
              `<th scope="col">${escape(cs ? czech : english)}</th>`).join("")}</tr></thead>
            <tbody>${rows.map(row => `<tr><th scope="row">${row.year}</th>${headings.map(([key]) =>
              `<td>${row[key] === null ? "—" : number.format(row[key])}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
      </section>
      <section class="panel explain"><h2>${cs ? "Zdroj a metodika" : "Source and method"}</h2>
        <p>${escape(note)}</p>
        <p>${cs ? "Zobrazené hodnoty nejsou průměrem dostupných složek. GtC znamená miliardu tun uhlíku; převod na CO₂ je možný násobkem 3,664, ale grafy záměrně zachovávají jednotky zdrojových tabulek."
          : "Displayed values are not an average of available components. GtC is a billion tonnes of carbon; conversion to CO₂ uses a factor of 3.664, but charts preserve the source-table units."}</p>
        <p>${cs ? "Citace" : "Citation"}: ${escape(bundle.source.citation)} ·
          <a href="https://doi.org/${encodeURIComponent(bundle.source.doi)}">${escape(bundle.source.doi)}</a> ·
          <a href="${escape(bundle.source.license_url)}">${escape(bundle.source.license)}</a></p>
        <p><a href="${api}bundle.json" download="weather-global-gcb-2025-v1.0.json">${cs ? "Stáhnout úplný ověřený datový balíček JSON" : "Download the complete verified JSON data bundle"}</a></p>
      </section>`;

    content.querySelector("#carbon-view").addEventListener("change", event => {
      if (active()) render(bundle, event.currentTarget.value, {});
    });
    for (const select of content.querySelectorAll("[data-carbon-selection]")) {
      select.addEventListener("change", event => {
        if (!active()) return;
        const nextSelection = {
          ...selection,
          [event.currentTarget.dataset.carbonSelection]: event.currentTarget.value,
        };
        render(bundle, viewId, nextSelection);
      });
    }
    const element = content.querySelector("#carbon-budget-chart");
    const dates = rows.map(row => row.year);
    chart = echarts.init(element, null, { renderer: "svg" });
    const series = fields.map(([key, czech, english, color], index) => ({
      name: cs ? czech : english,
      type: "line",
      showSymbol: false,
      connectNulls: false,
      data: rows.map(row => [row.year, row[key]]),
      lineStyle: { width: 2 },
      itemStyle: { color },
      ...(index === 0 && definition.markYear ? {
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: "#f8fafc", type: "dashed", opacity: 0.8 },
          label: { formatter: String(definition.markYear), color: "#f8fafc" },
          data: [{ xAxis: definition.markYear }],
        },
      } : {}),
    }));
    chart.setOption({
      animation: false,
      aria: { enabled: true, description: `${titleText} · ${view.first}–${view.last} · ${view.unit}` },
      color: fields.map(field => field[3]),
      grid: { top: 72, left: 80, right: 28, bottom: 52 },
      tooltip: {
        trigger: "axis",
        confine: true,
        valueFormatter: value => value === null ? "—" : `${number.format(value)} ${view.unit}`,
      },
      legend: { top: 0, type: "scroll" },
      xAxis: { type: "value", min: dates[0], max: dates.at(-1), minInterval: 1, name: cs ? "Rok" : "Year" },
      yAxis: { type: "value", name: view.unit, scale: true },
      series,
    });
    observer = new ResizeObserver(() => {
      if (chart && element.isConnected) chart.resize({ animation: { duration: 0 } });
    });
    observer.observe(element);
  }

  async function load() {
    if (!active()) return;
    disposeChart();
    content.innerHTML = `${heading}<p role="status">${cs ? "Načítám ověřené globální řady GCB…" : "Loading verified global GCB series…"}</p>`;
    try {
      const catalogResponse = await fetch(`${api}catalog.json`, {
        signal: request.signal,
        headers: { Accept: "application/json" },
      });
      if (!catalogResponse.ok) throw new Error(`Catalogue HTTP ${catalogResponse.status}`);
      const catalog = await catalogResponse.json();
      if (!validateCarbonBudgetCatalog(catalog)) throw new Error("Invalid carbon-budget catalogue");
      const response = await fetch(`${api}bundle.json`, {
        signal: request.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Data HTTP ${response.status}`);
      const bundle = await response.json();
      if (!validateCarbonBudgetBundle(bundle) || bundle.version !== catalog.product.version) {
        throw new Error("Invalid carbon-budget response");
      }
      if (active()) render(bundle, "annual_budget");
    } catch (error) {
      if (error.name === "AbortError" || !active()) return;
      console.error("Weather Global carbon budget API:", error);
      content.innerHTML = `${heading}<section class="panel error">
        <p role="alert">${cs ? "Ověřená data GCB nejsou dostupná. Zkuste načtení opakovat." : "Verified GCB data are unavailable. Try loading again."}</p>
        <button id="carbon-retry" type="button">${cs ? "Zkusit znovu" : "Retry"}</button></section>`;
      content.querySelector("#carbon-retry").addEventListener("click", load, { once: true });
    }
  }

  void load();
  return {
    dispose() {
      disposed = true;
      request.abort();
      disposeChart();
    },
  };
}
