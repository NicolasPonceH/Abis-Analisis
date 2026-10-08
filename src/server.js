require("dotenv").config();
const path = require("path");
const express = require("express");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const { obtenerReporteDiario } = require("./reportes/reporteDiario");
const {
  obtenerReporteRango,
  obtenerTendenciaHistorica,
  obtenerFechasDisponibles,
  obtenerComparacionPeriodos,
} = require("./reportes/reporteRango");
const { runEtl, runSheetEtl } = require("./etl");
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
const recipientService = require("./telegram/recipientService");
const { iniciarSIAD, detenerSIAD } = require("./services/siadService");
const http = require("http");

const app = express();
const port = process.env.PORT || 3000;

// Proxy para el módulo de Análisis Documental (SIAD)
app.use("/analisis", (req, res) => {
  const siadUrl = process.env.SIAD_URL || "http://127.0.0.1:5001";
  const targetUrl = `${siadUrl}${req.url}`;
  
  const proxyReq = http.request(targetUrl, {
    method: req.method,
    headers: { 
      ...req.headers, 
      host: new URL(siadUrl).host,
      "X-Forwarded-Prefix": "/analisis"
    },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  
  proxyReq.on("error", (err) => {
    console.error("[PROXY SIAD ERROR]", err.message);
    res.status(502).send("El módulo de Análisis Documental no está disponible.");
  });
  
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
});

// Rate limiting local sin dependencias externas
// Protege contra fuerza bruta de la contraseña INGESTA_PASSWORD
const rateLimitStore = new Map();
let lastCleanup = Date.now();

function rateLimitMiddleware(maxRequests = 30, windowMs = 900000) {
  // 30 peticiones por 15 minutos (900000 ms)
  return (req, res, next) => {
    const ip =
      req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    // Limpieza cada minuto de entradas viejas
    if (now - lastCleanup > 60000) {
      const cutoff = now - windowMs;
      for (const [key, entry] of rateLimitStore) {
        if (entry.timestamp < cutoff) rateLimitStore.delete(key);
      }
      lastCleanup = now;
    }

    const entry = rateLimitStore.get(ip);
    if (!entry) {
      rateLimitStore.set(ip, { count: 1, timestamp: now });
      return next();
    }

    if (entry.count >= maxRequests) {
      const remainingWait = windowMs - (now - entry.timestamp);
      return res.status(429).json({
        ok: false,
        error: `Demasiados intentos. Intente nuevamente en ${Math.ceil(
          remainingWait / 1000
        )} segundos`,
      });
    }

    entry.count++;
    next();
  };
}

// Aplicar rate limiting a endpoints sensibles
// Rate limiting desactivado temporalmente para desarrollo y pruebas
// app.use("/api/ingest/*", rateLimitMiddleware(20, 900000)); 
// app.use("/api/settings/*", rateLimitMiddleware(20, 900000));
// app.use("/api/telegram/*", rateLimitMiddleware(30, 900000));
// app.use("/api/security/*", rateLimitMiddleware(20, 900000));

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

// Configurar multer para almacenar archivos en memoria RAM (seguridad: sin residuos en disco)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Validar extensión
  const allowedExtensions = [".xlsx", ".xlsm"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return cb(new Error("Solo se permiten archivos .xlsx o .xlsm"), false);
  }
  
  // Validar tamaño (adicional al limit de multer)
  if (file.size && file.size > 100 * 1024 * 1024) {
    return cb(new Error("Archivo muy grande: máximo 100MB"), false);
  }
  
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB límite
  fileFilter
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Middleware de Rate Limiting Local
const rateLimit = (ms = 15000, maxAttempts = 20) => {
  const attempts = new Map();
  
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress;
    const now = Date.now();
    
    // Limpiar entradas viejas (>5 minutos)
    for (const [key, count] of attempts) {
      if (now - key > 300000) attempts.delete(key);
    }
    
    let count = attempts.get(ip) || 0;
    attempts.set(ip, count + 1);
    
    if (count >= maxAttempts) {
      return res.status(429).json({
        ok: false,
        error: "Demasiados intentos. Intente en " + Math.ceil((300000 - (now - attempts.keys().next().value || 0)) / 1000) + " segundos"
      });
    }
    
    next();
  };
};

// Aplicar a endpoints sensibles
// app.use("/api/ingest", rateLimit(15000, 20));
// app.use("/api/settings", rateLimit(15000, 20));
// app.use("/api/telegram", rateLimit(15000, 20));

// Configurar EJS para renderizado modular
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const JWT_SECRET = process.env.SECRET_KEY || "dev-only-secret";

function requireAuth(req, res, next) {
  const token = req.cookies.abis_auth;
  if (!token) return res.redirect("/login");
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.redirect("/login");
  }
}

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const siadUrl = process.env.SIAD_URL || "http://127.0.0.1:5001";
    const authRes = await fetch(`${siadUrl}/api/verify_password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    
    if (authRes.ok) {
      const data = await authRes.json();
      if (data.ok) {
        let userRole = "operador";
        try {
          const userRes = await pool.query("SELECT rol FROM usuarios WHERE LOWER(username) = LOWER($1)", [username]);
          if (userRes.rows.length > 0) {
            userRole = userRes.rows[0].rol;
          }
        } catch (dbErr) {
          console.error("Error al obtener rol:", dbErr);
        }
        const token = jwt.sign({ username, rol: userRole }, JWT_SECRET, { expiresIn: "8h" });
        res.cookie("abis_auth", token, { httpOnly: true, maxAge: 8 * 3600 * 1000 });
        return res.redirect("/");
      }
    }
    return res.render("login", { error: "Contraseña incorrecta." });
  } catch (err) {
    return res.render("login", { error: "Error de conexión con el sistema de validación." });
  }
});

app.get("/register", (req, res) => {
  res.render("register", { error: null, success: null });
});

app.post("/register", async (req, res) => {
  const { username, password, confirm_password, nombre_completo } = req.body;
  
  if (password !== confirm_password) {
    return res.render("register", { error: "Las contraseñas no coinciden.", success: null });
  }

  try {
    const siadUrl = process.env.SIAD_URL || "http://127.0.0.1:5001";
    const authRes = await fetch(`${siadUrl}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, nombre_completo })
    });
    
    if (authRes.ok) {
      const data = await authRes.json();
      if (data.ok) {
        return res.render("login", { error: null, success: "Usuario registrado exitosamente. Ahora puedes iniciar sesión." });
      } else {
        return res.render("register", { error: data.error || "No se pudo registrar el usuario.", success: null });
      }
    }
    return res.render("register", { error: "Error del servidor de base de datos.", success: null });
  } catch (err) {
    return res.render("register", { error: "Error de conexión con el sistema de validación.", success: null });
  }
});

