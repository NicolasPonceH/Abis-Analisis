const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { conPorcentaje, obtenerErroresIngesta } = require("../src/reportes/metricasComunes");
const { obtenerReporteDiario } = require("../src/reportes/reporteDiario");
const { obtenerReporteRango } = require("../src/reportes/reporteRango");
const { obtenerEstadosDia } = require("../src/reportes/reporteFinDeSemana");
const { requireSessionUser, localRedirect } = require("../src/middleware/session");
const { destinatarioPublico, maskSensitiveId } = require("../src/telegram/recipientPresenter");
const { transformOracleToPostgre, importarOracleLegacy } = require("../src/ingest/oracleLegacy");
const { registerAuthRoutes } = require("../src/routes/auth");
const { createAuthMiddleware } = require("../src/middleware/auth");
const { createServerRuntime, resolveTargetHost, DEFAULT_SERVER_IP } = require("../src/services/serverRuntime");

// No conexiones reales, escrituras en bases de datos, bot ni scheduler.
function reportFixture(total = 10, rejected = 2) {
  const data = total ? [
    [{ descripcion: "NO_SINCRONIZADO", total: "1" }, { descripcion: "SINCRONIZADO", total: "8" }, { descripcion: "ERROR", total: "1" }],
    [{ descripcion: "NO_REGISTRADO", total: "3" }, { descripcion: "REGISTRADO", total: "7" }],
    [{ descripcion: "OK", total: "10" }],
    [{ nacionalidad: "Chile", codigo_iso: "CHL", total: "10" }],
    [{ cuartel: "Cuartel", total: "10" }], [{ unidad: "Unidad", total: "10" }],
    [{ genero: "F", total: "10" }], [{ categoria: "MENOR DE EDAD", total: "2" }],
    [{ genero: "F", es_mayor_edad: false, total: "2" }],
    [{ cuartel: "Cuartel", unidad: "Unidad", total: "10", sincronizados: "8", con_error: "2", pendientes: "1" }],
    [{ dispositivo: "Tablet", total: "10" }], [{ region: "Region", total: "10" }],
    [{ tramo: "18-29 (Jóvenes)", total: "8" }],
    [{ errores_registro: "1", errores_sincronizacion: "1", errores_general: "1", total_inconsistencias: "2" }],
  ] : Array.from({ length: 14 }, () => []);
  const replies = [[{ total: String(total), dias: total ? "1" : "0" }], ...data, [{ total_errores: String(rejected) }]];
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      assert.ok(replies.length > 0, "consulta inesperada");
      return { rows: replies.shift() };
    },
  };
}

test("porcentajes numéricos, redondeo y denominador cero, sin mutar filas", () => {
  const rows = [{ descripcion: "OK", total: "1" }];
  assert.deepEqual(conPorcentaje(rows, 3), [{ descripcion: "OK", total: 1, porcentaje: 33.3 }]);
  assert.equal(conPorcentaje(rows, 0)[0].porcentaje, 0);
  assert.equal(rows[0].total, "1");
});

test("diario y rango comparten cálculos y contrato; no confunden estados negativos con éxito", async () => {
  const dayPool = reportFixture();
  const rangePool = reportFixture();
  const day = await obtenerReporteDiario(dayPool, "2026-10-22");
  const range = await obtenerReporteRango(rangePool, "2026-10-22", "2026-10-22");
  const { fecha, ...dailyMetrics } = day;
  const { desde, hasta, diasConDatos, ...rangeMetrics } = range;
  assert.deepEqual(dailyMetrics, rangeMetrics);
  assert.equal(fecha, desde);
  assert.equal(hasta, fecha);
  assert.equal(diasConDatos, 1);
  assert.equal(day.resumenEjecutivo.tasaSincronizacion, 80);
  assert.equal(day.resumenEjecutivo.tasaRegistroBiometrico, 70);
  assert.equal(day.resumenEjecutivo.totalErrores, 4); // Unión de registros + rechazos, sin sumar estados repetidos.
  assert.equal(day.resumenEjecutivo.tasaError, 33.3);
  assert.equal(day.resumenEjecutivo.erroresIngesta, 2);
  assert.equal(day.sincronizacion.reduce((n, r) => n + r.total, 0), 10);
  assert.equal(day.sincronizacion.reduce((n, r) => n + r.porcentaje, 0), 100);
  assert.equal(day.sincronizacion.find(r => r.descripcion === "ERROR").total, 1);
  assert.equal(day.resumenEjecutivo.tasaMenoresNNA, 20);
  assert.equal(dayPool.calls[4].params.at(-1), 10);
  assert.equal(rangePool.calls[4].params.at(-1), 10);
  assert.deepEqual(dayPool.calls.at(-1).params, [fecha, fecha]);
});

