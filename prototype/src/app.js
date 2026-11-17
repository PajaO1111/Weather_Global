import * as echarts from "echarts/core";
import { CustomChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  AriaComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { readRoute, routeHref, routeRequiresClimateSnapshot } from "./routing.js";
import { navigationSections, sectionForView } from "./navigation.js";
import { alignToMonths, calendarMonths, sharedPeriod } from "./comparison.js";
import { validateClimateSnapshot } from "./climate-data.js";
import { oceanBounds, oceanShortcut, validOceanPeriod } from "./ocean-period.js";
import { seaLevelPoints, seaLevelSegments, seaLevelScenarios, seaLevelWords } from "./sea-level.js";
import { validateCdsPreview, cdsScenarios } from "./cds-preview.js";
import { validateCmip6Preview, pairExperiments, pairRows } from "./cmip6-preview.js";
import { validateHistoryPreview } from "./history-preview.js";
import { europeApiBase, legacyEuropeGeographyWarning, validateEuropeCatalog } from "./europe-api.js";
import {
  continentIds,
  continentModels,
  continentScenarios,
  continentsApiBase,
  validateContinentsCatalog,
  validateContinentalBundle,
} from "./continents-preview.js";
import { chartEducation } from "./chart-education.js";
import { chartExplanation } from "./chart-explanation.js";
import { mountHistoryComparison } from "./history-comparison-view.js";
import { mountSeaIce } from "./sea-ice-view.js";
import { mountIceSheets } from "./ice-sheets-view.js";
import { mountSnowCover } from "./snow-cover-view.js";
import { mountPrecipitation } from "./precipitation-view.js";
import { mountDrought } from "./drought-view.js";
import { mountAtmosphericGases } from "./atmospheric-gases-view.js";
import { mountCarbonBudget } from "./carbon-budget-view.js";

echarts.use([
  CustomChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  AriaComponent,
  SVGRenderer,
]);

const words = {
  cs: {
    nav: [
      "Přehled",
      "Minulost",
      "Oceány",
      "Budoucí klima",
      "Srovnání",
      "Metodika a zdroje",
      "O projektu",
    ],
    dataStatus:
      "Weather Global · datový balíček importovaný {snapshot} · nejde o živý monitoring",
    eyebrow: "ZEMSKÝ SYSTÉM / KLIMATICKÝ ATLAS",
    headline: "Velký obraz.<br> Dlouhá perspektiva.",
    intro:
      "Zkoumejte vývoj klimatu v datech. Od měřených koncentrací po podmíněné scénáře budoucnosti — s jasnými zdroji, jednotkami a hranicemi poznání.",
    indicators: "Tři pohledy na měnící se planetu",
    lastPublished: "Poslední hodnota ve vzorku, nikoli dnešní měření",
    archive: "Archivovaný vzorek",
    detail: "Prozkoumat řadu →",
    period: "Období",
    source: "Zdroj",
    past: "Minulost v souvislostech",
    pastText:
      "Porovnávejte různé ukazatele na společné časové ose. Každý si zachovává vlastní jednotku a vlastní příběh.",
    compare: "Otevřít srovnání →",
    future: "Budoucnost není jediná křivka",
    futureText:
      "Projekce popisují podmíněné scénáře. Prohlédněte si medián a skutečné rozpětí vybraných modelů CMIP6.",
    exploreFuture: "Prozkoumat scénáře →",
    detailIntro:
      "Historická data se zdrojem, metodikou a přístupnou tabulkou. Hodnoty pocházejí z posledního validovaného datového balíčku.",
    from: "Od",
    to: "Do",
    apply: "Použít období",
    all: "Celá řada",
    ten: "10 let",
    fifty: "50 let",
    monthly: "Měsíční průměry",
    season: "Překrývající se tříměsíční sezóny",
    how: "Jak číst graf",
    method: "Metodika a omezení",
    table: "Tabulka zobrazených dat",
    value: "Hodnota",
    missing: "Chybí",
    previous: "Předchozí",
    next: "Další",
    page: "Strana",
    reference: "Referenční období",
    coverage: "Pokrytí",
    version: "Verze",
    compareTitle: "Souvislosti bez zaměňování měřítek",
    compareText:
      "Tři samostatné grafy sdílejí časovou osu, nikoli svislé měřítko. CO₂ zůstává v ppm, teplotní anomálie a RONI v °C. Žádná skrytá normalizace.",
    common:
      "Průnik dostupnosti: {period}. RONI je umístěn do středního měsíce sezóny, není to měsíční měření. Souběžný vývoj neprokazuje příčinu.",
    noCommonData: "Řady nemají společné období s platnými hodnotami.",
    projectionsTitle: "Možné trajektorie, ne předpověď",
    projectionsText:
      "Globální teplota vzduchu u povrchu (tas), CMIP6. Modelová simulace minulosti a podmíněné scénáře jsou oddělené od pozorování.",
    demo: "STARŠÍ VYDÁNÍ DAT — technická ukázka dvou modelů, nikoli reprezentativní rozpětí. Nová agregace zatím není v aktuálním vydání API.",
    scenario: "Scénář",
    both: "Všechny čtyři scénáře",
    legacyBoth: "Oba dostupné scénáře",
    projectionAxis: "Anomálie tas (°C), 1850–1900",
    projectionMethod:
      "Hodnota tas ve sloupci world (pevnina i oceán); od každého modelu odečten jeho průměr za všech 612 měsíců 1850–1900. Roční hodnota je aritmetický průměr 12 měsíčních hodnot se stejnou vahou měsíců. Zdrojové CSV neuvádějí kalendář, proto se neodvozuje ani nepoužívá váha podle počtu dní. Každý model má jednu stejně váženou realizaci. Pásmo je skutečné minimum–maximum vybraných modelů, čára jejich medián; nejde o pravděpodobnostní interval ani reprezentativní výběr všech CMIP6 modelů. Připnutá verze dat: ",
    projectionLimit:
      "Modelovaná historie, scénářové simulace a pozorovací řada GISTEMP jsou zobrazeny odděleně. Rok 2015 je začátkem scénářového experimentu; ani jeho hodnoty 2015–2026 nejsou pozorování. GISTEMP používá jinou veličinu a základnu 1951–1980, proto se nespojuje s `tas` do jedné řady. Deset dvojic model–realizace s neúplným měsíčním pokrytím bylo vyřazeno ze všech experimentů, aby každý rok a scénář používal stejných 19 modelů.",
    year: "Rok",
    model: "Model",
    modelledHistory: "Modelovaná historická simulace (1850–2014)",
    modelledHistoryText:
      "Samostatná modelová simulace, nikoli pozorovací záznam. Anomálie každého modelu používá jeho vlastní průměr 1850–1900.",
    scenarioRange: "Scénářové simulace (2015–2100)",
    scenarioRangeText:
      "Každý scénář je samostatný podmíněný experiment. Nejde o předpověď; stejné modely a realizace jsou zahrnuty v každém zobrazeném scénáři.",
    rangeLegend:
      "Barevná čára: medián modelů. Pásmo stejné barvy: skutečné minimum až maximum mezi modely; nejde o pravděpodobnostní interval.",
    ensembleMedian: "Medián modelů",
    median: "Medián",
    minimum: "Minimum",
    maximum: "Maximum",
    membersCount: "Počet modelů",
    membersTitle: "Použité model–realizace páry",
    baselineMean: "Průměr 1850–1900",
    excludedTitle: "Vyřazené neúplné modely",
    excludedSummary: "10 z 29 společných párů mělo neúplné historické nebo scénářové měsíce; byly vyřazeny ze všech scénářů.",
    missingMonths: "chybějících měsíců",
    historicalExperiment: "historie",
    calendarDisclosure:
      "Kalendářní metadata nejsou v těchto měsíčních CSV obsažena. Roční průměr proto dává všem 12 měsíčním hodnotám stejnou váhu; váha podle gregoriánských dnů se nepředstírá.",
    sourceManifest: "SHA-256 manifestu 145 zdrojových souborů",
    legacy: "Starší vydání API může dočasně zobrazit technickou ukázku dvou modelů, dokud nebude publikováno nové validované vydání.",
    legacyLimit:
      "Jde o starší technickou ukázku dvou příbuzných modelů, nikoli o reprezentativní výběr nebo modelové rozpětí. Scénářové hodnoty jsou simulace, ne pozorování.",
    legacyMethod:
      "Původní ukázka používá sloupec world a odečítá pro každý model jeho průměr 612 měsíců 1850–1900. Roční body jsou prostým průměrem 12 měsíčních hodnot. Připnutá verze dat: ",
    sourcesTitle: "Důvěra začíná u původu dat",
    sourcesText:
      "Každý graf musí vysvětlit, co ukazuje, jak vznikl a co z něj nelze vyvozovat. Stránka zobrazuje poslední validovaný datový balíček, nikoli živá měření.",
    citation: "Citace a podmínky",
    cmipAcknowledgement:
      "Uznáváme WCRP, které prostřednictvím WGCM, CMIP a CORDEX koordinovalo a podpořilo tvorbu globálních a regionálních projekcí. Děkujeme klimatickým modelovacím skupinám za jejich výstupy, ESGF za archivaci a přístup k datům a podporujícím finančním agenturám.",
    snapshot:
      "Datový balíček importován {snapshot}. Poslední dostupná hodnota každé řady má vlastní datum.",
    aboutTitle: "Klima s kontextem",
    aboutText:
      "Weather Global je samostatný nezávislý nekomerční klimatický atlas pro veřejnost a studenty. Nepředpovídá lokální počasí a není oficiálním produktem NASA, NOAA, NSIDC ani IPCC.",
    aboutScope:
      "Atlas zahrnuje globální ukazatele, oceány, měsíční rozsah polárního mořského ledu, změny hmotnosti ledových štítů Grónska a Antarktidy, sněhovou pokrývku severní polokoule, kontinentální srážkové úhrny, klimatické sucho SPEI a koncentrace CH₄/N₂O, historické mapy světadílů a podmíněné modelové scénáře. Koncentrace plynů nejsou emisní inventury. Konzervativní historický pohled odděluje projektové doplňování dat od zdrojové analýzy NASA; průzkumný pohled označuje doplněné odhady. Regionální piloty a archiv nejsou rovnocennou náhradou aktuálních kontinentálních produktů. Dostupnost závisí na publikovaném datovém balíčku.",
    footer: "Nezávislý nekomerční projekt · historie / scénáře / souvislosti",
    invalid:
      "Zvolte platné období v dostupném rozsahu; počátek nesmí být za koncem.",
    empty: "Ve vybraném období nejsou platná data.",
    failure:
      "Data se nepodařilo načíst. Zkontrolujte dostupnost API a posledního validovaného importu.",
    requiredDataTitle: "Základní klimatická data nejsou dostupná",
    requiredDataLoading: "Načítám ověřený balíček pro tuto stránku…",
    requiredDataFailure: "Tento pohled potřebuje základní klimatický balíček. Ostatní samostatné datové pohledy zůstávají dostupné.",
    retry: "Zkusit znovu",
    tableHint:
      "Tabulka respektuje zvolené období v ovládání nad grafem. Tažený zoom uvnitř grafu mění pouze vizuální výřez.",
    sampleLimit:
      "Archiv není aktuální monitoring. Poslední hodnoty mohou být předběžné a vydavatel může zpětně upravit historii.",
    sourcesLink: "Metodika poskytovatele",
    noBand: "Jednotlivé modely, bez modelového rozpětí",
    climate: "Klimatický systém · dlouhodobý pohled",
    noRoute: "Tento pohled neexistuje.",
    back: "Zpět na přehled",
    loaded: "Data načtena.",
    navLabel: "Hlavní navigace",
  },
  en: {
    nav: [
      "Overview",
      "History",
      "Oceans",
      "Future climate",
      "Compare",
      "Methods & sources",
      "About",
    ],
    dataStatus:
      "Weather Global · data bundle imported {snapshot} · not live monitoring",
    eyebrow: "EARTH SYSTEM / CLIMATE ATLAS",
    headline: "The big picture.<br> The long perspective.",
    intro:
      "Explore a changing climate through data. From measured concentrations to conditional futures — with clear sources, units and limits to what we know.",
    indicators: "Three perspectives on a changing planet",
    lastPublished: "Latest value in the snapshot, not a reading from today",
    archive: "Archived snapshot",
    detail: "Explore series →",
    period: "Period",
    source: "Source",
    past: "History in context",
    pastText:
      "Compare indicators along a shared timeline. Each keeps its own unit and its own story.",
    compare: "Open comparison →",
    future: "The future is not a single line",
    futureText:
      "Projections describe conditional scenarios. Explore the median and actual range of the selected CMIP6 models.",
    exploreFuture: "Explore scenarios →",
    detailIntro:
      "Historical data with sources, methods and an accessible table. Values come from the latest validated data release.",
    from: "From",
    to: "To",
    apply: "Apply period",
    all: "Full series",
    ten: "10 years",
    fifty: "50 years",
    monthly: "Monthly means",
    season: "Overlapping three-month seasons",
    how: "How to read this chart",
    method: "Methods and limitations",
    table: "Displayed data table",
    value: "Value",
    missing: "Missing",
    previous: "Previous",
    next: "Next",
    page: "Page",
    reference: "Reference period",
    coverage: "Coverage",
    version: "Version",
    compareTitle: "Context without confusing scales",
    compareText:
      "Three separate charts share a timeline, not a vertical scale. CO₂ stays in ppm; temperature anomalies and RONI in °C. No hidden normalisation.",
    common:
      "Availability intersection: {period}. RONI is placed at the central month of each season, not a monthly measurement. Co-movement does not establish causation.",
    noCommonData: "The series have no overlapping period with valid values.",
    projectionsTitle: "Possible pathways, not a forecast",
    projectionsText:
      "Global near-surface air temperature (tas), CMIP6. Model simulations of the past and conditional scenarios are kept separate from observations.",
    demo: "OLDER DATA RELEASE — a technical demonstration of two models, not a representative range. The new aggregation is not yet in the current API release.",
    scenario: "Scenario",
    both: "All four scenarios",
    legacyBoth: "Both available scenarios",
    projectionAxis: "tas anomaly (°C), 1850–1900",
    projectionMethod:
      "The world column (land and sea) is used; each model is rebased against its own mean over all 612 months in 1850–1900. Annual values are the arithmetic mean of 12 monthly values with equal month weights. The source CSVs do not encode calendar metadata, so no day-count weighting is inferred or applied. One equally weighted realization per model. The band is the actual minimum–maximum across selected models and the line is their median; this is neither a probability interval nor a representative sample of all CMIP6 models. Pinned data version: ",
    projectionLimit:
      "Modelled history, scenario simulations and the GISTEMP observational record are shown separately. 2015 begins the scenario experiments; their 2015–2026 values are simulations, not observations. GISTEMP uses a different variable and a 1951–1980 baseline, so it is not joined to tas. Ten model/member pairs with incomplete historical or scenario months were excluded from all experiments to keep the same 19 models in every year and scenario.",
    year: "Year",
    model: "Model",
    modelledHistory: "Modelled historical simulation (1850–2014)",
    modelledHistoryText:
      "A separate model simulation, not the observational record. Each model's anomaly uses its own 1850–1900 mean.",
    scenarioRange: "Scenario simulations (2015–2100)",
    scenarioRangeText:
      "Each scenario is a separate conditional experiment, not a forecast; the same models and realizations are included in every displayed scenario.",
    rangeLegend:
      "Coloured line: model median. Same-colour band: actual model minimum to maximum; this is not a probability interval.",
    ensembleMedian: "Model median",
    median: "Median",
    minimum: "Minimum",
    maximum: "Maximum",
    membersCount: "Model count",
    membersTitle: "Included model–realization pairs",
    baselineMean: "1850–1900 mean",
    excludedTitle: "Excluded incomplete models",
    excludedSummary: "10 of the 29 shared pairs had incomplete historical or scenario months and were excluded from all scenarios.",
    missingMonths: "missing months",
    historicalExperiment: "historical",
    calendarDisclosure:
      "Calendar metadata are not encoded in these monthly CSVs. The annual mean therefore gives all 12 monthly values equal weight; Gregorian day weighting is not assumed.",
    sourceManifest: "SHA-256 manifest for 145 source files",
    legacy: "An older API release may temporarily show the two-model technical demonstration until a new validated release is published.",
    legacyLimit:
      "This is an older technical demonstration with two related models, not a representative selection or model range. Scenario values are simulations, not observations.",
    legacyMethod:
      "The original demonstration uses the world column and subtracts each model's mean over 612 months in 1850–1900. Annual points are simple averages of 12 monthly values. Pinned data version: ",
    sourcesTitle: "Trust starts with provenance",
    sourcesText:
      "Every chart should explain what it shows, how it was produced and what it cannot tell us. The page displays the latest validated data release, not live measurements.",
    citation: "Citation and terms",
    cmipAcknowledgement:
      "We acknowledge the World Climate Research Programme, which through WGCM, CMIP and CORDEX coordinated and promoted the climate projection datasets. We thank the climate modelling groups for their output, ESGF for archiving and access, and the supporting funding agencies.",
    snapshot:
      "Data bundle imported {snapshot}. Each series has its own latest available value date.",
    aboutTitle: "Climate with context",
    aboutText:
      "Weather Global is an independent, non-commercial climate atlas for the public and students. It does not forecast local weather and is not an official NASA, NOAA, NSIDC or IPCC product.",
    aboutScope:
      "The atlas includes global indicators, oceans, monthly polar sea ice extent, Greenland and Antarctic ice-sheet mass changes, Northern Hemisphere snow cover, continental precipitation depths, SPEI climatic drought and atmospheric CH₄/N₂O concentrations, historical continental maps and conditional model scenarios. Gas concentrations are not emissions inventories. The conservative historical view separates project gap filling from the NASA source analysis; the exploratory view labels added estimates. Regional previews and archives are not equivalent substitutes for current continental products. Availability depends on the published data bundle.",
    footer:
      "Independent non-commercial project · history / scenarios / context",
    invalid:
      "Choose a valid period within the available range; the start must not follow the end.",
    empty: "No valid data in the selected period.",
    failure:
      "The data could not be loaded. Check API availability and the latest validated import.",
    requiredDataTitle: "Core climate data are unavailable",
    requiredDataLoading: "Loading the validated bundle required by this page…",
    requiredDataFailure: "This view requires the core climate bundle. Other independent data views remain available.",
    retry: "Try again",
    tableHint:
      "The table follows the period controls above the chart. Dragging the chart zoom only changes the visual viewport.",
    sampleLimit:
      "The archive is not live monitoring. Recent values may be preliminary and the provider may revise historical values.",
    sourcesLink: "Provider methodology",
    noBand: "Individual models, no ensemble range",
    climate: "Climate system · a long-term view",
    noRoute: "This view does not exist.",
    back: "Back to overview",
    loaded: "Data loaded.",
    navLabel: "Main navigation",
  },
};

const oceanText = {
  cs: {
    overviewTitle: "Oceány — tři různé pohledy",
    overviewIntro:
      "Teplota povrchu, teplo uložené v hloubce a výška mořské hladiny měří odlišné věci. Každý ukazatel si zachovává vlastní jednotku, základnu i časový krok.",
    unavailable:
      "Historické oceánské řady nejsou součástí aktuálně publikovaného datového balíčku. Starší vydání zůstává použitelné; oceánská data se objeví až po samostatném ověřeném vydání.",
    unavailableBadge: "Není v tomto vydání",
    availableBadge: "Archivovaná pozorování",
    notLive: "Nejde o živý monitoring.",
    latest: "Poslední hodnota ve vzorku",
    latestObservation: "Poslední měření",
    sourceSnapshot: "Zdrojový soubor vytvořen",
    detailUnavailable: "Tento indikátor není v aktuálním vydání API publikován.",
    sstSummary:
      "Globální měsíční anomálie teploty povrchu moře. Není to teplota vzduchu nad oceánem.",
    sstHow:
      "SST popisuje povrchovou teplotní anomálii. HadSST4 uvádí globální oceánskou řadu a měsíční složky nejistoty; graf zobrazuje publikovanou anomálii bez vlastní úpravy.",
    sstMethod:
      "HadSST.4.2.0.0, měsíční řada GLOBE, základna 1961–1990. Zdroj publikuje total_uncertainty i její složky. Tento prototyp nekreslí pásmo a nepřejmenovává zdrojovou nejistotu na pravděpodobnostní interval.",
    ohcSummary:
      "Čtvrtletní obsah tepla v celém oceánu do hloubky 2 000 m.",
    ohcHow:
      "Jeden bod pokrývá publikované tři měsíce. Data zůstávají čtvrtletní; mezi nimi nejsou vytvořeny měsíční hodnoty.",
    ohcMethod:
      "Původní jednotka NOAA je 10²² J; zobrazení převádí ji na ZJ pomocí 1 × 10²² J = 10 ZJ. Soubor uvádí standard error a hodnoty se nepřevádějí na jinou základnu. Stažený časový soubor neudává kalendářní referenční období; jeho nulový bod se proto nesmí zaměnit se základnou SST nebo GMSL.",
    gmslSummary:
      "Globální anomálie výšky mořské hladiny z družicové radarové altimetrie.",
    gmslHow:
      "Zobrazené body zachovávají časová razítka a mise NOAA LSA. Nejsou z nich počítány měsíční průměry ani spojovány překryvy různých družic.",
    gmslMethod:
      "Vybraný soubor NOAA LSA zachovává roční signál, má aplikovanou korekci inverzního barometru a nemá korekci GIA. Zdrojová tabulka neuvádí kalendářní základnu; hodnoty jsou ponechány jako publikovaná anomálie. NOAA LSA uvádí pět misí v oddělených sloupcích; přepínač zobrazí vždy jednu řadu, bez průměrování přes mise. Kandidátní NASA GSFC V5.2 je dostupný přes autentizovaný přístup PO.DAAC; tato verze proto používá veřejně dostupnou NOAA LSA alternativu.",
    historyNote:
      "Povrchové oteplení není tepelný obsah celého oceánu. Vyšší globální hladina není lokální předpověď záplavy.",
    dataPeriod: "Pokrytí této archivované řady",
    source: "Produkt a zdroj",
    version: "Verze",
    ohcVersion: "Čtvrtletní soubory NOAA NCEI; číselné vydání není uvedeno",
    baseline: "Základna / reference",
    geography: "Geografie",
    cadence: "Časový krok",
    uncertainty: "Nejistota zdroje",
    license: "Licence a atribuce",
    citation: "Citace",
    dataFile: "Zdrojový soubor",
    documentation: "Metodika poskytovatele",
    fromYear: "Od roku",
    toYear: "Do roku",
    apply: "Použít období",
    ten: "10 let",
    fifty: "50 let",
    all: "Celá řada",
    invalidPeriod: "Zadejte celé roky v rozsahu řady; začátek nesmí být po konci.",
    emptyPeriod: "V tomto období nejsou platná data.",
    sourceTime: "Zdrojový desetinný rok",
    platform: "Družice",
    totalUncertainty: "Celková zdrojová nejistota (°C)",
    standardError: "Zdrojová standard error (ZJ)",
    sourceValue: "Původní hodnota (10²² J)",
    selectMission: "Družice",
    missionPeriod: "Pokrytí vybrané družice: {first}–{last}. Zkratky končí jejím posledním rokem; 10/50 let se omezí na skutečně dostupné pokrytí.",
    measurement: "Měření",
    method: "Metodika a omezení",
    table: "Tabulka všech bodů v období",
  },
  en: {
    overviewTitle: "Oceans — three different views",
    overviewIntro:
      "Surface temperature, heat stored at depth and sea level measure different things. Each indicator keeps its own unit, reference and time step.",
    unavailable:
      "Historical ocean series are not included in the currently published data bundle. The older release remains usable; ocean data appear only after a separately validated release.",
    unavailableBadge: "Not in this release",
    availableBadge: "Archived observations",
    notLive: "This is not live monitoring.",
    latest: "Latest value in this sample",
    latestObservation: "Latest observation",
    sourceSnapshot: "Source file generated",
    detailUnavailable: "This indicator is not published in the current API release.",
    sstSummary:
      "Global monthly sea-surface temperature anomaly. It is not air temperature over the ocean.",
    sstHow:
      "SST describes a surface temperature anomaly. HadSST4 provides a global-ocean series and monthly uncertainty components; the chart shows the published anomaly without further adjustment.",
    sstMethod:
      "HadSST.4.2.0.0 monthly GLOBE series, 1961–1990 baseline. The source publishes total_uncertainty and its components. This release does not draw a band or relabel source uncertainty as a probability interval.",
    ohcSummary:
      "Quarterly heat content for the global ocean down to 2,000 m.",
    ohcHow:
      "Each point covers the published three-month period. Values remain quarterly; no monthly values are generated between them.",
    ohcMethod:
      "NOAA's source unit is 10²² J; the display converts it to ZJ using 1 × 10²² J = 10 ZJ. The source includes standard error and values are not rebased. The downloaded time-series files state no calendar reference period, so their zero must not be confused with the SST or GMSL baseline.",
    gmslSummary:
      "Global sea-level anomaly from satellite radar altimetry.",
    gmslHow:
      "Points retain NOAA LSA mission timestamps. No monthly averages are calculated and measurements from overlapping satellites are not combined.",
    gmslMethod:
      "The NOAA LSA file retains the annual signal, applies an inverted-barometer correction and has no GIA correction. The source table states no calendar baseline; values remain the published anomaly. NOAA LSA supplies five missions in separate columns; the selector shows one series at a time, without averaging missions. The candidate NASA GSFC V5.2 product is available through authenticated PO.DAAC access; this release therefore uses the publicly accessible NOAA LSA alternative.",
    historyNote:
      "Surface warming is not the heat content of the whole ocean. Higher global sea level is not a local flood forecast.",
    dataPeriod: "Coverage in this archived series",
    source: "Product and source",
    version: "Version",
    ohcVersion: "NOAA NCEI quarterly files; no numbered release is stated",
    baseline: "Baseline / reference",
    geography: "Geography",
    cadence: "Time step",
    uncertainty: "Source uncertainty",
    license: "License and attribution",
    citation: "Citation",
    dataFile: "Source file",
    documentation: "Provider methodology",
    fromYear: "From year",
    toYear: "To year",
    apply: "Apply period",
    ten: "10 years",
    fifty: "50 years",
    all: "Full series",
    invalidPeriod: "Enter whole years within the series; the start must not follow the end.",
    emptyPeriod: "No valid data in this period.",
    sourceTime: "Source decimal year",
    platform: "Satellite",
    totalUncertainty: "Source total uncertainty (°C)",
    standardError: "Source standard error (ZJ)",
    sourceValue: "Original value (10²² J)",
    selectMission: "Satellite",
    missionPeriod: "Selected satellite coverage: {first}–{last}. Shortcuts end at its latest year; 10/50 years clamp to the available coverage.",
    measurement: "Measurement",
    method: "Method and limitations",
    table: "Table of all points in the period",
  },
};

const oceanTextFor = (key) => oceanText[language][key];

const oceanIndicators = {
  sst: {
    name: ["Teplota povrchu oceánů", "Ocean surface temperature"],
    color: "#73e5d1",
    unit: "°C anomaly",
    digits: 3,
    provider: "Met Office Hadley Centre",
    version: "HadSST.4.2.0.0",
    baseline: ["1961–1990", "1961–1990"],
    geography: ["Světový oceán, 90° j. š.–90° s. š. (GLOBE)", "Global ocean, 90°S–90°N (GLOBE)"],
    cadence: ["Měsíční", "Monthly"],
    summary: [oceanText.cs.sstSummary, oceanText.en.sstSummary],
    how: [oceanText.cs.sstHow, oceanText.en.sstHow],
    method: [oceanText.cs.sstMethod, oceanText.en.sstMethod],
    citation: "Met Office Hadley Centre. HadSST.4.2.0.0, monthly GLOBE time series.",
    license: ["Open Government Licence v3", "Open Government Licence v3"],
    licenseUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    url: "https://hadleyserver.metoffice.gov.uk/hadsst4/data/data/HadSST.4.2.0.0_monthly_GLOBE.csv",
    documentationUrl: "https://hadleyserver.metoffice.gov.uk/hadsst4/data/download.html",
  },
  ohc: {
    name: ["Tepelný obsah oceánu (0–2 000 m)", "Ocean heat content (0–2,000 m)"],
    color: "#ffba86",
    unit: "ZJ",
    digits: 1,
    provider: "NOAA NCEI",
    version: "Global Ocean Heat Content CDR · quarterly files",
    baseline: [
      "Referenční období není v časovém souboru výslovně uvedeno",
      "No explicit reference period is stated in the time-series file",
    ],
    geography: ["Světový oceán, 0–2 000 m", "World ocean, 0–2,000 m"],
    cadence: ["Čtvrtletní (Q1–Q4)", "Quarterly (Q1–Q4)"],
    summary: [oceanText.cs.ohcSummary, oceanText.en.ohcSummary],
    how: [oceanText.cs.ohcHow, oceanText.en.ohcHow],
    method: [oceanText.cs.ohcMethod, oceanText.en.ohcMethod],
    citation:
      "NOAA National Centers for Environmental Information. Global Ocean Heat Content CDR, 0–2000 m basin time series.",
    license: [
      "NOAA veřejná data; stránka žádá o citaci a atribuci.",
      "NOAA public data; the product page requests citation and attribution.",
    ],
    licenseUrl: "https://www.ncei.noaa.gov/products/climate-data-records/global-ocean-heat-content",
    url: "https://www.ncei.noaa.gov/access/global-ocean-heat-content/basin_heat_data.html",
    documentationUrl: "https://www.ncei.noaa.gov/products/climate-data-records/global-ocean-heat-content",
  },
  gmsl: {
    name: ["Globální hladina moře", "Global mean sea level"],
    color: "#8abaff",
    unit: "mm anomaly",
    digits: 1,
    provider: "NOAA Laboratory for Satellite Altimetry",
    version: "RADS 4.7.1",
    baseline: [
      "Produktová anomálie; kalendářní základna není uvedena",
      "Product anomaly; no calendar baseline is stated",
    ],
    geography: ["Globální oceán 66°S–66°N", "Global ocean, 66°S–66°N"],
    cadence: [
      "Nepravidelná časová razítka, přibližně po družicovém cyklu",
      "Irregular timestamps, approximately one satellite repeat cycle",
    ],
    summary: [oceanText.cs.gmslSummary, oceanText.en.gmslSummary],
    how: [oceanText.cs.gmslHow, oceanText.en.gmslHow],
    method: [oceanText.cs.gmslMethod, oceanText.en.gmslMethod],
    citation: "Altimetry data are provided by NOAA Laboratory for Satellite Altimetry.",
    license: [
      "NOAA LSA žádá o atribuci; soubor samostatnou licenci neuvádí.",
      "NOAA LSA requests attribution; the file states no separate license.",
    ],
    licenseUrl: "https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/LSA_SLR_timeseries_global.php",
    url: "https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/slr/slr_sla_gbl_keep_ref_90.csv",
    documentationUrl: "https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/LSA_SLR_timeseries_global.php",
  },
};

const indicators = {
  co2: {
    name: ["Globální CO₂", "Global CO₂"],
    color: "#73e5d1",
    unit: "ppm",
    provider: "NOAA GML",
    version: "Global marine surface CO₂",
    baseline: ["Nejde o anomálii", "Not an anomaly"],
    coverage: [
      "Globální síť mořských povrchových míst",
      "Global marine surface sampling network",
    ],
    how: [
      "Křivka zobrazuje měsíční koncentraci CO₂ v suchém vzduchu. Sezónní kolísání není meziroční trend.",
      "The line shows monthly CO₂ concentration in dry air. Seasonal variations are not the year-on-year trend.",
    ],
    method: [
      "Globální průměr ze sítě NOAA, nikoli samotná Mauna Loa. Zobrazen je average, nikoli sezónně očištěný trend. Poslední rok je předběžný. Nejistota je ve zdrojovém souboru, tento prototyp ji zatím nevykresluje.",
      "A global average from the NOAA network, not Mauna Loa alone. The plotted field is average, not the seasonally adjusted trend. The latest year is preliminary. Uncertainties exist in the source but are not yet plotted in this release.",
    ],
    url: "https://gml.noaa.gov/ccgg/trends/global.html",
    citation:
      "Lan, X., Tans, P. & K. W. Thoning. Trends in globally-averaged CO₂. DOI: 10.15138/9N0H-ZH07. Version 2026-10-09. NOAA GML.",
    license: [
      "Public domain s výjimkami a atribucí dle NOAA GML.",
      "Public domain with exceptions and attribution under NOAA GML terms.",
    ],
    licenseUrl: "https://gml.noaa.gov/about/disclaimer.html",
  },
  temperature: {
    name: ["Globální teplotní anomálie", "Global temperature anomaly"],
    color: "#ffba86",
    unit: "°C",
    provider: "NASA GISS",
    version: "GISTEMP v4 / L-OTI",
    baseline: ["1951–1980", "1951–1980"],
    coverage: ["Globální pevnina + oceán", "Global land + ocean"],
    how: [
      "Nula odpovídá průměru referenčního období 1951–1980. +1 °C neznamená absolutní teplotu 1 °C ani změnu vůči předindustriálnímu období.",
      "Zero represents the 1951–1980 reference average. +1 °C is neither an absolute temperature of 1 °C nor a change relative to the pre-industrial period.",
    ],
    method: [
      "L-OTI kombinuje teplotu vzduchu nad pevninou a mořským ledem s povrchovou teplotou vody nad nezamrzlým oceánem. Měsíční analýza může být zpětně revidována. Chybějící hodnoty *** nejsou nuly. Zvolený CSV soubor již obsahuje °C.",
      "L-OTI combines air temperature over land and sea ice with sea surface temperature over ice-free oceans. Monthly analyses can be revised retrospectively. Missing *** values are not zero. The selected CSV already uses °C.",
    ],
    url: "https://data.giss.nasa.gov/gistemp/",
    citation:
      "GISTEMP Team (2026), GISTEMP version 4, NASA GISS. Lenssen et al. (2024). DOI: 10.1029/2023JD040179.",
    license: [
      "Otevřená data NASA; uvést produkt a odbornou citaci. Nejde o licenci k logům NASA.",
      "NASA open data; cite the product and scientific publication. This does not license NASA logos.",
    ],
    licenseUrl:
      "https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-information-guidance",
  },
  roni: {
    name: ["ENSO · relativní index RONI", "ENSO · relative index RONI"],
    color: "#8abaff",
    unit: "°C",
    provider: "NOAA CPC",
    version: "RONI / ERSSTv6",
    baseline: ["1991–2020, relativní index", "1991–2020, relative index"],
    coverage: [
      "Niño 3.4, relativizace vůči tropům",
      "Niño 3.4, relative to the tropics",
    ],
    how: [
      "Každý bod pokrývá tři měsíce; na ose je umístěn do prostředního měsíce. JAS znamená červenec–září. Nejde o globální teplotu ani o nezávislá měsíční měření.",
      "Each point spans three months and is placed at the central month. JAS means July–September. This is not global temperature or independent monthly measurements.",
    ],
    method: [
      "RONI zohledňuje odchylku Niño 3.4 vůči tropickému průměru a úpravu variability. Nejnovější hodnoty jsou odhady a mohou se měnit. Jediný bod nad prahem neprokazuje epizodu El Niño; prototyp epizody neklasifikuje.",
      "RONI accounts for Niño 3.4 anomalies relative to the tropical mean and adjusts variability. Recent values are estimates and may change. One point above a threshold does not establish an El Niño episode; this release does not classify episodes.",
    ],
    url: "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/",
    citation:
      "NOAA Climate Prediction Center. Relative Oceanic Niño Index (RONI), ERSSTv6, 1991–2020 base period.",
    license: [
      "Public domain s výjimkami a atribucí dle NOAA/NWS.",
      "Public domain with exceptions and attribution under NOAA/NWS terms.",
    ],
    licenseUrl: "https://www.weather.gov/disclaimer",
  },
};

const localCdsPreview = import.meta.env.DEV
  && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const content = document.querySelector("#content");
const loading = document.querySelector("#loading");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
let language = "cs";
let data;
let cdsPreview;
let cmip6Preview;
let historyPreview;
let continentsRequest;
let continentsRequestId = 0;
let historyComparisonHandle;
let seaIceHandle;
let iceSheetsHandle;
let snowCoverHandle;
let precipitationHandle;
let droughtHandle;
let atmosphericGasesHandle;
let carbonBudgetHandle;
let charts = [];
let observer;
let tablePage = 0;
let climateLoadPending = false;
let climateLoadError = null;
const t = (key) => {
  const value = words[language][key];
  if (!data) return value;
  if (key === "snapshot" || key === "dataStatus") {
    const date = new Intl.DateTimeFormat(
      language === "cs" ? "cs-CZ" : "en-GB",
      {
        dateStyle: "medium",
        timeZone: "UTC",
      },
    ).format(new Date(`${data.snapshot}T00:00:00Z`));
    return value.replaceAll("{snapshot}", date);
  }
  if (key === "common") {
    const period = commonPeriod();
    if (!period) return words[language].noCommonData;
    return value.replace("{period}", `${period.first} — ${period.last}`);
  }
  return value;
};
const localized = (pair) => pair[language === "cs" ? 0 : 1];
const commonPeriod = () => sharedPeriod(Object.values(data.series));
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const format = (value, digits = 2) =>
  value === null
    ? t("missing")
    : new Intl.NumberFormat(language === "cs" ? "cs-CZ" : "en-GB", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(value);
const href = (view) => routeHref(view, language);
const latest = (id) =>
  data.series[id].filter((point) => point.value !== null).at(-1);
const sourceLink = (id) =>
  `<a href="${indicators[id].url}">${escape(indicators[id].provider)} ↗</a>`;

function chart(
  element,
  points,
  {
    color = "#73e5d1",
    name = "",
    unit = "",
    small = false,
    lines: multi,
    categories: sharedCategories,
    ranges = [],
    timeAxis = false,
    showSymbols = false,
  } = {},
) {
  const instance = echarts.init(element, null, { renderer: "svg" });
  charts.push(instance);
  const series = multi ?? [{ name, points, color }];
  const categories =
    sharedCategories ?? series[0].points.map((point) => point.date);
  const categoryIndexes = new Map(
    categories.map((date, index) => [date, index]),
  );
  const rangeSeries = ranges.flatMap((range) => range.points.slice(0, -1).map((point, index) => {
    const next = range.points[index + 1];
    return {
      type: "custom",
      name: range.name,
      coordinateSystem: "cartesian2d",
      encode: { x: [0, 3], y: [1, 2, 4, 5] },
      data: [[point.date, point.minimum, point.maximum, next.date, next.minimum, next.maximum]],
      renderItem: (_params, api) => ({
        type: "polygon",
        shape: {
          points: [
            api.coord([api.value(0), api.value(1)]),
            api.coord([api.value(3), api.value(4)]),
            api.coord([api.value(3), api.value(5)]),
            api.coord([api.value(0), api.value(2)]),
          ],
        },
        style: { fill: range.color, opacity: 0.18 },
      }),
      itemStyle: { color: range.color },
      silent: true,
      z: 1,
      animation: false,
    };
  }));
  instance.setOption({
    animation: false,
    backgroundColor: "transparent",
    aria: {
      enabled: !small,
      label: { description: `${name}. ${t("tableHint")}` },
    },
    grid: small
      ? { left: 0, right: 0, top: 8, bottom: 8 }
      : { left: 56, right: 16, top: multi ? 70 : 40, bottom: 72 },
    tooltip: small
      ? { show: false }
      : {
          trigger: "axis",
          renderMode: "richText",
          backgroundColor: "#182637",
          borderColor: "#506479",
          textStyle: { color: "#edf3fa" },
          valueFormatter: (value) => `${format(value)} ${unit}`,
        },
    legend: multi
      ? {
          data: [...new Set(series.map((line) => line.name))],
          top: 0,
          textStyle: { color: "#c4d2e0", fontSize: 11 },
          type: "scroll",
          pageTextStyle: { color: "#c4d2e0" },
        }
      : { show: false },
    xAxis: {
      type: timeAxis ? "value" : "category",
      data: timeAxis ? undefined : categories,
      scale: timeAxis,
      show: !small,
      boundaryGap: timeAxis ? ["2%", "2%"] : false,
      axisLabel: {
        color: "#a7b9cc",
        hideOverlap: true,
        formatter: (value) => timeAxis
          ? new Intl.NumberFormat(language === "cs" ? "cs-CZ" : "en-GB", {
              maximumFractionDigits: 0,
              useGrouping: false,
            }).format(value)
          : value.slice(0, 4),
      },
      axisLine: { lineStyle: { color: "#304357" } },
    },
    yAxis: {
      type: "value",
      show: !small,
      scale: true,
      name: unit,
      nameTextStyle: { color: "#a7b9cc" },
      axisLabel: {
        color: "#a7b9cc",
        formatter: (value) => format(value, Math.abs(value) < 10 ? 1 : 0),
      },
      splitLine: { lineStyle: { color: "#27394c" } },
    },
    dataZoom: small
      ? []
      : [
          {
            type: "slider",
            bottom: 10,
            height: 20,
            borderColor: "#304357",
            textStyle: { color: "#a7b9cc" },
            brushSelect: false,
          },
        ],
    series: [
      ...rangeSeries,
      ...series.map((line) => ({
        name: line.name,
        type: "line",
        data: timeAxis
          ? line.points.map((point) => [point.source_time, point.value])
          : sharedCategories
          ? categories.map(
              (date) => line.points[categoryIndexes.get(date)]?.value ?? null,
            )
          : line.points.map((point) => point.value),
        showSymbol: showSymbols,
        symbolSize: 6,
        connectNulls: false,
        lineStyle: {
          color: line.color,
          width: small ? 1.5 : 2,
          type: line.type ?? "solid",
        },
        itemStyle: { color: line.color },
        emphasis: { disabled: small },
        animation: false,
        z: 2,
      })),
    ],
  });
  observer.observe(element);
  return instance;
}

function card(id) {
  const meta = indicators[id];
  const point = latest(id);
  return `<article class="indicator-card" style="--series-color:${meta.color}">
    <span class="pill">${t("archive")}</span><h3>${localized(meta.name)}</h3>
    <p class="value">${format(point.value)} <small>${meta.unit}</small></p>
    <p class="meta">${id === "roni" ? `${point.season} ${point.date.slice(0, 4)} · ${point.start} — ${point.end}` : point.date}<br> ${id === "temperature" ? `${t("reference")}: 1951–1980` : localized(meta.coverage)}</p>
    <div class="spark" id="spark-${id}" aria-hidden="true"></div>
    <p class="meta">${meta.provider} · ${meta.version}</p>
    <a class="card-link" href="${href(`indicator/${id}`)}">${t("detail")}</a></article>`;
}

function overview() {
  const cs = language === "cs";
  const sections = navigationSections(language, localCdsPreview);
  const topicText = [
    ["Jak se mění planeta jako celek?", "How is the planet changing as a whole?"],
    ["Kde a jak rychle se mění teplota?", "Where and how fast is temperature changing?"],
    ["Jak se mění oceány, led a hladina moře?", "How are oceans, ice and sea level changing?"],
  ];
  const topicSources = [
    "NOAA GML · NASA GISTEMP · NOAA CPC · IPCC / CMIP6 · NOAA / Rutgers · DWD / GPCC · CSIC SPEIbase",
    "NASA GISTEMP · CMIP6",
    "HadSST4 · NOAA NCEI · NASA / NOAA · IPCC AR6 · NSIDC",
  ];
  const topics = [sections[1], sections[2], sections[3]].map((section, index) =>
    `<article class="panel topic-card"><h3>${escape(section.label)}</h3>
      <p class="muted">${localized(topicText[index])}</p>
      <p class="meta">${topicSources[index]}</p>
      <ul class="topic-links">${section.links.filter((link) => !link.route.startsWith("europe")).map((link) =>
        `<li><a href="${href(link.route)}">${escape(link.label)} →</a><span class="meta">${["projections", "continents", "ocean-future"].includes(link.route)
          ? (cs ? "Modelové scénáře" : "Model scenarios")
          : link.route === "continental-history"
            ? (cs ? "Z pozorování · volitelně s odhady" : "Observation-derived · optional estimates")
            : (cs ? "Z pozorování" : "Observation-derived")}</span></li>`).join("")}</ul></article>`).join("");
  content.innerHTML = `<section class="hero"><div><p class="eyebrow">${t("eyebrow")}</p><h1>${t("headline")}</h1><p class="intro">${t("intro")}</p>
    <div class="hero-actions"><a class="button-link primary-link" href="${href("continental-history")}">${cs ? "Prozkoumat světadíly" : "Explore continents"} →</a>
    <a class="button-link" href="${href("history")}">${cs ? "Globální ukazatele" : "Global indicators"} →</a></div></div>
    <div class="hero-art" aria-hidden="true"><svg class="orb" viewBox="0 0 300 300"><defs><radialGradient id="earth"><stop stop-color="#154848"/><stop offset="1" stop-color="#0e202e"/></radialGradient></defs>
    <circle cx="150" cy="150" r="118" fill="url(#earth)" stroke="#497b7d"/><g fill="none" stroke="#73e5d1" stroke-opacity=".38"><ellipse cx="150" cy="150" rx="118" ry="38"/><ellipse cx="150" cy="150" rx="72" ry="118"/><ellipse cx="150" cy="150" rx="30" ry="118"/><path d="M32 150h236M150 32v236M48 91h204M48 209h204"/><ellipse cx="150" cy="150" rx="146" ry="49" transform="rotate(-28 150 150)" stroke-opacity=".8"/></g><circle cx="274" cy="100" r="4" fill="#73e5d1"/></svg><p>${t("climate")}</p></div></section>
    <section aria-labelledby="topics-heading"><div class="section-heading"><h2 id="topics-heading">${cs ? "Vyberte si pohled" : "Choose your perspective"}</h2></div><div class="cards">${topics}</div></section>
    <section><div class="section-heading"><h2>${cs ? "Základní globální ukazatele" : "Key global indicators"}</h2><p>${t("lastPublished")}</p></div><div class="cards">${Object.keys(indicators).map(card).join("")}</div></section>
    <section class="overview-guide" aria-labelledby="guide-heading"><div class="section-heading"><h2 id="guide-heading">${cs ? "Pozorování, odhady a scénáře" : "Observations, estimates and scenarios"}</h2></div>
    <div class="cards"><article class="panel"><span class="pill">${cs ? "Z pozorování" : "Observation-derived"}</span><h3>${cs ? "Historické analýzy" : "Historical analyses"}</h3>
    <p class="muted">${cs ? "Záznamy minulosti mohou zahrnovat prostorové zpracování. Konzervativní historie světadílů nepřidává projektové výplně, zdroj NASA však sám používá prostorovou analýzu." : "Historical records can include spatial processing. Conservative continental history adds no project gap filling, but the NASA source itself uses spatial analysis."}</p></article>
    <article class="panel"><span class="pill">${cs ? "S doplněnými odhady" : "With added estimates"}</span><h3>${cs ? "Průzkumný pohled" : "Exploratory view"}</h3>
    <p class="muted">${cs ? "Omezené doplnění prostorových a vnitřních časových mezer je označeno podílem odhadů. Neprodlužuje historii před ani za zdrojová data; barva světadílu není podrobnou místní mapou." : "Bounded spatial and internal temporal gap filling is labelled with estimate shares. It does not extend the source history; a continent's colour is not a detailed local map."}</p></article>
    <article class="panel"><span class="pill">${cs ? "Modelové scénáře" : "Model scenarios"}</span><h3>${cs ? "Podmíněná budoucnost" : "Conditional futures"}</h3>
    <p class="muted">${cs ? "Simulace závisí na modelu a zvoleném scénáři, nejsou předpovědí ani pozorováním. Modelovaná minulost zůstává oddělená od historických analýz." : "Simulations depend on the model and chosen scenario; they are neither forecasts nor observations. Modelled history remains separate from historical analyses."}</p></article></div></section>
    <section class="panel overview-trust"><h2>${cs ? "Zdroje a důvěryhodnost" : "Sources and trust"}</h2>
    <p class="muted">${cs ? "Každý graf uvádí zdroj, jednotky, referenční období a omezení. Produkty mají různá období a data aktualizace; poslední hodnota není živé měření. Pevninské průměry světadílů nejsou globálním průměrem pevniny a oceánu. Antarktida má zvláštní omezení uvedená v historickém pohledu." : "Each chart states its source, units, reference period and limitations. Products have different coverage and update dates; the latest value is not a live measurement. Continental land averages are not a global land–ocean mean. Antarctic limitations are explained in the historical view."}</p>
    <div class="hero-actions"><a class="button-link" href="${href("sources")}">${escape(sections[4].label)} →</a><a class="button-link" href="${href("about")}">${escape(sections[5].label)} →</a></div>
    ${localCdsPreview ? `<p class="meta archive-entry"><span class="pill">${cs ? "Pilot / archiv" : "Preview / archive"}</span> <a href="${href("europe")}">${cs ? "Regionální piloty a starší evropské produkty" : "Regional previews and older European products"} →</a></p>` : ""}</section>`;
  for (const id of Object.keys(indicators)) {
    chart(
      document.querySelector(`#spark-${id}`),
      data.series[id].filter(
        (point) => point.date >= "2016-01" && point.value !== null,
      ),
      { small: true, color: indicators[id].color },
    );
  }
}

function pageHeading(title, intro, eyebrow = t("eyebrow")) {
  return `<div class="page-heading"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="intro">${intro}</p></div>`;
}

function controls(first, last) {
  return `<form class="controls" id="period-controls">
    <label>${t("from")}<input type="month" id="period-from" min="${first}" max="${last}" value="${first}" required></label>
    <label>${t("to")}<input type="month" id="period-to" min="${first}" max="${last}" value="${last}" required></label>
    <button type="submit">${t("apply")}</button><div class="range-buttons">
    <button type="button" data-years="10">${t("ten")}</button><button type="button" data-years="50">${t("fifty")}</button><button type="button" data-years="all">${t("all")}</button></div></form><p id="period-error" role="alert" hidden></p>`;
}

function wireControls(first, last, update) {
  const from = document.querySelector("#period-from");
  const to = document.querySelector("#period-to");
  const error = document.querySelector("#period-error");
  function apply() {
    if (
      !/^\d{4}-\d{2}$/.test(from.value) ||
      !/^\d{4}-\d{2}$/.test(to.value) ||
      from.value < first ||
      to.value > last ||
      from.value > to.value
    ) {
      error.textContent = t("invalid");
      error.hidden = false;
      return;
    }
    error.hidden = true;
    tablePage = 0;
    update(from.value, to.value);
  }
  document
    .querySelector("#period-controls")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      apply();
    });
  for (const button of document.querySelectorAll("[data-years]")) {
    button.addEventListener("click", () => {
      const years = button.dataset.years;
      from.value =
        years === "all"
          ? first
          : `${Number(last.slice(0, 4)) - Number(years)}${last.slice(4)}`;
      if (from.value < first) from.value = first;
      to.value = last;
      apply();
    });
  }
}

