const { chromium } = require("playwright");

const VIEWPORTS = [
  { name: "Desktop Large", width: 1920, height: 1080 },
  { name: "Desktop Medium", width: 1366, height: 768 },
  { name: "Tablet Landscape", width: 1024, height: 768 },
  { name: "Tablet Portrait", width: 768, height: 1024 },
  { name: "Mobile Large", width: 414, height: 896 },
  { name: "Mobile Standard", width: 375, height: 667 },
  { name: "Mobile Small", width: 320, height: 568 },
];

async function runAudit() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log("================================================================================");
  console.log("🔍 AUDITORÍA DE RESPONSIVIDAD Y REVISIÓN DEL DOM (SISTEMA ABIS)");
  console.log("================================================================================\n");

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500); // esperar a que Chart.js dibuje

    const auditResult = await page.evaluate((vpName) => {
      const issues = [];
      const docWidth = document.documentElement.scrollWidth;
      const winWidth = window.innerWidth;

      // 1. Detección de overflow horizontal
      if (docWidth > winWidth) {
        issues.push({
          type: "HORIZONTAL_OVERFLOW",
          detail: `El scrollWidth (${docWidth}px) supera el viewport (${winWidth}px) por ${docWidth - winWidth}px.`,
        });

        // Identificar elementos que desbordan
        const allElements = document.querySelectorAll("*");
        const overflowingElements = [];
        allElements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.right > winWidth + 1) {
            const idOrClass = el.id ? `#${el.id}` : el.className ? `.${el.className.split(" ")[0]}` : el.tagName.toLowerCase();
            overflowingElements.push({ selector: idOrClass, right: Math.round(rect.right), width: Math.round(rect.width) });
          }
        });
        if (overflowingElements.length > 0) {
          issues.push({
            type: "OVERFLOWING_ELEMENTS",
            elements: overflowingElements.slice(0, 5),
          });
        }
      }

      // 2. Revisión del Header
      const header = document.querySelector(".header-institutional");
      const headerRect = header ? header.getBoundingClientRect() : null;
      const logo = document.querySelector(".logo-pdi");
      const logoRect = logo ? logo.getBoundingClientRect() : null;

      // 3. Revisión del Executive Banner
      const execBanner = document.querySelector(".executive-banner");
      const execItems = document.querySelectorAll(".exec-stat-item");

      // 4. Revisión de KPIs
      const kpiGrid = document.querySelector(".kpi-grid");
      const kpiCards = document.querySelectorAll(".kpi-card");
      let kpiClipping = false;
      kpiCards.forEach((c) => {
        if (c.scrollWidth > c.clientWidth) kpiClipping = true;
      });

      // 5. Revisión de Gráficos
      const chartCards = document.querySelectorAll(".chart-card");
      let chartOverflow = false;
      chartCards.forEach((c) => {
        if (c.scrollWidth > c.clientWidth) chartOverflow = true;
      });

      // 6. Revisión de Tabla
      const tableContainer = document.querySelector(".table-container");
      const tableHasHorizontalScroll = tableContainer ? tableContainer.scrollWidth > tableContainer.clientWidth : false;

      // 7. Botones de acciones y filtros
      const actionsGroup = document.querySelector(".actions-group");
      const actionsWrapped = actionsGroup ? actionsGroup.scrollWidth > actionsGroup.clientWidth : false;

      return {
        viewport: vpName,
        winWidth,
        docWidth,
        hasOverflow: docWidth > winWidth,
        issues,
        tableHasHorizontalScroll,
        kpiClipping,
        chartOverflow,
        actionsWrapped,
        execItemsCount: execItems.length,
      };
    }, vp.name);

    const statusIcon = auditResult.hasOverflow ? "❌" : "✅";
    console.log(`${statusIcon} [${vp.name.padEnd(18)}] ${vp.width}x${vp.height} - docWidth: ${auditResult.docWidth}px, winWidth: ${auditResult.winWidth}px`);
    if (auditResult.issues.length > 0) {
      auditResult.issues.forEach((iss) => {
        console.log(`   ⚠️ ${iss.type}: ${iss.detail || JSON.stringify(iss.elements)}`);
      });
    }
    if (auditResult.tableHasHorizontalScroll) {
      console.log(`   ℹ️ Tabla con scroll horizontal controlado (correcto para pantallas estrechas).`);
    }
  }

  await browser.close();
  console.log("\n================================================================================");
  console.log("Auditoría completada.");
  console.log("================================================================================");
}

runAudit().catch(console.error);
