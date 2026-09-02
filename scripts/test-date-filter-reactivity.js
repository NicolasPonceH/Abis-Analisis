const { chromium } = require("playwright");

async function testDateFilterReactivity() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  console.log("================================================================================");
  console.log("🧪 PRUEBA DE REACTIVIDAD DINÁMICA DE FILTRADO DE FECHAS");
  console.log("================================================================================\n");

  // 1. Estado inicial
  const textInicial = await page.textContent("#period-summary-text");
  console.log(`1. Estado Inicial: "${textInicial.trim()}"`);

  // 2. Cambiar selector de fecha a '2026-08-21'
  console.log("\n2. Seleccionando fecha '2026-08-21' en el dropdown...");
  await page.selectOption("#filter-date-single", "2026-08-21");
  await page.waitForTimeout(600);

  const textCambiado = await page.textContent("#period-summary-text");
  console.log(`   Texto resultante: "${textCambiado.trim()}"`);
  if (textCambiado.includes("2026-08-21") && textCambiado.includes("33")) {
    console.log("   ✅ ¡Reactividad exitosa! El banner cambió inmediatamente a 2026-08-21 con 33 enrolamientos.");
  } else {
    console.error("   ❌ Falló: El banner no se actualizó.");
    process.exit(1);
  }

  // 3. Probar preset '7days'
  console.log("\n3. Pulsando preset 'Últimos 7 Días'...");
  await page.click('.preset-btn[data-preset="7days"]');
  await page.waitForTimeout(600);

  const textRango = await page.textContent("#period-summary-text");
  console.log(`   Texto resultante: "${textRango.trim()}"`);
  if (textRango.includes("Consolidado analítico desde")) {
    console.log("   ✅ ¡Reactividad de rango exitosa! El banner cambió a modo consolidado temporal.");
  } else {
    console.error("   ❌ Falló el cambio por preset.");
    process.exit(1);
  }

  // 4. Volver a Última Jornada
  console.log("\n4. Pulsando preset 'Última Jornada'...");
  await page.click('.preset-btn[data-preset="latest"]');
  await page.waitForTimeout(600);

  const textJornada = await page.textContent("#period-summary-text");
  console.log(`   Texto resultante: "${textJornada.trim()}"`);
  if (textJornada.includes("2026-08-22")) {
    console.log("   ✅ ¡Reactividad de retorno exitosa! El banner volvió a 2026-08-22.");
  } else {
    console.error("   ❌ Falló retorno a última jornada.");
    process.exit(1);
  }

  // 5. Captura de pantalla de la tarjeta de filtros con el nuevo banner
  const bannerBox = await page.locator(".filters-card").first();
  await bannerBox.screenshot({ path: "public/assets/screenshots/period-banner-reactive.png" });
  console.log("\n📸 Captura guardada en: public/assets/screenshots/period-banner-reactive.png");

  await browser.close();
  console.log("\n================================================================================");
  console.log("Todas las pruebas de reactividad de fechas completadas con ÉXITO.");
  console.log("================================================================================");
}

testDateFilterReactivity().catch((err) => {
  console.error(err);
  process.exit(1);
});
