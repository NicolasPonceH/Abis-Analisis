const { processExcelFile, processSheetRows } = require("../ingest");
const { bulkInsertRegistros } = require("./bulkInsert");

// Orquesta el ETL completo de Sprint 3: lee y mapea el Excel (Sprint 2, ya con tolerancia a
// tipeos menores) y despues inserta transaccionalmente las filas validas.
// Las filas que no se pudieron mapear (result.errors) NO bloquean al resto del lote: se
// insertan todas las filas validas en una sola transaccion y se reportan las demas aparte,
// para que un puñado de filas con errores no tumbe la carga diaria completa.
async function runEtl(filePath, pool) {
  const result = await processExcelFile(filePath, pool);

  if (!result.headerValidation.ok) {
    return { ...result, insertResult: null };
  }

  const insertResult = await bulkInsertRegistros(pool, result.rows);
  return { ...result, insertResult };
}

// Orquesta la ingesta directa de filas pegadas desde la hoja de cálculo / portapapeles
async function runSheetEtl(headers, rows, pool) {
  const result = await processSheetRows(headers, rows, pool);

  if (!result.headerValidation.ok || result.rows.length === 0) {
    return { ...result, insertResult: { inserted: 0, batches: 0 } };
  }

  const insertResult = await bulkInsertRegistros(pool, result.rows);
  return { ...result, insertResult };
}

module.exports = { runEtl, runSheetEtl };
