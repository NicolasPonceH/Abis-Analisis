function apiErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.code === "LIMIT_FILE_SIZE" ? 413 : error.status || 500;
  return res.status(status).json({
    ok: false,
    error: status === 500 ? "Error interno del servidor." : error.message,
  });
}

module.exports = { apiErrorHandler };
