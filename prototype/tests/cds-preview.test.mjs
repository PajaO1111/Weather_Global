import test from "node:test";
import assert from "node:assert/strict";
import { validateCdsPreview, cdsScenarios, cdsMembers } from "../src/cds-preview.js";

const artifact = () => ({
  schema_version: 1, version: "7c2e-eu27-preview-1",
  status: "local-technical-preview-methodology-unresolved",
  region: "EU27", source_unit: "K", unit: "degC",
  conversion: "T_C = T_K - 273.15", horizon: [2006, 2098],
  anomalies: false, ensemble_statistics: false,
  download_manifest_sha256: "a".repeat(64), license: "CC-BY-4.0", attribution: "C3S",
  members: cdsMembers.map((id) => {
    const member = id.split("_").at(-1);
    const rcm = id.includes("cclm4_8_17") ? "cclm4_8_17" : id.split("_").at(-2);
    const gcm = id.slice(0, -(rcm.length + member.length + 2));
    return {
      id, gcm, rcm, member,
      scenarios: Object.fromEntries(cdsScenarios.map((scenario) => [scenario,
        Array.from({ length: 93 }, (_, i) => ({ date: String(2006 + i), value: 10 + i / 100 }))])),
      sources: Object.fromEntries(cdsScenarios.map((scenario) =>
        [scenario, { file: `${id}-${scenario}.nc`, sha256: "b".repeat(64) }])),
    };
  }),
});

test("EU27 preview contains nine independent selections and 1674 Celsius points", () => {
  const data = artifact();
  assert.equal(validateCdsPreview(data), true);
  assert.equal(data.members.flatMap((member) => cdsScenarios.flatMap(
    (id) => member.scenarios[id],
  )).length, 1674);
});

test("preview rejects missing years, non-finite values, wrong units and hidden rebasing", () => {
  for (const mutate of [
    (data) => { data.unit = "K"; },
    (data) => { data.anomalies = true; },
    (data) => { data.ensemble_statistics = true; },
    (data) => { data.members[0].scenarios.rcp_4_5[0].date = "1979"; },
    (data) => { data.members[0].scenarios.rcp_4_5[0].value = null; },
    (data) => { data.members[0].scenarios.rcp_4_5[0].value = Infinity; },
    (data) => { data.members[0].scenarios.rcp_4_5.pop(); },
    (data) => { data.members[0].sources.rcp_4_5.sha256 = ""; },
    (data) => { data.members[1] = data.members[0]; },
  ]) {
    const data = artifact();
    mutate(data);
    assert.equal(validateCdsPreview(data), false);
  }
});
