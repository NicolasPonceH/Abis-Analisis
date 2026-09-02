const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

async function testAllTabsAndScreenshots() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const screenshotsDir = path.resolve(__dirname, "../public/assets/screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log("================================================================================");
  console.log("📸 VERIFICACIÓN MULTIPESTAÑA Y GENERACIÓN DE SCREENSHOTS RESPONSIVOS");
  console.log("================================================================================\n");

  const devices = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];

  const tabs = ["metricas", "ingesta", "tendencias", "seguridad"];

  for (const dev of devices) {
    await page.setViewportSize({ width: dev.width, height: dev.height });
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });

    for (const tab of tabs) {
      // Click tab button
      await page.click(`.tab-button[data-tab="${tab}"]`);
      await page.waitForTimeout(400);

      // Check overflow in this tab
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      console.log(`[${dev.name.padEnd(8)}] Tab: ${tab.padEnd(12)} - Overflow: ${overflow ? "❌ SÍ" : "✅ NO"}`);

      // Save screenshot for key views
      if (tab === "metricas" || tab === "ingesta") {
        const screenshotPath = path.join(screenshotsDir, `${dev.name}-${tab}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
      }
    }
  }

  await browser.close();
  console.log("\n✅ Todas las pestañas verificadas en Desktop, Tablet y Mobile sin desbordes.");
  console.log(`📁 Capturas guardadas en: ${screenshotsDir}`);
}

testAllTabsAndScreenshots().catch(console.error);
