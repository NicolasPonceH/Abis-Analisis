const { createFingerprint } = require('./recordIdentity');
const initialized = new WeakMap();

function ensureIngestDeduplication(pool) {
  if (!initialized.has(pool)) {
    const migration = (async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Coordina la migración entre procesos sin bloquear cada inserción.
        await client.query('SELECT pg_advisory_xact_lock(60261023)');
        await client.query('ALTER TABLE registro_enrolamiento ADD COLUMN IF NOT EXISTS huella_origen VARCHAR(64)');
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_registro_huella_origen ON registro_enrolamiento (huella_origen)');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    })();
    initialized.set(pool, migration);
    migration.catch(() => initialized.delete(pool));
  }
  return initialized.get(pool);
}

function fingerprintRows(rows, columns) {
  const fingerprint = createFingerprint();
  const keys = rows.map(row => row.identidadOrigen ? fingerprint(row.identidadOrigen) : null);
  // Las plantillas antiguas solo tienen estadísticas: no se pueden identificar
  // personas con ellas. Se reconoce el lote completo y se conserva su multiplicidad.
  const anonymous = rows.map((row, i) => keys[i] ? null : fingerprint(['fila', ...columns.map(col => row[col] ?? null)]));
  const batchKey = fingerprint(['lote-sin-id', ...anonymous.filter(Boolean).sort()]);
  const occurrences = new Map();
  return rows.map((row, i) => {
    let key = keys[i];
    if (!key) {
      const occurrence = (occurrences.get(anonymous[i]) || 0) + 1;
      occurrences.set(anonymous[i], occurrence);
      key = fingerprint(['fila-sin-id', batchKey, anonymous[i], occurrence]);
    }
    return { ...row, huella_origen: key };
  }).sort((a, b) => a.huella_origen.localeCompare(b.huella_origen));
}

// El hash antiguo del portapapeles solo cubría cantidad y las primeras tres filas.
// Es una alerta de posible repetición, nunca prueba suficiente para borrar/fusionar.
async function findLegacyIngest(pool, type, hash) {
  const { rows } = await pool.query(`
    SELECT l.id_lote, to_char(l.iniciado_en, 'DD-MM-YYYY HH24:MI') AS fecha
    FROM ingesta_lote l
    WHERE l.tipo_ingesta = $1 AND l.hash_sha256 = $2 AND l.estado = 'COMPLETADO'
      AND EXISTS (SELECT 1 FROM registro_enrolamiento r
                  WHERE r.id_lote_ingesta = l.id_lote AND r.huella_origen IS NULL)
    ORDER BY l.id_lote LIMIT 1`, [type, hash]);
  return rows[0] || null;
}

module.exports = { ensureIngestDeduplication, fingerprintRows, findLegacyIngest };
