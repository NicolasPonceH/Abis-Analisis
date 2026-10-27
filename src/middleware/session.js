// Complementa la verificación JWT global; no solicita una segunda contraseña.
function requireSessionUser(req, res, next) {
  if (!req.user?.username) {
    return res.status(401).json({
      ok: false, error: "Se requiere una sesión autenticada.", codigo: "AUTH_REQUIRED",
    });
  }
  return next();
}

function localRedirect(value, fallback = "/abis") {
  return typeof value === "string" && value.startsWith("/") &&
    !value.startsWith("//") && !/[\\\u0000-\u0020]/.test(value)
    ? value : fallback;
}

module.exports = { requireSessionUser, localRedirect };
