import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { continentsApiBase, validateContinentsCatalog, validateContinentalBundle } from "../src/continents-preview.js";

const catalogArtifact = "../../data_samples/2026-11-06/continents-7c-completion/catalog.json";
const bundleArtifact = "../../data_samples/2026-11-06/continents-7c-completion/continental_temperatures_v1.json";
const apiPrefix = `/${continentsApiBase}`;

export function verifyContinentsArtifact(catalog, bytes) {
  if (!validateContinentsCatalog(catalog)) throw new Error("Continental catalogue contract mismatch.");
  const product = catalog.product;
  if (bytes.length !== product.bytes) throw new Error("Continental bundle byte-length mismatch.");
  if (createHash("sha256").update(bytes).digest("hex") !== product.sha256) {
    throw new Error("Continental bundle checksum mismatch.");
  }
  const bundle = JSON.parse(bytes.toString("utf8"));
  if (!validateContinentalBundle(bundle)) throw new Error("Continental bundle contract mismatch.");
  if (bundle.version !== product.version
    || bundle.publication_allowed !== catalog.publication_allowed
    || bundle.public_release?.version !== catalog.public_release?.version
    || bundle.regions.length !== catalog.regions.length
    || bundle.regions.some((region, index) => {
      const entry = catalog.regions[index];
      return region.id !== entry.id
        || region.status !== entry.status
        || region.name.cs !== entry.name.cs
        || region.name.en !== entry.name.en;
    })) {
    throw new Error("Continental catalogue and bundle identity mismatch.");
  }
  return bytes;
}

export function createContinentsMiddleware({
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

    const catalogPath = `/${continentsApiBase}catalog.json`;
    const bundlePath = `/${continentsApiBase}bundle.json`;
    if (key !== catalogPath && key !== bundlePath) {
      return send(404, { error: "Unknown continental API endpoint." });
    }

    try {
      const catalogBytes = await readCatalog();
      const catalog = JSON.parse(catalogBytes.toString("utf8"));
      if (!validateContinentsCatalog(catalog)) throw new Error("Continental catalogue contract mismatch.");
      if (key === catalogPath) {
        response.statusCode = 200;
        response.setHeader("Content-Length", catalogBytes.length);
        return response.end(request.method === "HEAD" ? undefined : catalogBytes);
      }

      const bytes = verifyContinentsArtifact(catalog, await readBundle());
      response.statusCode = 200;
      response.setHeader("Content-Length", bytes.length);
      return response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      logger.error(`Weather Global Continents API ${key}: ${error.message}`);
      return send(503, { error: "Verified local continental data unavailable." });
    }
  };
}
