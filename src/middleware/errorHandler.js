function wantsJson(req) {
  return req.path.startsWith("/api/") || req.is("application/json") ||
    (req.accepts("json") && !req.accepts("html"));
}

function publicMessage(status, error) {
  if (status === 413) return "El archivo supera el tamaño permitido.";
  if (status === 403) return "Tu cuenta no tiene permiso para ver esta página.";
  if (status === 404) return "No encontramos la página que buscas.";
  if (status === 503) return "El servicio no está disponible por el momento. Inténtalo nuevamente.";
  if (status >= 500) return "Ocurrió un problema inesperado. El equipo técnico ya puede revisar el registro del servidor.";
  return error?.message || "No se pudo completar la solicitud.";
}

function notFoundHandler(req, res) {
  const status = 404;
  const message = publicMessage(status);
  if (wantsJson(req)) return res.status(status).json({ ok: false, error: message });
  return res.status(status).render("error", { status, message });
}

function apiErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.code === "LIMIT_FILE_SIZE" ? 413 : error.status || 500;
  if (status >= 500) console.error("Error de solicitud:", error);
  const message = publicMessage(status, error);
  if (wantsJson(req)) return res.status(status).json({ ok: false, error: message });
  return res.status(status).render("error", { status, message });
}

module.exports = { apiErrorHandler, notFoundHandler };
