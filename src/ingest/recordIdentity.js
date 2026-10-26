const { createHmac } = require('node:crypto');
const { obtenerClave } = require('../security/crypto');

// Separada del contenido cifrado (que cambia de IV en cada carga). No guarda
// documentos ni nombres en claro. La clave debe conservarse con la base de datos.
function createFingerprint() {
  const key = obtenerClave();
  return parts => createHmac('sha256', key).update(JSON.stringify(['abis-ingesta-v1', ...parts])).digest('hex');
}

function text(value) {
  if (value == null) return '';
  const result = String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
  return ['NULL', '(NULL)'].includes(result) ? '' : result;
}

function normalizeTime(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1) {
    const seconds = Math.round(value * 86400) % 86400;
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(part => String(part).padStart(2, '0')).join(':');
  }
  const match = text(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] || 0) > 59) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}:${match[3] || '00'}`;
}

function recordIdentity(row, date) {
  const id = text(row.idRegistroOrigen);
  const origin = text(row.idOrigen);
  // Fecha y hora distinguen enrolamientos diferentes de una misma persona/ID.
  const time = normalizeTime(row.horaEnrolamiento);
  if (id) return ['registro', origin, id, date, time];
  const document = text(row.documento);
  if (document && time) return ['evento', origin, date, time, text(row.tipoDocumento), text(row.emitidoEn), document];
  return null;
}

function identityErrors(row) {
  const errors = [];
  for (const field of ['idRegistroOrigen', 'idOrigen', 'horaEnrolamiento', 'documento', 'tipoDocumento', 'emitidoEn']) {
    const value = row[field];
    if (value != null && (typeof value !== 'string' && typeof value !== 'number')) {
      errors.push(`Identificador inválido: ${field} debe ser texto o número.`);
    } else if (typeof value === 'number' && (!Number.isFinite(value) || (field !== 'horaEnrolamiento' && !Number.isSafeInteger(value)))) {
      errors.push(`Identificador inválido: envía ${field} como texto para conservar sus dígitos.`);
    }
  }
  if (text(row.horaEnrolamiento) && !normalizeTime(row.horaEnrolamiento)) errors.push('Hora de enrolamiento inválida; usa HH:mm:ss.');
  return errors;
}

module.exports = { createFingerprint, recordIdentity, normalizeTime, identityErrors };
