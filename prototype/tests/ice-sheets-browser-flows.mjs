/* Replay with an existing integrated Playwright page; no extra browser installation. */
async function openLandIce(page, language = "en") {
  await page.goto(`http://127.0.0.1:4174/weather_global/#ice-sheets?lang=${language}`);
  await page.locator("#land-selection").waitFor({ state: "attached" });
}

export async function validateIceSheetBuiltCandidate(page, baseUrl) {
  const failures = [];
  const track = response => {
    if (response.status() >= 400) failures.push({ url: response.url(), status: response.status() });
  };
  page.on("response", track);
  try {
    await page.goto(`${baseUrl}#ice-sheets?lang=cs`);
    await page.locator("#land-selection").waitFor({ state: "attached" });
    const result = await page.evaluate(async () => {
      const catalogResponse = await fetch("/weather_global/ice-sheets-api/v1/catalog.json");
      const bundleResponse = await fetch("/weather_global/ice-sheets-api/v1/bundle.json");
      const bundle = await bundleResponse.json();
      const initialRows = document.querySelectorAll("#land-table tbody tr").length;
      document.querySelector("#land-first").value = "2011-10";
      document.querySelector("#land-last").value = "2011-10";
      document.querySelector("#land-selection").requestSubmit();
      const rows = [...document.querySelectorAll("#land-table tbody tr")];
      const labels = [...document.querySelectorAll("#land-chart svg text")].map(element => element.textContent);
      if (catalogResponse.status !== 200 || bundleResponse.status !== 200 || initialRows !== 20
        || rows.length !== 2 || !labels.some(label => /2011[.,]\d/.test(label))) {
        throw new Error("Built candidate or fractional epoch axis failed");
      }
      const id = document.querySelector("#land-region").value;
      const expected = bundle.regions.find(region => region.id === id).points
        .filter(point => point.date.startsWith("2011-10"));
      for (const [index, row] of rows.entries()) {
        const cells = [...row.querySelectorAll("th,td")].map(cell => cell.textContent);
        if (cells[0] !== expected[index].date || Number(cells[1]) !== expected[index].source_time) {
          throw new Error("Built table changed original distinct source epochs");
        }
      }
      return { catalogStatus: 200, bundleStatus: 200, regions: bundle.regions.length,
        initialTableRows: initialRows, distinctEpochRows: rows.length, fractionalLabels: true,
        svg: true, version: bundle.version };
    });
    if (failures.length) throw new Error(`Built candidate HTTP failures: ${JSON.stringify(failures)}`);
    return { ...result, failedHttpRequests: failures.length, builtCandidate: true };
  } finally {
    page.off("response", track);
  }
}

