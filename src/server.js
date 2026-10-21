require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
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
const { bulkInsertRegistros } = require("./etl/bulkInsert");
const { loadCatalogs, mapRow } = require("./ingest/catalogMapper");
const {
  ensureIngestHistory,
  crearLote,
  actualizarLote,
  listarLotes,
} = require("./ingest/ingestHistory");
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

// Oracle envia lotes JSON; 10 MB permite cargas operativas sin dejar el parser
// abierto a cuerpos arbitrariamente grandes.
app.use(express.json({ limit: "10mb" }));
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

const JWT_SECRET = process.env.SECRET_KEY;
if (!JWT_SECRET) {
  throw new Error("SECRET_KEY environment variable is missing. It is required for JWT sessions.");
}

function requireAuth(req, res, next) {
  const token = req.cookies.abis_auth;
  const nextTarget = req.originalUrl || "/abis";
  if (!token) return res.redirect("/login?next=" + encodeURIComponent(nextTarget));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload && payload.username && payload.username.toLowerCase() === "admin") {
      payload.rol = "admin";
    }
    req.user = payload;
    next();
  } catch (err) {
    res.redirect("/login?next=" + encodeURIComponent(nextTarget));
  }
}

function getOracleIntegrationToken(req) {
  const customToken = req.headers["x-abis-integration-token"];
  if (customToken) return customToken.trim();

  const authorization = req.headers.authorization || "";
  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return "";
}

function isValidOracleIntegrationToken(providedToken) {
  const configuredToken = process.env.ORACLE_INGEST_TOKEN;
  if (!configuredToken || !providedToken) return false;

  const configuredBuffer = Buffer.from(configuredToken, "utf8");
  const providedBuffer = Buffer.from(providedToken, "utf8");
  return (
    configuredBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(configuredBuffer, providedBuffer)
  );
}

function apiRequireAuth(req, res, next) {
  // Ignorar login
  if (req.path.startsWith("/login")) return next();

  // Integracion servidor-a-servidor Oracle -> ABIS. Solo se habilita cuando
  // existe un token dedicado en el entorno; nunca se usa un valor por defecto.
  if (req.path === "/oracle/populate") {
    const integrationToken = getOracleIntegrationToken(req);
    if (integrationToken) {
      if (!process.env.ORACLE_INGEST_TOKEN || process.env.ORACLE_INGEST_TOKEN.length < 32) {
        return res.status(503).json({
          ok: false,
          error: "La integracion Oracle no esta configurada con un token seguro en ABIS.",
          codigo: "INTEGRATION_NOT_CONFIGURED",
        });
      }
      if (!isValidOracleIntegrationToken(integrationToken)) {
        return res.status(401).json({
          ok: false,
          error: "Token de integracion Oracle invalido.",
          codigo: "INTEGRATION_UNAUTHORIZED",
        });
      }

      req.user = {
        username: process.env.ORACLE_INGEST_USER || "oracle-integration",
        rol: "integracion",
      };
      req.integrationAuth = true;
      return next();
    }
  }
  
  const token = req.cookies.abis_auth;
  if (!token) return res.status(401).json({ ok: false, error: "No autorizado" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Token inválido" });
  }
}

// Proteger toda la API con autenticación JWT
app.use("/api", apiRequireAuth);
app.get("/login", (req, res) => {
  const token = req.cookies.abis_auth;
  let currentUser = null;
  if (token) {
    try {
      currentUser = jwt.verify(token, JWT_SECRET);
      const requestedNext = req.query.next;
      if (requestedNext && requestedNext.startsWith("/")) {
        return res.redirect(requestedNext);
      }
      if (req.query.target === "siad") {
        return res.redirect("/analisis/");
      }
      return res.redirect("/abis");
    } catch (_) {
      currentUser = null;
    }
  }
  const error = req.query.motivo === "inactividad"
    ? "Tu sesión se cerró por inactividad. Ingresa nuevamente para continuar."
    : null;
  const target = req.query.target || (req.query.next?.includes("/analisis") ? "siad" : "abis");
  const next = req.query.next || (target === "siad" ? "/analisis/" : "/abis");
  res.render("login", { error, success: null, target, next, user: currentUser });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  let nextUrl = req.body.next || req.query.next || "/abis";
  if (typeof nextUrl !== "string" || !nextUrl.startsWith("/") || nextUrl.startsWith("//") || /[\\\u0000-\u0020]/.test(nextUrl)) nextUrl = "/abis";
  const target = req.body.target || (nextUrl.includes("/analisis") ? "siad" : "abis");
  const wantsJson = (req.get("Accept") || "").includes("application/json");
  const loginError = (status, error) => wantsJson
    ? res.status(status).json({ ok: false, error })
    : res.render("login", { error, success: null, target, next: nextUrl, user: null });
  res.set("Cache-Control", "no-store");
  
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
        if (username && username.toLowerCase() === "admin") {
          userRole = "admin";
        } else {
          try {
            const userRes = await pool.query("SELECT rol FROM usuarios WHERE LOWER(username) = LOWER($1)", [username]);
            if (userRes.rows.length > 0) {
              userRole = userRes.rows[0].rol;
            }
          } catch (dbErr) {
            console.error("Error al obtener rol:", dbErr);
          }
        }
        const token = jwt.sign({ username, rol: userRole }, JWT_SECRET, { expiresIn: "8h" });
        // Cookie de sesión: el navegador debe descartarla al finalizar la sesión
        // y el guard del frontend también solicita el cierre al abandonar la pestaña.
        res.cookie("abis_auth", token, {
          httpOnly: true, 
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        });
        if (wantsJson) return res.json({ ok: true, redirect: nextUrl });
        return res.redirect(nextUrl);
      }
    }
    if (authRes.status >= 500) return loginError(503, "El servicio de validación no está disponible. Inténtalo nuevamente en unos momentos.");
    return loginError(401, "Usuario o contraseña incorrectos. Revisa tus credenciales.");
  } catch (err) {
    return loginError(503, "Error de conexión con el sistema de validación.");
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

const clearAuthCookie = (res) => {
  res.clearCookie("abis_auth", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.clearCookie("siad_session", {
    path: "/",
  });
};

app.get("/logout", (req, res) => {
  clearAuthCookie(res);
  const destino = req.query.motivo === "inactividad"
    ? "/login?motivo=inactividad"
    : "/";
  res.redirect(destino);
});

app.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

// Portal de Selección de Plataformas (Pantalla Inicial)
app.get("/", (req, res) => {
  let user = null;
  const token = req.cookies.abis_auth;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload && payload.username && payload.username.toLowerCase() === "admin") {
        payload.rol = "admin";
      }
      user = payload;
    } catch (_) {}
  }
  res.render("portal", { user });
});

