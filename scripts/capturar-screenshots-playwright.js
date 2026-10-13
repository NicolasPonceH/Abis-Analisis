const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ABIS_URL = process.env.SCREENSHOT_ABIS_URL || "http://localhost:3000";
const SIAD_URL = process.env.SCREENSHOT_SIAD_URL || "http://localhost:5001";
const USERNAME = process.env.SCREENSHOT_USER;
const PASSWORD = process.env.SCREENSHOT_PASSWORD;
const OUTPUT_DIR = path.join(__dirname, "..", "docs", "screenshots", "2026-10-13");

if (!USERNAME || !PASSWORD) {
  throw new Error("Define SCREENSHOT_USER y SCREENSHOT_PASSWORD antes de ejecutar Playwright.");
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function waitForPage(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    const backgroundNodes = [
      document.querySelector(".login-shell"),
      document.querySelector("body"),
    ].filter(Boolean);

    const urls = [...new Set(backgroundNodes.flatMap((node) => {
      const background = getComputedStyle(node).backgroundImage || "";
      return [...background.matchAll(/url\(["']?(.*?)["']?\)/g)].map((match) => match[1]);
    }))];

    await Promise.all(urls.map((url) => new Promise((resolve) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = resolve;
      image.src = url;
      if (image.complete) resolve();
    })));
  });
  await page.waitForTimeout(900);
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0.001s !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001s !important;
        caret-color: transparent !important;
      }
    `,
  });
}

async function anonymizePage(page) {
  await page.evaluate(() => {
    const textNodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    for (const textNode of textNodes) {
      const original = textNode.nodeValue || "";
      const trimmed = original.trim();
      if (!trimmed) continue;

      if (/\.pdf\b/i.test(original)) {
        textNode.nodeValue = "DOCUMENTO_DEMO.pdf";
        continue;
      }

      if (/\b(?:Tabatha|Ana\s+María|Ana\s+Maria|Renato|Sergio)\b/i.test(original)) {
        textNode.nodeValue = "PERSONA DEMO";
        continue;
      }

      if (/\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/.test(original)) {
        textNode.nodeValue = original.replace(/\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/g, "XX.XXX.XXX-X");
        continue;
      }

      if (/\b(?:DOC|SYS_ID)[-_:\s]*\d+[A-Z-]*\b/i.test(original)) {
        textNode.nodeValue = original.replace(/\bDOC[-_]\d+[A-Z-]*\b/gi, "DOC-DEMO").replace(/SYS_ID:\s*\d+/gi, "SYS_ID: DEMO");
        continue;
      }

      if (/^(?:abis_user|admin|nicolas|nicolastest|ejemplo|martin)$/i.test(trimmed)) {
        textNode.nodeValue = "USUARIO DEMO";
      }
    }

    for (const input of document.querySelectorAll("input, textarea")) {
      if (/\.pdf\b/i.test(input.value || "")) input.value = "DOCUMENTO_DEMO.pdf";
      if (/\.pdf\b/i.test(input.placeholder || "")) input.placeholder = "DOCUMENTO_DEMO.pdf";
    }
  });
}

async function capture(page, filename, { anonymize = false } = {}) {
  await waitForPage(page);
  if (anonymize) await anonymizePage(page);
  const target = path.join(OUTPUT_DIR, filename);
  await page.screenshot({ path: target, fullPage: true });
  console.log(`CAPTURED ${target}`);
}

async function loginAbis(page) {
  await page.goto(`${ABIS_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(USERNAME);
  await page.locator("#password").fill(PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 15000 }),
    page.locator("#form-login button[type='submit']").click(),
  ]);
  await waitForPage(page);
}

async function loginSiad(page) {
  await page.goto(`${SIAD_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(USERNAME);
  await page.locator("#password").fill(PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 15000 }),
    page.locator("form.card button[type='submit']").click(),
  ]);
  await waitForPage(page);
}

async function captureAbis(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const page = await context.newPage();

  await page.goto(`${ABIS_URL}/login`, { waitUntil: "domcontentloaded" });
  await capture(page, "01-abis-login.png");

  await loginAbis(page);
  await page.goto(ABIS_URL, { waitUntil: "domcontentloaded" });
  await capture(page, "02-abis-dashboard.png", { anonymize: true });

  for (const [tab, filename] of [
    ["ingesta", "03-abis-ingesta.png"],
    ["tendencias", "04-abis-tendencias.png"],
    ["auditoria", "05-abis-auditoria.png"],
  ]) {
    await page.locator(`button[data-tab='${tab}']`).click();
    await capture(page, filename, { anonymize: true });
  }

  for (const [section, filename] of [
    ["general", "06-abis-ajustes-general.png"],
    ["horarios", "07-abis-ajustes-horarios.png"],
    ["cuenta", "08-abis-ajustes-cuenta.png"],
    ["administracion", "09-abis-ajustes-administracion.png"],
  ]) {
    await page.goto(`${ABIS_URL}/ajustes/${section}`, { waitUntil: "domcontentloaded" });
    await capture(page, filename, { anonymize: true });
  }

  await context.close();
}

async function captureSiad(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const page = await context.newPage();

  await page.goto(`${SIAD_URL}/login`, { waitUntil: "domcontentloaded" });
  await capture(page, "10-siad-login.png");

  await loginSiad(page);
  for (const [route, filename] of [
    ["/", "11-siad-procesamiento.png"],
    ["/historial", "12-siad-historial.png"],
    ["/estadisticas", "13-siad-estadisticas.png"],
    ["/configuracion?section=general", "14-siad-configuracion-general.png"],
    ["/configuracion?section=administracion", "15-siad-administracion.png"],
  ]) {
    await page.goto(`${SIAD_URL}${route}`, { waitUntil: "domcontentloaded" });
    await capture(page, filename, { anonymize: true });
  }

  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await captureAbis(browser);
    await captureSiad(browser);
    console.log(`DONE ${OUTPUT_DIR}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error("SCREENSHOT_ERROR", error);
  process.exitCode = 1;
});
