// Rutas ABIS; se registran detrás del middleware de sesión del servidor.
function registerPreviewRoutes(app, { pool, schedulerService }) {
  app.get("/api/reportes/captura-preview", async (req, res) => {
    try {
      const { tipo = "fds_matriz", fecha = null } = req.query;
      const {
        generarCapturaMatrizFinDeSemana,
        generarCapturaDistribucionFinDeSemana,
        generarCapturaDiaria,
      } = require("../reportes/imageReportService");
      const { obtenerReporteFinDeSemana } = require("../reportes/reporteFinDeSemana");
      const { obtenerReporteDiario } = require("../reportes/reporteDiario");

      const periodo = await schedulerService.calcularPeriodoOperativo(pool, {
        fechaReferencia: fecha,
        forzarModo: tipo.startsWith("fds") ? "fds" : tipo === "diario" ? "diario" : null,
      });

      let buffer;
      if (tipo === "fds_distribucion") {
        const rep = await obtenerReporteFinDeSemana(pool, periodo.fechas);
        buffer = await generarCapturaDistribucionFinDeSemana(rep);
      } else if (tipo === "fds_enrolados") {
        const { obtenerDatosAcumulados } = require("../reportes/reporteFinDeSemana");
        const { generarCapturaAcumulado } = require("../reportes/imageReportService");
        const anioActual = new Date().getFullYear();
        const dataAcum = await obtenerDatosAcumulados(pool, { soloEnrolados: true });
        buffer = await generarCapturaAcumulado(dataAcum, {
          titulo: `TOTAL DE ENROLADOS EN EL SISTEMA ABIS ACUMULADO AL AÑO ${anioActual}`,
          tipoFiltro: "ENROLADO",
          anio: anioActual,
        });
      } else if (tipo === "fds_registros") {
        const { obtenerDatosAcumulados } = require("../reportes/reporteFinDeSemana");
        const { generarCapturaAcumulado } = require("../reportes/imageReportService");
        const anioActual = new Date().getFullYear();
        const dataAcum = await obtenerDatosAcumulados(pool, { soloEnrolados: false });
        buffer = await generarCapturaAcumulado(dataAcum, {
          titulo: `TOTAL DE REGISTROS EN EL SISTEMA ABIS ACOMULADO AL AÑO ${anioActual}`,
          tipoFiltro: "TODOS",
          anio: anioActual,
        });
      } else if (tipo === "diario") {
        const rep = await obtenerReporteDiario(pool, periodo.fecha);
        buffer = await generarCapturaDiaria(rep);
      } else {
        // Por defecto fds_matriz (Matriz comparativa de estados del fin de semana)
        const rep = await obtenerReporteFinDeSemana(pool, periodo.fechas);
        buffer = await generarCapturaMatrizFinDeSemana(rep);
      }

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `inline; filename="captura_${tipo}.png"`);
      res.send(buffer);
    } catch (err) {
      console.error("[CAPTURA PREVIEW ERROR]", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}

module.exports = { registerPreviewRoutes };
