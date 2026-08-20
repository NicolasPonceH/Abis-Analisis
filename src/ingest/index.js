const { readExcelFile } = require("./excelReader");
const { validateHeaders } = require("./headerValidator");
const { loadCatalogs, mapRow } = require("./catalogMapper");
const { EXPECTED_COLUMNS } = require("./headerSchema");

function toFieldKeyedRow(rawRow) {
  const row = {};
  for (const column of EXPECTED_COLUMNS) {
    row[column.field] = rawRow[column.header];
  }
  return row;
}

// Orquesta el modulo de ingesta de Sprint 2: lee el Excel, valida su estructura y mapea
// cada fila en memoria contra los catalogos. No inserta en la base de datos (Sprint 3).
async function processExcelFile(filePath, pool) {
  const { headers, rows } = readExcelFile(filePath);

  const headerValidation = validateHeaders(headers);
  if (!headerValidation.ok) {
    return { headerValidation, rows: [], errors: [] };
  }

  const catalogs = await loadCatalogs(pool);

  const mappedRows = [];
  const rowErrors = [];
  rows.forEach((rawRow, index) => {
    const { mapped, errors } = mapRow(toFieldKeyedRow(rawRow), catalogs);
    if (errors.length > 0) {
      rowErrors.push({ excelRow: index + 2, errors }); // +2: fila 1 es cabecera, index es 0-based
    } else {
      mappedRows.push(mapped);
    }
  });

  return { headerValidation, rows: mappedRows, errors: rowErrors };
}

module.exports = { processExcelFile };
