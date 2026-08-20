require("dotenv").config();
const pool = require("../src/db");
const { runEtl } = require("../src/etl");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Uso: node scripts/procesar-excel.js <ruta-al-excel.xlsx>");
  process.exit(1);
}

runEtl(filePath, pool)
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

    console.log(`Filas insertadas: ${result.insertResult.inserted}`);

    const correcciones = result.rows.flatMap((r) => r.correcciones || []);
    if (correcciones.length > 0) {
      console.log(`Correcciones automaticas aplicadas (${correcciones.length}):`);
      correcciones.forEach((c) => console.log(`  - ${c}`));
    }

    if (result.errors.length > 0) {
      console.log(`Filas rechazadas (${result.errors.length}):`);
      console.log(JSON.stringify(result.errors, null, 2));
    }

    return pool.end();
  })
  .catch((err) => {
    console.error("Error procesando el Excel:", err.message);
    return pool.end().finally(() => process.exit(1));
  });
