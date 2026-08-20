const XLSX = require("xlsx");

// Lee la primera hoja de un archivo Excel y la devuelve como cabeceras + filas crudas
// (todos los valores como string, sin ninguna transformacion ni validacion todavia).
function readExcelFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  const headers = rows.length > 0
    ? Object.keys(rows[0])
    : (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || []);

  return { headers, rows };
}

module.exports = { readExcelFile };
