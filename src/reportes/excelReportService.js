/**
 * ==============================================================================
 * SERVICIO DE EXPORTACIÓN OFICIAL MICROSOFT EXCEL (.XLSX) INSTITUCIONAL PDI
 * ==============================================================================
 * Genera libros de cálculo Excel con diseño profesional de alta dirección:
 * - Colores institucionales: Azul Marino PDI (#002B49) y Oro (#D4AF37)
 * - Tarjetas ejecutivas KPI estilizadas con bordes y fondos suaves
 * - Tablas con cabeceras blindadas, zebra striping y fórmulas de cálculo
 * - Auto-ajuste de columnas y bloqueo de paneles para lectura ágil
 */

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");
const { chromium } = require("playwright");

const LOGO_PATH = path.join(__dirname, "../../public/assets/acta-template-logo.png");

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function numero(valor) {
  return Number(valor || 0).toLocaleString("es-CL");
}

function porcentaje(valor) {
  const n = Number(valor || 0);
  return Number.isFinite(n) ? n : 0;
}

function chartFrame(title, subtitle, body, width = 1100, height = 320) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" rx="18" fill="#FFFFFF"/>
    <text x="42" y="42" font-family="Segoe UI, Arial" font-size="24" font-weight="700" fill="#0B2A5B">${escapeXml(title)}</text>
    <text x="42" y="68" font-family="Segoe UI, Arial" font-size="15" fill="#64748B">${escapeXml(subtitle)}</text>
    ${body}
  </svg>`;
}

function crearGraficoCuarteles(cuarteles = []) {
  const items = cuarteles.slice(0, 8).map((item) => ({
    nombre: item.cuartel || "Sin nombre",
    total: Number(item.total || 0),
    sincronizados: Number(item.sincronizados || 0),
    errores: Number(item.conError || 0),
  }));
  const max = Math.max(...items.map((item) => item.total), 1);
  const left = 250;
  const plotWidth = 690;
  const top = 105;
  const rowHeight = 38;
  const ticks = [0, 25, 50, 75, 100];
  let body = "";

  ticks.forEach((tick) => {
    const x = left + (plotWidth * tick) / 100;
    body += `<line x1="${x}" y1="${top - 18}" x2="${x}" y2="${top + items.length * rowHeight - 8}" stroke="#E2E8F0" stroke-width="1"/>`;
    body += `<text x="${x}" y="${top - 28}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="12" fill="#94A3B8">${tick}</text>`;
  });

  items.forEach((item, index) => {
    const y = top + index * rowHeight;
    const totalWidth = (item.total / max) * plotWidth;
    const syncWidth = (item.sincronizados / max) * plotWidth;
    body += `<text x="${left - 18}" y="${y + 18}" text-anchor="end" font-family="Segoe UI, Arial" font-size="15" font-weight="600" fill="#1F2937">${escapeXml(item.nombre)}</text>`;
    body += `<rect x="${left}" y="${y}" width="${plotWidth}" height="20" rx="10" fill="#E8EDF5"/>`;
    body += `<rect x="${left}" y="${y}" width="${totalWidth}" height="20" rx="10" fill="#BFDBFE"/>`;
    body += `<rect x="${left}" y="${y}" width="${syncWidth}" height="20" rx="10" fill="#0F766E"/>`;
    body += `<text x="${left + Math.max(totalWidth, 28) + 12}" y="${y + 16}" font-family="Segoe UI, Arial" font-size="14" font-weight="700" fill="#0B2A5B">${numero(item.total)}</text>`;
    if (item.errores > 0) {
      body += `<text x="980" y="${y + 16}" font-family="Segoe UI, Arial" font-size="13" font-weight="700" fill="#D92D20">${numero(item.errores)} obs.</text>`;
    }
  });

  if (!items.length) {
    body += `<text x="550" y="250" text-anchor="middle" font-family="Segoe UI, Arial" font-size="18" fill="#64748B">Sin datos para mostrar</text>`;
  }

  body += `<rect x="250" y="${top + items.length * rowHeight + 18}" width="16" height="16" rx="4" fill="#0F766E"/><text x="276" y="${top + items.length * rowHeight + 31}" font-family="Segoe UI, Arial" font-size="13" fill="#475569">Sincronizados</text>`;
  body += `<rect x="400" y="${top + items.length * rowHeight + 18}" width="16" height="16" rx="4" fill="#BFDBFE"/><text x="426" y="${top + items.length * rowHeight + 31}" font-family="Segoe UI, Arial" font-size="13" fill="#475569">Total enrolados</text>`;
  const height = Math.max(270, top + items.length * rowHeight + 70);
  return chartFrame("Enrolamientos por puesto o cuartel", "Volumen total y registros sincronizados", body, 1100, height);
}

function crearGraficoNacionalidades(nacionalidades = []) {
  const items = nacionalidades.slice(0, 8).map((item) => ({
    nombre: item.nacionalidad || "Sin nombre",
    total: Number(item.total || 0),
    porcentaje: porcentaje(item.porcentaje),
  }));
  const left = 280;
  const plotWidth = 650;
  const top = 105;
  const rowHeight = 38;
  let body = "";

  [0, 25, 50, 75, 100].forEach((tick) => {
    const x = left + (plotWidth * tick) / 100;
    body += `<line x1="${x}" y1="${top - 18}" x2="${x}" y2="${top + items.length * rowHeight - 8}" stroke="#E2E8F0" stroke-width="1"/>`;
    body += `<text x="${x}" y="${top - 28}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="12" fill="#94A3B8">${tick}%</text>`;
  });

  items.forEach((item, index) => {
    const y = top + index * rowHeight;
    const width = Math.max((item.porcentaje / 100) * plotWidth, item.porcentaje > 0 ? 4 : 0);
    body += `<text x="${left - 18}" y="${y + 18}" text-anchor="end" font-family="Segoe UI, Arial" font-size="15" font-weight="600" fill="#1F2937">${escapeXml(item.nombre)}</text>`;
    body += `<rect x="${left}" y="${y}" width="${plotWidth}" height="20" rx="10" fill="#E8EDF5"/>`;
    body += `<rect x="${left}" y="${y}" width="${width}" height="20" rx="10" fill="#2B5FAE"/>`;
    body += `<text x="${left + Math.max(width, 18) + 12}" y="${y + 16}" font-family="Segoe UI, Arial" font-size="14" font-weight="700" fill="#2B5FAE">${item.porcentaje.toFixed(1)}% · ${numero(item.total)}</text>`;
  });

  if (!items.length) {
    body += `<text x="550" y="250" text-anchor="middle" font-family="Segoe UI, Arial" font-size="18" fill="#64748B">Sin datos para mostrar</text>`;
  }
  const height = Math.max(270, top + items.length * rowHeight + 58);
  return chartFrame("Países de origen registrados", "Distribución de enrolamientos del período", body, 1100, height);
}

function normalizarItems(items = [], keys = []) {
  const source = Array.isArray(items) ? items : [];
  const totalGeneral = source.reduce((sum, item) => sum + Number(item.total || 0), 0);
  return source.slice(0, 8).map((item) => {
    const key = keys.find((candidate) => item[candidate] !== undefined && item[candidate] !== null);
    const total = Number(item.total || 0);
    const rawPercentage = item.porcentaje !== undefined
      ? Number(item.porcentaje)
      : (totalGeneral > 0 ? (total / totalGeneral) * 100 : 0);
    return {
      nombre: key ? String(item[key]) : "Sin datos",
      total,
      porcentaje: Number.isFinite(rawPercentage) ? rawPercentage : 0,
    };
  });
}

