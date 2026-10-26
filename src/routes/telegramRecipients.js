const { Router } = require("express");
const { requireSessionUser } = require("../middleware/session");
const { destinatarioPublico, maskSensitiveId } = require("../telegram/recipientPresenter");

// Se monta DESPUÉS de apiRequireAuth. Dependencias explícitas para pruebas sin DB ni Telegram.
function createRecipientRouter({ pool, recipientService, telegramClient, getBotToken }) {
  const router = Router();
  // Lista todos los destinatarios registrados e información pública del bot
  router.get("/", async (req, res) => {
    try {
      const destinatarios = await recipientService.listarDestinatarios(pool);
      let botInfo = null;
      const token = getBotToken();
      if (token) {
        const info = await telegramClient.obtenerInfoBot({ token });
        if (info && info.username) {
          botInfo = {
            username: info.username,
            first_name: info.first_name,
            link: `https://t.me/${info.username}`,
          };
        }
      }
      res.json({
        ok: true,
        destinatarios: destinatarios.map(destinatarioPublico),
        botInfo,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Registra o actualiza un destinatario (requiere sesión autenticada)
  router.post("/", requireSessionUser, async (req, res) => {
    try {
      const { nombre, chatId, rolUnidad, activo } = req.body || {};
      const nuevo = await recipientService.agregarDestinatario(pool, {
        nombre,
        chatId,
        rolUnidad,
        activo: activo !== undefined ? activo : true,
      });

      res.json({
        ok: true,
        mensaje: "Destinatario registrado exitosamente en el sistema.",
        destinatario: destinatarioPublico(nuevo),
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Alterna el estado (Activo / Pausado) de un destinatario (requiere sesión autenticada)
  router.patch("/:id/toggle", requireSessionUser, async (req, res) => {
    try {
      const { id } = req.params;
      const { activo } = req.body || {};
      const actualizado = await recipientService.toggleEstadoDestinatario(pool, id, activo);

      res.json({
        ok: true,
        mensaje: `Destinatario ${actualizado.activo ? "activado" : "pausado"} exitosamente.`,
        destinatario: destinatarioPublico(actualizado),
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Elimina un destinatario del sistema (requiere sesión autenticada)
  router.delete("/:id", requireSessionUser, async (req, res) => {
    try {
      const { id } = req.params;
      const eliminado = await recipientService.eliminarDestinatario(pool, id);

      res.json({
        ok: true,
        mensaje: `Destinatario '${eliminado.nombre}' (${maskSensitiveId(eliminado.chat_id)}) eliminado del sistema.`,
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Envío de prueba individual inmediata a un destinatario
  router.post("/:id/probar", async (req, res) => {
    try {
      const { id } = req.params;
      const resultado = await recipientService.enviarPruebaIndividual(pool, id);

      res.json({
        ok: true,
        mensaje: `Mensaje de verificación enviado exitosamente a ${resultado.destinatario.nombre} (${maskSensitiveId(resultado.destinatario.chat_id)}).`,
        resultado: { ...resultado, destinatario: destinatarioPublico(resultado.destinatario) },
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });
  return router;
}

module.exports = { createRecipientRouter };
