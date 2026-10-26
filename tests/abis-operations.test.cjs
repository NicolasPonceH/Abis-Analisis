const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { mergeScheduleConfig } = require("../src/services/scheduleConfig");
const { esFecha, validarPeriodo, cargarReporte, csvCell } = require("../src/reportes/reportSelection");
const { estadosSql } = require("../src/reportes/estadosSql");
const PizZip = require("pizzip");


test("bulk insert es transaccional: commit completo o rollback ante un lote fallido", async () => {
  const { bulkInsertRegistros, BATCH_SIZE } = require("../src/etl/bulkInsert");
  for (const fail of [false, true]) {
    const events = [];
    let released = false;
    let inserts = 0;
    let connections = 0;
    const pool = { connect: async () => ++connections === 1 ? ({
      query: async () => ({ rows: [], rowCount: 0 }), release() {},
    }) : ({
      query: async (sql, values) => {
        if (sql.startsWith("INSERT")) {
          events.push("INSERT");
          inserts++;
          assert.ok(values.length <= 65535);
          if (fail && inserts === 2) throw new Error("lote fallido");
          return { rowCount: values.length / 13 };
        } else events.push(sql);
      },
      release: () => { released = true; },
    }) };
    const operation = bulkInsertRegistros(pool, Array.from({ length: BATCH_SIZE + 1 }, () => ({})), { idLote: 1 });
    if (fail) await assert.rejects(operation, /lote fallido/);
    else assert.equal((await operation).inserted, BATCH_SIZE + 1);
    assert.deepEqual(events, ["BEGIN", "INSERT", "INSERT", fail ? "ROLLBACK" : "COMMIT"]);
    assert.equal(released, true);
  }
});

test("borrado de lote revierte si falla auditoría y nunca responde éxito ficticio", async () => {
  const { registerIngestRoutes } = require("../src/routes/ingest");
  let handler;
  const statements = [];
  let released = false;
  registerIngestRoutes({
    post() {}, get() {},
    delete(_path, _guard, fn) { handler = fn; },
  }, {
    upload: { single: () => (_req, _res, next) => next() },
    requireSessionUser() {},
    ensureIngestHistory: async () => {},
    generarHashSHA256: () => "test-hash",
    pool: { connect: async () => ({
      query: async sql => {
        if (sql.startsWith("SELECT")) return { rows: [{ id_lote: 1, estado: "COMPLETADO", filas_insertadas: 1 }] };
        if (sql.includes("INSERT INTO registro_auditoria")) throw new Error("auditoría no disponible");
        statements.push(sql.trim().split(/\s+/)[0]);
        return { rows: [], rowCount: 1 };
      },
      release() { released = true; },
    }) },
  });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  const oldError = console.error;
  try {
    console.error = () => {};
    await handler({ params: { id: "1" }, user: { username: "fixture" } }, res);
  } finally { console.error = oldError; }
  assert.equal(res.code, 500);
  assert.equal(res.body.ok, false);
  assert.ok(statements.includes("ROLLBACK"));
  assert.ok(!statements.includes("COMMIT"));
  assert.equal(released, true);
});

test("fechas reales, rangos invertidos y campos no escalares se rechazan", async () => {
  assert.equal(esFecha("2024-02-29"), true);
  for (const date of ["2026-02-29", "2026-13-01", ["2026-10-01"], null, "bad"]) assert.equal(esFecha(date), false);
  assert.throws(() => validarPeriodo("2026-10-22", "2026-10-01"), { status: 400 });
  await assert.rejects(cargarReporte({}, { desde: "2026-10-22" }), { status: 400 });
  await assert.rejects(cargarReporte({}, { fecha: "2026-02-30" }), { status: 400 });
  await assert.rejects(cargarReporte({ query: async () => ({ rows: [] }) }), { status: 404 });
});

