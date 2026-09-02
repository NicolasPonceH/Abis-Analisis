const { chromium } = require("playwright");
const path = require("path");
const pool = require("../src/db");

async function testUploadPasswordModal() {
  console.log("================================================================================");
  console.log("🔐 PRUEBA DE AUTORIZACIÓN POLICIAL PARA INGESTA DE EXCEL");
  console.log("================================================================================\n");

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // 1. Cambiar a la pestaña de Ingesta
  console.log("1. Navegando a la pestaña 'Ingesta de Datos (Oracle ABIS)'...");
  await page.click('.tab-button[data-tab="ingesta"]');
  await page.waitForTimeout(400);

  // 2. Simular selección de archivo Excel
  console.log("2. Cargando archivo 'muestra_enrolados_test.xlsx'...");
  const filePath = path.resolve(__dirname, "../test-results/muestra_enrolados_test.xlsx");
  const fileInput = await page.locator("#file-input");
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(500);

  // 3. Verificar que el modal de autorización se abrió
  const modalVisible = await page.isVisible("#modal-auth-ingesta");
  console.log(`3. ¿Modal de autorización visible?: ${modalVisible ? "✅ SÍ" : "❌ NO"}`);
  if (!modalVisible) {
    throw new Error("El modal de autorización no se abrió al seleccionar el archivo");
  }

  const fileNameText = await page.textContent("#modal-file-name");
  console.log(`   Nombre en modal: "${fileNameText.trim()}"`);

  // Captura del modal abierto
  await page.screenshot({ path: "public/assets/screenshots/modal-auth-open.png" });
  console.log("📸 Captura guardada: public/assets/screenshots/modal-auth-open.png");

  // 4. Probar ingreso de contraseña incorrecta
  console.log("\n4. Probando clave incorrecta 'clave_falsa_123'...");
  await page.fill("#input-auth-clave", "clave_falsa_123");
  await page.click("#btn-modal-auth-confirm");
  await page.waitForTimeout(700);

  const errorVisible = await page.isVisible("#modal-auth-error");
  const errorText = await page.textContent("#modal-auth-error");
  console.log(`   ¿Error mostrado?: ${errorVisible ? "✅ SÍ" : "❌ NO"}`);
  console.log(`   Mensaje de error: "${errorText.trim()}"`);

  await page.screenshot({ path: "public/assets/screenshots/modal-auth-error.png" });
  console.log("📸 Captura guardada: public/assets/screenshots/modal-auth-error.png");

  if (!errorVisible || !errorText.includes("no válida")) {
    throw new Error("No se mostró el error de clave incorrecta");
  }

  // 5. Probar con la contraseña correcta institucional
  console.log("\n5. Ingresando clave autorizada 'pdi2026'...");
  await page.fill("#input-auth-clave", "pdi2026");
  await page.click("#btn-modal-auth-confirm");

  // Esperar a que se procese la ingesta y se cierre el modal
  await page.waitForSelector("#modal-auth-ingesta", { state: "hidden", timeout: 15000 });
  console.log("   ✅ Modal cerrado tras validación exitosa.");

  await page.waitForSelector("#upload-status .alert-success", { timeout: 15000 });
  const successText = await page.textContent("#upload-status");
  console.log("\n6. Resultado de la Ingesta Autorizada en pantalla:");
  console.log(successText.trim().replace(/\s+/g, " "));

  await page.screenshot({ path: "public/assets/screenshots/modal-auth-success.png" });
  console.log("📸 Captura guardada: public/assets/screenshots/modal-auth-success.png");

  // 7. Verificar auditoría en base de datos PostgreSQL
  const { rows } = await pool.query(
    "SELECT * FROM registro_auditoria_cifrada WHERE tipo_evento = 'INGESTA_EXCEL_AUTORIZADA' ORDER BY id_auditoria DESC LIMIT 1"
  );
  if (rows.length > 0) {
    console.log("\n7. ✅ Registro verificado en bitácora inmutable de auditoría PostgreSQL:");
    console.log(`   ID: ${rows[0].id_auditoria} | Evento: ${rows[0].tipo_evento} | Archivo: ${rows[0].archivo_procesado} | SHA256: ${rows[0].hash_sha256}`);
  }

  await browser.close();
  await pool.end();

  console.log("\n================================================================================");
  console.log("🎉 TODAS LAS PRUEBAS DE AUTORIZACIÓN DE INGESTA COMPLETADAS CON ÉXITO");
  console.log("================================================================================");
}

testUploadPasswordModal().catch((err) => {
  console.error("Error en prueba:", err);
  process.exit(1);
});