function yearControls(first, last, update) {
  let firstYear = Number(first);
  let lastYear = Number(last);
  return {
    markup: `<form class="controls" id="ocean-period-controls">
      <label>${oceanTextFor("fromYear")}<input type="number" id="ocean-period-from" min="${firstYear}" max="${lastYear}" step="1" value="${firstYear}" required></label>
      <label>${oceanTextFor("toYear")}<input type="number" id="ocean-period-to" min="${firstYear}" max="${lastYear}" step="1" value="${lastYear}" required></label>
      <button type="submit">${oceanTextFor("apply")}</button><div class="range-buttons">
      <button type="button" data-ocean-years="10">${oceanTextFor("ten")}</button><button type="button" data-ocean-years="50">${oceanTextFor("fifty")}</button><button type="button" data-ocean-years="all">${oceanTextFor("all")}</button></div></form><p id="ocean-period-error" role="alert" hidden></p>`,
    connect() {
      const from = document.querySelector("#ocean-period-from");
      const to = document.querySelector("#ocean-period-to");
      const error = document.querySelector("#ocean-period-error");
      function apply() {
        const fromYear = Number(from.value);
        const toYear = Number(to.value);
        if (!validOceanPeriod({ first: firstYear, last: lastYear }, from.value, to.value)) {
          error.textContent = oceanTextFor("invalidPeriod");
          error.hidden = false;
          return;
        }
        error.hidden = true;
        tablePage = 0;
        update(fromYear, toYear);
      }
      document
        .querySelector("#ocean-period-controls")
        .addEventListener("submit", (event) => {
          event.preventDefault();
          apply();
        });
      for (const button of document.querySelectorAll("[data-ocean-years]")) {
        button.addEventListener("click", () => {
          const years = button.dataset.oceanYears;
          const range = oceanShortcut({ first: firstYear, last: lastYear }, years);
          from.value = String(range.first);
          to.value = String(range.last);
          apply();
        });
      }
    },
    reset(bounds) {
      firstYear = bounds.first;
      lastYear = bounds.last;
      for (const [selector, value] of [["#ocean-period-from", firstYear], ["#ocean-period-to", lastYear]]) {
        const field = document.querySelector(selector);
        field.min = String(firstYear);
        field.max = String(lastYear);
        field.value = String(value);
        field.setCustomValidity("");
      }
      document.querySelector("#ocean-period-error").hidden = true;
      tablePage = 0;
      update(firstYear, lastYear);
    },
  };
}

