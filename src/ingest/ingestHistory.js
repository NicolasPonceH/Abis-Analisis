const ESTADOS = ["PROCESANDO", "COMPLETADO", "ERROR", "ELIMINADO"];

async function ensureIngestHistory(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ingesta_lote (
      id_lote             BIGSERIAL PRIMARY KEY,
      tipo_ingesta        VARCHAR(30) NOT NULL,
      nombre_archivo      VARCHAR(255),
      hash_sha256         VARCHAR(64),
      usuario             VARCHAR(120),
      iniciado_en         TIMESTAMP NOT NULL DEFAULT NOW(),
      finalizado_en       TIMESTAMP,
      filas_recibidas     INTEGER NOT NULL DEFAULT 0,
      filas_validas       INTEGER NOT NULL DEFAULT 0,
      filas_insertadas    INTEGER NOT NULL DEFAULT 0,
      filas_error         INTEGER NOT NULL DEFAULT 0,
      filas_eliminadas    INTEGER NOT NULL DEFAULT 0,
      estado              VARCHAR(20) NOT NULL DEFAULT 'PROCESANDO',
      detalle             TEXT
    );
  `);

  const columns = [
    ["tipo_ingesta", "VARCHAR(30)"],
    ["nombre_archivo", "VARCHAR(255)"],
    ["hash_sha256", "VARCHAR(64)"],
    ["usuario", "VARCHAR(120)"],
    ["iniciado_en", "TIMESTAMP NOT NULL DEFAULT NOW()"],
    ["finalizado_en", "TIMESTAMP"],
    ["filas_recibidas", "INTEGER NOT NULL DEFAULT 0"],
    ["filas_validas", "INTEGER NOT NULL DEFAULT 0"],
    ["filas_insertadas", "INTEGER NOT NULL DEFAULT 0"],
    ["filas_error", "INTEGER NOT NULL DEFAULT 0"],
    ["filas_eliminadas", "INTEGER NOT NULL DEFAULT 0"],
    ["estado", "VARCHAR(20) NOT NULL DEFAULT 'PROCESANDO'"],
    ["detalle", "TEXT"],
  ];

  for (const [column, definition] of columns) {
    await pool.query(`ALTER TABLE ingesta_lote ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
  }

  await pool.query(`
    ALTER TABLE registro_enrolamiento
      ADD COLUMN IF NOT EXISTS id_lote_ingesta BIGINT
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_registro_lote_ingesta
      ON registro_enrolamiento (id_lote_ingesta)
  `);

  // Los registros existentes antes de esta funcionalidad quedan agrupados como
  // un lote histórico para que también puedan administrarse desde la interfaz.
  const { rows: pendientes } = await pool.query(
    "SELECT count(*)::int AS total FROM registro_enrolamiento WHERE id_lote_ingesta IS NULL"
  );

  if (pendientes[0]?.total > 0) {
    let { rows: historicos } = await pool.query(
      "SELECT id_lote FROM ingesta_lote WHERE tipo_ingesta = 'HISTORICO' ORDER BY id_lote LIMIT 1"
    );

    if (historicos.length === 0) {
      historicos = (await pool.query(
        `INSERT INTO ingesta_lote
          (tipo_ingesta, nombre_archivo, usuario, finalizado_en, estado, detalle)
         VALUES ('HISTORICO', 'Registros existentes antes del historial de ingestas', 'SISTEMA', NOW(), 'COMPLETADO', $1)
         RETURNING id_lote`,
        [`Migracion automatica de ${pendientes[0].total} registros existentes.`]
      )).rows;
    }

    await pool.query(
      "UPDATE registro_enrolamiento SET id_lote_ingesta = $1 WHERE id_lote_ingesta IS NULL",
      [historicos[0].id_lote]
    );
    await pool.query(
      "UPDATE ingesta_lote SET filas_insertadas = $1 WHERE id_lote = $2",
      [pendientes[0].total, historicos[0].id_lote]
    );
  }
}

async function crearLote(pool, {
  tipoIngesta,
  nombreArchivo = null,
  hashSha256 = null,
  usuario = null,
  filasRecibidas = 0,
}) {
  const { rows } = await pool.query(
    `INSERT INTO ingesta_lote
      (tipo_ingesta, nombre_archivo, hash_sha256, usuario, filas_recibidas)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id_lote`,
    [tipoIngesta, nombreArchivo, hashSha256, usuario, filasRecibidas]
  );
  return rows[0].id_lote;
}

async function actualizarLote(pool, idLote, {
  estado = null,
  finalizado = false,
  filasRecibidas = null,
  filasValidas = null,
  filasInsertadas = null,
  filasError = null,
  filasEliminadas = null,
  detalle = null,
}) {
  if (estado !== null && !ESTADOS.includes(estado)) {
    throw new Error(`Estado de lote no valido: ${estado}`);
  }

  await pool.query(
    `UPDATE ingesta_lote SET
       estado = COALESCE($2, estado),
       finalizado_en = CASE WHEN $3 THEN NOW() ELSE finalizado_en END,
       filas_recibidas = COALESCE($4, filas_recibidas),
       filas_validas = COALESCE($5, filas_validas),
       filas_insertadas = COALESCE($6, filas_insertadas),
       filas_error = COALESCE($7, filas_error),
       filas_eliminadas = COALESCE($8, filas_eliminadas),
       detalle = COALESCE($9, detalle)
     WHERE id_lote = $1`,
    [idLote, estado, finalizado, filasRecibidas, filasValidas, filasInsertadas, filasError, filasEliminadas, detalle]
  );
}

async function listarLotes(pool) {
  const { rows } = await pool.query(`
    SELECT id_lote, tipo_ingesta, nombre_archivo, usuario,
           iniciado_en, finalizado_en, filas_recibidas, filas_validas,
           filas_insertadas, filas_error, filas_eliminadas, estado, detalle
    FROM ingesta_lote
    ORDER BY iniciado_en DESC, id_lote DESC
    LIMIT 100
  `);
  return rows;
}

module.exports = {
  ensureIngestHistory,
  crearLote,
  actualizarLote,
  listarLotes,
};
