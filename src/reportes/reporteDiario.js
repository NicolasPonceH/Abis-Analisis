const { obtenerReporteRango } = require("./reporteRango");

// Un día es un período de un día. Un solo SQL evita divergencias con el reporte por rango.
async function obtenerReporteDiario(pool, fecha) {
  const { desde, hasta, diasConDatos, ...reporte } = await obtenerReporteRango(pool, fecha, fecha);
  return { fecha, ...reporte };
}

module.exports = { obtenerReporteDiario };

