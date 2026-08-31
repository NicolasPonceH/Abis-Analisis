require("dotenv").config();
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const { Pool } = require("pg");
const { EXPECTED_COLUMNS } = require("../src/ingest/headerSchema");

// Simulacion de la BD fuente (PruebDataBase_FAKE): exporta los registros de una fecha desde
// abis_fuente.enrolamiento_origen hacia el Excel diario, en la carpeta de llegada que en
// produccion seria la del sistema origen. Ver docs/PruebDataBase_FAKE.md.
//
// Uso:
//   npm run fuente:exportar
//   node scripts/fuente-exportar.js --fecha 2026-08-25
//
// El archivo se escribe aunque la fecha no tenga filas (solo cabeceras): asi la tarea de las
// 08:00 procesa ese Excel vacio y dispara su alerta de "archivo sin datos" por Telegram,
// en vez de reprocessar el Excel del dia anterior y duplicar registros.

function fechaDeHoy() {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

// Campos internos del headerSchema -> columnas reales de enrolamiento_origen.
const CAMPO_A_COLUMNA = {
  fechaEnrolamiento: "fecha_enrolamiento",
  nacionalidad: "nacionalidad",
  region: "region",
  unidad: "unidad",
  cuartel: "cuartel",
  equipo: "equipo",
  genero: "genero",
  mayorEdad: "mayor_edad",
  edadExacta: "edad_exacta",
  estadoSincronizacion: "estado_sincronizacion",
  estadoRegistro: "estado_registro",
  estadoGeneral: "estado_general",
};

async function main() {
  const args = process.argv.slice(2);
  const iFecha = args.indexOf("--fecha");
  const fecha = iFecha >= 0 ? args[iFecha + 1] : fechaDeHoy();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error(`Fecha invalida: "${fecha}" (formato esperado YYYY-MM-DD)`);
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no definida (.env)");

  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/abis_fuente";
  const pool = new Pool({ connectionString: url.toString() });

  try {
    // Todo como texto (::text): node-pg parsea las columnas DATE como objetos Date de JS,
    // y serializarlos produce "Tue Aug 25 2026 ..." en vez de "YYYY-MM-DD" (y puede correr
    // la fecha un dia por zona horaria — ver el comentario en src/ingest/catalogMapper.js).
    const seleccion = EXPECTED_COLUMNS.map(
      (c) => `${CAMPO_A_COLUMNA[c.field]}::text AS "${c.field}"`
    ).join(", ");
    const resultado = await pool.query(
      `SELECT ${seleccion} FROM enrolamiento_origen WHERE fecha_enrolamiento = $1 ORDER BY id`,
      [fecha]
    );
    const filas = resultado.rows;

    // Las cabeceras salen de EXPECTED_COLUMNS (la misma fuente de verdad del modulo de
    // ingesta) para que nunca se desincronicen.
    const cabeceras = EXPECTED_COLUMNS.map((c) => c.header);
    const cuerpo = filas.map((fila) =>
      EXPECTED_COLUMNS.map((c) => {
        const valor = fila[c.field];
        return valor === null || valor === undefined ? "" : String(valor);
      })
    );
    const hoja = XLSX.utils.aoa_to_sheet([cabeceras, ...cuerpo]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Enrolamiento");

    const carpeta = path.join(os.homedir(), "Documents", "ABIS_excel_diario");
    fs.mkdirSync(carpeta, { recursive: true });
    const ruta = path.join(carpeta, `enrolamiento_${fecha}.xlsx`);
    XLSX.writeFile(libro, ruta);

    console.log(`Fecha exportada: ${fecha}`);
    console.log(`Filas exportadas: ${filas.length}`);
    console.log(`Archivo: ${ruta}`);
    if (filas.length === 0) {
      console.log("Aviso: sin filas para esta fecha — se escribio un Excel solo con cabeceras.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Error en fuente-exportar:", err.message);
  process.exit(1);
});
