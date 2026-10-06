const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true
  });
  
  const page = await context.newPage();
  
  console.log('Navegando a ABIS...');
  await page.goto('http://localhost:3000/');
  await page.waitForTimeout(2000); // Wait for load
  await page.screenshot({ path: 'docs/abis_main.png' });
  console.log('Captura ABIS principal guardada.');
  
  console.log('Abriendo módulo SIAD...');
  // Click on the SIAD button which opens a new tab. In Playwright we can just go to the URL directly or handle the new page.
  await page.goto('http://localhost:3000/analisis/');
  await page.waitForTimeout(2000); // Wait for SIAD to load
  
  // Login to SIAD if it redirected to login
  if (page.url().includes('login')) {
    console.log('Iniciando sesión en SIAD...');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'pdi2026'); // Assuming this is the password or similar
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
  }
  
  await page.screenshot({ path: 'docs/siad_module.png', fullPage: true });
  console.log('Captura SIAD guardada.');

  await browser.close();
})();
