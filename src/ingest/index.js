const { readExcelFile } = require("./excelReader");
const { validateHeaders } = require("./headerValidator");
const { loadCatalogs, mapRow } = require("./catalogMapper");
const { EXPECTED_COLUMNS, findMatchingHeader, normalizeHeaderName } = require("./headerSchema");

const HEADERLESS_ORACLE_HEADERS_28 = [
  "Fecha Enrolamiento", "Hora", "Equipo", "Usuario", "Unidad",
  "Nombre Completo", "Tipo de Documento", "Documento", "Emitido En",
  "Nacionalidad", "Estado Sincronizacion", "Estado Registro", "Estado General",
  "Cuartel", "Region", "Fecha Nacimiento", "Edad Exacta", "Mayor de Edad",
  "ID Origen", "IP", "Cuartel New", "Nombre Funcionario", "Profesion",
  "Genero", "Tipo Registro", "Latitud", "Longitud", "ID Registro",
];

function pareceFilaOracleSinCabecera(row) {
  if (!Array.isArray(row) || row.length < HEADERLESS_ORACLE_HEADERS_28.length) return false;
  const fecha = String(row[0] || "").trim();
  const hora = String(row[1] || "").trim();
  const equipo = String(row[2] || "").trim();
  return /^(\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})$/.test(fecha)
    && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(hora)
    && /^(PC DE ESCRITORIO|TABLET)$/i.test(equipo);
}

// Recupera exportaciones pegadas sin cabeceras, incluso si una versión antigua
// del navegador envió la primera fila como encabezado o utilizó 12 cabeceras genéricas.
function normalizarEntradaHoja(headers, rows) {
  let normalizedHeaders = Array.isArray(headers) ? headers.slice() : [];
  let normalizedRows = Array.isArray(rows) ? rows.slice() : [];

  if (pareceFilaOracleSinCabecera(normalizedHeaders)) {
    normalizedRows = [normalizedHeaders, ...normalizedRows];
    normalizedHeaders = HEADERLESS_ORACLE_HEADERS_28.slice();
  } else if (pareceFilaOracleSinCabecera(normalizedRows[0])) {
    normalizedHeaders = HEADERLESS_ORACLE_HEADERS_28.slice();
  }

  return { headers: normalizedHeaders, rows: normalizedRows };
}

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
// cada fila en memoria contra los catálogos. readOnly impide agregar profesiones;
// los registros de enrolamiento solo se insertan desde el orquestador ETL.
async function processExcelFile(filePath, pool, options = {}) {
  const fs = require("fs");
  const { esBufferCifrado, descifrarBuffer } = require("../security/crypto");
  let buffer = Buffer.isBuffer(filePath) ? filePath : fs.readFileSync(filePath);
  if (esBufferCifrado(buffer)) buffer = descifrarBuffer(buffer, options.encryptionKey);
  if (buffer.length < 2 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return { headerValidation: { ok: false, error: "Archivo no es un Excel válido (Firma PK no encontrada)" }, rows: [], errors: [], sheetName: "invalid" };
  }
  const { headers, rows, sheetName } = readExcelFile(buffer, options);
  return { ...await processSheetRows(headers, rows, pool, options), sheetName };
}

// Procesa filas provenientes directamente del portapapeles o de una cuadrícula de hoja de cálculo
async function processSheetRows(headers, rows, pool, options = {}) {
  ({ headers, rows } = normalizarEntradaHoja(headers, rows));
  const headerValidation = validateHeaders(headers);
  if (!headerValidation.ok) {
    return { headerValidation, rows: [], errors: [] };
  }

  // Auto-descubrir e inyectar nuevas profesiones ANTES de cargar los catálogos
  if (!options.readOnly) await autoInsertNewProfessions(pool, rows, headers);

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
