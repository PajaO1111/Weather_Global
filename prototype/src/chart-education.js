const terms = {
  anomaly: ["Anomálie", "Anomaly",
    "Rozdíl vůči průměru referenčního období, nikoli absolutní teplota. Různé reference nelze bez úpravy přímo porovnat.",
    "Difference from a reference-period mean, not absolute temperature. Different references cannot be compared directly without adjustment."],
  baseline: ["Referenční období", "Reference period",
    "Období určující nulový bod anomálie; není to datum začátku měření ani automaticky předindustriální klima.",
    "Period defining an anomaly's zero; neither the start of observations nor automatically pre-industrial climate."],
  ppm: ["ppm", "ppm", "Počet molekul CO₂ na milion molekul suchého vzduchu; koncentrace, nikoli množství vypuštěných emisí.",
    "CO₂ molecules per million dry-air molecules; a concentration, not the amount of emitted CO₂."],
  variability: ["Vnitřní proměnlivost", "Internal variability",
    "Kolísání klimatického systému i bez změny vnějšího působení; jednotlivé roky nemusí kopírovat dlouhodobý vývoj.",
    "Climate-system fluctuations even without changes in external forcing; individual years need not follow long-term changes."],
  gcm: ["GCM / RCM", "GCM / RCM",
    "Globální / regionální klimatický model. Regionální model využívá okrajové podmínky globálního modelu pro podrobnější simulaci oblasti.",
    "Global / regional climate model. A regional model uses global-model boundary conditions to simulate a region in more detail."],
  member: ["Realizace", "Realization",
    "Konkrétní běh modelu. Identifikátor r/i/p/f rozlišuje realizaci, inicializaci, fyziku a vnější působení; není to známka kvality.",
    "A particular model run. The r/i/p/f identifier distinguishes realization, initialization, physics and forcing; it is not a quality score."],
  spread: ["Medián a min–max modelů", "Model median and min–max",
    "Medián je prostřední hodnota seřazených výstupů, min–max jejich krajní hodnoty. Rozpětí vybraných modelů není interval spolehlivosti ani mez možného vývoje.",
    "The median is the middle of ordered outputs; min–max gives their extremes. Selected-model spread is not a confidence interval or a bound on possible outcomes."],
  rcp: ["RCP", "RCP",
    "Reprezentativní trajektorie koncentrací a radiačního působení. Číslo označuje přibližné působení v roce 2100 vůči předindustriálním podmínkám v W/m², nikoli oteplení v °C.",
    "Representative Concentration Pathway. Its number denotes approximate 2100 radiative forcing relative to pre-industrial conditions in W/m², not warming in °C."],
  ssp: ["SSP", "SSP",
    "Sdílená socioekonomická cesta. V označení SSPx-y první část popisuje společenský vývoj, druhá přibližné radiační působení roku 2100 v W/m².",
    "Shared Socioeconomic Pathway. In SSPx-y, the first part describes societal development and the second approximate 2100 radiative forcing in W/m²."],
  forcing: ["Radiační působení", "Radiative forcing",
    "Změna energetické bilance Země vyvolaná vnějším vlivem, například změnou koncentrací skleníkových plynů; jednotka W/m².",
    "Change in Earth's energy balance caused by an external influence such as altered greenhouse-gas concentrations; measured in W/m²."],
  coverage: ["Pokrytí", "Coverage",
    "Podíl vážené plochy s dostupnými platnými hodnotami. Není to hustota stanic ani pravděpodobnost správnosti analýzy.",
    "Fraction of weighted area with available valid values. Neither station density nor the probability that an analysis is correct."],
  analysis: ["Pozorovací analýza", "Observation-derived analysis",
    "Zpracovaný odhad klimatické veličiny založený na měřeních; není to soupis syrových stanic. Reanalýza navíc spojuje pozorování s numerickým modelem asimilací dat.",
    "A processed estimate based on measurements, not raw station records. Reanalysis additionally combines observations with a numerical model through data assimilation."],
  sst: ["SST", "SST", "Teplota povrchu moře, nikoli teplota vzduchu nad mořem ani teplota celého vodního sloupce.",
    "Sea-surface temperature, not air temperature over the sea or the temperature of the entire water column."],
  ohc: ["OHC / ZJ", "OHC / ZJ", "Obsah tepla oceánu / zettajoule (10²¹ J). Energie není teplota; její změnu nelze přímo vyjádřit jako stejné číslo ve °C.",
    "Ocean heat content / zettajoule (10²¹ J). Energy is not temperature; its change is not the same numerical change in °C."],
  se: ["Standard error", "Standard error", "Zdrojová míra nejistoty odhadu; sama o sobě není pravděpodobnostním intervalem.",
    "A source measure of estimation uncertainty; not by itself a probability interval."],
  altimetry: ["Altimetrie / GIA", "Altimetry / GIA",
    "Altimetrie odvozuje výšku hladiny z družicového měření. GIA je glaciální izostatické přizpůsobování Země po změnách ledového zatížení.",
    "Altimetry derives sea-surface height from satellite measurements. GIA is Earth's glacial isostatic adjustment to changes in ice loading."],
  quantile: ["Kvantil / p-box", "Quantile / p-box",
    "Kvantil označuje polohu v pravděpodobnostním rozdělení. P-box je obálka více rozdělení/postupů; zde q50 není prostý medián jedné společné distribuce.",
    "A quantile marks a position in a probability distribution. A p-box envelopes multiple distributions/workflows; q50 here is not simply the median of one combined distribution."],
  enso: ["ENSO / RONI", "ENSO / RONI",
    "ENSO je spřažené kolísání oceánu a atmosféry tropického Pacifiku. RONI je relativní tříměsíční index teploty oblasti Niño 3.4 upravený vůči tropům.",
    "ENSO is coupled tropical-Pacific ocean–atmosphere variability. RONI is a relative three-month Niño 3.4 temperature index adjusted against the tropics."],
};

