require("dotenv").config();
const pool = require("../src/db");
const { ejecutarFlujoDiario } = require("../src/flujo/flujoDiario");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Uso: node scripts/flujo-diario.js <ruta-al-excel.xlsx>");
  process.exit(1);
}

ejecutarFlujoDiario(filePath, pool)
  .then((resultado) => {
    console.log(`Resultado: ${resultado.notificado}`);
    if (resultado.insertResult) {
      console.log(`Filas insertadas: ${resultado.insertResult.inserted}`);
    }
    return pool.end();
  })
  .catch((err) => {
    console.error("Error en el flujo diario:", err.message);
    return pool.end().finally(() => process.exit(1));
  });
