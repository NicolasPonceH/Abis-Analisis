const fs = require("fs");
const path = require("path");
const telegramClient = require("./telegramClient");
const { obtenerReporteDiario } = require("../reportes/reporteDiario");
const { obtenerReporteRango } = require("../reportes/reporteRango");
const { formatearReporte, formatearReporteExtenso } = require("./formatearReporte");
const { generarReporteWord } = require("../reportes/wordReportService");
const { generarReporteExcel } = require("../reportes/excelReportService");

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function escaparHtml(texto) {
  return String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function esChatAutorizado(chatId, authorizedConfig) {
  if (!authorizedConfig) return true;
  const lista = String(authorizedConfig)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return lista.length === 0 || lista.includes(String(chatId));
}

function leerUltimoEtl() {
  const ruta = path.resolve(__dirname, "../../logs/ultimo-etl.json");
  if (!fs.existsSync(ruta)) return null;
  try {
    return JSON.parse(fs.readFileSync(ruta, "utf8"));
  } catch {
    return null;
  }
}

// Genera teclado inline interactivo para Telegram con botones de descarga de documentos
function crearBotonesDescarga({ fecha, desde, hasta }) {
  const param = desde && hasta ? `range:${desde}:${hasta}` : `date:${fecha}`;
  return {
    inline_keyboard: [
      [
        { text: "🟩 [XLSX] Descargar Planilla Excel", callback_data: `dl_excel:${param}` },
        { text: "🟦 [DOCX] Descargar Informe Word", callback_data: `dl_word:${param}` },
      ],
    ],
  };
}

async function manejarComandoAyuda({ token, chatId }) {
  const texto = [
    `🤖 <b>SISTEMA ABIS - GUÍA DE COMANDOS</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `📊 <b>Reportes Analíticos:</b>`,
    `• <code>/reporte</code> o <code>/hoy</code>`,
    `  ↳ Genera el reporte diario del día más reciente con botones de descarga directa.`,
    ``,
    `• <code>/reporte YYYY-MM-DD</code>`,
    `  ↳ Genera el reporte completo de una fecha específica (ej: <code>/reporte 2026-08-22</code>).`,
    ``,
    `• <code>/excel [YYYY-MM-DD]</code>`,
    `  ↳ Envía directamente la planilla oficial Excel (.xlsx) de la fecha o día más reciente.`,
    ``,
    `• <code>/word [YYYY-MM-DD]</code>`,
    `  ↳ Envía directamente el informe oficial Word (.docx) con membrete institucional PDI.`,
    ``,
    `• <code>/errores</code> o <code>/errores YYYY-MM-DD</code>`,
    `  ↳ Muestra qué cuarteles y unidades tuvieron inconsistencias (ej: <code>/errores 2026-08-22</code>).`,
    ``,
    `⚙️ <b>Estado y Auditoría del Sistema:</b>`,
    `• <code>/estado</code>`,
    `  ↳ Muestra la salud de la BD, conexión y el total histórico acumulado de registros.`,
    ``,
    `• <code>/logs</code>`,
    `  ↳ Detalle técnico del último archivo procesado en la ingesta ETL.`,
    ``,
    `• <code>/id</code>`,
    `  ↳ Muestra el identificador único (Chat ID) de este grupo o conversación.`,
    ``,
    `• <code>/ayuda</code>`,
    `  ↳ Muestra esta lista de comandos disponibles.`,
  ].join("\n");

  await telegramClient.enviarMensaje({ token, chatId, texto });
}

async function manejarComandoDetalleErrores({ token, chatId, pool, args }) {
  let fecha = args[0];

  if (fecha && !FECHA_REGEX.test(fecha)) {
    return telegramClient.enviarMensaje({
      token,
      chatId,
      texto: `[ALERTA] Formato de fecha inválido. Usa <code>YYYY-MM-DD</code> (ej: <code>/errores 2026-08-22</code>).`,
    });
  }

  if (!fecha) {
    const { rows } = await pool.query(
      "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS fecha FROM registro_enrolamiento"
    );
    fecha = rows[0]?.fecha;
    if (!fecha) {
      return telegramClient.enviarMensaje({
        token,
        chatId,
        texto: `[INFO] No hay registros cargados en la base de datos.`,
      });
    }
  }

  const [totalDiaRes, cuartelesRes, causasRes, nacRes] = await Promise.all([
    pool.query("SELECT count(*)::int AS total FROM registro_enrolamiento WHERE fecha_enrolamiento = $1", [fecha]),
    pool.query(
      `SELECT
         c.nombre_cuartel,
         u.nombre_unidad,
         eq.tipo_equipo,
         count(*)::int AS total,
         count(*) FILTER (WHERE ep_reg.descripcion IN ('ERROR', 'CON_ERROR'))::int AS error_biometrico,
         count(*) FILTER (WHERE ep_reg.descripcion NOT IN ('ERROR', 'CON_ERROR') AND ep_gen.descripcion IN ('ERROR', 'CON_ERROR'))::int AS error_validacion
       FROM registro_enrolamiento r
       JOIN cuartel c ON c.id_cuartel = r.id_cuartel
       JOIN unidad u ON u.id_unidad = c.id_unidad
       JOIN equipo eq ON eq.id_equipo = r.id_equipo
       JOIN estado_proceso ep_reg ON ep_reg.id_estado = r.id_estado_registro
       JOIN estado_proceso ep_gen ON ep_gen.id_estado = r.id_estado_general
       WHERE r.fecha_enrolamiento = $1
         AND (ep_reg.descripcion IN ('ERROR', 'CON_ERROR') OR ep_gen.descripcion IN ('ERROR', 'CON_ERROR'))
       GROUP BY c.nombre_cuartel, u.nombre_unidad, eq.tipo_equipo
       ORDER BY total DESC`,
      [fecha]
    ),
    pool.query(
      `SELECT
         count(*) FILTER (WHERE ep_reg.descripcion IN ('ERROR', 'CON_ERROR'))::int AS bio_total,
         count(*) FILTER (WHERE ep_reg.descripcion NOT IN ('ERROR', 'CON_ERROR') AND ep_gen.descripcion IN ('ERROR', 'CON_ERROR'))::int AS val_total,
         count(*) FILTER (WHERE eq.tipo_equipo = 'TABLET')::int AS tablet_total,
         count(*) FILTER (WHERE eq.tipo_equipo = 'PC DE ESCRITORIO')::int AS pc_total,
         count(*)::int AS total_errores
       FROM registro_enrolamiento r
       JOIN equipo eq ON eq.id_equipo = r.id_equipo
       JOIN estado_proceso ep_reg ON ep_reg.id_estado = r.id_estado_registro
       JOIN estado_proceso ep_gen ON ep_gen.id_estado = r.id_estado_general
       WHERE r.fecha_enrolamiento = $1
         AND (ep_reg.descripcion IN ('ERROR', 'CON_ERROR') OR ep_gen.descripcion IN ('ERROR', 'CON_ERROR'))`,
      [fecha]
    ),
    pool.query(
      `SELECT n.descripcion AS nacionalidad, count(*)::int AS total
       FROM registro_enrolamiento r
       JOIN nacionalidad n ON n.id_nacionalidad = r.id_nacionalidad
       JOIN estado_proceso ep_reg ON ep_reg.id_estado = r.id_estado_registro
       JOIN estado_proceso ep_gen ON ep_gen.id_estado = r.id_estado_general
       WHERE r.fecha_enrolamiento = $1
         AND (ep_reg.descripcion IN ('ERROR', 'CON_ERROR') OR ep_gen.descripcion IN ('ERROR', 'CON_ERROR'))
       GROUP BY n.descripcion
       ORDER BY total DESC
       LIMIT 5`,
      [fecha]
    ),
  ]);

  const totalDia = totalDiaRes.rows[0]?.total || 0;
  const causas = causasRes.rows[0] || { total_errores: 0, bio_total: 0, val_total: 0, tablet_total: 0, pc_total: 0 };
  const totalErrores = causas.total_errores;

  const [anio, mes, dia] = fecha.split("-");
  const fechaFmt = `${dia}/${mes}/${anio}`;

  if (totalErrores === 0) {
    const texto = [
      `🔍 <b>DETALLE DE CONSISTENCIA</b>`,
      `<i>${fechaFmt}</i>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `✅ <b>¡Cero inconsistencias registradas en esta fecha!</b>`,
      `De los <b>${totalDia.toLocaleString("es-CL")}</b> enrolamientos realizados, el 100% se completó con éxito.`,
      ``,
      `<i>Para ver el reporte completo escribe <code>/reporte ${fecha}</code></i>`,
    ].join("\n");
    return telegramClient.enviarMensaje({ token, chatId, texto });
  }

  const pctErrores = totalDia > 0 ? ((totalErrores / totalDia) * 100).toFixed(1) : "0";

  const lineas = [
    `⚠️ <b>DIAGNÓSTICO DE INCONSISTENCIAS</b>`,
    `<i>${fechaFmt}</i>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `<b>Total con Falla:</b> <code>${totalErrores.toLocaleString("es-CL")}</code> de ${totalDia.toLocaleString("es-CL")} enrolamientos (<b>${pctErrores}%</b>)`,
    ``,
    `<b>Causa Raíz:</b>`,
  ];

  if (causas.bio_total > 0) {
    lineas.push(
      `• <b>Falla en Captura Biométrica:</b> <code>${causas.bio_total}</code> caso(s)`,
      `  ↳ <i>Falla física en escáner Suprema o cámara facial (huellas desgastadas, sensor o imagen).</i>`
    );
  }
  if (causas.val_total > 0) {
    lineas.push(
      `• <b>Falla de Validación General:</b> <code>${causas.val_total}</code> caso(s)`,
      `  ↳ <i>Biometría capturada pero rechazada en validación central de documentos o duplicidad.</i>`
    );
  }

  lineas.push(``, `<b>Dispositivos donde ocurrió:</b>`);
  if (causas.tablet_total > 0) lineas.push(`• <b>Tablet:</b> <code>${causas.tablet_total}</code> caso(s)`);
  if (causas.pc_total > 0) lineas.push(`• <b>PC de Escritorio:</b> <code>${causas.pc_total}</code> caso(s)`);

  lineas.push(``, `<b>Cuarteles y Unidades Afectadas:</b>`);
  cuartelesRes.rows.forEach((r) => {
    const detalleCausa =
      r.error_biometrico > 0 && r.error_validacion > 0
        ? `(${r.error_biometrico} biometría, ${r.error_validacion} validación - ${r.tipo_equipo})`
        : r.error_biometrico > 0
        ? `(Falla Biométrica - ${r.tipo_equipo})`
        : `(Falla Validación - ${r.tipo_equipo})`;
    lineas.push(
      `• <b>${escaparHtml(r.nombre_cuartel)}</b> [${escaparHtml(r.nombre_unidad)}]: <code>${r.total}</code> ${detalleCausa}`
    );
  });

  if (nacRes.rows.length > 0) {
    lineas.push(``, `<b>Nacionalidades de los afectados:</b>`);
    const nacText = nacRes.rows.map((n) => `${escaparHtml(n.nacionalidad)} (${n.total})`).join(" · ");
    lineas.push(`  ${nacText}`);
  }

  lineas.push(``, `<i>Usa <code>/reporte ${fecha}</code> para ver las estadísticas generales del día.</i>`);

  await telegramClient.enviarMensaje({ token, chatId, texto: lineas.join("\n") });
}

async function manejarComandoLogs({ token, chatId }) {
  const ultimoEtl = leerUltimoEtl();

  if (!ultimoEtl) {
    const texto = `<b>Logs ETL</b>\n\nNo hay registro de procesamiento previo en <code>logs/ultimo-etl.json</code>.`;
    return telegramClient.enviarMensaje({ token, chatId, texto });
  }

  const lineas = [
    `<b>ÚLTIMO PROCESAMIENTO ETL</b>`,
    `Archivo: <code>${escaparHtml(ultimoEtl.archivo)}</code>`,
    `Hora: <code>${ultimoEtl.timestamp ? ultimoEtl.timestamp.replace("T", " ").slice(0, 19) : "N/A"}</code>`,
    `Insertadas: <b>${Number(ultimoEtl.totalInsertadas).toLocaleString("es-CL")}</b>`,
    `Filas rechazadas: <b>${ultimoEtl.errores.length}</b>`,
  ];

  if (ultimoEtl.correcciones && ultimoEtl.correcciones.length > 0) {
    lineas.push(``, `<b>Correcciones automáticas (${ultimoEtl.correcciones.length}):</b>`);
    ultimoEtl.correcciones.forEach((c) => {
      lineas.push(`• <i>${escaparHtml(c)}</i>`);
    });
  }

  if (ultimoEtl.errores.length > 0) {
    lineas.push(``, `<b>Detalle de errores (${ultimoEtl.errores.length}):</b>`);
    const limite = 10;
    const visibles = ultimoEtl.errores.slice(0, limite);

    visibles.forEach((err) => {
      const fila = err.excelRow || err.row || "?";
      const motivos = Array.isArray(err.errors) ? err.errors.join("; ") : String(err.errors);
      lineas.push(`• <b>Fila ${fila}:</b> ${escaparHtml(motivos)}`);
      if (err.data) {
        const datosClave = Object.entries(err.data)
          .filter(([_, v]) => v)
          .slice(0, 4)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        if (datosClave) {
          lineas.push(`  <pre>${escaparHtml(datosClave)}</pre>`);
        }
      }
    });

    if (ultimoEtl.errores.length > limite) {
      lineas.push(`<i>... y ${ultimoEtl.errores.length - limite} filas más (ver logs completos en el servidor)</i>`);
    }
  } else {
    lineas.push(``, `<i>No hubo filas rechazadas en este archivo.</i>`);
  }

  await telegramClient.enviarMensaje({ token, chatId, texto: lineas.join("\n") });
}

// Genera y envía directamente el archivo solicitado (.xlsx o .docx) por comando de Telegram
async function manejarComandoDescargaDirecta({ token, chatId, pool, args, tipo = "excel" }) {
  let fecha = args[0];
  if (fecha && !FECHA_REGEX.test(fecha)) {
    return telegramClient.enviarMensaje({
      token,
      chatId,
      texto: `[ALERTA] Formato de fecha inválido. Usa <code>YYYY-MM-DD</code> (ej: <code>/${tipo} 2026-08-22</code>).`,
    });
  }

  if (!fecha) {
    const { rows } = await pool.query(
      "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS fecha FROM registro_enrolamiento"
    );
    fecha = rows[0]?.fecha;
    if (!fecha) {
      return telegramClient.enviarMensaje({
        token,
        chatId,
        texto: `[INFO] No hay registros en la base de datos para generar el documento.`,
      });
    }
  }

  const reporte = await obtenerReporteDiario(pool, fecha);

  if (tipo === "excel") {
    const buffer = await generarReporteExcel(reporte, { fecha });
    const nombreArchivo = `Informe_Oficial_ABIS_PDI_${fecha}.xlsx`;
    await telegramClient.enviarDocumento({
      token,
      chatId,
      buffer,
      nombreArchivo,
      caption: `<b>Planilla Oficial PDI (Microsoft Excel .xlsx)</b>\nFecha: <code>${fecha}</code>\nTotal Enrolados: <b>${(reporte.total || 0).toLocaleString("es-CL")}</b>`,
    });
  } else {
    const buffer = await generarReporteWord(reporte, { fecha });
    const nombreArchivo = `Informe_ABIS_PDI_${fecha}.docx`;
    await telegramClient.enviarDocumento({
      token,
      chatId,
      buffer,
      nombreArchivo,
      caption: `<b>Informe Oficial PDI (Microsoft Word .docx)</b>\nFecha: <code>${fecha}</code>\nTotal Enrolados: <b>${(reporte.total || 0).toLocaleString("es-CL")}</b>`,
    });
  }
}

async function manejarComandoReporte({ token, chatId, pool, args }) {
  let fecha = args[0];

  if (fecha && !FECHA_REGEX.test(fecha)) {
    return telegramClient.enviarMensaje({
      token,
      chatId,
      texto: `[ALERTA] Formato de fecha inválido. Usa <code>YYYY-MM-DD</code> (ej: <code>/reporte 2026-08-22</code>).`,
    });
  }

  if (!fecha) {
    const { rows } = await pool.query(
      "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS fecha FROM registro_enrolamiento"
    );
    fecha = rows[0]?.fecha;
    if (!fecha) {
      return telegramClient.enviarMensaje({
        token,
        chatId,
        texto: `[INFO] No hay registros cargados en la base de datos para generar reporte.`,
      });
    }
  }

  const reporte = await obtenerReporteDiario(pool, fecha);
  const texto = formatearReporteExtenso(reporte, { fecha, origen: "Bot Telegram PDI" });
  const replyMarkup = crearBotonesDescarga({ fecha });

  try {
    const { generarCapturaDiaria } = require("../reportes/imageReportService");
    const buffer = await generarCapturaDiaria(reporte);
    await telegramClient.enviarFoto({
      token,
      chatId,
      buffer,
      caption: `📊 <b>REPORTE OFICIAL ABIS - ${fecha}</b>\n👥 Total Enrolados: <b>${(reporte.total || 0).toLocaleString("es-CL")}</b>`,
    });
    await telegramClient.enviarMensaje({
      token,
      chatId,
      texto,
      replyMarkup,
    });
  } catch (imgErr) {
    console.warn("[BOT REPORTE] Fallback a mensaje de texto:", imgErr.message);
    await telegramClient.enviarMensaje({ token, chatId, texto, replyMarkup });
  }
}

async function manejarComandoEstado({ token, chatId, pool }) {
  try {
    const [dbCheck, totalRes, ultimasRes] = await Promise.all([
      pool.query("SELECT 1"),
      pool.query("SELECT count(*)::int AS total FROM registro_enrolamiento"),
      pool.query(
        "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS ultima, to_char(min(fecha_enrolamiento), 'YYYY-MM-DD') AS primera FROM registro_enrolamiento"
      ),
    ]);

    const total = totalRes.rows[0].total;
    const { ultima, primera } = ultimasRes.rows[0];
    const ultimoEtl = leerUltimoEtl();

    const lineas = [
      `🏛 <b>ESTADO DEL SISTEMA ABIS</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🟢 Base de Datos: <b>Conectada (PostgreSQL)</b>`,
      `👥 Total registros históricos: <code>${total.toLocaleString("es-CL")}</code>`,
      `📅 Rango de fechas: <code>${primera || "N/A"}</code> al <code>${ultima || "N/A"}</code>`,
    ];

    if (ultimoEtl) {
      lineas.push(
        `📂 <b>Último archivo ETL:</b> <code>${escaparHtml(ultimoEtl.archivo)}</code> (${Number(ultimoEtl.totalInsertadas).toLocaleString("es-CL")} insertadas, ${ultimoEtl.errores.length} omitidas)`
      );
    }

    await telegramClient.enviarMensaje({ token, chatId, texto: lineas.join("\n") });
  } catch (err) {
    await telegramClient.enviarMensaje({
      token,
      chatId,
      texto: `🔴 <b>Error de Estado:</b> Base de datos inaccesible (${escaparHtml(err.message)})`,
    });
  }
}

// Procesa clics en botones inline interactivos de Telegram para generar y despachar archivos
async function procesarCallbackQuery({ callbackQuery, token, authorizedChatId, pool }) {
  const chatId = String(callbackQuery.message?.chat?.id || callbackQuery.from?.id);
  const queryId = callbackQuery.id;
  const data = callbackQuery.data || "";

  if (!esChatAutorizado(chatId, authorizedChatId)) {
    return telegramClient.responderCallback({
      token,
      callbackQueryId: queryId,
      text: "Acceso no autorizado al Sistema ABIS",
      showAlert: true,
    });
  }

  if (data.startsWith("dl_excel:") || data.startsWith("dl_word:")) {
    const tipo = data.startsWith("dl_excel:") ? "excel" : "word";
    const payload = data.replace(/^dl_(excel|word):/, "");

    // Respuesta inmediata a Telegram para confirmar recepción del click
    await telegramClient.responderCallback({
      token,
      callbackQueryId: queryId,
      text: `Generando documento oficial PDI (${tipo === "excel" ? "Excel" : "Word"})...`,
    });

    let reporte;
    let desde = null;
    let hasta = null;
    let fecha = null;

    if (payload.startsWith("range:")) {
      const partes = payload.split(":");
      desde = partes[1];
      hasta = partes[2];
      reporte = await obtenerReporteRango(pool, desde, hasta);
    } else {
      fecha = payload.replace(/^date:/, "");
      reporte = await obtenerReporteDiario(pool, fecha);
    }

    const periodoTexto = desde && hasta ? `${desde} al ${hasta}` : (reporte.fecha || fecha);

    if (tipo === "excel") {
      const buffer = await generarReporteExcel(reporte, { fecha, desde, hasta });
      const nombreArchivo = desde && hasta
        ? `Informe_Oficial_ABIS_PDI_${desde}_a_${hasta}.xlsx`
        : `Informe_Oficial_ABIS_PDI_${fecha || "reporte"}.xlsx`;

      await telegramClient.enviarDocumento({
        token,
        chatId,
        buffer,
        nombreArchivo,
        caption: `<b>Planilla Oficial PDI (Microsoft Excel .xlsx)</b>\nPeríodo: <code>${periodoTexto}</code>\nTotal Enrolados: <b>${(reporte.total || 0).toLocaleString("es-CL")}</b>`,
      });
    } else {
      const buffer = await generarReporteWord(reporte, { fecha, desde, hasta });
      const nombreArchivo = desde && hasta
        ? `Informe_ABIS_PDI_${desde}_a_${hasta}.docx`
        : `Informe_ABIS_PDI_${fecha || "reporte"}.docx`;

      await telegramClient.enviarDocumento({
        token,
        chatId,
        buffer,
        nombreArchivo,
        caption: `<b>Informe Oficial PDI (Microsoft Word .docx)</b>\nPeríodo: <code>${periodoTexto}</code>\nTotal Enrolados: <b>${(reporte.total || 0).toLocaleString("es-CL")}</b>`,
      });
    }
  }
}

async function procesarMensaje({ mensaje, token, authorizedChatId, pool }) {
  const chatId = String(mensaje.chat.id);
  const texto = (mensaje.text || "").trim();

  const partes = texto.split(/\s+/);
  const comando = partes[0].toLowerCase().split("@")[0];
  const args = partes.slice(1);

  // Comando especial /id o /chatid: siempre responde para que el usuario conozca el ID de su chat/grupo
  if (comando === "/id" || comando === "/chatid" || comando === "/miid") {
    const tipoChat =
      mensaje.chat.type === "group" || mensaje.chat.type === "supergroup"
        ? `Grupo (${escaparHtml(mensaje.chat.title || "Sin título")})`
        : `Chat privado (${escaparHtml(mensaje.from?.first_name || "Usuario")})`;

    return telegramClient.enviarMensaje({
      token,
      chatId,
      texto: [
        `🆔 <b>IDENTIFICADOR DE TELEGRAM (CHAT ID)</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `• <b>Tipo:</b> ${tipoChat}`,
        `• <b>Chat ID:</b> <code>${chatId}</code>`,
        ``,
        `💡 <i>Para recibir los reportes automáticos en este grupo/chat, copia este código y configúralo en tu archivo <code>.env</code> (TELEGRAM_CHAT_ID) o en los Ajustes del Sistema ABIS.</i>`,
      ].join("\n"),
    });
  }

  // Si se definió TELEGRAM_CHAT_ID, restringir el acceso a los chats autorizados por seguridad
  if (!esChatAutorizado(chatId, authorizedChatId)) {
    console.warn(`Mensaje recibido de chat no autorizado: ${chatId}`);
    return telegramClient.enviarMensaje({
      token,
      chatId,
      texto: [
        `⛔ <b>Acceso no autorizado</b>`,
        `Este canal o grupo no está configurado para operar el Sistema ABIS PDI.`,
        ``,
        `🆔 <b>Chat ID de este grupo:</b> <code>${chatId}</code>`,
        `💡 <i>Para autorizarlo, actualiza <code>TELEGRAM_CHAT_ID=${chatId}</code> en tu archivo .env o en los Ajustes Web.</i>`,
      ].join("\n"),
    });
  }

  switch (comando) {
    case "/start":
    case "/ayuda":
    case "/help":
      await manejarComandoAyuda({ token, chatId });
      break;
    case "/logs":
    case "/log":
      await manejarComandoLogs({ token, chatId });
      break;
    case "/errores":
    case "/detalle":
    case "/error":
      await manejarComandoDetalleErrores({ token, chatId, pool, args });
      break;
    case "/reporte":
    case "/resumen":
    case "/informe":
    case "/hoy":
      await manejarComandoReporte({ token, chatId, pool, args });
      break;
    case "/excel":
    case "/xlsx":
      await manejarComandoDescargaDirecta({ token, chatId, pool, args, tipo: "excel" });
      break;
    case "/word":
    case "/docx":
      await manejarComandoDescargaDirecta({ token, chatId, pool, args, tipo: "word" });
      break;
    case "/estado":
    case "/status":
    case "/health":
      await manejarComandoEstado({ token, chatId, pool });
      break;
    default: {
      const comandoTexto = comando.startsWith("/") ? `el comando <code>${escaparHtml(comando)}</code>` : "tu mensaje";
      await telegramClient.enviarMensaje({
        token,
        chatId,
        texto: [
          `❓ <b>No entendí ${comandoTexto}.</b>`,
          ``,
          `💡 Escribe <code>/ayuda</code> para ver todos los comandos disponibles en el Sistema ABIS:`,
          `• <code>/reporte [YYYY-MM-DD]</code> - Ver reporte con botones de descarga`,
          `• <code>/excel [YYYY-MM-DD]</code> - Descargar planilla Excel (.xlsx)`,
          `• <code>/word [YYYY-MM-DD]</code> - Descargar informe Word (.docx)`,
          `• <code>/errores [YYYY-MM-DD]</code> - Ver detalle de fallas por cuartel`,
          `• <code>/estado</code> - Estado de la base de datos y total histórico`,
          `• <code>/logs</code> - Ver detalle de la última carga ETL`,
          `• <code>/ayuda</code> - Ver guía completa de comandos`,
        ].join("\n"),
      });
      break;
    }
  }
}

