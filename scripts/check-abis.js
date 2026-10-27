// Diagnóstico real, exclusivamente de lectura. No inicia bot, scheduler ni SIAD.
const assert = require("node:assert/strict");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const { Pool } = require("pg");
const { obtenerReporteDiario } = require("../src/reportes/reporteDiario");
const { obtenerReporteRango, obtenerTendenciaHistorica, obtenerComparacionPeriodos } = require("../src/reportes/reporteRango");
const { generarReporteWord } = require("../src/reportes/wordReportService");
const { generarReporteExcel } = require("../src/reportes/excelReportService");
const { mergeScheduleConfig } = require("../src/services/scheduleConfig");
const PizZip = require("pizzip");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000,
    statement_timeout: 45000, options: "-c timezone=America/Santiago -c default_transaction_read_only=on" });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    // Las consultas del reporte se programan en paralelo; un solo cliente transaccional las serializa.
    let tail = Promise.resolve();
    const db = { query(...args) {
      const task = tail.then(() => client.query(...args));
      tail = task.catch(() => {});
      return task;
    } };
    const { rows: [bounds] } = await db.query("SELECT count(*)::int AS total, to_char(min(fecha_enrolamiento),'YYYY-MM-DD') AS desde, to_char(max(fecha_enrolamiento),'YYYY-MM-DD') AS hasta FROM registro_enrolamiento");
    if (!bounds.hasta) { console.log(JSON.stringify({ postgres: "ok", total: 0, reportes: "Sin datos para validación real" })); return; }
    const daily = await obtenerReporteDiario(db, bounds.hasta);
    const range = await obtenerReporteRango(db, bounds.desde, bounds.hasta);
    assert.equal(range.total, bounds.total);
    const { rows: [counts] } = await db.query(
      "SELECT count(*) FILTER (WHERE s.descripcion='SINCRONIZADO')::int AS sincronizados, count(*) FILTER (WHERE s.descripcion IN ('ERROR','CON_ERROR') OR b.descripcion IN ('ERROR','CON_ERROR') OR g.descripcion IN ('ERROR','CON_ERROR'))::int AS errores FROM registro_enrolamiento r JOIN estado_proceso s ON s.id_estado=r.id_estado_sincronizacion JOIN estado_proceso b ON b.id_estado=r.id_estado_registro JOIN estado_proceso g ON g.id_estado=r.id_estado_general");
    assert.equal(range.resumenEjecutivo.totalErrores - range.resumenEjecutivo.erroresIngesta, counts.errores);
    assert.equal(range.sincronizacion.find(s => s.descripcion === "SINCRONIZADO")?.total || 0, counts.sincronizados);
    const trend = await obtenerTendenciaHistorica(db);
    assert.equal(trend.reduce((sum, row) => sum + row.total, 0), bounds.total);
    assert.equal(trend.reduce((sum, row) => sum + row.con_error, 0), counts.errores);
    const comparison = await obtenerComparacionPeriodos(db, "semana");
    assert.ok(comparison.actual.total >= daily.total);
    const { rows: configRows } = await db.query("SELECT config_value FROM scheduler_config WHERE config_key='current'");
    if (configRows.length) {
      const config = typeof configRows[0].config_value === "string" ? JSON.parse(configRows[0].config_value) : configRows[0].config_value;
      mergeScheduleConfig({ sendFourPhotosDaily: true, reportType: "extenso", ...config }, {});
    }
    const word = await generarReporteWord(daily, { fecha: bounds.hasta });
    const excel = await generarReporteExcel(daily, { fecha: bounds.hasta });
    assert.ok(new PizZip(word).file("word/document.xml"));
    assert.ok(new PizZip(excel).file("xl/workbook.xml"));
    console.log(JSON.stringify({ postgres: "ok", modo: "READ ONLY", total: bounds.total,
      ultimaJornada: daily.total, inconsistenciasRegistros: counts.errores,
      consistenciaDiarioRangoTendencia: "ok", comparacion: "ok",
      configuracionHorarios: configRows.length ? "válida" : "sin configuración almacenada",
      word: { valido: true, bytes: word.length }, excel: { valido: true, bytes: excel.length },
      oracle: process.env.ORACLE_CONNECTION_STRING && process.env.ORACLE_USER && process.env.ORACLE_PASSWORD
        ? "configurado; conexión no probada" : "sin configurar" }));
  } finally {
    if (client) { try { await client.query("ROLLBACK"); } finally { client.release(); } }
    await pool.end();
  }
}
if (require.main === module) main().catch(error => {
  console.error("Diagnóstico ABIS fallido:", error.code || error.message);
  process.exitCode = 1;
});
module.exports = { main };
