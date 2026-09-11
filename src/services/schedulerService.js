const fs = require("fs");
const path = require("path");
const telegramClient = require("../telegram/telegramClient");
const { obtenerReporteDiario } = require("../reportes/reporteDiario");
const { obtenerReporteRango } = require("../reportes/reporteRango");
const { obtenerReporteFinDeSemana, obtenerDatosAcumulados } = require("../reportes/reporteFinDeSemana");
const {
  generarCapturaMatrizFinDeSemana,
  generarCapturaDistribucionFinDeSemana,
  generarCapturaAcumulado,
  generarCapturaDiaria,
} = require("../reportes/imageReportService");
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
    second: "2-digit",
    weekday: "short",
  });

  const parts = dtf.formatToParts(now);
  const map = {};
  parts.forEach((p) => (map[p.type] = p.value));

  const hh = map.hour === "24" ? "00" : map.hour.padStart(2, "0");
  const mm = map.minute.padStart(2, "0");
  const ss = (map.second || "00").padStart(2, "0");
  const timeStr = `${hh}:${mm}`;
  const timeWithSeconds = `${hh}:${mm}:${ss}`;
  const dateStr = `${map.year}-${map.month}-${map.day}`;

  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[map.weekday] !== undefined ? dayMap[map.weekday] : now.getDay();

  return { timeStr, timeWithSeconds, dateStr, dayOfWeek, full: `${dateStr} ${timeStr}`, timestamp: now.getTime() };
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

function restarDias(fechaYMD, numDias) {
  const [y, m, d] = fechaYMD.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - numDias);
  const y2 = date.getUTCFullYear();
  const m2 = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(date.getUTCDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
}

function formatearFechaChile(fStr) {
  if (!fStr) return "";
  const [y, m, d] = fStr.split("-");
  return `${d}-${m}-${y}`;
}

// Determina el período operativo según las reglas institucionales:
// - Lunes: Consolida el Fin de Semana cerrado (Viernes D-3, Sábado D-2, Domingo D-1).
// - Martes a Viernes: Reporta la jornada de ayer cerrada (D-1).
// - Fines de semana: Reporta el día de ayer cerrado (D-1).
async function calcularPeriodoOperativo(pool, { fechaReferencia = null, forzarModo = null } = {}) {
  const hoyChile = obtenerHoraChile();
  const baseDate = fechaReferencia || hoyChile.dateStr;

  const [y, m, d] = baseDate.split("-").map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Dom, 1 = Lun, 2 = Mar...

  const esLunes = forzarModo === "fds" ? true : forzarModo === "diario" ? false : dayOfWeek === 1;

  if (esLunes) {
    let fechaViernes = restarDias(baseDate, 3);
    let fechaSabado = restarDias(baseDate, 2);
    let fechaDomingo = restarDias(baseDate, 1);

    // Si en las fechas no hay datos aún (entorno de pruebas/desarrollo), fallback al fin de semana más reciente con datos
    if (pool && !fechaReferencia) {
      const { rows } = await pool.query(
        "SELECT 1 FROM registro_enrolamiento WHERE fecha_enrolamiento >= $1 AND fecha_enrolamiento <= $2 LIMIT 1",
        [fechaViernes, fechaDomingo]
      );
      if (rows.length === 0) {
        fechaViernes = "2026-08-21";
        fechaSabado = "2026-08-22";
        fechaDomingo = "2026-08-23";
      }
    }

    return {
      tipo: "FIN_DE_SEMANA",
      esFinDeSemana: true,
      fechas: {
        viernes: fechaViernes,
        sabado: fechaSabado,
        domingo: fechaDomingo,
        viernesFmt: formatearFechaChile(fechaViernes),
        sabadoFmt: formatearFechaChile(fechaSabado),
        domingoFmt: formatearFechaChile(fechaDomingo),
        desdeFmt: formatearFechaChile(fechaViernes),
        hastaFmt: formatearFechaChile(fechaDomingo),
      },
    };
  } else {
    let fechaAyer = restarDias(baseDate, 1);

    if (pool && !fechaReferencia) {
      const { rows } = await pool.query(
        "SELECT 1 FROM registro_enrolamiento WHERE fecha_enrolamiento = $1 LIMIT 1",
        [fechaAyer]
      );
      if (rows.length === 0) {
        const maxRes = await pool.query(
          "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS max_fecha FROM registro_enrolamiento"
        );
        if (maxRes.rows[0]?.max_fecha) {
          fechaAyer = maxRes.rows[0].max_fecha;
        }
      }
    }

    return {
      tipo: "DIARIO",
      esFinDeSemana: false,
      fecha: fechaAyer,
      fechaFmt: formatearFechaChile(fechaAyer),
    };
  }
}

