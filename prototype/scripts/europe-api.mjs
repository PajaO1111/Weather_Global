import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { europeCatalog } from "../src/europe-api.js";
import { validateCdsPreview } from "../src/cds-preview.js";
import { validateCmip6Preview } from "../src/cmip6-preview.js";
import { validateHistoryPreview } from "../src/history-preview.js";

const artifacts = {
  cmip6: {
    file: "../../data_samples/2026-11-06/europe-cmip6-pair/europe_pair_anomalies_v1.json",
    validate: validateCmip6Preview,
  },
  history: {
    file: "../../data_samples/2026-11-06/europe-history/europe_history_v1.json",
    validate: validateHistoryPreview,
  },
  cds: {
    file: "../../data_samples/2026-11-06/europe-cds-annual/validation/eu27_preview.json",
    validate: validateCdsPreview,
  },
};
const aliases = { "/cmip6-preview.json": "cmip6", "/history-preview.json": "history", "/cds-preview.json": "cds" };

export function verifyEuropeArtifact(product, bytes, validate) {
  if (createHash("sha256").update(bytes).digest("hex") !== product.sha256) {
    throw new Error("Local European product checksum mismatch.");
  }
  if (!validate(JSON.parse(bytes.toString("utf8")))) {
    throw new Error("Local European product contract mismatch.");
  }
  return bytes;
}

export function createEuropeMiddleware({
  logger = console,
  readArtifact = (artifact) => readFile(new URL(artifact.file, import.meta.url)),
} = {}) {
  return async (request, response, next) => {
    const [path, query] = (request.url ?? "").split("?");
    const key = path.replace(/^\/weather_global(?=\/)/, "");
    if (!key.startsWith("/europe-api/") && !Object.hasOwn(aliases, key)) return next();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, body) => {
      response.statusCode = status;
      response.end(request.method === "HEAD" ? undefined : JSON.stringify(body));
    };
    const remote = request.socket.remoteAddress;
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)
      || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(request.headers.host ?? "")) {
      return send(403, { error: "Local preview only." });
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      response.setHeader("Allow", "GET, HEAD");
      return send(405, { error: "Method not allowed." });
    }
    if (query !== undefined) return send(400, { error: "Query parameters are not supported." });
    if (key === "/europe-api/v1/catalog.json") return send(200, europeCatalog);
    const product = europeCatalog.products.find((entry) =>
      key === `/${entry.endpoint}` || aliases[key] === entry.id);
    if (!product) return send(404, { error: "Unknown European product or API version." });
    try {
      const artifact = artifacts[product.id];
      const bytes = verifyEuropeArtifact(product, await readArtifact(artifact), artifact.validate);
      response.statusCode = 200;
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      logger.error(`Weather Global Europe API ${key}: ${error.message}`);
      send(503, { error: "Verified local European product unavailable." });
    }
  };
}
