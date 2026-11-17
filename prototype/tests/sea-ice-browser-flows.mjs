/* Replay with an existing integrated Playwright page; no new runner or browser installation. */
async function openIce(page, language = "en") {
  await page.goto(`http://127.0.0.1:4174/weather_global/#sea-ice?lang=${language}`);
  await page.locator("#ice-selection").waitFor({ state: "attached" });
}

export async function validateSeaIceMatrix(page) {
  const checks = [];
  for (const language of ["cs", "en"]) {
    await openIce(page, language);
    const result = await page.evaluate(async language => {
      const bundle = await (await fetch("/weather_global/sea-ice-api/v1/bundle.json")).json();
      const source = await (await fetch("/weather_global/src/sea-ice-view.js")).text();
      const path = source.match(/from ["']([^"']*echarts_core[^"']*)["']/)?.[1];
      if (!path) throw new Error("Cannot locate actual ECharts registry");
      const core = await import(path);
      let selections = 0;
      let tableRows = 0;
      const set = (id, value) => { document.querySelector(`#ice-${id}`).value = String(value); };
      for (const region of bundle.regions) {
        set("region", region.id);
        for (let month = 1; month <= 12; month++) {
          set("month", month);
          for (const metric of ["extent", "anomaly"]) {
            set("metric", metric);
            document.querySelector("#ice-selection").requestSubmit();
            const option = core.getInstanceByDom(document.querySelector("#ice-history-chart")).getOption();
            const expected = region.points.filter(point => Number(point.date.slice(5)) === month);
            if (JSON.stringify(option.series[0].data) !== JSON.stringify(expected.map(point => point[metric]))) {
              throw new Error(`Incorrect chart values ${region.id}/${month}/${metric}/${language}`);
            }
            if (option.series[0].connectNulls !== false) throw new Error("Chart bridges missing data");
            const reference = region.reference[month - 1];
            if (option.series[1].data.some(value => value !== (metric === "extent" ? reference.mean : 0))) {
              throw new Error("Incorrect chart reference");
            }
            const allRows = [];
            do {
              allRows.push(...[...document.querySelectorAll("#ice-history-table tbody tr")]
                .map(tr => [...tr.querySelectorAll("th,td")].map(cell => cell.textContent)));
              const next = document.querySelector("#ice-next");
              if (next.disabled) break;
              next.click();
            } while (allRows.length <= 60);
            if (allRows.length !== expected.length) throw new Error("Pagination lost or duplicated rows");
            for (const [index, cells] of allRows.entries()) {
              const point = expected[index];
              if (cells[0] !== point.date || Number(cells[3]) !== reference.count) throw new Error("Wrong date/reference count");
              for (const [column, key] of [[1, "extent"], [2, "anomaly"]]) {
                if (point[key] === null) {
                  if (cells[column] !== "—" || !/Chybí|Missing/.test(cells[5])) throw new Error("Missing value invented");
                } else {
                  const parsed = Number(cells[column].replace(/\s/g, "").replace(",", "."));
                  if (Math.abs(parsed - point[key]) > 0.000501) throw new Error("Table value differs from product");
                }
              }
              if (cells[4] !== (point.source_dataset ?? "—")) throw new Error("Input identity lost");
            }
            const seasonal = core.getInstanceByDom(document.querySelector("#ice-season-chart")).getOption();
            for (const [index, year] of [2026, 2025].entries()) {
              const values = Array.from({ length: 12 }, (_, monthIndex) => {
                const point = region.points.find(point => point.date === `${year}-${String(monthIndex + 1).padStart(2, "0")}`);
                return point ? point[metric] : null;
              });
              if (JSON.stringify(seasonal.series[index].data) !== JSON.stringify(values)) throw new Error("Seasonal values/partial year changed");
            }
            tableRows += allRows.length;
            selections++;
          }
        }
      }
      return { language, selections, tableRows, missingMonthsPreserved: true };
    }, language);
    checks.push(result);
  }
  return checks;
}

export async function validateSeaIceControlsAndNavigation(page) {
  await openIce(page);
  const controls = await page.evaluate(() => {
    const set = (id, value) => { document.querySelector(`#ice-${id}`).value = String(value); };
    const apply = () => document.querySelector("#ice-selection").requestSubmit();
    set("month", 1); set("first", 1987); set("last", 1988); set("year-a", 1978); set("year-b", 1988); apply();
    const january = document.querySelector("#ice-history-table").textContent;
    if (!january.includes("Missing in source") || !document.querySelector("#ice-history").textContent.includes("n=29/30")) {
      throw new Error("January gap or reference count hidden");
    }
    if (document.querySelectorAll("#ice-season tbody tr").length !== 12
      || !document.querySelector("#ice-season").textContent.includes("Outside source period")) throw new Error("Seasonal partial year not marked");
    const before = document.querySelector("#ice-history-description").textContent;
    set("first", 2026); set("last", 1978); apply();
    if (document.querySelector("#ice-selection-error").hidden
      || document.querySelector("#ice-history-description").textContent !== before) throw new Error("Invalid selection silently applied");
    set("first", 1978); set("last", 1978); apply();
    if (!document.querySelector("#ice-history").textContent.includes("No source month")) throw new Error("Empty interval not explained");
    set("month", 12); apply();
    if (document.querySelectorAll("#ice-history-table tbody tr").length !== 1) throw new Error("1978 December lost");
    set("year-b", 1978); apply();
    if (document.querySelectorAll("#ice-season thead th").length !== 4) throw new Error("Duplicate season selection not deduplicated");
    return { januaryGap: true, partial1978: true, invalidRange: true, emptyRange: true, duplicateSeason: true };
  });
  const widths = [];
  for (const language of ["cs", "en"]) {
    for (const width of [320, 390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://127.0.0.1:4174/weather_global/#sea-ice?lang=${language}`);
      await page.locator("#ice-selection").waitFor({ state: "attached" });
      widths.push(await page.evaluate(() => {
        // The integrated hidden page suspends native resize delivery.
        if (document.hidden) dispatchEvent(new Event("resize"));
        const scroll = document.documentElement.scrollWidth;
        if (scroll > innerWidth) throw new Error(`Horizontal overflow ${scroll}/${innerWidth}`);
        const rows = [...document.querySelectorAll(".ice-chart")].map(element => {
          const svg = element.querySelector("svg");
          if (!svg || Math.abs(Number(svg.getAttribute("width")) - element.getBoundingClientRect().width) > 2) {
            throw new Error("Chart does not fit its container");
          }
          return Number(svg.getAttribute("width"));
        });
        return { width: innerWidth, language: document.documentElement.lang, chartWidths: rows };
      }));
    }
  }
  await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
  await page.locator(".topic-links").first().waitFor({ state: "attached" });
  if (await page.locator('.topic-links a[href="#sea-ice?lang=en"]').count() !== 1) throw new Error("Overview entry missing");
  await page.locator('.topic-links a[href="#sea-ice?lang=en"]').evaluate(element => element.click());
  await page.locator("#ice-selection").waitFor({ state: "attached" });
  if (await page.locator('.section-nav a[href="#sea-ice?lang=en"][aria-current="page"]').count() !== 1) {
    throw new Error("Context navigation missing");
  }
  for (const route of ["history", "continental-history", "continents", "oceans", "ocean-future", "sources", "about"]) {
    await page.goto(`http://127.0.0.1:4174/weather_global/#${route}?lang=en`);
    await page.locator("main h1").waitFor({ state: "attached" });
    const title = await page.locator("main h1").textContent();
    if (/does not exist|not found/i.test(title)) throw new Error(`Existing route broken ${route}`);
    if (route === "sources" && await page.locator('main a[href="#sea-ice?lang=en"]').count() !== 1) throw new Error("Source entry missing");
  }
  return { controls, widths, overviewAndSources: true, existingRoutes: 7 };
}

export async function validateSeaIceFailureAndLifecycle(page) {
  await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
  const endpoint = "**/sea-ice-api/v1/bundle.json";
  await page.route(endpoint, route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"test unavailable"}' }));
  try {
    await page.goto("http://127.0.0.1:4174/weather_global/#sea-ice?lang=en");
    await page.locator("#ice-retry").waitFor({ state: "attached" });
    if (await page.locator(".ice-chart").count()) throw new Error("Stale chart shown after failure");
  } finally {
    await page.unroute(endpoint);
  }
  await page.locator("#ice-retry").evaluate(element => element.click());
  await page.locator("#ice-selection").waitFor({ state: "attached" });
  await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
  await page.route(endpoint, route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  try {
    await page.goto("http://127.0.0.1:4174/weather_global/#sea-ice?lang=en");
    await page.locator("#ice-retry").waitFor({ state: "attached" });
  } finally {
    await page.unroute(endpoint);
  }
  await page.locator("#ice-retry").evaluate(element => element.click());
  await page.locator("#ice-selection").waitFor({ state: "attached" });
  const disposed = await page.evaluate(async () => {
    const source = await (await fetch("/weather_global/src/sea-ice-view.js")).text();
    const core = await import(source.match(/from ["']([^"']*echarts_core[^"']*)["']/)[1]);
    const old = core.getInstanceByDom(document.querySelector("#ice-history-chart"));
    location.hash = "#overview?lang=en";
    await new Promise(resolve => addEventListener("hashchange", resolve, { once: true }));
    return old.isDisposed();
  });
  if (!disposed) throw new Error("Detached chart not disposed");
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let intercepted;
  const seen = new Promise(resolve => { intercepted = resolve; });
  const delayed = "**/sea-ice-api/v1/catalog.json";
  const handler = async route => { intercepted(); await gate; await route.abort(); };
  await page.route(delayed, handler);
  try {
    await page.goto("http://127.0.0.1:4174/weather_global/#sea-ice?lang=en");
    await seen;
    await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
    release();
    await page.unroute(delayed, handler, { behavior: "wait" });
    if (await page.locator("#ice-selection, #ice-retry").count()) throw new Error("Late request overwrote new route");
  } finally {
    release();
    await page.unroute(delayed);
  }
  return { unavailable503: true, corrupt200: true, retry: true, chartDisposal: true, lateAbort: true };
}
