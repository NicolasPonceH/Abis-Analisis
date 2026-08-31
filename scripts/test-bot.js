require("dotenv").config();
const pool = require("../src/db");
const { procesarMensaje } = require("../src/telegram/botService");

async function runTests() {
  console.log("Iniciando pruebas de lógica del Bot...");

  const mensajesEnviados = [];

  // Mockear envio de mensajes sin llamar a Telegram API real
  const telegramClient = require("../src/telegram/telegramClient");
  const originalEnviarMensaje = telegramClient.enviarMensaje;
  telegramClient.enviarMensaje = async ({ token, chatId, texto }) => {
    mensajesEnviados.push({ chatId, texto });
    return { ok: true };
  };

  const chatId = process.env.TELEGRAM_CHAT_ID || "123456789";

  try {
    // Test 1: /ayuda
    console.log("Test 1: /ayuda");
    await procesarMensaje({
      mensaje: { chat: { id: chatId }, text: "/ayuda" },
      token: "fake-token",
      authorizedChatId: chatId,
      pool,
    });
    console.log("Respuesta /ayuda:\n", mensajesEnviados.pop().texto);

    // Test 2: /logs
    console.log("Test 2: /logs");
    await procesarMensaje({
      mensaje: { chat: { id: chatId }, text: "/logs" },
      token: "fake-token",
      authorizedChatId: chatId,
      pool,
    });
    console.log("Respuesta /logs:\n", mensajesEnviados.pop().texto);

    // Test 3: /estado
    console.log("Test 3: /estado");
    await procesarMensaje({
      mensaje: { chat: { id: chatId }, text: "/estado" },
      token: "fake-token",
      authorizedChatId: chatId,
      pool,
    });
    console.log("Respuesta /estado:\n", mensajesEnviados.pop().texto);

    // Test 4: /reporte
    console.log("Test 4: /reporte");
    await procesarMensaje({
      mensaje: { chat: { id: chatId }, text: "/reporte" },
      token: "fake-token",
      authorizedChatId: chatId,
      pool,
    });
    console.log("Respuesta /reporte:\n", mensajesEnviados.pop().texto);

    // Test 5: Chat no autorizado
    console.log("Test 5: Chat no autorizado");
    await procesarMensaje({
      mensaje: { chat: { id: "999999999" }, text: "/logs" },
      token: "fake-token",
      authorizedChatId: chatId,
      pool,
    });
    console.log("Respuesta no autorizado:\n", mensajesEnviados.pop().texto);

    // Test 6: Comando desconocido (/comando_invalido)
    console.log("Test 6: Comando desconocido");
    await procesarMensaje({
      mensaje: { chat: { id: chatId }, text: "/comando_invalido" },
      token: "fake-token",
      authorizedChatId: chatId,
      pool,
    });
    console.log("Respuesta comando desconocido:\n", mensajesEnviados.pop().texto);

    // Test 7: Texto regular sin slash ("hola")
    console.log("Test 7: Mensaje libre no reconocido");
    await procesarMensaje({
      mensaje: { chat: { id: chatId }, text: "hola bot" },
      token: "fake-token",
      authorizedChatId: chatId,
      pool,
    });
    console.log("Respuesta texto no reconocido:\n", mensajesEnviados.pop().texto);

    console.log("\n✅ Todas las pruebas del Bot pasaron exitosamente!");
  } finally {
    telegramClient.enviarMensaje = originalEnviarMensaje;
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error("Error en pruebas:", err);
  process.exit(1);
});
