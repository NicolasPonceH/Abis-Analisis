const fs = require("fs");
const XLSX = require("xlsx");
const { esBufferCifrado, descifrarBuffer } = require("../security/crypto");

// Lee una hoja de un archivo Excel (o archivo cifrado .enc)
// y la devuelve como cabeceras + filas crudas. Si el archivo está cifrado con AES-256-GCM,
// lo descifra transparentemente en memoria RAM sin guardarlo en texto plano en disco.
function readExcelFile(filePath, options = {}) {
  let workbook;

  if (Buffer.isBuffer(filePath)) {
    const buffer = esBufferCifrado(filePath) ? descifrarBuffer(filePath, options.encryptionKey) : filePath;
    workbook = XLSX.read(buffer, { type: "buffer" });
  } else {
    const fileBuffer = fs.readFileSync(filePath);
    if (esBufferCifrado(fileBuffer) || String(filePath).endsWith(".enc")) {
      const decryptedBuffer = descifrarBuffer(fileBuffer, options.encryptionKey);
      workbook = XLSX.read(decryptedBuffer, { type: "buffer" });
    } else {
      workbook = XLSX.read(fileBuffer, { type: "buffer" });
    }
  }

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