function crearGraficoDistribucion(title, subtitle, items, keys, color = "#2B5FAE") {
  const entries = normalizarItems(items, keys);
  const left = 300;
  const plotWidth = 630;
  const top = 105;
  const rowHeight = 38;
  let body = "";

  [0, 25, 50, 75, 100].forEach((tick) => {
    const x = left + (plotWidth * tick) / 100;
    body += `<line x1="${x}" y1="${top - 18}" x2="${x}" y2="${top + entries.length * rowHeight - 8}" stroke="#E2E8F0" stroke-width="1"/>`;
    body += `<text x="${x}" y="${top - 28}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="12" fill="#94A3B8">${tick}%</text>`;
  });

  entries.forEach((item, index) => {
    const y = top + index * rowHeight;
    const width = Math.max((item.porcentaje / 100) * plotWidth, item.porcentaje > 0 ? 4 : 0);
    body += `<text x="${left - 18}" y="${y + 18}" text-anchor="end" font-family="Segoe UI, Arial" font-size="15" font-weight="600" fill="#1F2937">${escapeXml(item.nombre)}</text>`;
    body += `<rect x="${left}" y="${y}" width="${plotWidth}" height="20" rx="10" fill="#E8EDF5"/>`;
    body += `<rect x="${left}" y="${y}" width="${width}" height="20" rx="10" fill="${color}"/>`;
    body += `<text x="${left + Math.max(width, 18) + 12}" y="${y + 16}" font-family="Segoe UI, Arial" font-size="14" font-weight="700" fill="${color}">${item.porcentaje.toFixed(1)}% - ${numero(item.total)}</text>`;
  });

  if (!entries.length) {
    body += `<text x="550" y="210" text-anchor="middle" font-family="Segoe UI, Arial" font-size="18" fill="#64748B">Sin datos para mostrar</text>`;
  }

  const height = Math.max(270, top + entries.length * rowHeight + 58);
  return chartFrame(title, subtitle, body, 1100, height);
}

function crearGraficoEstado(data) {
  const source = Array.isArray(data.sincronizacion) ? data.sincronizacion : [];
  const entries = source.length
    ? source.map((item) => ({
      nombre: item.descripcion || item.estado || "Estado",
      total: Number(item.total || 0),
    }))
    : [
      { nombre: "Sincronizados", total: Number(data.total || 0) },
      { nombre: "Pendientes", total: 0 },
      { nombre: "Con observaciones", total: 0 },
    ];
  const colors = ["#0F766E", "#C69214", "#D92D20", "#2B5FAE"];
  const total = Math.max(entries.reduce((sum, item) => sum + item.total, 0), 1);
  const chartHeight = Math.max(350, 125 + entries.length * 42 + 60);
  const cx = 250;
  const cy = Math.max(215, Math.min(230, chartHeight / 2 + 30));
  const radius = 105;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  let body = "";

  entries.forEach((item, index) => {
    const ratio = item.total / total;
    const length = circumference * ratio;
    body += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="38" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += length;
  });
  body += `<circle cx="${cx}" cy="${cy}" r="72" fill="#FFFFFF"/>`;
  body += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="30" font-weight="700" fill="#0B2A5B">${numero(data.total)}</text>`;
  body += `<text x="${cx}" y="${cy + 24}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="14" fill="#64748B">enrolamientos</text>`;
  entries.forEach((item, index) => {
    const y = 125 + index * 42;
    const pct = (item.total / total) * 100;
    body += `<rect x="535" y="${y - 13}" width="16" height="16" rx="4" fill="${colors[index % colors.length]}"/>`;
    body += `<text x="565" y="${y}" font-family="Segoe UI, Arial" font-size="15" fill="#334155">${escapeXml(item.nombre)}</text>`;
    body += `<text x="920" y="${y}" text-anchor="end" font-family="Segoe UI, Arial" font-size="15" font-weight="700" fill="#0B2A5B">${pct.toFixed(1)}%</text>`;
  });
  return chartFrame("Estado de sincronización", "Resultado general del procesamiento", body, 1000, chartHeight);
}

function crearGraficoRegistro(data) {
  return crearGraficoDistribucion(
    "Registro biom\u00e9trico",
    "Registros capturados y casos para revisar",
    data.registro,
    ["descripcion", "estado"],
    "#0F766E",
  );
}

function crearGraficoPerfil(data) {
  const source = Array.isArray(data.tramosEtarios) && data.tramosEtarios.length
    ? data.tramosEtarios
    : data.edad;
  return crearGraficoDistribucion(
    "Perfil por rango de edad",
    "Distribuci\u00f3n de personas enroladas",
    source,
    ["tramo", "categoria", "descripcion"],
    "#7C3AED",
  );
}

function crearGraficoCobertura(data) {
  const hasDevices = Array.isArray(data.dispositivos) && data.dispositivos.length > 0;
  const source = hasDevices ? data.dispositivos : data.regiones;
  const keys = hasDevices ? ["dispositivo", "tipo"] : ["region", "nombre"];
  return crearGraficoDistribucion(
    hasDevices ? "Equipos utilizados" : "Distribuci\u00f3n por regi\u00f3n",
    hasDevices ? "Origen del procesamiento por tipo de equipo" : "Origen territorial de los enrolamientos",
    source,
    keys,
    "#C69214",
  );
}

async function renderExcelCharts(data) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1.5 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#f8fafc"><div id="cuarteles"></div><div id="nacionalidades"></div><div id="estado"></div><div id="registro"></div><div id="perfil"></div><div id="cobertura"></div></body></html>`);
    await page.locator("#cuarteles").evaluate((node, svg) => { node.innerHTML = svg; }, crearGraficoCuarteles(data.rendimientoCuarteles));
    await page.locator("#nacionalidades").evaluate((node, svg) => { node.innerHTML = svg; }, crearGraficoNacionalidades(data.nacionalidadesPrincipales));
    await page.locator("#estado").evaluate((node, svg) => { node.innerHTML = svg; }, crearGraficoEstado(data));
    await page.locator("#registro").evaluate((node, svg) => { node.innerHTML = svg; }, crearGraficoRegistro(data));
    await page.locator("#perfil").evaluate((node, svg) => { node.innerHTML = svg; }, crearGraficoPerfil(data));
    await page.locator("#cobertura").evaluate((node, svg) => { node.innerHTML = svg; }, crearGraficoCobertura(data));
    return {
      cuarteles: await page.locator("#cuarteles svg").screenshot({ type: "png" }),
      nacionalidades: await page.locator("#nacionalidades svg").screenshot({ type: "png" }),
      estado: await page.locator("#estado svg").screenshot({ type: "png" }),
      registro: await page.locator("#registro svg").screenshot({ type: "png" }),
      perfil: await page.locator("#perfil svg").screenshot({ type: "png" }),
      cobertura: await page.locator("#cobertura svg").screenshot({ type: "png" }),
    };
  } finally {
    await browser.close();
  }
}

function chartItems(items, labelKeys, fallbackLabel = "Sin datos") {
  const source = Array.isArray(items) ? items : [];
  const result = source.slice(0, 8).map((item) => {
    const key = labelKeys.find((candidate) => item[candidate] !== undefined && item[candidate] !== null);
    return {
      label: key ? String(item[key]) : fallbackLabel,
      value: Number(item.total || 0),
    };
  });
  return result.length ? result : [{ label: fallbackLabel, value: 0 }];
}

