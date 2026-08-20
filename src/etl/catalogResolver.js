const { findClosestMatch } = require("./fuzzyMatch");

// Maxima distancia de edicion para aceptar una correccion automatica. Mas alla de esto,
// preferimos rechazar la fila (Sprint 2) antes que adivinar mal un catalogo.
const MAX_DISTANCE = 2;

// Resuelve un texto normalizado contra un catalogo (Map texto -> ID). Primero intenta
// coincidencia exacta (comportamiento de Sprint 2); si falla, intenta una correccion
// automatica por tipeo (Sprint 3). Devuelve null si no hay ninguna coincidencia aceptable.
function resolve(map, normalizedText) {
  if (map.has(normalizedText)) {
    return { id: map.get(normalizedText), corrected: false };
  }

  const match = findClosestMatch(normalizedText, [...map.keys()], MAX_DISTANCE);
  if (!match) return null;

  return { id: map.get(match), corrected: true, original: normalizedText, matched: match };
}

module.exports = { resolve, MAX_DISTANCE };