let botActivo = false;

async function iniciarBot({ token, chatId, pool, logger = console }) {
  if (botActivo) {
    logger.log("El bot de Telegram ya se encuentra en ejecución.");
    return;
  }

  botActivo = true;
  let offset = 0;
  logger.log("Bot de Telegram interactivo iniciado (Long Polling y Botones Activos)...");

  while (botActivo) {
    try {
      const updates = await telegramClient.obtenerActualizaciones({ token, offset, timeout: 25 });
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message && update.message.text) {
          try {
            await procesarMensaje({ mensaje: update.message, token, authorizedChatId: chatId, pool });
          } catch (err) {
            logger.error(`Error procesando mensaje (${update.message.text}):`, err.message);
          }
        } else if (update.callback_query) {
          try {
            await procesarCallbackQuery({ callbackQuery: update.callback_query, token, authorizedChatId: chatId, pool });
          } catch (err) {
            logger.error(`Error procesando botón interactivo:`, err.message);
          }
        }
      }
    } catch (err) {
      if (!botActivo) break;
      if (err.message && err.message.includes("Conflict")) {
        logger.warn("[TELEGRAM] Otra instancia del bot fue iniciada. Reintentando en 3s...");
      } else {
        logger.warn(`[TELEGRAM] Aviso de conexión (${err.message}). Reintentando en 3s...`);
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  logger.log("Bot de Telegram detenido.");
}

function detenerBot() {
  botActivo = false;
}

module.exports = {
  iniciarBot,
  detenerBot,
  procesarMensaje,
  procesarCallbackQuery,
  crearBotonesDescarga,
};
