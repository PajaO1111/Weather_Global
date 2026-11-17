async function openRain(page, language = "en") {
  await page.goto(`http://127.0.0.1:4174/weather_global/#precipitation?lang=${language}`);
  await page.locator("#rain-selection").waitFor({ state: "attached" });
}

export async function validatePrecipitationMatrix(page) {
  const results = [];
  for (const language of ["cs", "en"]) {
    await openRain(page, language);
    results.push(await page.evaluate(async language => {
      const bundle = await (await fetch("/weather_global/precipitation-api/v1/bundle.json")).json();
      const source = await (await fetch("/weather_global/src/precipitation-view.js")).text();
      const core = await import(source.match(/from ["']([^"']*echarts_core[^"']*)["']/)[1]);
      const select = name => document.querySelector(`#rain-${name}`);
      const form = document.querySelector("#rain-selection");
      const parse = text => Number(language === "en" ? text.replace(/,/g, "") : text.replace(/\s/g, "").replace(",", "."));
      const equal = (actual, expected, message, tolerance = .000003) => {
        if (expected === null) {
          if (!actual.startsWith("—")) throw new Error(message + ": missing value was filled");
        } else if (!Number.isFinite(parse(actual)) || Math.abs(parse(actual) - expected) > tolerance) throw new Error(message);
      };
      let selections = 0, tableRows = 0, chartPositions = 0, mapValues = 0, seasonalPositions = 0;
      for (const region of bundle.regions) {
        select("region").value = region.id;
        for (const period of ["annual", ...Array.from({ length: 12 }, (_, i) => String(i + 1))]) {
          select("period").value = period;
          const expected = period === "annual" ? region.annual : region.monthly.filter(p => Number(p.date.slice(5)) === Number(period));
          const ref = region.reference.find(p => p.period === period);
          for (const metric of ["value", "anomaly"]) {
            select("metric").value = metric; form.requestSubmit();
            const option = core.getInstanceByDom(document.querySelector("#rain-history-chart")).getOption();
            const series = option.series.find(s => s.id === "rain-values");
            if (JSON.stringify(series.data) !== JSON.stringify(expected.map(p => p[metric])) || series.connectNulls !== false) {
              throw new Error("Precipitation chart values/gaps differ");
            }
            const reference = option.series.find(s => s.id === "rain-reference");
            const referenceValue = ref.mean === null ? null : metric === "value" ? ref.mean : 0;
            if (reference.data.some(v => v !== referenceValue)) throw new Error("Precipitation reference plotted incorrectly");
            const season = core.getInstanceByDom(document.querySelector("#rain-season-chart")).getOption();
            for (const year of [2026, 2025]) {
              const points = Array.from({ length: 12 }, (_, i) => region.monthly.find(p => p.date === `${year}-${String(i + 1).padStart(2, "0")}`));
              const actual = season.series.find(s => s.id === `rain-season-${year}`);
              if (JSON.stringify(actual.data) !== JSON.stringify(points.map(p => p?.[metric] ?? null)) || actual.connectNulls !== false) {
                throw new Error("Seasonal precipitation gaps/values differ");
              }
              seasonalPositions += 12;
            }
            const map = core.getInstanceByDom(document.querySelector("#rain-map")).getOption();
            if (metric === "anomaly" && map.visualMap[0].min !== -map.visualMap[0].max) throw new Error("Anomaly map not zero-centred");
            const mapRows = [...document.querySelectorAll("#rain-comparison tbody tr")];
            for (const [i, other] of bundle.regions.entries()) {
              const point = (period === "annual" ? other.annual : other.monthly)
                .find(p => p.date === (period === "annual" ? "2025" : `2025-${String(period).padStart(2, "0")}`));
              const actual = map.series[0].data.find(p => p.name === other.id);
              if (actual.value !== point[metric]) throw new Error("Map data differ from regional value");
              if (mapRows[i].dataset.region !== other.id) throw new Error("Map comparison region shifted");
              equal(mapRows[i].cells[1].textContent, point[metric], "Map table metric mismatch");
              equal(mapRows[i].cells[2].textContent.replace("%", "").trim(), other.support_fraction * 100, "Map support mismatch");
              mapValues++;
            }
            selections++; chartPositions += series.data.length;
            if (metric === "anomaly") continue;
            const rows = [];
            while (true) {
              rows.push(...[...document.querySelectorAll("#rain-history-table tbody tr")].map(tr => [...tr.cells].map(cell => cell.textContent)));
              if (document.querySelector("#rain-next").disabled) break;
              if (rows.length > 136) throw new Error("Unbounded rain pagination");
              document.querySelector("#rain-next").click();
            }
            if (rows.length !== expected.length) throw new Error("Precipitation table dropped/duplicated records");
            for (const [i, cells] of rows.entries()) {
              const point = expected[i];
              if (cells[0] !== point.date) throw new Error("Precipitation table date shifted");
              equal(cells[1], point.value, "Table depth mismatch");
              equal(cells[2], point.anomaly, "Table departure mismatch");
              equal(cells[3], ref.mean, "Table reference mismatch");
              if (Number(cells[4]) !== ref.count) throw new Error("Table reference count differs");
              equal(cells[5].replace("%", "").trim(), point.station_fraction === null ? null : point.station_fraction * 100, "Table station fraction mismatch");
              equal(cells[6], point.distance_km, "Table distance mismatch");
            }
            tableRows += rows.length;
          }
        }
      }
      return { language, selections, tableRows, chartPositions, mapValues, seasonalPositions, allSevenRegions: true, exactNulls: true };
    }, language));
  }
  return results;
}

export async function validatePrecipitationControlsAndLayout(page) {
  await openRain(page);
  const controls = await page.evaluate(async () => {
    const form = document.querySelector("#rain-selection");
    const select = (name, value) => { document.querySelector(`#rain-${name}`).value = value; };
    const source = await (await fetch("/weather_global/src/precipitation-view.js")).text();
    const core = await import(source.match(/from ["']([^"']*echarts_core[^"']*)["']/)[1]);
    select("region", "europe"); select("period", "annual"); select("first", "2026"); select("last", "2026"); select("map-year", "2026"); form.requestSubmit();
    if (!document.querySelector("#rain-history-table tbody").textContent.includes("Incomplete source year")) throw new Error("2026 annual total filled");
    const map = core.getInstanceByDom(document.querySelector("#rain-map")).getOption();
    if (map.series[0].data.some(p => p.value !== null)) throw new Error("Partial annual map filled");
    select("period", "9"); form.requestSubmit();
    if (document.querySelectorAll("#rain-history-table tbody tr").length
      || !document.querySelector("#rain-history").textContent.includes("No source month")) throw new Error("Empty monthly period not explicit");
    const previous = document.querySelector("#rain-description").textContent;
    select("first", "2026"); select("last", "1891"); form.requestSubmit();
    if (document.querySelector("#rain-selection-error").hidden || document.querySelector("#rain-description").textContent !== previous) {
      throw new Error("Invalid range replaced valid charts");
    }
    select("first", "1891"); select("last", "2026"); select("period", "annual"); select("region", "antarctica"); form.requestSubmit();
    if (!document.querySelector("#rain-support").textContent.includes("100 %")
      || !document.querySelector("#rain-reference").textContent.includes("n=0/30")) throw new Error("Antarctic missing domain/reference not explicit");
    select("region", "europe"); select("year-a", "2026"); select("year-b", "2026"); form.requestSubmit();
    const season = core.getInstanceByDom(document.querySelector("#rain-season-chart")).getOption();
    if (season.series.length !== 2 || season.series[0].data.slice(8).some(v => v !== null)) throw new Error("Duplicate season/partial year changed");
    const main = document.querySelector("main").textContent;
    if (!main.includes("not available water or drought") && !main.includes("Precipitation is not available water or drought")) throw new Error("Water limitation absent");
    if (![...document.querySelectorAll("main .panel a")].some(a => a.hash === "#sources?lang=en")) throw new Error("Methods crosslink broken");
    return { partialAnnual: true, emptyMonth: true, invalidRange: true, antarcticNull: true, duplicateSeason: true, waterLimitation: true };
  });
  const widths = [];
  for (const language of ["cs", "en"]) {
    await openRain(page, language);
    for (const width of [320, 390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      widths.push(await page.evaluate(() => {
        if (document.hidden) window.dispatchEvent(new Event("resize"));
        if (document.documentElement.scrollWidth > innerWidth + 1) throw new Error("Rain page overflows");
        const charts = [...document.querySelectorAll("#rain-history-chart,#rain-season-chart,#rain-map")];
        if (charts.some(node => !node.querySelector("svg") || node.clientWidth <= 0)) throw new Error("Rain responsive SVG missing");
        return { width: innerWidth, charts: charts.length, hiddenDocument: document.hidden };
      }));
    }
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
  await page.locator(".topic-card").first().waitFor({ state: "attached" });
  const navigation = await page.evaluate(() => {
    const links = [...document.querySelectorAll('main a[href="#precipitation?lang=en"]')];
    if (!links.length || document.querySelectorAll("#navigation > .nav-group > a").length !== 6) throw new Error("Rain overview navigation missing");
    links[0].click(); return true;
  });
  await page.locator("#rain-selection").waitFor({ state: "attached" });
  await page.goto("http://127.0.0.1:4174/weather_global/#sources?lang=en");
  if (!(await page.locator('main a[href="#precipitation?lang=en"]').count())) throw new Error("Rain source card absent");
  return { controls, widths, navigation };
}

export async function validatePrecipitationFailuresAndLifecycle(page) {
  const pattern = "**/precipitation-api/v1/bundle.json";
  for (const fixture of [{ status: 503, body: "unavailable" }, { status: 200, body: "{}" }]) {
    const handler = route => route.fulfill({ ...fixture, contentType: "application/json" });
    await page.route(pattern, handler);
    try {
      await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
      await page.goto("http://127.0.0.1:4174/weather_global/#precipitation?lang=en");
      await page.locator("#rain-retry").waitFor({ state: "attached" });
      if (await page.locator("#rain-selection").count()) throw new Error("Error displayed success-shaped data");
    } finally { await page.unroute(pattern, handler); }
    await page.locator("#rain-retry").evaluate(button => button.click());
    await page.locator("#rain-selection").waitFor({ state: "attached" });
  }
  const disposed = await page.evaluate(async () => {
    const source = await (await fetch("/weather_global/src/precipitation-view.js")).text();
    const core = await import(source.match(/from ["']([^"']*echarts_core[^"']*)["']/)[1]);
    const old = ["rain-history-chart", "rain-season-chart", "rain-map"].map(id => core.getInstanceByDom(document.getElementById(id)));
    location.hash = "#overview?lang=en";
    await new Promise(resolve => setTimeout(resolve, 50));
    return old.every(chart => chart.isDisposed());
  });
  if (!disposed) throw new Error("Rain charts not disposed");
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const intercepted = new Promise(resolve => { started = resolve; });
  const handler = async route => { started(); await gate; await route.continue(); };
  await page.route(pattern, handler);
  try {
    await page.goto("http://127.0.0.1:4174/weather_global/#precipitation?lang=en");
    await intercepted;
    await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
    release(); await page.unroute(pattern, handler, { behavior: "wait" });
    if (await page.locator("#rain-selection,#rain-retry").count()) throw new Error("Late rain response replaced overview");
  } finally { release(); await page.unroute(pattern); }
  return { unavailable503: true, corrupt200: true, retry: true, disposal: true, lateAbort: true };
}

export async function validatePrecipitationBuiltCandidate(page, baseUrl) {
  const failures = [], track = response => { if (response.status() >= 400) failures.push({ url: response.url(), status: response.status() }); };
  page.on("response", track);
  try {
    await page.goto(`${baseUrl}#precipitation?lang=cs`);
    await page.locator("#rain-selection").waitFor({ state: "attached" });
    const result = await page.evaluate(async () => {
      const catalogResponse = await fetch("/weather_global/precipitation-api/v1/catalog.json");
      const bundleResponse = await fetch("/weather_global/precipitation-api/v1/bundle.json");
      const catalog = await catalogResponse.json(), bundle = await bundleResponse.json();
      const select = (name, value) => { document.querySelector(`#rain-${name}`).value = value; };
      select("region", "oceania"); select("period", "8"); select("first", "2026"); select("last", "2026");
      select("map-year", "2026"); document.querySelector("#rain-selection").requestSubmit();
      const row = [...document.querySelector("#rain-history-table tbody tr").cells].map(cell => cell.textContent);
      const expected = bundle.regions.find(r => r.id === "oceania").monthly.at(-1);
      const value = Number(row[1].replace(/\s/g, "").replace(",", "."));
      if (catalogResponse.status !== 200 || bundleResponse.status !== 200 || catalog.version !== bundle.version
        || document.querySelectorAll("#rain-history-chart svg,#rain-season-chart svg,#rain-map svg").length !== 3
        || row[0] !== "2026-08" || Math.abs(value - expected.value) > .000002) throw new Error("Compiled precipitation data/UI mismatch");
      return { catalogStatus: 200, bundleStatus: 200, regions: bundle.regions.length, compiledCharts: 3, exactLastMonth: true, version: bundle.version };
    });
    if (failures.length) throw new Error(`Built rain HTTP failures: ${JSON.stringify(failures)}`);
    return { ...result, builtCandidate: true, failedHttpRequests: 0 };
  } finally { page.off("response", track); }
}
