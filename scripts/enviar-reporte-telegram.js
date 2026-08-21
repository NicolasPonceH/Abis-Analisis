require("dotenv").config();
const pool = require("../src/db");
const { obtenerReporteDiario } = require("../src/reportes/reporteDiario");
const { formatearReporte } = require("../src/telegram/formatearReporte");
const { enviarMensaje } = require("../src/telegram/telegramClient");

const fecha = process.argv[2];
if (!fecha) {
  console.error("Uso: node scripts/enviar-reporte-telegram.js <YYYY-MM-DD>");
  process.exit(1);
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("Faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID en .env");
  }

  const reporte = await obtenerReporteDiario(pool, fecha);
  const texto = formatearReporte(reporte);

  console.log("--- Mensaje a enviar ---");
  console.log(texto);
  console.log("------------------------");

  await enviarMensaje({ token, chatId, texto });
  console.log("Mensaje enviado correctamente.");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Error enviando el reporte:", err.message);
    return pool.end().finally(() => process.exit(1));
  });
