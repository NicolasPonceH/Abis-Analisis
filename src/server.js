require("dotenv").config();

const pool = require("./db");
const { app, transformOracleToPostgre } = require("./app");
const { createServerRuntime } = require("./services/serverRuntime");
const { iniciarBot, detenerBot } = require("./telegram/botService");
const schedulerService = require("./services/schedulerService");
const recipientService = require("./telegram/recipientService");
const { ensureIngestHistory } = require("./ingest/ingestHistory");
const { iniciarSIAD, detenerSIAD } = require("./services/siadService");

const { startServer } = createServerRuntime({
  app,
  port: process.env.PORT || 3000,
  pool,
  bot: { iniciarBot, detenerBot },
  schedulerService,
  recipientService,
  ensureIngestHistory,
  siad: { iniciarSIAD, detenerSIAD },
});

if (require.main === module) startServer();

module.exports = { app, startServer, transformOracleToPostgre };
