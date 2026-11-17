const escape = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

export function chartExplanation(id, language, description, glossary, source = null) {
  if (!id || !["cs", "en"].includes(language) || !Array.isArray(description)
    || description.length !== 2 || !Array.isArray(glossary)) {
    throw new Error("Invalid chart explanation");
  }
  const index = language === "cs" ? 0 : 1;
  const terms = glossary.map(([term, definition]) => {
    if (!Array.isArray(term) || term.length !== 2 || !Array.isArray(definition)
      || definition.length !== 2) {
      throw new Error("Invalid chart glossary term");
    }
    return `<dt>${escape(term[index])}</dt><dd>${escape(definition[index])}</dd>`;
  }).join("");
  const sourceMarkup = source
    ? `<p>${language === "cs" ? "Odborný zdroj" : "Scientific source"}: <a href="${escape(source.url)}">${escape(source.label)}</a>.</p>`
    : "";
  return `<section class="panel chart-description" data-chart-explanation="${escape(id)}">
    <h2>${language === "cs" ? "Popis grafu" : "Chart description"}</h2>
    <p>${escape(description[index])}</p>
    <h3>${language === "cs" ? "Slovníček pojmů" : "Glossary"}</h3>
    <dl>${terms}</dl>${sourceMarkup}
  </section>`;
}
