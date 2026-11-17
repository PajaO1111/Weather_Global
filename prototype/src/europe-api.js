export const europeApiBase = "europe-api/v1/";

export const legacyEuropeGeographyWarning = {
  cs: "Geografická chyba masky v1: zahrnovala také část severní Afriky. Tyto původní evropské NASA/CMIP6 výsledky nejsou geograficky validované a vyžadují samostatně schválený přepočet s opravenou maskou. Soubory a čísla zůstávají zachovány pro audit; nejde o výsledky nové v3. CDS EU27 tuto vlastní masku nepoužívá.",
  en: "Mask v1 geography error: it also included part of North Africa. These original European NASA/CMIP6 results are not geographically validated and require separately approved recomputation with a corrected mask. Files and numbers are retained for audit; they are not new v3 results. Producer CDS EU27 does not use this custom mask.",
};

const legacyMaskGate = { code: "legacy-mask-geography-recomputation", ...legacyEuropeGeographyWarning };

export const europeCatalog = {
  schema_version: 1,
  api_version: "v1",
  status: "local-development-only-not-public-release",
  publication_allowed: false,
  products: [
    {
      id: "cmip6", route: "europe-cmip6", endpoint: `${europeApiBase}cmip6.json`,
      version: "7c3c-europe-pair-anomalies-v1",
      sha256: "ef75363408e5ad65cd14e20cf94be156ab139fc384f121415a489460f7cfb5f9",
      title: { cs: "CMIP6 — dva modely", en: "CMIP6 — two models" },
      geography: { cs: "Vlastní fyzická maska Evropy, nikoli EU27", en: "Custom physical Europe mask, not EU27" },
      geography_status: "invalid-legacy-mask-requires-recomputation",
      geography_warning: legacyEuropeGeographyWarning,
      measure: { cs: "Anomálie °C vůči vlastní modelové referenci 1981–2010",
        en: "Anomalies in °C relative to each model's 1981–2010 reference" },
      scope: { cs: "1850–2014: modelovaná historie; 2015–2100: SSP1-2.6, SSP2-4.5, SSP3-7.0, SSP5-8.5",
        en: "1850–2014: modelled history; 2015–2100: SSP1-2.6, SSP2-4.5, SSP3-7.0, SSP5-8.5" },
      interpretation: { cs: "ACCESS-CM2 a CanESM5; min–max je popis dvou modelů, nikoli pravděpodobnostní interval.",
        en: "ACCESS-CM2 and CanESM5; min–max describes two models, not a probability interval." },
      license: "CC-BY-SA-4.0",
      publication_allowed: false,
      publication_gates: [
        legacyMaskGate,
        { code: "public-release-review", cs: "Schválit veřejné vydání, atribuci a splnění CC BY-SA 4.0.",
          en: "Approve public release, attribution and CC BY-SA 4.0 compliance." },
      ],
    },
    {
      id: "history", route: "europe-history", endpoint: `${europeApiBase}history.json`,
      version: "7c4c-europe-nasa-history-v1",
      sha256: "6798265e06d8e140452ed63bf9a5fdbe414aa039c3ffc7f9eb46f23926cfac70",
      title: { cs: "NASA — historická analýza", en: "NASA — historical analysis" },
      geography: { cs: "Vlastní fyzická maska Evropy; dostupná plocha se mění v čase",
        en: "Custom physical Europe mask; available area varies with time" },
      geography_status: "invalid-legacy-mask-requires-recomputation",
      geography_warning: legacyEuropeGeographyWarning,
      measure: { cs: "Anomálie °C, regionální reference 1981–2010; neodečítat 273,15",
        en: "Anomalies in °C, regional 1981–2010 reference; do not subtract 273.15" },
      scope: { cs: "1880–2026: 147 pozic, 132 platných let 1894–2025; rok 2026 jen leden–září",
        en: "1880–2026: 147 positions, 132 valid years 1894–2025; 2026 January–September only" },
      interpretation: { cs: "Pozorovací griddovaná analýza s vyhlazením 250 km, nikoli reanalýza nebo surové stanice. Pokrytí není nejistota.",
        en: "Observation-derived gridded analysis with 250km smoothing, not reanalysis or raw stations. Coverage is not uncertainty." },
      license: null,
      publication_allowed: false,
      publication_gates: [
        legacyMaskGate,
        { code: "nasa-product-use-and-citation", cs: "Ověřit oficiální podmínky použití a citace produktu NASA.",
          en: "Verify official NASA product-use and citation terms." },
        { code: "public-release-review", cs: "Schválit veřejné vydání s explicitními mezerami a pokrytím.",
          en: "Approve public release with explicit gaps and coverage." },
      ],
    },
    {
      id: "cds", route: "europe-pilot", endpoint: `${europeApiBase}cds.json`,
      version: "7c2e-eu27-preview-1",
      sha256: "0aee1c1d7617657451ea624be7206b73d43878d0ea43aa630bdeac278a76132f",
      title: { cs: "CDS — EU27 technický pilot", en: "CDS — EU27 technical preview" },
      geography: { cs: "Region EU27 od producenta; není vlastní fyzická maska Evropy",
        en: "Producer's EU27 region; not the custom physical Europe mask" },
      measure: { cs: "Absolutní teplota °C = K − 273,15; bez anomálií a ensemble statistik",
        en: "Absolute temperature °C = K − 273.15; no anomalies or ensemble statistics" },
      scope: { cs: "2006–2098; devět kombinací GCM–RCM–realizace; RCP4.5 a RCP8.5",
        en: "2006–2098; nine GCM–RCM–member combinations; RCP4.5 and RCP8.5" },
      interpretation: { cs: "Metodika ECDE zůstává nevyřešená. RCP nelze vydávat za totožné SSP; řady se nepřepojují.",
        en: "ECDE methodology remains unresolved. RCPs are not identical to SSPs; series are not spliced." },
      license: "CC-BY-4.0",
      publication_allowed: false,
      publication_gates: [
        { code: "cds-producer-methodology", cs: "Vyjasnit agregaci, time: point a rozdíly historických částí RCP až 0,917 K.",
          en: "Clarify aggregation, time: point and RCP historical differences up to 0.917 K." },
        { code: "public-release-review", cs: "Schválit veřejné vydání a atribuci CDS.",
          en: "Approve public release and CDS attribution." },
      ],
    },
  ],
};

export function validateEuropeCatalog(value) {
  // The v1 client accepts only the reviewed product identities and publication gates.
  return JSON.stringify(value) === JSON.stringify(europeCatalog);
}
