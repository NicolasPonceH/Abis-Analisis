// Diagnóstico del bot de Telegram: detecta por qué los comandos no llegan al servidor.
// Uso (con el servidor DETENIDO o encendido, ambos sirven):  node scripts/diagnostico-bot.js
require("dotenv").config();

const API = "https://api.telegram.org";
const token = process.env.TELEGRAM_BOT_TOKEN;

async function llamar(metodo, params = "") {
  const res = await fetch(`${API}/bot${token}/${metodo}${params}`);
  return res.json();
}

(async () => {
  console.log("\n=== DIAGNÓSTICO BOT TELEGRAM (Sistema ABIS) ===\n");

  if (!token) {
    console.log("❌ No hay TELEGRAM_BOT_TOKEN en el .env");
    return;
  }

  const enable = process.env.ENABLE_TELEGRAM_BOT;
  if (enable === "false") {
    console.log("❌ ENABLE_TELEGRAM_BOT=false → el servidor NO escucha comandos. Quítalo o ponlo en true.");
  } else {
    console.log(`✅ ENABLE_TELEGRAM_BOT = ${enable === undefined ? "(no definido → activo)" : enable}`);
  }
  console.log(`ℹ️  TELEGRAM_CHAT_ID = ${process.env.TELEGRAM_CHAT_ID || "(vacío)"}`);

  const me = await llamar("getMe");
  if (!me.ok) {
    console.log(`❌ Token inválido: ${me.description}`);
    return;
  }
  console.log(`✅ Bot: @${me.result.username} (id ${me.result.id})`);

  const wh = await llamar("getWebhookInfo");
  if (wh.ok && wh.result.url) {
    console.log(`❌ El bot tiene un WEBHOOK activo: ${wh.result.url}`);
    console.log("   Con webhook, el servidor no puede recibir comandos. Para quitarlo ejecuta:");
    console.log("   node scripts/diagnostico-bot.js --borrar-webhook");
    if (process.argv.includes("--borrar-webhook")) {
      const del = await llamar("deleteWebhook");
      console.log(del.ok ? "   ✅ Webhook eliminado. Reinicia npm start." : `   ❌ ${del.description}`);
    }
  } else {
    console.log("✅ Sin webhook (correcto para long polling)");
  }

  const up = await llamar("getUpdates", "?timeout=0&limit=5");
  if (!up.ok) {
    if (String(up.description).includes("Conflict")) {
      console.log("❌ CONFLICTO: otro proceso está leyendo los comandos de este bot.");
      console.log("   (Si npm start está encendido en este PC es normal; si está APAGADO,");
      console.log("    hay otra PC/proceso usando este mismo token.)");
    } else {
      console.log(`❌ getUpdates falló: ${up.description}`);
    }
  } else {
    console.log(`✅ getUpdates OK (${up.result.length} mensajes pendientes)`);
    for (const u of up.result) {
      const m = u.message || u.callback_query?.message;
      if (m) console.log(`   • chat ${m.chat.id} (${m.chat.type}): ${u.message?.text || "[botón]"}`);
    }
  }

  console.log("\n=== FIN ===\n");
})().catch((err) => console.error("Error en diagnóstico:", err.message));