test("predicados de estados usan dominios y no IDs numéricos; CSV escapa comillas/fórmulas", () => {
  const sql = estadosSql("r");
  assert.match(sql.sincronizado, /tipo_estado = 'SINCRONIZACION'/);
  assert.match(sql.errorRegistro, /'REGISTRO'/);
  assert.match(sql.error, /CON_ERROR/);
  assert.ok(!/= [1-9]/.test(sql.error));
  assert.throws(() => estadosSql("r;drop table"));
  assert.equal(csvCell('A "B", C'), '"A ""B"", C"');
  assert.equal(csvCell("=1+1"), "\"'=1+1\"");
});

const schedule = { enabled: true, times: ["09:00"], days: [1, 3], reportType: "extenso", sendFourPhotosDaily: true, telegramChatId: "", history: [] };
test("guardar horarios parcialmente no borra ajustes; valida tipos y elimina duplicados", () => {
  const next = mergeScheduleConfig(schedule, { enabled: undefined, times: ["12:30", "08:00", "08:00"], days: [1, "1", 3] });
  assert.equal(next.enabled, true);
  assert.equal(next.sendFourPhotosDaily, true);
  assert.deepEqual(next.times, ["08:00", "12:30"]);
  assert.deepEqual(next.days, [1, 3]);
  assert.deepEqual(schedule.times, ["09:00"]);
  for (const patch of [{ times: ["25:00"] }, { days: [1.5] }, { enabled: "false" }, { reportType: "bad" }, { telegramChatId: "bad" }]) {
    assert.throws(() => mergeScheduleConfig(schedule, patch), { status: 400 });
  }
});

test("programador incluye la próxima semana y elige horas en orden", () => {
  const { getNextExecution } = require("../src/services/schedulerService");
  const mondayLate = new Date("2026-10-19T20:00:00Z");
  const next = getNextExecution({ ...schedule, days: [1], times: ["09:00"] }, mondayLate);
  assert.equal(next.offsetDays, 7);
  assert.equal(next.time, "09:00");
  const early = new Date("2026-10-19T10:00:00Z");
  assert.equal(getNextExecution({ ...schedule, times: ["12:00", "08:00"] }, early).time, "08:00");
  assert.equal(getNextExecution({ ...schedule, enabled: false }, early).time, null);
});

test("guardar configuración propaga fallos de DB, sin sobrescribir archivo ni confirmar éxito", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/services/schedulerService.js"), "utf8");
  const start = source.indexOf("async function saveConfigToDB(");
  const end = source.indexOf("async function getConfigFromDB(", start);
  const saveStart = source.indexOf("async function saveConfig(newConfig)");
  const saveEnd = source.indexOf("// Obtiene la hora actual", saveStart);
  let writes = 0;
  const context = {
    pool: { query: async () => { throw new Error("DB no disponible"); } },
    getConfig: async () => schedule, mergeScheduleConfig,
    fs: { writeFileSync: () => writes++ }, ensureConfigDir: () => {},
    CONFIG_FILE: "not-used", console,
  };
  vm.runInNewContext(source.slice(start, end) + source.slice(saveStart, saveEnd), context);
  await assert.rejects(context.saveConfig({ times: ["11:00"] }), /DB no disponible/);
  assert.equal(writes, 0);
});

function catalogsPool() {
  return {
    query: async sql => {
      assert.match(sql.trim(), /^SELECT/, "validación no debe escribir catálogos");
      let rows;
      if (/FROM nacionalidad/.test(sql)) rows = [{ id_nacionalidad: 1, descripcion: "CHILE", codigo_iso: "CHL" }];
      else if (/FROM region/.test(sql)) rows = [{ id_region: 1, nombre_region: "REGION" }];
      else if (/FROM unidad/.test(sql)) rows = [{ id_unidad: 1, nombre_unidad: "UNIDAD", nombre_region: "REGION" }];
      else if (/FROM cuartel/.test(sql)) rows = [{ id_cuartel: 1, nombre_cuartel: "CUARTEL", nombre_unidad: "UNIDAD" }];
      else if (/FROM equipo/.test(sql)) rows = [{ id_equipo: 1, tipo_equipo: "TABLET" }];
      else if (/FROM profesion/.test(sql)) rows = [{ id_profesion: 1, nombre_profesion: "NO ESPECIFICADO" }];
      else if (/FROM estado_proceso/.test(sql)) rows = [
        { id_estado: 101, tipo_estado: "SINCRONIZACION", descripcion: "SINCRONIZADO" },
        { id_estado: 104, tipo_estado: "REGISTRO", descripcion: "REGISTRADO" },
        { id_estado: 107, tipo_estado: "GENERAL", descripcion: "OK" },
      ];
      else throw new Error("Consulta inesperada");
      return { rows };
    },
  };
}

