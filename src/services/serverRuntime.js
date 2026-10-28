const http = require("http");
const os = require("os");

function getAvailableHostAddresses() {
  try {
    const interfaces = os.networkInterfaces();
    const list = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal) {
          list.push({ name, ip: iface.address });
        }
      }
    }
    return list;
  } catch (_) {
    return [];
  }
}

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
    const available = getAvailableHostAddresses();
    const institutionalIps = available.filter(i => i.ip.startsWith("172."));

    let host = env.HOST || null;
    if (host === "auto" || !host) {
      // Si existe una IP 172 institucional activa, la usamos; de lo contrario funcionamos en localhost
      host = institutionalIps.length > 0 ? institutionalIps[0].ip : "127.0.0.1";
    } else if (host !== "0.0.0.0" && host !== "127.0.0.1" && host !== "localhost") {
      const exists = available.some(i => i.ip === host);
      if (!exists) {
        logger.warn(`[RED] La IP configurada (${host}) no está activa en las interfaces de este servidor. Se utilizará localhost (127.0.0.1)...`);
        host = "127.0.0.1";
      }
    }

    const onListening = () => {
      logger.log(`====================================================`);
      logger.log(` Sistema ABIS iniciado en puerto ${port}:`);
      if (host === "0.0.0.0") {
        logger.log(`  > Modo Abierto (0.0.0.0): http://localhost:${port}`);
      } else if (host === "127.0.0.1" || host === "localhost") {
        logger.log(`  > Estación 1 y 2 (Modo Local): http://localhost:${port}`);
        if (institutionalIps.length === 0) {
          logger.log(`  ℹ Sin interfaz 172.x activa. Operando de forma segura en loopback local.`);
        }
      } else {
        logger.log(`  > Estación 1 (Localhost / Loopback): http://localhost:${port}`);
        logger.log(`  > Estación 2 (Red Institucional): http://${host}:${port}`);
        logger.log(`  🔒 Aislamiento: Redes 192.168.x.x y públicas no tienen acceso.`);
      }
      logger.log(`====================================================`);

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

    // Servidor principal
    const server = (host && app.listen.length !== 2)
      ? app.listen(port, host, onListening)
      : app.listen(port, onListening);

    // Si el host principal es una IP externa (ej. 172.x.x.x), vinculamos también 127.0.0.1
    // para que la Estación 1 (el propio servidor local) pueda acceder por localhost sin salir al switch
    let localServer = null;
    if (host && host !== "127.0.0.1" && host !== "localhost" && host !== "0.0.0.0" && typeof app === "function") {
      try {
        localServer = http.createServer(app);
        localServer.listen(port, "127.0.0.1");
        localServer.on("error", (err) => {
          logger.warn(`[RED] Listener secundario 127.0.0.1 omitido: ${err.message}`);
        });
      } catch (_) {}
    }

    let closing = false;
    const closeServer = () => {
      if (closing) return;
      closing = true;
      bot.detenerBot();
      if (managesSiadProcess) siad.detenerSIAD();
      schedulerService.detenerScheduler();
      if (localServer) {
        try { localServer.close(); } catch (_) {}
      }
      server.close(() => pool.end().finally(() => processRef.exit(0)));
    };
    processRef.on("SIGINT", closeServer);
    processRef.on("SIGTERM", closeServer);
    return server;
  }

  return { startServer };
}

module.exports = { createServerRuntime };

