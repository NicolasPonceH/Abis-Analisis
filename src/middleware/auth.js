const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function createAuthMiddleware({ secret = process.env.SECRET_KEY, env = process.env, jwtLib = jwt } = {}) {
  if (!secret) {
    throw new Error("SECRET_KEY environment variable is missing. It is required for JWT sessions.");
  }

  function requireAuth(req, res, next) {
    const token = req.cookies?.abis_auth;
    const nextTarget = req.originalUrl || "/abis";
    if (!token) return res.redirect("/login?next=" + encodeURIComponent(nextTarget));
    try {
      const payload = jwtLib.verify(token, secret);
      req.user = payload;
      return next();
    } catch (_) {
      return res.redirect("/login?next=" + encodeURIComponent(nextTarget));
    }
  }

  function apiRequireAuth(req, res, next) {
    if (req.path.startsWith("/login")) return next();
    if (req.path === "/oracle/populate") {
      const providedToken = req.headers["x-abis-integration-token"] ||
        ((req.headers.authorization || "").startsWith("Bearer ")
          ? req.headers.authorization.slice("Bearer ".length).trim()
          : "");
      if (providedToken) {
        const configuredToken = env.ORACLE_INGEST_TOKEN;
        if (!configuredToken || configuredToken.length < 32) {
          return res.status(503).json({
            ok: false,
            error: "La integracion Oracle no esta configurada con un token seguro en ABIS.",
            codigo: "INTEGRATION_NOT_CONFIGURED",
          });
        }
        const expected = Buffer.from(configuredToken, "utf8");
        const received = Buffer.from(String(providedToken).trim(), "utf8");
        if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
          return res.status(401).json({
            ok: false,
            error: "Token de integracion Oracle invalido.",
            codigo: "INTEGRATION_UNAUTHORIZED",
          });
        }
        req.user = { username: env.ORACLE_INGEST_USER || "oracle-integration", rol: "integracion" };
        req.integrationAuth = true;
        return next();
      }
    }

    const token = req.cookies?.abis_auth;
    if (!token) return res.status(401).json({ ok: false, error: "No autorizado" });
    try {
      req.user = jwtLib.verify(token, secret);
      return next();
    } catch (_) {
      return res.status(401).json({ ok: false, error: "Token inválido" });
    }
  }

  return { requireAuth, apiRequireAuth };
}

module.exports = { createAuthMiddleware };
