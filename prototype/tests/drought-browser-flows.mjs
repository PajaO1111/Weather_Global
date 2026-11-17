async function openDrought(page, language = "en") {
  await page.goto(`http://127.0.0.1:4174/weather_global/#drought?lang=${language}`);
  await page.locator("#dry-selection").waitFor({ state: "attached" });
}
export async function validateDroughtMatrix(page, languages = ["cs", "en"], scales = [3, 12]) {
  const results = [];
  for (const language of languages) {
    await openDrought(page, language);
    results.push(await page.evaluate(async ({ language, scales }) => {
      const bundle = await (await fetch("/weather_global/drought-api/v1/bundle.json")).json();
      const source = await (await fetch("/weather_global/src/drought-view.js")).text();
      const core = await import(source.match(/from ["']([^"']*echarts_core[^"']*)["']/)[1]);
      const form = document.querySelector("#dry-selection"), select = id => document.querySelector(`#dry-${id}`);
      const parse = text => Number(language === "en" ? text.replace(/,/g, "") : text.replace(/\s/g, "").replace(",", "."));
      const eq = (text, value, message) => {
        if (value === null) { if (!text.startsWith("—")) throw new Error(message + " missing filled"); }
        else {
          const actual = parse(text.replace("%", "").trim());
          if (!Number.isFinite(actual) || Math.abs(actual - value * 100) > .000003) throw new Error(message);
        }
      };
      const value = (p, metric) => ["dry", "severe", "extreme"].includes(metric) ? p[metric] : p.categories?.[bundle.categories.indexOf(metric)] ?? null;
      let selections = 0, tableRows = 0, historyPositions = 0, mapValues = 0, categoryPositions = 0;
      select("year").value = "2024"; select("first").value = "1901"; select("last").value = "2024";
      for (const product of bundle.scales.filter(s => scales.includes(s.months))) {
        select("scale").value = String(product.months);
        for (const region of product.regions) {
          select("region").value = region.id;
          for (const [periodIndex, period] of ["annual", ...Array.from({ length: 12 }, (_, i) => String(i + 1))].entries()) {
            select("period").value = period;
            const expected = period === "annual" ? region.annual : region.points.filter(p => Number(p.date.slice(5)) === Number(period));
            for (const metric of [["dry", "severe", "extreme", ...bundle.categories][periodIndex % 10]]) {
              select("metric").value = metric; form.requestSubmit();
              const chart = core.getInstanceByDom(document.querySelector("#dry-history-chart")).getOption();
              const series = chart.series.find(p => p.id === "dry-values");
              const wanted = expected.map(p => value(p, metric) === null ? null : value(p, metric) * 100);
              if (series.connectNulls !== false || JSON.stringify(series.data) !== JSON.stringify(wanted)) throw new Error("Drought history plotted values/gaps mismatch");
              const map = core.getInstanceByDom(document.querySelector("#dry-map")).getOption();
              if (map.visualMap[0].min !== 0 || map.visualMap[0].max !== 100) throw new Error("Map scale changes across selection");
              const trs = [...document.querySelectorAll("#dry-comparison tbody tr")];
              for (const [k, other] of product.regions.entries()) {
                const p = (period === "annual" ? other.annual : other.points).find(p => p.date === (period === "annual" ? "2024" : `2024-${String(period).padStart(2, "0")}`));
                const raw = value(p, metric), want = raw === null ? null : raw * 100;
                if (map.series[0].data[k].name !== other.id || map.series[0].data[k].value !== want) throw new Error("Map does not match regional category share");
                eq(trs[k].cells[1].textContent, raw, "Map table share mismatch");
                eq(trs[k].cells[2].textContent, p.coverage, "Map table availability mismatch");
                eq(trs[k].cells[3].textContent, other.domain_fraction, "Map domain mismatch"); mapValues++;
              }
              selections++; historyPositions += series.data.length;
              if (period === "annual" && metric === "dry") {
                const category = core.getInstanceByDom(document.querySelector("#dry-category-chart")).getOption();
                const categoryRows = [...document.querySelectorAll("#dry-categories tbody tr")];
                for (const [c, id] of bundle.categories.entries()) {
                  const want = Array.from({ length: 12 }, (_, i) => {
                    const p = region.points.find(p => p.date === `2024-${String(i + 1).padStart(2, "0")}`);
                    eq(categoryRows[i].cells[c + 1].textContent, p.categories?.[c] ?? null, "Exclusive category table mismatch");
                    eq(categoryRows[i].cells[9].textContent, p.coverage, "Category table coverage mismatch");
                    if (Math.abs(parse(categoryRows[i].cells[8].textContent) - p.available_area_km2) > .000002) throw new Error("Available area table mismatch");
                    return p.categories ? p.categories[c] * 100 : null;
                  });
                  if (JSON.stringify(category.series.find(p => p.id === `dry-category-${id}`).data) !== JSON.stringify(want)) throw new Error("Exclusive class stack mismatch");
                  categoryPositions += 12;
                }
              }
              const rows = [];
              while (true) {
                rows.push(...[...document.querySelectorAll("#dry-history-table tbody tr")].map(tr => [...tr.cells].map(cell => cell.textContent)));
                if (document.querySelector("#dry-next").disabled) break;
                if (rows.length > 124) throw new Error("Unbounded drought pagination");
                document.querySelector("#dry-next").click();
              }
              if (rows.length !== expected.length) throw new Error("History rows duplicated/dropped");
              for (const [i, cells] of rows.entries()) {
                const p = expected[i];
                if (cells[0] !== p.date) throw new Error("Drought date shifted");
                eq(cells[1], value(p, metric), "Selected share mismatch"); eq(cells[2], p.dry, "Dry share mismatch");
                eq(cells[3], p.severe, "Severe share mismatch"); eq(cells[4], p.extreme, "Extreme share mismatch");
                eq(cells[5], p.coverage, "History availability mismatch");
              }
              tableRows += rows.length;
            }
          }
        }
      }
      const report = { language, scales, selections, tableRows, historyPositions, mapValues, categoryPositions, exactNulls: true, allMetrics: 10 };
      globalThis.droughtMatrixReport = report;
      return report;
    }, { language, scales }));
  }
  return results;
}

export async function validateDroughtControlsContextAndLayout(page) {
  await openDrought(page);
  await page.locator("#dry-context table").waitFor({ state: "attached" });
  const controls = await page.evaluate(async () => {
    const form = document.querySelector("#dry-selection"), select = (name, value) => { document.querySelector(`#dry-${name}`).value = value; };
    const bundle = await (await fetch("/weather_global/drought-api/v1/bundle.json")).json();
    const rain = await (await fetch("/weather_global/precipitation-api/v1/bundle.json")).json();
    const temp = await (await fetch("/weather_global/history-comparison-api/v1/bundle.json")).json();
    const parse = s => Number(s.replace(/,/g, "").replace("%", "").trim());
    const eq = (text, expected) => {
      if (expected === null) { if (!text.startsWith("—")) throw new Error("Context missing filled"); }
      else if (!Number.isFinite(parse(text)) || Math.abs(parse(text) - expected) > .000003) throw new Error("Context altered separately sourced values");
    };
    select("region", "europe"); select("scale", "12"); select("period", "1"); select("first", "1901"); select("last", "1901"); form.requestSubmit();
    if (!document.querySelector("#dry-history-table tbody td").textContent.startsWith("—")) throw new Error("Initial window filled");
    select("period", "12"); form.requestSubmit();
    if (document.querySelector("#dry-history-table tbody td").textContent.startsWith("—")) throw new Error("December 1901 incorrectly absent");
    select("period", "annual"); form.requestSubmit();
    if (!document.querySelector("#dry-history-table tbody td").textContent.startsWith("—")) throw new Error("Partial initial year filled");
    const previous = document.querySelector("#dry-description").textContent;
    select("first", "2024"); select("last", "1901"); form.requestSubmit();
    if (document.querySelector("#dry-selection-error").hidden || document.querySelector("#dry-description").textContent !== previous) throw new Error("Invalid year range changes chart");
    select("first", "1901"); select("last", "2024");
    for (const year of ["1901", "1981", "2024"]) {
      select("year", year); form.requestSubmit();
      const rows = [...document.querySelectorAll("#dry-context tbody tr")];
      for (const [k, r] of bundle.scales[1].regions.entries()) {
        const cells = rows[k].cells, d = r.annual.find(p => p.date === year);
        const rp = rain.regions[k], p = rp.annual.find(p => p.date === year), t = temp.regions[k].conservative.annual.find(p => p.date === year);
        eq(cells[1].textContent, d.dry === null ? null : d.dry * 100); eq(cells[2].textContent, d.coverage * 100);
        eq(cells[3].textContent, p.value); eq(cells[4].textContent, p.anomaly); eq(cells[5].textContent, rp.support_fraction * 100);
        eq(cells[6].textContent, t.value); eq(cells[7].textContent, t.source_coverage * 100);
      }
    }
    select("region", "antarctica"); form.requestSubmit();
    if (!document.querySelector("#dry-history-table").textContent.includes("Outside source domain")) throw new Error("Antarctic missing domain hidden");
    const offer = document.querySelector("#dry-adapted-database");
    if (!offer.href.endsWith("/drought-api/v1/bundle.json") || !offer.hasAttribute("download")) throw new Error("Adapted ODbL database offer missing");
    const main = document.querySelector("main").textContent;
    if (!main.includes("not direct hydrological drought") || !main.includes("not unique area") || !main.includes("ODbL")) throw new Error("Scientific/licence limitations absent");
    return { spinup: true, initialAnnual: true, invalidRange: true, contextYears: 3, contextRegions: 7, exactSeparateContext: true, adaptedDatabaseOffer: true };
  });
  const layout = [];
  for (const language of ["cs", "en"]) {
    await openDrought(page, language);
    await page.locator("#dry-context table").waitFor({ state: "attached" });
    for (const width of [320, 390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      layout.push(await page.evaluate(() => {
        if (document.hidden) window.dispatchEvent(new Event("resize"));
        if (document.documentElement.scrollWidth > innerWidth + 1) throw new Error("Drought page overflows");
        if (document.querySelectorAll("#dry-history-chart svg,#dry-category-chart svg,#dry-map svg").length !== 3) throw new Error("Responsive chart missing");
        return { width: innerWidth, hiddenDocument: document.hidden, charts: 3 };
      }));
    }
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
  await page.locator(".topic-card").first().waitFor({ state: "attached" });
  await page.evaluate(() => {
    if (document.querySelectorAll("#navigation > .nav-group > a").length !== 6) throw new Error("Primary group count changed");
    const link = document.querySelector('main a[href="#drought?lang=en"]'); if (!link) throw new Error("Overview drought link absent"); link.click();
  });
  await page.locator("#dry-selection").waitFor({ state: "attached" });
  await page.goto("http://127.0.0.1:4174/weather_global/#sources?lang=en");
  if (!await page.locator('main a[href="#drought?lang=en"]').count()) throw new Error("Drought sources link absent");
  return { controls, layout, overviewAndSources: true };
}

export async function validateDroughtFailuresAndLifecycle(page) {
  const pattern = "**/drought-api/v1/bundle.json";
  for (const fixture of [{ status: 503, body: "unavailable" }, { status: 200, body: "{}" }]) {
    const handler = route => route.fulfill({ ...fixture, contentType: "application/json" });
    await page.route(pattern, handler);
    try {
      await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
      await page.goto("http://127.0.0.1:4174/weather_global/#drought?lang=en");
      await page.locator("#dry-retry").waitFor({ state: "attached" });
      if (await page.locator("#dry-selection").count()) throw new Error("Drought error became success-shaped data");
    } finally { await page.unroute(pattern, handler); }
    await page.locator("#dry-retry").evaluate(button => button.click());
    await page.locator("#dry-selection").waitFor({ state: "attached" });
  }
  const contextPattern = "**/precipitation-api/v1/bundle.json", contextFailure = route => route.fulfill({ status: 503, body: "unavailable" });
  await page.route(contextPattern, contextFailure);
  try {
    await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
    await openDrought(page);
    await page.locator("#dry-context-retry").waitFor({ state: "attached" });
    if (await page.locator("#dry-history-chart svg").count() !== 1) throw new Error("Context failure destroyed drought");
  } finally { await page.unroute(contextPattern, contextFailure); }
  await page.locator("#dry-context-retry").evaluate(button => button.click());
  await page.locator("#dry-context table").waitFor({ state: "attached" });
  const disposed = await page.evaluate(async () => {
    const source = await (await fetch("/weather_global/src/drought-view.js")).text();
    const core = await import(source.match(/from ["']([^"']*echarts_core[^"']*)["']/)[1]);
    const old = ["dry-history-chart", "dry-category-chart", "dry-map"].map(id => core.getInstanceByDom(document.getElementById(id)));
    location.hash = "#overview?lang=en"; await new Promise(resolve => setTimeout(resolve, 50)); return old.every(chart => chart.isDisposed());
  });
  if (!disposed) throw new Error("Drought charts leaked");
  for (const latePattern of [pattern, contextPattern]) {
    let release, started;
    const gate = new Promise(resolve => { release = resolve; }), intercepted = new Promise(resolve => { started = resolve; });
    const handler = async route => { started(); await gate; await route.continue(); };
    await page.route(latePattern, handler);
    try {
      await page.goto("http://127.0.0.1:4174/weather_global/#drought?lang=en"); await intercepted;
      await page.goto("http://127.0.0.1:4174/weather_global/#overview?lang=en");
      release(); await page.unroute(latePattern, handler, { behavior: "wait" });
      if (await page.locator("#dry-selection,#dry-retry,#dry-context-retry").count()) throw new Error("Late drought/context response replaced overview");
    } finally { release(); await page.unroute(latePattern, handler); }
  }
  return { unavailable503: true, corrupt200: true, retry: true, independentContextFailureAndRetry: true, disposal: true, lateAbort: true, lateContextAbort: true };
}

export async function validateDroughtBuiltCandidate(page, baseUrl) {
  const failures = [], track = response => { if (response.status() >= 400) failures.push({ url: response.url(), status: response.status() }); };
  page.on("response", track);
  try {
    await page.goto(`${baseUrl}#drought?lang=cs`); await page.locator("#dry-selection").waitFor({ state: "attached" });
    await page.locator("#dry-context table").waitFor({ state: "attached" });
    const result = await page.evaluate(async () => {
      const response = await fetch("/weather_global/drought-api/v1/bundle.json"), bundle = await response.json();
      const select = (id, value) => { document.querySelector(`#dry-${id}`).value = value; };
      select("region", "oceania"); select("scale", "12"); select("period", "12"); select("first", "2024"); select("last", "2024");
      document.querySelector("#dry-selection").requestSubmit();
      const row = [...document.querySelector("#dry-history-table tbody tr").cells].map(c => c.textContent);
      const expected = bundle.scales[1].regions[5].points.at(-1).dry * 100;
      const value = Number(row[1].replace(/\s/g, "").replace("%", "").replace(",", "."));
      if (response.status !== 200 || row[0] !== "2024-12" || Math.abs(value - expected) > .000003
        || document.querySelectorAll("#dry-history-chart svg,#dry-category-chart svg,#dry-map svg").length !== 3
        || document.querySelectorAll("#dry-context tbody tr").length !== 7) throw new Error("Built drought/table/context mismatch");
      const offered = await (await fetch(document.querySelector("#dry-adapted-database").href)).json();
      if (offered.version !== bundle.version || offered.source.licence !== "ODbL-1.0") throw new Error("Built adapted database offer differs");
      return { bundleStatus: 200, scales: 2, regions: 7, compiledCharts: 3, exactLastMonth: true, separateContext: true, odblOffer: true, version: bundle.version };
    });
    if (failures.length) throw new Error(`Built HTTP failures: ${JSON.stringify(failures)}`);
    return { ...result, builtCandidate: true, failedHttpRequests: 0 };
  } finally { page.off("response", track); }
}