// Each entry keeps descriptions specific to the actual product, not just its unit.
export const chartGuides = {
  co2: {
    description: ["Měsíční globální koncentrace CO₂ v suchém vzduchu ze sítě mořských povrchových míst NOAA GML, v ppm. Vodorovná osa je čas, svislá koncentrace. Křivka zachovává sezónní kolísání; není sezónně očištěným trendem.",
      "Monthly global dry-air CO₂ concentration from NOAA GML's marine-surface network, in ppm. The horizontal axis is time and the vertical axis concentration. The curve retains seasonal variability; it is not a seasonally adjusted trend."],
    limits: ["Nejde o samotnou Mauna Loa, lokální kvalitu vzduchu ani množství emisí za měsíc. Souběžný vývoj s teplotou sám o sobě nevyčísluje příčinný vztah.",
      "Not Mauna Loa alone, local air quality or monthly emissions. Co-movement with temperature does not by itself quantify causation."],
    source: ["NOAA GML — Global CO₂", "https://gml.noaa.gov/ccgg/trends/global.html"], terms: ["ppm", "variability"],
  },
  temperature: {
    description: ["Měsíční globální teplotní anomálie NASA GISS GISTEMP v4 L-OTI v °C vůči 1951–1980. Kombinuje teplotu vzduchu nad pevninou a mořským ledem s teplotou povrchu nezamrzlých oceánů. Osa x je čas, osa y odchylka od reference.",
      "Monthly global temperature anomalies from NASA GISS GISTEMP v4 L-OTI in °C relative to 1951–1980. It combines air temperature over land and sea ice with ice-free sea-surface temperature. The x-axis is time; the y-axis is the reference departure."],
    limits: ["Nejde o absolutní teplotu, místní počasí ani přímou změnu vůči 1850–1900. Jednotlivý měsíc neurčuje dlouhodobý klimatický trend.",
      "Not absolute temperature, local weather or a direct change relative to 1850–1900. One month does not establish a long-term climate trend."],
    source: ["NASA GISS — GISTEMP v4", "https://data.giss.nasa.gov/gistemp/"], terms: ["anomaly", "baseline", "analysis"],
  },
  roni: {
    description: ["Relativní index RONI od NOAA CPC (ERSSTv6), v °C. Každý bod pokrývá překrývající se tříměsíční období a je umístěn do prostředního měsíce. Reference je 1991–2020 s relativizací vůči tropům.",
      "NOAA CPC's relative RONI index (ERSSTv6), in °C. Each point covers an overlapping three-month period and is placed at its central month. The reference is 1991–2020 with adjustment relative to the tropics."],
    limits: ["Nejde o globální teplotu ani nezávislá měsíční měření. Jediný bod neurčuje epizodu El Niño/La Niña ani její místní dopady.",
      "Not global temperature or independent monthly measurements. One point does not establish an El Niño/La Niña episode or its local impacts."],
    source: ["NOAA CPC — RONI", "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/"], terms: ["enso", "baseline", "variability"],
  },
  sst: {
    description: ["Globální měsíční řada HadSST4 od Met Office Hadley Centre ukazuje anomálii povrchové teploty moře v °C vůči 1961–1990. Čas je na vodorovné ose, teplotní odchylka na svislé. Chybějící hodnoty zůstávají mezerami.",
      "Met Office Hadley Centre's global monthly HadSST4 series shows sea-surface temperature anomalies in °C relative to 1961–1990. Time is horizontal and temperature departure vertical. Missing values remain gaps."],
    limits: ["Nelze z ní odvodit teplotu v hloubce, obsah tepla celého oceánu nebo teplotu konkrétní pláže. Nezobrazené pásmo neznamená nulovou nejistotu.",
      "It does not give deep-water temperature, total ocean heat content or a particular beach's temperature. An absent band does not mean zero uncertainty."],
    source: ["Met Office — HadSST4", "https://www.metoffice.gov.uk/hadobs/hadsst4/"], terms: ["sst", "anomaly", "baseline"],
  },
  ohc: {
    description: ["NOAA NCEI poskytuje čtvrtletní obsah tepla globálního oceánu do 2 000 m. Svislá osa je v ZJ, vodorovná v čase; každý bod představuje tři měsíce. Zachováváme zdrojovou referenci i časový krok, pouze převádíme 10²² J na ZJ.",
      "NOAA NCEI provides quarterly global ocean heat content down to 2,000 m. The vertical axis is ZJ and the horizontal axis time; each point represents three months. The source reference and cadence are retained; only 10²² J is converted to ZJ."],
    limits: ["Není to povrchová teplota ani celý oceán včetně hloubek pod 2 000 m. Nula nemá doložené kalendářní referenční období; mezi čtvrtletími nejsou měsíční měření.",
      "Not surface temperature or the full ocean below 2,000 m. Zero has no documented calendar reference period here; there are no monthly measurements between quarters."],
    source: ["NOAA NCEI — Ocean Heat Content", "https://www.ncei.noaa.gov/access/global-ocean-heat-content/"], terms: ["ohc", "se", "baseline"],
  },
  gmsl: {
    description: ["NOAA Laboratory for Satellite Altimetry poskytuje anomálii globální hladiny pro pás 66° j. š.–66° s. š., v mm. Každý bod zachovává zdrojový čas družicového měření; přepínač vybírá jednu misi, nikoli sloučený průměr misí.",
      "NOAA Laboratory for Satellite Altimetry provides global sea-level anomalies for 66°S–66°N, in mm. Each point retains its satellite observation timestamp; the selector chooses one mission, not a merged mission average."],
    limits: ["Nejde o místní relativní hladinu, příliv nebo mapu zaplavení. Zdroj neuvádí kalendářní základnu; tato řada není přímo spojena s projekcemi AR6.",
      "Not local relative sea level, tides or a flood map. The source states no calendar baseline; this series is not directly joined to AR6 projections."],
    source: ["NOAA LSA — Sea Level Rise", "https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/LSA_SLR_timeseries_global.php"], terms: ["altimetry", "anomaly", "baseline"],
  },
  "global-history": {
    description: ["Roční globální modelovaná historie CMIP6 (1850–2014) z regionálně agregovaných dat IPCC-WG1 Atlas. Svislá osa je anomálie teploty vzduchu tas v °C vůči vlastní modelové referenci 1850–1900. Křivka je medián zahrnutých modelů, pásmo jejich min–max.",
      "Annual global modelled CMIP6 history (1850–2014) from IPCC-WG1 Atlas regionally aggregated data. The vertical axis is tas air-temperature anomaly in °C relative to each model's 1850–1900 reference. The line is the included-model median; the band is their min–max."],
    limits: ["Historický experiment je simulace, nikoli záznam pozorovaného počasí. Rozpětí není pravděpodobnostní interval a není srovnatelné s pásmem hladiny moře.",
      "The historical experiment is simulated, not observed weather. The spread is not a probability interval and is not equivalent to the sea-level band."],
    source: ["IPCC-WG1 Atlas — CMIP6", "https://github.com/IPCC-WG1/Atlas"], terms: ["anomaly", "baseline", "spread", "member"],
  },
  "global-future": {
    description: ["Roční globální projekce CMIP6 pro 2015–2100 z IPCC-WG1 Atlas, v °C vůči vlastní modelové referenci 1850–1900. Barvy rozlišují SSP; čáry jsou mediány a pásma min–max zahrnutých modelů. Legenda umožňuje rozlišit scénáře.",
      "Annual global CMIP6 projections for 2015–2100 from IPCC-WG1 Atlas, in °C relative to each model's 1850–1900 reference. Colours distinguish SSPs; lines are medians and bands are included-model min–max. The legend identifies scenarios."],
    limits: ["Nejde o pravděpodobnosti scénářů ani předpověď konkrétního roku nebo města. Medián vybraných modelů není oficiální nejlepší odhad IPCC.",
      "Not scenario probabilities or a forecast for a particular year or city. The selected-model median is not the IPCC's official best estimate."],
    source: ["IPCC-WG1 Atlas — CMIP6", "https://github.com/IPCC-WG1/Atlas"], terms: ["ssp", "forcing", "spread", "variability"], scenarios: "ssp",
  },
  legacy: {
    description: ["Starší demonstrační pohled z agregovaných dat IPCC-WG1 Atlas zobrazuje jednotlivé globální simulace CMIP6 pro 2015–2100, v °C vůči 1850–1900. Legenda rozlišuje model a SSP1-2.6 nebo SSP5-8.5; každá křivka je samostatný běh.",
      "The older demonstration view from IPCC-WG1 Atlas aggregated data shows individual global CMIP6 simulations for 2015–2100, in °C relative to 1850–1900. The legend identifies the model and SSP1-2.6 or SSP5-8.5; each curve is a separate run."],
    limits: ["Demonstrace není vyhodnocený ensemble. Nemá medián ani pásmo nejistoty a neumožňuje přisoudit pravděpodobnost budoucímu vývoji.",
      "The demonstration is not an assessed ensemble. It has no median or uncertainty band and assigns no probability to future outcomes."],
    source: ["IPCC-WG1 Atlas — CMIP6", "https://github.com/IPCC-WG1/Atlas"], terms: ["ssp", "member", "anomaly"], scenarios: "legacy",
  },
  "europe-history": {
    description: ["Samostatná pozorovací analýza NASA GISS GISTEMP v4 s vyhlazením 250 km, agregovaná vlastní fyzickou maskou Evropy. Graf má roční osu 1880–2026 a anomálie v °C vůči regionální referenci 1981–2010; platné celé roky jsou 1894–2025. Mezery nejsou nuly.",
      "Separate NASA GISS GISTEMP v4 observation-derived analysis with 250km smoothing, aggregated over the custom physical Europe mask. The chart spans 1880–2026 with annual anomalies in °C relative to the regional 1981–2010 reference; valid complete years are 1894–2025. Gaps are not zero."],
    limits: ["Nejde o EU27, syrové stanice, reanalýzu nebo modelovanou historii. Rok 2026 má pouze leden–září a nemá roční hodnotu. Zdrojová prostorová opora se mění; podmínky použití a citace čekají na ověření.",
      "Not EU27, raw stations, reanalysis or modelled history. 2026 has January–September only and no annual value. Spatial support varies; product-use and citation terms still need verification."],
    source: ["NASA GISS — GISTEMP v4", "https://data.giss.nasa.gov/gistemp/data_v4.html"], terms: ["anomaly", "baseline", "analysis", "coverage"],
  },
  "europe-coverage": {
    description: ["Diagnostika stejné evropské analýzy NASA: pro každý rok ukazuje nejnižší měsíční podíl pokryté vážené plochy v %. Čára 90 % je projektový práh, nikoli standard NASA/WMO. Minimum zahrnuje jen měsíce, které zdroj obsahuje.",
      "Diagnostics for the same European NASA analysis: each year shows its lowest monthly fraction of covered weighted area, in %. The 90% line is a project threshold, not a NASA/WMO standard. The minimum uses only months present in the source."],
    limits: ["Vysoké pokrytí nedoplňuje chybějící měsíce roku 2026. Graf neměří hustotu stanic, chybu teploty ani pravděpodobnost správnosti; k posouzení roku patří také tabulka důvodů mezer.",
      "High coverage does not supply missing 2026 months. This is not station density, temperature error or probability of correctness; consult the table's missing-year reasons as well."],
    source: ["NASA GISS — zdroj / source GISTEMP v4", "https://data.giss.nasa.gov/gistemp/data_v4.html"], terms: ["coverage", "analysis"],
  },
  "europe-cmip6": {
    description: ["Vlastní výpočet nad nativními poli CMIP6 dostupnými přes ESGF: ACCESS-CM2 a CanESM5, každý r1i1p1f1, pro fyzickou masku Evropy. Roční anomálie v °C jsou vztažené k vlastní základně každého modelu 1981–2010. Volič odděluje historii 1850–2014 od čtyř SSP 2015–2100; volitelné pásmo je min–max dvou křivek.",
      "Custom calculation over native CMIP6 fields available through ESGF: ACCESS-CM2 and CanESM5, each r1i1p1f1, over the physical Europe mask. Annual anomalies in °C use each model's own 1981–2010 baseline. The selector separates 1850–2014 history from four 2015–2100 SSPs; the optional band is the two-curve min–max."],
    limits: ["Dva modely nejsou reprezentativní vzorek ani pravděpodobnostní odhad. Historie není pozorování; křivky nejsou připojeny k NASA ani CDS. Stejná maska neznamená stejné rozlišení.",
      "Two models are not a representative sample or a probability estimate. History is not observation; curves are not joined to NASA or CDS. A shared mask does not imply identical resolution."],
    source: ["ESGF — CMIP6", "https://wcrp-cmip.org/cmip6/"], terms: ["gcm", "member", "baseline", "spread", "ssp"], scenarios: "ssp",
  },
  cds: {
    description: ["Graf ukazuje publikovaný indikátor absolutní průměrné roční teploty EU27 v letech 2006–2098 z Copernicus CDS / ECDE v2.0, založený na zpracovaných projekcích EURO-CORDEX. Osa x je rok, osa y °C. Aplikace pouze převádí K − 273,15; nevytváří anomálie ani další průměry. Horní seznamy určují jednu z devíti kombinací GCM–RCM–realizace a RCP4.5 nebo RCP8.5.",
      "The chart shows the published EU27 absolute annual mean temperature indicator for 2006–2098 from Copernicus CDS / ECDE v2.0, based on processed EURO-CORDEX projections. The x-axis is year; the y-axis °C. The app only converts K − 273.15, without generating anomalies or additional means. Selectors identify one of nine GCM–RCM–member combinations and RCP4.5 or RCP8.5."],
    limits: ["Vrchol či propad je krajní roční regionální průměr dané simulace, nikoli denní rekord nebo předpověď počasí daného roku. Nejde o celou fyzickou Evropu, ERA5 ani nezpracované výstupy modelu. Přesná agregace, time: point a historické rozdíly RCP zůstávají nevyjasněné; obecné vysvětlení scénářů je neřeší.",
      "A peak or trough is an extreme annual regional mean within that simulation, not a daily record or a forecast for that year. Not physical Europe as a whole, ERA5 or raw model output. Exact aggregation, time: point and RCP historical differences remain unresolved; general scenario explanations do not resolve them."],
    source: ["Copernicus CDS — ECDE v2.0", "https://cds.climate.copernicus.eu/datasets/sis-ecde-climate-indicators"], terms: ["gcm", "member", "rcp", "forcing", "variability"], scenarios: "rcp",
  },
  "sea-level": {
    description: ["Projekce globální střední hladiny z IPCC AR6 / NASA FACTS ukazuje změnu v mm vůči 1995–2014. Na časové ose jsou pouze publikované desetileté body 2020–2150. Čáry zobrazují q50, pásma q17–q83 obálky pracovních postupů medium confidence; nejde o min–max teplotních modelů.",
      "IPCC AR6 / NASA FACTS global mean sea-level projections show change in mm relative to 1995–2014. Only published decadal points for 2020–2150 lie on the time axis. Lines show q50; bands show q17–q83 of the medium-confidence workflow envelope, not temperature-model min–max."],
    limits: ["Nejde o lokální zaplavení ani pokračování satelitního měření. Spojnice nejsou vypočtené roční hodnoty; mezera 2100–2110 odděluje metodiky. Pásmo nevylučuje vyšší vzestup z procesů s nízkou důvěrou a neudává pravděpodobnost SSP.",
      "Not local flooding or an extension of satellite observations. Connecting lines are not calculated annual values; the 2100–2110 gap separates methodologies. The band does not exclude higher rise from low-confidence processes or assign SSP probabilities."],
    source: ["IPCC AR6 — sea-level projections", "https://doi.org/10.5281/zenodo.6382554"], terms: ["baseline", "quantile", "ssp"], scenarios: "ssp",
  },
};

