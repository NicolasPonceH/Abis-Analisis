const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const { createAuthMiddleware } = require("./middleware/auth");
const { createSiadProxy } = require("./middleware/siadProxy");
const { apiErrorHandler, notFoundHandler } = require("./middleware/errorHandler");
const { upload, uploadEncrypted } = require("./middleware/uploads");
const { requireSessionUser } = require("./middleware/session");
const { createRecipientRouter } = require("./routes/telegramRecipients");
const { registerAuthRoutes } = require("./routes/auth");
const { registerPageRoutes } = require("./routes/pages");
const { registerHealthRoutes } = require("./routes/health");
const { registerAccountRoutes } = require("./routes/accounts");
const { registerMetricRoutes } = require("./routes/metrics");
const { registerExportRoutes } = require("./routes/exports");
const { registerIngestRoutes } = require("./routes/ingest");
const { registerTelegramReportRoutes } = require("./routes/telegramReports");
const { registerSecurityRoutes } = require("./routes/security");
const { registerScheduleRoutes } = require("./routes/schedule");
const { registerPreviewRoutes } = require("./routes/previews");
const { obtenerReporteDiario } = require("./reportes/reporteDiario");
const {
  obtenerReporteRango,
  obtenerTendenciaHistorica,
  obtenerFechasDisponibles,
  obtenerComparacionPeriodos,
} = require("./reportes/reporteRango");
const { esFecha } = require("./reportes/reportDates");
const { runEtl, runSheetEtl } = require("./etl");
const { bulkInsertRegistros } = require("./etl/bulkInsert");
const { loadCatalogs, mapRow } = require("./ingest/catalogMapper");
const { transformOracleToPostgre, importarOracleLegacy } = require("./ingest/oracleLegacy");
const { ensureIngestHistory, crearLote, actualizarLote, listarLotes } = require("./ingest/ingestHistory");
const { generarHashSHA256, esBufferCifrado, cifrarBuffer, descifrarBuffer } = require("./security/crypto");
const telegramClient = require("./telegram/telegramClient");
const { formatearReporteExtenso } = require("./telegram/formatearReporte");
const { crearBotonesDescarga } = require("./telegram/botService");
const { generarReporteWord } = require("./reportes/wordReportService");
const { generarReporteExcel } = require("./reportes/excelReportService");
const schedulerService = require("./services/schedulerService");
const recipientService = require("./telegram/recipientService");

function createApp({ db = pool, env = process.env, jwtLib = jwt, expressLib = express } = {}) {
  const app = expressLib();
  const secret = env.SECRET_KEY;
  const auth = createAuthMiddleware({ secret, env, jwtLib, pool: db });
  const FECHA_VALIDA = { test: esFecha };

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  // Preserve proxy-before-body-parser behavior for streamed SIAD uploads.
  app.use("/analisis", createSiadProxy({ env }));
  app.use(expressLib.json({ limit: "10mb" }));
  app.use(expressLib.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use("/api", auth.apiRequireAuth);

  registerAuthRoutes(app, {
    pool: db,
    jwt: jwtLib,
    secret,
    env,
    fetchImpl: globalThis.fetch,
  });
  registerPageRoutes(app, { pool: db, jwt: jwtLib, secret, requireAuth: auth.requireAuth });
  registerAccountRoutes(app, { pool: db, requireAuth: auth.requireAuth, express: expressLib });

  app.use(expressLib.static(path.join(__dirname, "../public")));
  registerHealthRoutes(app, { pool: db });

  registerMetricRoutes(app, {
    pool: db,
    FECHA_VALIDA,
    obtenerReporteDiario,
    obtenerReporteRango,
    obtenerFechasDisponibles,
    obtenerTendenciaHistorica,
    obtenerComparacionPeriodos,
  });
  registerExportRoutes(app, {
    pool: db, FECHA_VALIDA, obtenerReporteDiario, obtenerReporteRango, generarReporteWord, generarReporteExcel,
  });
  registerIngestRoutes(app, {
    pool: db,
    requireSessionUser,
    upload,
    importarOracleLegacy,
    loadCatalogs,
    mapRow,
    bulkInsertRegistros,
    generarHashSHA256,
    ensureIngestHistory,
    crearLote,
    actualizarLote,
    listarLotes,
    esBufferCifrado,
    runEtl,
    runSheetEtl,
  });
  registerTelegramReportRoutes(app, {
    pool: db,
    FECHA_VALIDA,
    obtenerReporteDiario,
    obtenerReporteRango,
    formatearReporteExtenso,
    crearBotonesDescarga,
    telegramClient,
  });
  registerSecurityRoutes(app, {
    pool: db, requireSessionUser, upload, uploadEncrypted, generarHashSHA256, cifrarBuffer, descifrarBuffer, esBufferCifrado,
  });
  registerScheduleRoutes(app, { pool: db, schedulerService, requireSessionUser, generarHashSHA256 });

  app.use("/api/telegram/destinatarios", createRecipientRouter({
    pool: db,
    recipientService,
    telegramClient,
    getBotToken: () => env.TELEGRAM_BOT_TOKEN,
  }));
  registerPreviewRoutes(app, { pool: db, schedulerService });
  app.use(notFoundHandler);
  app.use(apiErrorHandler);

  return app;
}

const app = createApp();

module.exports = { app, createApp, transformOracleToPostgre };