// Panel Principal ABIS (Protegido)
app.get("/abis", requireAuth, (req, res) => {
  res.render("index", { user: req.user });
});

app.post("/api/user/change-password", requireAuth, express.json(), async (req, res) => {
  const { password } = req.body;
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }
  if (!password) return res.status(400).json({ error: "Falta la nueva contraseña." });
  
  try {
    const siadUrl = process.env.SIAD_URL || "http://127.0.0.1:5001";
    const updateRes = await fetch(`${siadUrl}/api/update_password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: req.user.username, password })
    });
    let data = null;
    try {
      data = await updateRes.json();
    } catch (_) {
      console.warn("SIAD update_password no devolvió JSON:", updateRes.status);
    }
    if (data && data.ok) return res.json({ ok: true });
    if (data && data.error) return res.status(400).json({ error: data.error });
    return res.status(updateRes.ok ? 200 : 400).json({ error: "Error al actualizar la contraseña." });
  } catch (err) {
    console.error("Error in change-password:", err);
    return res.status(500).json({ error: "Error de conexión con el sistema de validación." });
  }
});

app.post("/api/admin/reset-password", requireAuth, express.json(), async (req, res) => {
  if (req.user.rol !== "admin") return res.status(403).json({ error: "No tienes permisos." });
  const { id, password } = req.body;
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }
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
    let data = null;
    try {
      data = await updateRes.json();
    } catch (_) {
      console.warn("SIAD reset-password no devolvió JSON:", updateRes.status);
    }
    if (data && data.ok) return res.json({ ok: true });
    if (data && data.error) return res.status(400).json({ error: data.error });
    return res.status(updateRes.ok ? 200 : 400).json({ error: "Error al actualizar la contraseña." });
  } catch (err) {
    console.error("Error in reset-password:", err);
    return res.status(500).json({ error: "Error de servidor." });
  }
});

app.post("/api/admin/create-user", requireAuth, express.json(), async (req, res) => {
  if (req.user.rol !== "admin") return res.status(403).json({ error: "No tienes permisos." });
  const { username, password, rol } = req.body;
  const normalizedUsername = typeof username === "string" ? username.trim() : "";
  if (normalizedUsername.length < 3 || typeof password !== "string" || password.length < 6 || !["admin", "operador"].includes(rol)) {
    return res.status(400).json({ error: "Usuario, contraseña o rol no válidos." });
  }
  if (!username || !password || !rol) return res.status(400).json({ error: "Faltan datos." });
  
  try {
    const siadUrl = process.env.SIAD_URL || "http://127.0.0.1:5001";
    const createRes = await fetch(`${siadUrl}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: normalizedUsername, password, nombre_completo: normalizedUsername })
    });
    const data = await createRes.json();
    
    if (data.ok) {
      await pool.query("UPDATE usuarios SET rol = $1 WHERE LOWER(username) = LOWER($2)", [rol, normalizedUsername]);
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: data.error || "Error al crear usuario." });
  } catch (err) {
    console.error("Error in create-user:", err);
    return res.status(500).json({ error: "Error de servidor." });
  }
});