function prepararDatosGraficos(workbook, data) {
  const ws = workbook.addWorksheet("DatosGraficos", { state: "veryHidden" });
  ws.state = "veryHidden";
  ws.orderNo = 4;

  const sincronizacion = Array.isArray(data.sincronizacion) && data.sincronizacion.length
    ? data.sincronizacion
    : [{ descripcion: "Sincronizado", total: Number(data.total || 0) }];
  const registro = Array.isArray(data.registro) && data.registro.length
    ? data.registro
    : [{ descripcion: "Registrado", total: Number(data.total || 0) }];
  const perfil = Array.isArray(data.tramosEtarios) && data.tramosEtarios.length
    ? data.tramosEtarios
    : data.edad;
  const coberturaEsEquipo = Array.isArray(data.dispositivos) && data.dispositivos.length > 0;
  const cobertura = coberturaEsEquipo ? data.dispositivos : data.regiones;

  const definitions = [
    {
      title: "Enrolamientos por puesto o cuartel",
      kind: "bar",
      categories: (data.rendimientoCuarteles || []).slice(0, 8).map((item) => item.cuartel || "Sin datos"),
      series: [
        { name: "Total enrolados", values: (data.rendimientoCuarteles || []).slice(0, 8).map((item) => Number(item.total || 0)), color: "BFDBFE" },
        { name: "Sincronizados", values: (data.rendimientoCuarteles || []).slice(0, 8).map((item) => Number(item.sincronizados || 0)), color: "0F766E" },
      ],
      anchor: { col: 1, row: 10, toCol: 7, toRow: 21 },
    },
    {
      title: "Países de origen registrados",
      kind: "bar",
      categories: (data.nacionalidadesPrincipales || []).slice(0, 8).map((item) => item.nacionalidad || "Sin datos"),
      series: [{ name: "Enrolamientos", values: (data.nacionalidadesPrincipales || []).slice(0, 8).map((item) => Number(item.total || 0)), color: "2B5FAE" }],
      anchor: { col: 8, row: 10, toCol: 14, toRow: 21 },
    },
    {
      title: "Estado de sincronización",
      kind: "doughnut",
      categories: chartItems(sincronizacion, ["descripcion", "estado"]).map((item) => item.label),
      series: [{ name: "Registros", values: chartItems(sincronizacion, ["descripcion", "estado"]).map((item) => item.value), colors: ["0F766E", "C69214", "D92D20", "2B5FAE"] }],
      anchor: { col: 1, row: 23, toCol: 7, toRow: 34 },
    },
    {
      title: "Registro biométrico",
      kind: "doughnut",
      categories: chartItems(registro, ["descripcion", "estado"]).map((item) => item.label),
      series: [{ name: "Registros", values: chartItems(registro, ["descripcion", "estado"]).map((item) => item.value), colors: ["0F766E", "D92D20", "C69214", "2B5FAE"] }],
      anchor: { col: 8, row: 23, toCol: 14, toRow: 34 },
    },
    {
      title: "Perfil por rango de edad",
      kind: "column",
      categories: chartItems(perfil, ["tramo", "categoria", "descripcion"]).map((item) => item.label),
      series: [{ name: "Enrolamientos", values: chartItems(perfil, ["tramo", "categoria", "descripcion"]).map((item) => item.value), color: "7C3AED" }],
      anchor: { col: 1, row: 36, toCol: 7, toRow: 47 },
    },
    {
      title: coberturaEsEquipo ? "Equipos utilizados" : "Distribución por región",
      kind: "column",
      categories: chartItems(cobertura, coberturaEsEquipo ? ["dispositivo", "tipo"] : ["region", "nombre"]).map((item) => item.label),
      series: [{ name: coberturaEsEquipo ? "Procesamientos" : "Enrolamientos", values: chartItems(cobertura, coberturaEsEquipo ? ["dispositivo", "tipo"] : ["region", "nombre"]).map((item) => item.value), color: "C69214" }],
      anchor: { col: 8, row: 36, toCol: 14, toRow: 47 },
    },
  ];

  definitions.forEach((definition, definitionIndex) => {
    const startColumn = 1 + definitionIndex * 4;
    const categoryColumn = String.fromCharCode(64 + startColumn);
    ws.getCell(1, startColumn).value = "Categoría";
    definition.categories = definition.categories.length ? definition.categories : ["Sin datos"];
    definition.series.forEach((series) => {
      if (!series.values.length) series.values = [0];
      while (series.values.length < definition.categories.length) series.values.push(0);
      series.values = series.values.slice(0, definition.categories.length);
    });
    definition.series.forEach((series, seriesIndex) => {
      ws.getCell(1, startColumn + seriesIndex + 1).value = series.name;
    });
    definition.categories.forEach((category, rowIndex) => {
      ws.getCell(rowIndex + 2, startColumn).value = category;
      definition.series.forEach((series, seriesIndex) => {
        ws.getCell(rowIndex + 2, startColumn + seriesIndex + 1).value = series.values[rowIndex];
      });
    });
    definition.categoryFormula = `DatosGraficos!$${categoryColumn}$2:$${categoryColumn}$${definition.categories.length + 1}`;
    definition.series.forEach((series, seriesIndex) => {
      const valueColumn = String.fromCharCode(65 + startColumn + seriesIndex);
      series.valueFormula = `DatosGraficos!$${valueColumn}$2:$${valueColumn}$${definition.categories.length + 1}`;
    });
  });

  ws.getColumn(1).width = 28;
  for (let col = 2; col <= 24; col += 1) ws.getColumn(col).width = 16;
  return definitions;
}

function chartCacheStrings(values) {
  return `<c:strCache><c:ptCount val="${values.length}"/>${values.map((value, index) => `<c:pt idx="${index}"><c:v>${escapeXml(value)}</c:v></c:pt>`).join("")}</c:strCache>`;
}

function chartCacheNumbers(values) {
  return `<c:numCache><c:formatCode>0</c:formatCode><c:ptCount val="${values.length}"/>${values.map((value, index) => `<c:pt idx="${index}"><c:v>${Number(value) || 0}</c:v></c:pt>`).join("")}</c:numCache>`;
}

