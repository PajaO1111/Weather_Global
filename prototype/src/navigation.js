export function navigationSections(language, localPreviews = false) {
  const cs = language === "cs";
  const item = (route, czech, english) => ({ route, label: cs ? czech : english });
  return [
    { ...item("overview", "Přehled", "Overview"), links: [] },
    {
      ...item("history", "Globální klima", "Global climate"),
      links: [
        item("history", "Historické ukazatele", "Historical indicators"),
        item("compare", "Srovnání ukazatelů", "Compare indicators"),
        item("projections", "Budoucí scénáře", "Future scenarios"),
        item("snow-cover", "Sněhová pokrývka", "Snow cover"),
        item("precipitation", "Srážky a voda", "Precipitation and water"),
        item("drought", "Sucho", "Drought"),
        item("carbon-budget", "Emise a uhlíkový cyklus", "Emissions and carbon cycle"),
        item("atmospheric-gases", "Koncentrace plynů", "Gas concentrations"),
      ],
    },
    {
      ...item("continental-history", "Světadíly", "Continents"),
      links: [
        item("continental-history", "Historické mapy", "Historical maps"),
        item("continents", "Modelové scénáře", "Model scenarios"),
        ...(localPreviews ? [
          item("europe", "Regionální piloty a archiv", "Regional previews and archive"),
          item("europe-pilot", "EU27 · CDS pilot", "EU27 · CDS preview"),
          item("europe-cmip6", "Evropa · CMIP6 archiv", "Europe · CMIP6 archive"),
          item("europe-history", "Evropa · NASA archiv", "Europe · NASA archive"),
        ] : []),
      ],
    },
    {
      ...item("oceans", "Oceány", "Oceans"),
      links: [
        item("oceans", "Pozorované změny", "Observed changes"),
        item("ocean-future", "Budoucí hladina moře", "Future sea level"),
        item("sea-ice", "Mořský led", "Sea ice"),
        item("ice-sheets", "Pevninský led", "Land ice"),
      ],
    },
    { ...item("sources", "Metodika a zdroje", "Methods & sources"), links: [] },
    { ...item("about", "O projektu", "About"), links: [] },
  ];
}

export function sectionForView(sections, view) {
  const route = view.startsWith("indicator/") ? "history"
    : view.startsWith("ocean/") ? "oceans" : view;
  return sections.find((section) => section.route === route
    || section.links.some((link) => link.route === route));
}