const oceanYear = (point) => point.year ?? Number(point.date.slice(0, 4));
const oceanDisplay = (value) => Array.isArray(value) ? localized(value) : value;
const oceanSourceFiles = {
  sst: "hadsst4_global_monthly.csv",
  ohc: [
    "noaa_ohc_0_2000m_q1.dat",
    "noaa_ohc_0_2000m_q2.dat",
    "noaa_ohc_0_2000m_q3.dat",
    "noaa_ohc_0_2000m_q4.dat",
  ],
  gmsl: "noaa_gmsl_global_keep_reference.csv",
};
const oceanUncertainty = {
  sst: [
    "Měsíční total_uncertainty a její složky jsou v API; graf nezobrazuje vlastní interval.",
    "Monthly total_uncertainty and its components are in the API; no derived interval is plotted.",
  ],
  ohc: [
    "Zdrojová standard error je uvedena v ZJ i původních jednotkách; nejde o interval pravděpodobnosti.",
    "Source standard error is shown in ZJ and original units; it is not a probability interval.",
  ],
  gmsl: [
    "Zdrojový časový soubor nepublikuje sloupec nejistoty.",
    "The source time-series file does not publish an uncertainty column.",
  ],
};

function oceanMetadata(id, metadata = null) {
  const fallback = oceanIndicators[id];
  return {
    provider: metadata?.provider ?? fallback.provider,
    product: metadata?.product ?? oceanDisplay(fallback.name),
    version: id === "ohc"
      ? oceanTextFor("ohcVersion")
      : metadata?.version ?? oceanDisplay(fallback.version),
    unit: metadata?.unit ?? fallback.unit,
    baseline: oceanDisplay(fallback.baseline),
    geography: oceanDisplay(fallback.geography),
    cadence: oceanDisplay(fallback.cadence),
    citation: metadata?.citation ?? fallback.citation,
    license: oceanDisplay(fallback.license),
    licenseUrl: metadata?.license_url ?? fallback.licenseUrl,
    uncertainty: localized(oceanUncertainty[id]),
    corrections: metadata?.corrections,
    dataUrl: metadata?.data_url ?? fallback.url,
    documentationUrl: metadata?.documentation_url ?? fallback.documentationUrl,
  };
}

const safeOceanUrl = (url) => /^https:\/\//i.test(url) ? escape(url) : "#";

function oceanSourceSection(id, metadata, points = []) {
  const minDate = points.length
    ? points.reduce((min, point) => point.date < min ? point.date : min, points[0].date)
    : null;
  const maxDate = points.length
    ? points.reduce((max, point) => point.date > max ? point.date : max, points[0].date)
    : null;
  const files = Array.isArray(oceanSourceFiles[id])
    ? oceanSourceFiles[id].join(", ")
    : oceanSourceFiles[id];
  const gmslGenerated = id === "gmsl"
    ? data.oceans?.series?.gmsl?.source_generated_at
    : null;
  return `<section class="panel source-list ocean-source"><h2>${oceanTextFor("source")}</h2><dl>
      <dt>${oceanTextFor("source")}</dt><dd>${escape(metadata.provider)} · ${escape(metadata.product)}</dd>
      <dt>${oceanTextFor("version")}</dt><dd>${escape(metadata.version)}</dd>
      <dt>${oceanTextFor("baseline")}</dt><dd>${escape(metadata.baseline)}</dd>
      <dt>${oceanTextFor("geography")}</dt><dd>${escape(metadata.geography)}</dd>
      <dt>${oceanTextFor("cadence")}</dt><dd>${escape(metadata.cadence)}</dd>
      <dt>${oceanTextFor("dataPeriod")}</dt><dd>${minDate ? `${escape(minDate)} — ${escape(maxDate)}` : "—"}</dd>
      <dt>${oceanTextFor("uncertainty")}</dt><dd>${escape(metadata.uncertainty)}</dd>
      ${metadata.corrections ? `<dt>${oceanTextFor("method")}</dt><dd>${escape(metadata.corrections)}</dd>` : ""}
      <dt>${oceanTextFor("license")}</dt><dd><a href="${safeOceanUrl(metadata.licenseUrl)}" target="_blank" rel="noreferrer">${escape(metadata.license)}</a></dd>
      <dt>${oceanTextFor("citation")}</dt><dd>${escape(metadata.citation)}</dd>
      <dt>${oceanTextFor("dataFile")}</dt><dd><code>${escape(files)}</code></dd>
      ${gmslGenerated ? `<dt>${oceanTextFor("sourceSnapshot")}</dt><dd>${escape(gmslGenerated)} · ${escape(data.oceans.series.gmsl.source_version)}</dd>` : ""}
    </dl>
    <p><a href="${safeOceanUrl(metadata.dataUrl)}" target="_blank" rel="noreferrer">${oceanTextFor("dataFile")} ↗</a> · <a href="${safeOceanUrl(metadata.documentationUrl)}" target="_blank" rel="noreferrer">${oceanTextFor("documentation")} ↗</a></p>
    <p class="meta">${t("snapshot")}</p></section>`;
}

function oceanOverview() {
  const oceanData = data.oceans?.series;
  const summaryCards = Object.entries(oceanIndicators).map(([id, fallback]) => {
    const points = oceanData?.[id]
      ? id === "gmsl"
        ? oceanData.gmsl.points
        : oceanData[id]
      : [];
    const latestPoint = id === "sst"
      ? [...points].reverse().find((point) => point.value !== null)
      : points.at(-1);
    const metadata = oceanMetadata(id, data.oceans?.metadata?.[id]);
    return `<article class="indicator-card" style="--series-color:${fallback.color}">
      <span class="pill">${points.length ? oceanTextFor("availableBadge") : oceanTextFor("unavailableBadge")}</span>
      <h2>${escape(oceanDisplay(fallback.name))}</h2>
      <p class="muted">${escape(oceanDisplay(fallback.summary))}</p>
      ${latestPoint
        ? `<p class="value">${format(latestPoint.value, fallback.digits)} <small>${escape(fallback.unit)}</small></p><p class="meta">${oceanTextFor("latest")}: ${escape(latestPoint.date)}<br>${escape(metadata.provider)} · ${escape(metadata.version)}</p>`
        : `<p class="meta">${oceanTextFor("unavailable")}</p><p class="meta">${escape(metadata.provider)} · ${escape(metadata.version)}</p>`}
      <a class="card-link" href="${href(`ocean/${id}`)}">${t("detail")}</a></article>`;
  }).join("");
  content.innerHTML = `${pageHeading(oceanTextFor("overviewTitle"), oceanTextFor("overviewIntro"))}
    ${oceanData ? `<p class="notice">${oceanTextFor("notLive")} ${t("snapshot")}</p>` : `<p class="notice">${oceanTextFor("unavailable")}</p>`}
    <p><a class="button-link" href="${href("ocean-future")}">${seaLevelWords[language].nav} →</a></p>
    <div class="cards">${summaryCards}</div>
    <section class="panel explain"><h2>${oceanTextFor("historyNote")}</h2><p class="muted">${oceanTextFor("sstHow")}</p>${oceanData ? "" : `<p>${oceanTextFor("detailUnavailable")}</p>`}</section>`;
}