function chartSeriesXml(series, index, definition) {
  const colors = series.colors || [series.color || "2B5FAE"];
  const points = definition.kind === "doughnut"
    ? definition.categories.map((_, pointIndex) => `<c:dPt><c:idx val="${pointIndex}"/><c:spPr><a:solidFill><a:srgbClr val="${colors[pointIndex % colors.length]}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:dPt>`).join("")
    : "";
  const fill = definition.kind === "doughnut" ? "" : `<c:spPr><a:solidFill><a:srgbClr val="${colors[0]}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>`;
  return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:v>${escapeXml(series.name)}</c:v></c:tx>${points}${fill}<c:cat><c:strRef><c:f>${definition.categoryFormula}</c:f>${chartCacheStrings(definition.categories)}</c:strRef></c:cat><c:val><c:numRef><c:f>${series.valueFormula}</c:f>${chartCacheNumbers(series.values)}</c:numRef></c:val></c:ser>`;
}

function chartTitleXml(title) {
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="es-CL" sz="1400" b="1"/><a:t>${escapeXml(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
}

function nativeChartXml(definition) {
  const series = definition.series.map((item, index) => chartSeriesXml(item, index, definition)).join("");
  const axis = definition.kind === "doughnut" ? "" : `<c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="${definition.kind === "bar" ? "max" : "minMax"}"/></c:scaling><c:delete val="0"/><c:axPos val="${definition.kind === "bar" ? "l" : "b"}"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="1002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/></c:catAx><c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${definition.kind === "bar" ? "b" : "l"}"/><c:majorGridlines/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="1001"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
  const plot = definition.kind === "doughnut"
    ? `<c:doughnutChart><c:varyColors val="1"/><c:ser>${series.replace(/^<c:ser>|<\/c:ser>$/g, "")}</c:ser><c:dLbls><c:showPercent val="1"/><c:showLeaderLines val="1"/></c:dLbls><c:firstSliceAng val="270"/><c:holeSize val="62"/></c:doughnutChart>`
    : `<c:barChart><c:barDir val="${definition.kind === "bar" ? "bar" : "col"}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:dLbls><c:showVal val="1"/></c:dLbls><c:gapWidth val="65"/><c:axId val="1001"/><c:axId val="1002"/></c:barChart>`;
  const legend = definition.series.length > 1 || definition.kind === "doughnut"
    ? `<c:legend><c:legendPos val="r"/><c:layout/><c:overlay val="0"/></c:legend>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:date1904 val="0"/><c:lang val="es-CL"/><c:roundedCorners val="0"/><c:style val="10"/><c:chart>${chartTitleXml(definition.title)}<c:plotArea><c:layout/>${plot}${axis}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

function zipPath(base, target) {
  const parts = `${base}/${target}`.split("/");
  const result = [];
  parts.forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") result.pop();
    else result.push(part);
  });
  return result.join("/");
}

function nextRelationshipId(xml) {
  const ids = [...xml.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  return (ids.length ? Math.max(...ids) : 0) + 1;
}

async function inyectarGraficosNativos(buffer, definitions) {
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const workbookRels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const visualSheetMatch = workbookXml.match(/<sheet[^>]+name="Resumen Visual"[^>]+r:id="(rId\d+)"/);
  if (!visualSheetMatch) return buffer;
  const visualTargetMatch = workbookRels.match(new RegExp(`<Relationship[^>]+Id="${visualSheetMatch[1]}"[^>]+Target="([^"]+)"`));
  if (!visualTargetMatch) return buffer;
  const visualSheetPath = zipPath("xl", visualTargetMatch[1]);
  const visualSheetXml = await zip.file(visualSheetPath).async("string");
  const sheetRelsPath = `${visualSheetPath.substring(0, visualSheetPath.lastIndexOf("/"))}/_rels/${visualSheetPath.substring(visualSheetPath.lastIndexOf("/") + 1)}.rels`;
  const sheetRelsXml = await zip.file(sheetRelsPath).async("string");
  const drawingIdMatch = visualSheetXml.match(/<drawing[^>]+r:id="(rId\d+)"/);
  if (!drawingIdMatch) return buffer;
  const drawingTargetMatch = sheetRelsXml.match(new RegExp(`<Relationship[^>]+Id="${drawingIdMatch[1]}"[^>]+Target="([^"]+)"`));
  if (!drawingTargetMatch) return buffer;
  const drawingPath = zipPath(visualSheetPath.substring(0, visualSheetPath.lastIndexOf("/")), drawingTargetMatch[1]);
  const drawingRelsPath = `${drawingPath.substring(0, drawingPath.lastIndexOf("/"))}/_rels/${drawingPath.substring(drawingPath.lastIndexOf("/") + 1)}.rels`;
  let drawingXml = await zip.file(drawingPath).async("string");
  let drawingRelsXml = await zip.file(drawingRelsPath).async("string");
  let relId = nextRelationshipId(drawingRelsXml);
  let shapeId = Math.max(1, ...[...drawingXml.matchAll(/cNvPr id="(\d+)"/g)].map((match) => Number(match[1]))) + 1;
  definitions.forEach((definition, index) => {
    const chartName = `chart${index + 1}.xml`;
    const chartRelId = `rId${relId}`;
    zip.file(`xl/charts/${chartName}`, nativeChartXml(definition));
    drawingRelsXml = drawingRelsXml.replace("</Relationships>", `<Relationship Id="${chartRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/${chartName}"/></Relationships>`);
    const anchor = definition.anchor;
    drawingXml = drawingXml.replace("</xdr:wsDr>", `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${anchor.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchor.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${anchor.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchor.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${shapeId}" name="Chart ${index + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${chartRelId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`);
    relId += 1;
    shapeId += 1;
  });
  let contentTypes = await zip.file("[Content_Types].xml").async("string");
  definitions.forEach((_, index) => {
    contentTypes = contentTypes.replace("</Types>", `<Override PartName="/xl/charts/chart${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
  });
  zip.file(drawingPath, drawingXml);
  zip.file(drawingRelsPath, drawingRelsXml);
  zip.file("[Content_Types].xml", contentTypes);
  return zip.generateAsync({ type: "nodebuffer" });
}

/**
 * Genera un buffer de archivo Excel (.xlsx) con formato institucional completo
 * @param {object} data Datos analíticos del reporte
 * @param {object} meta Parámetros de contexto
 * @returns {Promise<Buffer>}
 */
async function generarReporteExcel(data, meta = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Policía de Investigaciones de Chile (PDI) - Sistema ABIS";
  workbook.lastModifiedBy = "Centro de Monitoreo Biométrico ABIS";
  workbook.created = new Date();
  workbook.modified = new Date();

  const fechaPeriodo = data.desde && data.hasta
    ? `Desde ${data.desde} hasta ${data.hasta} (${data.diasConDatos || 0} jornadas)`
    : (data.fecha || meta.fecha || "Jornada más reciente");

  const totalEnrolados = data.total || 0;
  const exec = data.resumenEjecutivo || {};
  const fechaEmision = new Date().toLocaleString("es-CL", {
    dateStyle: "full",
    timeStyle: "medium",
  });
  const logoBuffer = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null;
  const logoId = logoBuffer
    ? workbook.addImage({ buffer: logoBuffer, extension: "png" })
    : null;
  const chartDefinitions = prepararDatosGraficos(workbook, data);

  // ============================================================================
  // HOJA 1: RESUMEN EJECUTIVO & ANALÍTICA
  // ============================================================================
  const ws1 = workbook.addWorksheet("Resumen Ejecutivo ABIS", {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 20, tabColor: { argb: "FF0B2A5B" } },
  });

  // Estilos base
  const fontTitle = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  const fontSub = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFD4AF37" } };
  const fillNavy = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002B49" } };
  const borderThin = {
    top: { style: "thin", color: { argb: "FFCBD5E1" } },
    left: { style: "thin", color: { argb: "FFCBD5E1" } },
    bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    right: { style: "thin", color: { argb: "FFCBD5E1" } },
  };

  // 1. BANNER INSTITUCIONAL
  ws1.mergeCells("B2:B4");
  const logoCell = ws1.getCell("B2");
  logoCell.value = "";
  logoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  logoCell.alignment = { horizontal: "center", vertical: "middle" };
  if (logoId !== null) {
    ws1.addImage(logoId, { tl: { col: 1.08, row: 1.45 }, ext: { width: 82, height: 43 } });
  }

  ws1.mergeCells("C2:G2");
  const cellTitle = ws1.getCell("C2");
  cellTitle.value = "POLICÍA DE INVESTIGACIONES DE CHILE";
  cellTitle.font = fontTitle;
  cellTitle.fill = fillNavy;
  cellTitle.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(2).height = 28;

  ws1.mergeCells("C3:G3");
  const cellSub1 = ws1.getCell("C3");
  cellSub1.value = "JEFATURA NACIONAL DE MIGRACIONES Y POLICÍA INTERNACIONAL";
  cellSub1.font = fontSub;
  cellSub1.fill = fillNavy;
  cellSub1.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(3).height = 20;

  ws1.mergeCells("C4:G4");
  const cellSub2 = ws1.getCell("C4");
  cellSub2.value = "RESUMEN DE ENROLAMIENTO BIOMÉTRICO | SISTEMA ABIS";
  cellSub2.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FFCBD5E1" } };
  cellSub2.fill = fillNavy;
  cellSub2.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(4).height = 18;

  // 2. PARÁMETROS DEL REPORTE
  ws1.getCell("B6").value = "Período Consultado:";
  ws1.getCell("B6").font = { name: "Segoe UI", bold: true, color: { argb: "FF1E293B" } };
  ws1.getCell("C6").value = fechaPeriodo;
  ws1.getCell("C6").font = { name: "Segoe UI", color: { argb: "FF0F172A" } };

  ws1.getCell("E6").value = "Fecha de Emisión:";
  ws1.getCell("E6").font = { name: "Segoe UI", bold: true, color: { argb: "FF1E293B" } };
  ws1.getCell("F6").value = fechaEmision;
  ws1.getCell("F6").font = { name: "Segoe UI", color: { argb: "FF0F172A" } };

  ws1.getCell("B7").value = "Clasificación:";
  ws1.getCell("B7").font = { name: "Segoe UI", bold: true, color: { argb: "FF1E293B" } };
  ws1.getCell("C7").value = "USO OFICIAL RESERVADO - PDI CHILE";
  ws1.getCell("C7").font = { name: "Segoe UI", bold: true, color: { argb: "FFDC2626" } };

  ws1.getCell("E7").value = "Fuente del informe:";
  ws1.getCell("E7").font = { name: "Segoe UI", bold: true, color: { argb: "FF1E293B" } };
  ws1.getCell("F7").value = "Sistema Analítico ABIS | PDI";
  ws1.getCell("F7").font = { name: "Segoe UI", color: { argb: "FF059669" } };

  [["B6", "D7"], ["E6", "G7"]].forEach(([from, to]) => {
    const start = ws1.getCell(from);
    const end = ws1.getCell(to);
    for (let row = start.row; row <= end.row; row += 1) {
      for (let col = start.col; col <= end.col; col += 1) {
        const cell = ws1.getCell(row, col);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row === start.row || row === end.row ? "FFF1F5F9" : "FFF8FAFC" } };
        cell.border = borderThin;
      }
    }
  });
  ws1.mergeCells("C6:D6");
  ws1.mergeCells("F6:G6");
  ws1.mergeCells("C7:D7");
  ws1.mergeCells("F7:G7");
  ["B6", "B7", "E6", "E7"].forEach((address) => {
    ws1.getCell(address).alignment = { vertical: "middle" };
  });
  ["C6", "C7", "F6", "F7"].forEach((address) => {
    ws1.getCell(address).alignment = { vertical: "middle", wrapText: true };
  });

  // 3. SCORECARD DE KPIs (Fila 9 a 11)
  const kpis = [
    {
      col: "B",
      title: "TOTAL ENROLAMIENTOS",
      val: totalEnrolados,
      sub: "Registros procesados",
      bg: "FFF0F5FA",
      border: "FF002B49",
      text: "FF002B49",
      numFormat: "#,##0",
    },
    {
      col: "C",
      title: "SINCRONIZADOS",
      val: totalEnrolados > 0 ? (totalEnrolados * (exec.tasaSincronizacion || 100) / 100) : 0,
      sub: `${exec.tasaSincronizacion || 100}% enviados correctamente`,
      bg: "FFEDFDF5",
      border: "FF059669",
      text: "FF047857",
      numFormat: "#,##0",
    },
    {
      col: "E",
      title: "REGISTROS VÁLIDOS",
      val: totalEnrolados > 0 ? (totalEnrolados * (exec.tasaRegistroBiometrico || 100) / 100) : 0,
      sub: `${exec.tasaRegistroBiometrico || 100}% con captura válida`,
      bg: "FFF0F9FF",
      border: "FF0284C7",
      text: "FF0369A1",
      numFormat: "#,##0",
    },
    {
      col: "F",
      title: "CON OBSERVACIONES",
      val: totalEnrolados > 0 ? (totalEnrolados * (exec.tasaError || 0) / 100) : 0,
      sub: `${exec.tasaError || 0}% para revisar`,
      bg: "FFFEF2F2",
      border: "FFDC2626",
      text: "FFDC2626",
      numFormat: "#,##0",
    },
  ];

  kpis.forEach((k) => {
    const r9 = ws1.getCell(`${k.col}9`);
    r9.value = k.title;
    r9.font = { name: "Segoe UI", size: 8, bold: true, color: { argb: k.text } };
    r9.fill = { type: "pattern", pattern: "solid", fgColor: { argb: k.bg } };
    r9.alignment = { horizontal: "center", vertical: "middle" };

    const r10 = ws1.getCell(`${k.col}10`);
    r10.value = Math.round(k.val);
    r10.numFmt = k.numFormat;
    r10.font = { name: "Segoe UI", size: 18, bold: true, color: { argb: k.text } };
    r10.fill = { type: "pattern", pattern: "solid", fgColor: { argb: k.bg } };
    r10.alignment = { horizontal: "center", vertical: "middle" };

    const r11 = ws1.getCell(`${k.col}11`);
    r11.value = k.sub;
    r11.font = { name: "Segoe UI", size: 7.5, italic: true, color: { argb: "FF64748B" } };
    r11.fill = { type: "pattern", pattern: "solid", fgColor: { argb: k.bg } };
    r11.alignment = { horizontal: "center", vertical: "middle" };

    [r9, r10, r11].forEach((c) => {
      c.border = {
        top: { style: "thin", color: { argb: k.border } },
        bottom: { style: "thin", color: { argb: k.border } },
        left: { style: "thin", color: { argb: k.border } },
        right: { style: "thin", color: { argb: k.border } },
      };
    });
  });

  // 4. TABLA 1: MATRIZ DE RENDIMIENTO OPERATIVO POR CUARTEL
  let currentRow = 14;
  ws1.mergeCells(`B${currentRow}:G${currentRow}`);
  const t1Title = ws1.getCell(`B${currentRow}`);
  t1Title.value = "1. ENROLAMIENTOS POR PUESTO / CUARTEL";
  t1Title.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FF002B49" } };
  currentRow++;

  const headersT1 = [
    { label: "Puesto / Cuartel", width: 26, align: "left" },
    { label: "Unidad PDI", width: 32, align: "left" },
    { label: "Total", width: 18, align: "right" },
    { label: "Sincronizados", width: 20, align: "right" },
    { label: "Observaciones", width: 16, align: "right" },
    { label: "Cumplimiento", width: 16, align: "right" },
  ];

  const colLetters = ["B", "C", "D", "E", "F", "G"];

  // Cabecera Tabla 1
  headersT1.forEach((h, i) => {
    const c = ws1.getCell(`${colLetters[i]}${currentRow}`);
    c.value = h.label;
    c.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fillNavy;
    c.alignment = { horizontal: h.align, vertical: "middle" };
    c.border = {
      bottom: { style: "medium", color: { argb: "FFD4AF37" } },
      top: { style: "thin", color: { argb: "FF002B49" } },
      left: { style: "thin", color: { argb: "FF1E3A5F" } },
      right: { style: "thin", color: { argb: "FF1E3A5F" } },
    };
  });
  ws1.getRow(currentRow).height = 24;
  currentRow++;

  const startT1DataRow = currentRow;
  const cuarteles = data.rendimientoCuarteles || [];

  if (cuarteles.length === 0) {
    ws1.mergeCells(`B${currentRow}:G${currentRow}`);
    const emptyCell = ws1.getCell(`B${currentRow}`);
    emptyCell.value = "No se registran enrolamientos en el período seleccionado";
    emptyCell.font = { name: "Segoe UI", italic: true, color: { argb: "FF94A3B8" } };
    emptyCell.alignment = { horizontal: "center" };
    currentRow++;
  } else {
    cuarteles.forEach((cuartel, idx) => {
      const isEven = idx % 2 === 0;
      const rowFill = isEven
        ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } }
        : { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

      const cB = ws1.getCell(`B${currentRow}`);
      cB.value = cuartel.cuartel;
      cB.alignment = { horizontal: "left", vertical: "middle" };

      const cC = ws1.getCell(`C${currentRow}`);
      cC.value = cuartel.unidad;
      cC.alignment = { horizontal: "left", vertical: "middle" };

      const cD = ws1.getCell(`D${currentRow}`);
      cD.value = Number(cuartel.total) || 0;
      cD.numFmt = "#,##0";
      cD.alignment = { horizontal: "right", vertical: "middle" };
      cD.font = { bold: true };

      const cE = ws1.getCell(`E${currentRow}`);
      cE.value = Number(cuartel.sincronizados) || 0;
      cE.numFmt = "#,##0";
      cE.alignment = { horizontal: "right", vertical: "middle" };
      cE.font = { color: { argb: "FF047857" } };

      const cF = ws1.getCell(`F${currentRow}`);
      cF.value = Number(cuartel.conError) || 0;
      cF.numFmt = "#,##0";
      cF.alignment = { horizontal: "right", vertical: "middle" };
      if (Number(cuartel.conError) > 0) {
        cF.font = { bold: true, color: { argb: "FFDC2626" } };
      }

      const cG = ws1.getCell(`G${currentRow}`);
      const tasaNum = parseFloat(cuartel.tasaExito) / 100 || 0;
      cG.value = tasaNum;
      cG.numFmt = "0.0%";
      cG.alignment = { horizontal: "right", vertical: "middle" };
      cG.font = { bold: true, color: { argb: tasaNum >= 0.95 ? "FF047857" : "FFD97706" } };

      [cB, cC, cD, cE, cF, cG].forEach((c) => {
        c.fill = rowFill;
        c.border = borderThin;
        if (!c.font) c.font = { name: "Segoe UI", size: 9 };
        else c.font.name = "Segoe UI";
      });

      ws1.getRow(currentRow).height = 20;
      currentRow++;
    });

    // Fila Totalizadora con fórmulas SUM
    const endT1DataRow = currentRow - 1;
    const totLabel = ws1.getCell(`B${currentRow}`);
    totLabel.value = "TOTAL GENERAL";
    totLabel.font = { name: "Segoe UI", bold: true, color: { argb: "FF002B49" } };
    totLabel.alignment = { horizontal: "left", vertical: "middle" };

    const totUnidad = ws1.getCell(`C${currentRow}`);
    totUnidad.value = `${cuarteles.length} Cuarteles Operativos`;
    totUnidad.font = { name: "Segoe UI", italic: true, size: 8.5, color: { argb: "FF64748B" } };

    const totTotal = ws1.getCell(`D${currentRow}`);
    totTotal.value = { formula: `SUM(D${startT1DataRow}:D${endT1DataRow})` };
    totTotal.numFmt = "#,##0";
    totTotal.font = { name: "Segoe UI", bold: true, color: { argb: "FF002B49" } };
    totTotal.alignment = { horizontal: "right", vertical: "middle" };

    const totSinc = ws1.getCell(`E${currentRow}`);
    totSinc.value = { formula: `SUM(E${startT1DataRow}:E${endT1DataRow})` };
    totSinc.numFmt = "#,##0";
    totSinc.font = { name: "Segoe UI", bold: true, color: { argb: "FF047857" } };
    totSinc.alignment = { horizontal: "right", vertical: "middle" };

    const totErr = ws1.getCell(`F${currentRow}`);
    totErr.value = { formula: `SUM(F${startT1DataRow}:F${endT1DataRow})` };
    totErr.numFmt = "#,##0";
    totErr.font = { name: "Segoe UI", bold: true, color: { argb: "FFDC2626" } };
    totErr.alignment = { horizontal: "right", vertical: "middle" };

    const totEfect = ws1.getCell(`G${currentRow}`);
    totEfect.value = { formula: `IF(D${currentRow}>0, E${currentRow}/D${currentRow}, 0)` };
    totEfect.numFmt = "0.0%";
    totEfect.font = { name: "Segoe UI", bold: true, color: { argb: "FF047857" } };
    totEfect.alignment = { horizontal: "right", vertical: "middle" };

    const fillTot = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    [totLabel, totUnidad, totTotal, totSinc, totErr, totEfect].forEach((c) => {
      c.fill = fillTot;
      c.border = {
        top: { style: "thin", color: { argb: "FF002B49" } },
        bottom: { style: "double", color: { argb: "FF002B49" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });
    ws1.getRow(currentRow).height = 22;
    currentRow += 3;
  }

  // 5. TABLA 2: FLUJOS MIGRATORIOS POR NACIONALIDAD
  ws1.mergeCells(`B${currentRow}:E${currentRow}`);
  const t2Title = ws1.getCell(`B${currentRow}`);
  t2Title.value = "2. ENROLAMIENTOS POR PAÍS DE ORIGEN";
  t2Title.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FF002B49" } };
  currentRow++;

  const headersT2 = [
    { label: "País de origen", width: 28, align: "left" },
    { label: "Código", width: 16, align: "center" },
    { label: "Total", width: 22, align: "right" },
    { label: "Proporción", width: 18, align: "right" },
  ];
  const colT2 = ["B", "C", "D", "E"];

  headersT2.forEach((h, i) => {
    const c = ws1.getCell(`${colT2[i]}${currentRow}`);
    c.value = h.label;
    c.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fillNavy;
    c.alignment = { horizontal: h.align, vertical: "middle" };
    c.border = {
      bottom: { style: "medium", color: { argb: "FFD4AF37" } },
      top: { style: "thin", color: { argb: "FF002B49" } },
    };
  });
  ws1.getRow(currentRow).height = 22;
  currentRow++;

  const nacionalidades = data.nacionalidadesPrincipales || [];
  nacionalidades.forEach((nac, idx) => {
    const isEven = idx % 2 === 0;
    const rowFill = isEven
      ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } }
      : { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

    const cB = ws1.getCell(`B${currentRow}`);
    cB.value = nac.nacionalidad;
    cB.alignment = { horizontal: "left", vertical: "middle" };

    const cC = ws1.getCell(`C${currentRow}`);
    cC.value = nac.codigo_iso || "N/D";
    cC.alignment = { horizontal: "center", vertical: "middle" };
    cC.font = { bold: true, color: { argb: "FF475569" } };

    const cD = ws1.getCell(`D${currentRow}`);
    cD.value = Number(nac.total) || 0;
    cD.numFmt = "#,##0";
    cD.alignment = { horizontal: "right", vertical: "middle" };
    cD.font = { bold: true, color: { argb: "FF002B49" } };

    const cE = ws1.getCell(`E${currentRow}`);
    const pctNum = parseFloat(nac.porcentaje) / 100 || 0;
    cE.value = pctNum;
    cE.numFmt = "0.0%";
    cE.alignment = { horizontal: "right", vertical: "middle" };
    cE.font = { color: { argb: "FF0284C7" } };

    [cB, cC, cD, cE].forEach((c) => {
      c.fill = rowFill;
      c.border = borderThin;
      if (!c.font) c.font = { name: "Segoe UI", size: 9 };
      else c.font.name = "Segoe UI";
    });
    ws1.getRow(currentRow).height = 20;
    currentRow++;
  });
  currentRow += 2;

  // 6. PIE DE PÁGINA LEGAL INSTITUCIONAL
  ws1.mergeCells(`B${currentRow}:G${currentRow}`);
  const legal1 = ws1.getCell(`B${currentRow}`);
  legal1.value = "AVISO LEGAL: Documento oficial generado automáticamente por el Sistema ABIS de la Policía de Investigaciones de Chile.";
  legal1.font = { name: "Segoe UI", size: 8, italic: true, color: { argb: "FF64748B" } };
  currentRow++;

  ws1.mergeCells(`B${currentRow}:G${currentRow}`);
  const legal2 = ws1.getCell(`B${currentRow}`);
  legal2.value = "Información amparada por la Ley N° 19.628 sobre Protección de la Vida Privada. Prohibida su divulgación o reproducción no autorizada.";
  legal2.font = { name: "Segoe UI", size: 8, italic: true, color: { argb: "FF94A3B8" } };

  // Anchos de columna optimizados
  ws1.getColumn("A").width = 4;
  ws1.getColumn("B").width = 28;
  ws1.getColumn("C").width = 34;
  ws1.getColumn("D").width = 20;
  ws1.getColumn("E").width = 22;
  ws1.getColumn("F").width = 22;
  ws1.getColumn("G").width = 18;

  // ============================================================================
  // HOJA VISUAL: GRÁFICOS EJECUTIVOS
  // ============================================================================
  const wsVisual = workbook.addWorksheet("Resumen Visual", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 6 }],
    properties: { defaultRowHeight: 20, tabColor: { argb: "FF0B2A5B" } },
    headerFooter: {
      oddFooter: "&CInforme generado por Sistema Analítico ABIS | PDI",
    },
  });
  wsVisual.orderNo = 1;
  ws1.orderNo = 2;
  wsVisual.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 2, paperSize: 9 };
  for (let col = 1; col <= 15; col += 1) wsVisual.getColumn(col).width = 13;
  wsVisual.getColumn(1).width = 3;

  wsVisual.mergeCells("B2:B5");
  const visualLogo = wsVisual.getCell("B2");
  visualLogo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  visualLogo.alignment = { horizontal: "center", vertical: "middle" };
  if (logoId !== null) {
    wsVisual.addImage(logoId, { tl: { col: 1.08, row: 1.45 }, ext: { width: 82, height: 43 } });
  }

  wsVisual.mergeCells("C2:O2");
  wsVisual.getCell("C2").value = "RESUMEN VISUAL DE ENROLAMIENTO";
  wsVisual.getCell("C2").font = fontTitle;
  wsVisual.getCell("C2").fill = fillNavy;
  wsVisual.getCell("C2").alignment = { horizontal: "center", vertical: "middle" };
  wsVisual.mergeCells("C3:O3");
  wsVisual.getCell("C3").value = "POLICÍA DE INVESTIGACIONES DE CHILE | SISTEMA ABIS";
  wsVisual.getCell("C3").font = fontSub;
  wsVisual.getCell("C3").fill = fillNavy;
  wsVisual.getCell("C3").alignment = { horizontal: "center", vertical: "middle" };
  wsVisual.mergeCells("C4:O4");
  wsVisual.getCell("C4").value = `Período: ${fechaPeriodo} · Emitido: ${fechaEmision}`;
  wsVisual.getCell("C4").font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FFCBD5E1" } };
  wsVisual.getCell("C4").fill = fillNavy;
  wsVisual.getCell("C4").alignment = { horizontal: "center", vertical: "middle" };
  [2, 3, 4, 5].forEach((row) => { wsVisual.getRow(row).height = row === 2 ? 28 : 20; });

  wsVisual.mergeCells("B6:O6");
  wsVisual.getCell("B6").value = "Lectura rápida del período seleccionado. Los gráficos muestran volumen, sincronización y procedencia de los enrolamientos.";
  wsVisual.getCell("B6").font = { name: "Segoe UI", size: 10, color: { argb: "FF475569" }, italic: true };
  wsVisual.getCell("B6").alignment = { horizontal: "left", vertical: "middle" };

  const visualKpis = [
    ["▦  TOTAL DE ENROLAMIENTOS", totalEnrolados, "Registros procesados", "Volumen bruto", "FF0B2A5B", "FFEAF1F7", 1],
    ["↻  SINCRONIZADOS CON PDI", `${exec.tasaSincronizacion || 100}%`, "Envío correcto a PDI", "Meta cumplida", "FF0F766E", "FFE8F7F1", Number(exec.tasaSincronizacion || 100) / 100],
    ["◉  REGISTRO BIOMÉTRICO ABIS", `${exec.tasaRegistroBiometrico || 100}%`, "Captura biométrica", "Captura OK", "FF1687C2", "FFEAF3FB", Number(exec.tasaRegistroBiometrico || 100) / 100],
    ["⚠  INCONSISTENCIAS", `${exec.tasaError || 0}%`, "Casos para revisar", "Sin incidentes", "FFB42318", "FFFFF0ED", Number(exec.tasaError || 0) / 100],
  ];
  const visualKpiColumns = [["B", "D"], ["E", "G"], ["H", "J"], ["K", "M"]];
  visualKpis.forEach(([title, value, subtitle, badge, color, background, progress], index) => {
    const [fromCol, toCol] = visualKpiColumns[index];
    const [fromIndex, toIndex] = [fromCol.charCodeAt(0) - 64, toCol.charCodeAt(0) - 64];
    wsVisual.mergeCells(`${fromCol}8:${toCol}8`);
    wsVisual.mergeCells(`${fromCol}9:${toCol}9`);
    const titleCell = wsVisual.getCell(`${fromCol}7`);
    const badgeCell = wsVisual.getCell(`${toCol}7`);
    const valueCell = wsVisual.getCell(`${fromCol}8`);
    const subtitleCell = wsVisual.getCell(`${fromCol}9`);
    titleCell.value = title;
    badgeCell.value = badge;
    valueCell.value = value;
    subtitleCell.value = subtitle;
    titleCell.font = { name: "Segoe UI", size: 8, bold: true, color: { argb: color } };
    badgeCell.font = { name: "Segoe UI", size: 7, bold: true, color: { argb: color } };
    valueCell.font = { name: "Segoe UI", size: 21, bold: true, color: { argb: color } };
    subtitleCell.font = { name: "Segoe UI", size: 8, italic: true, color: { argb: "FF64748B" } };
    titleCell.alignment = { horizontal: "left", vertical: "middle" };
    badgeCell.alignment = { horizontal: "right", vertical: "middle" };
    valueCell.alignment = { horizontal: "left", vertical: "middle" };
    subtitleCell.alignment = { horizontal: "left", vertical: "middle" };
    [titleCell, badgeCell, valueCell, subtitleCell].forEach((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: background } };
      cell.border = {
        top: { style: "thin", color: { argb: color } },
        bottom: { style: "thin", color: { argb: color } },
        left: { style: "thin", color: { argb: color } },
        right: { style: "thin", color: { argb: color } },
      };
    });
    for (let col = fromIndex; col <= toIndex; col += 1) {
      const barCell = wsVisual.getCell(10, col);
      const fillBar = progress >= (col - fromIndex + 1) / (toIndex - fromIndex + 1)
        ? color
        : "FFDCE5ED";
      barCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillBar } };
      barCell.border = {
        top: { style: "thin", color: { argb: background } },
        bottom: { style: "thin", color: { argb: background } },
      };
    }
  });
  wsVisual.getRow(7).height = 22;
  wsVisual.getRow(8).height = 34;
  wsVisual.getRow(9).height = 19;
  wsVisual.getRow(10).height = 7;

  const visualPanels = [
    [11, 22, 2, 8], [11, 22, 9, 15],
    [24, 35, 2, 8], [24, 35, 9, 15],
    [37, 48, 2, 8], [37, 48, 9, 15],
  ];
  visualPanels.forEach(([fromRow, toRow, fromCol, toCol]) => {
    for (let row = fromRow; row <= toRow; row += 1) {
      for (let col = fromCol; col <= toCol; col += 1) {
        const cell = wsVisual.getCell(row, col);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
        cell.border = {
          top: row === fromRow ? { style: "medium", color: { argb: "FFD5E1EC" } } : undefined,
          bottom: row === toRow ? { style: "medium", color: { argb: "FFD5E1EC" } } : undefined,
          left: col === fromCol ? { style: "medium", color: { argb: "FFD5E1EC" } } : undefined,
          right: col === toCol ? { style: "medium", color: { argb: "FFD5E1EC" } } : undefined,
        };
      }
    }
  });

  // Los seis gráficos se incorporan como objetos nativos de Excel después de escribir el libro.

  wsVisual.mergeCells("I51:O51");
  wsVisual.getCell("I51").value = "INDICADORES DEL PERÍODO";
  wsVisual.getCell("I51").font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  wsVisual.getCell("I51").fill = fillNavy;
  wsVisual.getCell("I51").alignment = { horizontal: "center", vertical: "middle" };
  const visualRows = [
    ["Total de enrolamientos", totalEnrolados, "FF0B2A5B"],
    ["Sincronizados", `${exec.tasaSincronizacion || 100}%`, "FF0F766E"],
    ["Registros válidos", `${exec.tasaRegistroBiometrico || 100}%`, "FF2B5FAE"],
    ["Con observaciones", `${exec.tasaError || 0}%`, "FFD92D20"],
    ["Puestos o cuarteles", (data.rendimientoCuarteles || []).length, "FF64748B"],
  ];
  visualRows.forEach(([label, value, color], index) => {
    const row = 52 + index;
    wsVisual.mergeCells(`I${row}:M${row}`);
    wsVisual.getCell(`I${row}`).value = label;
    wsVisual.getCell(`I${row}`).font = { name: "Segoe UI", size: 10, color: { argb: "FF334155" } };
    wsVisual.getCell(`I${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF8FAFC" : "FFFFFFFF" } };
    wsVisual.mergeCells(`N${row}:O${row}`);
    wsVisual.getCell(`N${row}`).value = value;
    wsVisual.getCell(`N${row}`).font = { name: "Segoe UI", size: 13, bold: true, color: { argb: color } };
    wsVisual.getCell(`N${row}`).alignment = { horizontal: "right", vertical: "middle" };
    ["I", "J", "K", "L", "M", "N", "O"].forEach((col) => { wsVisual.getCell(`${col}${row}`).border = borderThin; });
  });
  wsVisual.mergeCells("B58:O59");
  wsVisual.getCell("B58").value = "Nota: este resumen está orientado a lectura ejecutiva. El detalle por unidad se encuentra en la hoja siguiente.";
  wsVisual.getCell("B58").font = { name: "Segoe UI", size: 10, color: { argb: "FF64748B" }, italic: true };
  wsVisual.getCell("B58").alignment = { wrapText: true, vertical: "top" };

  // ============================================================================
  // HOJA 2: MATRIZ COMPLETA DE CUARTELES
  // ============================================================================

  const ws2 = workbook.addWorksheet("Detalle por Cuartel", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    properties: { tabColor: { argb: "FFD4AF37" } },
    headerFooter: {
      oddFooter: "&CInforme generado por Sistema Analítico ABIS | PDI",
    },
  });

  // Título Hoja 2
  ws2.mergeCells("A1:A2");
  const detailLogo = ws2.getCell("A1");
  detailLogo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  detailLogo.alignment = { horizontal: "center", vertical: "middle" };
  if (logoId !== null) {
    ws2.addImage(logoId, { tl: { col: 0.08, row: 0.25 }, ext: { width: 82, height: 43 } });
  }

  ws2.mergeCells("B1:F1");
  const h2TitleText = ws2.getCell("B1");
  h2TitleText.value = `DETALLE POR CUARTEL Y UNIDAD (${fechaPeriodo})`;
  h2TitleText.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  h2TitleText.fill = fillNavy;
  h2TitleText.alignment = { horizontal: "center", vertical: "middle" };
  ws2.mergeCells("B2:F2");
  const h2Subtitle = ws2.getCell("B2");
  h2Subtitle.value = "Volumen procesado, sincronización y casos para revisar";
  h2Subtitle.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FFCBD5E1" } };
  h2Subtitle.fill = fillNavy;
  h2Subtitle.alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(1).height = 30;
  ws2.getRow(2).height = 20;

  // Cabeceras Hoja 2
  const headersSheet2 = ["Puesto / Cuartel", "Unidad PDI", "Total", "Sincronizados", "Con observaciones", "Cumplimiento"];
  headersSheet2.forEach((h, i) => {
    const colIdx = i + 1;
    const c = ws2.getCell(4, colIdx);
    c.value = h;
    c.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fillNavy;
    c.alignment = { horizontal: i >= 2 ? "right" : "left", vertical: "middle" };
    c.border = { bottom: { style: "medium", color: { argb: "FFD4AF37" } } };
  });
  ws2.getRow(4).height = 22;

  let r2 = 5;
  cuarteles.forEach((c, idx) => {
    const isEven = idx % 2 === 0;
    const rowFill = isEven
      ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } }
      : { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

    const c1 = ws2.getCell(r2, 1);
    c1.value = c.cuartel;

    const c2 = ws2.getCell(r2, 2);
    c2.value = c.unidad;

    const c3 = ws2.getCell(r2, 3);
    c3.value = Number(c.total) || 0;
    c3.numFmt = "#,##0";
    c3.font = { bold: true };

    const c4 = ws2.getCell(r2, 4);
    c4.value = Number(c.sincronizados) || 0;
    c4.numFmt = "#,##0";
    c4.font = { color: { argb: "FF047857" } };

    const c5 = ws2.getCell(r2, 5);
    c5.value = Number(c.conError) || 0;
    c5.numFmt = "#,##0";
    if (Number(c.conError) > 0) c5.font = { bold: true, color: { argb: "FFDC2626" } };

    const c6 = ws2.getCell(r2, 6);
    const tasa = parseFloat(c.tasaExito) / 100 || 0;
    c6.value = tasa;
    c6.numFmt = "0.0%";
    c6.font = { bold: true, color: { argb: tasa >= 0.95 ? "FF047857" : "FFD97706" } };

    [c1, c2, c3, c4, c5, c6].forEach((cell, ci) => {
      cell.fill = rowFill;
      cell.border = borderThin;
      if (!cell.font) cell.font = { name: "Segoe UI", size: 9 };
      else cell.font.name = "Segoe UI";
      if (ci >= 2) cell.alignment = { horizontal: "right", vertical: "middle" };
      else cell.alignment = { horizontal: "left", vertical: "middle" };
    });
    ws2.getRow(r2).height = 20;
    r2++;
  });

  ws2.getColumn(1).width = 28;
  ws2.getColumn(2).width = 36;
  ws2.getColumn(3).width = 18;
  ws2.getColumn(4).width = 20;
  ws2.getColumn(5).width = 20;
  ws2.getColumn(6).width = 16;
  ws2.autoFilter = { from: "A4", to: `F${Math.max(4, r2 - 1)}` };
  ws2.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  // Generar Buffer binario .xlsx
  const workbookBuffer = await workbook.xlsx.writeBuffer();
  return await inyectarGraficosNativos(workbookBuffer, chartDefinitions);
}

module.exports = { generarReporteExcel };
