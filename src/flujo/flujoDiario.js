const fs = require("fs");
const path = require("path");
const { runEtl } = require("../etl");
const { obtenerReporteDiario } = require("../reportes/reporteDiario");
const { formatearReporte, formatearReporteExtenso, formatearAlerta, formatearAvisoFilasOmitidas } = require("../telegram/formatearReporte");
const { enviarMensaje } = require("../telegram/telegramClient");
const { crearBotonesDescarga } = require("../telegram/botService");

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

async function notificar(texto, replyMarkup = null) {
  const { token, chatId } = credencialesTelegram();
  await enviarMensaje({ token, chatId, texto, replyMarkup });
}

// Envuelve notificar() para que una falla de Telegram (token invalido, sin internet, API caida)
// nunca tape el error original que se estaba intentando reportar (bug encontrado en QA, Sprint 8:
// antes, si notificar() fallaba dentro de un catch, esa falla reemplazaba silenciosamente al
// error real). Devuelve si la notificacion salio bien, y deja un log en consola si no.
async function notificarSinFallar(texto, replyMarkup = null) {
  try {
    await notificar(texto, replyMarkup);
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
  let texto = formatearReporteExtenso(reporte);
  if (resultadoEtl.errors.length > 0) {
    texto += `\n\n${formatearAvisoFilasOmitidas(resultadoEtl.errors)}`;
  }

  const replyMarkup = crearBotonesDescarga({ fecha });
  const notificado = await notificarSinFallar(texto, replyMarkup);

  // Registrar en historial del scheduler para evitar reportes duplicados si coinciden a la misma hora
  try {
    const schedulerService = require("../services/schedulerService");
    const horaChile = schedulerService.obtenerHoraChile();
    const entry = {
      id: `disp_etl_${Date.now()}`,
      timestamp: new Date().toISOString(),
      horaChile: horaChile.full,
      fechaReportada: fecha,
      totalEnrolados: reporte.total || 0,
      slaPDI: reporte.resumenEjecutivo?.tasaSincronizacion || 100,
      tipo: "FLUJO_DIARIO_ETL",
      canal: "Telegram Oficial PDI",
      estado: notificado ? "EXITO" : "FALLO",
    };
    const currentConfig = await schedulerService.getConfig();
    const history = [entry, ...(currentConfig.history || [])].slice(0, 25);
    await schedulerService.saveConfig({ lastSent: entry, history });
  } catch (err) {
    // Si falla el guardado de historial, no afecta el resultado del ETL
  }

  return { ...resultadoEtl, reporte, notificado: notificado ? "reporte" : "reporte_sin_notificar" };
}

module.exports = { ejecutarFlujoDiario };
