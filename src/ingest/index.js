const { readExcelFile } = require("./excelReader");
const { validateHeaders } = require("./headerValidator");
const { loadCatalogs, mapRow } = require("./catalogMapper");
const { EXPECTED_COLUMNS, findMatchingHeader } = require("./headerSchema");

function toFieldKeyedRow(rawRow, actualHeaders) {
  const row = {};
  for (const column of EXPECTED_COLUMNS) {
    const matched = findMatchingHeader(column, actualHeaders);
    row[column.field] = matched !== undefined ? rawRow[matched] : undefined;
  }
  return row;
}

// Orquesta el modulo de ingesta: lee el Excel, valida su estructura y mapea
// cada fila en memoria contra los catalogos. No inserta en la base de datos.
async function processExcelFile(filePath, pool, options = {}) {
  const { headers, rows, sheetName } = readExcelFile(filePath, options);

  const headerValidation = validateHeaders(headers);
  if (!headerValidation.ok) {
    return { headerValidation, rows: [], errors: [], sheetName };
  }

  const catalogs = await loadCatalogs(pool);

  const mappedRows = [];
  const rowErrors = [];
  rows.forEach((rawRow, index) => {
    const { mapped, errors } = mapRow(toFieldKeyedRow(rawRow, headers), catalogs);
    if (errors.length > 0) {
      rowErrors.push({ excelRow: index + 2, errors }); // +2: fila 1 es cabecera, index es 0-based
    } else {
      mappedRows.push(mapped);
    }
  });

  return { headerValidation, rows: mappedRows, errors: rowErrors, sheetName };
}

module.exports = { processExcelFile };

