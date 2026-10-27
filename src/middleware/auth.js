const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function createAuthMiddleware({ secret = process.env.SECRET_KEY, env = process.env, jwtLib = jwt, pool = null } = {}) {
  if (!secret) {
    throw new Error("SECRET_KEY environment variable is missing. It is required for JWT sessions.");
  }

  function setCurrentRoles(payload) {
    const fallbackUser = () => {
      const rolAbis = payload.rol_abis || payload.rol || "operador";
      const rolSiad = payload.rol_siad || (payload.rol === "admin" ? "admin" : "ninguno");
      return { ...payload, rol: rolAbis, rol_abis: rolAbis, rol_siad: rolSiad };
    };

    if (!pool) {
      return fallbackUser();
    }
    return pool.query(
      "SELECT rol_abis, rol_siad, rol FROM usuarios WHERE LOWER(username) = LOWER($1)",
      [payload.username]
    ).then(({ rows }) => {
      if (rows && rows.length > 0) {
        const row = rows[0];
        const rolAbis = row.rol_abis || row.rol || "operador";
        const rolSiad = row.rol_siad || (row.rol === "admin" ? "admin" : "ninguno");
        return { ...payload, rol: rolAbis, rol_abis: rolAbis, rol_siad: rolSiad };
      }
      return fallbackUser();
    }).catch(() => {
      return fallbackUser();
    });
  }

  function requireAuth(req, res, next) {
    const token = req.cookies?.abis_auth;
    const nextTarget = req.originalUrl || "/abis";
    if (!token) return res.redirect("/login?next=" + encodeURIComponent(nextTarget));
    try {
      const payload = jwtLib.verify(token, secret);
      if (!pool) {
        const user = setCurrentRoles(payload);
        if (user.rol_abis === "ninguno") return res.status(403).send("Tu cuenta no tiene acceso al módulo ABIS.");
        req.user = user;
        return next();
      }
      return setCurrentRoles(payload).then(user => {
        if (!user) return res.status(401).clearCookie("abis_auth", { path: "/" }).redirect("/login");
        if (user.rol_abis === "ninguno") return res.status(403).send("Tu cuenta no tiene acceso al módulo ABIS.");
        req.user = user;
        return next();
      }).catch(err => {
        console.error("Error validando los roles ABIS:", err.message);
        return res.status(503).send("No se pudo validar el acceso en este momento.");
      });
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
      const payload = jwtLib.verify(token, secret);
      if (!pool) {
        const user = setCurrentRoles(payload);
        if (user.rol_abis === "ninguno") return res.status(403).json({ ok: false, error: "Tu cuenta no tiene acceso al módulo ABIS." });
        req.user = user;
        return next();
      }
      return setCurrentRoles(payload).then(user => {
        if (!user) return res.status(401).json({ ok: false, error: "Cuenta no encontrada." });
        if (user.rol_abis === "ninguno") return res.status(403).json({ ok: false, error: "Tu cuenta no tiene acceso al módulo ABIS." });
        req.user = user;
        return next();
      }).catch(err => {
        console.error("Error validando los roles ABIS:", err.message);
        return res.status(503).json({ ok: false, error: "No se pudo validar el acceso en este momento." });
      });
    } catch (_) {
      return res.status(401).json({ ok: false, error: "Token inválido" });
    }
  }

  return { requireAuth, apiRequireAuth };
}

module.exports = { createAuthMiddleware };