function oceanDetail(id) {
  const fallback = oceanIndicators[id];
  const oceanData = data.oceans?.series?.[id];
  const points = oceanData
    ? id === "gmsl" ? oceanData.points : oceanData
    : [];
  const metadata = oceanMetadata(id, data.oceans?.metadata?.[id]);
  const heading = oceanDisplay(fallback.name);
  if (!oceanData || points.length === 0) {
    content.innerHTML = `${pageHeading(heading, oceanDisplay(fallback.summary), `${metadata.provider} / ${metadata.version}`)}
      <p class="notice">${oceanTextFor("unavailable")}</p>
      <section class="panel"><h2>${oceanTextFor("detailUnavailable")}</h2><p class="muted">${oceanTextFor("notLive")}</p></section>
      ${oceanSourceSection(id, metadata)}`;
    return;
  }

  const initialPoints = id === "gmsl"
    ? points.filter((point) => point.platform === points[0].platform)
    : points;
  const initialBounds = oceanBounds(initialPoints);
  const yearRange = yearControls(
    initialBounds.first,
    initialBounds.last,
    (from, to) => update(from, to),
  );
  const missionNames = {
    "topex-poseidon": "TOPEX/Poseidon",
    "jason-1": "Jason-1",
    "jason-2": "Jason-2",
    "jason-3": "Jason-3",
    "sentinel-6mf": "Sentinel-6MF",
  };
  const missions = id === "gmsl"
    ? [...new Set(points.map((point) => point.platform))]
    : [];
  content.innerHTML = `${pageHeading(heading, oceanDisplay(fallback.summary), `${metadata.provider} / ${metadata.version}`)}
    <section class="panel chart-panel"><div class="chart-heading"><h2>${heading}</h2><span class="meta">${escape(fallback.unit)} · ${escape(metadata.cadence)}</span></div>
    <p class="muted">${oceanDisplay(fallback.how)}</p>
    ${yearRange.markup}
    ${id === "gmsl" ? `<label class="mission-select">${oceanTextFor("selectMission")}<select id="ocean-mission">${missions.map((mission) => `<option value="${escape(mission)}">${escape(missionNames[mission] ?? mission)}</option>`).join("")}</select></label><p class="meta" id="ocean-mission-coverage"></p>` : ""}
    <div class="chart" id="ocean-detail-chart" role="img" aria-label="${escape(heading)}"></div>
    <p class="meta" id="ocean-range-label"></p>
    </section>
    ${chartEducation(id, language)}
    <section class="panel explain"><h2>${oceanTextFor("method")}</h2><p class="muted">${oceanDisplay(fallback.method)}</p>
      <details><summary>${oceanTextFor("table")}</summary><p>${oceanTextFor("notLive")}</p><div id="ocean-data-table"></div></details>
    </section>${oceanSourceSection(id, metadata, points)}`;

  function update(from, to) {
    const mission = id === "gmsl" ? document.querySelector("#ocean-mission").value : null;
    const available = mission ? points.filter((point) => point.platform === mission) : points;
    if (mission) {
      const bounds = oceanBounds(available);
      document.querySelector("#ocean-mission-coverage").textContent = oceanTextFor("missionPeriod")
        .replace("{first}", bounds.first).replace("{last}", bounds.last);
    }
    const selected = available.filter((point) => {
      const year = oceanYear(point);
      return year >= from && year <= to;
    });
    const chartTarget = document.querySelector("#ocean-detail-chart");
    const label = document.querySelector("#ocean-range-label");
    if (charts.length) {
      const previous = echarts.getInstanceByDom(chartTarget);
      if (previous) {
        observer.unobserve(previous.getDom());
        charts = charts.filter((item) => item !== previous);
        previous.dispose();
      }
    }
    const hasObservation = selected.some((point) => point.value !== null);
    if (selected.length === 0 || !hasObservation) {
      chartTarget.innerHTML = `<p class="notice ocean-empty" role="status">${oceanTextFor("emptyPeriod")}</p>`;
      label.textContent = "";
    } else {
      chartTarget.innerHTML = "";
      chart(chartTarget, selected, {
        name: heading,
        unit: fallback.unit,
        color: fallback.color,
        timeAxis: id === "gmsl",
      });
      label.textContent = `${oceanTextFor("dataPeriod")}: ${selected[0].date} — ${selected.at(-1).date} · ${selected.length} ${language === "cs" ? "bodů" : "points"}${mission ? ` · ${missionNames[mission]}` : ""}`;
    }
    const tableRows = selected.map((point) => ({
      ...point,
      source_time: Number(point.source_time).toFixed(4),
      total_uncertainty: point.total_uncertainty === null
        ? t("missing")
        : format(point.total_uncertainty, 3),
      standard_error: point.standard_error === undefined
        ? ""
        : format(point.standard_error, 2),
      source_value_1e22_j: point.source_value_1e22_j === undefined
        ? ""
        : format(point.source_value_1e22_j, 3),
      platform: missionNames[point.platform] ?? point.platform ?? "",
    }));
    const extraColumns = id === "sst"
      ? [{ key: "total_uncertainty", label: oceanTextFor("totalUncertainty") }]
      : id === "ohc"
        ? [
            { key: "source_value_1e22_j", label: oceanTextFor("sourceValue") },
            { key: "standard_error", label: oceanTextFor("standardError") },
          ]
        : [
            { key: "source_time", label: oceanTextFor("sourceTime") },
            { key: "platform", label: oceanTextFor("platform") },
          ];
    renderTable(
      document.querySelector("#ocean-data-table"),
      tableRows,
      oceanTextFor("table"),
      extraColumns,
      oceanTextFor("measurement"),
      (point) => format(point.value, fallback.digits),
    );
  }

  yearRange.connect();
  if (id === "gmsl") {
    document.querySelector("#ocean-mission").addEventListener("change", () => {
      const mission = document.querySelector("#ocean-mission").value;
      yearRange.reset(oceanBounds(points.filter((point) => point.platform === mission)));
    });
  }
  yearRange.reset(initialBounds);
}

