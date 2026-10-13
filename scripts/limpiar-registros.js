require("dotenv").config();

const readline = require("readline");
const pool = require("../src/db");

const TABLA = "registro_enrolamiento";
const BASE_ESPERADA = "Abis_OCR";

function preguntar(texto) {
  const interfaz = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolver) => {
    interfaz.question(texto, (respuesta) => {
      interfaz.close();
      resolver(respuesta.trim());
    });
  });
}

async function main() {
  const cliente = await pool.connect();

  try {
    const baseResult = await cliente.query("SELECT current_database() AS base");
    const baseActual = baseResult.rows[0]?.base;

    if (baseActual !== BASE_ESPERADA) {
      throw new Error(
        `Base incorrecta: se esperaba ${BASE_ESPERADA}, pero la conexión apunta a ${baseActual}.`
      );
    }

    const conteoResult = await cliente.query(
      `SELECT count(*)::int AS total FROM ${TABLA}`
    );
    const total = conteoResult.rows[0].total;

    if (total === 0) {
      console.log(`La tabla ${TABLA} ya está vacía.`);
      return;
    }

    const confirmacionEsperada = `ELIMINAR ${total}`;

    console.log("\n⚠️  OPERACIÓN DESTRUCTIVA");
    console.log(`Base de datos: ${baseActual}`);
    console.log(`Tabla: ${TABLA}`);
    console.log(`Registros a eliminar: ${total}`);
    console.log("No se modificará Oracle ni ninguna otra tabla.");
    console.log(`\nPara continuar, escribe exactamente: ${confirmacionEsperada}`);

    const confirmacion = await preguntar("> ");

    if (confirmacion !== confirmacionEsperada) {
      console.log("Operación cancelada. No se eliminó ningún registro.");
      return;
    }

    await cliente.query("BEGIN");
    await cliente.query(`TRUNCATE TABLE ${TABLA} RESTART IDENTITY`);
    await cliente.query("COMMIT");

    console.log(`✅ Tabla ${TABLA} limpiada correctamente.`);
    console.log(`Registros eliminados: ${total}`);
    console.log("El contador de identidad fue reiniciado.");
  } catch (error) {
    try {
      await cliente.query("ROLLBACK");
    } catch (_) {
      // Conservar el error original si la transacción no llegó a iniciar.
    }

    console.error(`❌ No se pudo limpiar ${TABLA}: ${error.message}`);
    process.exitCode = 1;
  } finally {
    cliente.release();
    await pool.end();
  }
}

main();
