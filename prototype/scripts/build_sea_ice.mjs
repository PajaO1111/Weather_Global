import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  seaIceApiBase, seaIceCitation, seaIceVersion, validateSeaIceBundle,
} from "../src/sea-ice.js";

export const seaIceDirectory = fileURLToPath(new URL("../../data_samples/2026-11-06/sea-ice-7d1/", import.meta.url));
const evidence = new URL("../../data_samples/2026-11-06/phase7d-feasibility/", import.meta.url);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const rounded = value => Math.round(value * 1e6) / 1e6;

export async function buildSeaIceProduct() {
  const manifestBytes = await readFile(new URL("source-manifest.json", evidence));
  const manifest = JSON.parse(manifestBytes);
  const files = [];
  const regions = [];
  for (const id of ["N", "S"]) {
    const points = [];
    for (let month = 1; month <= 12; month++) {
      const file = `${id}_${String(month).padStart(2, "0")}_extent_v4.0.csv`;
      const entry = manifest.sources.find(row => row.file === file && row.status === "archived");
      const bytes = await readFile(new URL(`sources/${file}`, evidence));
      if (!entry || entry.bytes !== bytes.length || entry.sha256 !== sha(bytes)) throw new Error(`Unverified source ${file}`);
      files.push({ file, bytes: bytes.length, sha256: sha(bytes), url: entry.url });
      const lines = bytes.toString("utf8").trim().split(/\r?\n/);
      if (lines.shift().split(",").map(value => value.trim()).join(",") !== "year,mo,source_dataset,region,extent,area") {
        throw new Error(`Unexpected CSV header ${file}`);
      }
      for (const line of lines) {
        const match = line.match(/^(\d{4}),\s*(\d{1,2}),\s*(?:"([^"]+)"|([^,]+)),\s*([NS]),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*$/);
        if (!match) throw new Error(`Invalid CSV row ${file}: ${line}`);
        const fields = [match[1], match[2], (match[3] ?? match[4]).trim(), match[5], match[6], match[7]];
        if (Number(fields[1]) !== month || fields[3] !== id) {
          throw new Error(`Invalid CSV row ${file}: ${line}`);
        }
        const raw = Number(fields[4]);
        const missing = raw === -9999;
        if ((!missing && (!Number.isFinite(raw) || raw < 0 || raw > 40))
          || (missing && fields[2] !== "-9999")) throw new Error(`Invalid extent ${file}`);
        points.push({
          date: `${fields[0]}-${String(month).padStart(2, "0")}`,
          extent: missing ? null : raw, anomaly: null,
          source_dataset: missing ? null : fields[2], reason: missing ? "missing-source" : null,
        });
      }
    }
    points.sort((a, b) => a.date.localeCompare(b.date));
    const reference = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const rows = points.filter(point => Number(point.date.slice(5)) === month
        && point.date >= "1981-01" && point.date <= "2010-12");
      const valid = rows.filter(point => point.extent !== null);
      if (rows.length !== 30 || valid.length < 29) throw new Error(`Incomplete reference ${id}/${month}`);
      return { month, count: valid.length,
        mean: rounded(valid.reduce((sum, point) => sum + point.extent, 0) / valid.length),
        missing_years: rows.filter(point => point.extent === null).map(point => Number(point.date.slice(0, 4))) };
    });
    for (const point of points) {
      if (point.extent !== null) point.anomaly = rounded(point.extent - reference[Number(point.date.slice(5)) - 1].mean);
    }
    regions.push({ id, name: id === "N" ? { cs: "Arktida", en: "Arctic" }
      : { cs: "Antarktida · mořský led", en: "Antarctic · sea ice" }, reference, points });
  }
  const bundle = {
    schema_version: 1, version: seaIceVersion, publication_allowed: false,
    quantity: "monthly-sea-ice-extent", unit: "million km2",
    period: { first: "1978-11", last: "2026-10" },
    reference_period: { first: 1981, last: 2010, method: "available-calendar-month-mean-no-fill" },
    source: { product: "G02135", version: 4, doi: "10.7265/a98x-0f50",
      citation: seaIceCitation, retrieved: "2026-11-06", threshold_percent: 15 },
    provenance: { manifest_sha256: sha(manifestBytes),
      builder_sha256: sha(await readFile(fileURLToPath(import.meta.url))), files },
    regions,
  };
  if (!validateSeaIceBundle(bundle)) throw new Error("Generated sea ice product fails contract");
  const bundleBytes = encode(bundle);
  const catalog = {
    schema_version: 1, version: seaIceVersion, publication_allowed: false,
    api_base: seaIceApiBase,
    product: { file: "bundle.json", version: seaIceVersion, bytes: bundleBytes.length, sha256: sha(bundleBytes) },
  };
  return { bundle, catalog, bundleBytes, catalogBytes: encode(catalog) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const product = await buildSeaIceProduct();
  await mkdir(seaIceDirectory, { recursive: true });
  for (const [name, bytes] of [["sea_ice_v1.json", product.bundleBytes], ["catalog.json", product.catalogBytes]]) {
    const path = resolve(seaIceDirectory, name);
    try {
      const old = await readFile(path);
      if (!old.equals(bytes)) throw new Error(`Refusing to overwrite different artefact: ${name}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await writeFile(path, bytes, { flag: "wx" });
    }
  }
  console.log(`Verified ${product.bundleBytes.length} bytes, SHA-256 ${product.catalog.product.sha256}`);
}
