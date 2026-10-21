const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const { chromium } = require('playwright');

// Exercise the actual login handler without starting the database, SIAD or Telegram.
function fixture() {
  const app = express();
  let attempts = 0;
  app.use(express.urlencoded({ extended: false }));
  app.set('view engine', 'ejs');
  app.set('views', path.resolve(__dirname, '../src/views'));
  app.use(express.static(path.resolve(__dirname, '../public')));
  app.get('/login', (req, res) => res.render('login', { error: null, success: null, next: '/abis' }));
  app.get('/', (req, res) => res.render('portal', { user: null }));
  app.get('/abis', (req, res) => res.send('<title>ABIS test</title><h1>Panel ABIS</h1>'));
  const source = fs.readFileSync(path.resolve(__dirname, '../src/server.js'), 'utf8');
  const start = source.indexOf('app.post("/login",');
  const end = source.indexOf('app.get("/register",', start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(source.slice(start, end), {
    app, jwt, JWT_SECRET: 'isolated-login-test-key',
    process: { env: { NODE_ENV: 'test', SIAD_URL: 'http://siad.test' } },
    pool: { query: async () => ({ rows: [{ rol: 'operador' }] }) },
    console,
    fetch: async (url, options) => {
      attempts++;
      const { username, password } = JSON.parse(options.body);
      if (username === 'unavailable') throw new Error('Simulated connection failure');
      if (username === 'slow') await new Promise(resolve => setTimeout(resolve, 1700));
      return { ok: true, status: 200, json: async () => ({ ok: password === 'test-valid' }) };
    },
  });
  return { app, attempts: () => attempts };
}

test('ABIS login response and loading screen', async t => {
  const { app, attempts } = fixture();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const post = (body, accept = 'application/json') => fetch(origin + '/login', {
    method: 'POST', headers: { Accept: accept }, body: new URLSearchParams(body), redirect: 'manual',
  });
  try {
    await t.test('JSON succeeds only after validation and preserves the session cookie', async () => {
      const response = await post({ username: 'operator', password: 'test-valid', next: '/abis' });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, redirect: '/abis' });
      assert.match(response.headers.get('set-cookie'), /abis_auth=.*HttpOnly/);
      assert.match(response.headers.get('set-cookie'), /SameSite=Lax/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    });
    await t.test('invalid credentials and unavailable validation never authorize a session', async () => {
      for (const [username, status] of [['operator', 401], ['unavailable', 503]]) {
        const response = await post({ username, password: 'incorrect' });
        assert.equal(response.status, status);
        assert.equal((await response.json()).ok, false);
        assert.equal(response.headers.get('set-cookie'), null);
      }
    });
    await t.test('normal HTML forms still redirect, and failed submissions preserve next', async () => {
      const response = await post({ username: 'operator', password: 'test-valid', next: '/abis' }, 'text/html');
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/abis');
      const failed = await post({ username: 'operator', password: 'incorrect', next: '/abis' }, 'text/html');
      const html = await failed.text();
      assert.match(html, /Usuario o contraseña incorrectos/);
      assert.match(html, /name="next" value="\/abis"/);
    });
    await t.test('redirects stay on this application', async () => {
      for (const next of ['//outside.test', '/\\outside.test', '/\t/outside.test', 'https://outside.test']) {
        const response = await post({ username: 'operator', password: 'test-valid', next });
        assert.equal((await response.json()).redirect, '/abis');
      }
    });

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    // Keep verification independent of font/CDN availability.
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const dialog = page.locator('#abis-access');
    async function credentials(username, password) {
      await page.goto(origin + '/login');
      await page.locator('#username').fill(username);
      await page.locator('#password').fill(password);
    }
    const screenshot = async name => {
      if (process.env.ABIS_CAPTURE_PREVIEWS === '1') {
        await page.screenshot({ path: path.resolve(__dirname, `../test-results/${name}.png`) });
      }
    };

    await t.test('slow validation stays pending, submits once, then enters ABIS', async () => {
      await credentials('slow', 'test-valid');
      const before = attempts();
      await page.locator('#form-login button[type=submit]').click();
      await page.waitForTimeout(550);
      assert.equal(await dialog.getAttribute('data-state'), 'checking');
      assert.equal(await dialog.locator('.biometric-device__matched').evaluate(el => getComputedStyle(el).opacity), '0');
      assert.equal(await page.locator('#form-login button[type=submit]').isDisabled(), true);
      await page.locator('#form-login').evaluate(el => el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      await screenshot('abis-loading-pending');
      await page.waitForFunction(() => document.querySelector('#abis-access').dataset.state === 'success');
      await page.waitForTimeout(250);
      await screenshot('abis-loading-success');
      await page.waitForURL(origin + '/abis');
      assert.equal(attempts(), before + 1);
      assert.equal((await page.context().cookies()).find(cookie => cookie.name === 'abis_auth').httpOnly, true);
      await page.goBack();
      assert.equal(await page.locator('#form-login button[type=submit]').isDisabled(), false);
      assert.equal(await dialog.evaluate(el => el.open), false);
    });
    await t.test('wrong password offers recovery without a success screen', async () => {
      await credentials('operator', 'incorrect');
      await page.locator('#form-login button[type=submit]').click();
      await page.waitForFunction(() => document.querySelector('#abis-access').dataset.state === 'error');
      assert.match(await page.locator('#access-description').textContent(), /incorrectos/);
      assert.equal(await dialog.locator('.biometric-device__matched').evaluate(el => getComputedStyle(el).opacity), '0');
      assert.equal(await dialog.locator('.biometric-device__tablet').evaluate(el => getComputedStyle(el).opacity), '1');
      await page.waitForTimeout(400);
      await screenshot('abis-loading-error');
      await page.locator('.abis-access__return').click();
      assert.equal(await dialog.evaluate(el => el.open), false);
      assert.equal(await page.locator('#password').evaluate(el => el === document.activeElement), true);
      await page.locator('#password').fill('test-valid');
      await page.locator('#form-login button[type=submit]').click();
      await page.waitForURL(origin + '/abis');
    });
    await t.test('network errors release the form', async () => {
      await credentials('operator', 'test-valid');
      await page.route('**/login', route => route.request().method() === 'POST' ? route.abort() : route.continue());
      await page.locator('#form-login button[type=submit]').click();
      await page.waitForFunction(() => document.querySelector('#abis-access').dataset.state === 'error');
      assert.match(await page.locator('#access-description').textContent(), /conectar/);
      assert.equal(await page.locator('#form-login button[type=submit]').isDisabled(), false);
      await page.unroute('**/login');
    });
    await t.test('a request that never answers times out with a recoverable error', async () => {
      const timeoutPage = await browser.newPage();
      let release;
      await timeoutPage.route('**/login', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        await new Promise(resolve => { release = resolve; });
        await route.abort();
      });
      try {
        await timeoutPage.goto(origin + '/login');
        await timeoutPage.clock.install();
        await timeoutPage.locator('#username').fill('operator');
        await timeoutPage.locator('#password').fill('test-valid');
        await timeoutPage.locator('#form-login button[type=submit]').click();
        await timeoutPage.clock.runFor(21000);
        await timeoutPage.waitForFunction(() => document.querySelector('#abis-access').dataset.state === 'error');
        assert.match(await timeoutPage.locator('#access-description').textContent(), /tardó demasiado/);
        assert.equal(await timeoutPage.locator('#form-login button[type=submit]').isDisabled(), false);
      } finally {
        if (release) release();
        await timeoutPage.close();
      }
    });
    await t.test('mobile layout, SVG references and reduced motion', async () => {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await credentials('slow', 'test-valid');
        await page.locator('#form-login button[type=submit]').click();
        await page.waitForTimeout(400);
        assert.equal(await dialog.evaluate(el => el.scrollWidth <= innerWidth), true);
        const duplicates = await page.evaluate(() => {
          const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
          return ids.filter((id, index) => ids.indexOf(id) !== index);
        });
        assert.deepEqual(duplicates, []);
        await screenshot(`abis-loading-mobile-${width}`);
        await page.waitForURL(origin + '/abis');
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await credentials('slow', 'test-valid');
      await page.locator('#form-login button[type=submit]').click();
      assert.equal(await dialog.locator('.biometric-device__scan').evaluate(el => getComputedStyle(el).display), 'none');
      assert.equal(await dialog.locator('.abis-access__track > span').evaluate(el => getComputedStyle(el).animationName), 'none');
      await page.waitForURL(origin + '/abis');
      await page.goto(origin + '/');
      assert.equal(await page.locator('.biometric-device').count(), 1);
      assert.equal(await page.locator('.doc-scanner__scene').count(), 1);
      assert.deepEqual(errors, []);
    });
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
