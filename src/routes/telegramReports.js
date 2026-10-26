const { cargarReporte, csvCell } = require("../reportes/reportSelection");

// Rutas ABIS; se registran detrás del middleware de sesión del servidor.
function registerTelegramReportRoutes(app, { pool, FECHA_VALIDA, obtenerReporteDiario, obtenerReporteRango, formatearReporteExtenso, crearBotonesDescarga, telegramClient }) {
  app.post("/api/telegram/enviar", async (req, res) => {
    try {
      const { reporte, fecha, desde, hasta } = await cargarReporte(pool, req.body || {});

      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;

      if (!token || !chatId) {
        return res.status(500).json({ ok: false, error: "Token o Chat ID de Telegram no configurados en el archivo .env" });
      }

      const periodo = desde && hasta ? `${desde} al ${hasta}` : (reporte.fecha || fecha);
      const texto = formatearReporteExtenso(reporte, {
        desde,
        hasta,
        fecha: reporte.fecha || fecha,
        origen: "Dashboard Web PDI",
      });

      const replyMarkup = crearBotonesDescarga({ fecha: reporte.fecha || fecha, desde, hasta });
      let envio = null;

      // El envio manual diario usa el mismo album de 4 capturas que el programador.
      if (!desde || !hasta) {
        try {
          const {
            generarCapturaDiaria,
            generarCapturaDistribucionDiaria,
            generarCapturaAcumulado,
          } = require("../reportes/imageReportService");
          const { obtenerDatosAcumulados } = require("../reportes/reporteFinDeSemana");
          const anioActual = new Date().getFullYear();
          const [dataAcumEnrolados, dataAcumRegistros] = await Promise.all([
            obtenerDatosAcumulados(pool, { soloEnrolados: true }),
            obtenerDatosAcumulados(pool, { soloEnrolados: false }),
          ]);
          const [bufferDiario, bufferDistribucion, bufferAcumEnrolados, bufferAcumRegistros] = await Promise.all([
            generarCapturaDiaria(reporte),
            generarCapturaDistribucionDiaria(reporte),
            generarCapturaAcumulado(dataAcumEnrolados, {
              titulo: `TOTAL DE ENROLADOS EN EL SISTEMA ABIS ACUMULADO AL ANIO ${anioActual}`,
              tipoFiltro: "ENROLADO",
              anio: anioActual,
            }),
            generarCapturaAcumulado(dataAcumRegistros, {
              titulo: `TOTAL DE REGISTROS EN EL SISTEMA ABIS ACUMULADO AL ANIO ${anioActual}`,
              tipoFiltro: "TODOS",
              anio: anioActual,
            }),
          ]);

          envio = await telegramClient.enviarGrupoFotos({
            token,
            chatId,
            fotos: [
              { buffer: bufferDiario, caption: `FOTO 1/4: ESTADOS DE LA JORNADA ${fecha}` },
              { buffer: bufferDistribucion, caption: `FOTO 2/4: DISTRIBUCION DE LA JORNADA ${fecha}` },
              { buffer: bufferAcumEnrolados, caption: `FOTO 3/4: ENROLADOS ACUMULADOS ${anioActual}` },
              { buffer: bufferAcumRegistros, caption: `FOTO 4/4: REGISTROS ACUMULADOS ${anioActual}` },
            ],
          });

          const resTexto = await telegramClient.enviarMensaje({ token, chatId, texto, replyMarkup });
          const primerEnvio = Array.isArray(envio) ? envio[0] : envio;
          return res.json({
            ok: true,
            mensaje: `Reporte visual de la jornada ${periodo} enviado exitosamente al canal de Telegram institucional`,
            messageId: primerEnvio?.message_id || resTexto?.message_id,
          });
        } catch (dailyErr) {
          console.error("[TELEGRAM ENVIAR DIARIO ERROR]", dailyErr);
          return res.status(500).json({ ok: false, error: dailyErr.message });
        }
      }

      // Generar captura visual dinámica según la fecha o rango seleccionado en la web
      try {
        if (desde && hasta) {
          const { generarCapturaDiaria } = require("../reportes/imageReportService");
          const buffer = await generarCapturaDiaria(reporte);
          envio = await telegramClient.enviarFoto({
            token,
            chatId,
            buffer,
            caption: `📊 <b>REPORTE OFICIAL ABIS - PERÍODO ${periodo}</b>\n👥 Total Enrolados: <b>${(reporte.total || 0).toLocaleString("es-CL")}</b>`,
          });
        } else {
          const { generarCapturaDiaria } = require("../reportes/imageReportService");
          const buffer = await generarCapturaDiaria(reporte);
          envio = await telegramClient.enviarFoto({
            token,
            chatId,
            buffer,
            caption: `📊 <b>REPORTE OFICIAL ABIS - ${fecha}</b>\n👥 Total Enrolados: <b>${(reporte.total || 0).toLocaleString("es-CL")}</b>`,
          });
        }
        // Enviar además el reporte institucional de texto completo con los botones interactivos
        const resTexto = await telegramClient.enviarMensaje({
          token,
          chatId,
          texto,
          replyMarkup,
        });
        if (!envio) envio = resTexto;
      } catch (imgErr) {
        console.warn("[TELEGRAM ENVIAR] Fallback a mensaje de texto:", imgErr.message);
        envio = await telegramClient.enviarMensaje({ token, chatId, texto, replyMarkup });
      }

      res.json({
        ok: true,
        mensaje: `Reporte visual del período ${periodo} enviado exitosamente al canal de Telegram institucional`,
        messageId: envio.message_id,
      });
    } catch (err) {
      console.error("[TELEGRAM ENVIAR ERROR]", err);
      res.status(err.status || 500).json({ ok: false, error: err.message });
    }
  });

  // Herramienta Web: Cifrar archivo Excel a formato protegido .enc (AES-256-GCM)
}

module.exports = { registerTelegramReportRoutes };
