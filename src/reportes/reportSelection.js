const { obtenerReporteDiario } = require("./reporteDiario");
const { obtenerReporteRango } = require("./reporteRango");

const { esFecha, validarPeriodo } = require("./reportDates");
async function cargarReporte(pool, input = {}) {
  const { fecha, desde, hasta } = input;
  if (desde !== undefined || hasta !== undefined) {
    validarPeriodo(desde, hasta);
    return { desde, hasta, reporte: await obtenerReporteRango(pool, desde, hasta) };
  }
  if (fecha !== undefined && fecha !== "" && !esFecha(fecha)) {
    throw Object.assign(new Error("Fecha inválida; use YYYY-MM-DD."), { status: 400 });
  }
  let selected = fecha;
  if (!selected) {
    const { rows } = await pool.query("SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS fecha FROM registro_enrolamiento");
    selected = rows[0]?.fecha;
  }
  if (!selected) throw Object.assign(new Error("No hay registros disponibles para generar el informe."), { status: 404 });
  return { fecha: selected, reporte: await obtenerReporteDiario(pool, selected) };
}
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
module.exports = { esFecha, validarPeriodo, cargarReporte, csvCell };
