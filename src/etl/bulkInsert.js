const { ensureIngestDeduplication, fingerprintRows } = require('../ingest/deduplication');
const COLUMNS = [
  "fecha_enrolamiento",
  "id_nacionalidad",
  "id_cuartel",
  "id_equipo",
  "id_profesion",
  "genero",
  "es_mayor_edad",
  "edad_exacta",
  "id_estado_sincronizacion",
  "id_estado_registro",
  "id_estado_general",
];

// 11 campos + huella + lote: 5000 × 13 = 65000, debajo del límite de PostgreSQL.
const BATCH_SIZE = 5000;

function buildInsertQuery(rows, paramOffset = 0, idLote = null) {
  const columns = [...COLUMNS, 'huella_origen', ...(idLote ? ['id_lote_ingesta'] : [])];
  const values = [];
  const placeholders = rows.map((row, i) => {
    const base = paramOffset + i * columns.length;
    COLUMNS.forEach((col) => values.push(row[col]));
    values.push(row.huella_origen);
    if (idLote) values.push(idLote);
    const rowPlaceholders = columns.map((_, j) => `$${base + j + 1}`).join(", ");
    return `(${rowPlaceholders})`;
  });
  const sql = `INSERT INTO registro_enrolamiento (${columns.join(", ")}) VALUES ${placeholders.join(", ")} ON CONFLICT (huella_origen) DO NOTHING`;
  return { sql, values };
}

// Inserta las filas ya mapeadas (salida de catalogMapper.mapRow) en registro_enrolamiento.
// Particiona en lotes de BATCH_SIZE filas, pero todos los lotes van dentro de una unica
// transaccion: si un lote falla a mitad de una carga historica grande, se hace ROLLBACK de
// todo (ningun registro parcial queda insertado), no solo del lote que fallo.
async function bulkInsertRegistros(pool, rows, options = {}) {
  const { onBatchInserted, idLote = null } = options;
  if (rows.length === 0) return { inserted: 0, duplicates: 0, batches: 0 };
  const identifiedRows = fingerprintRows(rows, COLUMNS);
  await ensureIngestDeduplication(pool);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let inserted = 0;
    let batches = 0;
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = identifiedRows.slice(start, start + BATCH_SIZE);
      const { sql, values } = buildInsertQuery(batch, 0, idLote);
      const result = await client.query(sql, values);
      inserted += result.rowCount;
      batches += 1;
      if (onBatchInserted) onBatchInserted({ batches, inserted, total: rows.length });
    }

    await client.query("COMMIT");
    return { inserted, duplicates: rows.length - inserted, batches };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { bulkInsertRegistros, BATCH_SIZE };
