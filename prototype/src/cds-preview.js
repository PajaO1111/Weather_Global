const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const cdsScenarios = ["rcp_4_5", "rcp_8_5"];
export const cdsMembers = [
  "ec_earth_hirham5_r3i1p1", "ec_earth_racmo22e_r1i1p1", "ec_earth_rca4_r12i1p1",
  "hadgem2_es_racmo22e_r1i1p1", "hadgem2_es_rca4_r1i1p1", "ipsl_cm5a_mr_wrf381p_r1i1p1",
  "mpi_esm_lr_cclm4_8_17_r1i1p1", "mpi_esm_lr_rca4_r1i1p1", "noresm1_m_hirham5_r1i1p1",
];

export function validateCdsPreview(data) {
  return record(data)
    && data.schema_version === 1
    && data.version === "7c2e-eu27-preview-1"
    && data.status === "local-technical-preview-methodology-unresolved"
    && data.region === "EU27" && data.source_unit === "K" && data.unit === "degC"
    && data.conversion === "T_C = T_K - 273.15"
    && data.anomalies === false && data.ensemble_statistics === false
    && Array.isArray(data.horizon) && data.horizon.length === 2
    && data.horizon[0] === 2006 && data.horizon[1] === 2098
    && hash(data.download_manifest_sha256)
    && data.license === "CC-BY-4.0"
    && typeof data.attribution === "string" && data.attribution.length > 0
    && Array.isArray(data.members) && data.members.length === 9
    && new Set(data.members.map((member) => member?.id)).size === 9
    && data.members.every((member) => record(member) && cdsMembers.includes(member.id)
      && member.id === `${member.gcm}_${member.rcm}_${member.member}`
      && record(member.scenarios) && record(member.sources)
      && cdsScenarios.every((id) => Array.isArray(member.scenarios[id])
        && member.scenarios[id].length === 93
        && member.scenarios[id].every((point, index) => record(point)
          && point.date === String(2006 + index) && Number.isFinite(point.value)
          && point.value > -123.15 && point.value < 76.85)
        && record(member.sources[id]) && hash(member.sources[id].sha256)
        && typeof member.sources[id].file === "string"));
}
