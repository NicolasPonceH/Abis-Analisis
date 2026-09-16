const { readExcelFile } = require("./excelReader");
const { validateHeaders } = require("./headerValidator");
const { loadCatalogs, mapRow } = require("./catalogMapper");
const { EXPECTED_COLUMNS, findMatchingHeader, normalizeHeaderName } = require("./headerSchema");

function toFieldKeyedRow(rawRow, actualHeaders) {
  const row = {};
  for (const column of EXPECTED_COLUMNS) {
    const allAliases = [column.header, ...(column.aliases || [])];
    let matchedKey = undefined;
    let chosenVal = undefined;

    for (const alias of allAliases) {
      const normAlias = normalizeHeaderName(alias);
      const found = actualHeaders.find((h) => normalizeHeaderName(h) === normAlias);
      if (found !== undefined && rawRow[found] !== undefined) {
        if (matchedKey === undefined) {
          matchedKey = found;
          chosenVal = rawRow[found];
        }
        const strVal = String(rawRow[found] || "").trim();
        // Si el valor actual es no-nulo y no es 'NEC', mientras que el anterior era nulo o 'NEC', preferir el valor con contenido
        if (
          strVal &&
          strVal !== "NEC" &&
          (chosenVal === undefined || !String(chosenVal).trim() || String(chosenVal).trim() === "NEC")
        ) {
          matchedKey = found;
          chosenVal = rawRow[found];
          break;
        }
      }
    }
    row[column.field] = chosenVal !== undefined ? chosenVal : (matchedKey ? rawRow[matchedKey] : undefined);
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

// Procesa filas provenientes directamente del portapapeles o de una cuadrícula de hoja de cálculo
async function processSheetRows(headers, rows, pool) {
  const headerValidation = validateHeaders(headers);
  if (!headerValidation.ok) {
    return { headerValidation, rows: [], errors: [] };
  }

  const catalogs = await loadCatalogs(pool);

  const mappedRows = [];
  const rowErrors = [];
  rows.forEach((rawRow, index) => {
    let rowObj = rawRow;
    if (Array.isArray(rawRow)) {
      rowObj = {};
      headers.forEach((h, i) => {
        rowObj[h] = rawRow[i];
      });
    }
    const { mapped, errors } = mapRow(toFieldKeyedRow(rowObj, headers), catalogs);
    if (errors.length > 0) {
      rowErrors.push({ fila: index + 1, errors, datos: rowObj });
    } else {
      mappedRows.push(mapped);
    }
  });

  return { headerValidation, rows: mappedRows, errors: rowErrors };
}

module.exports = { processExcelFile, processSheetRows, toFieldKeyedRow };