test("Excel, portapapeles y archivo cifrado comparten mapeo; validación no escribe profesiones", async () => {
  const XLSX = require("xlsx");
  const { processExcelFile, processSheetRows } = require("../src/ingest");
  const { cifrarBuffer } = require("../src/security/crypto");
  const row = { "Fecha Enrolamiento": "2026-10-22", Nacionalidad: "CHILE", Unidad: "UNIDAD", Cuartel: "CUARTEL",
    Equipo: "TABLET", Genero: "F", "Mayor de Edad": "SI", "Edad Exacta": 25,
    "Estado Sincronizacion": "SINCRONIZADO", "Estado Registro": "REGISTRADO", "Estado General": "OK",
    Profesion: "NO ESPECIFICADO" };
  const rows = [row, { ...row, Genero: "INVALIDO" }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "ENROLADOS");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const key = Buffer.alloc(32, 19);
  const options = { readOnly: true, encryptionKey: key };
  const excel = await processExcelFile(buffer, catalogsPool(), options);
  const encrypted = await processExcelFile(cifrarBuffer(buffer, key), catalogsPool(), options);
  const sheet = await processSheetRows(Object.keys(row), rows.map(r => Object.values(r)), catalogsPool(), options);
  assert.equal(excel.headerValidation.ok, true);
  assert.equal(excel.rows.length, 1);
  assert.equal(excel.errors.length, 1);
  assert.equal(excel.rows[0].id_estado_registro, 104);
  assert.deepEqual(encrypted, excel);
  assert.deepEqual(sheet.rows, excel.rows);
  assert.deepEqual(sheet.errors, excel.errors);
});

function metricPool() {
  return { query: async sql => {
    if (/AS dias/.test(sql)) return { rows: [{ total: "1", dias: "1" }] };
    if (/total_inconsistencias/.test(sql)) return { rows: [{ total_inconsistencias: 1, errores_registro: 1 }] };
    if (/total_errores/.test(sql)) return { rows: [{ total_errores: 0 }] };
    if (/SELECT ep.descripcion/.test(sql)) return { rows: [{ descripcion: "ERROR", total: "1" }] };
    return { rows: [] };
  } };
}

test("exportaciones Word y Excel son documentos válidos y conservan tasas cero", async () => {
  const data = await require("../src/reportes/reporteDiario").obtenerReporteDiario(metricPool(), "2026-10-22");
  assert.equal(data.resumenEjecutivo.tasaSincronizacion, 0);
  const word = await require("../src/reportes/wordReportService").generarReporteWord(data, { fecha: data.fecha });
  const excel = await require("../src/reportes/excelReportService").generarReporteExcel(data, { fecha: data.fecha });
  assert.match(new PizZip(word).file("word/document.xml").asText(), /document/);
  const zip = new PizZip(excel);
  assert.ok(zip.file("xl/workbook.xml"));
  const shared = zip.file("xl/sharedStrings.xml").asText();
  assert.match(shared, /0% enviados correctamente/);
  assert.match(shared, /0% con captura válida/);
  assert.ok(!shared.includes("100% enviados correctamente"));
});