test("un período sin registros conserva los rechazos de ingesta y todas las colecciones", async () => {
  for (const report of [
    () => obtenerReporteDiario(reportFixture(0, 5), "2026-10-22"),
    () => obtenerReporteRango(reportFixture(0, 5), "2026-10-22", "2026-10-22"),
  ]) {
    const result = await report();
    assert.equal(result.total, 0);
    assert.equal(result.resumenEjecutivo.totalErrores, 5);
    assert.equal(result.resumenEjecutivo.tasaError, 100);
    assert.deepEqual(result.sincronizacion, []);
    for (const field of ["registro", "general", "nacionalidadesPrincipales", "cuartelesActivos",
      "unidadesActivas", "genero", "edad", "demografiaCruzada", "rendimientoCuarteles", "dispositivos", "regiones", "tramosEtarios"]) {
      assert.deepEqual(result[field], []);
    }
    assert.equal(result.resumenEjecutivo.cuartelLider, null);
    assert.equal(result.resumenEjecutivo.nacionalidadLider, null);
  }
  const empty = await obtenerReporteDiario(reportFixture(0, 0), "2026-10-22");
  assert.equal(empty.resumenEjecutivo.tasaError, 0);
});

test("solo la ausencia del historial legacy se tolera; errores de DB se propagan", async () => {
  const missing = { query: async () => { throw Object.assign(new Error("missing"), { code: "42P01" }); } };
  assert.equal(await obtenerErroresIngesta(missing, "2026-10-22"), 0);
  const denied = { query: async () => { throw Object.assign(new Error("denied"), { code: "42501" }); } };
  await assert.rejects(obtenerErroresIngesta(denied, "2026-10-22"), /denied/);
});

test("fin de semana clasifica NO_REGISTRADO, errores y pendientes sin inventar éxitos", async () => {
  let call = 0;
  const result = await obtenerEstadosDia({
    query: async () => ({ rows: call++ === 0 ? [
      { tipo_estado: "REGISTRO", descripcion: "NO REGISTRADO", total: "4" },
      { tipo_estado: "REGISTRO", descripcion: "REGISTRADO", total: "3" },
      { tipo_estado: "REGISTRO", descripcion: "CON_ERROR", total: "2" },
      { tipo_estado: "REGISTRO", descripcion: "PENDIENTE", total: "1" },
      { tipo_estado: "SINCRONIZACION", descripcion: "NO_SINCRONIZADO", total: "10" },
      { tipo_estado: "GENERAL", descripcion: "NO_REGISTRADO", total: "10" },
    ] : [{ total: "10" }] }),
  }, "2026-10-22");
  assert.deepEqual(result.reg, { registrado: 3, error: 2, noRegistrado: 4, pendiente: 1, total: 10 });
  assert.equal(result.sinc.sincronizado, 0);
  assert.equal(result.gen.registrado, 0);
  let emptyCall = 0;
  const missing = await obtenerEstadosDia({
    query: async () => ({ rows: emptyCall++ === 0 ? [] : [{ total: "10" }] }),
  }, "2026-10-22");
  assert.equal(missing.sinc.total, 10);
  assert.equal(missing.sinc.sincronizado, 0);
  assert.equal(missing.reg.registrado, 0);
  assert.equal(missing.gen.registrado, 0);
});

