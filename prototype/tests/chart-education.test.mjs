import test from "node:test";
import assert from "node:assert/strict";
import { chartEducation, chartGuides } from "../src/chart-education.js";

test("every main chart has bilingual description, source, limitations and separate glossary", () => {
  assert.deepEqual(Object.keys(chartGuides).sort(), [
    "co2", "temperature", "roni", "sst", "ohc", "gmsl", "global-history", "global-future",
    "legacy", "europe-history", "europe-coverage", "europe-cmip6", "cds", "sea-level",
  ].sort());
  for (const [id, guide] of Object.entries(chartGuides)) {
    assert.match(guide.source[1], /^https:\/\//);
    for (const language of ["cs", "en"]) {
      const html = chartEducation(id, language);
      assert.match(html, /class="panel chart-description"/);
      assert.match(html, /class="panel chart-glossary"/);
      assert.ok(html.indexOf("chart-glossary") > html.indexOf("chart-description"));
      assert.ok(html.includes(language === "cs" ? "Co z grafu nelze vyčíst" : "What the chart cannot tell you"));
      assert.ok(html.includes(guide.source[1]));
      assert.ok(!html.includes("undefined"));
      assert.ok(guide.description[language === "cs" ? 0 : 1].length > 100);
    }
  }
  assert.throws(() => chartEducation("unknown", "cs"), /Unknown/);
  assert.throws(() => chartEducation("cds", "de"), /Unknown/);
});

test("scenario families and uncertainty explanations remain product-specific", () => {
  const cds = chartEducation("cds", "en");
  assert.match(cds, /<dt>RCP4.5<\/dt>/);
  assert.match(cds, /<dt>RCP8.5<\/dt>/);
  assert.doesNotMatch(cds, /<dt>SSP/);
  assert.match(cds, /not raw model output|or raw model output/);
  for (const id of ["global-future", "europe-cmip6", "sea-level"]) {
    const html = chartEducation(id, "en");
    for (const scenario of ["SSP1-2.6", "SSP2-4.5", "SSP3-7.0", "SSP5-8.5"]) {
      assert.ok(html.includes(`<dt>${scenario}</dt>`));
    }
    assert.match(html, /not forecasts with assigned probabilities/);
  }
  const legacy = chartEducation("legacy", "en");
  assert.match(legacy, /<dt>SSP1-2.6<\/dt>/);
  assert.doesNotMatch(legacy, /<dt>SSP2-4.5<\/dt>/);
  assert.match(chartEducation("global-history", "en"), /not a probability interval/);
  assert.match(chartEducation("sea-level", "en"), /medium-confidence workflow envelope/);
  assert.match(chartEducation("europe-coverage", "en"), /only months present/);
  assert.match(chartEducation("temperature", "en"), /1951–1980/);
  assert.match(chartEducation("europe-history", "en"), /1981–2010/);
  assert.match(chartEducation("global-future", "en"), /1850–1900/);
});