function renderTable(
  target,
  points,
  caption,
  extraColumns = [],
  valueLabel = t("value"),
  formatValue = (point) => format(point.value),
) {
  const pages = Math.max(1, Math.ceil(points.length / 24));
  tablePage = Math.min(tablePage, pages - 1);
  function draw() {
    const slice = points.slice(tablePage * 24, (tablePage + 1) * 24);
    target.innerHTML = `<div class="table-wrap" tabindex="0" role="region" aria-label="${escape(caption)}"><table><caption>${caption}</caption><thead><tr><th scope="col">${t("period")}</th><th scope="col">${valueLabel}</th>${extraColumns.map((column) => `<th scope="col">${column.label}</th>`).join("")}</tr></thead><tbody>${slice.map((point) => `<tr><th scope="row">${escape(point.season ? `${point.season} ${point.date.slice(0, 4)}` : point.date)}</th><td>${formatValue(point)}</td>${extraColumns.map((column) => `<td>${escape(point[column.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="pagination"><button type="button" data-page="previous" ${tablePage === 0 ? "disabled" : ""}>${t("previous")}</button><span aria-live="polite">${t("page")} ${tablePage + 1} / ${pages} · ${points.length} ${language === "cs" ? "bodů" : "points"}</span><button type="button" data-page="next" ${tablePage === pages - 1 ? "disabled" : ""}>${t("next")}</button></div>`;
    target.querySelector('[data-page="previous"]').onclick = () => {
      tablePage--;
      draw();
      target.querySelector('[data-page="previous"]').focus();
    };
    target.querySelector('[data-page="next"]').onclick = () => {
      tablePage++;
      draw();
      target.querySelector('[data-page="next"]').focus();
    };
  }
  draw();
}

/** Displays source-defined AR6 p-box levels separately from observations and tas. */
function oceanFuture() {
  const text = seaLevelWords[language];
  const projection = data.ocean_projections;
  const heading = pageHeading(text.title, text.intro, "IPCC AR6 / NASA / FACTS");
  if (!projection) {
    content.innerHTML = `${heading}<p class="notice" role="status">${text.unavailable}</p><a href="${href("oceans")}">${oceanTextFor("overviewTitle")}</a>`;
    return;
  }
  const names = { ssp126: "SSP1-2.6", ssp245: "SSP2-4.5", ssp370: "SSP3-7.0", ssp585: "SSP5-8.5" };
  const colors = { ssp126: "#73e5d1", ssp245: "#efcf80", ssp370: "#f0a36f", ssp585: "#e89cb9" };
  content.innerHTML = `${heading}
    <section class="panel chart-panel"><h2>${escape(text.baseline)}</h2>
      <label>${t("scenario")}<select id="ocean-future-scenario"><option value="all">${text.all}</option>${seaLevelScenarios.map((id) => `<option value="${id}">${names[id]}</option>`).join("")}</select></label>
      <p class="meta">${text.central} · ${text.interval}</p>
      <div class="chart" id="ocean-future-chart" role="img" aria-label="${escape(text.title)}"></div>
      <p>${text.steps}</p><p class="notice">${text.boundary}</p>
    </section>
    ${chartEducation("sea-level", language)}
    <section class="panel explain"><h2>${t("method")}</h2><p>${text.method}</p><p>${text.confidence}</p><p>${text.limits}</p>
      <details><summary>${t("table")}</summary><div id="ocean-future-table"></div></details>
    </section>
    <section class="panel source-list"><h2>${text.source}</h2><dl>
      <dt>${t("source")}</dt><dd>${escape(projection.provider)} · ${escape(projection.product)}</dd>
      <dt>${t("version")}</dt><dd>${escape(projection.version)} · 2020–2150 · 14 × 4 · 107 ${language === "cs" ? "původních kvantilů v API" : "original quantiles in the API"}</dd>
      <dt>${t("reference")}</dt><dd>1995–2014 · mm · ${escape(projection.geography)}</dd>
      <dt>${oceanTextFor("license")}</dt><dd><a href="${safeOceanUrl(projection.license_url)}">${escape(projection.license)}</a></dd>
      <dt>SHA-256 (${language === "cs" ? "manifest vstupů" : "input manifest"})</dt><dd><code>${escape(projection.source_manifest_sha256)}</code></dd>
      </dl>
      <p><a href="${safeOceanUrl(projection.record_url)}">Zenodo 6382554 ↗</a> · <a href="${safeOceanUrl(projection.source_url)}">ar6.zip (890 MB) ↗</a> · <a href="${safeOceanUrl(projection.documentation_url)}">${oceanTextFor("documentation")} ↗</a> · <a href="${safeOceanUrl(projection.baseline_documentation_url)}">NASA: ${t("reference")} ↗</a></p>
      <details><summary>${text.sourceHashes}</summary><ul>${seaLevelScenarios.map((id) => `<li>${names[id]} · <code>${escape(projection.scenarios[id].source_file)}</code><br><code>${escape(projection.scenarios[id].source_sha256)}</code></li>`).join("")}</ul></details>
      ${projection.citations.map((citation) => `<p><a href="${safeOceanUrl(citation.url)}">${escape(citation.text)}</a></p>`).join("")}
      <p class="meta">${escape(projection.acknowledgement)}</p><p class="meta">${t("snapshot")}</p>
    </section>`;
  let instance;
  function update() {
    const selection = document.querySelector("#ocean-future-scenario").value;
    const selected = selection === "all" ? seaLevelScenarios : [selection];
    const series = selected.map((id) => ({ id, points: seaLevelPoints(projection, id) }));
    if (instance) {
      observer.unobserve(instance.getDom());
      charts = charts.filter((item) => item !== instance);
      instance.dispose();
    }
    instance = chart(document.querySelector("#ocean-future-chart"), [], {
      name: text.title, unit: "mm", timeAxis: true, showSymbols: true,
      lines: series.flatMap(({ id, points }) => seaLevelSegments(points).map((segment) => ({
        name: names[id], color: colors[id], points: segment,
      }))),
      ranges: series.flatMap(({ id, points }) => seaLevelSegments(points).map((segment) => ({
        name: names[id], color: colors[id], points: segment,
      }))),
    });
    tablePage = 0;
    renderTable(document.querySelector("#ocean-future-table"),
      series.flatMap(({ id, points }) => points.map((point) => ({
        ...point, scenario: names[id], lower: format(point.minimum, 0), upper: format(point.maximum, 0),
      }))),
      text.title,
      [{ key: "scenario", label: t("scenario") }, { key: "lower", label: text.lower }, { key: "upper", label: text.upper }],
      text.centralColumn, (point) => format(point.value, 0));
  }
  document.querySelector("#ocean-future-scenario").addEventListener("change", update);
  update();
}

function indicator(id) {
  const meta = indicators[id];
  const points = data.series[id];
  const first = points[0].date;
  const last = points.at(-1).date;
  content.innerHTML = `${pageHeading(localized(meta.name), t("detailIntro"), `${meta.provider} / ${meta.version}`)}
    <section class="panel chart-panel"><div class="chart-heading"><h2>${localized(meta.name)}</h2><span class="meta">${meta.unit} · ${t(id === "roni" ? "season" : "monthly")}</span></div>
    ${controls(first, last)}<div class="chart" id="detail-chart"></div><p class="meta" id="range-label"></p><p class="meta">${sourceLink(id)} · ${t("reference")}: ${localized(meta.baseline)}</p></section>
    ${chartEducation(id, language)}
    <section class="panel explain"><h2>${t("how")}</h2><p class="muted">${localized(meta.how)}</p>
    <details><summary>${t("method")}</summary><p>${localized(meta.method)}</p><p>${t("sampleLimit")}</p></details>
    <details><summary>${t("table")}</summary><p>${t("tableHint")}</p><div id="data-table"></div></details>
    <p class="meta">${meta.citation} ${t("snapshot")}</p></section>`;
  let instance;
  const update = (from, to) => {
    const selected = points.filter(
      (point) => point.date >= from && point.date <= to,
    );
    if (instance) {
      observer.unobserve(instance.getDom());
      charts = charts.filter((item) => item !== instance);
      instance.dispose();
    }
    instance = chart(document.querySelector("#detail-chart"), selected, {
      color: meta.color,
      name: localized(meta.name),
      unit: meta.unit,
    });
    document.querySelector("#range-label").textContent =
      `${from} — ${to} · ${t("archive")}${selected.every((point) => point.value === null) ? ` · ${t("empty")}` : ""}`;
    renderTable(
      document.querySelector("#data-table"),
      selected,
      `${localized(meta.name)} (${meta.unit})`,
      id === "roni"
        ? [
            { key: "start", label: t("from") },
            { key: "end", label: t("to") },
          ]
        : [],
    );
  };
  update(first, last);
  wireControls(first, last, update);
}

function comparison() {
  const period = commonPeriod();
  if (!period) {
    content.innerHTML = `${pageHeading(t("compareTitle"), t("compareText"))}<p class="notice" role="status">${t("noCommonData")}</p>`;
    return;
  }
  content.innerHTML = `${pageHeading(t("compareTitle"), t("compareText"))}<p class="notice">${t("common")}</p>${controls(period.first, period.last)}
    ${Object.entries(indicators)
      .map(
        ([id, meta]) =>
          `<section class="panel chart-panel"><div class="chart-heading"><h2>${localized(meta.name)}</h2><span class="meta">${meta.unit} · ${localized(meta.baseline)}</span></div><div class="comparison-chart" id="compare-${id}"></div><a href="${href(`indicator/${id}`)}">${t("detail")}</a></section>${chartEducation(id, language)}`,
      )
      .join("")}`;
  let instances = [];
  function update(from, to) {
    for (const instance of instances) {
      observer.unobserve(instance.getDom());
      charts = charts.filter((item) => item !== instance);
      instance.dispose();
    }
    const categories = calendarMonths(from, to);
    instances = Object.entries(indicators).map(([id, meta]) =>
      chart(
        document.querySelector(`#compare-${id}`),
        alignToMonths(
          data.series[id].filter(
            (point) => point.date >= from && point.date <= to,
          ),
          categories,
        ),
        {
          color: meta.color,
          name: localized(meta.name),
          unit: meta.unit,
          categories,
        },
      ),
    );
    instances.forEach((instance) => {
      instance.group = "comparison";
    });
    echarts.connect("comparison");
  }
  update(period.first, period.last);
  wireControls(period.first, period.last, update);
}

function legacyProjections() {
  content.innerHTML = `${pageHeading(t("projectionsTitle"), t("projectionsText"), "CMIP6 / IPCC ATLAS")}
    <p class="notice">${t("demo")}</p><section class="panel chart-panel"><div class="controls"><label>${t("scenario")}<select id="scenario"><option value="both">${t("legacyBoth")}</option><option value="ssp126">SSP1-2.6</option><option value="ssp585">SSP5-8.5</option></select></label></div>
    <h2>${t("projectionAxis")}</h2><p class="meta">${t("noBand")} · 2015–2100 · r1i1p1f1</p><div class="chart" id="projection-chart"></div></section>
    ${chartEducation("legacy", language)}
    <section class="panel"><h2>${t("method")}</h2><p class="muted">${t("legacyLimit")}</p><details><summary>${t("how")}</summary><p>${t("legacyMethod")}<code>${data.commit}</code></p></details>
    <details><summary>${t("table")}</summary><div id="projection-table"></div></details>
    <p class="meta"><a href="https://github.com/IPCC-WG1/Atlas">IPCC-WG1 Atlas ↗</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · <a href="https://pcmdi.llnl.gov/CMIP6/TermsOfUse/TermsOfUse6-2.html">CMIP6 terms of use</a> · Iturbide et al. (2022), DOI: 10.1038/s41597-022-01739-y. ${t("snapshot")}</p>
    <details><summary>${t("citation")}</summary><p>${t("cmipAcknowledgement")}</p></details></section>`;
  let instance;
  function update() {
    if (instance) {
      observer.unobserve(instance.getDom());
      charts = charts.filter((item) => item !== instance);
      instance.dispose();
    }
    const choice = document.querySelector("#scenario").value;
    const selected = data.projections.filter(
      (series) => choice === "both" || series.scenario === choice,
    );
    const series = selected.map((item) => ({
      name: `${item.model} · ${item.scenario === "ssp126" ? "SSP1-2.6" : "SSP5-8.5"}`,
      points: item.points,
      color: item.scenario === "ssp126" ? "#73e5d1" : "#ffba86",
      type: item.model === "ACCESS-CM2" ? "solid" : "dashed",
    }));
    instance = chart(document.querySelector("#projection-chart"), [], {
      name: t("projectionsTitle"),
      unit: "°C",
      lines: series,
    });
    tablePage = 0;
    renderTable(
      document.querySelector("#projection-table"),
      selected.flatMap((item) =>
        item.points.map((point) => ({
          ...point,
          model: item.model,
          scenario: item.scenario,
        })),
      ),
      t("projectionAxis"),
      [
        { key: "model", label: t("model") },
        { key: "scenario", label: t("scenario") },
      ],
    );
  }
  document.querySelector("#scenario").addEventListener("change", update);
  update();
}

function projections() {
  const ensemble = data.projection_ensemble;
  if (!ensemble) {
    legacyProjections();
    return;
  }

  const scenarios = ["ssp126", "ssp245", "ssp370", "ssp585"];
  const names = {
    ssp126: "SSP1-2.6",
    ssp245: "SSP2-4.5",
    ssp370: "SSP3-7.0",
    ssp585: "SSP5-8.5",
  };
  const colors = {
    ssp126: "#73e5d1",
    ssp245: "#8abaff",
    ssp370: "#e4a4ff",
    ssp585: "#ffba86",
  };
  const rangeRows = (points) => points.map((point) => ({
    ...point,
    value: point.median,
    minimum: format(point.minimum),
    maximum: format(point.maximum),
    members: String(point.members),
  }));
  const describeExcludedMember = (entry) => {
    const experimentNames = {
      historical: t("historicalExperiment"),
      ssp126: "SSP1-2.6",
      ssp245: "SSP2-4.5",
      ssp370: "SSP3-7.0",
      ssp585: "SSP5-8.5",
    };
    const reasons = entry.reason.split("; ").map((reason) => {
      const match = /^(historical|ssp126|ssp245|ssp370|ssp585) missing (\d+) months \(([^)]+)\)$/.exec(reason);
      return match
        ? `${experimentNames[match[1]]}: ${match[3]} (${match[2]} ${t("missingMonths")})`
        : reason;
    });
    return `${entry.member} — ${reasons.join("; ")}`;
  };

  content.innerHTML = `${pageHeading(t("projectionsTitle"), t("projectionsText"), "CMIP6 / IPCC ATLAS")}
    <p class="notice">${t("rangeLegend")}</p>
    <section class="panel chart-panel"><h2>${t("modelledHistory")}</h2><p class="muted">${t("modelledHistoryText")}</p>
      <p class="meta">1850–2014 · ${ensemble.model_count} ${t("membersCount")} · ${t("projectionAxis")}</p>
      <div class="chart" id="historical-model-chart"></div>
    </section>
    ${chartEducation("global-history", language)}
    <section class="panel explain"><details><summary>${t("table")}</summary><div id="historical-model-table"></div></details></section>
    <section class="panel chart-panel"><div class="controls"><label>${t("scenario")}<select id="scenario"><option value="all">${t("both")}</option>${scenarios.map((scenario) => `<option value="${scenario}">${names[scenario]}</option>`).join("")}</select></label></div>
      <h2>${t("scenarioRange")}</h2><p class="muted">${t("scenarioRangeText")}</p>
      <p class="meta">2015–2100 · ${ensemble.model_count} ${t("membersCount")} · ${t("projectionAxis")}</p>
      <div class="chart" id="projection-chart"></div>
    </section>
    ${chartEducation("global-future", language)}
    <section class="panel explain"><details><summary>${t("table")}</summary><div id="projection-table"></div></details></section>
    <section class="panel"><h2>${t("method")}</h2><p class="muted">${t("projectionLimit")}</p>
      <p>${t("calendarDisclosure")}</p><details><summary>${t("how")}</summary><p>${t("projectionMethod")}<code>${data.commit}</code></p>
      <p class="meta">${t("sourceManifest")}: <code>${ensemble.source_manifest_sha256}</code></p>
      <h3>${t("membersTitle")} (${ensemble.members.length})</h3><ul>${ensemble.members.map((member) => `<li>${escape(member)} · ${t("baselineMean")}: ${format(ensemble.baseline_means[member])} °C</li>`).join("")}</ul>
      <h3>${t("excludedTitle")} (${ensemble.excluded_members.length})</h3><p>${t("excludedSummary")}</p>
      <ul>${ensemble.excluded_members.map((member) => `<li>${escape(describeExcludedMember(member))}</li>`).join("")}</ul>
      </details><p class="meta"><a href="https://github.com/IPCC-WG1/Atlas/tree/${data.commit}/datasets-aggregated-regionally">IPCC-WG1 Atlas ↗</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · <a href="https://pcmdi.llnl.gov/CMIP6/TermsOfUse/TermsOfUse6-2.html">CMIP6 terms of use</a> · Iturbide et al. (2022), DOI: 10.1038/s41597-022-01739-y · IPCC (2023), Atlas, DOI: 10.1017/9781009157896.021. ${t("snapshot")}</p>
      <details><summary>${t("citation")}</summary><p>${t("cmipAcknowledgement")}</p></details>
    </section>`;

  const historical = ensemble.historical;
  const historicalMedian = historical.map((point) => ({
    date: point.date,
    value: point.median,
  }));
  chart(document.querySelector("#historical-model-chart"), [], {
    name: t("modelledHistory"),
    unit: "°C",
    lines: [{ name: t("ensembleMedian"), points: historicalMedian, color: "#73e5d1" }],
    ranges: [{ points: historical, color: "#73e5d1" }],
  });
  renderTable(
    document.querySelector("#historical-model-table"),
    rangeRows(historical),
    t("modelledHistory"),
    [
      { key: "minimum", label: t("minimum") },
      { key: "maximum", label: t("maximum") },
      { key: "members", label: t("membersCount") },
    ],
    t("median"),
  );

  let instance;
  function update() {
    if (instance) {
      observer.unobserve(instance.getDom());
      charts = charts.filter((item) => item !== instance);
      instance.dispose();
    }
    const choice = document.querySelector("#scenario").value;
    const selected = choice === "all" ? scenarios : [choice];
    const selectedPoints = selected.map((scenario) => ({
      scenario,
      points: ensemble.scenarios[scenario],
    }));
    const lines = selectedPoints.map(({ scenario, points }) => ({
      name: `${names[scenario]} · ${t("median").toLowerCase()}`,
      points: points.map((point) => ({ date: point.date, value: point.median })),
      color: colors[scenario],
    }));
    instance = chart(document.querySelector("#projection-chart"), [], {
      name: t("scenarioRange"),
      unit: "°C",
      lines,
      ranges: selectedPoints.map(({ scenario, points }) => ({
        points,
        color: colors[scenario],
      })),
    });
    tablePage = 0;
    renderTable(
      document.querySelector("#projection-table"),
      selectedPoints.flatMap(({ scenario, points }) =>
        rangeRows(points).map((point) => ({ ...point, scenario: names[scenario] })),
      ),
      t("scenarioRange"),
      [
        { key: "minimum", label: t("minimum") },
        { key: "maximum", label: t("maximum") },
        { key: "members", label: t("membersCount") },
        { key: "scenario", label: t("scenario") },
      ],
      t("median"),
    );
  }
  document.querySelector("#scenario").addEventListener("change", update);
  update();
}

function sources() {
  const ensemble = data.projection_ensemble;
  content.innerHTML = `${pageHeading(t("sourcesTitle"), t("sourcesText"))}<div class="source-list">
    <section class="panel"><p class="eyebrow">CSIC · SPEIbase 2.11 · CRU TS 4.09</p>
      <h2>${language === "cs" ? "Sucho · SPEI-3 a SPEI-12" : "Drought · SPEI-3 and SPEI-12"}</h2>
      <p>${language === "cs" ? "Podíly dostupné pevniny v explicitních kategoriích sucha/vlhka, 1901–2024. Nové váhy pro 0,5° mřížku, měsíční dostupnost a počáteční mezery zachovány. Penman–Monteith; nespojováno s operativním Monitorem. Není přímé měření půdní vlhkosti ani hydrologického sucha. Upravená databáze pod ODbL 1.0 ke stažení v pohledu."
        : "Available-land shares in explicit dry/wet classes, 1901–2024. New 0.5° grid weights, monthly availability and initial gaps preserved. Penman–Monteith; not spliced with the operational Monitor. Not direct soil moisture or hydrological drought. Adapted ODbL 1.0 database downloadable from the view."}</p>
      <p><a href="${href("drought")}">${language === "cs" ? "Grafy, mapa, tabulky, kontext a licence" : "Charts, map, tables, context and licence"}</a> ·
        <a href="https://spei.csic.es/database.html">CSIC · SPEIbase</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a></p></section>
    <section class="panel"><p class="eyebrow">DWD / GPCC · Version 2025 · 2.5°</p>
      <h2>${language === "cs" ? "Srážky a voda" : "Precipitation and water"}</h2>
      <p>${language === "cs" ? "Měsíční srážkové úhrny 1891-01 až 2026-08 a úplné roční součty nad stejnou podporovanou pevninou šesti světadílů. Původní precip, nikoli klimatologicky doplněné precip_infill. Projektová reference 1981–2010, plošné podíly buněk se stanicí a interpolační vzdálenosti. Antarktida bez dat; srážky nejsou dostupná voda ani diagnóza sucha."
        : "Monthly precipitation depths, 1891-01 through 2026-08, and complete annual sums over identical supported land of six continents. Original precip, not climatologically filled precip_infill. Project 1981–2010 references, gauge-cell area fractions and interpolation distances. No Antarctic data; precipitation is not available water or a drought diagnosis."}</p>
      <p><a href="${href("precipitation")}">${language === "cs" ? "Grafy, mapa, tabulky, metodika a citace" : "Charts, map, tables, methods and citation"}</a> ·
        <a href="https://doi.org/10.5676/DWD_GPCC/MONTHLY_V2025_250">GPCC · DOI</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></p></section>
    <section class="panel"><p class="eyebrow">NOAA / Rutgers · NH SCE CDR v01r01</p>
      <h2>${language === "cs" ? "Sněhová pokrývka severní polokoule" : "Northern Hemisphere snow cover"}</h2>
      <p>${language === "cs" ? "Oficiální měsíční regionální rozsahy 1966-11 až 2026-10: polokoule, Eurasie a Severní Amerika včetně/bez Grónska. Mezery zachovány; projektová reference 1981–2010 a úplné jarní průměry MAM. Nejde o výšku sněhu nebo vodní zásobu."
        : "Official monthly regional extents, 1966-11 through 2026-10: hemisphere, Eurasia and North America including/excluding Greenland. Gaps preserved; project 1981–2010 references and complete MAM spring means. Not snow depth or water storage."}</p>
      <p><a href="${href("snow-cover")}">${language === "cs" ? "Grafy, tabulky, metodika a citace" : "Charts, tables, methods and citation"}</a> · <a href="https://doi.org/10.7289/V5N014G9">NOAA CDR · DOI</a></p></section>
    <section class="panel"><p class="eyebrow">NASA · GRACE / GRACE-FO</p>
      <h2>${language === "cs" ? "Pevninský led Grónska a Antarktidy" : "Greenland and Antarctic land ice"}</h2>
      <p>${language === "cs" ? "Veřejné regionální grafové řady NASA 2002–2026 v Gt. Původní nula a dolní/horní meze zachovány; hladina spolehlivosti v grafovém JSON neurčena. Mezery, včetně přechodu mezi misemi, se nedoplňují. Jde o hmotnost, nikoli rozsah mořského ledu."
        : "Public NASA regional chart series, 2002–2026 in Gt. Source zero and lower/upper bounds preserved; confidence level not stated in chart JSON. Gaps, including the mission transition, are not filled. Mass, not sea ice extent."}</p>
      <p><a href="${href("ice-sheets")}">${language === "cs" ? "Graf, tabulka, úplná metodika a citace" : "Chart, table, full methodology and citation"}</a> · <a href="https://science.nasa.gov/earth/explore/earth-indicators/ice-sheets/">NASA · Ice Sheets</a></p></section>
    <section class="panel"><p class="eyebrow">NSIDC · Sea Ice Index v4</p>
      <h2>${language === "cs" ? "Měsíční rozsah mořského ledu" : "Monthly sea ice extent"}</h2>
      <p>${language === "cs" ? "Arktida a Antarktida odděleně, 1978-11 až 2026-10, mil. km², práh koncentrace ≥15 %. Projektová měsíční reference 1981–2010 má 29 nebo 30 hodnot; bez doplňování mezer. Nejde o hmotnost pevninského ledu ani denní minima."
        : "Separate Arctic and Antarctic series, 1978-11 through 2026-10, million km², concentration threshold ≥15%. Project monthly 1981–2010 reference has 29 or 30 values; gaps are not filled. Not land-ice mass or daily minima."}</p>
      <p><a href="${href("sea-ice")}">${language === "cs" ? "Grafy, tabulky, metodika a úplná citace" : "Charts, tables, methods and full citation"}</a> · <a href="https://doi.org/10.7265/a98x-0f50">G02135 v4 · DOI</a></p></section>
    <section class="panel"><p class="eyebrow">NOAA GML · CH₄ / N₂O · 7D.7</p>
      <h2>${language === "cs" ? "Globální koncentrace CH₄ a N₂O" : "Global CH₄ and N₂O concentrations"}</h2>
      <p>${language === "cs" ? "Dvě oddělené měsíční řady v ppb, včetně původního trendu a nejistot. CH₄: 1983-07 až 2026-06; N₂O: 2001-01 až 2026-06. Koncentrace se nesmí zaměnit za emise."
        : "Two separate monthly series in ppb, preserving the source trend and uncertainties. CH₄: 1983-07 through 2026-06; N₂O: 2001-01 through 2026-06. Concentrations must not be confused with emissions."}</p>
      <p><a href="${href("atmospheric-gases")}">${language === "cs" ? "Otevřít grafy a tabulky" : "Open charts and tables"}</a> ·
        <a href="https://gml.noaa.gov/ccgg/trends_ch4/">NOAA GML · CH₄</a> ·
        <a href="https://gml.noaa.gov/ccgg/trends_n2o/">NOAA GML · N₂O</a></p></section>
    ${Object.entries(indicators)
      .map(
        ([
          id,
          meta,
        ]) => `<section class="panel"><p class="eyebrow">${meta.provider}</p><h2>${localized(meta.name)}</h2>
    <dl><dt>${t("version")}</dt><dd>${meta.version}</dd><dt>${t("reference")}</dt><dd>${localized(meta.baseline)}</dd><dt>${t("coverage")}</dt><dd>${localized(meta.coverage)}</dd><dt>${t("period")}</dt><dd>${data.series[id][0].date} — ${latest(id).date}</dd></dl>
    <p>${localized(meta.how)}</p><details><summary>${t("method")}</summary><p>${localized(meta.method)}</p></details><p>${sourceLink(id)}</p><h3>${t("citation")}</h3><p class="meta">${meta.citation}</p><p class="meta"><a href="${meta.licenseUrl}">${localized(meta.license)}</a></p></section>`,
      )
      .join("")}
    ${Object.entries(oceanIndicators).map(([id, fallback]) => {
      const points = data.oceans?.series?.[id]
        ? id === "gmsl" ? data.oceans.series.gmsl.points : data.oceans.series[id]
        : [];
      const metadata = oceanMetadata(id, data.oceans?.metadata?.[id]);
      const first = points.length
        ? points.reduce((min, point) => point.date < min ? point.date : min, points[0].date)
        : "—";
      const last = points.length
        ? points.reduce((max, point) => point.date > max ? point.date : max, points[0].date)
        : "—";
      return `<section class="panel"><p class="eyebrow">${escape(metadata.provider)} · ${points.length ? oceanTextFor("availableBadge") : oceanTextFor("unavailableBadge")}</p>
        <h2>${escape(oceanDisplay(fallback.name))}</h2><dl>
        <dt>${oceanTextFor("version")}</dt><dd>${escape(metadata.version)}</dd>
        <dt>${oceanTextFor("baseline")}</dt><dd>${escape(metadata.baseline)}</dd>
        <dt>${oceanTextFor("geography")}</dt><dd>${escape(metadata.geography)}</dd>
        <dt>${oceanTextFor("cadence")}</dt><dd>${escape(metadata.cadence)}</dd>
        <dt>${oceanTextFor("dataPeriod")}</dt><dd>${escape(first)} — ${escape(last)}</dd>
        <dt>${oceanTextFor("uncertainty")}</dt><dd>${escape(metadata.uncertainty)}</dd>
        <dt>${oceanTextFor("license")}</dt><dd><a href="${safeOceanUrl(metadata.licenseUrl)}" target="_blank" rel="noreferrer">${escape(metadata.license)}</a></dd></dl>
        <p>${escape(oceanDisplay(fallback.how))}</p><details><summary>${oceanTextFor("method")}</summary><p>${escape(oceanDisplay(fallback.method))}</p></details>
        <p><a href="${safeOceanUrl(metadata.dataUrl)}" target="_blank" rel="noreferrer">${oceanTextFor("dataFile")} ↗</a> · <a href="${safeOceanUrl(metadata.documentationUrl)}" target="_blank" rel="noreferrer">${oceanTextFor("documentation")} ↗</a></p>
        <p class="meta">${escape(metadata.citation)}</p><a href="${href(`ocean/${id}`)}">${t("detail")}</a></section>`;
    }).join("")}
    <section class="panel"><p class="eyebrow">CMIP6 / IPCC ATLAS</p><h2>${t("nav")[3]}</h2><p>${data.projection_ensemble ? t("projectionsText") : t("demo")}</p><p>${data.projection_ensemble ? t("projectionMethod") : t("legacyMethod")}<code>${data.commit}</code></p>
    ${data.projection_ensemble ? `<p class="meta">${ensemble.model_count} ${t("membersCount")} · ${t("sourceManifest")}: ${ensemble.source_manifest_sha256}</p>` : ""}
    <p class="meta">Iturbide et al. (2022), DOI: 10.1038/s41597-022-01739-y. IPCC (2023), Atlas, DOI: 10.1017/9781009157896.021.</p>
    <p class="meta">We acknowledge the World Climate Research Programme, CMIP, the climate modelling groups and the Earth System Grid Federation (ESGF) for producing and providing the model outputs.</p>
    <p><a href="https://github.com/IPCC-WG1/Atlas/blob/${data.commit}/LICENSE.md">CC BY 4.0 / CMIP6 terms of use ↗</a> · <a href="./assets/echarts-license.txt">Apache ECharts: Apache-2.0</a> · <a href="./assets/zrender-license.txt">zrender: BSD-3-Clause</a></p></section></div><p class="meta">${t("snapshot")}</p>`;
}

async function europeOverview() {
  const cs = language === "cs";
  content.innerHTML = `${pageHeading(cs ? "Evropa — oddělené datové produkty" : "Europe — separate data products",
    cs ? "Lokální rozhraní a verzované API v1. Žádné spojování pozorování s modely."
      : "Local interface and versioned API v1. Observations and models are not spliced.")}
    <p><a href="${href("continents")}">${cs ? "Opravený kontinentální pohled · Evropa a dalších šest světadílů" : "Corrected continental view · Europe and six other continents"}</a></p>
    <p class="notice">${cs ? "Pouze vývojový náhled. Veřejná publikace není schválena. EU27 není fyzická Evropa a RCP nejsou totožné s SSP."
      : "Development preview only. Public release is not approved. EU27 is not physical Europe and RCPs are not identical to SSPs."}</p>
    <p id="europe-loading" role="status">${cs ? "Načítání katalogu…" : "Loading catalogue…"}</p>`;
  const panel = content.querySelector("#europe-loading");
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${europeApiBase}catalog.json`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Europe catalogue HTTP ${response.status}`);
    const catalog = await response.json();
    if (!validateEuropeCatalog(catalog)) throw new Error("Invalid European catalogue");
    if (!panel.isConnected) return;
    panel.outerHTML = `<div class="cards">${catalog.products.map((product) => `<section class="panel">
      <h2><a href="${href(product.route)}">${escape(product.title[language])}</a></h2>
      ${product.geography_warning ? `<p class="notice" role="alert" data-europe-geography-warning>${escape(product.geography_warning[language])}</p>` : ""}
      <p>${escape(product.geography[language])}</p><p>${escape(product.measure[language])}</p>
      <p>${escape(product.scope[language])}</p><p>${escape(product.interpretation[language])}</p>
      <p>Licence: ${escape(product.license ?? (cs ? "Dosud neověřena" : "Not yet verified"))}</p>
      <h3>${cs ? "Podmínky před publikací" : "Conditions before publication"}</h3>
      <ul>${product.publication_gates.map((gate) => `<li>${escape(gate[language])}</li>`).join("")}</ul>
      <details><summary>${cs ? "Datový kontrakt a integrita" : "Data contract and integrity"}</summary>
      <p>${escape(product.version)}</p><p>SHA-256: <code>${escape(product.sha256)}</code></p>
      <a href="${import.meta.env.BASE_URL}${product.endpoint}">API v1: ${escape(product.id)} (JSON)</a></details>
      </section>`).join("")}</div>
      <section class="panel"><h2>API v1</h2>
      <p>${cs ? "GET / HEAD, pouze loopback, bez parametrů, Cache-Control: no-store. Kontrola SHA-256 a datového kontraktu před každým odesláním produktu. Chybějící či změněná data: HTTP 503, nikoli náhradní hodnoty."
        : "GET / HEAD, loopback only, no query parameters, Cache-Control: no-store. SHA-256 and data contract checked before every product response. Missing or changed data: HTTP 503, not substitute values."}</p>
      <p><a href="${import.meta.env.BASE_URL}${europeApiBase}catalog.json">${cs ? "Katalog produktů (JSON)" : "Product catalogue (JSON)"}</a></p>
      <p>${cs ? "Katalog popisuje schválené identity a otevřené blokace; dostupnost konkrétního souboru ověřuje až jeho endpoint. Produkční PHP API ani aktuální release se nemění."
        : "The catalogue describes reviewed identities and open gates; each product endpoint verifies actual file availability. The production PHP API and current release are unchanged."}</p></section>`;
  } catch (error) {
    console.error("Europe catalogue:", error);
    if (panel.isConnected) {
      panel.innerHTML = `<p role="alert">${cs ? "Ověřený evropský katalog není dostupný." : "The verified European catalogue is unavailable."}</p>
        <button id="europe-retry">${cs ? "Zkusit znovu" : "Retry"}</button>`;
      panel.querySelector("#europe-retry").addEventListener("click", europeOverview);
    }
  }
}

