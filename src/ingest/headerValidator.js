const { EXPECTED_COLUMNS } = require("./headerSchema");

// Compara las cabeceras leidas del Excel contra EXPECTED_COLUMNS.
// No lanza excepcion: devuelve { ok, missing, unexpected } para que el llamador decida
// como reportar el error (log, respuesta HTTP, mensaje de Telegram, etc.).
function validateHeaders(actualHeaders) {
  const normalizedActual = actualHeaders.map((h) => h.trim());
  const expectedHeaders = EXPECTED_COLUMNS.map((c) => c.header);

  const missing = EXPECTED_COLUMNS
    .filter((c) => c.required && !normalizedActual.includes(c.header))
    .map((c) => c.header);

  const unexpected = normalizedActual.filter((h) => !expectedHeaders.includes(h));

  return { ok: missing.length === 0, missing, unexpected };
}

module.exports = { validateHeaders };