const scenarioText = {
  rcp: [
    ["RCP4.5", "Stabilizační trajektorie směřující přibližně k 4,5 W/m² v roce 2100 a následné stabilizaci. Předpokládá omezení emisí oproti vysoké trajektorii; nezastavuje oteplování okamžitě.",
      "A stabilization pathway approaching approximately 4.5 W/m² in 2100 and subsequent stabilization. It entails emissions limitation relative to the high pathway, not an immediate halt to warming."],
    ["RCP8.5", "Vysoká trajektorie s rostoucím působením přibližně 8,5 W/m² v roce 2100. Zkoumá důsledky vysokých koncentrací skleníkových plynů; není automaticky nejpravděpodobnější budoucností.",
      "A high pathway with rising forcing of approximately 8.5 W/m² in 2100. It explores high greenhouse-gas concentrations, not automatically the most likely future."],
  ],
  ssp: [
    ["SSP1-2.6", "Cesta udržitelnosti a větší spolupráce kombinovaná s nízkou trajektorií působení přibližně 2,6 W/m² v roce 2100 a výrazným omezováním emisí.",
      "A sustainability and greater-cooperation pathway combined with low forcing of approximately 2.6 W/m² in 2100 and substantial emissions reductions."],
    ["SSP2-4.5", "Střední socioekonomická cesta s nerovnoměrným pokrokem kombinovaná s působením přibližně 4,5 W/m² v roce 2100. Není to automaticky nejpravděpodobnější vývoj.",
      "A middle-of-the-road socioeconomic pathway with uneven progress combined with approximately 4.5 W/m² in 2100. Not automatically the most likely outcome."],
    ["SSP3-7.0", "Regionální rivalita, slabší mezinárodní spolupráce a vysoké emise, s působením přibližně 7,0 W/m² v roce 2100.",
      "Regional rivalry, weaker international cooperation and high emissions, with approximately 7.0 W/m² in 2100."],
    ["SSP5-8.5", "Energeticky náročný rozvoj založený na fosilních palivech kombinovaný s velmi vysokou trajektorií přibližně 8,5 W/m² v roce 2100; nikoli přidělená pravděpodobnost.",
      "Energy-intensive fossil-fuelled development combined with a very high pathway of approximately 8.5 W/m² in 2100; not an assigned probability."],
  ],
};

