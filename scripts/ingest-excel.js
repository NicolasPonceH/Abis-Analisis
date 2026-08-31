require("dotenv").config();
const pool = require("../src/db");
const { processExcelFile } = require("../src/ingest");

const filePath = process.argv[2] || "New_Enrolados Abis.xlsx";
console.log(`Leyendo archivo Excel: ${filePath}`);

processExcelFile(filePath, pool)
  .then((result) => {
    if (!result.headerValidation.ok) {
      console.error("Cabeceras invalidas.");
      if (result.headerValidation.missing.length > 0) {
        console.error("Faltan:", result.headerValidation.missing.join(", "));
      }
      if (result.headerValidation.unexpected.length > 0) {
        console.error("No reconocidas:", result.headerValidation.unexpected.join(", "));
      }
      return pool.end().finally(() => process.exit(1));
    }

    console.log(`Filas mapeadas correctamente: ${result.rows.length}`);
    console.log(`Filas con errores: ${result.errors.length}`);
    if (result.errors.length > 0) {
      console.log(JSON.stringify(result.errors, null, 2));
    }
    return pool.end();
  })
  .catch((err) => {
    console.error("Error procesando el Excel:", err.message);
    return pool.end().finally(() => process.exit(1));
  });
