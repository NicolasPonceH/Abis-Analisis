// Rutas ABIS; se registran detrás del middleware de sesión del servidor.
function registerScheduleRoutes(app, { pool, schedulerService, requireSessionUser, generarHashSHA256 }) {
  app.get("/api/settings/schedule", async (req, res) => {
    try {
      const config = await schedulerService.getConfig();
      const next = schedulerService.getNextExecution(config);
      const horaChile = schedulerService.obtenerHoraChile();

      res.json({
        ok: true,
        config,
        next,
        horaChile,
        serverTimestamp: Date.now(),
        telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
        defaultChatId: process.env.TELEGRAM_CHAT_ID
          ? String(process.env.TELEGRAM_CHAT_ID).slice(0, 4) + "***" + String(process.env.TELEGRAM_CHAT_ID).slice(-3)
          : null,
      });
    } catch (err) {
      res.status(err.status || 500).json({ ok: false, error: err.message });
    }
  });

  // Guarda los horarios usando la sesión ya autenticada, sin una segunda contraseña.
  app.post("/api/settings/schedule", requireSessionUser, async (req, res) => {
    try {

      const { enabled, times, days, timesByDay, reportType, telegramChatId, sendFourPhotosDaily } = req.body || {};
      const updated = await schedulerService.saveConfig({
        enabled,
        times,
        days,
        timesByDay,
        reportType,
        telegramChatId,
        sendFourPhotosDaily,
      });
      const next = schedulerService.getNextExecution(updated);

      // Registro de auditoría inmutable
      try {
        await pool.query(
          `INSERT INTO registro_auditoria_cifrada 
           (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
           VALUES (NOW(), 'MODIFICACION_PROGRAMACION_AUTORIZADA', 'schedule-config.json', $1, $2, $3)`,
          [
            generarHashSHA256(Buffer.from(JSON.stringify(updated))),
            `Horarios generales: ${(updated.times || []).join(", ")} hrs | Días: ${(updated.days || []).join(",")} | Horarios por día (0=domingo): ${JSON.stringify(updated.timesByDay || {})} | Reporte: ${updated.reportType}`,
            req.user.username,
          ]
        );
      } catch (auditErr) {
        console.warn("[AUDITORÍA] Advertencia al registrar modificación de programación en bitácora:", auditErr.message);
      }

      res.json({
        ok: true,
        mensaje: "Configuración de horarios de reporte actualizada exitosamente.",
        config: updated,
        next,
      });
    } catch (err) {
      res.status(err.status || 500).json({ ok: false, error: err.message });
    }
  });

  // Disparo de prueba manual de notificación programada con capturas visuales
  app.post("/api/settings/schedule/test", async (req, res) => {
    try {
      const { chatId, fecha, modo, incluirAdjuntos } = req.body || {};
      const resultado = await schedulerService.triggerScheduledReport({
        pool,
        isTest: true,
        actor: req.user.username,
        customChatId: chatId,
        fechaReferencia: fecha || null,
        forzarModo: modo || null,
        incluirAdjuntos: incluirAdjuntos !== undefined ? incluirAdjuntos : true,
      });

      res.json({
        ok: true,
        mensaje: "Reporte con capturas visuales enviado exitosamente al canal de Telegram.",
        resultado,
      });
    } catch (err) {
      console.error("[SCHEDULE TEST ERROR]", err);
      res.status(err.status || 500).json({ ok: false, error: err.message });
    }
  });

  // ==========================================================================
  // GESTOR DE DESTINATARIOS Y OFICIALES DE TELEGRAM (POSTGRESQL SEGURO)
  // ==========================================================================
}

module.exports = { registerScheduleRoutes };
