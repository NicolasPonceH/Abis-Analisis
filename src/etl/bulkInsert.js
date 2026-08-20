const COLUMNS = [
  "fecha_enrolamiento",
  "id_nacionalidad",
  "id_cuartel",
  "id_equipo",
  "genero",
  "es_mayor_edad",
  "edad_exacta",
  "id_estado_sincronizacion",
  "id_estado_registro",
  "id_estado_general",
];

// PostgreSQL limita una consulta a 65535 parametros. Con 10 columnas eso son ~6553 filas
// por INSERT; dejamos margen y particionamos en lotes de 5000 (Sprint 4: antes de esto,
// bulkInsertRegistros hacia un solo INSERT y fallaba directamente con cargas grandes,
// como la historica de 95k+ registros).
const BATCH_SIZE = 5000;

function buildInsertQuery(rows, paramOffset = 0) {
  const values = [];
  const placeholders = rows.map((row, i) => {
    const base = paramOffset + i * COLUMNS.length;
    COLUMNS.forEach((col) => values.push(row[col]));
    const rowPlaceholders = COLUMNS.map((_, j) => `$${base + j + 1}`).join(", ");
    return `(${rowPlaceholders})`;
  });
  const sql = `INSERT INTO registro_enrolamiento (${COLUMNS.join(", ")}) VALUES ${placeholders.join(", ")}`;
  return { sql, values };
}

// Inserta las filas ya mapeadas (salida de catalogMapper.mapRow) en registro_enrolamiento.
// Particiona en lotes de BATCH_SIZE filas, pero todos los lotes van dentro de una unica
// transaccion: si un lote falla a mitad de una carga historica grande, se hace ROLLBACK de
// todo (ningun registro parcial queda insertado), no solo del lote que fallo.
async function bulkInsertRegistros(pool, rows, options = {}) {
  const { onBatchInserted } = options;
  if (rows.length === 0) return { inserted: 0, batches: 0 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let inserted = 0;
    let batches = 0;
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const { sql, values } = buildInsertQuery(batch);
      await client.query(sql, values);
      inserted += batch.length;
      batches += 1;
      if (onBatchInserted) onBatchInserted({ batches, inserted, total: rows.length });
    }

    await client.query("COMMIT");
    return { inserted, batches };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { bulkInsertRegistros, BATCH_SIZE };
