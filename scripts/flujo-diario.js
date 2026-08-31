require("dotenv").config();
const pool = require("../src/db");
const { ejecutarFlujoDiario } = require("../src/flujo/flujoDiario");

const filePath = process.argv[2] || "New_Enrolados Abis.xlsx";
console.log(`Iniciando flujo diario con archivo: ${filePath}`);

ejecutarFlujoDiario(filePath, pool)
  .then((resultado) => {
    console.log(`Resultado: ${resultado.notificado}`);
    if (resultado.insertResult) {
      console.log(`Filas insertadas: ${resultado.insertResult.inserted}`);
    }

    if (resultado.rows) {
      const correcciones = resultado.rows.flatMap((r) => r.correcciones || []);
      if (correcciones.length > 0) {
        console.log(`Correcciones automaticas aplicadas (${correcciones.length}):`);
        correcciones.forEach((c) => console.log(`  - ${c}`));
      }
    }

    if (resultado.errors && resultado.errors.length > 0) {
      console.log(`Filas rechazadas / omitidas (${resultado.errors.length}):`);
      console.log(JSON.stringify(resultado.errors, null, 2));
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
