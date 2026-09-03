const fs = require("fs");
const path = require("path");
const telegramClient = require("../telegram/telegramClient");
const { obtenerReporteDiario } = require("../reportes/reporteDiario");
const { formatearReporteExtenso, formatearReporte } = require("../telegram/formatearReporte");
const { crearBotonesDescarga } = require("../telegram/botService");

const CONFIG_DIR = path.resolve(__dirname, "../../config");
const CONFIG_FILE = path.join(CONFIG_DIR, "schedule-config.json");

const DEFAULT_CONFIG = {
  enabled: true,
  times: ["08:30", "19:00"], // 08:30 AM (inicio de jornada) y 19:00 hrs (cierre operativo)
  days: [1, 2, 3, 4, 5, 6, 0], // Lunes a Domingo (0 = Domingo, 1 = Lunes, ...)
  reportType: "extenso", // "extenso" | "resumen"
  targetChannel: "telegram",
  telegramChatId: "",
  lastSent: null,
  history: [],
};

// Asegura que el directorio config existe
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// Carga la configuración guardada o retorna la predeterminada
function getConfig() {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      times: Array.isArray(parsed.times) ? parsed.times : DEFAULT_CONFIG.times,
      days: Array.isArray(parsed.days) ? parsed.days : DEFAULT_CONFIG.days,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch (err) {
    console.warn("[SCHEDULER] Error leyendo schedule-config.json, usando defaults:", err.message);
    return { ...DEFAULT_CONFIG };
  }
}

// Guarda la configuración en disco
function saveConfig(newConfig) {
  ensureConfigDir();
  let current = { ...DEFAULT_CONFIG };
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      current = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
    } catch {
      current = { ...DEFAULT_CONFIG };
    }
  }

  const merged = {
    ...current,
    ...newConfig,
    history: newConfig.history !== undefined ? newConfig.history : (current.history || []),
  };

  // Ordenar horarios cronológicamente
  if (Array.isArray(merged.times)) {
    merged.times = Array.from(new Set(merged.times))
      .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
      .sort();
  }

  // Filtrar días válidos (0 a 6)
  if (Array.isArray(merged.days)) {
    merged.days = Array.from(new Set(merged.days))
      .map(Number)
      .filter((d) => d >= 0 && d <= 6)
      .sort();
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

// Obtiene la hora actual en zona horaria oficial de Chile (America/Santiago)
function obtenerHoraChile() {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });

  const parts = dtf.formatToParts(now);
  const map = {};
  parts.forEach((p) => (map[p.type] = p.value));

  const hh = map.hour === "24" ? "00" : map.hour.padStart(2, "0");
  const mm = map.minute.padStart(2, "0");
  const timeStr = `${hh}:${mm}`;
  const dateStr = `${map.year}-${map.month}-${map.day}`;

  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[map.weekday] !== undefined ? dayMap[map.weekday] : now.getDay();

  return { timeStr, dateStr, dayOfWeek, full: `${dateStr} ${timeStr}` };
}

// Calcula la próxima ejecución programada según los horarios y días configurados
function getNextExecution(config) {
  if (!config.enabled || !config.times || config.times.length === 0 || !config.days || config.days.length === 0) {
    return { text: "Envío programado deshabilitado", time: null, dayName: null };
  }

  const { timeStr: currentHHMM, dateStr: todayDate, dayOfWeek: currentDay } = obtenerHoraChile();

  // Buscar el próximo horario hoy o en los siguientes 7 días
  for (let offset = 0; offset < 7; offset++) {
    const targetDayOfWeek = (currentDay + offset) % 7;
    if (!config.days.includes(targetDayOfWeek)) continue;

    for (const scheduleTime of config.times) {
      // Si es hoy, el horario debe ser posterior al actual
      if (offset === 0 && scheduleTime <= currentHHMM) {
        continue;
      }

      // Encontramos el próximo horario
      const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
      let labelDia = dayNames[targetDayOfWeek];
      if (offset === 0) labelDia = "Hoy";
      else if (offset === 1) labelDia = "Mañana";

      return {
        text: `${labelDia} a las ${scheduleTime} hrs`,
        time: scheduleTime,
        dayName: labelDia,
        targetDayOfWeek,
        offsetDays: offset,
      };
    }
  }

  return { text: "Sin horarios futuros programados", time: null, dayName: null };
}