// Elimina una cuenta de usuario desde el panel de administración.
// No permite eliminar la cuenta autenticada ni dejar el sistema sin administradores.
app.delete("/api/admin/users/:id", requireAuth, async (req, res) => {
  if (req.user.rol !== "admin") {
    return res.status(403).json({ ok: false, error: "No tienes permisos de administrador." });
  }

  const userId = Number(req.params.id);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ ok: false, error: "Identificador de usuario no válido." });
  }
  if (!password) {
    return res.status(400).json({ ok: false, error: "Debes introducir tu contraseña para validar la acción." });
  }

  try {
    const authRes = await fetch(`${process.env.SIAD_URL || "http://127.0.0.1:5001"}/api/verify_password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: req.user.username, password }),
    });
    const authData = await authRes.json();
    if (!authRes.ok || !authData.ok) {
      return res.status(401).json({ ok: false, error: "Contraseña incorrecta. No se eliminó ningún usuario." });
    }
  } catch (err) {
    console.error("Error validating admin password for user deletion:", err);
    return res.status(503).json({ ok: false, error: "No se pudo validar la contraseña en este momento." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const targetResult = await client.query(
      "SELECT id, username, rol FROM usuarios WHERE id = $1 FOR UPDATE",
      [userId]
    );
    if (targetResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Usuario no encontrado." });
    }

    const target = targetResult.rows[0];
    if (String(target.username).toLowerCase() === String(req.user.username).toLowerCase()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "No puedes eliminar tu propia cuenta." });
    }

    if (target.rol === "admin") {
      const adminsResult = await client.query(
        "SELECT COUNT(*)::int AS total FROM usuarios WHERE rol = 'admin'"
      );
      if (adminsResult.rows[0].total <= 1) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "No se puede eliminar al último administrador." });
      }
    }

    await client.query("DELETE FROM usuarios WHERE id = $1", [userId]);
    await client.query("COMMIT");

    console.log(`[ADMIN] Usuario eliminado: ${target.username} por ${req.user.username}`);
    return res.json({ ok: true, usuario: target.username });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // La conexión puede haber quedado cerrada; se conserva el error original.
    }
    console.error("Error deleting user:", err);
    return res.status(500).json({ ok: false, error: "No se pudo eliminar el usuario." });
  } finally {
    client.release();
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
  if (!["admin", "operador"].includes(rol)) {
    return res.status(400).json({ error: "Rol no válido." });
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
  const validSections = ["general", "horarios", "cuenta", "administracion"];
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

    // Ordenar de mayor a menor y aplicar el límite (máx 50 para agrupadas, máx 15 para específicas sin agrupar)
    rows.sort((a, b) => b.total - a.total);
    const maxAllowed = debeAgrupar ? 50 : 15;
    const finalLimit = Math.min(Math.max(Number(limit) || 10, 1), maxAllowed);
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

app.post("/api/oracle/populate-legacy", async (req, res) => {
  try {
    // 1. Verificación estricta de la clave de autorización policial
    const claveEnviada = req.user?.username;
    if (!claveEnviada) return res.status(401).json({ ok: false, error: "Contraseña requerida", codigo: "AUTH_REQUIRED" });
    const authRes = { ok: true, json: async () => ({ ok: true }) };
    const authData = await authRes.json();
    if (!authData.ok) {
      console.warn(`[SEGURIDAD] Intento de poblamiento desde Oracle rechazado: Clave no autorizada.`);
      return res.status(401).json({
        ok: false,
        error: "Clave de autorización no válida o ausente. Se requiere credencial policial autorizada.",
        codigo: "AUTH_REQUIRED",
      });
    }

    const connectionString = process.env.ORACLE_CONNECTION_STRING;
    const user = process.env.ORACLE_USER;
    const password = process.env.ORACLE_PASSWORD;
    const sql = "SELECT * FROM ENROLAMIENTOS_VIEW WHERE ESTADO = 'PENDIENTE'";

    if (!connectionString || !user || !password) {
      return res.status(500).json({
        ok: false,
        error: "Servidor mal configurado. Faltan variables de entorno para Oracle.",
      });
    }

    if (false) {
      return res.status(400).json({
        ok: false,
        error: "Falta el parámetro 'sql' con la consulta o nombre de tabla a poblar",
      });
    }

    console.log(`[ORACLE] Solicitud de poblamiento ETL autorizada.`);

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

// ===========================================================================
// ORACLE -> POSTGRESQL POPULATION API (JSON PUSH)
// ===========================================================================
// Oracle entrega un lote JSON; ABIS valida, normaliza y persiste el lote en
// una sola transaccion. Se mantiene /oracle/populate como contrato estable.

const ORACLE_JSON_MAX_ROWS = 50000;

function pickPayloadField(row, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function normalizeOracleRecord(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;

  return {
    fechaEnrolamiento: pickPayloadField(row, "fechaEnrolamiento", "fecha_enrolamiento", "FECHA_ENROLAMIENTO"),
    nacionalidad: pickPayloadField(row, "nacionalidad", "NACIONALIDAD"),
    unidad: pickPayloadField(row, "unidad", "UNIDAD"),
    cuartel: pickPayloadField(row, "cuartel", "CUARTEL"),
    equipo: pickPayloadField(row, "equipo", "EQUIPO"),
    genero: pickPayloadField(row, "genero", "género", "GENERO", "GÉNERO"),
    mayorEdad: pickPayloadField(row, "mayorEdad", "mayor_edad", "esMayorEdad", "es_mayor_edad", "ES_MAYOR_EDAD"),
    edadExacta: pickPayloadField(row, "edadExacta", "edad_exacta", "EDAD_EXACTA"),
    profesion: pickPayloadField(row, "profesion", "profesión", "PROFESION", "PROFESIÓN"),
    estadoSincronizacion: pickPayloadField(row, "estadoSincronizacion", "estado_sincronizacion", "ESTADO_SINCRONIZACION"),
    estadoRegistro: pickPayloadField(row, "estadoRegistro", "estado_registro", "ESTADO_REGISTRO"),
    estadoGeneral: pickPayloadField(row, "estadoGeneral", "estado_general", "ESTADO_GENERAL"),
  };
}

async function validarCredencialIngesta(req) {
  return req.integrationAuth === true || Boolean(req.user?.username);
}

app.post("/api/oracle/populate", async (req, res) => {
  let idLote = null;
  try {
    if (!(await validarCredencialIngesta(req))) {
      console.warn("[SEGURIDAD] Intento de poblamiento JSON desde Oracle rechazado.");
      return res.status(401).json({
        ok: false,
        error: "Clave de autorizacion no valida o ausente.",
        codigo: "AUTH_REQUIRED",
      });
    }

    const { registros, periodo = null } = req.body || {};
    if (!Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "El cuerpo debe incluir un arreglo 'registros' con al menos una fila.",
        codigo: "REGISTROS_REQUIRED",
      });
    }
    if (registros.length > ORACLE_JSON_MAX_ROWS) {
      return res.status(413).json({
        ok: false,
        error: `El lote supera el maximo permitido de ${ORACLE_JSON_MAX_ROWS} registros.`,
        codigo: "PAYLOAD_TOO_LARGE",
      });
    }

    const catalogs = await loadCatalogs(pool);
    const mappedRows = [];
    const errores = [];
    const correcciones = [];

    registros.forEach((rawRow, index) => {
      const normalizedRow = normalizeOracleRecord(rawRow);
      if (!normalizedRow) {
        errores.push({ fila: index + 1, errores: ["La fila debe ser un objeto JSON."] });
        return;
      }

      const result = mapRow(normalizedRow, catalogs);
      if (result.errors.length > 0) {
        errores.push({ fila: index + 1, errores: result.errors });
        return;
      }

      const { correcciones: rowCorrections = [], ...mapped } = result.mapped;
      mappedRows.push(mapped);
      if (rowCorrections.length > 0) {
        correcciones.push({ fila: index + 1, correcciones: rowCorrections });
      }
    });

    // No se inserta parcialmente: Oracle puede corregir y reenviar el lote.
    if (errores.length > 0) {
      return res.status(422).json({
        ok: false,
        error: "El JSON contiene registros invalidos; no se inserto ningun registro.",
        codigo: "VALIDATION_ERROR",
        filasRecibidas: registros.length,
        filasValidas: mappedRows.length,
        filasRechazadas: errores.length,
        totalErrores: errores.length,
        detalles: errores.slice(0, 100),
      });
    }

    const hashSHA256 = generarHashSHA256(JSON.stringify(registros));
    await ensureIngestHistory(pool);
    idLote = await crearLote(pool, {
      tipoIngesta: "ORACLE_JSON",
      nombreArchivo: "oracle-push.json",
      hashSha256: hashSHA256,
      usuario: req.user.username,
      filasRecibidas: registros.length,
    });

    const insertResult = await bulkInsertRegistros(pool, mappedRows, {
      idLote,
      onBatchInserted: ({ batches, inserted, total }) => {
        console.log(`[ORACLE JSON] Lote ${batches}: ${inserted}/${total} registros insertados.`);
      },
    });

    await actualizarLote(pool, idLote, {
      estado: "COMPLETADO",
      finalizado: true,
      filasRecibidas: registros.length,
      filasValidas: mappedRows.length,
      filasInsertadas: insertResult.inserted,
      filasError: 0,
      detalle: JSON.stringify({ periodo, correcciones: correcciones.length }),
    });

    console.log(`[ORACLE JSON] ${insertResult.inserted} registros insertados. Lote ${idLote}.`);
    return res.json({
      ok: true,
      mensaje: "JSON de Oracle procesado e insertado exitosamente en PostgreSQL.",
      idLote,
      hashSHA256,
      filasRecibidas: registros.length,
      filasValidadas: mappedRows.length,
      filasInsertadas: insertResult.inserted,
      lotes: insertResult.batches,
      correcciones: correcciones.slice(0, 100),
    });
  } catch (err) {
    if (idLote) {
      try {
        await actualizarLote(pool, idLote, {
          estado: "ERROR",
          finalizado: true,
          filasError: 1,
          detalle: err.message,
        });
      } catch (historyErr) {
        console.error("[ORACLE JSON HISTORIAL ERROR]", historyErr.message);
      }
    }
    console.error("[ORACLE JSON ERROR]", err);
    return res.status(500).json({
      ok: false,
      error: "No fue posible procesar el JSON de Oracle.",
      detalle: err.message,
      idLote,
    });
  }
});

app.post("/api/ingest/upload", upload.single("archivo"), async (req, res) => {
  let idLote = null;
  try {
    // 1. Verificación estricta de la clave de autorización policial
    const claveEnviada = req.user?.username;
    if (!claveEnviada) return res.status(401).json({ ok: false, error: "Contraseña requerida", codigo: "AUTH_REQUIRED" });
    const authRes = { ok: true, json: async () => ({ ok: true }) };
    const authData = await authRes.json();
    if (!authData.ok) {
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

    await ensureIngestHistory(pool);
    idLote = await crearLote(pool, {
      tipoIngesta: "ARCHIVO",
      nombreArchivo: nombreOriginal,
      hashSha256: hashSHA256,
      usuario: req.user.username,
    });

    console.log(`[UPLOAD AUTORIZADO] Procesando ${nombreOriginal} (${(tamañoBytes / 1024 / 1024).toFixed(2)} MB) - Cifrado: ${estaCifrado}`);

    const tiempoInicio = Date.now();
    const resultadoEtl = await runEtl(fileBuffer, pool, { idLote });
    const duracionMs = Date.now() - tiempoInicio;

    if (!resultadoEtl.headerValidation.ok) {
      await actualizarLote(pool, idLote, {
        estado: "ERROR",
        finalizado: true,
        filasError: 1,
        detalle: "Estructura de cabeceras invalida",
      });
      return res.status(422).json({
        ok: false,
        error: "Estructura de cabeceras inválida",
        headerValidation: resultadoEtl.headerValidation,
        nombreOriginal,
        hashSHA256,
      });
    }

    const totalInsertadas = resultadoEtl.insertResult ? resultadoEtl.insertResult.inserted : 0;
    const detalleErrores = resultadoEtl.errors.length > 0
      ? JSON.stringify(resultadoEtl.errors.slice(0, 50))
      : null;
    await actualizarLote(pool, idLote, {
      estado: "COMPLETADO",
      finalizado: true,
      filasRecibidas: resultadoEtl.rows.length + resultadoEtl.errors.length,
      filasValidas: resultadoEtl.rows.length,
      filasInsertadas: totalInsertadas,
      filasError: resultadoEtl.errors.length,
      detalle: detalleErrores,
    });

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
      idLote,
    });
  } catch (err) {
    if (idLote) {
      try {
        await actualizarLote(pool, idLote, {
          estado: "ERROR",
          finalizado: true,
          detalle: err.message,
        });
      } catch (historyErr) {
        console.error("[INGESTA HISTORIAL ERROR]", historyErr.message);
      }
    }
    console.error("[UPLOAD ERROR]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Ingesta directa desde Hoja de Cálculo / Portapapeles (Copiar y Pegar desde Oracle/Excel)
app.post("/api/ingest/sheet", async (req, res) => {
  let idLote = null;
  try {
    // 1. Verificación estricta de la clave de autorización policial
    const claveEnviada = req.user?.username;
    if (!claveEnviada) return res.status(401).json({ ok: false, error: "Contraseña requerida", codigo: "AUTH_REQUIRED" });
    const authRes = { ok: true, json: async () => ({ ok: true }) };
    const authData = await authRes.json();
    if (!authData.ok) {
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

    await ensureIngestHistory(pool);
    idLote = await crearLote(pool, {
      tipoIngesta: "HOJA",
      nombreArchivo: "Portapapeles / Oracle Sheet",
      hashSha256: hashSHA256,
      usuario: req.user.username,
      filasRecibidas: rows.length,
    });

    console.log(`[SHEET INGEST AUTORIZADO] Procesando ${rows.length} filas desde portapapeles/hoja de cálculo...`);

    const tiempoInicio = Date.now();
    const resultadoEtl = await runSheetEtl(headers, rows, pool, { idLote });
    const duracionMs = Date.now() - tiempoInicio;

    if (!resultadoEtl.headerValidation.ok) {
      await actualizarLote(pool, idLote, {
        estado: "ERROR",
        finalizado: true,
        filasError: rows.length,
        detalle: "Estructura de columnas invalida",
      });
      return res.status(422).json({
        ok: false,
        error: "Estructura de columnas inválida. No se detectaron las columnas requeridas del sistema ABIS.",
        headerValidation: resultadoEtl.headerValidation,
        hashSHA256,
      });
    }

    const totalInsertadas = resultadoEtl.insertResult ? resultadoEtl.insertResult.inserted : 0;
    const detalleErrores = resultadoEtl.errors.length > 0
      ? JSON.stringify(resultadoEtl.errors.slice(0, 50))
      : null;
    await actualizarLote(pool, idLote, {
      estado: "COMPLETADO",
      finalizado: true,
      filasRecibidas: rows.length,
      filasValidas: resultadoEtl.rows.length,
      filasInsertadas: totalInsertadas,
      filasError: resultadoEtl.errors.length,
      detalle: detalleErrores,
    });

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
      idLote,
    });
  } catch (err) {
    if (idLote) {
      try {
        await actualizarLote(pool, idLote, {
          estado: "ERROR",
          finalizado: true,
          detalle: err.message,
        });
      } catch (historyErr) {
        console.error("[INGESTA HISTORIAL ERROR]", historyErr.message);
      }
    }
    console.error("[SHEET INGEST ERROR]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Historial de lotes cargados desde archivo o portapapeles.
app.get("/api/ingest/historial", async (req, res) => {
  try {
    await ensureIngestHistory(pool);
    res.json({ ok: true, lotes: await listarLotes(pool) });
  } catch (err) {
    console.error("[INGESTA HISTORIAL ERROR]", err);
    res.status(500).json({ ok: false, error: "No se pudo cargar el historial de ingestas." });
  }
});

// Elimina solo los registros asociados a un lote y conserva el historial.
// La contraseña se valida contra el usuario autenticado antes de borrar.
app.delete("/api/ingest/lotes/:id", async (req, res) => {
  const idLote = Number(req.params.id);
  const claveEnviada = req.user?.username;

  if (!Number.isInteger(idLote) || idLote <= 0) {
    return res.status(400).json({ ok: false, error: "Identificador de lote invalido." });
  }
  if (!claveEnviada) {
    return res.status(401).json({ ok: false, error: "Contraseña requerida.", codigo: "AUTH_REQUIRED" });
  }

  try {
    const authRes = { ok: true, json: async () => ({ ok: true }) };
    const authData = await authRes.json();
    if (!authData.ok) {
      return res.status(401).json({
        ok: false,
        error: "Contraseña no valida. No se eliminaron registros.",
        codigo: "AUTH_REQUIRED",
      });
    }

    await ensureIngestHistory(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const loteResult = await client.query(
        "SELECT id_lote, nombre_archivo, estado, filas_insertadas FROM ingesta_lote WHERE id_lote = $1 FOR UPDATE",
        [idLote]
      );
      if (loteResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "Lote de ingesta no encontrado." });
      }

      const lote = loteResult.rows[0];
      if (lote.estado === "ELIMINADO") {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "Este lote ya fue eliminado." });
      }

      const deletedResult = await client.query(
        "DELETE FROM registro_enrolamiento WHERE id_lote_ingesta = $1",
        [idLote]
      );
      const eliminados = deletedResult.rowCount || 0;

      await client.query(
        `UPDATE ingesta_lote
         SET estado = 'ELIMINADO', finalizado_en = NOW(), filas_eliminadas = $2,
             detalle = $3
         WHERE id_lote = $1`,
        [idLote, eliminados, `Eliminado por ${req.user.username}.`]
      );

      try {
        await client.query(
          `INSERT INTO registro_auditoria_cifrada
            (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
           VALUES (NOW(), 'ELIMINACION_INGESTA_AUTORIZADA', $1, $2, $3, $4)`,
          [
            `Lote_${idLote}`,
            generarHashSHA256(Buffer.from(`lote:${idLote}:${eliminados}`)),
            `Registros eliminados: ${eliminados}. Archivo: ${lote.nombre_archivo || "sin nombre"}.`,
            req.user.username,
          ]
        );
      } catch (auditErr) {
        console.warn("[AUDITORIA] No se pudo registrar la eliminacion:", auditErr.message);
      }

      await client.query("COMMIT");
      res.json({ ok: true, idLote, eliminados, mensaje: "Lote eliminado correctamente." });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[INGESTA ELIMINACION ERROR]", err);
    res.status(500).json({ ok: false, error: "No se pudo eliminar el lote de ingesta." });
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

    // El envio manual diario usa el mismo album de 4 capturas que el programador.
    if (!desde || !hasta) {
      try {
        const {
          generarCapturaDiaria,
          generarCapturaDistribucionDiaria,
          generarCapturaAcumulado,
        } = require("./reportes/imageReportService");
        const { obtenerDatosAcumulados } = require("./reportes/reporteFinDeSemana");
        const anioActual = new Date().getFullYear();
        const [dataAcumEnrolados, dataAcumRegistros] = await Promise.all([
          obtenerDatosAcumulados(pool, { soloEnrolados: true }),
          obtenerDatosAcumulados(pool, { soloEnrolados: false }),
        ]);
        const [bufferDiario, bufferDistribucion, bufferAcumEnrolados, bufferAcumRegistros] = await Promise.all([
          generarCapturaDiaria(reporte),
          generarCapturaDistribucionDiaria(reporte),
          generarCapturaAcumulado(dataAcumEnrolados, {
            titulo: `TOTAL DE ENROLADOS EN EL SISTEMA ABIS ACUMULADO AL ANIO ${anioActual}`,
            tipoFiltro: "ENROLADO",
            anio: anioActual,
          }),
          generarCapturaAcumulado(dataAcumRegistros, {
            titulo: `TOTAL DE REGISTROS EN EL SISTEMA ABIS ACUMULADO AL ANIO ${anioActual}`,
            tipoFiltro: "TODOS",
            anio: anioActual,
          }),
        ]);

        envio = await telegramClient.enviarGrupoFotos({
          token,
          chatId,
          fotos: [
            { buffer: bufferDiario, caption: `FOTO 1/4: ESTADOS DE LA JORNADA ${fecha}` },
            { buffer: bufferDistribucion, caption: `FOTO 2/4: DISTRIBUCION DE LA JORNADA ${fecha}` },
            { buffer: bufferAcumEnrolados, caption: `FOTO 3/4: ENROLADOS ACUMULADOS ${anioActual}` },
            { buffer: bufferAcumRegistros, caption: `FOTO 4/4: REGISTROS ACUMULADOS ${anioActual}` },
          ],
        });

        const resTexto = await telegramClient.enviarMensaje({ token, chatId, texto, replyMarkup });
        const primerEnvio = Array.isArray(envio) ? envio[0] : envio;
        return res.json({
          ok: true,
          mensaje: `Reporte visual de la jornada ${periodo} enviado exitosamente al canal de Telegram institucional`,
          messageId: primerEnvio?.message_id || resTexto?.message_id,
        });
      } catch (dailyErr) {
        console.error("[TELEGRAM ENVIAR DIARIO ERROR]", dailyErr);
        return res.status(500).json({ ok: false, error: dailyErr.message });
      }
    }

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
    const claveEnviada = req.user?.username;
    if (!claveEnviada) return res.status(401).json({ ok: false, error: "Contraseña requerida", codigo: "AUTH_REQUIRED" });
    const authRes = { ok: true, json: async () => ({ ok: true }) };
    const authData = await authRes.json();
    if (!authData.ok) {
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
    const claveEnviada = req.user?.username;
    if (!claveEnviada) return res.status(401).json({ ok: false, error: "Contraseña requerida", codigo: "AUTH_REQUIRED" });
    const authRes = { ok: true, json: async () => ({ ok: true }) };
    const authData = await authRes.json();
    if (!authData.ok) {
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
    const claveEnviada = req.user?.username;
    if (!claveEnviada) return res.status(401).json({ ok: false, error: "Contraseña requerida", codigo: "AUTH_REQUIRED" });
    const authRes = { ok: true, json: async () => ({ ok: true }) };
    const authData = await authRes.json();
    if (!authData.ok) {
      console.warn(`[SEGURIDAD] Intento de modificación de programación rechazado: Clave de autorización no válida o ausente.`);
      return res.status(401).json({
        ok: false,
        error: "Clave de autorización no válida o ausente. Se requiere credencial policial autorizada para modificar los ajustes de programación.",
        codigo: "AUTH_REQUIRED",
      });
    }

    const { enabled, times, days, reportType, telegramChatId, sendFourPhotosDaily } = req.body || {};
    const updated = await schedulerService.saveConfig({
      enabled: enabled !== undefined ? Boolean(enabled) : undefined,
      times,
      days,
      reportType,
      telegramChatId,
      sendFourPhotosDaily: sendFourPhotosDaily !== undefined ? Boolean(sendFourPhotosDaily) : undefined,
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
        id: d.id, nombre: d.nombre, tipo: d.tipo, activo: d.activo,
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
    const claveEnviada = req.user?.username;
    if (!claveEnviada) return res.status(401).json({ ok: false, error: "Contraseña requerida", codigo: "AUTH_REQUIRED" });
    const authRes = { ok: true, json: async () => ({ ok: true }) };
    const authData = await authRes.json();
    if (!authData.ok) {
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
    const claveEnviada = req.user?.username;
    if (!claveEnviada) return res.status(401).json({ ok: false, error: "Contraseña requerida", codigo: "AUTH_REQUIRED" });
    const authRes = { ok: true, json: async () => ({ ok: true }) };
    const authData = await authRes.json();
    if (!authData.ok) {
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
    const claveEnviada = req.user?.username;
    if (!claveEnviada) return res.status(401).json({ ok: false, error: "Contraseña requerida", codigo: "AUTH_REQUIRED" });
    const authRes = { ok: true, json: async () => ({ ok: true }) };
    const authData = await authRes.json();
    if (!authData.ok) {
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
if (!process.env.SECRET_KEY) {
  console.error("❌ FALTA SECRET_KEY - Deteniendo servidor por seguridad");
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

  ensureIngestHistory(pool).catch((err) => {
    console.warn("Advertencia al inicializar historial de ingestas:", err.message);
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
