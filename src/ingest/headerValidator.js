const { EXPECTED_COLUMNS, findMatchingHeader } = require("./headerSchema");

// Compara las cabeceras leidas del Excel contra EXPECTED_COLUMNS (soportando alias).
// No lanza excepcion: devuelve { ok, missing, unexpected } para que el llamador decida
// como reportar el error (log, respuesta HTTP, mensaje de Telegram, etc.).
function validateHeaders(actualHeaders) {
  const missing = EXPECTED_COLUMNS
    .filter((c) => c.required && !findMatchingHeader(c, actualHeaders))
    .map((c) => c.header);

  return { ok: missing.length === 0, missing, actualHeaders };
}

module.exports = { validateHeaders };