async function europeHistory() {
  const cs = language === "cs";
  const title = cs ? "Evropa — historická analýza NASA" : "Europe — NASA historical analysis";
  content.innerHTML = `${pageHeading(title, cs
    ? "Pozorovací griddovaná analýza GISTEMP v4, nikoli modelová simulace či reanalýza. Reference 1981–2010."
    : "Observation-derived GISTEMP v4 gridded analysis, not a model simulation or reanalysis. Reference 1981–2010.")}
    <p class="notice" role="alert" data-europe-geography-warning>${escape(legacyEuropeGeographyWarning[language])}</p>
    <p><a href="${href("continents")}">${cs ? "Otevřít nový pohled s opravenou evropskou maskou" : "Open the new view with the corrected Europe mask"}</a></p>
    <p class="notice" role="status">${cs
      ? "Pouze lokální náhled. Platné celé roky 1894–2025. Roky 1880–1893 mají nedostatečné pokrytí, rok 2026 je neúplný. Bez interpolace."
      : "Local preview only. Valid complete years: 1894–2025. Years 1880–1893 have insufficient coverage; 2026 is incomplete. No interpolation."}</p>
    <p id="history-loading" role="status">${cs ? "Načítání ověřené historie…" : "Loading verified history…"}</p>`;
  const panel = content.querySelector("#history-loading");
  const heading = content.firstElementChild;
  try {
    if (!historyPreview) {
      const response = await fetch(`${import.meta.env.BASE_URL}${europeApiBase}history.json`, { cache: "no-store" });
      if (!response.ok) throw new Error(`NASA history HTTP ${response.status}`);
      const payload = await response.json();
      if (!validateHistoryPreview(payload)) throw new Error("Invalid NASA history payload");
      historyPreview = payload;
    }
    if (!panel.isConnected) return;
    const reasons = {
      "insufficient-spatial-coverage": cs ? "Nedostatečné prostorové pokrytí" : "Insufficient spatial coverage",
      "incomplete-source-year": cs ? "Neúplný zdrojový rok" : "Incomplete source year",
    };
    panel.outerHTML = `<section class="panel chart-panel">
      <h2>${cs ? "Roční anomálie (°C)" : "Annual anomalies (°C)"}</h2>
      <p>${cs ? "1880–2026: 147 pozic, 132 hodnot, 15 mezer. Září 2026 je poslední dostupný měsíc, nikoli celý rok."
        : "1880–2026: 147 positions, 132 values, 15 gaps. September 2026 is the last source month, not a complete year."}</p>
      <div id="history-chart" class="chart" role="img"></div>
      </section>${chartEducation("europe-history", language)}
      <section class="panel explain"><details><summary>${t("table")}</summary><div id="history-table"></div></details></section>
      <section class="panel chart-panel"><h2>${cs ? "Minimální měsíční pokrytí v roce" : "Minimum monthly coverage per year"}</h2>
      <p>${cs ? "Práh 90 % je pravidlo pilotu, nikoli standard NASA/WMO. Minimum se počítá pouze z přítomných měsíců; nadprahové pokrytí nedoplňuje chybějící měsíce roku 2026."
        : "The 90% threshold is a pilot rule, not a NASA/WMO standard. The minimum uses present months only; coverage above threshold does not replace missing months in 2026."}</p>
      <div id="history-coverage-chart" class="chart" role="img"></div></section>
      ${chartEducation("europe-coverage", language)}
      <section class="panel"><h2>${t("method")}</h2>
      <p>${cs ? "Vlastní fyzická maska Evropy, nikoli EU27. Plošný průměr dostupných hodnot, délka měsíců dle zdrojového kalendáře, všech 12 měsíců povinných. Skalární regionální reference 1981–2010. Jde o anomálie: neodečítá se 273,15."
        : "Custom physical Europe mask, not EU27. Area-weighted available-value means, source-calendar month durations, all 12 months required. Scalar regional 1981–2010 reference. These are anomalies: do not subtract 273.15."}</p>
      <p>${cs ? "Producent používá vyhlazení 250 km; nejde o syrové stanice. Dostupná plocha se v čase mění. Pokrytí není hustota stanic ani interval nejistoty. Žádné observační pásmo nejistoty nebylo odvozeno."
        : "The producer applies 250km smoothing; these are not raw station records. Available area varies with time. Coverage is neither station density nor an uncertainty interval. No observational uncertainty band was derived."}</p>
      <p>${cs ? "NASA historie se nespojuje s modely ani nevyplňuje reanalýzou. Stejná maska neznamená stejné prostorové vzorkování jako CMIP6."
        : "NASA history is not joined to models or filled with reanalysis. A shared mask does not imply identical spatial sampling to CMIP6."}</p>
      <p><a href="${href("europe-cmip6")}">${cs ? "Samostatné modelové porovnání CMIP6" : "Separate CMIP6 model comparison"}</a> ·
      <a href="${href("europe-pilot")}">${cs ? "Samostatný CDS EU27 pilot" : "Separate CDS EU27 preview"}</a></p>
      <p>${escape(historyPreview.attribution)}</p>
      <p class="notice">${cs ? "Před veřejným vydáním ověřit oficiální podmínky použití a citace NASA. Licence CMIP6 ani CDS se na tento zdroj automaticky nepřenáší."
        : "Official NASA product-use and citation terms require verification before public release. CMIP6 and CDS licences are not inherited by this source."}</p>
      <p><a href="https://data.giss.nasa.gov/gistemp/data_v4.html">NASA GISTEMP v4</a></p>
      <details><summary>${t("source")}</summary><p>${escape(historyPreview.version)} · ${escape(historyPreview.mask.version)}</p>
      <p>${cs ? "Zdrojové období" : "Source period"}: ${escape(historyPreview.source_period.first_month)}–${escape(historyPreview.source_period.last_month)} · ${escape(historyPreview.calendar)}</p>
      <p>SHA-256 source: <code>${escape(historyPreview.source.sha256)}</code><br>
      SHA-256 mask: <code>${escape(historyPreview.mask.sha256)}</code><br>
      SHA-256 audit: <code>${escape(historyPreview.provenance.audit_sha256)}</code></p></details></section>`;
    chart(content.querySelector("#history-chart"), historyPreview.annual, {
      name: title, unit: "°C", color: "#73e5d1",
    });
    const coveragePoints = historyPreview.annual.map((point) => ({
      date: point.date, value: point.minimum_monthly_coverage * 100,
    }));
    chart(content.querySelector("#history-coverage-chart"), [], {
      name: cs ? "Pokrytí dostupných měsíců" : "Coverage of present months", unit: "%",
      lines: [
        { name: cs ? "Minimum pokrytí" : "Minimum coverage", points: coveragePoints, color: "#73e5d1" },
        { name: cs ? "Práh 90 %" : "90% threshold", color: "#e89cb9",
          points: coveragePoints.map((point) => ({ date: point.date, value: 90 })) },
      ],
    });
    tablePage = 0;
    renderTable(content.querySelector("#history-table"), historyPreview.annual.map((point) => ({
      ...point, coverage: `${format(point.minimum_monthly_coverage * 100)} %`,
      validity: point.status === "valid" ? (cs ? "Platný" : "Valid")
        : point.missing_reasons.map((reason) => reasons[reason]).join("; "),
      absent: point.absent_source_months.join(", ") || "—",
      below: point.below_coverage_months.join(", ") || "—",
    })), title, [
      { key: "coverage", label: cs ? "Min. pokrytí" : "Min. coverage" },
      { key: "validity", label: cs ? "Stav / důvod" : "Status / reason" },
      { key: "source_months", label: cs ? "Počet měsíců" : "Month count" },
      { key: "absent", label: cs ? "Chybějící měsíce" : "Absent months" },
      { key: "below", label: cs ? "Měsíce pod prahem" : "Below-threshold months" },
    ], `${t("value")} (°C)`);
  } catch (error) {
    console.error("Weather Global NASA history:", error);
    if (!heading.isConnected) return;
    content.innerHTML = `${pageHeading(title, "")}<p role="alert">${cs
      ? "Ověřená historie NASA není dostupná. Zkontrolujte lokální artefakt."
      : "Verified NASA history unavailable. Check the local artifact."}</p>
      <button id="history-retry" type="button">${t("retry")}</button>`;
    content.querySelector("#history-retry").onclick = europeHistory;
  }
}

async function europeCmip6() {
  const cs = language === "cs";
  const title = cs ? "Evropa CMIP6 — dva modely" : "Europe CMIP6 — two models";
  content.innerHTML = `${pageHeading(title, cs
    ? "Vlastní fyzická maska Evropy, nikoli EU27. Anomálie vůči 1981–2010."
    : "Custom physical Europe mask, not EU27. Anomalies relative to 1981–2010.")}
    <p class="notice" role="alert" data-europe-geography-warning>${escape(legacyEuropeGeographyWarning[language])}</p>
    <p><a href="${href("continents")}">${cs ? "Otevřít nový pohled s opravenou evropskou maskou" : "Open the new view with the corrected Europe mask"}</a></p>
    <p class="notice" role="status">${cs
      ? "Lokální technické porovnání. Min–max dvou modelů není interval spolehlivosti, pravděpodobnost ani hranice budoucího vývoje."
      : "Local technical comparison. Two-model min–max is not a confidence interval, probability or bound on future outcomes."}</p>
    <p id="cmip6-loading" role="status">${cs ? "Načítání ověřených dat…" : "Loading verified data…"}</p>`;
  const panel = content.querySelector("#cmip6-loading");
  const heading = content.firstElementChild;
  try {
    if (!cmip6Preview) {
      const response = await fetch(`${import.meta.env.BASE_URL}${europeApiBase}cmip6.json`, { cache: "no-store" });
      if (!response.ok) throw new Error(`CMIP6 preview HTTP ${response.status}`);
      const payload = await response.json();
      if (!validateCmip6Preview(payload)) throw new Error("Invalid CMIP6 preview payload");
      cmip6Preview = payload;
    }
    if (!panel.isConnected) return;
    const labels = {
      historical: cs ? "Modelová historie 1850–2014" : "Modelled history 1850–2014",
      ssp126: "SSP1-2.6", ssp245: "SSP2-4.5", ssp370: "SSP3-7.0", ssp585: "SSP5-8.5",
    };
    panel.outerHTML = `<section class="panel chart-panel">
      <label>${t("scenario")}<select id="cmip6-experiment">${pairExperiments.map((id) =>
        `<option value="${id}">${labels[id]}</option>`).join("")}</select></label>
      <label><input id="cmip6-range" type="checkbox" checked> ${cs ? "Zobrazit min–max dvou modelů" : "Show two-model min–max"}</label>
      <p id="cmip6-period"></p>
      <div id="cmip6-chart" class="chart" role="img"></div>
      </section>${chartEducation("europe-cmip6", language)}
      <section class="panel explain"><details><summary>${t("table")}</summary><div id="cmip6-table"></div></details></section>
      <section class="panel"><h2>${t("method")}</h2>
      <p>${cs
        ? "Každý model má vlastní historickou základnu 1981–2010. Měsíce jsou váženy počtem dní zdrojového kalendáře; vyžadováno všech 12 měsíců. ACCESS používá proleptický gregoriánský kalendář, CanESM5 365denní. Porovnáváme roky, nikoli přepočtené denní osy."
        : "Each model has its own historical 1981–2010 baseline. Months are weighted by source-calendar duration; all 12 months are required. ACCESS uses proleptic Gregorian, CanESM5 a 365-day calendar. Calendar-year labels are aligned, not resampled daily axes."}</p>
      <p>${cs
        ? "Historie je simulace, nikoli pozorování. Bez propojení s NASA, ERA5 či CDS/RCP. Dva modely a jedna realizace každého nejsou reprezentativní ani nezávislý vzorek. Pobřežní masky a rozlišení se liší."
        : "History is simulated, not observed. No joining with NASA, ERA5 or CDS/RCP. Two models and one realization each are not a representative or independent sample. Coastal masks and resolutions differ."}</p>
      <p>${escape(cmip6Preview.attribution)}</p>
      <p><a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a> · <a href="${href("europe-pilot")}">${cs ? "Oddělený CDS EU27 pilot" : "Separate CDS EU27 preview"}</a> ·
      <a href="${href("europe-history")}">${cs ? "Samostatná historická analýza NASA" : "Separate NASA historical analysis"}</a></p>
      <p class="meta">${escape(cmip6Preview.version)} · ${escape(cmip6Preview.mask.version)}<br>SHA-256 mask: <code>${escape(cmip6Preview.mask.sha256)}</code><br>SHA-256 manifest: <code>${escape(cmip6Preview.manifest_sha256)}</code></p>
      <details><summary>${t("source")}</summary>${cmip6Preview.models.map((model) =>
        `<h3>${escape(model.source_id)} / ${escape(model.member)}</h3>
        <p>${escape(model.calendar)} · ${cs ? "Základna" : "Baseline"}: ${format(model.baseline_temperature_K, 6)} K · ${model.baseline_days} ${cs ? "dní" : "days"}</p>
        <p>${cs ? "Rozdíl vážené a geometrické plochy" : "Weighted vs geometric area difference"}: ${format(model.grid.relative_signed_coast_area_difference * 100)} %</p>
        <p>${escape(model.license_statement)}</p><ul>${model.sources.map((source) =>
          `<li>${escape(source.file)}<br>SHA-256: <code>${escape(source.sha256)}</code></li>`).join("")}</ul>`).join("")}</details></section>`;
    let instance;
    function update() {
      const id = content.querySelector("#cmip6-experiment").value;
      const rows = pairRows(cmip6Preview, id);
      const caption = `${title} / ${labels[id]}`;
      if (instance) {
        observer.unobserve(instance.getDom());
        charts = charts.filter((item) => item !== instance);
        instance.dispose();
      }
      content.querySelector("#cmip6-period").textContent =
        `${rows[0].date}–${rows.at(-1).date} · ${cs ? "°C anomálie, reference 1981–2010" : "°C anomaly, reference 1981–2010"}`;
      instance = chart(content.querySelector("#cmip6-chart"), [], {
        name: caption, unit: "°C", lines: cmip6Preview.models.map((model, index) => ({
          name: model.source_id, color: index ? "#e89cb9" : "#73e5d1",
          points: id === "historical" ? model.historical : model.scenarios[id],
        })),
        ranges: content.querySelector("#cmip6-range").checked
          ? [{ points: rows, color: "#b7a9e8", name: "Min–max (2 models)" }] : [],
      });
      tablePage = 0;
      renderTable(content.querySelector("#cmip6-table"), rows.map((row) => ({
        ...row, canesm: format(row.canesm), minimum: format(row.minimum), maximum: format(row.maximum),
      })), caption, [
        { key: "canesm", label: "CanESM5 (°C)" },
        { key: "minimum", label: "Min (°C)" }, { key: "maximum", label: "Max (°C)" },
      ], "ACCESS-CM2 (°C)");
    }
    content.querySelector("#cmip6-experiment").addEventListener("change", update);
    content.querySelector("#cmip6-range").addEventListener("change", update);
    update();
  } catch (error) {
    console.error("Weather Global CMIP6 preview:", error);
    if (!heading.isConnected) return;
    content.innerHTML = `${pageHeading(title, "")}<p role="alert">${cs
      ? "Ověřené CMIP6 porovnání není dostupné. Zkontrolujte lokální artefakt."
      : "Verified CMIP6 comparison unavailable. Check the local artifact."}</p>
      <button id="cmip6-retry" type="button">${t("retry")}</button>`;
    content.querySelector("#cmip6-retry").onclick = europeCmip6;
  }
}

async function europePilot() {
  const cs = language === "cs";
  const title = cs ? "EU27 — technický CDS pilot" : "EU27 — technical CDS preview";
  content.innerHTML = `${pageHeading(title, cs
    ? "Jednotlivé simulace, nikoli předpověď. EU27 není celý světadíl Evropa."
    : "Individual simulations, not a forecast. EU27 is not the physical continent Europe.")}
    <p class="notice" role="status">${cs
      ? "Pouze lokální náhled — metodika agregace čeká na upřesnění producenta. Bez anomálií a ensemble pásma."
      : "Local preview only — aggregation methodology awaits producer clarification. No anomalies or ensemble band."}</p>
    <p id="cds-loading" role="status">${cs ? "Načítání ověřeného pilotu…" : "Loading verified preview…"}</p>`;
  const panel = content.querySelector("#cds-loading");
  const heading = content.firstElementChild;
  try {
    if (!cdsPreview) {
      const response = await fetch(`${import.meta.env.BASE_URL}${europeApiBase}cds.json`, { cache: "no-store" });
      if (!response.ok) throw new Error(`CDS preview HTTP ${response.status}`);
      const payload = await response.json();
      if (!validateCdsPreview(payload)) throw new Error("Invalid CDS preview payload");
      cdsPreview = payload;
    }
    if (!panel.isConnected) return;
    panel.outerHTML = `<section class="panel chart-panel">
      <label>${t("model")}<select id="cds-member">${cdsPreview.members.map((member) =>
        `<option value="${escape(member.id)}">${escape(`${member.gcm} / ${member.rcm} / ${member.member}`)}</option>`).join("")}</select></label>
      <label>${t("scenario")}<select id="cds-scenario"><option value="rcp_4_5">RCP4.5</option><option value="rcp_8_5">RCP8.5</option></select></label>
      <p>${cs ? "Absolutní teplota (°C), 2006–2098. Pouze převod K − 273,15 a výběr let."
        : "Absolute temperature (°C), 2006–2098. Only K − 273.15 conversion and year selection."}</p>
      <div id="cds-chart" class="chart" role="img" aria-label="${escape(title)}"></div>
      </section>
      ${chartEducation("cds", language)}
      <section class="panel explain"><details><summary>${t("table")}</summary><div id="cds-table"></div></details></section>
      <section class="panel"><h2>${t("method")}</h2><p>${cs
        ? "Publikované regionální hodnoty jsou převzaty bez dalšího časového či prostorového průměrování. Roky před 2006 jsou vynechány, nikoli opraveny. Historické rozdíly RCP, přesné váhy a atribut time: point zůstávají nevyjasněné. Nejde o ERA5 ani CMIP6/SSP pilot vlastní masky."
        : "Published regional values are reused without additional temporal or spatial averaging. Years before 2006 are omitted, not corrected. Historical RCP differences, exact weights and time: point remain unresolved. This is neither ERA5 nor the custom-mask CMIP6/SSP pilot."}</p>
      <p>${escape(cdsPreview.attribution)}</p>
      <p><a href="https://cds.climate.copernicus.eu/datasets/sis-ecde-climate-indicators">Copernicus CDS ECDE v2.0</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></p>
      <p class="meta">${escape(cdsPreview.version)} · SHA-256 manifest: <code>${escape(cdsPreview.download_manifest_sha256)}</code></p>
      <p id="cds-source" class="meta"></p></section>`;
    let instance;
    function update() {
      const member = cdsPreview.members.find((item) => item.id === document.querySelector("#cds-member").value);
      const scenario = document.querySelector("#cds-scenario").value;
      if (!member || !cdsScenarios.includes(scenario)) throw new Error("Invalid CDS selection");
      if (instance) {
        observer.unobserve(instance.getDom());
        charts = charts.filter((item) => item !== instance);
        instance.dispose();
      }
      const points = member.scenarios[scenario];
      instance = chart(document.querySelector("#cds-chart"), points, {
        name: `${title} / ${scenario === "rcp_4_5" ? "RCP4.5" : "RCP8.5"}`,
        unit: "°C", color: scenario === "rcp_4_5" ? "#73e5d1" : "#e89cb9",
      });
      tablePage = 0;
      renderTable(document.querySelector("#cds-table"), points, title, [], `${t("value")} (°C)`);
      document.querySelector("#cds-source").textContent =
        `${member.sources[scenario].file} · SHA-256: ${member.sources[scenario].sha256}`;
    }
    document.querySelector("#cds-member").addEventListener("change", update);
    document.querySelector("#cds-scenario").addEventListener("change", update);
    update();
  } catch (error) {
    console.error("Weather Global CDS preview:", error);
    if (!heading.isConnected) return;
    content.innerHTML = `${pageHeading(title, "")}<p role="alert">${cs
      ? "Ověřený CDS pilot není dostupný. Zkontrolujte lokální datový artefakt."
      : "Verified CDS preview unavailable. Check the local data artifact."}</p>
      <button id="cds-retry" type="button">${t("retry")}</button>`;
    document.querySelector("#cds-retry").onclick = europePilot;
  }
}

