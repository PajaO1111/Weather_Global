import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  historyComparisonApiBase,
  validateHistoryComparisonBundle,
  validateHistoryComparisonCatalog,
} from "../src/history-comparison.js";

const catalogArtifact = "../../data_samples/2026-11-06/continents-history-7c8/catalog.json";
const bundleArtifact = "../../data_samples/2026-11-06/continents-history-7c8/history_comparison_v1.json";
const apiPrefix = `/${historyComparisonApiBase}`;

export function verifyHistoryComparisonArtifact(catalog, bytes) {
  if (!validateHistoryComparisonCatalog(catalog)) {
    throw new Error("Historical comparison catalogue contract mismatch.");
  }
  if (bytes.length !== catalog.product.bytes) {
    throw new Error("Historical comparison bundle byte-length mismatch.");
  }
  if (createHash("sha256").update(bytes).digest("hex") !== catalog.product.sha256) {
    throw new Error("Historical comparison bundle checksum mismatch.");
  }
  const bundle = JSON.parse(bytes.toString("utf8"));
  if (!validateHistoryComparisonBundle(bundle)) {
    throw new Error("Historical comparison bundle contract mismatch.");
  }
  if (bundle.version !== catalog.product.version
    || bundle.publication_allowed !== catalog.publication_allowed
    || bundle.public_release?.version !== catalog.public_release?.version
    || bundle.regions.length !== catalog.regions.length
    || bundle.regions.some((region, index) => {
      const entry = catalog.regions[index];
      return region.id !== entry.id
        || region.name.cs !== entry.name.cs
        || region.name.en !== entry.name.en;
    })) {
    throw new Error("Historical comparison catalogue and bundle identity mismatch.");
  }
  return bytes;
}

export function createHistoryComparisonMiddleware({
  logger = console,
  readCatalog = () => readFile(new URL(catalogArtifact, import.meta.url)),
  readBundle = () => readFile(new URL(bundleArtifact, import.meta.url)),
} = {}) {
  return async (request, response, next) => {
    const [path, query] = (request.url ?? "").split("?");
    const key = path.replace(/^\/weather_global(?=\/)/, "");
    if (!key.startsWith(apiPrefix)) return next();

    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, body) => {
      const payload = Buffer.from(JSON.stringify(body));
      response.statusCode = status;
      response.setHeader("Content-Length", payload.length);
      response.end(request.method === "HEAD" ? undefined : payload);
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

    const catalogPath = `/${historyComparisonApiBase}catalog.json`;
    const bundlePath = `/${historyComparisonApiBase}bundle.json`;
    if (key !== catalogPath && key !== bundlePath) {
      return send(404, { error: "Unknown historical comparison API endpoint." });
    }

    try {
      const catalogBytes = await readCatalog();
      const catalog = JSON.parse(catalogBytes.toString("utf8"));
      if (!validateHistoryComparisonCatalog(catalog)) {
        throw new Error("Historical comparison catalogue contract mismatch.");
      }
      if (key === catalogPath) {
        response.statusCode = 200;
        response.setHeader("Content-Length", catalogBytes.length);
        return response.end(request.method === "HEAD" ? undefined : catalogBytes);
      }

      const bytes = verifyHistoryComparisonArtifact(catalog, await readBundle());
      response.statusCode = 200;
      response.setHeader("Content-Length", bytes.length);
      return response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      logger.error(`Weather Global History Comparison API ${key}: ${error.message}`);
      return send(503, { error: "Verified local historical comparison unavailable." });
    }
  };
}
