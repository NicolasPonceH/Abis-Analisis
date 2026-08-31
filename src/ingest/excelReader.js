const XLSX = require("xlsx");

// Lee una hoja de un archivo Excel (por defecto 'ENROLADOS' si existe, o la primera hoja)
// y la devuelve como cabeceras + filas crudas.
function readExcelFile(filePath, options = {}) {
  const workbook = XLSX.readFile(filePath);
  const targetSheetName =
    options.sheetName ||
    (workbook.SheetNames.includes("ENROLADOS") ? "ENROLADOS" : workbook.SheetNames[0]);
  const sheet = workbook.Sheets[targetSheetName];

  // raw: true para preservar numeros de fechas y tipos nativos correctamente
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  const headers =
    rows.length > 0
      ? Object.keys(rows[0])
      : XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || [];

  return { headers, rows, sheetName: targetSheetName };
}

module.exports = { readExcelFile };

