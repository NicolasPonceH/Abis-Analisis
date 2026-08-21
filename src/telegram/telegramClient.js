const TELEGRAM_API = "https://api.telegram.org";
// Limite real de Telegram para el texto de sendMessage. Sin este resguardo, un reporte con un
// catalogo institucional grande (muchos cuarteles/unidades) podia superar el limite y la API
// rechazaba el envio entero (Sprint 8, encontrado en QA).
const LIMITE_CARACTERES = 4096;

function truncarSiExcede(texto) {
  if (texto.length <= LIMITE_CARACTERES) return texto;
  const nota = "\n\n(mensaje truncado: excedia el limite de Telegram)";
  return texto.slice(0, LIMITE_CARACTERES - nota.length) + nota;
}

// Cliente HTTP minimo para la API de Telegram (Sprint 6). Usa el fetch nativo de Node (18+),
// sin agregar dependencias nuevas.
async function enviarMensaje({ token, chatId, texto }) {
  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: truncarSiExcede(texto), parse_mode: "Markdown" }),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API: ${data.description || "error desconocido"}`);
  }
  return data.result;
}

module.exports = { enviarMensaje };
