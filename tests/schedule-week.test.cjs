const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { chromium } = require('playwright');
const { mergeScheduleConfig, getScheduleTimes } = require('../src/services/scheduleConfig');
const { registerScheduleRoutes } = require('../src/routes/schedule');

const legacy = { enabled: true, times: ['09:00'], days: [0, 1, 2, 3, 4, 5, 6], reportType: 'extenso', history: [] };
const weekly = { ...legacy, timesByDay: { 5: ['18:00'], 6: ['10:00'], 0: ['20:00'] } };

test('la configuración siempre normaliza el envío al reporte extenso', () => {
  assert.equal(mergeScheduleConfig({ ...legacy, reportType: 'resumen' }, { reportType: 'resumen' }).reportType, 'extenso');
});

// Ejecuta el servicio real con almacenamiento y reloj aislados. Nunca toca DB/Telegram.
function schedulerFixture(initial = legacy) {
  let stored = JSON.stringify(initial);
  let fileCopy;
  let tick;
  let now = { timeStr: '09:00', dateStr: '2026-10-23', dayOfWeek: 5 };
  const dispatched = [];
  const pool = { query: async (sql, params) => {
    if (/INSERT INTO scheduler_config/.test(sql)) stored = params[0];
    return { rows: [{ config_value: JSON.parse(stored) }] };
  } };
  const context = {
    module: { exports: {} }, __dirname: path.resolve(__dirname, '../src/services'), console,
    require: name => name === './scheduleConfig' ? { mergeScheduleConfig, getScheduleTimes }
      : name === 'path' ? path : name === '../db' ? pool
      : name === 'fs' ? { existsSync: () => true, writeFileSync: (_file, value) => { fileCopy = value; } } : {},
    setInterval: callback => { tick = callback; return 1; }, clearInterval() {},
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/services/schedulerService.js'), 'utf8'), context);
  const service = context.module.exports;
  return { service, pool, stored: () => JSON.parse(stored), fileCopy: () => JSON.parse(fileCopy),
    start() {
      context.obtenerHoraChile = () => now;
      context.triggerScheduledReport = async () => { dispatched.push({ ...now }); return { messageId: 1 }; };
      service.iniciarScheduler({ pool, logger: { log() {}, error(message) { throw new Error(message); } } });
    },
    async tick(clock) { now = { ...now, ...clock }; await tick(); }, dispatched,
  };
}

test('horarios por día: compatibilidad, validación estricta y cambios parciales sin perder personalización', () => {
  assert.deepEqual(getScheduleTimes(legacy, 5), ['09:00']);
  const merged = mergeScheduleConfig(legacy, { timesByDay: { 5: ['18:00', '08:00', '18:00'], 6: [], 0: ['20:00'] } });
  assert.deepEqual(merged.timesByDay[5], ['08:00', '18:00']);
  assert.deepEqual(getScheduleTimes(merged, 6), []);
  assert.deepEqual(getScheduleTimes(merged, 1), ['09:00']);
  assert.deepEqual(getScheduleTimes({ ...merged, days: [1] }, 5), []);
  assert.deepEqual(mergeScheduleConfig(merged, { history: [{ id: 'test' }] }).timesByDay, merged.timesByDay);
  assert.deepEqual(mergeScheduleConfig(merged, { times: ['07:00'] }).timesByDay, merged.timesByDay);
  assert.deepEqual(getScheduleTimes(mergeScheduleConfig(merged, { timesByDay: {} }), 5), ['09:00']);
  assert.equal(legacy.timesByDay, undefined);
  for (const timesByDay of [null, [], '18:00', { 7: ['09:00'] }, { '01': ['09:00'] }, { 5: '18:00' }, { 5: ['24:00'] }, { 5: ['09:60'] }, { 5: [null] }]) {
    assert.throws(() => mergeScheduleConfig(legacy, { timesByDay }), { status: 400 });
  }
});

test('próxima ejecución usa las horas de cada día y cruza domingo/lunes y la semana siguiente', () => {
  const { service } = schedulerFixture();
  const friday = new Date('2026-10-23T11:00:00Z'); // 08:00 Chile
  assert.equal(service.getNextExecution(weekly, friday).time, '18:00');
  const saturday = service.getNextExecution(weekly, new Date('2026-10-24T00:00:00Z'));
  assert.equal(saturday.targetDayOfWeek, 6);
  assert.equal(saturday.time, '10:00');
  const sunday = service.getNextExecution(weekly, new Date('2026-10-24T15:00:00Z'));
  assert.equal(sunday.targetDayOfWeek, 0);
  assert.equal(sunday.time, '20:00');
  const monday = service.getNextExecution(weekly, new Date('2026-10-26T00:00:00Z'));
  assert.equal(monday.targetDayOfWeek, 1);
  assert.equal(monday.time, '09:00');
  const nextWeek = service.getNextExecution({ ...weekly, days: [5] }, new Date('2026-10-24T00:00:00Z'));
  assert.equal(nextWeek.offsetDays, 7);
  assert.equal(nextWeek.time, '18:00');
  assert.equal(service.getNextExecution({ ...weekly, times: [] }, friday).time, '18:00');
  assert.equal(service.getNextExecution({ ...weekly, enabled: false }, friday).time, null);
});

test('guardado y lectura conservan horarios por día en DB y copia local; el ciclo no duplica horas generales', async () => {
  const fixture = schedulerFixture();
  await fixture.service.saveConfig({ timesByDay: weekly.timesByDay });
  assert.deepEqual(fixture.stored().timesByDay, weekly.timesByDay);
  assert.deepEqual(fixture.fileCopy().timesByDay, weekly.timesByDay);
  assert.deepEqual((await fixture.service.getConfig()).timesByDay, weekly.timesByDay);
  fixture.start();
  await fixture.tick({ timeStr: '09:00' });
  assert.equal(fixture.dispatched.length, 0, 'viernes no debe usar la hora general');
  await fixture.tick({ timeStr: '18:00' });
  await fixture.tick({ timeStr: '18:00' });
  assert.equal(fixture.dispatched.length, 1, 'un solo disparo por minuto');
  await fixture.tick({ dayOfWeek: 6, dateStr: '2026-10-24', timeStr: '18:00' });
  assert.equal(fixture.dispatched.length, 1, 'sábado no hereda la hora del viernes');
  await fixture.tick({ timeStr: '10:00' });
  await fixture.tick({ dayOfWeek: 0, dateStr: '2026-10-25', timeStr: '20:00' });
  assert.equal(fixture.dispatched.length, 3);
  await fixture.service.saveConfig({ days: [1] });
  await fixture.tick({ dayOfWeek: 5, dateStr: '2026-10-30', timeStr: '18:00' });
  assert.equal(fixture.dispatched.length, 3, 'un día desactivado no dispara aunque tenga personalización');
});

test('UI y API: viernes, sábado y domingo distintos, guardar, recargar y volver al horario general', async () => {
  const fixture = schedulerFixture();
  const app = express();
  const audit = [];
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { username: 'Prueba', rol: 'operador' }; next(); });
  app.set('views', path.resolve(__dirname, '../src/views'));
  app.set('view engine', 'ejs');
  app.use(express.static(path.resolve(__dirname, '../public')));
  app.get('/ajustes/horarios', (_req, res) => res.render('ajustes', { user: { username: 'Prueba' }, activeSection: 'horarios' }));
  app.get('/api/auth/session', (_req, res) => res.json({ ok: true, authenticated: true }));
  app.get('/api/telegram/destinatarios', (_req, res) => res.json({ ok: true, destinatarios: [] }));
  registerScheduleRoutes(app, { pool: { query: async (_sql, params) => { audit.push(params); return { rows: [] }; } }, schedulerService: fixture.service, requireSessionUser: (_req, _res, next) => next(), generarHashSHA256: () => 'fixture' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { errors.push(dialog.message()); dialog.dismiss(); });
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin + '/ajustes/horarios');
    await page.locator('#schedule-weekend-toggle').screenshot({ path: path.resolve(__dirname, '../test-results/yellow-button.png') });
    // Inicialmente el carrusel muestra el horario general
    assert.equal(await page.locator('#schedule-carousel-wrapper').getAttribute('data-active-slide'), 'general');
    // Navegar a Fin de Semana mediante el botón de carrusel
    await page.locator('#schedule-weekend-toggle').click();
    assert.equal(await page.locator('#schedule-carousel-wrapper').getAttribute('data-active-slide'), 'weekend');

    await page.locator('#schedule-week-editor').waitFor();
    assert.equal(await page.getByRole('tab').count(), 3);
    assert.equal(await page.getByRole('tabpanel').count(), 1);
    await page.locator('[data-select-day="5"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-select-day="6"]').getAttribute('aria-selected'), 'true');

    const dismissPopup = async (takeScreenshot = false) => {
      const overlay = page.locator('.schedule-popup-overlay');
      if (await overlay.isVisible()) {
        if (takeScreenshot) {
          await page.locator('.telegram-popup-content').screenshot({ path: path.resolve(__dirname, '../test-results/popup-telegram.png') });
        }
        await page.locator('.telegram-popup-close').click();
        await overlay.waitFor({ state: 'detached' });
      }
    };

    // Personalización directa sin necesidad de activar botón toggle de personalizar
    let firstCapture = true;
    for (const [day, time] of [[5, '18:00'], [6, '10:00'], [0, '20:00']]) {
      await page.locator(`[data-select-day="${day}"]`).click();
      await page.locator(`[data-remove-day="${day}"][data-remove-time="09:00"]`).click();
      await dismissPopup(firstCapture);
      firstCapture = false;
      await page.locator(`#schedule-day-time-${day}`).fill(time);
      await page.locator(`[data-add-day="${day}"]`).click();
      await dismissPopup();
    }
    const save = async () => {
      const response = page.waitForResponse(res => res.url().endsWith('/api/settings/schedule') && res.request().method() === 'POST');
      await page.locator('#btn-save-schedule-weekend').click();
      assert.equal((await response).status(), 200);
      await dismissPopup();
    };
    await save();
    assert.deepEqual(fixture.stored().timesByDay, weekly.timesByDay);
    assert.equal(audit.at(-1).at(-1), 'Prueba');
    await page.reload();
    // Volver a abrir el carrusel de fin de semana tras recarga
    await page.locator('#schedule-weekend-toggle').click();
    await page.locator('[data-remove-day="5"][data-remove-time="18:00"]').waitFor();
    assert.deepEqual(getScheduleTimes(fixture.stored(), 1), ['09:00']);
    assert.match(await page.locator('[data-select-day="6"]').innerText(), /10:00/);
    assert.match(await page.locator('[data-select-day="0"]').innerText(), /20:00/);
    // Restablecer el viernes al horario general
    await page.locator('[data-reset-day="5"]').click();
    await dismissPopup();
    await save();
    assert.equal(fixture.stored().timesByDay[5], undefined);
    assert.deepEqual(fixture.stored().timesByDay[6], ['10:00']);
    // Probar volver al horario general con el botón de carrusel
    await page.locator('#btn-back-to-general').click();
    assert.equal(await page.locator('#schedule-carousel-wrapper').getAttribute('data-active-slide'), 'general');
    await page.locator('.day-check[value="6"]').uncheck();
    await page.locator('#schedule-weekend-toggle').click();
    await page.locator('[data-select-day="6"]').click();
    assert.match(await page.locator('[data-schedule-day="6"]').innerText(), /Día desactivado/);
    await save();
    assert.equal(fixture.stored().days.includes(6), false);
    assert.deepEqual(fixture.stored().timesByDay[6], ['10:00'], 'pausar conserva las horas del día');
    const invalid = await fetch(origin + '/api/settings/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timesByDay: { 5: ['99:00'] } }) });
    assert.equal(invalid.status, 400);
    await page.locator('[data-select-day="0"]').click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const editor = page.locator('#schedule-week-editor');
      if (process.env.ABIS_CAPTURE_PREVIEWS === '1') {
        const card = page.locator('.schedule-weekend-card');
        await card.screenshot({ path: path.resolve(__dirname, `../test-results/schedule-week-${width}.png`) });
        if (width === 1440) await card.screenshot({ path: path.resolve(__dirname, '../test-results/schedule-week-context.png') });
        await page.evaluate(() => document.documentElement.classList.add('dark-theme'));
        await card.screenshot({ path: path.resolve(__dirname, `../test-results/schedule-week-dark-${width}.png`) });
        await page.evaluate(() => document.documentElement.classList.remove('dark-theme'));
      }
      assert.equal(await editor.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, `editor sin desbordamiento a ${width}px`);
      assert.ok((await editor.boundingBox()).height < 380, 'el editor de tres días debe ser proporcionado a la tarjeta');
    }
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
