// Genera un acumulado historico SINTETICO (no real) e inserta con bulkInsertRegistros, para
// probar de punta a punta que la carga por lotes y los indices aguantan el volumen que describe
// el informe de requerimientos (95.000+ registros) — Sprint 4, "Carga Historica y Pruebas de
// Estres". No lee ningun Excel: genera filas ya mapeadas directamente contra los catalogos reales
// ya sembrados en la base, para no re-probar la lectura/mapeo de Excel (eso ya lo cubren Sprint 2
// y 3) y enfocar la prueba en la insercion masiva y el uso de los indices.
require("dotenv").config();
const pool = require("../src/db");
const { loadCatalogs } = require("../src/ingest/catalogMapper");
const { bulkInsertRegistros } = require("../src/etl/bulkInsert");

const TOTAL = Number(process.argv[2]) || 95000;
const DIAS_HISTORIA = 365;

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function fechaAleatoria() {
  const hoy = new Date("2026-08-20T00:00:00Z");
  const offset = Math.floor(Math.random() * DIAS_HISTORIA);
  const fecha = new Date(hoy.getTime() - offset * 24 * 60 * 60 * 1000);
  return fecha.toISOString().slice(0, 10);
}

function generarFilas(catalogs, total) {
  const nacionalidadIds = [...catalogs.nacionalidad.values()];
  const cuartelIds = [...catalogs.cuartel.values()];
  const equipoIds = [...catalogs.equipo.values()];
  const estadoSincronizacionIds = [...catalogs.estadoProceso.entries()]
    .filter(([k]) => k.startsWith("SINCRONIZACION|")).map(([, v]) => v);
  const estadoRegistroIds = [...catalogs.estadoProceso.entries()]
    .filter(([k]) => k.startsWith("REGISTRO|")).map(([, v]) => v);
  const estadoGeneralIds = [...catalogs.estadoProceso.entries()]
    .filter(([k]) => k.startsWith("GENERAL|")).map(([, v]) => v);

  const rows = [];
  for (let i = 0; i < total; i++) {
    const esMayorEdad = Math.random() > 0.08; // ~8% menores de edad, similar a un enrolamiento real
    rows.push({
      fecha_enrolamiento: fechaAleatoria(),
      id_nacionalidad: pick(nacionalidadIds),
      id_cuartel: pick(cuartelIds),
      id_equipo: pick(equipoIds),
      genero: pick(["M", "F", "X"]),
      es_mayor_edad: esMayorEdad,
      edad_exacta: esMayorEdad ? null : Math.floor(Math.random() * 18),
      id_estado_sincronizacion: pick(estadoSincronizacionIds),
      id_estado_registro: pick(estadoRegistroIds),
      id_estado_general: pick(estadoGeneralIds),
    });
  }
  return rows;
}

async function main() {
  console.log(`Generando ${TOTAL} filas sinteticas...`);
  const catalogs = await loadCatalogs(pool);
  const rows = generarFilas(catalogs, TOTAL);

  console.log("Insertando (por lotes)...");
  const inicio = Date.now();
  const result = await bulkInsertRegistros(pool, rows, {
    onBatchInserted: ({ batches, inserted, total }) => {
      process.stdout.write(`\r  lote ${batches}: ${inserted}/${total} filas`);
    },
  });
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

  console.log(`\nInsertadas ${result.inserted} filas en ${result.batches} lotes, en ${segundos}s.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Error generando la carga historica:", err.message);
  pool.end().finally(() => process.exit(1));
});