const escape = (value) => String(value).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function chartEducation(id, language) {
  const guide = chartGuides[id];
  if (!guide || !["cs", "en"].includes(language)) throw new Error("Unknown chart education request");
  const cs = language === "cs";
  const index = cs ? 0 : 1;
  const scenarioFamily = guide.scenarios === "rcp" ? "rcp" : "ssp";
  const scenarios = guide.scenarios
    ? scenarioText[scenarioFamily].filter((row) => guide.scenarios !== "legacy" || ["SSP1-2.6", "SSP5-8.5"].includes(row[0]))
    : [];
  return `<section class="panel chart-description" data-chart-guide="${escape(id)}">
    <h2>${cs ? "Popis grafu" : "Chart description"}</h2>
    <p>${escape(guide.description[index])}</p>
    <p>${cs ? "Zdroj dat" : "Data source"}: <a href="${escape(guide.source[1])}">${escape(guide.source[0])}</a>.
    ${cs ? "Verze, reference a podrobnosti zpracování jsou uvedeny v metodice a zdrojích tohoto pohledu." : "Version, reference and processing details are given in this view's methods and sources."}</p>
    <h3>${cs ? "Co z grafu nelze vyčíst" : "What the chart cannot tell you"}</h3>
    <p>${escape(guide.limits[index])}</p>
    <p>${cs ? "Spodní posuvník mění pouze přiblížení grafu, nikoli tabulku nebo tento statický popis. Období a výběry měňte příslušnými ovladači, jsou-li dostupné. Spojnice přes dostupné body nepředstavují další měření; chybějící hodnoty se nevyplňují."
      : "The bottom slider changes only the chart viewport, not the table or this static description. Use the relevant controls, where available, to change periods and selections. Lines between available points are not additional measurements; missing values are not filled."}</p>
    ${scenarios.length ? `<h3>${cs ? "Co znamenají scénáře" : "What the scenarios mean"}</h3>
      <dl>${scenarios.map((row) => `<dt>${escape(row[0])}</dt><dd>${escape(row[cs ? 1 : 2])}</dd>`).join("")}</dl>
      <p>${cs ? "Scénáře jsou podmíněné možnosti, nikoli předpovědi s přidělenou pravděpodobností. Číslo za pomlčkou či RCP je W/m², ne °C. Podklady zahrnují skleníkové plyny, aerosoly a jejich prekurzory i využití půdy; implementace závisí na experimentu. Modely reagují různě a vnitřní proměnlivost může převážit rozdíly scénářů v jednotlivém roce. RCP4.5 není totožný s SSP2-4.5 a RCP8.5 s SSP5-8.5."
        : "Scenarios are conditional possibilities, not forecasts with assigned probabilities. The number after the dash or RCP denotes W/m², not °C. Inputs include greenhouse gases, aerosols and their precursors, and land use; implementation depends on the experiment. Models respond differently and internal variability can outweigh scenario differences in individual years. RCP4.5 is not identical to SSP2-4.5, nor RCP8.5 to SSP5-8.5."}</p>
      <p>${cs ? "Odborné podklady" : "Scientific background"}:
      <a href="https://doi.org/10.1007/s10584-011-0148-z">van Vuuren et al. (2011): RCP</a> ·
      <a href="https://www.ipcc.ch/report/ar6/wg1/figures/chapter-1/ccbox-1-4-figure-1/">IPCC AR6: SSP</a></p>` : ""}
    </section>
    <section class="panel chart-glossary" data-glossary-for="${escape(id)}"><h2>${cs ? "Slovníček pojmů" : "Glossary"}</h2>
    <dl>${guide.terms.map((key) => {
      const term = terms[key];
      return `<dt>${escape(term[index])}</dt><dd>${escape(term[cs ? 2 : 3])}</dd>`;
    }).join("")}</dl></section>`;
}
