const { recordIdentity, identityErrors } = require('./recordIdentity');
// Adaptador de la vista Oracle legacy: acepta filas objeto o arrays con metaData.
// Los IDs deben venir normalizados y existir en los catálogos ABIS; no se inventan valores.
function transformOracleToPostgre(rows, cols = [], catalogs) {
  const domains = {
    id_nacionalidad: 'nacionalidad', id_cuartel: 'cuartel', id_equipo: 'equipo',
    id_profesion: 'profesion', id_estado_sincronizacion: 'SINCRONIZACION',
    id_estado_registro: 'REGISTRO', id_estado_general: 'GENERAL',
  };
  const allowed = Object.fromEntries(Object.entries(domains).map(([field, domain]) => {
    const entries = catalogs?.[domain] || (catalogs?.estadoProceso &&
      new Map([...catalogs.estadoProceso].filter(([key]) => key.startsWith(domain + '|'))));
    return [field, entries ? new Set([...entries.values()].map(Number)) : null];
  }));

  return rows.map((raw, index) => {
    const fail = field => {
      const error = new Error(`Fila Oracle ${index + 1}: campo ${field} ausente o inválido. No se insertó el lote.`);
      error.status = 422;
      throw error;
    };
    if (!raw || typeof raw !== 'object') fail('registro');
    if (Array.isArray(raw) && (!cols.length || cols.length !== raw.length)) fail('metaData');
    const entries = Array.isArray(raw) ? cols.map((col, i) => [col.name, raw[i]]) : Object.entries(raw);
    const input = Object.fromEntries(entries.map(([key, value]) => [String(key).toLowerCase(), value]));
    const result = {};
    for (const field of Object.keys(domains)) {
      const value = input[field];
      if (field === 'id_profesion' && (value === null || value === undefined || value === '')) {
        result[field] = null;
        continue;
      }
      const id = Number(value);
      if (!Number.isInteger(id) || id <= 0 || (allowed[field] && !allowed[field].has(id))) fail(field);
      result[field] = id;
    }
    let fecha = input.fecha_enrolamiento;
    if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
      fecha = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
    }
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fail('fecha_enrolamiento');
    const parsedDate = new Date(fecha + 'T00:00:00Z');
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== fecha) fail('fecha_enrolamiento');
    result.fecha_enrolamiento = fecha;
    const identityInput = {
      idRegistroOrigen: input.id_registro, idOrigen: input.id_origen,
      horaEnrolamiento: input.hora_enrolamiento ?? input.hora,
      documento: input.documento, tipoDocumento: input.tipo_documento, emitidoEn: input.documento_emitido,
    };
    if (identityErrors(identityInput).length) fail('identificador u hora de origen');
    const identity = recordIdentity(identityInput, fecha);
    if (identity) result.identidadOrigen = identity;
    result.genero = String(input.genero ?? '').trim().toUpperCase();
    if (!['M', 'F', 'X'].includes(result.genero)) fail('genero');
    const mayor = String(input.es_mayor_edad ?? '').trim().toUpperCase();
    if (!['TRUE', 'FALSE', '1', '0', 'SI', 'NO'].includes(mayor)) fail('es_mayor_edad');
    result.es_mayor_edad = ['TRUE', '1', 'SI'].includes(mayor);
    const edad = input.edad_exacta;
    result.edad_exacta = edad === null || edad === undefined || edad === '' ? null : Number(edad);
    if (result.edad_exacta !== null && (!Number.isInteger(result.edad_exacta) || result.edad_exacta < 0 ||
      result.edad_exacta > 32767 || (result.edad_exacta >= 18) !== result.es_mayor_edad)) fail('edad_exacta');
    return result;
  });
}

async function importarOracleLegacy({ pool, oracle, connectionOptions, loadCatalogs, bulkInsertRegistros, audit }) {
  let connection;
  try {
    connection = await oracle.getConnection(connectionOptions);
    const result = await connection.execute("SELECT * FROM ENROLAMIENTOS_VIEW WHERE ESTADO = 'PENDIENTE'");
    const rows = result.rows || [];
    if (!rows.length) return { filasOracle: 0, filasPostgre: 0, batches: 0 };
    const catalogs = await loadCatalogs(pool);
    const mapped = transformOracleToPostgre(rows, result.metaData || [], catalogs);
    // pool siempre es PostgreSQL; la conexión Oracle solo se usa para lectura.
    const inserted = await bulkInsertRegistros(pool, mapped);
    if (audit) await audit(mapped);
    return { filasOracle: rows.length, filasPostgre: inserted.inserted, filasDuplicadas: inserted.duplicates || 0, batches: inserted.batches };
  } finally {
    if (connection) {
      try { await connection.close(); }
      catch (error) { console.warn('[ORACLE] No se pudo cerrar la conexión:', error.message); }
    }
  }
}

module.exports = { transformOracleToPostgre, importarOracleLegacy };
