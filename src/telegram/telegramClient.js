const TELEGRAM_API = "https://api.telegram.org";

// Cliente HTTP minimo para la API de Telegram (Sprint 6). Usa el fetch nativo de Node (18+),
// sin agregar dependencias nuevas.
async function enviarMensaje({ token, chatId, texto }) {
  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: "Markdown" }),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API: ${data.description || "error desconocido"}`);
  }
  return data.result;
}

module.exports = { enviarMensaje };
