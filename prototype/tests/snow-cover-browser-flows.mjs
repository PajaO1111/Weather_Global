async function openSnow(page, language = "en") {
  await page.goto(`http://127.0.0.1:4174/weather_global/#snow-cover?lang=${language}`);
  await page.locator("#snow-selection").waitFor({ state: "attached" });
}

export async function validateSnowMatrix(page) {
  const results = [];
  for (const language of ["cs", "en"]) {
    await openSnow(page, language);
    results.push(await page.evaluate(async language => {
      const bundle = await (await fetch("/weather_global/snow-cover-api/v1/bundle.json")).json();
      const source = await (await fetch("/weather_global/src/snow-cover-view.js")).text();
      const core = await import(source.match(/from ["']([^"']*echarts_core[^"']*)["']/)[1]);
      const form = document.querySelector("#snow-selection");
      const selected = id => document.querySelector(`#snow-${id}`);
      const parse = text => Number(language === "en" ? text.replace(/,/g, "") : text.replace(/\s/g, "").replace(",", "."));
      let selections = 0, tableRows = 0, chartValues = 0;
      for (const region of bundle.regions) {
        selected("region").value = region.id;
        for (const period of [...Array.from({ length: 12 }, (_, i) => String(i + 1)), "MAM"]) {
          selected("period").value = period;
          const expected = period === "MAM" ? region.spring : region.points.filter(point => Number(point.date.slice(5)) === Number(period));
          const ref = region.reference.find(row => row.period === period);
          for (const metric of ["extent", "anomaly"]) {
            selected("metric").value = metric;
            form.requestSubmit();
            const option = core.getInstanceByDom(document.querySelector("#snow-history-chart")).getOption();
            const series = option.series.find(row => row.id === "snow-values");
            const reference = option.series.find(row => row.id === "snow-reference");
            const want = expected.map(point => point[metric] === null ? null : point[metric] / 1e6);
            if (JSON.stringify(series.data) !== JSON.stringify(want) || series.connectNulls !== false) {
              throw new Error("Snow plotted data or null gaps changed");
            }
            if (reference.data.some(value => Math.abs(value - (metric === "extent" ? ref.mean / 1e6 : 0)) > 1e-12)) {
              throw new Error("Snow chart reference changed");
            }
            const seasonal = core.getInstanceByDom(document.querySelector("#snow-season-chart")).getOption();
            for (const year of [2026, 2025]) {
              const actual = seasonal.series.find(row => row.id === `season-${year}`);
              const expectedSeason = Array.from({ length: 12 }, (_, i) =>
                region.points.find(point => point.date === `${year}-${String(i + 1).padStart(2, "0")}`));
              const values = expectedSeason.map(point => point?.[metric] == null ? null : point[metric] / 1e6);
              if (JSON.stringify(actual.data) !== JSON.stringify(values) || actual.connectNulls !== false) {
                throw new Error("Seasonal source data or partial-year values changed");
              }
            }
            chartValues += series.data.length;
            selections++;
            if (metric === "anomaly") continue;
            const rows = [];
            while (true) {
              rows.push(...[...document.querySelectorAll("#snow-history-table tbody tr")]
                .map(tr => [...tr.querySelectorAll("th,td")].map(cell => cell.textContent)));
              if (document.querySelector("#snow-next").disabled) break;
              if (rows.length > 100) throw new Error("Unbounded snow pagination");
              document.querySelector("#snow-next").click();
            }
            if (rows.length !== expected.length) throw new Error("Snow table dropped or duplicated rows");
            for (const [index, cells] of rows.entries()) {
              const point = expected[index];
              if (cells[0] !== String(point.year ?? point.date)) throw new Error("Snow table time shifted");
              for (const [column, key] of [[1, "extent"], [2, "anomaly"]]) {
                if (point[key] === null) {
                  if (cells[column] !== "—") throw new Error("Missing snow value filled");
                } else {
                  const value = parse(cells[column]);
                  if (!Number.isFinite(value) || Math.abs(value - point[key]) > 0.000002) throw new Error("Snow table value differs");
                }
              }
            }
            tableRows += rows.length;
          }
        }
      }
      return { language, selections, tableRows, chartValues, allRegions: 4, monthlyAndSpring: true, exactSourceGaps: true };
    }, language));
  }
  return results;
}

export async function validateSnowControlsAndLayout(page) {
  await openSnow(page);
  const controls = await page.evaluate(async () => {
    const form = document.querySelector("#snow-selection");
    const select = (id, value) => { document.querySelector(`#snow-${id}`).value = value; };
    const source = await (await fetch("/weather_global/src/snow-cover-view.js")).text();
    const core = await import(source.match(/from ["']([^"']*echarts_core[^"']*)["']/)[1]);
    select("period", "7"); select("first", "1968"); select("last", "1968");
    form.requestSubmit();
    if (document.querySelector("#snow-history-table tbody tr td").textContent !== "—") throw new Error("July 1968 not missing");
    select("period", "MAM"); select("first", "1966"); select("last", "1966");
    form.requestSubmit();
    if (!document.querySelector("#snow-history-table tbody").textContent.includes("Incomplete spring")) throw new Error("Partial spring was filled");
    select("period", "1"); form.requestSubmit();
    if (document.querySelectorAll("#snow-history-table tbody tr").length !== 0
      || !document.querySelector("#snow-history").textContent.includes("No source month")) throw new Error("Empty period not explicit");
    const previous = document.querySelector("#snow-description").textContent;
    select("first", "2026"); select("last", "1966"); form.requestSubmit();
    if (document.querySelector("#snow-selection-error").hidden
      || document.querySelector("#snow-description").textContent !== previous) throw new Error("Invalid selection changed chart");
    select("first", "1966"); select("last", "2026"); select("period", "MAM");
    select("year-a", "1966"); select("year-b", "1969"); form.requestSubmit();
    let season = core.getInstanceByDom(document.querySelector("#snow-season-chart")).getOption();
    if (season.series.find(s => s.id === "season-1966").data.slice(0, 10).some(v => v !== null)
      || season.series.find(s => s.id === "season-1969").data.slice(5, 10).some(v => v !== null)) throw new Error("Seasonal gaps were filled");
    select("year-a", "2026"); select("year-b", "2026"); form.requestSubmit();
    season = core.getInstanceByDom(document.querySelector("#snow-season-chart")).getOption();
    if (season.series.length !== 2) throw new Error("Duplicate year not collapsed");
    if (!document.querySelector("#snow-reference").textContent.includes("n=30/30")) throw new Error("Reference count absent");
    return { sourceGaps: true, incompleteSpring: true, emptyPeriod: true, invalidPeriod: true,
      partialYears: true, duplicateYears: true, referenceCounts: true };
  });
  const widths = [];
  for (const language of ["cs", "en"]) {
    await openSnow(page, language);
    for (const width of [320, 390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      widths.push(await page.evaluate(() => {
        if (document.hidden) window.dispatchEvent(new Event("resize"));
        if (document.documentElement.scrollWidth > innerWidth + 1) throw new Error("Snow page overflows");
        const chart = document.querySelector("#snow-history-chart");
        const svg = chart.querySelector("svg");
        if (Math.abs(Number(svg.getAttribute("width")) - chart.getBoundingClientRect().width) > 2) throw new Error("Snow chart resize failed");
        if (!svg.querySelector('path[stroke="#8abaff"]') || !svg.querySelector('text[fill="#a7b9cc"]')) throw new Error("Theme-aware chart colours not rendered");
        return { width: innerWidth, language: document.documentElement.lang, svgWidth: Number(svg.getAttribute("width")) };
      }));
    }
  }
  await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
  await page.locator('main a[href="#snow-cover?lang=en"]').evaluate(element => element.click());
  await page.locator("#snow-selection").waitFor({ state: "attached" });
  if (!await page.locator('.section-nav a[href="#snow-cover?lang=en"][aria-current]').count()) throw new Error("Snow context nav missing");
  await page.locator('main .panel a[href="#sea-ice?lang=en"]').evaluate(element => element.click());
  await page.locator("#ice-selection").waitFor({ state: "attached" });
  await openSnow(page);
  await page.locator('main .panel a[href="#ice-sheets?lang=en"]').evaluate(element => element.click());
  await page.locator("#land-selection").waitFor({ state: "attached" });
  await page.goto("http://127.0.0.1:4174/weather_global/#sources?lang=en");
  await page.locator('main a[href="#snow-cover?lang=en"]').waitFor({ state: "attached" });
  return { controls, widths, overviewContextSources: true, seaIceAndLandIceLinks: true };
}

export async function validateSnowFailuresAndLifecycle(page) {
  await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
  const endpoint = "**/snow-cover-api/v1/bundle.json";
  await page.route(endpoint, route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"test unavailable"}' }));
  try {
    await page.goto("http://127.0.0.1:4174/weather_global/#snow-cover?lang=en");
    await page.locator("#snow-retry").waitFor({ state: "attached" });
    if (await page.locator("#snow-history-chart").count()) throw new Error("Stale snow chart after 503");
  } finally { await page.unroute(endpoint); }
  await page.locator("#snow-retry").evaluate(element => element.click());
  await page.locator("#snow-selection").waitFor({ state: "attached" });
  await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
  await page.route(endpoint, route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  try {
    await page.goto("http://127.0.0.1:4174/weather_global/#snow-cover?lang=en");
    await page.locator("#snow-retry").waitFor({ state: "attached" });
  } finally { await page.unroute(endpoint); }
  await page.locator("#snow-retry").evaluate(element => element.click());
  await page.locator("#snow-selection").waitFor({ state: "attached" });
  const disposed = await page.evaluate(async () => {
    const source = await (await fetch("/weather_global/src/snow-cover-view.js")).text();
    const core = await import(source.match(/from ["']([^"']*echarts_core[^"']*)["']/)[1]);
    const old = ["snow-history-chart", "snow-season-chart"].map(id => core.getInstanceByDom(document.getElementById(id)));
    location.hash = "#overview?lang=en";
    await new Promise(resolve => addEventListener("hashchange", resolve, { once: true }));
    return old.every(chart => chart.isDisposed());
  });
  if (!disposed) throw new Error("Detached snow charts not disposed");
  let release, intercepted;
  const gate = new Promise(resolve => { release = resolve; });
  const seen = new Promise(resolve => { intercepted = resolve; });
  const delayed = "**/snow-cover-api/v1/catalog.json";
  const handler = async route => { intercepted(); await gate; await route.abort(); };
  await page.route(delayed, handler);
  try {
    await page.goto("http://127.0.0.1:4174/weather_global/#snow-cover?lang=en");
    await seen;
    await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
    release();
    await page.unroute(delayed, handler, { behavior: "wait" });
    if (await page.locator("#snow-selection,#snow-retry").count()) throw new Error("Late snow response overwrote route");
  } finally { release(); await page.unroute(delayed); }
  return { unavailable503: true, corrupt200: true, retry: true, disposal: true, lateAbort: true };
}

export async function validateSnowBuiltCandidate(page, baseUrl) {
  const failures = [];
  const track = response => {
    if (response.status() >= 400) failures.push({ url: response.url(), status: response.status() });
  };
  page.on("response", track);
  try {
    await page.goto(`${baseUrl}#snow-cover?lang=cs`);
    await page.locator("#snow-selection").waitFor({ state: "attached" });
    const result = await page.evaluate(async () => {
      const catalogResponse = await fetch("/weather_global/snow-cover-api/v1/catalog.json");
      const bundleResponse = await fetch("/weather_global/snow-cover-api/v1/bundle.json");
      const catalog = await catalogResponse.json(), bundle = await bundleResponse.json();
      const select = (id, value) => { document.querySelector(`#snow-${id}`).value = value; };
      select("region", "na"); select("period", "5"); select("first", "2026"); select("last", "2026");
      document.querySelector("#snow-selection").requestSubmit();
      const cells = [...document.querySelectorAll("#snow-history-table tbody tr:first-child th,#snow-history-table tbody tr:first-child td")]
        .map(cell => cell.textContent);
      const expected = bundle.regions.find(region => region.id === "na").points.find(point => point.date === "2026-05");
      const value = Number(cells[1].replace(/\s/g, "").replace(",", "."));
      if (catalogResponse.status !== 200 || bundleResponse.status !== 200 || bundle.version !== catalog.version
        || document.querySelectorAll("#snow-history-chart svg,#snow-season-chart svg").length !== 2
        || cells[0] !== "2026-05" || value !== expected.extent) throw new Error("Built snow product/table/chart mismatch");
      return { catalogStatus: 200, bundleStatus: 200, regions: bundle.regions.length,
        compiledCharts: 2, originalSourceValue: true, version: bundle.version };
    });
    if (failures.length) throw new Error(`Built snow HTTP failures: ${JSON.stringify(failures)}`);
    return { ...result, failedHttpRequests: failures.length, builtCandidate: true };
  } finally { page.off("response", track); }
}
