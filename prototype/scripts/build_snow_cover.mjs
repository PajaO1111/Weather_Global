import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { snowDirectory } from "./archive_snow_cover.mjs";
import { sha256 } from "./audit_7d_sources.mjs";
import { snowApiBase, snowVersion, snowCitation, snowRegions, snowRound, validateSnowBundle } from "../src/snow-cover.js";
export { snowDirectory };

export function parseSnowMonthly(text) {
  const rows = text.trim().split(/\r?\n/).map(line => {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 3 || fields.some(field => !/^\d+$/.test(field))) throw new Error("Invalid snow monthly fields");
    const [year, month, extent] = fields.map(Number);
    if (year < 1966 || year > 2026 || month < 1 || month > 12 || extent > 80_000_000) throw new Error("Invalid snow value/date");
    return { date: `${year}-${String(month).padStart(2, "0")}`, extent };
  });
  if (rows.some((row, i) => i > 0 && row.date <= rows[i - 1].date)) throw new Error("Duplicate/unordered snow month");
  return rows;
}

export async function buildSnowCover() {
  const manifestBytes = await readFile(join(snowDirectory, "source-manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.sources.length !== 9) throw new Error("Incomplete snow provenance");
  const sources = new Map();
  for (const row of manifest.sources) {
    if (!/^[a-z0-9.-]+$/.test(row.file) || row.status !== "archived") throw new Error("Invalid snow archive identity");
    const bytes = await readFile(join(snowDirectory, "sources", row.file));
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw new Error(`Changed snow archive ${row.file}`);
    sources.set(row.file, bytes.toString("utf8"));
  }
  const regions = snowRegions.map(definition => {
    const original = parseSnowMonthly(sources.get(definition.file));
    if (original.length !== 711 || original[0].date !== "1966-11" || original.at(-1).date !== "2026-10") {
      throw new Error(`Unexpected snow coverage ${definition.id}`);
    }
    const byDate = new Map(original.map(row => [row.date, row]));
    const points = Array.from({ length: 720 }, (_, i) => {
      const date = new Date(Date.UTC(1966, 10 + i, 1)).toISOString().slice(0, 7);
      return { date, extent: byDate.get(date)?.extent ?? null, anomaly: null,
        reason: byDate.has(date) ? null : "missing-source" };
    });
    const spring = Array.from({ length: 61 }, (_, i) => {
      const year = 1966 + i;
      const values = [3, 4, 5].map(month => byDate.get(`${year}-${String(month).padStart(2, "0")}`)?.extent);
      const complete = values.every(Number.isFinite);
      return { year, extent: complete ? snowRound((values[0] * 31 + values[1] * 30 + values[2] * 31) / 92) : null,
        anomaly: null, reason: complete ? null : "incomplete-MAM" };
    });
    const reference = [...Array.from({ length: 12 }, (_, i) => String(i + 1)), "MAM"].map(period => {
      const selected = period === "MAM" ? spring.filter(row => row.year >= 1981 && row.year <= 2010)
        : points.filter(row => row.date >= "1981-01" && row.date <= "2010-12" && Number(row.date.slice(5)) === Number(period));
      const valid = selected.filter(row => row.extent !== null);
      if (valid.length !== 30) throw new Error(`Incomplete snow reference ${definition.id}/${period}`);
      const mean = snowRound(valid.reduce((sum, row) => sum + row.extent, 0) / valid.length);
      const all = period === "MAM" ? spring : points.filter(row => Number(row.date.slice(5)) === Number(period));
      for (const row of all) if (row.extent !== null) row.anomaly = snowRound(row.extent - mean);
      return { period, mean, count: valid.length };
    });
    return { ...definition, source_file: definition.file, points, spring, reference };
  });
  const bundle = {
    schema_version: 1, version: snowVersion, publication_allowed: false,
    quantity: "monthly-land-snow-cover-extent", unit: "km2",
    period: { first: "1966-11", last: "2026-10" }, reference_period: { first: 1981, last: 2010 },
    spring_method: "MAM-complete-months-31-30-31-days",
    source: { doi: "10.7289/V5N014G9", version: "v01r01", citation: snowCitation,
      retrieved: "2026-11-06", aggregation: "producer-monthly-day-weighted-weekly-extent", confidence_level: null },
    provenance: { manifest_sha256: sha256(manifestBytes), builder_sha256: sha256(await readFile(fileURLToPath(import.meta.url))),
      files: manifest.sources.map(({ file, bytes, sha256, url }) => ({ file, bytes, sha256, url })) },
    regions,
  };
  if (!validateSnowBundle(bundle)) throw new Error("Snow scientific contract failed");
  const bytes = Buffer.from(JSON.stringify(bundle) + "\n");
  const catalog = { schema_version: 1, version: snowVersion, api_base: snowApiBase, publication_allowed: false,
    product: { file: "bundle.json", version: snowVersion, bytes: bytes.length, sha256: sha256(bytes) } };
  return { bundle, catalog, bytes };
}

async function immutable(path, bytes) {
  try {
    if (!(await readFile(path)).equals(bytes)) throw new Error(`Refusing changed immutable snow product ${path}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(path, bytes, { flag: "wx" });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { bytes, catalog } = await buildSnowCover();
  await immutable(join(snowDirectory, "snow_cover_v1.json"), bytes);
  await immutable(join(snowDirectory, "catalog.json"), Buffer.from(JSON.stringify(catalog, null, 2) + "\n"));
  console.log(`Snow cover: ${bytes.length} bytes, ${catalog.product.sha256}`);
}