test("rutas HTTP completas: JWT, recarga, métricas, exports, cifrado y entradas inválidas", async () => {
  process.env.SECRET_KEY = "abis-isolated-http-key";
  const jwt = require("jsonwebtoken");
  const pool = require("../src/db");
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const scheduler = require("../src/services/schedulerService");
  const originalGetConfig = scheduler.getConfig;
  pool.query = async sql => {
    if (/INSERT INTO registro_auditoria/.test(sql)) return { rows: [] }; // Auditoría simulada.
    return metricPool().query(sql);
  };
  pool.connect = async () => { throw new Error("DB real bloqueada por la prueba"); };
  scheduler.getConfig = async () => schedule;
  const { app } = require("../src/server"); // No abre puerto ni inicia servicios al importar.
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const token = jwt.sign({ username: "fixture", rol: "operador" }, process.env.SECRET_KEY, { expiresIn: "1h" });
  const headers = { Cookie: "abis_auth=" + token };
  try {
    assert.equal((await fetch(base + "/api/metricas")).status, 401);
    for (let i = 0; i < 3; i++) {
      const response = await fetch(base + "/api/metricas?fecha=2026-10-22", { headers });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).total, 1);
    }
    assert.equal((await fetch(base + "/abis", { headers })).status, 200);
    assert.equal((await fetch(base + "/ajustes/horarios", { headers })).status, 200);
    assert.equal((await fetch(base + "/api/settings/schedule", { headers })).status, 200);
    for (const format of ["word", "excel", "csv"]) {
      const response = await fetch(base + "/api/export/" + format + "?fecha=2026-10-22", { headers });
      assert.equal(response.status, 200, format);
      assert.match(response.headers.get("content-disposition"), /attachment/);
      assert.ok((await response.arrayBuffer()).byteLength > 100);
      assert.equal((await fetch(base + "/api/export/" + format + "?fecha=2026-02-30", { headers })).status, 400);
    }
    assert.equal((await fetch(base + "/api/metricas/rango?desde=2026-10-22&hasta=2026-10-01", { headers })).status, 400);
    // Recargas reales del panel. Bloquea CDN/Telegram/SIAD: no produce tráfico externo.
    const browser = await require("playwright").chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      await context.addCookies([{ name: "abis_auth", value: token, url: base, httpOnly: true }]);
      const page = await context.newPage();
      const errors = [];
      const remainingIngests = new Set([6, 7]);
      let deleteRequests = 0;
      let holdDelete = false;
      let heldDelete = null;
      let repeatedIngest = false;
      const duplicateResult = { ok: true, totalInsertadas: 0, totalDuplicadas: 8,
        totalRecibidas: 8, totalMapeadas: 8, erroresFilas: 0, hashSHA256: 'fixture', duracionMs: 100,
        nombreOriginal: 'prueba-duplicados.xlsx', estaCifrado: false };
      let ingestResponse = { status: 200, json: duplicateResult };
      page.on("pageerror", error => errors.push(error.message));
      page.on("dialog", dialog => { errors.push(dialog.message()); dialog.dismiss(); });
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        if (url.pathname === "/api/fechas") return route.fulfill({ json: [{ fecha: "2026-10-22", total: 1 }] });
        if (['/api/ingest/sheet', '/api/ingest/upload'].includes(url.pathname)) {
          repeatedIngest = true;
          return route.fulfill(ingestResponse);
        }
        if (url.pathname === "/api/ingest/historial") return route.fulfill({ json: { ok: true, lotes: repeatedIngest ? [{
          id_lote: 10, estado: 'SIN_NOVEDADES', filas_insertadas: 0, filas_duplicadas: 8,
        }] : [...remainingIngests].map(id => ({
          id_lote: id, iniciado_en: "2026-10-22T14:30:00.000Z", nombre_archivo: "Portapapeles / Oracle Sheet",
          filas_insertadas: 8, estado: "COMPLETADO", tipo_ingesta: "Portapapeles", usuario: "fixture",
        })) } });
        if (/^\/api\/ingest\/lotes\/[67]$/.test(url.pathname) && route.request().method() === "DELETE") {
          deleteRequests++;
          if (holdDelete) {
            heldDelete = route;
            return;
          }
          remainingIngests.delete(Number(url.pathname.split('/').pop()));
          return route.fulfill({ json: { ok: true, eliminados: 8 } });
        }
        if (url.pathname.startsWith("/api/telegram/")) return route.fulfill({ json: { ok: true, destinatarios: [], botInfo: null } });
        if (url.pathname === "/health") return route.fulfill({ json: { ok: true, totalRegistros: 1, database: "connected" } });
        return route.continue();
      });
      await page.goto(base + "/abis");
      for (let reload = 0; reload < 3; reload++) {
        await page.waitForFunction(() => document.getElementById("kpi-errores")?.textContent.trim() === "1");
        assert.ok(page.url().includes("/abis"));
        if (reload < 2) await page.reload();
      }
      await page.locator('.tab-button[data-tab="ingesta"]').click();
      const deleteIngestButton = page.locator('[data-ingesta-delete="6"]');
      await deleteIngestButton.waitFor({ state: "visible" });
      await deleteIngestButton.click();
      const deleteModal = page.locator("#ingesta-delete-modal");
      await deleteModal.waitFor({ state: "visible" });
      assert.match(await deleteModal.innerText(), /22-10-26/);
      assert.match(await deleteModal.innerText(), /Portapapeles \/ Oracle Sheet/);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('#ingesta-delete-close').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('#ingesta-delete-confirm').evaluate(el => el === document.activeElement), true,
        'el foco permanece en el popup');
      await page.locator("#ingesta-delete-cancel").click();
      assert.equal(deleteRequests, 0, "cancelar no debe borrar el lote");
      await page.locator('[data-ingesta-delete="6"]').click();
      await page.locator("#ingesta-delete-confirm").click();
      await page.locator('[data-ingesta-delete="6"]').waitFor({ state: 'detached' });
      await page.locator('[data-ingesta-delete="7"]').click();
      assert.equal(await page.locator('#ingesta-delete-confirm').isEnabled(), true,
        'el segundo lote no hereda el estado Eliminando de la operación anterior');
      assert.equal(await page.locator('#ingesta-delete-confirm').innerText(), 'Eliminar ingesta');
      for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 650 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        const overlay = await deleteModal.boundingBox();
        assert.deepEqual(overlay, { x: 0, y: 0, ...viewport }, 'el fondo cubre la ventana completa, no solo la pestaña');
        const dialog = await page.locator('.ingesta-delete-dialog').boundingBox();
        assert.ok(dialog.x >= 0 && dialog.y >= 0 && dialog.x + dialog.width <= viewport.width &&
          dialog.y + dialog.height <= viewport.height, 'el popup no queda recortado en pantallas pequeñas');
      }
      await page.setViewportSize({ width: 1280, height: 720 });
      assert.equal(await deleteModal.evaluate(el => el.parentElement === document.body), true);
      assert.equal(await deleteModal.evaluate(el => getComputedStyle(el).backdropFilter), 'none',
        'el fondo no mezcla filtros de desenfoque anidados');
      if (process.env.ABIS_POPUP_SCREENSHOT) await page.screenshot({ path: process.env.ABIS_POPUP_SCREENSHOT, animations: 'disabled' });

      // Simula una respuesta lenta y fallida: no debe permitir un segundo DELETE
      // ni cerrar el popup mientras todavía no se conoce el resultado.
      holdDelete = true;
      const pendingDelete = page.waitForRequest(request => request.url().endsWith('/api/ingest/lotes/7'));
      await page.locator('#ingesta-delete-confirm').click();
      await pendingDelete;
      assert.equal(await page.locator('#ingesta-delete-confirm').innerText(), 'Eliminando…');
      assert.equal(await page.locator('#ingesta-delete-cancel').isDisabled(), true);
      assert.equal(await page.locator('#ingesta-delete-close').isDisabled(), true);
      assert.equal(await page.locator('.ingesta-delete-dialog').getAttribute('aria-busy'), 'true');
      await page.keyboard.press('Escape');
      await deleteModal.click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('Tab');
      assert.equal(await deleteModal.isVisible(), true);
      assert.equal(await page.locator('.ingesta-delete-dialog').evaluate(el => el === document.activeElement), true);
      await page.evaluate(async () => {
        const ingest = await import('/js/modules/ingesta.js');
        await ingest.executeDeleteIngestAuthorized({ idLote: 7 }, '');
      });
      assert.equal(deleteRequests, 2, 'no se duplica una eliminación en curso');
      await heldDelete.fulfill({ status: 500, json: { ok: false, error: 'No se pudo eliminar el lote de prueba.' } });
      await page.locator('#ingesta-delete-error').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#ingesta-delete-confirm').isEnabled(), true);
      assert.equal(await page.locator('#ingesta-delete-confirm').innerText(), 'Eliminar ingesta');
      assert.equal(await page.locator('.ingesta-delete-dialog').getAttribute('aria-busy'), 'false');
      assert.equal(remainingIngests.has(7), true, 'un fallo no anuncia una eliminación inexistente');
      await page.locator('#ingesta-delete-cancel').click();
      await page.locator('[data-ingesta-delete="7"]').click();
      assert.equal(await page.locator('#ingesta-delete-error').isVisible(), false, 'la reapertura limpia el error anterior');

      // Adelanta el reloj del navegador: la espera vence sin bloquear la interfaz.
      await page.clock.install();
      const stalledDelete = page.waitForRequest(request => request.url().endsWith('/api/ingest/lotes/7'));
      await page.locator('#ingesta-delete-confirm').click();
      await stalledDelete;
      await page.clock.runFor(30001);
      await page.locator('#ingesta-delete-error').waitFor({ state: 'visible' });
      assert.match(await page.locator('#ingesta-delete-error').innerText(), /No se pudo confirmar la eliminación/);
      assert.equal(await page.locator('#ingesta-delete-cancel').isEnabled(), true);
      assert.equal(await page.locator('#ingesta-delete-confirm').isEnabled(), true);
      await heldDelete.abort().catch(() => {}); // Libera la ruta simulada que nunca contestó.
      await page.clock.resume();
      await page.keyboard.press('Escape');
      await page.locator('[data-ingesta-delete="7"]').click();
      holdDelete = false;
      await page.locator('#ingesta-delete-confirm').click();
      await page.waitForFunction(() => document.querySelector("#ingesta-history-body")?.textContent.includes("No hay ingestas registradas."));
      assert.equal(deleteRequests, 4, "dos eliminaciones exitosas y dos intentos fallidos, sin duplicar solicitudes");
      assert.match(await page.locator('#ingesta-history-feedback').innerText(), /Lote #7 eliminado. Registros eliminados: 8/);
      assert.equal(await deleteModal.isVisible(), false);
      await page.evaluate(async () => {
        const ingest = await import('/js/modules/ingesta.js');
        await ingest.executeSheetIngestAuthorized({ headers: ['Fecha'], rows: Array.from({ length: 8 }, () => ['2026-10-12']) }, '');
      });
      const duplicatesPopup = page.getByRole('alertdialog', { name: 'Se detectaron duplicados' });
      await duplicatesPopup.waitFor({ state: 'visible' });
      assert.equal(await duplicatesPopup.locator('[data-ingest-count="duplicates"]').innerText(), '8');
      assert.equal(await duplicatesPopup.locator('[data-ingest-count="inserted"]').innerText(), '0');
      assert.match(await duplicatesPopup.innerText(), /No se añadieron registros nuevos/);
      assert.equal(await page.locator('.progress-overlay').count(), 0, 'el progreso no tapa el aviso de duplicados');
      assert.equal(await duplicatesPopup.evaluate(el => el.parentElement.parentElement === document.body), true);
      await page.keyboard.press('Tab');
      assert.equal(await duplicatesPopup.getByRole('button', { name: 'Entendido' }).evaluate(el => el === document.activeElement), true);
      await page.clock.runFor(7000);
      assert.equal(await duplicatesPopup.isVisible(), true, 'el aviso permanece hasta que el usuario lo cierre');
      if (process.env.ABIS_DUPLICATES_SCREENSHOT) await page.screenshot({ path: process.env.ABIS_DUPLICATES_SCREENSHOT, animations: 'disabled' });
      for (const viewport of [{ width: 390, height: 650 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        const box = await duplicatesPopup.boundingBox();
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
          'el aviso de duplicados cabe en móvil y horizontal');
      }
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.ingest-duplicates-overlay').count(), 0);
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('ingest-duplicates-open')), false);
      const resultFeedback = page.locator('#sheet-ingest-feedback');
      await page.locator('#btn-mode-sheet').click();
      assert.equal(await resultFeedback.isVisible(), true, 'el resultado no desaparece al limpiar la planilla');
      assert.match(await resultFeedback.innerText(), /Registros ya cargados/);
      assert.match(await resultFeedback.innerText(), /Duplicados omitidos: 8/);
      assert.match(await page.locator('#ingesta-history-body').innerText(), /SIN NOVEDADES/);
      assert.equal(await page.locator('[data-ingesta-delete="10"]').count(), 0);

      const submitFixture = () => page.evaluate(async () => {
        const ingest = await import('/js/modules/ingesta.js');
        await ingest.executeSheetIngestAuthorized({ headers: ['Fecha'], rows: [['2026-10-12']] }, '');
      });
      ingestResponse = { status: 200, json: { ...duplicateResult, totalInsertadas: 2, totalDuplicadas: 3,
        totalRecibidas: 6, totalMapeadas: 5, erroresFilas: 1 } };
      await submitFixture();
      assert.equal(await duplicatesPopup.locator('[data-ingest-count="duplicates"]').innerText(), '3');
      assert.equal(await duplicatesPopup.locator('[data-ingest-count="inserted"]').innerText(), '2');
      assert.match(await duplicatesPopup.innerText(), /Se añadieron los registros nuevos/);
      assert.match(await duplicatesPopup.innerText(), /Filas con errores: 1/);
      await duplicatesPopup.getByRole('button', { name: 'Entendido' }).click();

      // La selección real de archivo también muestra el aviso (.xlsx y .enc),
      // pero la API está interceptada: no se escribe nada en PostgreSQL.
      ingestResponse = { status: 200, json: duplicateResult };
      await page.locator('#btn-mode-file').click();
      for (const name of ['prueba-duplicados.xlsx', 'prueba-duplicados.xlsx.enc']) {
        await page.locator('#file-input').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from('fixture') });
        await duplicatesPopup.waitFor({ state: 'visible' });
        assert.equal(await duplicatesPopup.locator('.ingest-duplicates-source').innerText(), name);
        assert.equal(await duplicatesPopup.locator('[data-ingest-count="duplicates"]').innerText(), '8');
        assert.equal(await page.locator('.ingest-duplicates-overlay').count(), 1);
        await duplicatesPopup.getByRole('button', { name: 'Entendido' }).click();
        assert.equal(await page.locator('#btn-select-file').evaluate(el => el === document.activeElement), true);
      }

      ingestResponse = { status: 409, json: { ok: false, codigo: 'POSIBLE_LOTE_REPETIDO', idLoteAnterior: 8,
        error: 'Posible carga repetida del lote #8. Revisa el historial.' } };
      await submitFixture();
      const possiblePopup = page.getByRole('alertdialog', { name: 'Posible carga repetida' });
      assert.equal(await possiblePopup.isVisible(), true);
      assert.match(await possiblePopup.innerText(), /lote #8/);
      assert.equal(await possiblePopup.locator('.ingest-duplicates-counts').isVisible(), false,
        'los lotes antiguos no muestran un conteo inventado');
      await page.locator('.ingest-duplicates-overlay').click({ position: { x: 5, y: 5 } });
      assert.equal(await possiblePopup.count(), 0);

      for (const response of [
        { status: 200, json: { ...duplicateResult, totalInsertadas: 8, totalDuplicadas: 0 } },
        { status: 500, json: { ok: false, error: 'Fallo simulado', totalDuplicadas: 8 } },
      ]) {
        ingestResponse = response;
        await submitFixture();
        assert.equal(await page.locator('.ingest-duplicates-overlay').count(), 0,
          'sin duplicados confirmados o con error de servidor no se anuncia una omisión exitosa');
        await page.locator('.progress-overlay').waitFor({ state: 'detached' });
      }

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(async () => {
        const { showIngestDuplicatesPopup } = await import('/js/components/ingest-duplicates-popup.js');
        showIngestDuplicatesPopup({ ok: true, totalDuplicadas: 1 }, { source: '<img src=x onerror="window.untrustedExecuted=true">' });
        showIngestDuplicatesPopup({ ok: true, totalDuplicadas: 2 }, { source: '<img src=x onerror="window.untrustedExecuted=true">' });
      });
      assert.equal(await page.locator('.ingest-duplicates-overlay').count(), 1, 'no se acumulan avisos');
      assert.equal(await duplicatesPopup.locator('img').count(), 0, 'el nombre del archivo se presenta como texto');
      assert.equal(await page.evaluate(() => window.untrustedExecuted), undefined);
      assert.equal(await duplicatesPopup.evaluate(el => getComputedStyle(el).animationName), 'none');
      await duplicatesPopup.getByRole('button', { name: 'Entendido' }).click();
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(base + "/ajustes/horarios");
      await page.waitForLoadState("networkidle");
      assert.ok(page.url().includes("/ajustes/horarios"));
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
    const form = new FormData();
    const plain = Buffer.from("roundtrip fixture");
    form.append("archivo", new Blob([plain]), "prueba.xlsx");
    const encryptedResponse = await fetch(base + "/api/security/cifrar", { method: "POST", headers, body: form });
    assert.equal(encryptedResponse.status, 200);
    const encrypted = await encryptedResponse.arrayBuffer();
    const decryptForm = new FormData();
    decryptForm.append("archivo", new Blob([encrypted]), "prueba.xlsx.enc");
    const decrypted = await fetch(base + "/api/security/descifrar", { method: "POST", headers, body: decryptForm });
    assert.equal(decrypted.status, 200);
    assert.deepEqual(Buffer.from(await decrypted.arrayBuffer()), plain);
    const badFile = new FormData();
    badFile.append("archivo", new Blob(["x"]), "prueba.exe");
    assert.equal((await fetch(base + "/api/ingest/upload", { method: "POST", headers, body: badFile })).status, 400);
    assert.equal((await fetch(base + "/api/ingest/sheet", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" })).status, 400);
    assert.equal((await fetch(base + "/api/admin/update-role", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" })).status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    pool.query = originalQuery;
    pool.connect = originalConnect;
    scheduler.getConfig = originalGetConfig;
  }
});

test("scripts npm existen y operaciones CLI mutantes requieren flags explícitos", async () => {
  const pkg = require("../package.json");
  for (const command of Object.values(pkg.scripts)) {
    for (const match of command.matchAll(/node (scripts\/[\w.-]+\.js)/g)) {
      assert.ok(fs.existsSync(path.resolve(__dirname, "..", match[1])), match[1]);
    }
  }
  const { main } = require("../scripts/abis-cli");
  await assert.rejects(main(["ingest", "not-used.xlsx"]), /--apply/);
  await assert.rejects(main(["send"]), /--send/);
  await assert.rejects(main(["init-db"]), /--apply/);
});

test("imports frontend usan una URL canónica por módulo sin duplicaciones versionadas", () => {
  for (const file of ["app.js", "modules/ingesta.js", "modules/ajustes.js", "modules/auth-modal.js"]) {
    const text = fs.readFileSync(path.resolve(__dirname, "../public/js", file), "utf8");
    assert.ok(!/\.js\?v=/.test(text), file);
    assert.ok(!text.includes("__legacy_modal__"));
  }
});