export async function validateIceSheetNumerics(page) {
  const results = [];
  for (const language of ["cs", "en"]) {
    await openLandIce(page, language);
    results.push(await page.evaluate(async language => {
      const bundle = await (await fetch("/weather_global/ice-sheets-api/v1/bundle.json")).json();
      const source = await (await fetch("/weather_global/src/ice-sheets-view.js")).text();
      const core = await import(source.match(/from ["']([^"']*echarts_core[^"']*)["']/)[1]);
      let tableRows = 0;
      let plotted = 0;
      let bandPolygons = 0;
      for (const region of bundle.regions) {
        document.querySelector("#land-region").value = region.id;
        document.querySelector("#land-selection").requestSubmit();
        const chart = core.getInstanceByDom(document.querySelector("#land-chart"));
        const option = chart.getOption();
        const lines = option.series.filter(row => row.id?.startsWith("mass-"));
        const expected = region.points.filter(point => point.value !== null);
        const values = lines.flatMap(line => line.data);
        if (JSON.stringify(values) !== JSON.stringify(expected.map(point => [point.source_time, point.value]))) {
          throw new Error("Mass series differs from the original source epochs/values");
        }
        for (const line of lines) {
          if (line.connectNulls !== false || line.data.some((row, index) =>
            index && row[0] - line.data[index - 1][0] > 0.125)) throw new Error("Source interval incorrectly bridged");
        }
        const bars = option.series.find(row => row.id === "uncertainty-bars");
        if (JSON.stringify(bars.data) !== JSON.stringify(expected.map(point => [point.source_time, point.lower, point.upper]))) {
          throw new Error("Published uncertainty bounds changed");
        }
        const polygons = option.series.find(row => row.id === "uncertainty-band").data;
        const byTime = new Map(expected.map(point => [point.source_time, point]));
        for (const polygon of polygons) {
          const first = byTime.get(polygon[0]);
          const last = byTime.get(polygon[3]);
          if (!first || !last || polygon[3] - polygon[0] > 0.125
            || JSON.stringify(polygon) !== JSON.stringify([first.source_time, first.lower, first.upper,
              last.source_time, last.lower, last.upper])) throw new Error("Band crosses a gap or changes source bounds");
        }
        const rows = [];
        while (true) {
          rows.push(...[...document.querySelectorAll("#land-table tbody tr")]
            .map(tr => [...tr.querySelectorAll("th,td")].map(cell => cell.textContent)));
          if (document.querySelector("#land-next").disabled) break;
          if (rows.length > 300) throw new Error("Unbounded pagination");
          document.querySelector("#land-next").click();
        }
        if (rows.length !== 260) throw new Error("Source rows lost, duplicated or invented");
        for (const [index, cells] of rows.entries()) {
          const point = region.points[index];
          if (cells[0] !== point.date || Number(cells[1]) !== point.source_time
            || Number(cells[6]) !== point.source_id) throw new Error("Source coordinate/identity changed");
          for (const [column, key] of [[2, "value"], [3, "lower"], [4, "upper"]]) {
            if (point[key] === null) {
              if (cells[column] !== "—" || !/Mezera|gap/.test(cells[5])) throw new Error("Null mission record changed");
            } else {
              const normalized = language === "en" ? cells[column].replace(/,/g, "") : cells[column].replace(/\s/g, "").replace(",", ".");
              const parsed = Number(normalized);
              if (!Number.isFinite(parsed) || Math.abs(parsed - point[key]) > 0.00501) {
                throw new Error("Table value differs from source");
              }
            }
          }
        }
        if (rows.filter(row => row[0].startsWith("2011-10")).length !== 2) throw new Error("Same-month epochs collapsed");
        if (!document.querySelector("#land-gaps").textContent.includes("2017-06-10 — 2018-06-14")) throw new Error("Mission interval missing");
        document.querySelector("#land-bounds").checked = false;
        document.querySelector("#land-selection").requestSubmit();
        if (core.getInstanceByDom(document.querySelector("#land-chart")).getOption().series.some(row => row.id.startsWith("uncertainty"))) {
          throw new Error("Uncertainty toggle failed");
        }
        if (!document.querySelector("#land-table").textContent.includes(language === "cs" ? "Dolní mez" : "Lower bound")) {
          throw new Error("Hiding chart uncertainty hid table bounds");
        }
        document.querySelector("#land-bounds").checked = true;
        tableRows += rows.length;
        plotted += values.length;
        bandPolygons += polygons.length;
      }
      return { language, regions: 2, tableRows, plotted, bandPolygons, originalBounds: true, duplicateMonths: true };
    }, language));
  }
  return results;
}

export async function validateIceSheetControlsAndLayout(page) {
  await openLandIce(page);
  const controls = await page.evaluate(async () => {
    const source = await (await fetch("/weather_global/src/ice-sheets-view.js")).text();
    const core = await import(source.match(/from ["']([^"']*echarts_core[^"']*)["']/)[1]);
    const set = (id, value) => { document.querySelector(`#land-${id}`).value = value; };
    const apply = () => document.querySelector("#land-selection").requestSubmit();
    set("first", "2017-07"); set("last", "2018-05"); apply();
    if (!document.querySelector("#land-result").textContent.includes("No valid value")) throw new Error("Gap shown as measured change");
    const option = core.getInstanceByDom(document.querySelector("#land-chart")).getOption();
    if (option.series.some(row => row.id.startsWith("mass-"))) throw new Error("Fabricated mass in mission gap");
    const before = document.querySelector("#land-description").textContent;
    set("first", "2026-07"); set("last", "2002-04"); apply();
    if (document.querySelector("#land-selection-error").hidden
      || document.querySelector("#land-description").textContent !== before) throw new Error("Invalid period silently applied");
    set("first", "2002-06"); set("last", "2002-07"); apply();
    if (document.querySelectorAll("#land-table tbody tr").length) throw new Error("Invented missing observations");
    if (!document.querySelector("#land-result").textContent.includes("No valid value")) throw new Error("Empty range unexplained");
    set("first", "2011-10"); set("last", "2011-10"); apply();
    if (document.querySelectorAll("#land-table tbody tr").length !== 2) throw new Error("Two real source epochs not retained");
    if (document.querySelector("#land-table tbody tr td:nth-child(3)").textContent === "0") throw new Error("Selection rebased source zero");
    return { missionGap: true, invalidPeriod: true, emptyPeriod: true, duplicateMonths: true, noRebasing: true };
  });
  const widths = [];
  for (const language of ["cs", "en"]) {
    for (const width of [320, 390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      await openLandIce(page, language);
      widths.push(await page.evaluate(() => {
        // Hidden integrated pages suspend native resize delivery.
        if (document.hidden) dispatchEvent(new Event("resize"));
        const element = document.querySelector("#land-chart");
        const svg = element.querySelector("svg");
        if (document.documentElement.scrollWidth > innerWidth) throw new Error("Page overflow");
        if (!svg || Math.abs(Number(svg.getAttribute("width")) - element.getBoundingClientRect().width) > 2) {
          throw new Error("Chart width does not fit its container");
        }
        const luminance = color => {
          const rgb = color.startsWith("#")
            ? color.slice(1).match(/../g).map(value => parseInt(value, 16))
            : color.match(/\d+/g).slice(0, 3).map(Number);
          const linear = rgb.map(value => value / 255).map(value =>
            value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
          return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
        };
        const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const background = luminance(getComputedStyle(document.querySelector("#land-result")).backgroundColor);
        const line = svg.querySelector('path[stroke="#8abaff"]');
        const label = svg.querySelector('text[fill="#a7b9cc"]');
        if (!line || !label) throw new Error("Expected theme-aware chart colours not rendered");
        const lineContrast = contrast(background, luminance(line.getAttribute("stroke")));
        const textContrast = contrast(background, luminance(label.getAttribute("fill")));
        if (lineContrast < 3 || textContrast < 4.5) throw new Error("Insufficient line or axis-text contrast");
        return { width: innerWidth, language: document.documentElement.lang, svgWidth: Number(svg.getAttribute("width")),
          lineContrast, textContrast };
      }));
    }
  }
  await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
  await page.locator(".topic-links").first().waitFor({ state: "attached" });
  await page.locator('.topic-links a[href="#ice-sheets?lang=en"]').evaluate(element => element.click());
  await page.locator("#land-selection").waitFor({ state: "attached" });
  if (await page.locator('.section-nav a[href="#ice-sheets?lang=en"][aria-current="page"]').count() !== 1) throw new Error("Active contextual entry missing");
  await page.locator('main a[href="#ocean/gmsl?lang=en"]').evaluate(element => element.click());
  await page.locator("main h1").waitFor({ state: "attached" });
  if (!await page.locator("main .chart").count()) throw new Error("Observed sea-level link broken");
  await page.goto("http://127.0.0.1:4174/weather_global/#sea-ice?lang=en");
  await page.locator("#ice-selection").waitFor({ state: "attached" });
  await page.locator('main .panel a[href="#ice-sheets?lang=en"]').evaluate(element => element.click());
  await page.locator("#land-selection").waitFor({ state: "attached" });
  await page.goto("http://127.0.0.1:4174/weather_global/#sources?lang=en");
  await page.locator('main a[href="#ice-sheets?lang=en"]').waitFor({ state: "attached" });
  return { controls, widths, overviewSourcesContext: true, seaLevelLink: true, seaIceCrossLink: true };
}

export async function validateIceSheetFailuresAndLifecycle(page) {
  await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
  const endpoint = "**/ice-sheets-api/v1/bundle.json";
  await page.route(endpoint, route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"test unavailable"}' }));
  try {
    await page.goto("http://127.0.0.1:4174/weather_global/#ice-sheets?lang=en");
    await page.locator("#land-retry").waitFor({ state: "attached" });
    if (await page.locator("#land-chart").count()) throw new Error("Stale chart shown after 503");
  } finally { await page.unroute(endpoint); }
  await page.locator("#land-retry").evaluate(element => element.click());
  await page.locator("#land-selection").waitFor({ state: "attached" });
  await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
  await page.route(endpoint, route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  try {
    await page.goto("http://127.0.0.1:4174/weather_global/#ice-sheets?lang=en");
    await page.locator("#land-retry").waitFor({ state: "attached" });
  } finally { await page.unroute(endpoint); }
  await page.locator("#land-retry").evaluate(element => element.click());
  await page.locator("#land-selection").waitFor({ state: "attached" });
  const disposed = await page.evaluate(async () => {
    const source = await (await fetch("/weather_global/src/ice-sheets-view.js")).text();
    const core = await import(source.match(/from ["']([^"']*echarts_core[^"']*)["']/)[1]);
    const old = core.getInstanceByDom(document.querySelector("#land-chart"));
    location.hash = "#overview?lang=en";
    await new Promise(resolve => addEventListener("hashchange", resolve, { once: true }));
    return old.isDisposed();
  });
  if (!disposed) throw new Error("Detached land ice chart not disposed");
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let intercepted;
  const seen = new Promise(resolve => { intercepted = resolve; });
  const delayed = "**/ice-sheets-api/v1/catalog.json";
  const handler = async route => { intercepted(); await gate; await route.abort(); };
  await page.route(delayed, handler);
  try {
    await page.goto("http://127.0.0.1:4174/weather_global/#ice-sheets?lang=en");
    await seen;
    await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
    release();
    await page.unroute(delayed, handler, { behavior: "wait" });
    if (await page.locator("#land-selection, #land-retry").count()) throw new Error("Late data overwrote the current route");
  } finally {
    release();
    await page.unroute(delayed);
  }
  return { unavailable503: true, corrupt200: true, retry: true, disposal: true, lateAbort: true };
}
