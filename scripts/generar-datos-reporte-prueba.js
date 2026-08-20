// Inserta un dataset PEQUEÑO Y DETERMINISTICO (no aleatorio, a diferencia de
// carga-historica-sintetica.js) para poder verificar el reporte diario (Sprint 5) contra
// porcentajes exactos y conocidos de antemano. Todo cae en una sola fecha fija.
require("dotenv").config();
const pool = require("../src/db");
const { loadCatalogs } = require("../src/ingest/catalogMapper");
const { bulkInsertRegistros } = require("../src/etl/bulkInsert");

const FECHA = "2026-09-15";

// 10 filas armadas a mano: 7 sincronizados/2 pendientes/1 error (70/20/10%),
// 8 registrados/2 pendientes (80/20%), 9 general OK/1 con error (90/10%),
// 4 Venezuela/3 Chile/2 Peru/1 Bolivia (40/30/20/10%).
const NACIONALIDADES = ["VENEZUELA", "VENEZUELA", "VENEZUELA", "VENEZUELA", "CHILE", "CHILE", "CHILE", "PERU", "PERU", "BOLIVIA"];
const SINCRONIZACION = ["SINCRONIZADO", "SINCRONIZADO", "SINCRONIZADO", "SINCRONIZADO", "SINCRONIZADO", "SINCRONIZADO", "SINCRONIZADO", "PENDIENTE", "PENDIENTE", "ERROR"];
const REGISTRO = ["REGISTRADO", "REGISTRADO", "REGISTRADO", "REGISTRADO", "REGISTRADO", "REGISTRADO", "REGISTRADO", "REGISTRADO", "PENDIENTE", "PENDIENTE"];
const GENERAL = ["OK", "OK", "OK", "OK", "OK", "OK", "OK", "OK", "OK", "CON_ERROR"];
const CUARTELES = ["COLCHANES", "ANGAMOS", "CHACALLUTA", "COLCHANES", "ANGAMOS", "CHACALLUTA", "COLCHANES", "ANGAMOS", "CHACALLUTA", "COLCHANES"];

async function main() {
  const catalogs = await loadCatalogs(pool);
  const norm = (v) => String(v).trim().toUpperCase();

  const cuartelPorNombre = new Map(
    [...catalogs.cuartel.entries()].map(([k, v]) => [k.split("|")[1], v])
  );

  const rows = NACIONALIDADES.map((nac, i) => ({
    fecha_enrolamiento: FECHA,
    id_nacionalidad: catalogs.nacionalidad.get(norm(nac)),
    id_cuartel: cuartelPorNombre.get(norm(CUARTELES[i])),
    id_equipo: [...catalogs.equipo.values()][i % catalogs.equipo.size],
    genero: i % 2 === 0 ? "M" : "F",
    es_mayor_edad: true,
    edad_exacta: null,
    id_estado_sincronizacion: catalogs.estadoProceso.get(`SINCRONIZACION|${norm(SINCRONIZACION[i])}`),
    id_estado_registro: catalogs.estadoProceso.get(`REGISTRO|${norm(REGISTRO[i])}`),
    id_estado_general: catalogs.estadoProceso.get(`GENERAL|${norm(GENERAL[i])}`),
  }));

  const result = await bulkInsertRegistros(pool, rows);
  console.log(`Insertadas ${result.inserted} filas de prueba en la fecha ${FECHA}.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Error generando datos de prueba:", err.message);
  pool.end().finally(() => process.exit(1));
});
