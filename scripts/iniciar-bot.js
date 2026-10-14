require("dotenv").config();
const { Pool } = require("pg");
const { iniciarBot } = require("../src/telegram/botService");

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("❌ Error: TELEGRAM_BOT_TOKEN no está definido en el archivo .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

console.log("🤖 Iniciando bot interactivo de Telegram para Sistema ABIS...");
iniciarBot({
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  pool,
}).catch((err) => {
  console.error("❌ Error en bot de Telegram:", err.message);
});
