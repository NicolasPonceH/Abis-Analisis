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

async function autoInsertNewProfessions(pool, rows, headers) {
  const uniqueProfs = new Set();
  rows.forEach(rawRow => {
    let rowObj = rawRow;
    if (Array.isArray(rawRow)) {
      rowObj = {};
      headers.forEach((h, i) => { rowObj[h] = rawRow[i]; });
    }
    const keyedRow = toFieldKeyedRow(rowObj, headers);
    if (keyedRow.profesion) {
      const val = String(keyedRow.profesion).trim().toUpperCase();
      if (val && val !== "NULL" && val !== "(NULL)" && val !== "NO ESPECIFICADO" && val !== "SIN PROFESION") {
        uniqueProfs.add(val);
      }
    }
  });

  if (uniqueProfs.size > 0) {
    const profArray = Array.from(uniqueProfs);
    // Insertamos en lotes de 100
    for (let i = 0; i < profArray.length; i += 100) {
      const batch = profArray.slice(i, i + 100);
      const values = batch.map((_, idx) => `($${idx + 1})`).join(",");
      const query = `INSERT INTO profesion (nombre_profesion) VALUES ${values} ON CONFLICT (nombre_profesion) DO NOTHING`;
      try {
        await pool.query(query, batch);
      } catch (err) {
        console.warn("[ETL] Advertencia al inyectar profesiones dinámicas:", err.message);
      }
    }
  }
}

// Orquesta el modulo de ingesta: lee el Excel, valida su estructura y mapea
// cada fila en memoria contra los catalogos. No inserta en la base de datos.
async function processExcelFile(filePath, pool, options = {}) {
  // Verificación de cabecera mágica (Office Open XML / ZIP)
  let isValidExcel = false;
  if (Buffer.isBuffer(filePath)) {
    isValidExcel = filePath.length >= 2 && filePath[0] === 0x50 && filePath[1] === 0x4b;
  } else if (typeof filePath === "string") {
    const fs = require("fs");
    if (fs.existsSync(filePath)) {
      const fd = fs.openSync(filePath, "r");
      const buffer = Buffer.alloc(2);
      fs.readSync(fd, buffer, 0, 2, 0);
      fs.closeSync(fd);
      isValidExcel = buffer[0] === 0x50 && buffer[1] === 0x4b;
    }
  }

  if (!isValidExcel) {
    return { headerValidation: { ok: false, error: "Archivo no es un Excel válido (Firma PK no encontrada)" }, rows: [], errors: [], sheetName: "invalid" };
  }

  const { headers, rows, sheetName } = readExcelFile(filePath, options);

  const headerValidation = validateHeaders(headers);
  if (!headerValidation.ok) {
    return { headerValidation, rows: [], errors: [], sheetName };
  }

  // Auto-descubrir e inyectar nuevas profesiones ANTES de cargar los catálogos
  await autoInsertNewProfessions(pool, rows, headers);

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

  // Auto-descubrir e inyectar nuevas profesiones ANTES de cargar los catálogos
  await autoInsertNewProfessions(pool, rows, headers);

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

