require("dotenv").config();
const path = require("path");
const express = require("express");
const multer = require("multer");
const pool = require("./db");
const { obtenerReporteDiario } = require("./reportes/reporteDiario");
const {
  obtenerReporteRango,
  obtenerTendenciaHistorica,
  obtenerFechasDisponibles,
} = require("./reportes/reporteRango");
const { runEtl } = require("./etl");
const {
  generarHashSHA256,
  esBufferCifrado,
  cifrarBuffer,
  descifrarBuffer,
} = require("./security/crypto");
const telegramClient = require("./telegram/telegramClient");
const { formatearReporteExtenso } = require("./telegram/formatearReporte");
const { crearBotonesDescarga } = require("./telegram/botService");
const { generarReporteWord } = require("./reportes/wordReportService");
const { generarReporteExcel } = require("./reportes/excelReportService");
const schedulerService = require("./services/schedulerService");

const app = express();
const port = process.env.PORT || 3000;

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

// Configurar multer para almacenar archivos en memoria RAM (seguridad: sin residuos en disco)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB límite
});

app.use(express.json());
// Servir archivos estáticos del frontend (Dashboard Web)
app.use(express.static(path.join(__dirname, "../public")));

app.get("/health", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT count(*) AS total FROM registro_enrolamiento");
    res.json({
      status: "ok",
      db: "connected",
      totalRegistros: Number(rows[0].total),
      pool: pool.getPoolStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: "error", db: "disconnected", message: err.message, pool: pool.getPoolStatus ? pool.getPoolStatus() : null });
  }
});

// Diagnóstico en vivo del Connection Pool de PostgreSQL
app.get("/api/db/pool", (req, res) => {
  res.json({
    ok: true,
    pool: pool.getPoolStatus(),
    timestamp: new Date().toISOString(),
  });
});