async function continentsPreview() {
  const cs = language === "cs";
  const title = cs ? "Světadíly — opravený geografický pohled" : "Continents — corrected geographic view";
  const requestId = ++continentsRequestId;
  continentsRequest?.abort();
  const controller = new AbortController();
  continentsRequest = controller;
  content.innerHTML = `${pageHeading(title, cs
    ? "Oddělená pozorovací historie NASA a modelované simulace CMIP6. Opravená evropská maska, bez přepisování starých čísel."
    : "Separate NASA observational history and CMIP6 model simulations. Corrected Europe mask, without rewriting legacy values.")}
    <p class="notice">${cs
      ? "Ověřený datový pohled. Hodnoty a scénáře nejsou předpověď; blokované oblasti zůstávají bez dat."
      : "Verified data view. Values and scenarios are not forecasts; blocked regions remain without data."}</p>
    <p id="continents-loading" role="status">${cs ? "Načítání ověřeného katalogu a dat…" : "Loading verified catalogue and data…"}</p>`;
  const panel = content.querySelector("#continents-loading");
  const active = () => !controller.signal.aborted
    && requestId === continentsRequestId
    && readRoute(location.hash).view === "continents"
    && panel.isConnected;
  try {
    const catalogResponse = await fetch(
      `${import.meta.env.BASE_URL}${continentsApiBase}catalog.json`,
      { cache: "no-store", signal: controller.signal },
    );
    if (!catalogResponse.ok) throw new Error(`Continental catalogue HTTP ${catalogResponse.status}`);
    const catalog = await catalogResponse.json();
    if (!validateContinentsCatalog(catalog)) throw new Error("Invalid continental catalogue");
    const bundleResponse = await fetch(
      `${import.meta.env.BASE_URL}${catalog.product.endpoint}`,
      { cache: "no-store", signal: controller.signal },
    );
    if (!bundleResponse.ok) throw new Error(`Continental bundle HTTP ${bundleResponse.status}`);
    const bundle = await bundleResponse.json();
    if (!validateContinentalBundle(bundle)
      || bundle.version !== catalog.product.version
      || bundle.regions.some((region, index) => {
        const entry = catalog.regions[index];
        return region.id !== entry.id
          || region.status !== entry.status
          || region.name.cs !== entry.name.cs
          || region.name.en !== entry.name.en;
      })) throw new Error("Invalid continental bundle or catalogue identity");
    if (!active()) return;

    const textOf = (value) => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object" && typeof value[language] === "string") return value[language];
      return "";
    };
    const sourceName = (source) => textOf(source.name) || textOf(source.title)
      || textOf(source.provider) || source.id || source.source_id || (cs ? "Zdroj" : "Source");
    const regionName = (region) => region.name[language];
    const statusText = (status) => ({
      "validated-local": cs ? "Validováno" : "Validated",
      "blocked-grounding": cs ? "Blokováno: ověření uzemňovací linie" : "Blocked: grounding-line verification",
      provisional: cs ? "Předběžné" : "Provisional",
    })[status] ?? status;
    const methodText = (value) => {
      const localizedValue = textOf(value);
      if (localizedValue) return localizedValue;
      if (typeof value === "string") return value;
      return JSON.stringify(value, null, 2);
    };
    const scenarioNames = {
      historical: cs ? "Modelovaná historie (1850–2014)" : "Modelled history (1850–2014)",
      ssp126: "SSP1-2.6",
      ssp245: "SSP2-4.5",
      ssp370: "SSP3-7.0",
      ssp585: "SSP5-8.5",
    };
    const selectedRegion = () => bundle.regions.find((region) =>
      region.id === content.querySelector("#continents-region").value);
    const selectedRows = (region, product, scenario, modelId) => {
      if (!region || region.status === "blocked-grounding") return [];
      if (product === "nasa") return region.history?.annual ?? [];
      const model = region.models.find((item) => item.source_id === modelId);
      if (!model) return [];
      return scenario === "historical" ? model.historical : model.scenarios[scenario];
    };
    const sourceList = (sources) => `<ul>${sources.map((source) => {
      const label = sourceName(source);
      const citation = source.citation ? ` · ${source.citation}` : "";
      const url = typeof source.url === "string" && /^https:\/\//i.test(source.url)
        ? `<a href="${escape(source.url)}" target="_blank" rel="noreferrer">${cs ? "Otevřít zdroj" : "Open source"} ↗</a>` : "";
      return `<li>${escape(label)}${escape(citation)} ${url}</li>`;
    }).join("")}</ul>`;
    const clearChart = (target) => {
      const instance = echarts.getInstanceByDom(target);
      if (instance) {
        observer?.unobserve(instance.getDom());
        charts = charts.filter((item) => item !== instance);
        instance.dispose();
      }
      target.replaceChildren();
    };

    panel.outerHTML = `<section class="panel chart-panel">
      <div class="controls">
        <label>${cs ? "Světadíl" : "Continent"}<select id="continents-region">${bundle.regions.map((region) =>
          `<option value="${escape(region.id)}">${escape(regionName(region))} — ${escape(statusText(region.status))}</option>`).join("")}</select></label>
        <label>${cs ? "Datový produkt" : "Data product"}<select id="continents-product">
          <option value="nasa">NASA GISTEMP · pozorovací historie</option>
          <option value="cmip6">CMIP6 · modelované simulace</option>
        </select></label>
        <label>${t("scenario")}<select id="continents-scenario">
          ${Object.entries(scenarioNames).map(([id, name]) => `<option value="${id}">${escape(name)}</option>`).join("")}
        </select></label>
        <label>${cs ? "Model" : "Model"}<select id="continents-model">
          ${continentModels.map((id) => `<option value="${id}">${id}</option>`).join("")}
        </select></label>
      </div>
      <p class="meta" id="continents-status"></p>
      <p id="continents-description"></p>
      <div id="continents-main-chart-wrap"><div id="continents-main-chart" class="chart" role="img"></div></div>
      ${chartExplanation("continent-time-series", language, [
        "Graf zobrazuje roční teplotní anomálii vybraného světadílu a zvoleného produktu. NASA je pozorovací griddovaná analýza; CMIP6 je modelová simulace. Reference 1981–2010 zůstává pro každý zdroj nebo model oddělená.",
        "The chart shows the annual temperature anomaly for the selected continent and product. NASA is an observation-derived gridded analysis; CMIP6 is a model simulation. The 1981–2010 reference remains separate for each source or model.",
      ], [
        [["Teplotní anomálie", "Temperature anomaly"], ["Rozdíl od referenční teploty; není to absolutní teplota ani místní počasí.", "Departure from a reference temperature; not absolute temperature or local weather."]],
        [["NASA / CMIP6", "NASA / CMIP6"], ["Pozorovací analýza a modelová simulace jsou odlišné typy dat a nespojují se do jedné řady.", "Observation-derived analysis and model simulation are different data types and are not joined into one series."]],
        [["Min–max", "Min–max"], ["Rozpětí pouze vybraných modelů; není to pravděpodobnostní interval ani reprezentativní vzorek.", "Spread of the selected models only; not a probability interval or representative sample."]],
      ])}
      <details open><summary>${t("table")}</summary><div id="continents-main-table"></div></details>
      <p class="meta" id="continents-history-source"></p>
    </section>
    <section class="panel chart-panel"><h2>${cs ? "Vícesvětadílové srovnání" : "Multi-continent comparison"}</h2>
      <p>${cs
        ? "Vyberte více oblastí. Srovnává se stejný produkt, model/scénář a jednotka. Chybějící hodnoty zůstávají prázdné; minimum a maximum se počítá pouze z konečných, časově zarovnaných hodnot. Rozpětí není pravděpodobnost ani interval nejistoty."
        : "Select multiple regions. The comparison keeps the same product, model/scenario and unit. Missing values remain empty; minimum and maximum use only finite, date-aligned values. The range is not a probability or uncertainty interval."}</p>
      <label style="display:block;max-width:100%">${cs ? "Srovnávané světadíly" : "Regions to compare"}<select id="continents-compare-regions" multiple size="7" aria-describedby="continents-compare-hint" style="display:block;width:100%;max-width:100%">
        ${bundle.regions.map((region) => `<option value="${escape(region.id)}">${escape(regionName(region))} — ${escape(statusText(region.status))}</option>`).join("")}
      </select></label>
      <p id="continents-compare-hint" class="meta">${cs ? "Použijte Ctrl/⌘ pro vícenásobný výběr." : "Use Ctrl/⌘ to select multiple regions."}</p>
      <p id="continents-compare-description"></p>
      <div id="continents-compare-chart" class="chart" role="img"></div>
      ${chartExplanation("continent-comparison-series", language, [
        "Srovnání překrývá roční anomálie vybraných světadílů pro stejné období, produkt, model nebo scénář a jednotku. Chybějící hodnoty zůstávají mezerami; rozpětí časově zarovnaných hodnot není globální průměr.",
        "The comparison overlays annual anomalies for selected continents over the same period, product, model or scenario, and unit. Missing values remain gaps; the range of date-aligned values is not a global mean.",
      ], [
        [["Srovnávané světadíly", "Compared continents"], ["Každá čára představuje samostatnou oblast a její plošně agregovanou řadu.", "Each line represents a separate region and its area-aggregated series."]],
        [["Společný výběr", "Matched selection"], ["Produkt, model, scénář a jednotka jsou pro vybrané světadíly zachovány stejné.", "Product, model, scenario and unit are kept consistent across selected continents."]],
        [["Chybějící hodnota", "Missing value"], ["Nedostupná řada pro daný rok; není interpolována ani nahrazena nulou.", "An unavailable value for that year; it is neither interpolated nor replaced with zero."]],
      ])}
      <details><summary>${t("table")}</summary><div id="continents-compare-table"></div></details>
    </section>
    <section class="panel"><h2>${cs ? "Metodika a omezení" : "Methods and limitations"}</h2>
      <p>${cs ? "Jednotka: °C anomálie vůči období 1981–2010; pro každý model je zachována jeho vlastní historická reference. Roční pozorovací historie NASA a modelované řady jsou samostatné a nikdy se nespojují."
        : "Unit: °C anomaly relative to 1981–2010; each model keeps its own historical reference. NASA observational history and modelled series remain separate and are never spliced."}</p>
      <p>${cs ? "Roční hodnota NASA je platná pouze při 12 zdrojových měsících a minimálním měsíčním pokrytí ≥ 90 %. Nízké pokrytí, chybějící měsíce a chybějící základna jsou zobrazeny jako mezery s důvodem, bez interpolace."
        : "A NASA annual value is valid only with 12 source months and minimum monthly coverage ≥ 90%. Low coverage, absent months and a missing baseline remain explicit gaps with reasons; there is no interpolation."}</p>
      <p>${cs ? "Modelové řady vyžadují roční pokrytí ≥ 90 %. Min–max dvou modelů je pouze popisný rozsah těchto dvou vybraných modelů, nikoli pravděpodobnostní interval ani reprezentativní vzorek."
        : "Model series require annual coverage ≥ 90%. The two-model min–max is only a descriptive range of these two selected models, not a probability interval or representative sample."}</p>
      <div id="continents-method-detail"></div>
      <p>${cs ? "Opravená Evropa používá novou masku a samostatný datový balíček. Čísla ve starých stránkách NASA/CMIP6 zůstávají historickým, geograficky nevalidovaným náhledem a nejsou přejmenována na nová data."
        : "Corrected Europe uses a new mask and separate bundle. Numbers on the legacy NASA/CMIP6 pages remain historical, geographically invalid previews and are not relabelled as new data."}</p>
      <p>${cs ? "Veřejné balení je schváleno; datové a metodické blokátory jednotlivých produktů zůstávají zachovány."
        : "Public packaging is approved; individual data and methodological blockers remain in force."}</p>
    </section>
    <section class="panel"><h2>${cs ? "Slovníček" : "Glossary"}</h2><dl>
      <dt>${cs ? "Anomálie" : "Anomaly"}</dt><dd>${cs ? "Odchylka od referenčního průměru; nejde o absolutní teplotu." : "Difference from a reference mean; not an absolute temperature."}</dd>
      <dt>GISTEMP</dt><dd>${cs ? "Pozorovací griddovaná analýza teploty NASA; nejde o modelovou simulaci." : "NASA observation-derived gridded temperature analysis; not a model simulation."}</dd>
      <dt>CMIP6</dt><dd>${cs ? "Soubor klimatických modelových simulací. Scénáře jsou podmíněné experimenty." : "A collection of climate-model simulations. Scenarios are conditional experiments."}</dd>
      <dt>${cs ? "Pokrytí" : "Coverage"}</dt><dd>${cs ? "Podíl dostupné plošné podpory podle daného produktu, nikoli nejistota ani hustota stanic." : "Share of available area support under the product definition; not uncertainty or station density."}</dd>
      <dt>SSP</dt><dd>${cs ? "Sdílená socioekonomická trajektorie; označení experimentu není předpověď." : "Shared socioeconomic pathway; an experiment label, not a forecast."}</dd>
    </dl></section>
    <section class="panel"><h2>${cs ? "Zdroje, audit a publikační brány" : "Sources, audit and publication gates"}</h2>
      <p>${cs ? "Verze katalogu" : "Catalogue version"}: <code>${escape(catalog.version)}</code> · ${cs ? "produkt" : "product"}: <code>${escape(catalog.product.version)}</code></p>
      <p>SHA-256: <code>${escape(catalog.product.sha256)}</code> · ${cs ? "bajtů" : "bytes"}: ${catalog.product.bytes}</p>
      ${sourceList(bundle.sources)}
      <details><summary>${cs ? "Kontrola původu dat" : "Source review"}</summary><pre>${escape(methodText(bundle.source_review))}</pre></details>
      <details><summary>${cs ? "Historické srovnání Evropy" : "Legacy Europe comparison"}</summary><pre>${escape(methodText(bundle.legacy_comparison.europe ?? bundle.legacy_comparison))}</pre></details>
      <h3>${cs ? "Zachovaná omezení a podmínky použití" : "Retained limitations and use conditions"}</h3>
      <ul>${catalog.gates.map((gate) => `<li>${escape(gate[language])}</li>`).join("")}</ul>
    </section>`;

    const regionSelect = content.querySelector("#continents-region");
    const productSelect = content.querySelector("#continents-product");
    const scenarioSelect = content.querySelector("#continents-scenario");
    const modelSelect = content.querySelector("#continents-model");
    const compareSelect = content.querySelector("#continents-compare-regions");
    regionSelect.value = "europe";
    for (const id of ["europe", "asia"]) {
      const option = [...compareSelect.options].find((item) => item.value === id);
      if (option) option.selected = true;
    }

    function drawMain() {
      const region = selectedRegion();
      const product = productSelect.value;
      const scenario = scenarioSelect.value;
      const modelId = modelSelect.value;
      const chartWrap = content.querySelector("#continents-main-chart-wrap");
      const status = content.querySelector("#continents-status");
      const chartTarget = content.querySelector("#continents-main-chart");
      const tableTarget = content.querySelector("#continents-main-table");
      const description = content.querySelector("#continents-description");
      const historySource = content.querySelector("#continents-history-source");
      const sourceNames = bundle.sources.map(sourceName).join(", ");
      clearChart(chartTarget);
      chartWrap.hidden = false;
      if (region.status === "blocked-grounding") {
        chartWrap.hidden = true;
        status.textContent = `${regionName(region)} — ${statusText(region.status)}. ${region.limitations[language].join(" ")}`;
        description.textContent = cs
          ? "Teplotní řada není zobrazena, dokud nebude ověřeno uzemnění masky a dokončena nezávislá validace."
          : "No temperature series is shown until mask grounding is verified and independent validation is complete.";
        tableTarget.innerHTML = "";
        historySource.textContent = "";
        return;
      }

      const rows = selectedRows(region, product, scenario, modelId);
      const history = region.history;
      const historyProduct = history?.source?.product || history?.source?.provider || (cs ? "Neznámý NASA produkt" : "Unknown NASA product");
      const titleText = `${regionName(region)} · ${product === "nasa" ? historyProduct : `CMIP6 ${modelId} / ${scenarioNames[scenario]}`}`;
      status.textContent = `${statusText(region.status)} · ${t("reference")}: 1981–2010 · °C anomaly`;
      description.textContent = product === "nasa"
        ? (cs
          ? `Roční pozorovací analýza ${historyProduct} pro ${regionName(region)}. Platná hodnota vyžaduje všech 12 zdrojových měsíců a pokrytí ≥ 90 %; chybějící hodnoty nejsou doplňovány. Stav historie: ${history?.status ?? "nedostupná"}.${history?.status === "blocked-incomplete-baseline" ? " Referenční základna je neúplná; všechna léta zůstávají nedostupná, bez nulových náhrad." : ""} Zdroj: ${historyProduct}; katalogové zdroje: ${sourceNames}.`
          : `Annual observation-derived ${historyProduct} for ${regionName(region)}. A valid value requires all 12 source months and ≥ 90% coverage; missing values are not filled. History status: ${history?.status ?? "unavailable"}.${history?.status === "blocked-incomplete-baseline" ? " The reference baseline is incomplete; all years remain unavailable, with no zero substitution." : ""} Source: ${historyProduct}; catalogue sources: ${sourceNames}.`)
        : (cs
          ? `Modelová simulace CMIP6 ${modelId}, ${scenarioNames[scenario]}, ${regionName(region)}. Modelovaná historie i scénář jsou simulace, nikoli pozorování; vlastní modelová reference 1981–2010. Zdroj: ${sourceNames}.`
          : `CMIP6 ${modelId} model simulation, ${scenarioNames[scenario]}, ${regionName(region)}. Historical and scenario segments are simulations, not observations; the model's own 1981–2010 baseline is retained. Sources: ${sourceNames}.`);

      if (product === "nasa") {
        const finitePoints = rows.filter((row) => row.value !== null);
        if (finitePoints.length) chart(chartTarget, finitePoints.map((row) => ({ date: row.date, value: row.value })), {
          name: titleText, unit: "°C", color: "#73e5d1",
        });
        else {
          chartWrap.hidden = true;
          status.textContent += history.status === "blocked-incomplete-baseline"
            ? ` · ${cs ? "Historie zablokována: neúplná referenční základna 1981–2010; žádné teploty se nevykreslují." : "History blocked: incomplete 1981–2010 reference baseline; no temperatures are plotted."}`
            : ` · ${cs ? "Žádné platné hodnoty; žádné teploty se nevykreslují." : "No valid values; no temperatures are plotted."}`;
        }
        tablePage = 0;
        renderTable(tableTarget, rows.map((row) => ({
          ...row,
          value: format(row.value),
          coverageLabel: `${format(row.minimum_monthly_coverage * 100)} %`,
          reason: row.missing_reasons.map((item) => String(item)).join("; ") || (row.status === "valid" ? (cs ? "Platný" : "Valid") : (cs ? "Chybí" : "Missing")),
          absent: row.absent_source_months.join(", ") || "—",
          below: row.below_coverage_months.join(", ") || "—",
        })), titleText, [
          { key: "coverageLabel", label: cs ? "Min. pokrytí" : "Min. coverage" },
          { key: "source_months", label: cs ? "Zdrojové měsíce" : "Source months" },
          { key: "reason", label: cs ? "Stav / důvod mezery" : "Status / gap reason" },
          { key: "absent", label: cs ? "Chybějící měsíce" : "Absent months" },
          { key: "below", label: cs ? "Měsíce pod prahem" : "Below-threshold months" },
        ], `${t("value")} (°C)`, (row) => escape(row.value));
        historySource.textContent = `${cs ? "Pozorovací produkt" : "Observation product"}: ${historyProduct} · ${cs ? "stav historie" : "history status"}: ${history.status} · ${cs ? "reference offset" : "reference offset"}: ${history.baseline_offset_K === null ? (cs ? "nedostupný" : "unavailable") : `${format(history.baseline_offset_K, 6)} K`} · ${cs ? "měsíční pokrytí není nejistota" : "monthly coverage is not uncertainty"}`;
      } else {
        const model = region.models.find((item) => item.source_id === modelId);
        const rangeRows = scenario === "historical" ? region.range.historical : region.range.scenarios[scenario];
        const byDate = new Map(rangeRows.map((row) => [row.date, row]));
        chart(chartTarget, rows.map((row) => ({ date: row.date, value: row.value })), {
          name: `${modelId} · ${scenarioNames[scenario]}`,
          unit: "°C",
          color: modelId === "ACCESS-CM2" ? "#73e5d1" : "#e89cb9",
          ranges: [{ name: cs ? "Popisné min–max (2 modely)" : "Descriptive min–max (2 models)", color: "#b7a9e8",
            points: rangeRows.map((row) => ({ date: row.date, minimum: row.min, maximum: row.max })) }],
        });
        const merged = rows.map((row) => ({
          ...row,
          value: format(row.value),
          coverageLabel: `${format(row.coverage * 100)} %`,
          minimum: format(byDate.get(row.date)?.min ?? null),
          maximum: format(byDate.get(row.date)?.max ?? null),
        }));
        tablePage = 0;
        renderTable(tableTarget, merged, titleText, [
          { key: "coverageLabel", label: cs ? "Pokrytí modelu" : "Model coverage" },
          { key: "minimum", label: cs ? "Min (2 modely)" : "Min (2 models)" },
          { key: "maximum", label: cs ? "Max (2 modely)" : "Max (2 models)" },
        ], `${modelId} (°C)`, (row) => escape(row.value));
        historySource.textContent = `${modelId} / ${model.member} · ${model.calendar} · ${cs ? "modelová reference" : "model baseline"}: ${format(model.baseline_temperature_K, 6)} K / ${model.baseline_days} ${cs ? "dní" : "days"} · ${cs ? "plocha masky" : "mask area"}: ${format(model.grid.weighted_area_m2, 0)} m²`;
      }
    }

    function drawComparison() {
      const product = productSelect.value;
      const scenario = scenarioSelect.value;
      const modelId = modelSelect.value;
      const ids = [...compareSelect.selectedOptions].map((option) => option.value);
      const regions = ids.map((id) => bundle.regions.find((region) => region.id === id));
      const rowsByRegion = regions.map((region) => selectedRows(region, product, scenario, modelId));
      const dateSet = new Set(rowsByRegion.flatMap((rows) => rows.map((row) => row.date)));
      const dates = [...dateSet].sort();
      const joined = dates.map((date) => {
        const values = rowsByRegion.map((rows) => rows.find((row) => row.date === date)?.value ?? null);
        const finiteValues = values.filter((value) => typeof value === "number" && Number.isFinite(value));
        return {
          date,
          value: finiteValues.length ? `${format(Math.min(...finiteValues))}–${format(Math.max(...finiteValues))}` : (cs ? "bez platné hodnoty" : "no valid value"),
          minimum: finiteValues.length ? format(Math.min(...finiteValues)) : t("missing"),
          maximum: finiteValues.length ? format(Math.max(...finiteValues)) : t("missing"),
          ...Object.fromEntries(regions.map((region, index) => [
            region.id,
            values[index] === null ? t("missing") : format(values[index]),
          ])),
        };
      });
      const caption = `${cs ? "Srovnání" : "Comparison"} · ${product === "nasa" ? "NASA GISTEMP" : `CMIP6 ${modelId} / ${scenarioNames[scenario]}`}`;
      const lines = regions.filter((region, index) => region.status !== "blocked-grounding"
        && rowsByRegion[index].some((row) => row.value !== null)).map((region, index) => ({
        name: product === "nasa"
          ? `${regionName(region)} · ${region.history?.source?.product || region.history?.source?.provider || (cs ? "Zdroj nedostupný" : "Source unavailable")}`
          : `${regionName(region)} · ${region.models.find((item) => item.source_id === modelId)?.source_id ?? modelId}`,
        color: ["#73e5d1", "#e89cb9", "#efcf80", "#8abaff", "#b7a9e8", "#f0a36f", "#a9d887"][index % 7],
        points: rowsByRegion[index].map((row) => ({ date: row.date, value: row.value })),
      }));
      const target = content.querySelector("#continents-compare-chart");
      clearChart(target);
      if (lines.length) chart(target, [], { name: caption, unit: "°C", lines });
      else target.innerHTML = `<p role="status">${cs ? "Ve vybraných regionech nejsou platné teplotní hodnoty pro tento produkt." : "No valid temperature values are available for the selected regions and product."}</p>`;
      content.querySelector("#continents-compare-description").textContent = cs
        ? `Čáry jsou vybrané regionální řady ve stejné jednotce a referenčním období. Zdroj podle regionu: ${regions.map((region) => `${regionName(region)} — ${product === "nasa" ? region.history?.source?.product || region.history?.source?.provider || "nedostupný zdroj" : modelId}`).join("; ")}. Tabulkové min–max se počítá pouze z konečných hodnot pro stejný rok; prázdná buňka znamená nedostupná data. Rozpětí je popisné, bez pravděpodobnostní interpretace.`
        : `Lines show selected regional series in the same unit and baseline. Source by region: ${regions.map((region) => `${regionName(region)} — ${product === "nasa" ? region.history?.source?.product || region.history?.source?.provider || "source unavailable" : modelId}`).join("; ")}. Tabular min–max uses only finite values for the same year; blank cells mean unavailable data. The range is descriptive and has no probability interpretation.`;
      tablePage = 0;
      renderTable(content.querySelector("#continents-compare-table"), joined, caption, [
        ...regions.map((region) => ({ key: region.id, label: `${regionName(region)} (°C)` })),
        { key: "minimum", label: cs ? "Minimum (°C)" : "Minimum (°C)" },
        { key: "maximum", label: cs ? "Maximum (°C)" : "Maximum (°C)" },
      ], cs ? "Roční min–max (°C)" : "Annual min–max (°C)", (row) => escape(row.value));
    }

    const methodTarget = content.querySelector("#continents-method-detail");
    methodTarget.innerHTML = `<details><summary>${cs ? "Metodika datového balíčku" : "Bundle methodology"}</summary><pre>${escape(methodText(bundle.method))}</pre></details>
      <details><summary>${cs ? "Masky a omezení jednotlivých světadílů" : "Regional masks and limitations"}</summary>
      ${bundle.regions.map((region) => `<h3>${escape(regionName(region))} · ${escape(statusText(region.status))}</h3>
        <p>${escape(region.mask.file)} · ${escape(region.mask.version)} · SHA-256: <code>${escape(region.mask.sha256)}</code> · ${format(region.mask.area_m2, 0)} m² · ${cs ? "uzemňovací linie" : "grounding line"}: ${region.mask.grounding_line_verified ? (cs ? "ověřena" : "verified") : (cs ? "neověřena" : "not verified")}</p>
        <ul>${region.limitations[language].map((item) => `<li>${escape(item)}</li>`).join("")}</ul>`).join("")}</details>`;
    productSelect.addEventListener("change", () => {
      const isNasa = productSelect.value === "nasa";
      scenarioSelect.disabled = isNasa;
      modelSelect.disabled = isNasa;
      drawMain();
      drawComparison();
    });
    scenarioSelect.addEventListener("change", () => { drawMain(); drawComparison(); });
    modelSelect.addEventListener("change", () => { drawMain(); drawComparison(); });
    regionSelect.addEventListener("change", drawMain);
    compareSelect.addEventListener("change", drawComparison);
    scenarioSelect.disabled = true;
    modelSelect.disabled = true;
    drawMain();
    drawComparison();
  } catch (error) {
    if (error.name === "AbortError" || !active()) return;
    console.error("Weather Global continental preview:", error);
    content.innerHTML = `${pageHeading(title, "")}<p role="alert">${cs
      ? "Ověřený kontinentální katalog nebo datový balíček není dostupný. Zkontrolujte lokální artefakty; nebudou použita zastaralá evropská data."
      : "The verified continental catalogue or bundle is unavailable. Check the local artifacts; stale European data will not be substituted."}</p>
      <button id="continents-retry" type="button">${t("retry")}</button>`;
    content.querySelector("#continents-retry").onclick = continentsPreview;
  }
}

