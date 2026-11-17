import { createHash } from "node:crypto";

export function verifyLocalProduct(catalog, bytes, { label, validateCatalog, validateBundle }) {
  if (!validateCatalog(catalog)) throw new Error(`${label} catalogue contract mismatch`);
  if (bytes.length !== catalog.product.bytes
    || createHash("sha256").update(bytes).digest("hex") !== catalog.product.sha256) {
    throw new Error(`${label} bytes/checksum mismatch`);
  }
  const bundle = JSON.parse(bytes.toString("utf8"));
  if (!validateBundle(bundle) || bundle.version !== catalog.product.version
    || bundle.publication_allowed !== catalog.publication_allowed
    || bundle.public_release?.version !== catalog.public_release?.version) {
    throw new Error(`${label} bundle contract mismatch`);
  }
  return bytes;
}

export function createLocalProductMiddleware({
  apiBase, label, logger = console, readCatalog, readBundle, validateCatalog, validateBundle,
}) {
  return async (request, response, next) => {
    const [path, query] = (request.url ?? "").split("?");
    const key = path.replace(/^\/weather_global(?=\/)/, "");
    if (!key.startsWith(`/${apiBase}`)) return next();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, body) => {
      const bytes = Buffer.from(JSON.stringify(body));
      response.statusCode = status;
      response.setHeader("Content-Length", bytes.length);
      response.end(request.method === "HEAD" ? undefined : bytes);
    };
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)
      || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(request.headers.host ?? "")) {
      return send(403, { error: "Local preview only." });
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      response.setHeader("Allow", "GET, HEAD");
      return send(405, { error: "Method not allowed." });
    }
    if (query !== undefined) return send(400, { error: "Query parameters are not supported." });
    if (!["catalog.json", "bundle.json"].some(name => key === `/${apiBase}${name}`)) {
      return send(404, { error: `Unknown ${label.toLowerCase()} endpoint.` });
    }
    try {
      const catalogBytes = await readCatalog();
      const catalog = JSON.parse(catalogBytes.toString("utf8"));
      const bundleBytes = verifyLocalProduct(catalog, await readBundle(), { label, validateCatalog, validateBundle });
      const bytes = key.endsWith("/catalog.json") ? catalogBytes : bundleBytes;
      response.statusCode = 200;
      response.setHeader("Content-Length", bytes.length);
      return response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      logger.error(`Weather Global ${label} API ${key}: ${error.message}`);
      return send(503, { error: `Verified local ${label.toLowerCase()} unavailable.` });
    }
  };
}
