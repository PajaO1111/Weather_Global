import test from "node:test";
import assert from "node:assert/strict";
import { chartExplanation } from "../src/chart-explanation.js";

test("chart explanation renders a localized description and its own glossary", () => {
  const html = chartExplanation("annual-budget", "cs", ["Popis", "Description"], [
    [["Propad", "Sink"], ["Přesun uhlíku do úložiště.", "Transfer of carbon into a reservoir."]],
  ]);
  assert.match(html, /data-chart-explanation="annual-budget"/);
  assert.match(html, /<h2>Popis grafu<\/h2>/);
  assert.match(html, /<dt>Propad<\/dt><dd>Přesun uhlíku do úložiště\.<\/dd>/);
});

test("chart explanation escapes content and rejects incomplete localization", () => {
  const html = chartExplanation("a&b", "en", ["<nebezpečné>", "Safe"], [
    [["Pojem", "Term"], ["Definice", "<script>"]],
  ], { label: "<Paper>", url: "https://example.test/?a=1&b=2" });
  assert.match(html, /data-chart-explanation="a&amp;b"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /a=1&amp;b=2/);
  assert.throws(() => chartExplanation("bad", "fr", ["Česky"], []), /Invalid chart explanation/);
});