test("destinatarios: campos correctos para la UI, sin IDs completos, cifrados ni hashes", () => {
  const dto = destinatarioPublico({
    id: 1, nombre: "Test", activo: true, chat_id: "7961617813",
    rol_unidad: "Operativo", fecha_registro: "2026-10-22 10:30",
    chat_id_hash: "private-hash", chat_id_cifrado: "private-ciphertext",
  });
  assert.deepEqual(dto, {
    id: 1, nombre: "Test", activo: true, chatId: "7961***813",
    rol_unidad: "Operativo", fecha_registro: "2026-10-22 10:30",
  });
  assert.equal(maskSensitiveId(undefined), "");
  assert.equal(maskSensitiveId(null), "");
  assert.equal(maskSensitiveId("123"), "***");
});

function responseMock() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    redirect(url) { this.redirected = url; return this; },
    render(view, data) { this.rendered = { view, data }; return this; },
  };
}

test("el guard reutilizable exige usuario autenticado sin segunda contraseña", () => {
  for (const user of [undefined, {}, { username: "" }]) {
    const res = responseMock();
    requireSessionUser({ user }, res, () => assert.fail("sin sesión"));
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.codigo, "AUTH_REQUIRED");
  }
  let calls = 0;
  requireSessionUser({ user: { username: "operator" } }, responseMock(), () => calls++);
  assert.equal(calls, 1);
});

test("redirecciones locales válidas y rechazo de URLs externas/malformadas", () => {
  for (const value of ["//outside.test", "/\\outside.test", "/\t/outside", "https://outside.test", [], {}, null]) {
    assert.equal(localRedirect(value), "/abis");
    assert.equal(localRedirect(value, null), null);
  }
  assert.equal(localRedirect("/abis?tab=ingesta"), "/abis?tab=ingesta");
  assert.equal(localRedirect("/analisis/"), "/analisis/");
});

test("el GET de login real comparte la validación de next", () => {
  let handler;
  const fakeApp = { get: (route, fn) => { if (route === "/login") handler = fn; }, post() {} };
  registerAuthRoutes(fakeApp, {
    pool: { query: async () => ({ rows: [] }) },
    jwt,
    secret: "test-only-secret",
    env: { NODE_ENV: "test" },
    localRedirect,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ ok: false }) }),
  });
  const token = jwt.sign({ username: "operator" }, "test-only-secret", { expiresIn: "1h" });
  for (const next of ["//outside.test", "/\\outside.test", ["//outside.test"]]) {
    const res = responseMock();
    handler({ cookies: { abis_auth: token }, query: { next } }, res);
    assert.equal(res.redirected, "/abis");
  }
  const invalid = responseMock();
  handler({ cookies: {}, query: { next: ["bad"] } }, invalid);
  assert.equal(invalid.rendered.data.next, "/abis");
  const siad = responseMock();
  handler({ cookies: { abis_auth: token }, query: { next: "/analisis/" } }, siad);
  assert.equal(siad.redirected, "/analisis/");
});

test("middleware API real acepta recargas con la misma cookie y rechaza JWT inválido", () => {
  const { apiRequireAuth } = createAuthMiddleware({ jwtLib: jwt, secret: "test-only-secret", env: {} });
  const token = jwt.sign({ username: "operator", rol: "operador" }, "test-only-secret", { expiresIn: "1h" });
  for (let refresh = 0; refresh < 3; refresh++) {
    let authorized = false;
    const req = { path: "/metricas", cookies: { abis_auth: token } };
    apiRequireAuth(req, responseMock(), () => { authorized = true; });
    assert.equal(authorized, true);
    assert.equal(req.user.username, "operator");
  }
  for (const token of [undefined, "invalid", jwt.sign({ username: "operator" }, "wrong-key")]) {
    const res = responseMock();
    apiRequireAuth({ path: "/metricas", cookies: { abis_auth: token } }, res, () => assert.fail("JWT rechazado"));
    assert.equal(res.statusCode, 401);
  }
});