app.get("/logout", (req, res) => {
  res.clearCookie("abis_auth");
  res.redirect("/login");
});

app.get("/", requireAuth, (req, res) => {
  res.render("index", { user: req.user });
});

app.post("/api/user/change-password", requireAuth, express.json(), async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Falta la nueva contraseña." });
  
  try {
    const siadUrl = process.env.SIAD_URL || "http://127.0.0.1:5001";
    const updateRes = await fetch(`${siadUrl}/api/update_password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: req.user.username, password })
    });
    const data = await updateRes.json();
    if (data.ok) return res.json({ ok: true });
    return res.status(400).json({ error: data.error || "Error al actualizar la contraseña." });
  } catch (err) {
    console.error("Error in change-password:", err);
    return res.status(500).json({ error: "Error de conexión con el sistema de validación." });
  }
});

app.post("/api/admin/reset-password", requireAuth, express.json(), async (req, res) => {
  if (req.user.rol !== "admin") return res.status(403).json({ error: "No tienes permisos." });
  const { id, password } = req.body;
  if (!id || !password) return res.status(400).json({ error: "Faltan datos." });
  
  try {
    const userRes = await pool.query("SELECT username FROM usuarios WHERE id = $1", [id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado." });
    
    const siadUrl = process.env.SIAD_URL || "http://127.0.0.1:5001";
    const updateRes = await fetch(`${siadUrl}/api/update_password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: userRes.rows[0].username, password })
    });
    const data = await updateRes.json();
    if (data.ok) return res.json({ ok: true });
    return res.status(400).json({ error: data.error || "Error al actualizar la contraseña." });
  } catch (err) {
    console.error("Error in reset-password:", err);
    return res.status(500).json({ error: "Error de servidor." });
  }
});

