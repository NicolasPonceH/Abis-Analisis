const http = require("http");
const os = require("os");

const DEFAULT_SERVER_IP = "172.25.7.79";

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

function resolveTargetHost(configuredHost, availableIps) {
  if (configuredHost === "0.0.0.0" || configuredHost === "127.0.0.1" || configuredHost === "localhost") {
    return configuredHost;
  }

  if (configuredHost && configuredHost !== "auto") {
    const exists = availableIps.some(i => i.ip === configuredHost);
    return exists ? configuredHost : "127.0.0.1";
  }

  // Modo auto: priorizar IP institucional 172.25.7.79 o cualquier 172.x activa
  const targetExact = availableIps.find(i => i.ip === DEFAULT_SERVER_IP);
  if (targetExact) return targetExact.ip;

  const institutionalIps = availableIps.filter(i => i.ip.startsWith("172."));
  if (institutionalIps.length > 0) return institutionalIps[0].ip;

  return "127.0.0.1";
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
    let targetHost = resolveTargetHost(env.HOST, available);

    let currentPort = Number(port) || 3000;
    const initialPort = currentPort;
    const portSearchLimit = Number.isInteger(Number(env.PORT_SEARCH_LIMIT)) && Number(env.PORT_SEARCH_LIMIT) >= 0
      ? Number(env.PORT_SEARCH_LIMIT)
      : 50;

    let activeServer = null;
    let activeLocalServer = null;
    let servicesStarted = false;

    function onListeningSuccess(boundPort, boundHost) {
      if (servicesStarted) return;
      servicesStarted = true;

      logger.log(`====================================================`);
      const portNote = boundPort !== initialPort ? ` (auto-asignado tras puerto ${initialPort} ocupado)` : "";
      logger.log(` Sistema ABIS iniciado en puerto ${boundPort}${portNote}:`);
      if (boundHost === "0.0.0.0") {
        logger.log(`  > Escuchando en todas las interfaces: http://localhost:${boundPort}`);
      } else if (boundHost === "127.0.0.1" || boundHost === "localhost") {
        logger.log(`  > Solo disponible desde el propio servidor: http://localhost:${boundPort}`);
        if (!available.some(i => i.ip === DEFAULT_SERVER_IP)) {
          logger.log(`  ℹ IP institucional ${DEFAULT_SERVER_IP} no detectada; las otras estaciones no podrán conectarse hasta reiniciar ABIS con la red activa.`);
        }
      } else {
        logger.log(`  > Estación 1 (Localhost / Servidor): http://localhost:${boundPort}`);
        logger.log(`  > Estación 2 (Red Institucional): http://${boundHost}:${boundPort}`);
        logger.log(`  > Restringir el acceso a esta IP y puerto mediante las reglas del firewall institucional.`);
      }
      logger.log(`====================================================`);

      // Enlace secundario local (localhost) para la Estación 1 si el host es la IP externa institucional
      if (boundHost !== "127.0.0.1" && boundHost !== "localhost" && boundHost !== "0.0.0.0" && typeof app === "function") {
        try {
          activeLocalServer = http.createServer(app);
          activeLocalServer.listen(boundPort, "127.0.0.1");
          activeLocalServer.on("error", (err) => {
            logger.warn(`[RED] Listener secundario 127.0.0.1 omitido: ${err.message}`);
          });
        } catch (_) {}
      }

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
    }

    function bind(candidatePort, candidateHost, retriesRemaining = portSearchLimit) {
      const isMockListen = typeof app?.listen === "function" && app.listen.length === 2;
      const s = isMockListen
        ? app.listen(candidatePort, () => onListeningSuccess(candidatePort, candidateHost))
        : app.listen(candidatePort, candidateHost, () => onListeningSuccess(candidatePort, candidateHost));

      activeServer = s;

      if (s && typeof s.on === "function") {
        s.once("error", (err) => {
          if (err.code === "EADDRINUSE") {
            if (retriesRemaining > 0) {
              retriesRemaining--;
              logger.warn(`[PUERTO] Puerto ${candidatePort} ocupado. Buscando puerto libre automático...`);
              currentPort = candidatePort + 1;
              bind(currentPort, candidateHost, retriesRemaining);
            } else if (candidateHost !== "127.0.0.1" && candidateHost !== "localhost") {
              logger.warn(`[PUERTO] No se encontró un puerto libre en la interfaz ${candidateHost}. Reintentando en localhost...`);
              currentPort = initialPort;
              bind(initialPort, "127.0.0.1", portSearchLimit);
            } else {
              logger.error(`[PUERTO] No se encontró un puerto libre en ${candidateHost} después de ${portSearchLimit + 1} intentos. Cerrando para permitir la recuperación del servicio.`);
              processRef.exit(1);
            }
          } else if (err.code === "EADDRNOTAVAIL") {
            logger.warn(`[RED] La IP ${candidateHost} no está activa en el host. Ejecutando en localhost (127.0.0.1)...`);
            targetHost = "127.0.0.1";
            bind(candidatePort, "127.0.0.1");
          } else {
            logger.error(`[SERVIDOR] Error en socket del servidor:`, err.message);
          }
        });
      }

      return s;
    }

    const server = bind(currentPort, targetHost);

    let closing = false;
    const closeServer = () => {
      if (closing) return;
      closing = true;
      bot.detenerBot();
      if (managesSiadProcess) siad.detenerSIAD();
      schedulerService.detenerScheduler();
      if (activeLocalServer) {
        try { activeLocalServer.close(); } catch (_) {}
      }
      const sToClose = activeServer || server;
      if (sToClose && typeof sToClose.close === "function") {
        sToClose.close(() => pool.end().finally(() => processRef.exit(0)));
      } else {
        pool.end().finally(() => processRef.exit(0));
      }
    };
    processRef.on("SIGINT", closeServer);
    processRef.on("SIGTERM", closeServer);
    return server;
  }

  return { startServer };
}

module.exports = { createServerRuntime, resolveTargetHost, DEFAULT_SERVER_IP };