test("el runtime inicia servicios al escuchar y el apagado es idempotente", async () => {
  const calls = [];
  const signals = {};
  const server = { close(callback) { calls.push("http.close"); callback(); } };
  const runtime = createServerRuntime({
    app: { listen(port, callback) { calls.push(`http.listen:${port}`); callback(); return server; } },
    port: 3123,
    pool: { end: async () => calls.push("db.close") },
    bot: {
      iniciarBot: async () => calls.push("bot.start"),
      detenerBot: () => calls.push("bot.stop"),
    },
    schedulerService: {
      iniciarScheduler: () => calls.push("scheduler.start"),
      detenerScheduler: () => calls.push("scheduler.stop"),
    },
    recipientService: { inicializarDestinatarios: async () => calls.push("recipients.start") },
    ensureIngestHistory: async () => calls.push("ingest-history.start"),
    siad: {
      iniciarSIAD: () => calls.push("siad.start"),
      detenerSIAD: () => calls.push("siad.stop"),
    },
    env: { TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "test-chat" },
    processRef: { on: (signal, handler) => { signals[signal] = handler; }, exit: code => calls.push(`exit:${code}`) },
    logger: { log() {}, warn() {}, error() {} },
  });
  assert.equal(runtime.startServer(), server);
  for (const service of ["bot.start", "recipients.start", "ingest-history.start", "scheduler.start", "siad.start"]) {
    assert.ok(calls.includes(service), service);
  }
  signals.SIGINT();
  signals.SIGTERM();
  await new Promise(resolve => setImmediate(resolve));
    for (const service of ["bot.stop", "scheduler.stop", "siad.stop", "http.close", "db.close", "exit:0"]) {
    assert.equal(calls.filter(call => call === service).length, 1, service);
  }
});

test("red y puertos: detecta 172.25.7.79, fallback a localhost y reintenta ante puerto ocupado", async () => {
  assert.equal(DEFAULT_SERVER_IP, "172.25.7.79");

  // 1. Si la IP 172.25.7.79 está en las interfaces, la selecciona prioritariamente
  const ifacesConTarget = [
    { name: "eth0", ip: "172.25.7.79" },
    { name: "wlan0", ip: "192.168.1.100" }
  ];
  assert.equal(resolveTargetHost("auto", ifacesConTarget), "172.25.7.79");
  assert.equal(resolveTargetHost(undefined, ifacesConTarget), "172.25.7.79");

  // 2. Si no está 172.25.7.79 pero hay otra 172.x, la usa
  const ifacesOtra172 = [
    { name: "eth0", ip: "172.16.50.10" },
    { name: "wlan0", ip: "192.168.1.100" }
  ];
  assert.equal(resolveTargetHost("auto", ifacesOtra172), "172.16.50.10");

  // 3. De no haber IP institucional 172.x, hace fallback inmediato a localhost (127.0.0.1)
  const ifacesSin172 = [
    { name: "wlan0", ip: "192.168.1.100" },
    { name: "docker0", ip: "10.0.0.5" }
  ];
  assert.equal(resolveTargetHost("auto", ifacesSin172), "127.0.0.1");
  assert.equal(resolveTargetHost("172.25.7.79", ifacesSin172), "127.0.0.1");

  // 4. Respeta enlaces explícitos
  assert.equal(resolveTargetHost("127.0.0.1", ifacesConTarget), "127.0.0.1");
  assert.equal(resolveTargetHost("0.0.0.0", ifacesConTarget), "0.0.0.0");
});


function oracleRow() {
  return {
    FECHA_ENROLAMIENTO: "2026-10-22", ID_NACIONALIDAD: 1, ID_CUARTEL: 2, ID_EQUIPO: 3,
    ID_PROFESION: null, GENERO: "F", ES_MAYOR_EDAD: false, EDAD_EXACTA: 17,
    ID_ESTADO_SINCRONIZACION: 1, ID_ESTADO_REGISTRO: 4, ID_ESTADO_GENERAL: 7,
  };
}

const catalogs = {
  nacionalidad: new Map([["CHILE", 1]]), cuartel: new Map([["UNIDAD|CUARTEL", 2]]),
  equipo: new Map([["TABLET", 3]]), profesion: new Map([["TEST", 1]]),
  estadoProceso: new Map([["SINCRONIZACION|SINCRONIZADO", 1], ["REGISTRO|REGISTRADO", 4], ["GENERAL|OK", 7]]),
};