app.post("/api/admin/create-user", requireAuth, express.json(), async (req, res) => {
  if (req.user.rol !== "admin") return res.status(403).json({ error: "No tienes permisos." });
  const { username, password, rol } = req.body;
  if (!username || !password || !rol) return res.status(400).json({ error: "Faltan datos." });
  
  try {
    const siadUrl = process.env.SIAD_URL || "http://127.0.0.1:5001";
    const createRes = await fetch(`${siadUrl}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, nombre_completo: username })
    });
    const data = await createRes.json();
    
    if (data.ok) {
      await pool.query("UPDATE usuarios SET rol = $1 WHERE username = $2", [rol, username]);
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: data.error || "Error al crear usuario." });
  } catch (err) {
    console.error("Error in create-user:", err);
    return res.status(500).json({ error: "Error de servidor." });
  }
});

app.post("/api/admin/update-role", requireAuth, express.json(), async (req, res) => {
  if (req.user.rol !== "admin") {
    return res.status(403).json({ error: "No tienes permisos de administrador." });
  }
  const { id, rol } = req.body;
  if (!id || !rol) {
    return res.status(400).json({ error: "Faltan datos." });
  }
  try {
    await pool.query("UPDATE usuarios SET rol = $1 WHERE id = $2", [rol, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error updating user role:", err);
    res.status(500).json({ error: "Error de base de datos." });
  }
});

app.get("/ajustes/:seccion?", requireAuth, async (req, res) => {
  const seccion = req.params.seccion || "general";
  const validSections = ["general", "horarios", "cuenta", "seguridad", "administracion"];
  if (!validSections.includes(seccion)) {
    return res.redirect("/ajustes/general");
  }

  let dbUsers = [];
  if (seccion === "administracion" && req.user.rol === "admin") {
    try {
      const usersRes = await pool.query("SELECT id, username, rol, ultimo_ingreso FROM usuarios ORDER BY id ASC");
      dbUsers = usersRes.rows;
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  }

  res.render("ajustes", { user: req.user, activeSection: seccion, dbUsers });
});

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

// Endpoint analítico: Top profesiones y oficios registrados
app.get("/api/metricas/profesiones", async (req, res) => {
  try {
    const { fecha, desde, hasta, limit = 10, incluirNoEspecificado = "false", agrupar = "false" } = req.query;
    let whereClause = "1=1";
    const params = [];
    let paramIdx = 1;

    if (fecha && FECHA_VALIDA.test(fecha)) {
      whereClause += ` AND r.fecha_enrolamiento = $${paramIdx++}`;
      params.push(fecha);
    } else if (desde && hasta && FECHA_VALIDA.test(desde) && FECHA_VALIDA.test(hasta)) {
      whereClause += ` AND r.fecha_enrolamiento >= $${paramIdx++} AND r.fecha_enrolamiento <= $${paramIdx++}`;
      params.push(desde, hasta);
    }

    const rawQuery = `
      SELECT p.id_profesion, p.nombre_profesion AS profesion, count(*) AS total
      FROM registro_enrolamiento r
      JOIN profesion p ON p.id_profesion = r.id_profesion
      WHERE ${whereClause}
      GROUP BY p.id_profesion, p.nombre_profesion
    `;
    // Extraemos todos para poder agruparlos en JS
    const { rows: rawRows } = await pool.query(rawQuery, params);

    // Función para normalizar profesiones similares
    const agruparProfesion = (prof) => {
      const p = prof.toUpperCase();
      if (p.includes("ALBAÑIL") || p.includes("CONSTRUCCION") || p.includes("EDIFICIOS")) return "ALBAÑILERÍA Y CONSTRUCCIÓN";
      if (p.includes("COMERCIA") || p.includes("VENDEDOR") || p.includes("CAJERO") || p.includes("CAJERA")) return "COMERCIO Y VENTAS";
      if (p.includes("CHOFER") || p.includes("CONDUCTOR") || p.includes("CAMION") || p.includes("TRANSPORTE") || p.includes("REPARTIDOR")) return "TRANSPORTE Y LOGÍSTICA";
      if (p.includes("AGRICULT") || p.includes("TEMPORER") || p.includes("CAMPESIN") || p.includes("AGRÍCOLA")) return "AGRICULTURA Y TEMPOREROS";
      if (p.includes("MECANIC") || p.includes("VULCANIZADOR") || p.includes("TALLER")) return "MECÁNICA Y AUTOMOTRIZ";
      if (p.includes("CASA") && p.includes("DUEÑA")) return "LABORES DE HOGAR / DUEÑA DE CASA";
      if (p.includes("ESTUDIANTE")) return "ESTUDIANTES";
      if (p.includes("COCIN") || p.includes("CHEF") || p.includes("GARZON") || p.includes("MESERO") || p.includes("PANADERO")) return "GASTRONOMÍA Y ALIMENTOS";
      if (p.includes("OBRERO") || p.includes("OPERARI") || p.includes("JORNALERO") || p.includes("PEON")) return "OPERARIOS Y OBREROS";
      if (p.includes("PELUQUER") || p.includes("BARBER") || p.includes("ESTILISTA") || p.includes("MANICURA")) return "ESTÉTICA Y BELLEZA";
      if (p.includes("ADMINISTRATIV") || p.includes("CONTADOR") || p.includes("SECRETARI")) return "ADMINISTRACIÓN Y OFICINA";
      if (p.includes("MEDIC") || p.includes("ENFERMER") || p.includes("PSICOLOG") || p.includes("DENTISTA") || p.includes("SALUD")) return "PROFESIONALES DE LA SALUD";
      if (p.includes("GUARDIA") || p.includes("SEGURIDAD")) return "SEGURIDAD PRIVADA";
      if (p.includes("ASESORA") || p.includes("NANA") || p.includes("DOMESTICA") || p.includes("ASEO") || p.includes("LIMPIEZA")) return "ASESORA DEL HOGAR / LIMPIEZA";
      if (p.includes("INDEPENDIENTE") || p.includes("EMPRESARIO") || p.includes("INDEPENDIENTE")) return "INDEPENDIENTE / EMPRESARIO";
      if (p.includes("PROFESOR") || p.includes("DOCENTE") || p.includes("EDUCADOR")) return "EDUCACIÓN";
      if (p.includes("INGENIERO")) return "INGENIERÍA";
      if (p.includes("TECNICO")) return "TÉCNICOS ESPECIALIZADOS";
      if (p.includes("JUBILADO") || p.includes("PENSIONADO")) return "JUBILADOS / PENSIONADOS";
      if (p.includes("CESANTE") || p.includes("DESEMPLEADO") || p.includes("SIN OCUPACION") || p.includes("BUSCA DE SU PRIMER EMPLEO") || p.includes("NINGUNA")) return "CESANTES / SIN OCUPACIÓN";
      return "OTROS OFICIOS / PROFESIONES";
    };

    const debeAgrupar = agrupar === "true";
    const groupedMap = new Map();
    
    for (const row of rawRows) {
      let g;
      const pText = row.profesion ? row.profesion.toUpperCase() : "";
      
      // Siempre normalizar los no especificados, sin importar el modo
      if (!row.profesion || pText === "0" || pText.includes("NO ESPECIFICADO") || pText.includes("SIN PROFESION") || pText === "NINGUNO") {
        g = "NO ESPECIFICADO";
      } else if (debeAgrupar) {
        g = agruparProfesion(row.profesion);
      } else {
        g = row.profesion; // Específico sin agrupar
      }
      
      const totalNum = parseInt(row.total, 10);
      groupedMap.set(g, (groupedMap.get(g) || 0) + totalNum);
    }

    let rows = Array.from(groupedMap.entries()).map(([profesion, total]) => ({
      profesion,
      total: total.toString()
    }));

    // Ordenar de mayor a menor y aplicar el límite
    rows.sort((a, b) => b.total - a.total);
    const finalLimit = Math.min(Math.max(Number(limit) || 10, 1), 500);
    rows = rows.slice(0, finalLimit);

    const totalQuery = `
      SELECT count(*) AS total_general,
             count(*) FILTER (WHERE p.nombre_profesion NOT IN ('NO ESPECIFICADO', 'SIN PROFESION', '0')) AS total_con_profesion
      FROM registro_enrolamiento r
      JOIN profesion p ON p.id_profesion = r.id_profesion
      WHERE ${whereClause}
    `;
    const totalsRes = await pool.query(totalQuery, params);
    const totalConProf = Number(totalsRes.rows[0]?.total_con_profesion || 0);
    const totalGeneral = Number(totalsRes.rows[0]?.total_general || 0);

    const profesiones = rows.map(r => ({
      profesion: r.profesion,
      total: Number(r.total),
      porcentaje: totalConProf > 0 ? Number(((Number(r.total) / totalConProf) * 100).toFixed(1)) : 0
    }));

    res.json({
      ok: true,
      totalGeneral,
      totalConProfesion: totalConProf,
      profesiones,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint para obtener la bitácora de auditoría
app.get("/api/auditoria", async (req, res) => {
  try {
    const { tipo, desde, hasta, limit = 50, offset = 0 } = req.query;
    
    let whereClause = "1=1";
    const params = [];
    let paramIndex = 1;

    if (tipo) {
      whereClause += ` AND tipo_evento = $${paramIndex++}`;
      params.push(tipo);
    }
    
    if (desde && FECHA_VALIDA.test(desde)) {
      whereClause += ` AND fecha_evento >= $${paramIndex++}::date`;
      params.push(desde);
    }
    
    if (hasta && FECHA_VALIDA.test(hasta)) {
      whereClause += ` AND fecha_evento < ($${paramIndex++}::date + interval '1 day')`;
      params.push(hasta);
    }

    params.push(parseInt(limit, 10));
    params.push(parseInt(offset, 10));

    const { rows } = await pool.query(
      `SELECT id_auditoria, fecha_evento, tipo_evento, archivo_procesado, detalles_cifrados, usuario_o_proceso
       FROM registro_auditoria_cifrada
       WHERE ${whereClause}
       ORDER BY fecha_evento DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("[ERROR AUDITORIA]", err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint de comparación de períodos (Semana/Mes)
app.get("/api/metricas/comparar", async (req, res) => {
  try {
    const { tipo } = req.query;
    if (tipo !== "semana" && tipo !== "mes") {
      return res.status(400).json({ error: "Parámetro 'tipo' debe ser 'semana' o 'mes'" });
    }
    const comparacion = await obtenerComparacionPeriodos(pool, tipo);
    res.json(comparacion);
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

// ==========================================================================
// ORACLE → POSTGRESQL POPULATION API
// ==========================================================================
// Endpoint para poblar la base de datos PostgreSQL desde Oracle.
// Conecta a Oracle, extrae los datos necesarios y los inserta en PostgreSQL
// siguiendo el esquema normalizado del sistema ABIS.
// Requiere clave de autorización en header 'x-ingesta-auth'.

app.post("/api/oracle/populate", async (req, res) => {
  try {
    // 1. Verificación estricta de la clave de autorización policial
    const claveEnviada = req.headers["x-ingesta-auth"] || req.body?.clave || req.body?.password;
    const claveEsperada = process.env.INGESTA_PASSWORD;

    if (!claveEnviada || claveEnviada.trim() !== claveEsperada.trim()) {
      console.warn(`[SEGURIDAD] Intento de poblamiento desde Oracle rechazado: Clave no autorizada.`);
      return res.status(401).json({
        ok: false,
        error: "Clave de autorización no válida o ausente. Se requiere credencial policial autorizada.",
        codigo: "AUTH_REQUIRED",
      });
    }

    const { connectionString, user, password, sql } = req.body || {};

    if (!connectionString || !user || !password) {
      return res.status(400).json({
        ok: false,
        error: "Faltan parámetros de conexión Oracle: connectionString, user, password",
      });
    }

    if (!sql || typeof sql !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Falta el parámetro 'sql' con la consulta o nombre de tabla a poblar",
      });
    }

    console.log(`[ORACLE] Solicitud de poblamiento autorizada. Ejecutando: ${sql.substring(0, 80)}${sql.length > 80 ? "..." : ""}`);

    // 2. Conectar a Oracle
    const oracledb = require("oracledb");
    let pool;

    try {
      pool = await oracledb.getConnection({
        connectionString: connectionString,
        user: user,
        password: password,
        // Configuración optimizada para lecturas masivas
        poolAlias: "Sistema_ABIS_Oracle",
        stmtCacheSize: 0,
      });

      // 3. Ejecutar consulta contra Oracle
      let result;
      try {
        result = await pool.execute(sql);
      } catch (oraErr) {
        console.error("[ORACLE ERROR] Error ejecutando consulta:", oraErr.message);
        return res.status(500).json({
          ok: false,
          error: "Error ejecutando consulta contra Oracle",
          detalle: oraErr.message,
        });
      }

      // 4. Procesar resultados y mapear a esquema PostgreSQL
      const rows = result.rows || [];
      const cols = result.metaData || [];

      if (rows.length === 0) {
        await pool.close();
        return res.json({
          ok: true,
          mensaje: "Consulta ejecutada contra Oracle, pero no hay filas para insertar.",
          filasOracle: 0,
          filasPostgre: 0,
        });
      }

      // 5. Transformar datos Oracle → PostgreSQL
      // El esquema ABIS espera campos específicos en registro_enrolamiento
      // y catálogos normalizados. Mapeamos según sea necesario.
      const transformedRows = transformOracleToPostgre(rows, cols);

      // 6. Insertar en PostgreSQL usando el patrón de bulk insert
      const { bulkInsertRegistros } = require("./etl/bulkInsert");

      const insertResult = await bulkInsertRegistros(pool, transformedRows, {
        onBatchInserted: ({ batches, inserted, total }) => {
          process.stdout.write(
            `\r   -> Lote ${batches}: ${inserted.toLocaleString()} / ${total.toLocaleString()} insertados...`
          );
        },
      });

      const mensaje = `Poblado exitosamente: ${insertResult.inserted.toLocaleString()} registros insertados en ${insertResult.batches} lotes desde Oracle a PostgreSQL`;

      console.log(`[ORACLE] ${mensaje}`);

      // 7. Registrar en auditoría
      try {
        await pool.query(
          `INSERT INTO registro_auditoria_cifrada 
           (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
           VALUES (NOW(), 'POBLAMIENTO_ORACLE_AUTORIZADA', 'desconocido', $1, $2, 'Operador Oracle Web')`,
          [generarHashSHA256(Buffer.from(JSON.stringify(transformedRows))), `Filas: ${rows.length}`]
        );
      } catch (auditErr) {
        console.warn("[AUDITORÍA] Advertencia al registrar poblamiento desde Oracle:", auditErr.message);
      }

      await pool.close();

      res.json({
        ok: true,
        mensaje,
        filasOracle: rows.length,
        filasPostgre: insertResult.inserted,
        batches: insertResult.batches,
      });
    } catch (connErr) {
      console.error("[ORACLE CONNECTION ERROR]", connErr.message);
      return res.status(500).json({
        ok: false,
        error: "Error conectando a la base de datos Oracle",
        detalle: connErr.message,
      });
    } finally {
      try {
        if (pool) {
          await pool.close();
        }
      } catch (e) {
        // Ignorar errores al cerrar
      }
    }
  } catch (err) {
    console.error("[ORACLE POPULATE ERROR]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Helper para transformar datos de Oracle al esquema PostgreSQL ABIS
function transformOracleToPostgre(rows, cols) {
  // Mapeo genérico: este método debe personalizarse según la estructura
  // de la tabla en Oracle. El esquema PostgreSQL ABIS tiene estas columnas
  // en registro_enrolamiento:
  //   fecha_enrolamiento, id_nacionalidad, id_cuartel, id_equipo,
  //   id_profesion, genero, es_mayor_edad, edad_exacta,
  //   id_estado_sincronizacion, id_estado_registro, id_estado_general

  const { norm, resolveField } = require("./src/ingest/catalogMapper");
  // Note: En una implementación completa, aquí se cargarían los catálogos
  // de PostgreSQL y se mapearían los valores de Oracle a los IDs correspondientes.

  // Por ahora, retornamos las filas con un mapeo básico assuming que los
  // valores ya vienen normalizados o en el formato correcto.
  const transformed = rows.map((row) => ({
    fecha_enrolamiento: row.FECHA_ENROLAMIENTO || row.fecha_enrolamiento || new Date().toISOString().split("T")[0],
    id_nacionalidad: row.ID_NACIONALIDAD || 1,
    id_cuartel: row.ID_CUARTEL || 1,
    id_equipo: row.ID_EQUIPO || 1,
    id_profesion: row.ID_PROFESION !== undefined ? row.ID_PROFESION : 1,
    genero: row.GENERO || "M",
    es_mayor_edad: row.ES_MAYOR_EDAD !== undefined ? row.ES_MAYOR_EDAD : true,
    edad_exacta: row.EDAD_EXACTA !== undefined ? row.EDAD_EXACTA : null,
    id_estado_sincronizacion: row.ID_ESTADO_SINCRONIZACION || 1,
    id_estado_registro: row.ID_ESTADO_REGISTRO || 1,
    id_estado_general: row.ID_ESTADO_GENERAL || 1,
  }));

  return transformed;
}

module.exports = { transformOracleToPostgre };

app.post("/api/ingest/upload", upload.single("archivo"), async (req, res) => {
  try {
    // 1. Verificación estricta de la clave de autorización policial
    const claveEnviada = req.headers["x-ingesta-auth"] || req.body?.clave || req.body?.password;
    const claveEsperada = process.env.INGESTA_PASSWORD;

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

// Ingesta directa desde Hoja de Cálculo / Portapapeles (Copiar y Pegar desde Oracle/Excel)
app.post("/api/ingest/sheet", async (req, res) => {
  try {
    // 1. Verificación estricta de la clave de autorización policial
    const claveEnviada = req.headers["x-ingesta-auth"] || req.body?.clave || req.body?.password;
    const claveEsperada = process.env.INGESTA_PASSWORD;

    if (!claveEnviada || claveEnviada.trim() !== claveEsperada.trim()) {
      console.warn(`[SEGURIDAD] Intento de ingesta de hoja de cálculo rechazado: Clave no autorizada.`);
      return res.status(401).json({
        ok: false,
        error: "Clave de autorización no válida o ausente. Se requiere credencial policial autorizada para poblar la base de datos.",
        codigo: "AUTH_REQUIRED",
      });
    }

    const { headers, rows } = req.body || {};

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "No se suministraron filas para procesar en la hoja de cálculo.",
      });
    }

    const payloadSummary = JSON.stringify({ headers, count: rows.length, muestra: rows.slice(0, 3) });
    const hashSHA256 = generarHashSHA256(payloadSummary);

    console.log(`[SHEET INGEST AUTORIZADO] Procesando ${rows.length} filas desde portapapeles/hoja de cálculo...`);

    const tiempoInicio = Date.now();
    const resultadoEtl = await runSheetEtl(headers, rows, pool);
    const duracionMs = Date.now() - tiempoInicio;

    if (!resultadoEtl.headerValidation.ok) {
      return res.status(422).json({
        ok: false,
        error: "Estructura de columnas inválida. No se detectaron las columnas requeridas del sistema ABIS.",
        headerValidation: resultadoEtl.headerValidation,
        hashSHA256,
      });
    }

    const totalInsertadas = resultadoEtl.insertResult ? resultadoEtl.insertResult.inserted : 0;

    // Registro formal en bitácora de auditoría inmutable
    try {
      await pool.query(
        `INSERT INTO registro_auditoria_cifrada 
         (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
         VALUES (NOW(), 'INGESTA_PORTAPAPELES_AUTORIZADA', $1, $2, $3, 'Operador Hoja de Cálculo Web')`,
        [
          'Portapapeles / Oracle Sheet',
          hashSHA256,
          `Insertadas: ${totalInsertadas}, Filas Enviadas: ${rows.length}, Errores Mapeo: ${resultadoEtl.errors.length}`,
        ]
      );
    } catch (auditErr) {
      console.warn("[AUDITORÍA] Advertencia al registrar en bitácora:", auditErr.message);
    }

    res.json({
      ok: true,
      mensaje: `Ingesta completada: se insertaron ${totalInsertadas} registros exitosamente en PostgreSQL.`,
      hashSHA256,
      duracionMs,
      totalRecibidas: rows.length,
      totalInsertadas,
      totalMapeadas: resultadoEtl.rows.length,
      erroresFilas: resultadoEtl.errors.length,
      erroresDetalle: resultadoEtl.errors.slice(0, 50),
    });
  } catch (err) {
    console.error("[SHEET INGEST ERROR]", err);
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
    let envio = null;

    // Generar captura visual dinámica según la fecha o rango seleccionado en la web
    try {
      if (desde && hasta) {
        const { generarCapturaDiaria } = require("./reportes/imageReportService");
        const buffer = await generarCapturaDiaria(reporte);
        envio = await telegramClient.enviarFoto({
          token,
          chatId,
          buffer,
          caption: `📊 <b>REPORTE OFICIAL ABIS - PERÍODO ${periodo}</b>\n👥 Total Enrolados: <b>${(reporte.total || 0).toLocaleString("es-CL")}</b>`,
        });
      } else {
        const { generarCapturaDiaria } = require("./reportes/imageReportService");
        const buffer = await generarCapturaDiaria(reporte);
        envio = await telegramClient.enviarFoto({
          token,
          chatId,
          buffer,
          caption: `📊 <b>REPORTE OFICIAL ABIS - ${fecha}</b>\n👥 Total Enrolados: <b>${(reporte.total || 0).toLocaleString("es-CL")}</b>`,
        });
      }
      // Enviar además el reporte institucional de texto completo con los botones interactivos
      const resTexto = await telegramClient.enviarMensaje({
        token,
        chatId,
        texto,
        replyMarkup,
      });
      if (!envio) envio = resTexto;
    } catch (imgErr) {
      console.warn("[TELEGRAM ENVIAR] Fallback a mensaje de texto:", imgErr.message);
      envio = await telegramClient.enviarMensaje({ token, chatId, texto, replyMarkup });
    }

    res.json({
      ok: true,
      mensaje: `Reporte visual del período ${periodo} enviado exitosamente al canal de Telegram institucional`,
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
    const claveEsperada = process.env.INGESTA_PASSWORD;

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
    const claveEsperada = process.env.INGESTA_PASSWORD;

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
app.get("/api/settings/schedule", async (req, res) => {
  try {
    const config = await schedulerService.getConfig();
    const next = schedulerService.getNextExecution(config);
    const horaChile = schedulerService.obtenerHoraChile();

    res.json({
      ok: true,
      config,
      next,
      horaChile,
      serverTimestamp: Date.now(),
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      defaultChatId: process.env.TELEGRAM_CHAT_ID
        ? String(process.env.TELEGRAM_CHAT_ID).slice(0, 4) + "***" + String(process.env.TELEGRAM_CHAT_ID).slice(-3)
        : null,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Guarda la configuración actualizada de horarios de reporte (Protegido con Clave de Autorización)
app.post("/api/settings/schedule", async (req, res) => {
  try {
    // 1. Verificación estricta de la clave de autorización policial
    const claveEnviada = req.headers["x-ingesta-auth"] || req.body?.clave || req.body?.password;
    const claveEsperada = process.env.INGESTA_PASSWORD;

    if (!claveEnviada || claveEnviada.trim() !== claveEsperada.trim()) {
      console.warn(`[SEGURIDAD] Intento de modificación de programación rechazado: Clave de autorización no válida o ausente.`);
      return res.status(401).json({
        ok: false,
        error: "Clave de autorización no válida o ausente. Se requiere credencial policial autorizada para modificar los ajustes de programación.",
        codigo: "AUTH_REQUIRED",
      });
    }

    const { enabled, times, days, reportType, telegramChatId } = req.body || {};
    const updated = await schedulerService.saveConfig({
      enabled: enabled !== undefined ? Boolean(enabled) : undefined,
      times,
      days,
      reportType,
      telegramChatId,
    });
    const next = schedulerService.getNextExecution(updated);

    // Registro de auditoría inmutable
    try {
      await pool.query(
        `INSERT INTO registro_auditoria_cifrada 
         (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
         VALUES (NOW(), 'MODIFICACION_PROGRAMACION_AUTORIZADA', 'schedule-config.json', $1, $2, 'Operador Administrador Web')`,
        [
          generarHashSHA256(Buffer.from(JSON.stringify(updated))),
          `Horarios: ${(updated.times || []).join(", ")} hrs | Días: ${(updated.days || []).join(",")} | Reporte: ${updated.reportType}`
        ]
      );
    } catch (auditErr) {
      console.warn("[AUDITORÍA] Advertencia al registrar modificación de programación en bitácora:", auditErr.message);
    }

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

// Disparo de prueba manual de notificación programada con capturas visuales
app.post("/api/settings/schedule/test", async (req, res) => {
  try {
    const { chatId, fecha, modo, incluirAdjuntos } = req.body || {};
    const resultado = await schedulerService.triggerScheduledReport({
      pool,
      isTest: true,
      customChatId: chatId,
      fechaReferencia: fecha || null,
      forzarModo: modo || null,
      incluirAdjuntos: incluirAdjuntos !== undefined ? incluirAdjuntos : true,
    });

    res.json({
      ok: true,
      mensaje: "Reporte con capturas visuales enviado exitosamente al canal de Telegram.",
      resultado,
    });
  } catch (err) {
    console.error("[SCHEDULE TEST ERROR]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================================================
// GESTOR DE DESTINATARIOS Y OFICIALES DE TELEGRAM (POSTGRESQL SEGURO)
// ==========================================================================

// Lista todos los destinatarios registrados e información pública del bot
app.get("/api/telegram/destinatarios", async (req, res) => {
  try {
    const destinatarios = await recipientService.listarDestinatarios(pool);
    let botInfo = null;
    if (process.env.TELEGRAM_BOT_TOKEN) {
      const info = await telegramClient.obtenerInfoBot({ token: process.env.TELEGRAM_BOT_TOKEN });
      if (info && info.username) {
        botInfo = {
          username: info.username,
          first_name: info.first_name,
          link: `https://t.me/${info.username}`,
        };
      }
    }
    res.json({
      ok: true,
      destinatarios: destinatarios.map(d => ({
        ...d,
        chatId: maskSensitiveId(d.chatId)
      })),
      botInfo,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Registra o actualiza un destinatario (Protegido por Clave Institucional)
app.post("/api/telegram/destinatarios", async (req, res) => {
  try {
    const claveEnviada = req.headers["x-ingesta-auth"] || req.body?.clave || req.body?.password;
    const claveEsperada = process.env.INGESTA_PASSWORD;
    if (!claveEnviada || claveEnviada.trim() !== claveEsperada.trim()) {
      return res.status(401).json({
        ok: false,
        error: "Clave de autorización no válida o ausente. Se requiere credencial policial autorizada.",
        codigo: "AUTH_REQUIRED",
      });
    }

    const { nombre, chatId, rolUnidad, activo } = req.body || {};
    const nuevo = await recipientService.agregarDestinatario(pool, {
      nombre,
      chatId,
      rolUnidad,
      activo: activo !== undefined ? activo : true,
    });

    res.json({
      ok: true,
      mensaje: "Destinatario registrado exitosamente en el sistema.",
      destinatario: nuevo,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Alterna el estado (Activo / Pausado) de un destinatario (Protegido por Clave Institucional)
app.patch("/api/telegram/destinatarios/:id/toggle", async (req, res) => {
  try {
    const claveEnviada = req.headers["x-ingesta-auth"] || req.body?.clave || req.body?.password;
    const claveEsperada = process.env.INGESTA_PASSWORD;
    if (!claveEnviada || claveEnviada.trim() !== claveEsperada.trim()) {
      return res.status(401).json({
        ok: false,
        error: "Clave de autorización no válida o ausente. Se requiere credencial policial autorizada.",
        codigo: "AUTH_REQUIRED",
      });
    }

    const { id } = req.params;
    const { activo } = req.body || {};
    const actualizado = await recipientService.toggleEstadoDestinatario(pool, id, activo);

    res.json({
      ok: true,
      mensaje: `Destinatario ${actualizado.activo ? "activado" : "pausado"} exitosamente.`,
      destinatario: actualizado,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Elimina un destinatario del sistema (Protegido por Clave Institucional)
app.delete("/api/telegram/destinatarios/:id", async (req, res) => {
  try {
    const claveEnviada = req.headers["x-ingesta-auth"] || req.body?.clave || req.body?.password;
    const claveEsperada = process.env.INGESTA_PASSWORD;
    if (!claveEnviada || claveEnviada.trim() !== claveEsperada.trim()) {
      return res.status(401).json({
        ok: false,
        error: "Clave de autorización no válida o ausente. Se requiere credencial policial autorizada.",
        codigo: "AUTH_REQUIRED",
      });
    }

    const { id } = req.params;
    const eliminado = await recipientService.eliminarDestinatario(pool, id);

    res.json({
      ok: true,
      mensaje: `Destinatario '${eliminado.nombre}' (${eliminado.chat_id}) eliminado del sistema.`,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Envío de prueba individual inmediata a un destinatario
app.post("/api/telegram/destinatarios/:id/probar", async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await recipientService.enviarPruebaIndividual(pool, id);

    res.json({
      ok: true,
      mensaje: `Mensaje de verificación enviado exitosamente a ${resultado.destinatario.nombre} (${resultado.destinatario.chat_id}).`,
      resultado,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});


// Previsualización directa en el navegador de la captura institucional oficial (PNG)
app.get("/api/reportes/captura-preview", async (req, res) => {
  try {
    const { tipo = "fds_matriz", fecha = null } = req.query;
    const {
      generarCapturaMatrizFinDeSemana,
      generarCapturaDistribucionFinDeSemana,
      generarCapturaDiaria,
    } = require("./reportes/imageReportService");
    const { obtenerReporteFinDeSemana } = require("./reportes/reporteFinDeSemana");
    const { obtenerReporteDiario } = require("./reportes/reporteDiario");

    const periodo = await schedulerService.calcularPeriodoOperativo(pool, {
      fechaReferencia: fecha,
      forzarModo: tipo.startsWith("fds") ? "fds" : tipo === "diario" ? "diario" : null,
    });

    let buffer;
    if (tipo === "fds_distribucion") {
      const rep = await obtenerReporteFinDeSemana(pool, periodo.fechas);
      buffer = await generarCapturaDistribucionFinDeSemana(rep);
    } else if (tipo === "fds_enrolados") {
      const { obtenerDatosAcumulados } = require("./reportes/reporteFinDeSemana");
      const { generarCapturaAcumulado } = require("./reportes/imageReportService");
      const anioActual = new Date().getFullYear();
      const dataAcum = await obtenerDatosAcumulados(pool, { soloEnrolados: true });
      buffer = await generarCapturaAcumulado(dataAcum, {
        titulo: `TOTAL DE ENROLADOS EN EL SISTEMA ABIS ACUMULADO AL AÑO ${anioActual}`,
        tipoFiltro: "ENROLADO",
        anio: anioActual,
      });
    } else if (tipo === "fds_registros") {
      const { obtenerDatosAcumulados } = require("./reportes/reporteFinDeSemana");
      const { generarCapturaAcumulado } = require("./reportes/imageReportService");
      const anioActual = new Date().getFullYear();
      const dataAcum = await obtenerDatosAcumulados(pool, { soloEnrolados: false });
      buffer = await generarCapturaAcumulado(dataAcum, {
        titulo: `TOTAL DE REGISTROS EN EL SISTEMA ABIS ACOMULADO AL AÑO ${anioActual}`,
        tipoFiltro: "TODOS",
        anio: anioActual,
      });
    } else if (tipo === "diario") {
      const rep = await obtenerReporteDiario(pool, periodo.fecha);
      buffer = await generarCapturaDiaria(rep);
    } else {
      // Por defecto fds_matriz (Matriz comparativa de estados del fin de semana)
      const rep = await obtenerReporteFinDeSemana(pool, periodo.fechas);
      buffer = await generarCapturaMatrizFinDeSemana(rep);
    }

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="captura_${tipo}.png"`);
    res.send(buffer);
  } catch (err) {
    console.error("[CAPTURA PREVIEW ERROR]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function maskSensitiveId(id) {
  const s = String(id).trim();
  if (!s) return s;
  // Formato: primeros 4 + *** + últimos 3
  if (s.length <= 7) return "***";
  return s.slice(0, 4) + "***" + s.slice(-3);
}

const { iniciarBot, detenerBot } = require("./telegram/botService");

// Validación de arranque: Asegurar que las variables críticas existan
if (!process.env.INGESTA_PASSWORD) {
  console.error("❌ FALTA INGESTA_PASSWORD - Deteniendo servidor por seguridad");
  process.exit(1);
}

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

  // Inicializar tabla segura de destinatarios y migración inicial si corresponde
  recipientService.inicializarDestinatarios(pool).catch((err) => {
    console.warn("Advertencia al inicializar destinatarios de Telegram:", err.message);
  });

  // Iniciar servicio de horarios y reportes automáticos
  schedulerService.iniciarScheduler({ pool });

  // Iniciar microservicio de Análisis Documental (SIAD)
  iniciarSIAD({

    SIAD_PORT: process.env.SIAD_PORT || '5001',
  });
});

function cerrarServidor() {
  detenerBot();
  detenerSIAD();
  schedulerService.detenerScheduler();
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on("SIGINT", cerrarServidor);
process.on("SIGTERM", cerrarServidor);


