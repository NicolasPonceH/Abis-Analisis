const { test, expect } = require('@playwright/test');
const path = require('path');

const outDir = 'C:\\Users\\Nicolás\\.gemini\\antigravity-ide\\brain\\b20a865e-701a-4c8a-87f8-76dd31526630\\screenshots';

test.describe('Visual Inspection - PDI Chile Styling', () => {
  test('Capture screenshots of all views', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Tab 1: Metricas
    await page.screenshot({ path: path.join(outDir, '01_tab_metricas.png'), fullPage: true });

    // Tab 2: Ingesta
    await page.click('button[data-tab="ingesta"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, '02_tab_ingesta.png'), fullPage: true });

    // Tab 3: Tendencias
    await page.click('button[data-tab="tendencias"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, '03_tab_tendencias.png'), fullPage: true });

    // Tab 4: Seguridad
    await page.click('button[data-tab="seguridad"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, '04_tab_seguridad.png'), fullPage: true });

    // Tab 5: Ajustes
    await page.click('button[data-tab="ajustes"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, '05_tab_ajustes.png'), fullPage: true });
  });
});
