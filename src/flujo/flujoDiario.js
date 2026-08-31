const fs = require("fs");
const path = require("path");
const { runEtl } = require("../etl");
const { obtenerReporteDiario } = require("../reportes/reporteDiario");
const { formatearReporte, formatearAlerta, formatearAvisoFilasOmitidas } = require("../telegram/formatearReporte");
const { enviarMensaje } = require("../telegram/telegramClient");

function guardarUltimoEtl(filePath, resultadoEtl) {
  try {
    const logsDir = path.resolve(__dirname, "../../logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logPath = path.join(logsDir, "ultimo-etl.json");
    const info = {
      timestamp: new Date().toISOString(),
      archivo: path.basename(filePath),
      rutaCompleta: filePath,
      totalMapeadas: resultadoEtl.rows ? resultadoEtl.rows.length : 0,
      totalInsertadas: resultadoEtl.insertResult ? resultadoEtl.insertResult.inserted : 0,
      correcciones: resultadoEtl.rows ? resultadoEtl.rows.flatMap((r) => r.correcciones || []) : [],
      errores: resultadoEtl.errors || [],
    };
    fs.writeFileSync(logPath, JSON.stringify(info, null, 2), "utf8");
  } catch (err) {
    console.error("No se pudo guardar logs/ultimo-etl.json:", err.message);
  }
}

function credencialesTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("Faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID en .env");
  }
  return { token, chatId };
}

async function notificar(texto) {
  const { token, chatId } = credencialesTelegram();
  await enviarMensaje({ token, chatId, texto });
}

// Envuelve notificar() para que una falla de Telegram (token invalido, sin internet, API caida)
// nunca tape el error original que se estaba intentando reportar (bug encontrado en QA, Sprint 8:
// antes, si notificar() fallaba dentro de un catch, esa falla reemplazaba silenciosamente al
// error real). Devuelve si la notificacion salio bien, y deja un log en consola si no.
async function notificarSinFallar(texto) {
  try {
    await notificar(texto);
    return true;
  } catch (err) {
    console.error("No se pudo notificar por Telegram:", err.message);
    return false;
  }
}

// Orquesta el flujo diario completo (Sprint 7): Excel -> ETL -> BD -> reporte -> Telegram, sin
// intervencion manual. Si algo falla (Excel corrupto, vacio, o con cabeceras invalidas), no
// falla en silencio: notifica el problema por el mismo canal de Telegram, para que alguien se
// entere aunque nadie este mirando la consola del servidor.
async function ejecutarFlujoDiario(filePath, pool) {
  let resultadoEtl;
  try {
    resultadoEtl = await runEtl(filePath, pool);
  } catch (err) {
    await notificarSinFallar(formatearAlerta(`No se pudo leer el archivo "${filePath}": ${err.message}`));
    throw err;
  }

  guardarUltimoEtl(filePath, resultadoEtl);

  if (!resultadoEtl.headerValidation.ok) {
    const detalle = [
      resultadoEtl.headerValidation.missing.length > 0
        ? `Faltan columnas: ${resultadoEtl.headerValidation.missing.join(", ")}.`
        : null,
      resultadoEtl.headerValidation.unexpected.length > 0
        ? `Columnas no reconocidas: ${resultadoEtl.headerValidation.unexpected.join(", ")}.`
        : null,
    ].filter(Boolean).join(" ");
    const notificado = await notificarSinFallar(formatearAlerta(`Cabeceras del Excel invalidas. ${detalle}`));
    return { ...resultadoEtl, reporte: null, notificado: notificado ? "alerta_cabeceras" : "alerta_cabeceras_sin_notificar" };
  }

  if (resultadoEtl.insertResult.inserted === 0) {
    const razon = resultadoEtl.errors.length > 0
      ? `todas las filas (${resultadoEtl.errors.length}) tenian errores de datos`
      : "el archivo no tiene ninguna fila de datos";
    const notificado = await notificarSinFallar(formatearAlerta(`El Excel "${filePath}" no cargo ningun registro: ${razon}.`));
    return { ...resultadoEtl, reporte: null, notificado: notificado ? "alerta_vacio" : "alerta_vacio_sin_notificar" };
  }

  // Un Excel diario deberia traer una sola fecha; si por algun motivo trae varias, reportamos
  // sobre la mas reciente en vez de fallar.
  const fechas = [...new Set(resultadoEtl.rows.map((r) => r.fecha_enrolamiento))].sort();
  const fecha = fechas[fechas.length - 1];

  const reporte = await obtenerReporteDiario(pool, fecha);
  let texto = formatearReporte(reporte);
  if (resultadoEtl.errors.length > 0) {
    texto += `\n\n${formatearAvisoFilasOmitidas(resultadoEtl.errors)}`;
  }

  // Si Telegram falla aca, la carga en si igual fue exitosa (los datos ya estan en la BD) —
  // no tiene sentido tratarlo como una falla del flujo completo, pero si hay que dejarlo
  // reflejado en el resultado para que quien llame (o los logs de la tarea programada) se entere.
  const notificado = await notificarSinFallar(texto);
  return { ...resultadoEtl, reporte, notificado: notificado ? "reporte" : "reporte_sin_notificar" };
}

module.exports = { ejecutarFlujoDiario };