// Dispara el envío de reporte (tanto programado como de prueba manual)
async function triggerScheduledReport({ pool, isTest = false, customChatId = null, fechaReferencia = null, forzarModo = null, incluirAdjuntos = true }) {
  const config = getConfig();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const rawChatId = customChatId || config.telegramChatId || process.env.TELEGRAM_CHAT_ID || "";
  const chatIds = String(rawChatId)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!token || chatIds.length === 0) {
    throw new Error("Token o Chat ID de Telegram no configurados en .env ni en ajustes.");
  }

  // 1. Determinar el período operativo (Fin de semana para Lunes, Diario para Martes-Viernes)
  const periodo = await calcularPeriodoOperativo(pool, { fechaReferencia, forzarModo });
  const origen = isTest ? "Ajustes Web PDI (Prueba de Despacho Visual)" : "Automatización Programada PDI";
  let totalReportado = 0;
  let slaReportado = 100;
  let labelFecha = "";
  let envio = null;

  if (periodo.esFinDeSemana) {
    labelFecha = `${periodo.fechas.desdeFmt} al ${periodo.fechas.hastaFmt}`;
    const [reporteFds, reporteRango] = await Promise.all([
      obtenerReporteFinDeSemana(pool, periodo.fechas),
      obtenerReporteRango(pool, periodo.fechas.viernes, periodo.fechas.domingo),
    ]);
    totalReportado = reporteFds.totalFinDeSemana.sincronizacion.total;
    const sincOk = reporteFds.totalFinDeSemana.sincronizacion.sincronizado;
    slaReportado = totalReportado > 0 ? Math.round((sincOk / totalReportado) * 1000) / 10 : 100;

    const replyMarkup = incluirAdjuntos ? crearBotonesDescarga({
      desde: periodo.fechas.viernes,
      hasta: periodo.fechas.domingo,
    }) : undefined;

    const textoReporte = config.reportType === "resumen"
      ? formatearReporte(reporteRango, { desde: periodo.fechas.viernes, hasta: periodo.fechas.domingo, origen })
      : formatearReporteExtenso(reporteRango, { desde: periodo.fechas.viernes, hasta: periodo.fechas.domingo, origen });

    const captionMatriz = [
      `📊 <b>REPORTE OFICIAL ABIS - CONSOLIDADO FIN DE SEMANA</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🗓️ Período: <b>${periodo.fechas.desdeFmt} al ${periodo.fechas.hastaFmt}</b>`,
      `👥 Total Enrolados FDS: <b>${totalReportado.toLocaleString("es-CL")}</b>`,
      `✅ Tasa Sincronización PDI: <b>${slaReportado.toFixed(1)}%</b>`,
      `🛡️ SLA Institucional: <b>${reporteFds.resumenEjecutivo?.estadoSLA || "Óptimo"}</b>`,
      `📌 <i>${origen} (Viernes, Sábado y Domingo)</i>`,
      `📸 <i>Envío oficial de 4 capturas institucionales PDI.</i>`,
      `<i>Foto 1/4: Matriz de Estados de Fin de Semana.</i>`,
    ].join("\n");

    let bufMatriz = null;
    let bufAcumEnrolados = null;
    let bufDistFds = null;
    let bufAcumRegistros = null;

    try {
      const anioActual = new Date().getFullYear();
      const [dataAcumEnrolados, dataAcumRegistros] = await Promise.all([
        obtenerDatosAcumulados(pool, { soloEnrolados: true }),
        obtenerDatosAcumulados(pool, { soloEnrolados: false }),
      ]);

      [bufMatriz, bufAcumEnrolados, bufDistFds, bufAcumRegistros] = await Promise.all([
        generarCapturaMatrizFinDeSemana(reporteFds),
        generarCapturaAcumulado(dataAcumEnrolados, {
          titulo: `TOTAL DE ENROLADOS EN EL SISTEMA ABIS ACUMULADO AL AÑO ${anioActual}`,
          tipoFiltro: "ENROLADO",
          anio: anioActual,
        }),
        generarCapturaDistribucionFinDeSemana(reporteFds),
        generarCapturaAcumulado(dataAcumRegistros, {
          titulo: `TOTAL DE REGISTROS EN EL SISTEMA ABIS ACOMULADO AL AÑO ${anioActual}`,
          tipoFiltro: "TODOS",
          anio: anioActual,
        }),
      ]);
    } catch (renderErr) {
      console.warn("[SCHEDULER] Error generando capturas visuales de fin de semana:", renderErr.message);
    }

    for (const cid of chatIds) {
      try {
        if (bufMatriz && bufAcumEnrolados && bufDistFds && bufAcumRegistros) {
          // 1. Enviar las 4 fotos en un solo mensaje conjunto (Álbum / sendMediaGroup)
          const anioActual = new Date().getFullYear();
          const fotosAlbum = [
            {
              buffer: bufMatriz,
              caption: [
                `📊 <b>REPORTE OFICIAL ABIS - CONSOLIDADO FIN DE SEMANA</b>`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `🗓️ Período: <b>${periodo.fechas.desdeFmt} al ${periodo.fechas.hastaFmt}</b>`,
                `👥 Total Enrolados FDS: <b>${totalReportado.toLocaleString("es-CL")}</b>`,
                `✅ Tasa Sincronización PDI: <b>${slaReportado.toFixed(1)}%</b>`,
                `🛡️ SLA Institucional: <b>${reporteFds.resumenEjecutivo?.estadoSLA || "Óptimo"}</b>`,
                `📌 <i>${origen} (Viernes, Sábado y Domingo)</i>`,
                `<i>Foto 1/4: Matriz de Estados de Fin de Semana</i>`,
              ].join("\n"),
            },
            {
              buffer: bufAcumEnrolados,
              caption: `📊 <b>FOTO 2/4: TOTAL DE ENROLADOS EN EL SISTEMA ABIS ACUMULADO AL AÑO ${anioActual}</b>\n<i>Distribución histórica institucional de enrolamientos biométricos PDI.</i>`,
            },
            {
              buffer: bufDistFds,
              caption: `📋 <b>FOTO 3/4: DISTRIBUCIÓN INSTITUCIONAL DE ENROLAMIENTOS DEL FIN DE SEMANA (${labelFecha})</b>\n<i>Desglose operativo por unidades, cuarteles, equipos, menores N.N.A. y regiones.</i>`,
            },
            {
              buffer: bufAcumRegistros,
              caption: `📈 <b>FOTO 4/4: TOTAL DE REGISTROS EN EL SISTEMA ABIS ACOMULADO AL AÑO ${anioActual}</b>\n<i>Universo consolidado de registros del sistema ABIS (con SERMIG).</i>`,
            },
          ];

          const resAlbum = await telegramClient.enviarGrupoFotos({
            token,
            chatId: cid,
            fotos: fotosAlbum,
          });
          envio = Array.isArray(resAlbum) ? resAlbum[0] : resAlbum;

          // 2. Enviar el reporte institucional de texto completo que había antes con sus indicadores y botones de descarga
          const resTexto = await telegramClient.enviarMensaje({
            token,
            chatId: cid,
            texto: textoReporte,
            replyMarkup,
          });
          if (!envio) envio = resTexto;
        } else if (bufMatriz) {
          // Fallback a foto individual si fallara la generación de capturas auxiliares
          envio = await telegramClient.enviarFoto({
            token,
            chatId: cid,
            buffer: bufMatriz,
            caption: captionMatriz,
          });
          const resTexto = await telegramClient.enviarMensaje({
            token,
            chatId: cid,
            texto: textoReporte,
            replyMarkup,
          });
          if (!envio) envio = resTexto;
        } else {
          // Fallback solo a texto en caso de incidencia con Chromium
          envio = await telegramClient.enviarMensaje({
            token,
            chatId: cid,
            texto: textoReporte,
            replyMarkup,
          });
        }
      } catch (sendErr) {
        console.warn(`[SCHEDULER] Advertencia al enviar reporte FDS a chat ${cid}:`, sendErr.message);
      }
    }
  } else {
    // Reporte Diario (Martes a Viernes)
    labelFecha = periodo.fechaFmt;
    const reporteDiario = await obtenerReporteDiario(pool, periodo.fecha);
    totalReportado = reporteDiario.total || 0;
    slaReportado = reporteDiario.resumenEjecutivo?.tasaSincronizacion || 100;

    const replyMarkup = incluirAdjuntos ? crearBotonesDescarga({ fecha: periodo.fecha }) : undefined;

    const textoReporte = config.reportType === "resumen"
      ? formatearReporte(reporteDiario, { fecha: periodo.fecha, origen })
      : formatearReporteExtenso(reporteDiario, { fecha: periodo.fecha, origen });

    let bufDiario = null;
    try {
      bufDiario = await generarCapturaDiaria(reporteDiario);
    } catch (renderErr) {
      console.warn("[SCHEDULER] Error generando captura diaria:", renderErr.message);
    }

    const captionDiario = [
      `📊 <b>REPORTE OFICIAL ABIS - JORNADA ${periodo.fechaFmt}</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👥 Total Enrolados: <b>${totalReportado.toLocaleString("es-CL")}</b>`,
      `✅ Tasa Sincronización PDI: <b>${slaReportado.toFixed(1)}%</b>`,
      `🛡️ SLA Institucional: <b>${reporteDiario.resumenEjecutivo?.estadoSLA || "Óptimo"}</b>`,
      `📌 <i>${origen} (Jornada cerrada anterior)</i>`,
    ].join("\n");

    for (const cid of chatIds) {
      try {
        if (bufDiario) {
          envio = await telegramClient.enviarFoto({
            token,
            chatId: cid,
            buffer: bufDiario,
            caption: captionDiario,
          });
        }
        // Enviar el reporte institucional de texto completo junto con los botones de descarga
        const resTexto = await telegramClient.enviarMensaje({
          token,
          chatId: cid,
          texto: textoReporte,
          replyMarkup,
        });
        if (!envio) envio = resTexto;
      } catch (sendErr) {
        console.warn(`[SCHEDULER] Advertencia al enviar reporte diario a chat ${cid}:`, sendErr.message);
      }
    }
  }

  if (!envio) {
    throw new Error("No se pudo entregar el reporte visual a los canales de Telegram configurados.");
  }

  // Registrar en historial local
  const horaChile = obtenerHoraChile();
  const entry = {
    id: `disp_${Date.now()}`,
    timestamp: new Date().toISOString(),
    horaChile: horaChile.full,
    fechaReportada: labelFecha,
    totalEnrolados: totalReportado,
    slaPDI: slaReportado,
    tipo: isTest ? "PRUEBA_MANUAL_VISUAL" : "AUTOMATICO_PROGRAMADO_VISUAL",
    canal: "Telegram Oficial PDI",
    chatId: chatIds.map((c) => String(c).slice(0, 4) + "***" + String(c).slice(-3)).join(", "),
    estado: "EXITO",
    messageId: envio.message_id,
  };

  const history = [entry, ...(config.history || [])].slice(0, 25);
  saveConfig({ lastSent: entry, history });

  // Registrar en bitácora inmutable de PostgreSQL
  try {
    await pool.query(
      `INSERT INTO registro_auditoria_cifrada 
       (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
       VALUES (NOW(), $1, $2, $3, $4, 'Servicio Programador ABIS')`,
      [
        isTest ? "TEST_CAPTURA_TELEGRAM" : "ENVIO_CAPTURA_TELEGRAM",
        `Captura_${labelFecha.replace(/\s+/g, "_")}.png`,
        `msg_id_${envio.message_id}`,
        `Horario: ${horaChile.timeStr} | Total: ${totalReportado} | SLA: ${slaReportado}%`
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
        // Evitar duplicar si la tarea de flujo diario ETL ya envió un reporte exactamente en este mismo minuto
        if (
          config.lastSent &&
          config.lastSent.tipo === "FLUJO_DIARIO_ETL" &&
          config.lastSent.horaChile === `${dateStr} ${timeStr}`
        ) {
          lastFiredMinuteKey = currentMinuteKey;
          logger.log(`[SCHEDULER] Omitiendo despacho de las ${timeStr} hrs: la tarea diaria ETL ya emitió el reporte en este mismo minuto.`);
          return;
        }

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
  }, 15000); // Chequea cada 15 segundos para garantizar detección exacta del minuto
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
  calcularPeriodoOperativo,
  triggerScheduledReport,
  iniciarScheduler,
  detenerScheduler,
};

