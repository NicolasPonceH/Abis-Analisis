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

// Cliente HTTP minimo para la API de Telegram. Usa el fetch nativo de Node (18+),
// sin agregar dependencias nuevas.
async function enviarMensaje({ token, chatId, texto, replyMarkup }) {
  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text: truncarSiExcede(texto),
    parse_mode: "HTML",
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API: ${data.description || "error desconocido"}`);
  }
  return data.result;
}

// Envía un documento binario (Excel .xlsx o Word .docx) como archivo adjunto nativo en Telegram
async function enviarDocumento({ token, chatId, buffer, nombreArchivo, caption, replyMarkup }) {
  const url = `${TELEGRAM_API}/bot${token}/sendDocument`;

  const formData = new FormData();
  formData.append("chat_id", String(chatId));
  formData.append("document", new Blob([buffer]), nombreArchivo);
  if (caption) {
    formData.append("caption", caption);
    formData.append("parse_mode", "HTML");
  }
  if (replyMarkup) {
    formData.append("reply_markup", JSON.stringify(replyMarkup));
  }

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API sendDocument: ${data.description || "error desconocido"}`);
  }
  return data.result;
}

// Envía una fotografía o captura visual (Buffer PNG/JPG) a Telegram
async function enviarFoto({ token, chatId, buffer, caption, replyMarkup }) {
  const url = `${TELEGRAM_API}/bot${token}/sendPhoto`;

  const formData = new FormData();
  formData.append("chat_id", String(chatId));
  formData.append("photo", new Blob([buffer], { type: "image/png" }), "reporte.png");
  if (caption) {
    formData.append("caption", caption.slice(0, 1024));
    formData.append("parse_mode", "HTML");
  }
  if (replyMarkup) {
    formData.append("reply_markup", JSON.stringify(replyMarkup));
  }

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  let data = await response.json();
  if (!data.ok && data.description && data.description.includes("can't parse entities")) {
    const retryFormData = new FormData();
    retryFormData.append("chat_id", String(chatId));
    retryFormData.append("photo", new Blob([buffer], { type: "image/png" }), "reporte.png");
    if (caption) {
      // Eliminar etiquetas HTML para envío en texto plano seguro
      const plainCaption = caption.replace(/<[^>]*>/g, "").slice(0, 1000);
      retryFormData.append("caption", plainCaption);
    }
    if (replyMarkup) {
      retryFormData.append("reply_markup", JSON.stringify(replyMarkup));
    }
    const retryRes = await fetch(url, { method: "POST", body: retryFormData });
    data = await retryRes.json();
  }

  if (!data.ok) {
    throw new Error(`Telegram API sendPhoto: ${data.description || "error desconocido"}`);
  }
  return data.result;
}

// Responde a un callback query de botón interactivo (muestra toast al usuario en Telegram)
async function responderCallback({ token, callbackQueryId, text, showAlert = false }) {
  const url = `${TELEGRAM_API}/bot${token}/answerCallbackQuery`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text || undefined,
      show_alert: showAlert,
    }),
  });
  const data = await response.json();
  return data;
}

async function obtenerActualizaciones({ token, offset, timeout = 25 }) {
  const params = new URLSearchParams();
  if (offset !== undefined && offset !== null) params.append("offset", offset);
  if (timeout !== undefined && timeout !== null) params.append("timeout", timeout);

  const url = `${TELEGRAM_API}/bot${token}/getUpdates?${params.toString()}`;
  const response = await fetch(url, { signal: AbortSignal.timeout((timeout + 15) * 1000) });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API: ${data.description || "error desconocido"}`);
  }
  return data.result;
}

// Envía un grupo o álbum de fotos en un mismo mensaje (sendMediaGroup)
async function enviarGrupoFotos({ token, chatId, fotos }) {
  const url = `${TELEGRAM_API}/bot${token}/sendMediaGroup`;

  const media = [];
  const formData = new FormData();
  formData.append("chat_id", String(chatId));

  fotos.forEach((f, idx) => {
    const attachName = `foto_${idx}`;
    formData.append(attachName, new Blob([f.buffer], { type: "image/png" }), `${attachName}.png`);

    const item = {
      type: "photo",
      media: `attach://${attachName}`,
    };
    if (f.caption) {
      item.caption = f.caption.slice(0, 1024);
      item.parse_mode = "HTML";
    }
    media.push(item);
  });

  formData.append("media", JSON.stringify(media));

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  let data = await response.json();
  if (!data.ok && data.description && data.description.includes("can't parse entities")) {
    const retryMedia = media.map((m) => {
      const copy = { ...m };
      if (copy.caption) {
        copy.caption = copy.caption.replace(/<[^>]*>/g, "");
      }
      delete copy.parse_mode;
      return copy;
    });
    const retryFormData = new FormData();
    retryFormData.append("chat_id", String(chatId));
    fotos.forEach((f, idx) => {
      const attachName = `foto_${idx}`;
      retryFormData.append(attachName, new Blob([f.buffer], { type: "image/png" }), `${attachName}.png`);
    });
    retryFormData.append("media", JSON.stringify(retryMedia));
    const retryRes = await fetch(url, { method: "POST", body: retryFormData });
    data = await retryRes.json();
  }

  if (!data.ok) {
    throw new Error(`Telegram API sendMediaGroup: ${data.description || "error desconocido"}`);
  }
  return data.result;
}

let cachedBotInfo = null;

async function obtenerInfoBot({ token }) {
  if (cachedBotInfo) return cachedBotInfo;
  if (!token) return null;
  try {
    const url = `${TELEGRAM_API}/bot${token}/getMe`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.ok && data.result) {
      cachedBotInfo = data.result;
      return cachedBotInfo;
    }
    return null;
  } catch (err) {
    console.warn("[TELEGRAM CLIENT] Error obteniendo info del bot:", err.message);
    return null;
  }
}

module.exports = {
  enviarMensaje,
  enviarFoto,
  enviarGrupoFotos,
  enviarDocumento,
  responderCallback,
  obtenerActualizaciones,
  obtenerInfoBot,
};


