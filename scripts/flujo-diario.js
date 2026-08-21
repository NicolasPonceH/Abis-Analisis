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
    // "..._sin_notificar" significa que el ETL funciono pero Telegram fallo al avisar — sale
    // con codigo de error igual, para que una tarea programada lo marque como fallido y alguien
    // se entere por otro medio (revisar logs), aunque los datos ya hayan quedado bien cargados.
    const huboFallaDeNotificacion = resultado.notificado.endsWith("_sin_notificar");
    return pool.end().then(() => {
      if (huboFallaDeNotificacion) process.exit(1);
    });
  })
  .catch((err) => {
    console.error("Error en el flujo diario:", err.message);
    return pool.end().finally(() => process.exit(1));
  });