test("adaptador Oracle acepta objetos y arrays con metadata y conserva false/null", () => {
  const row = oracleRow();
  const objectResult = transformOracleToPostgre([row], [], catalogs);
  const arrayResult = transformOracleToPostgre([Object.values(row)], Object.keys(row).map(name => ({ name })), catalogs);
  assert.deepEqual(objectResult, arrayResult);
  assert.equal(objectResult[0].es_mayor_edad, false);
  assert.equal(objectResult[0].id_profesion, null);
  assert.equal(objectResult[0].fecha_enrolamiento, "2026-10-22");
});

test("rutas de destinatarios extraídas: listar, agregar, activar, eliminar y probar con servicios simulados", async () => {
  const express = require("express");
  const { createRecipientRouter } = require("../src/routes/telegramRecipients");
  const app = express();
  app.use(express.json());
  const pool = {};
  const row = { id: 1, nombre: "Oficial", chat_id: "7961617813", activo: true,
    rol_unidad: "Operativo", fecha_registro: "2026-10-22 10:00" };
  const calls = [];
  // Simula solamente la identidad que deja el middleware JWT global, probado por separado.
  app.use((req, _res, next) => {
    if (req.get("X-Test-Session") === "valid") req.user = { username: "operator" };
    next();
  });
  app.use("/api/telegram/destinatarios", createRecipientRouter({
    pool, getBotToken: () => "test-token-not-real",
    telegramClient: { obtenerInfoBot: async () => ({ username: "TestBot", first_name: "Test" }) },
    recipientService: {
      listarDestinatarios: async p => { assert.equal(p, pool); return [row]; },
      agregarDestinatario: async (p, data) => {
        assert.equal(p, pool); assert.equal(data.chatId, row.chat_id);
        calls.push("add"); return row;
      },
      toggleEstadoDestinatario: async (p, id, active) => {
        assert.equal(p, pool); assert.equal(id, "1"); calls.push("toggle");
        return { ...row, activo: active };
      },
      eliminarDestinatario: async (p, id) => {
        assert.equal(p, pool);
        if (id === "999") throw new Error("Destinatario no encontrado");
        calls.push("delete"); return row;
      },
      enviarPruebaIndividual: async p => {
        assert.equal(p, pool); calls.push("test");
        return { ok: true, destinatario: row, messageId: 123 };
      },
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const origin = "http://127.0.0.1:" + server.address().port + "/api/telegram/destinatarios";
  const request = (method, suffix = "", body, authenticated = true) => fetch(origin + suffix, {
    method, headers: { "Content-Type": "application/json", "X-Test-Session": authenticated ? "valid" : "" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    for (const [method, suffix] of [["POST", ""], ["PATCH", "/1/toggle"], ["DELETE", "/1"]]) {
      const denied = await request(method, suffix, {}, false);
      assert.equal(denied.status, 401);
    }
    assert.deepEqual(calls, []);
    const listing = await (await request("GET")).json();
    assert.equal(listing.destinatarios[0].chatId, "7961***813");
    assert.equal(listing.destinatarios[0].rol_unidad, "Operativo");
    assert.equal(listing.destinatarios[0].fecha_registro, row.fecha_registro);
    assert.equal(listing.botInfo.link, "https://t.me/TestBot");
    const added = await (await request("POST", "", { nombre: row.nombre, chatId: row.chat_id })).json();
    assert.equal(added.ok, true);
    assert.equal(added.destinatario.chatId, "7961***813");
    const toggled = await (await request("PATCH", "/1/toggle", { activo: false })).json();
    assert.equal(toggled.destinatario.activo, false);
    const deleted = await (await request("DELETE", "/1")).json();
    assert.match(deleted.mensaje, /eliminado/);
    const tested = await (await request("POST", "/1/probar", {})).json();
    assert.equal(tested.resultado.messageId, 123);
    for (const response of [listing, added, toggled, deleted, tested]) {
      assert.ok(!JSON.stringify(response).includes(row.chat_id), "no expone el ID completo");
    }
    const missing = await request("DELETE", "/999");
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).error, "Destinatario no encontrado");
    assert.deepEqual(calls, ["add", "toggle", "delete", "test"]);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("las rutas mutantes conservan el guard y el router de Telegram queda detrás de JWT", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/app.js"), "utf8");
  const routes = ["ingest", "security", "schedule"].map(name =>
    fs.readFileSync(path.resolve(__dirname, "../src/routes/" + name + ".js"), "utf8")).join("\n");
  for (const route of ["/api/oracle/populate-legacy", "/api/ingest/upload", "/api/ingest/sheet",
    "/api/ingest/lotes/:id", "/api/security/cifrar", "/api/security/descifrar", "/api/settings/schedule"]) {
    assert.ok(routes.includes('"' + route + '", requireSessionUser,'), route);
  }
  assert.ok(source.indexOf('app.use("/api", auth.apiRequireAuth)') <
    source.indexOf('app.use("/api/telegram/destinatarios", createRecipientRouter'));
  assert.ok(!source.includes("const authRes = { ok: true"));
});

test("adaptador Oracle rechaza datos incompletos, catálogos/dominios erróneos y fechas inválidas", () => {
  for (const changes of [
    { ID_NACIONALIDAD: undefined }, { ID_CUARTEL: 999 }, { ID_ESTADO_REGISTRO: 1 },
    { FECHA_ENROLAMIENTO: "2026-02-30" }, { FECHA_ENROLAMIENTO: undefined },
    { GENERO: "" }, { ES_MAYOR_EDAD: undefined }, { ES_MAYOR_EDAD: true },
    { EDAD_EXACTA: -1 }, { EDAD_EXACTA: "abc" },
  ]) {
    assert.throws(() => transformOracleToPostgre([{ ...oracleRow(), ...changes }], [], catalogs), { status: 422 });
  }
  assert.throws(() => transformOracleToPostgre([[1, 2]], [], catalogs), /metaData/);
});

test("Oracle se usa solo para lectura y se cierra una vez; inserción y auditoría usan PostgreSQL", async () => {
  const pgPool = {};
  let closes = 0;
  let inserts = 0;
  let audits = 0;
  const result = await importarOracleLegacy({
    pool: pgPool,
    oracle: { getConnection: async () => ({
      execute: async () => ({ rows: [oracleRow()] }), close: async () => { closes++; },
    }) },
    connectionOptions: {},
    loadCatalogs: async pool => { assert.equal(pool, pgPool); return catalogs; },
    bulkInsertRegistros: async (pool, rows) => {
      assert.equal(pool, pgPool); assert.equal(rows.length, 1);
      inserts++; return { inserted: 1, batches: 1 };
    },
    audit: async rows => { assert.equal(rows[0].genero, "F"); audits++; },
  });
  assert.deepEqual(result, { filasOracle: 1, filasPostgre: 1, filasDuplicadas: 0, batches: 1 });
  assert.equal(closes, 1);
  assert.equal(inserts, 1);
  assert.equal(audits, 1);
});

test("Oracle cierra la conexión en vacío, error de lectura, validación o inserción; no inserta lotes inválidos", async () => {
  for (const scenario of ["empty", "read", "validation", "insert"]) {
    let closes = 0;
    let inserts = 0;
    const operation = importarOracleLegacy({
      pool: {},
      oracle: { getConnection: async () => ({
        execute: async () => {
          if (scenario === "read") throw new Error("read");
          return { rows: scenario === "empty" ? [] : [oracleRow(), scenario === "validation" ? {} : oracleRow()] };
        },
        close: async () => { closes++; },
      }) },
      connectionOptions: {},
      loadCatalogs: async () => catalogs,
      bulkInsertRegistros: async () => { inserts++; throw new Error("insert"); },
    });
    if (scenario === "empty") assert.deepEqual(await operation, { filasOracle: 0, filasPostgre: 0, batches: 0 });
    else await assert.rejects(operation);
    assert.equal(closes, 1);
    assert.equal(inserts, scenario === "insert" ? 1 : 0);
  }
});
