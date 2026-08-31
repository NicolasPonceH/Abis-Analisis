require("dotenv").config();
const pool = require("../src/db");
const { iniciarBot, detenerBot } = require("../src/telegram/botService");

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token) {
  console.error("Error: Falta TELEGRAM_BOT_TOKEN en el archivo .env");
  process.exit(1);
}

console.log("Iniciando servicio del Bot de Telegram ABIS...");
if (chatId) {
  console.log(`Chat autorizado: ${chatId}`);
} else {
  console.warn("Aviso: No se definió TELEGRAM_CHAT_ID en .env (permitiendo comandos de cualquier chat)");
}

iniciarBot({ token, chatId, pool }).catch((err) => {
  console.error("Error fatal en el bot:", err);
  pool.end().finally(() => process.exit(1));
});

process.on("SIGINT", () => {
  console.log("\nDeteniendo bot...");
  detenerBot();
  pool.end().then(() => {
    console.log("Conexiones cerradas.");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\nDeteniendo bot...");
  detenerBot();
  pool.end().then(() => process.exit(0));
});