// Dispara el envío de reporte (tanto programado como de prueba manual)
async function triggerScheduledReport({ pool, isTest = false, customChatId = null }) {
  const config = getConfig();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = customChatId || config.telegramChatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("Token o Chat ID de Telegram no configurados en .env ni en ajustes.");
  }

  // 1. Obtener la fecha más reciente con datos
  const { rows } = await pool.query(
    "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS fecha FROM registro_enrolamiento"
  );
  const fecha = rows[0]?.fecha;
  if (!fecha) {
    throw new Error("No hay registros disponibles en la base de datos para generar el reporte.");
  }

  // 2. Obtener datos analíticos
  const reporte = await obtenerReporteDiario(pool, fecha);

  // 3. Formatear según tipo configurado
  const origen = isTest ? "Ajustes Web PDI (Prueba de Horario)" : "Automatización Programada PDI";
  const texto = config.reportType === "resumen"
    ? formatearReporte(reporte, { fecha, origen })
    : formatearReporteExtenso(reporte, { fecha, origen });

  // 4. Enviar vía Telegram Client con botones interactivos de descarga (.xlsx y .docx)
  const replyMarkup = crearBotonesDescarga({ fecha });
  const envio = await telegramClient.enviarMensaje({ token, chatId, texto, replyMarkup });

  // 5. Registrar en historial local
  const horaChile = obtenerHoraChile();
  const entry = {
    id: `disp_${Date.now()}`,
    timestamp: new Date().toISOString(),
    horaChile: horaChile.full,
    fechaReportada: fecha,
    totalEnrolados: reporte.total || 0,
    slaPDI: reporte.resumenEjecutivo?.tasaSincronizacion || 100,
    tipo: isTest ? "PRUEBA_MANUAL" : "AUTOMATICO_PROGRAMADO",
    canal: "Telegram Oficial PDI",
    chatId: String(chatId).slice(0, 4) + "***" + String(chatId).slice(-3),
    estado: "EXITO",
    messageId: envio.message_id,
  };

  const history = [entry, ...(config.history || [])].slice(0, 25);
  saveConfig({ lastSent: entry, history });

  // 6. Registrar en bitácora inmutable de PostgreSQL
  try {
    await pool.query(
      `INSERT INTO registro_auditoria_cifrada 
       (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
       VALUES (NOW(), $1, $2, $3, $4, 'Servicio Programador ABIS')`,
      [
        isTest ? "TEST_NOTIFICACION_TELEGRAM" : "ENVIO_PROGRAMADO_TELEGRAM",
        `Reporte_${fecha}.html`,
        `msg_id_${envio.message_id}`,
        `Horario: ${horaChile.timeStr} | Total: ${reporte.total} | SLA: ${reporte.resumenEjecutivo?.tasaSincronizacion}%`
      ]
    );
  } catch (auditErr) {
    console.warn("[SCHEDULER] Advertencia al registrar en bitácora PostgreSQL:", auditErr.message);
  }

  return entry;
}

let schedulerTimer = null;
let lastFiredMinuteKey = "";

// Inicia el bucle cron de monitoreo por minuto
function iniciarScheduler({ pool, logger = console }) {
  if (schedulerTimer) {
    logger.log("El programador de reportes ya está en ejecución.");
    return;
  }

  logger.log("[SCHEDULER] Servicio de Horarios y Reportes Automáticos PDI iniciado...");

  schedulerTimer = setInterval(async () => {
    try {
      const config = getConfig();
      if (!config.enabled) return;

      const { timeStr, dateStr, dayOfWeek } = obtenerHoraChile();
      const currentMinuteKey = `${dateStr}_${timeStr}`;

      // Evitar disparar dos veces en el mismo minuto
      if (lastFiredMinuteKey === currentMinuteKey) return;

      // Verificar si el día y hora actual coinciden con la programación
      const esDiaHabilitado = config.days.includes(dayOfWeek);
      const esHoraCoincidente = config.times.includes(timeStr);

      if (esDiaHabilitado && esHoraCoincidente) {
        lastFiredMinuteKey = currentMinuteKey;
        logger.log(`[HORARIO COINCIDENTE] Disparando reporte automático de las ${timeStr} hrs (${dateStr})...`);

        try {
          const resultado = await triggerScheduledReport({ pool, isTest: false });
          logger.log(`[REPORTE AUTOMÁTICO ENVIADO] Message ID: ${resultado.messageId}`);
        } catch (dispatchErr) {
          logger.error(`[ERROR ENVÍO PROGRAMADO]`, dispatchErr.message);

          // Registrar fallo en historial
          const entry = {
            id: `err_${Date.now()}`,
            timestamp: new Date().toISOString(),
            horaChile: `${dateStr} ${timeStr}`,
            tipo: "AUTOMATICO_PROGRAMADO",
            canal: "Telegram Oficial PDI",
            estado: "FALLO",
            error: dispatchErr.message,
          };
          const history = [entry, ...(config.history || [])].slice(0, 25);
          saveConfig({ history });
        }
      }
    } catch (err) {
      logger.error("Error en ciclo del scheduler:", err.message);
    }
  }, 30000); // Chequea cada 30 segundos
}

// Detiene el programador
function detenerScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  getConfig,
  saveConfig,
  obtenerHoraChile,
  getNextExecution,
  triggerScheduledReport,
  iniciarScheduler,
  detenerScheduler,
};
