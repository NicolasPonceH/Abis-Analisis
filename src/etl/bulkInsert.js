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

// Inserta las filas ya mapeadas (salida de catalogMapper.mapRow) en registro_enrolamiento
// dentro de una unica transaccion: o entran todas, o no entra ninguna (bulk insert).
// Nota: PostgreSQL limita una consulta a 65535 parametros (~6500 filas con estas 10 columnas).
// Alcanza de sobra para el Excel diario; la carga historica de 95k+ registros (Sprint 4)
// va a necesitar particionar en lotes, no llamar esto con todo el acumulado de una vez.
async function bulkInsertRegistros(pool, rows) {
  if (rows.length === 0) return { inserted: 0 };

  const values = [];
  const placeholders = rows.map((row, i) => {
    const base = i * COLUMNS.length;
    COLUMNS.forEach((col) => values.push(row[col]));
    const rowPlaceholders = COLUMNS.map((_, j) => `$${base + j + 1}`).join(", ");
    return `(${rowPlaceholders})`;
  });

  const sql = `INSERT INTO registro_enrolamiento (${COLUMNS.join(", ")}) VALUES ${placeholders.join(", ")}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql, values);
    await client.query("COMMIT");
    return { inserted: rows.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { bulkInsertRegistros };