// Obtiene todas las fechas con datos para poblar selectores/calendarios en la UI
app.get("/api/fechas", async (req, res) => {
  try {
    const fechas = await obtenerFechasDisponibles(pool);
    res.json(fechas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint de reporte diario (con o sin ?fecha=YYYY-MM-DD)
app.get("/api/metricas", async (req, res) => {
  try {
    let { fecha } = req.query;
    if (fecha && !FECHA_VALIDA.test(fecha)) {
      return res.status(400).json({ error: "fecha invalida, usar formato YYYY-MM-DD" });
    }
    if (!fecha) {
      const { rows } = await pool.query(
        "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS fecha FROM registro_enrolamiento"
      );
      fecha = rows[0]?.fecha;
      if (!fecha) return res.json({ fecha: null, total: 0, mensaje: "No hay registros cargados" });
    }
    const reporte = await obtenerReporteDiario(pool, fecha);
    res.json(reporte);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alias compatible hacia el endpoint original
app.get("/reporte-diario", async (req, res) => {
  return res.redirect(`/api/metricas${req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""}`);
});

// Reporte agregado para un rango de fechas (?desde=YYYY-MM-DD&hasta=YYYY-MM-DD)
app.get("/api/metricas/rango", async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta || !FECHA_VALIDA.test(desde) || !FECHA_VALIDA.test(hasta)) {
      return res.status(400).json({ error: "Parámetros 'desde' y 'hasta' requeridos en formato YYYY-MM-DD" });
    }
    const reporte = await obtenerReporteRango(pool, desde, hasta);
    res.json(reporte);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serie de tiempo histórica para gráficos de evolución y tendencia
app.get("/api/metricas/tendencia", async (req, res) => {
  try {
    const tendencia = await obtenerTendenciaHistorica(pool);
    res.json(tendencia);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exportación formal en Microsoft Word (.docx) con membrete oficial PDI
app.get("/api/export/word", async (req, res) => {
  try {
    let { fecha, desde, hasta } = req.query;
    let reporte;

    if (desde && hasta && FECHA_VALIDA.test(desde) && FECHA_VALIDA.test(hasta)) {
      reporte = await obtenerReporteRango(pool, desde, hasta);
    } else {
      if (!fecha || !FECHA_VALIDA.test(fecha)) {
        const { rows } = await pool.query(
          "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS fecha FROM registro_enrolamiento"
        );
        fecha = rows[0]?.fecha;
      }
      if (!fecha) {
        return res.status(404).send("No hay registros disponibles para generar el informe");
      }
      reporte = await obtenerReporteDiario(pool, fecha);
    }

    const docxBuffer = await generarReporteWord(reporte, { fecha, desde, hasta });
    const nombreArchivo = desde && hasta
      ? `Informe_ABIS_PDI_${desde}_a_${hasta}.docx`
      : `Informe_ABIS_PDI_${fecha || 'reporte'}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
    res.send(docxBuffer);
  } catch (err) {
    console.error("[ERROR EXPORT WORD]", err);
    res.status(500).send(`Error generando informe Word: ${err.message}`);
  }
});

// Exportación formal en Microsoft Excel (.xlsx) con formato institucional PDI
app.get("/api/export/excel", async (req, res) => {
  try {
    let { fecha, desde, hasta } = req.query;
    let reporte;

    if (desde && hasta && FECHA_VALIDA.test(desde) && FECHA_VALIDA.test(hasta)) {
      reporte = await obtenerReporteRango(pool, desde, hasta);
    } else {
      if (!fecha || !FECHA_VALIDA.test(fecha)) {
        const { rows } = await pool.query(
          "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS fecha FROM registro_enrolamiento"
        );
        fecha = rows[0]?.fecha;
      }
      if (!fecha) {
        return res.status(404).send("No hay registros disponibles para generar el informe Excel");
      }
      reporte = await obtenerReporteDiario(pool, fecha);
    }

    const excelBuffer = await generarReporteExcel(reporte, { fecha, desde, hasta });
    const nombreArchivo = desde && hasta
      ? `Informe_Oficial_ABIS_PDI_${desde}_a_${hasta}.xlsx`
      : `Informe_Oficial_ABIS_PDI_${fecha || 'reporte'}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
    res.send(excelBuffer);
  } catch (err) {
    console.error("[ERROR EXPORT EXCEL]", err);
    res.status(500).send(`Error generando informe Excel: ${err.message}`);
  }
});

// Exportación formal en CSV institucional PDI con BOM UTF-8
app.get("/api/export/csv", async (req, res) => {
  try {
    let { fecha, desde, hasta } = req.query;
    let reporte;

    if (desde && hasta && FECHA_VALIDA.test(desde) && FECHA_VALIDA.test(hasta)) {
      reporte = await obtenerReporteRango(pool, desde, hasta);
    } else {
      if (!fecha || !FECHA_VALIDA.test(fecha)) {
        const { rows } = await pool.query(
          "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS fecha FROM registro_enrolamiento"
        );
        fecha = rows[0]?.fecha;
      }
      if (!fecha) {
        return res.status(404).send("No hay registros disponibles para generar el CSV");
      }
      reporte = await obtenerReporteDiario(pool, fecha);
    }

    const exec = reporte.resumenEjecutivo || {};
    const total = reporte.total || 0;
    const periodo = desde && hasta
      ? `Desde ${desde} hasta ${hasta}`
      : (reporte.fecha || fecha || "Jornada");

    const lines = [];
    lines.push('"POLICÍA DE INVESTIGACIONES DE CHILE"');
    lines.push('"JEFATURA NACIONAL DE MIGRACIONES Y POLICÍA INTERNACIONAL"');
    lines.push('"DEPARTAMENTO DE INFORMACIÓN Y REGISTRO BIOMÉTRICO (SISTEMA ABIS)"');
    lines.push('"REPORTE GERENCIAL Y OPERATIVO DE ENROLAMIENTO FRONTERIZO"');
    lines.push('""');
    lines.push(`"Fecha de Emisión","${new Date().toLocaleString('es-CL')}"`);
    lines.push(`"Período Consultado","${periodo}"`);
    lines.push(`"Total Enrolamientos Procesados","${total.toLocaleString()}"`);
    lines.push(`"Cumplimiento SLA Sincronización PDI","${exec.tasaSincronizacion || 100}% (${exec.estadoSLA || 'Óptimo'})"`);
    lines.push(`"Eficacia Registro Biométrico ABIS","${exec.tasaRegistroBiometrico || 0}%"`);
    lines.push(`"Tasa de Inconsistencias o Error","${exec.tasaError || 0}%"`);
    lines.push(`"Puesto Fronterizo con Mayor Demanda","${exec.cuartelLider ? exec.cuartelLider.nombre + ' (' + exec.cuartelLider.porcentaje + '%)' : 'N/D'}"`);
    lines.push(`"Flujo Migratorio Principal","${exec.nacionalidadLider ? exec.nacionalidadLider.nombre + ' (' + exec.nacionalidadLider.porcentaje + '%)' : 'N/D'}"`);
    lines.push(`"Clasificación Institucional","RESERVADO - USO OFICIAL EXCLUSIVO POLICÍA DE INVESTIGACIONES"`);
    lines.push(`"Cifrado y Seguridad","AES-256-GCM / Huella Digital SHA-256"`);
    lines.push('""');

    lines.push('"1. MATRIZ DE RENDIMIENTO OPERATIVO POR CUARTEL Y UNIDAD POLICIAL"');
    lines.push('"Puesto / Cuartel","Unidad Policial","Total Enrolados","Sincronizados PDI (Exitosos)","Con Error","Tasa de Efectividad (%)"');
    const cuarteles = reporte.rendimientoCuarteles || [];
    cuarteles.forEach((c) => {
      lines.push(`"${c.cuartel}","${c.unidad}",${c.total},${c.sincronizados},${c.conError},"${c.tasaExito}%"`);
    });
    lines.push('""');

    lines.push('"2. FLUJOS MIGRATORIOS POR NACIONALIDAD (TOP PAÍSES DE ORIGEN)"');
    lines.push('"País / Nacionalidad","Código ISO","Total Enrolamientos","Proporción (%)"');
    const nacionalidades = reporte.nacionalidadesPrincipales || [];
    nacionalidades.forEach((n) => {
      lines.push(`"${n.nacionalidad}","${n.codigo_iso || 'N/D'}",${n.total},"${n.porcentaje}%"`);
    });
    lines.push('""');

    lines.push('"3. ANÁLISIS DEMOGRÁFICO Y PROTECCIÓN DE MENORES (N.N.A.)"');
    lines.push('"Grupo Poblacional","Hombres (M)","Mujeres (F)","Total","Proporción (%)"');
    let mascAdultos = 0, mascMenores = 0, femAdultos = 0, femMenores = 0;
    (reporte.demografiaCruzada || []).forEach((d) => {
      if (d.genero === "M") {
        if (d.esMayorEdad) mascAdultos += d.total;
        else mascMenores += d.total;
      } else if (d.genero === "F") {
        if (d.esMayorEdad) femAdultos += d.total;
        else femMenores += d.total;
      }
    });
    const totalAdultos = mascAdultos + femAdultos;
    const totalMenores = mascMenores + femMenores;
    const totalCalculo = total || 1;
    lines.push(`"Adultos (Mayores de Edad >= 18 años)",${mascAdultos},${femAdultos},${totalAdultos},"${((totalAdultos / totalCalculo) * 100).toFixed(1)}%"`);
    lines.push(`"Niños, Niñas y Adolescentes (N.N.A. 0 a 17 años)",${mascMenores},${femMenores},${totalMenores},"${((totalMenores / totalCalculo) * 100).toFixed(1)}%"`);
    lines.push('""');

    lines.push('"AVISO LEGAL: Documento oficial generado por el Sistema ABIS de la Policía de Investigaciones de Chile."');
    lines.push('"Confidencialidad amparada por la Ley N° 19.628 sobre Protección de la Vida Privada. Prohibida su divulgación no autorizada."');

    const nombreArchivo = desde && hasta
      ? `Informe_Oficial_ABIS_PDI_${desde}_a_${hasta}.csv`
      : `Informe_Oficial_ABIS_PDI_${fecha || 'reporte'}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
    res.send("\uFEFF" + lines.join("\r\n"));
  } catch (err) {
    console.error("[ERROR EXPORT CSV]", err);
    res.status(500).send(`Error generando CSV: ${err.message}`);
  }
});

// Ingesta segura directa vía Web (Protegida con Clave de Autorización)
app.post("/api/ingest/upload", upload.single("archivo"), async (req, res) => {
  try {
    // 1. Verificación estricta de la clave de autorización policial
    const claveEnviada = req.headers["x-ingesta-auth"] || req.body?.clave || req.body?.password;
    const claveEsperada = process.env.INGESTA_PASSWORD || "pdi2026";

    if (!claveEnviada || claveEnviada.trim() !== claveEsperada.trim()) {
      console.warn(`[SEGURIDAD] Intento de ingesta rechazado: Clave de autorización no válida o ausente.`);
      return res.status(401).json({
        ok: false,
        error: "Clave de autorización no válida o ausente. Se requiere credencial policial autorizada para poblar la base de datos.",
        codigo: "AUTH_REQUIRED",
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No se ha enviado ningún archivo en el campo 'archivo'" });
    }

    const fileBuffer = req.file.buffer;
    const nombreOriginal = req.file.originalname || "archivo_cargado.xlsx";
    const tamañoBytes = fileBuffer.length;
    const hashSHA256 = generarHashSHA256(fileBuffer);
    const estaCifrado = esBufferCifrado(fileBuffer);

    console.log(`[UPLOAD AUTORIZADO] Procesando ${nombreOriginal} (${(tamañoBytes / 1024 / 1024).toFixed(2)} MB) - Cifrado: ${estaCifrado}`);

    const tiempoInicio = Date.now();
    const resultadoEtl = await runEtl(fileBuffer, pool);
    const duracionMs = Date.now() - tiempoInicio;

    if (!resultadoEtl.headerValidation.ok) {
      return res.status(422).json({
        ok: false,
        error: "Estructura de cabeceras inválida",
        headerValidation: resultadoEtl.headerValidation,
        nombreOriginal,
        hashSHA256,
      });
    }

    const totalInsertadas = resultadoEtl.insertResult ? resultadoEtl.insertResult.inserted : 0;

    // Registro formal en bitácora de auditoría inmutable
    try {
      await pool.query(
        `INSERT INTO registro_auditoria_cifrada 
         (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
         VALUES (NOW(), 'INGESTA_EXCEL_AUTORIZADA', $1, $2, $3, 'Operador Autorizado Web')`,
        [nombreOriginal, hashSHA256, `Insertadas: ${totalInsertadas}, Cifrado: ${estaCifrado}`]
      );
    } catch (auditErr) {
      console.warn("[AUDITORÍA] Advertencia al registrar en bitácora:", auditErr.message);
    }

    res.json({
      ok: true,
      mensaje: "Archivo procesado e insertado exitosamente en PostgreSQL",
      nombreOriginal,
      tamañoBytes,
      hashSHA256,
      estaCifrado,
      duracionMs,
      totalMapeadas: resultadoEtl.rows.length,
      totalInsertadas,
      erroresFilas: resultadoEtl.errors.length,
      erroresDetalle: resultadoEtl.errors.slice(0, 50),
    });
  } catch (err) {
    console.error("[UPLOAD ERROR]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Disparo manual de reporte hacia el canal de Telegram institucional
app.post("/api/telegram/enviar", async (req, res) => {
  try {
    let { fecha, desde, hasta } = req.body || {};
    let reporte;

    if (desde && hasta && FECHA_VALIDA.test(desde) && FECHA_VALIDA.test(hasta)) {
      reporte = await obtenerReporteRango(pool, desde, hasta);
    } else {
      if (!fecha || !FECHA_VALIDA.test(fecha)) {
        const { rows } = await pool.query(
          "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS fecha FROM registro_enrolamiento"
        );
        fecha = rows[0]?.fecha;
      }
      if (!fecha) {
        return res.status(404).json({ ok: false, error: "No hay registros disponibles para el reporte" });
      }
      reporte = await obtenerReporteDiario(pool, fecha);
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return res.status(500).json({ ok: false, error: "Token o Chat ID de Telegram no configurados en el archivo .env" });
    }

    const periodo = desde && hasta ? `${desde} al ${hasta}` : (reporte.fecha || fecha);
    const texto = formatearReporteExtenso(reporte, {
      desde,
      hasta,
      fecha: reporte.fecha || fecha,
      origen: "Dashboard Web PDI",
    });

    const replyMarkup = crearBotonesDescarga({ fecha: reporte.fecha || fecha, desde, hasta });
    const envio = await telegramClient.enviarMensaje({ token, chatId, texto, replyMarkup });

    res.json({
      ok: true,
      mensaje: `Reporte del período ${periodo} enviado exitosamente al canal de Telegram institucional`,
      messageId: envio.message_id,
    });
  } catch (err) {
    console.error("[TELEGRAM ENVIAR ERROR]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Herramienta Web: Cifrar archivo Excel a formato protegido .enc (AES-256-GCM)
app.post("/api/security/cifrar", upload.single("archivo"), async (req, res) => {
  try {
    // Verificación de clave de autorización policial
    const claveEnviada = req.headers["x-ingesta-auth"] || req.body?.clave || req.body?.password;
    const claveEsperada = process.env.INGESTA_PASSWORD || "pdi2026";

    if (!claveEnviada || claveEnviada.trim() !== claveEsperada.trim()) {
      console.warn(`[SEGURIDAD] Intento de cifrado rechazado: Clave de autorización no válida o ausente.`);
      return res.status(401).json({
        ok: false,
        error: "Clave de autorización no válida o ausente. Se requiere credencial policial autorizada.",
        codigo: "AUTH_REQUIRED",
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, error: "No se ha seleccionado ningún archivo para cifrar." });
    }
    const bufferOriginal = req.file.buffer;
    const nombreOriginal = req.file.originalname || "archivo.xlsx";
    const hashOriginal = generarHashSHA256(bufferOriginal);

    const bufferCifrado = cifrarBuffer(bufferOriginal);
    const hashCifrado = generarHashSHA256(bufferCifrado);

    // Registro de auditoría inmutable
    try {
      await pool.query(
        `INSERT INTO registro_auditoria_cifrada 
         (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
         VALUES (NOW(), 'CIFRADO_WEB_AUTORIZADO', $1, $2, $3, 'Operador Criptográfico Web')`,
        [nombreOriginal, hashCifrado, `Original: ${hashOriginal}`]
      );
    } catch (auditErr) {
      console.warn("[AUDITORÍA] Advertencia al registrar en bitácora:", auditErr.message);
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${nombreOriginal}.enc"`);
    res.setHeader("Access-Control-Expose-Headers", "X-Hash-Original, X-Hash-Cifrado");
    res.setHeader("X-Hash-Original", hashOriginal);
    res.setHeader("X-Hash-Cifrado", hashCifrado);
    res.send(bufferCifrado);
  } catch (err) {
    console.error("[CIFRAR WEB ERROR]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Herramienta Web: Descifrar y validar integridad de archivo .enc (retorna .xlsx)
app.post("/api/security/descifrar", upload.single("archivo"), async (req, res) => {
  try {
    // Verificación de clave de autorización policial
    const claveEnviada = req.headers["x-ingesta-auth"] || req.body?.clave || req.body?.password;
    const claveEsperada = process.env.INGESTA_PASSWORD || "pdi2026";

    if (!claveEnviada || claveEnviada.trim() !== claveEsperada.trim()) {
      console.warn(`[SEGURIDAD] Intento de descifrado rechazado: Clave de autorización no válida o ausente.`);
      return res.status(401).json({
        ok: false,
        error: "Clave de autorización no válida o ausente. Se requiere credencial policial autorizada.",
        codigo: "AUTH_REQUIRED",
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, error: "No se ha seleccionado ningún archivo para descifrar." });
    }
    const bufferCifrado = req.file.buffer;
    const nombreOriginal = req.file.originalname || "archivo.enc";

    if (!esBufferCifrado(bufferCifrado)) {
      return res.status(400).json({
        ok: false,
        error: "El archivo no posee la cabecera mágica de cifrado ABIS (ABIS_ENC_V1) o no fue cifrado con el sistema.",
      });
    }

    const bufferDescifrado = descifrarBuffer(bufferCifrado);
    const nombreDescifrado = nombreOriginal.replace(/\.enc$/i, "") || "archivo_descifrado.xlsx";
    const hashDescifrado = generarHashSHA256(bufferDescifrado);

    // Registro de auditoría inmutable
    try {
      await pool.query(
        `INSERT INTO registro_auditoria_cifrada 
         (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
         VALUES (NOW(), 'DESCIFRADO_WEB_AUTORIZADO', $1, $2, $3, 'Operador Criptográfico Web')`,
        [nombreOriginal, hashDescifrado, `Descifrado a: ${nombreDescifrado}`]
      );
    } catch (auditErr) {
      console.warn("[AUDITORÍA] Advertencia al registrar en bitácora:", auditErr.message);
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nombreDescifrado}"`);
    res.setHeader("Access-Control-Expose-Headers", "X-Hash-Descifrado");
    res.setHeader("X-Hash-Descifrado", hashDescifrado);
    res.send(bufferDescifrado);
  } catch (err) {
    console.error("[DESCIFRAR WEB ERROR]", err);
    res.status(500).json({ ok: false, error: "Fallo en el descifrado: la clave maestra no coincide o el archivo fue manipulado/corrompido." });
  }
});

// ==========================================================================
// AJUSTES Y GESTIÓN DE HORARIOS DE REPORTES AUTOMÁTICOS
// ==========================================================================

// Obtiene la configuración actual de horarios de reporte y próxima ejecución
app.get("/api/settings/schedule", (req, res) => {
  try {
    const config = schedulerService.getConfig();
    const next = schedulerService.getNextExecution(config);
    const horaChile = schedulerService.obtenerHoraChile();

    res.json({
      ok: true,
      config,
      next,
      horaChile,
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      defaultChatId: process.env.TELEGRAM_CHAT_ID
        ? String(process.env.TELEGRAM_CHAT_ID).slice(0, 4) + "***" + String(process.env.TELEGRAM_CHAT_ID).slice(-3)
        : null,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Guarda la configuración actualizada de horarios de reporte
app.post("/api/settings/schedule", (req, res) => {
  try {
    const { enabled, times, days, reportType, telegramChatId } = req.body || {};
    const updated = schedulerService.saveConfig({
      enabled: enabled !== undefined ? Boolean(enabled) : undefined,
      times,
      days,
      reportType,
      telegramChatId,
    });
    const next = schedulerService.getNextExecution(updated);

    res.json({
      ok: true,
      mensaje: "Configuración de horarios de reporte actualizada exitosamente.",
      config: updated,
      next,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Disparo de prueba manual de notificación programada
app.post("/api/settings/schedule/test", async (req, res) => {
  try {
    const { chatId } = req.body || {};
    const resultado = await schedulerService.triggerScheduledReport({
      pool,
      isTest: true,
      customChatId: chatId,
    });

    res.json({
      ok: true,
      mensaje: "Reporte de prueba enviado exitosamente al canal de Telegram.",
      resultado,
    });
  } catch (err) {
    console.error("[SCHEDULE TEST ERROR]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

const { iniciarBot, detenerBot } = require("./telegram/botService");

const server = app.listen(port, () => {
  console.log(`Sistema ABIS escuchando en http://localhost:${port}`);

  if (process.env.ENABLE_TELEGRAM_BOT !== "false" && process.env.TELEGRAM_BOT_TOKEN) {
    iniciarBot({
      token: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
      pool,
    }).catch((err) => {
      console.error("Error iniciando bot interactivo en servidor:", err.message);
    });
  }

  // Iniciar servicio de horarios y reportes automáticos
  schedulerService.iniciarScheduler({ pool });
});

function cerrarServidor() {
  detenerBot();
  schedulerService.detenerScheduler();
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on("SIGINT", cerrarServidor);
process.on("SIGTERM", cerrarServidor);


