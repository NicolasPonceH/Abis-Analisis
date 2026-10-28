function createServerRuntime({
  app,
  port,
  pool,
  bot,
  schedulerService,
  recipientService,
  ensureIngestHistory,
  siad,
  env = process.env,
  processRef = process,
  logger = console,
}) {
  function startServer() {
    const managesSiadProcess = env.ENABLE_SIAD !== "false";
    const host = env.HOST || null;
    const onListening = () => {
      logger.log(`Sistema ABIS escuchando en http://${host || "localhost"}:${port}`);

      if (env.ENABLE_TELEGRAM_BOT !== "false" && env.TELEGRAM_BOT_TOKEN) {
        bot.iniciarBot({ token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID, pool })
          .catch(err => logger.error("Error iniciando bot interactivo en servidor:", err.message));
      }
      recipientService.inicializarDestinatarios(pool).catch(err => {
        logger.warn("Advertencia al inicializar destinatarios de Telegram:", err.message);
      });
      ensureIngestHistory(pool).catch(err => {
        logger.warn("Advertencia al inicializar historial de ingestas:", err.message);
      });
      schedulerService.iniciarScheduler({ pool });
      if (managesSiadProcess) {
        siad.iniciarSIAD({ SIAD_PORT: env.SIAD_PORT || "5001" });
      } else {
        logger.log("SIAD se administra como servicio externo; ABIS usará SIAD_URL.");
      }
    };
    const server = host ? app.listen(port, host, onListening) : app.listen(port, onListening);

    let closing = false;
    const closeServer = () => {
      if (closing) return;
      closing = true;
      bot.detenerBot();
      if (managesSiadProcess) siad.detenerSIAD();
      schedulerService.detenerScheduler();
      server.close(() => pool.end().finally(() => processRef.exit(0)));
    };
    processRef.on("SIGINT", closeServer);
    processRef.on("SIGTERM", closeServer);
    return server;
  }

  return { startServer };
}

module.exports = { createServerRuntime };