const mobileNavigation = matchMedia("(max-width: 1100px)");
const menuToggle = document.querySelector("#menu-toggle");
const mainNavigation = document.querySelector("#navigation");

function setMenuOpen(open) {
  menuToggle.setAttribute("aria-expanded", String(open));
  mainNavigation.classList.toggle("is-open", open);
}

menuToggle.addEventListener("click", () => {
  setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
});
document.querySelector(".app-header").addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
    setMenuOpen(false);
    menuToggle.focus();
  }
});
mobileNavigation.addEventListener("change", () => {
  const activeElement = document.activeElement;
  const hadNavigationFocus = mainNavigation.contains(document.activeElement);
  setMenuOpen(false);
  if (mobileNavigation.matches && hadNavigationFocus) menuToggle.focus();
  else if (!mobileNavigation.matches) {
    if (activeElement === menuToggle) mainNavigation.querySelector("a")?.focus();
    else if (activeElement.closest(".nav-children")) {
      activeElement.closest(".nav-group").querySelector("a").focus();
    }
  }
});

function renderNavigation(current) {
  const cs = language === "cs";
  const sections = navigationSections(language, localCdsPreview);
  const activeSection = sectionForView(sections, current);
  mainNavigation.setAttribute("aria-label", t("navLabel"));
  menuToggle.textContent = "Menu";
  menuToggle.setAttribute("aria-label", cs ? "Hlavní menu" : "Main menu");
  setMenuOpen(false);
  const links = (items) => items.map((item) => {
    const detailParent = (current.startsWith("indicator/") && item.route === "history")
      || (current.startsWith("ocean/") && item.route === "oceans");
    return `<a href="${href(item.route)}"${current === item.route ? ' aria-current="page"' : detailParent ? ' aria-current="location"' : ""}>${escape(item.label)}</a>`;
  }).join("");
  mainNavigation.innerHTML = sections.map((section) =>
    `<div class="nav-group"><a href="${href(section.route)}"${activeSection === section ? ` aria-current="${current === section.route ? "page" : "location"}"` : ""}>${escape(section.label)}</a>
    ${section.links.length ? `<details class="nav-children"${activeSection === section ? " open" : ""}><summary aria-label="${escape(`${cs ? "Podstránky" : "Subpages"}: ${section.label}`)}">${cs ? "Podstránky" : "Subpages"}</summary><div>${links(section.links)}</div></details>` : ""}</div>`).join("");
  const secondary = document.querySelector("#section-navigation");
  const activePage = activeSection?.links.find((item) => item.route === current);
  secondary.innerHTML = activeSection && current !== "overview"
    ? `<nav class="breadcrumbs" aria-label="${cs ? "Navigační cesta" : "Breadcrumb"}"><a href="${href("overview")}">${escape(sections[0].label)}</a><span aria-hidden="true">/</span>${current !== activeSection.route ? `<a href="${href(activeSection.route)}">${escape(activeSection.label)}</a>` : `<span>${escape(activeSection.label)}</span>`}${activePage ? `<span aria-hidden="true">/</span><span>${escape(activePage.label)}</span>` : ""}</nav>
    ${activeSection.links.length ? `<nav class="section-nav" aria-label="${escape(`${cs ? "Sekce" : "Section"}: ${activeSection.label}`)}">${links(activeSection.links)}</nav>` : ""}`
    : "";
}

function render() {
  continentsRequest?.abort();
  continentsRequest = null;
  const { view, language: selectedLanguage } = readRoute(location.hash);
  language = selectedLanguage;
  document.documentElement.lang = language;
  document.querySelector("#data-status-banner").textContent = t("dataStatus");
  document.querySelector("#footer-copy").textContent = t("footer");
  const footerLink = document.querySelector("#footer-link");
  footerLink.textContent = t("nav")[5];
  footerLink.href = href("sources");
  document.querySelector(".skip-link").textContent =
    language === "cs" ? "Přejít na obsah" : "Skip to content";
  for (const button of document.querySelectorAll("[data-lang]"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.lang === language),
    );
  const current = view || "overview";
  renderNavigation(current);
  loading.hidden = true;
  document.querySelector(".brand").href = href("overview");
  for (const instance of charts) instance.dispose();
  charts = [];
  historyComparisonHandle?.dispose();
  historyComparisonHandle = null;
  seaIceHandle?.dispose();
  seaIceHandle = null;
  iceSheetsHandle?.dispose();
  iceSheetsHandle = null;
  snowCoverHandle?.dispose();
  snowCoverHandle = null;
  precipitationHandle?.dispose();
  precipitationHandle = null;
  droughtHandle?.dispose();
  droughtHandle = null;
  atmosphericGasesHandle?.dispose();
  atmosphericGasesHandle = null;
  carbonBudgetHandle?.dispose();
  carbonBudgetHandle = null;
  observer?.disconnect();
  observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.contentRect.width <= 0) continue;
      const direct = echarts.getInstanceByDom(entry.target);
      if (direct) {
        direct.resize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
          animation: { duration: 0 },
        });
      }
    }
  });
  tablePage = 0;
  if (!data && routeRequiresClimateSnapshot(current)) {
    const cs = language === "cs";
    content.innerHTML = `${pageHeading(t("requiredDataTitle"), "")}<section class="panel error">
      <p role="${climateLoadError ? "alert" : "status"}">${climateLoadError ? t("requiredDataFailure") : t("requiredDataLoading")}</p>
      ${climateLoadError ? `<button id="retry" type="button">${t("retry")}</button>` : ""}</section>`;
    if (climateLoadError) content.querySelector("#retry").onclick = load;
    document.title = `Weather Global — ${cs ? "Data nejsou dostupná" : "Data unavailable"}`;
    if (!climateLoadPending && !climateLoadError) void load();
    return;
  }
  if (current === "overview") overview();
  else if (current === "history") {
    content.innerHTML = `${pageHeading(t("nav")[1], t("detailIntro"))}<div class="cards">${Object.keys(indicators).map(card).join("")}</div><p class="notice">${t("sampleLimit")}</p>`;
    for (const id of Object.keys(indicators))
      chart(
        document.querySelector(`#spark-${id}`),
        data.series[id].filter(
          (point) => point.date >= "2016-01" && point.value !== null,
        ),
        { small: true, color: indicators[id].color },
      );
  } else if (
    current.startsWith("indicator/") &&
    indicators[current.split("/")[1]]
  )
    indicator(current.split("/")[1]);
  else if (current === "oceans") oceanOverview();
  else if (current === "ocean-future") oceanFuture();
  else if (current === "sea-ice") {
    seaIceHandle = mountSeaIce({
      content, language, baseUrl: import.meta.env.BASE_URL,
      isActive: () => readRoute(location.hash).view === "sea-ice",
    });
  }
  else if (current === "ice-sheets") {
    iceSheetsHandle = mountIceSheets({
      content, language, baseUrl: import.meta.env.BASE_URL,
      isActive: () => readRoute(location.hash).view === "ice-sheets",
    });
  }
  else if (current === "snow-cover") {
    snowCoverHandle = mountSnowCover({
      content, language, baseUrl: import.meta.env.BASE_URL,
      isActive: () => readRoute(location.hash).view === "snow-cover",
    });
  }
  else if (current === "precipitation") {
    precipitationHandle = mountPrecipitation({
      content, language, baseUrl: import.meta.env.BASE_URL,
      isActive: () => readRoute(location.hash).view === "precipitation",
    });
  }
  else if (current === "drought") {
    droughtHandle = mountDrought({
      content, language, baseUrl: import.meta.env.BASE_URL,
      isActive: () => readRoute(location.hash).view === "drought",
    });
  }
  else if (current === "atmospheric-gases") {
    atmosphericGasesHandle = mountAtmosphericGases({
      content, language, baseUrl: import.meta.env.BASE_URL,
      isActive: () => readRoute(location.hash).view === "atmospheric-gases",
    });
  }
  else if (current === "carbon-budget") {
    carbonBudgetHandle = mountCarbonBudget({
      content, language, baseUrl: import.meta.env.BASE_URL,
      isActive: () => readRoute(location.hash).view === "carbon-budget",
    });
  }
  else if (current === "europe" && localCdsPreview) europeOverview();
  else if (current === "europe-pilot" && localCdsPreview) europePilot();
  else if (current === "europe-cmip6" && localCdsPreview) europeCmip6();
  else if (current === "europe-history" && localCdsPreview) europeHistory();
  else if (current === "continents") continentsPreview();
  else if (current === "continental-history") {
    historyComparisonHandle = mountHistoryComparison({
      content,
      language,
      baseUrl: import.meta.env.BASE_URL,
      isActive: () => readRoute(location.hash).view === "continental-history",
    });
  }
  else if (
    current.startsWith("ocean/") &&
    oceanIndicators[current.split("/")[1]]
  )
    oceanDetail(current.split("/")[1]);
  else if (current === "compare") comparison();
  else if (current === "projections") projections();
  else if (current === "sources") sources();
  else if (current === "about")
    content.innerHTML = `${pageHeading(t("aboutTitle"), t("aboutText"))}<section class="panel"><h2>${t("dataStatus").split(" · ")[0]}</h2><p class="muted">${t("aboutScope")}</p><p class="meta">${t("snapshot")}</p></section>`;
  else
    content.innerHTML = `${pageHeading(t("noRoute"), "")}<a href="${href("overview")}">${t("back")}</a>`;
  document.title = `Weather Global — ${content.querySelector("h1")?.textContent ?? "Climate Atlas"}`;
  loading.hidden = true;
}

for (const button of document.querySelectorAll("[data-lang]")) {
  button.addEventListener("click", () => {
    location.hash = routeHref(
      readRoute(location.hash).view,
      button.dataset.lang,
    );
  });
}
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  document.querySelector("#main").focus();
});
window.addEventListener("hashchange", () => {
  render();
  document.querySelector("#main").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: motion.matches ? "instant" : "auto" });
});
function fitCharts() {
  for (const element of document.querySelectorAll(".chart")) {
    const instance = echarts.getInstanceByDom(element);
    if (!instance) continue;
    const { width, height } = element.getBoundingClientRect();
    if (
      width > 0 &&
      height > 0 &&
      (Math.round(width) !== instance.getWidth() ||
        Math.round(height) !== instance.getHeight())
    ) {
      instance.resize({
        width,
        height,
        animation: { duration: 0 },
      });
    }
  }
}
window.addEventListener("resize", fitCharts);
document.addEventListener("visibilitychange", fitCharts);

async function load() {
  if (climateLoadPending) return;
  climateLoadPending = true;
  climateLoadError = null;
  render();
  try {
    const response = await fetch(
      `${import.meta.env.BASE_URL}api.php?dataset=climate`,
      {
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) throw new Error(`Data HTTP ${response.status}`);
    const snapshot = await response.json();
    if (!validateClimateSnapshot(snapshot)) {
      throw new Error("Invalid climate API response");
    }
    data = snapshot;
  } catch (error) {
    console.error("Weather Global data API:", error);
    climateLoadError = error;
  } finally {
    climateLoadPending = false;
    render();
  }
}
render();
