const { chromium } = require("playwright");

let browserInstance = null;

/**
 * Obtiene o reutiliza una instancia ligera de Chromium headless
 */
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
  }
  return browserInstance;
}

/**
 * Renderiza HTML a un Buffer PNG de alta definición (Retina 2x)
 */
async function renderHtmlToPng(html, selector = "#captura-root") {
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: 2, // Garantiza 300 DPI / nitidez cristalina en Telegram
  });

  try {
    await page.setContent(html, { waitUntil: "load" });
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`Elemento selector ${selector} no encontrado en la plantilla HTML.`);
    }
    const buffer = await element.screenshot({ type: "png", omitBackground: false });
    return buffer;
  } finally {
    await page.close();
  }
}

/**
 * Formatea números al estilo chileno con separador de miles si aplica
 */
function fmtNum(n) {
  if (n === undefined || n === null) return "0";
  return Number(n).toLocaleString("es-CL");
}

function fmtPct(p) {
  if (p === undefined || p === null) return "0,0";
  return Number(p).toFixed(1).replace(".", ",");
}

/**
 * Genera la Captura 1 de Lunes: Matriz de Estados de Fin de Semana (Viernes, Sábado, Domingo, Total)
 * Replica exactamente el formato de la captura institucional PDI.
 */
async function generarCapturaMatrizFinDeSemana(reporteFds) {
  const { fechas, matriz, totalFinDeSemana } = reporteFds;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #ffffff;
    font-family: Arial, "Segoe UI", sans-serif;
    padding: 16px;
    display: inline-block;
  }
  #captura-root {
    background: #ffffff;
    padding: 12px;
    display: inline-block;
  }
  .matrix-table {
    border-collapse: collapse;
    border: 2px solid #000000;
    font-size: 13px;
    color: #000000;
  }
  .matrix-table th, .matrix-table td {
    border: 1px solid #000000;
    padding: 3px 8px;
    text-align: center;
    white-space: nowrap;
    vertical-align: middle;
  }
  .th-fecha {
    font-size: 13px;
    font-weight: bold;
    padding: 8px 12px;
    letter-spacing: 0.5px;
  }
  .th-total-fds {
    font-size: 12px;
    font-weight: bold;
    padding: 6px 10px;
    line-height: 1.25;
    max-width: 170px;
    white-space: normal;
  }
  .sub-header-col {
    font-weight: bold;
    font-size: 12px;
    padding: 4px 8px;
    text-align: left;
    line-height: 1.15;
  }
  .sub-header-qty {
    font-weight: bold;
    font-size: 12px;
  }
  .col-label {
    text-align: left;
    padding-left: 12px;
    font-size: 13px;
    min-width: 135px;
  }
  .col-val {
    min-width: 75px;
    font-size: 13px;
  }
  .text-green { color: #137333; font-weight: 500; }
  .text-red { color: #c5221f; font-weight: 500; }
  .text-bold { font-weight: bold; }
  .row-sep td {
    height: 12px;
    padding: 0;
    background: #ffffff;
    border-left: 1px solid #000000;
    border-right: 1px solid #000000;
  }
</style>
</head>
<body>
<div id="captura-root">
  <table class="matrix-table">
    <thead>
      <tr>
        <th class="th-fecha">FECHA</th>
        <th class="th-fecha">${fechas.viernesFmt}</th>
        <th class="th-fecha">${fechas.sabadoFmt}</th>
        <th class="th-fecha">${fechas.domingoFmt}</th>
        <th class="th-total-fds">Total del Fin de semana<br>del ${fechas.desdeFmt} al ${fechas.hastaFmt}</th>
      </tr>
    </thead>
    <tbody>
      <!-- BLOQUE 1: SINCRONIZACIÓN PDI -->
      <tr>
        <td class="sub-header-col">Sincronización<br>PDI</td>
        <td class="sub-header-qty">CANTIDAD</td>
        <td class="sub-header-qty">CANTIDAD</td>
        <td class="sub-header-qty">CANTIDAD</td>
        <td class="sub-header-qty">CANTIDAD</td>
      </tr>
      <tr>
        <td class="col-label text-green">Sincronizado</td>
        <td class="col-val">${fmtNum(matriz.sincronizacion.sincronizado[0])}</td>
        <td class="col-val">${fmtNum(matriz.sincronizacion.sincronizado[1])}</td>
        <td class="col-val">${fmtNum(matriz.sincronizacion.sincronizado[2])}</td>
        <td class="col-val">${fmtNum(totalFinDeSemana.sincronizacion.sincronizado)}</td>
      </tr>
      <tr>
        <td class="col-label">Pendiente</td>
        <td class="col-val">${fmtNum(matriz.sincronizacion.pendiente[0])}</td>
        <td class="col-val">${fmtNum(matriz.sincronizacion.pendiente[1])}</td>
        <td class="col-val">${fmtNum(matriz.sincronizacion.pendiente[2])}</td>
        <td class="col-val">${fmtNum(totalFinDeSemana.sincronizacion.pendiente)}</td>
      </tr>
      <tr>
        <td class="col-label">Error</td>
        <td class="col-val">${fmtNum(matriz.sincronizacion.error[0])}</td>
        <td class="col-val">${fmtNum(matriz.sincronizacion.error[1])}</td>
        <td class="col-val">${fmtNum(matriz.sincronizacion.error[2])}</td>
        <td class="col-val">${fmtNum(totalFinDeSemana.sincronizacion.error)}</td>
      </tr>
      <tr>
        <td class="col-label text-bold">TOTAL</td>
        <td class="col-val text-bold">${fmtNum(matriz.sincronizacion.total[0])}</td>
        <td class="col-val text-bold">${fmtNum(matriz.sincronizacion.total[1])}</td>
        <td class="col-val text-bold">${fmtNum(matriz.sincronizacion.total[2])}</td>
        <td class="col-val text-bold">${fmtNum(totalFinDeSemana.sincronizacion.total)}</td>
      </tr>

      <!-- FILA SEPARADORA -->
      <tr class="row-sep"><td colspan="5"></td></tr>

      <!-- BLOQUE 2: REGISTRACIÓN BIOMÉTRICA -->
      <tr>
        <td class="sub-header-col">Registración<br>Biométrica</td>
        <td class="sub-header-qty">CANTIDAD</td>
        <td class="sub-header-qty">CANTIDAD</td>
        <td class="sub-header-qty">CANTIDAD</td>
        <td class="sub-header-qty">CANTIDAD</td>
      </tr>
      <tr>
        <td class="col-label text-green">Registrado</td>
        <td class="col-val">${fmtNum(matriz.registro.registrado[0])}</td>
        <td class="col-val">${fmtNum(matriz.registro.registrado[1])}</td>
        <td class="col-val">${fmtNum(matriz.registro.registrado[2])}</td>
        <td class="col-val">${fmtNum(totalFinDeSemana.registro.registrado)}</td>
      </tr>
      <tr>
        <td class="col-label text-red">Error</td>
        <td class="col-val">${fmtNum(matriz.registro.error[0])}</td>
        <td class="col-val">${fmtNum(matriz.registro.error[1])}</td>
        <td class="col-val">${fmtNum(matriz.registro.error[2])}</td>
        <td class="col-val">${fmtNum(totalFinDeSemana.registro.error)}</td>
      </tr>
      <tr>
        <td class="col-label">No Registrado</td>
        <td class="col-val">${fmtNum(matriz.registro.noRegistrado[0])}</td>
        <td class="col-val">${fmtNum(matriz.registro.noRegistrado[1])}</td>
        <td class="col-val">${fmtNum(matriz.registro.noRegistrado[2])}</td>
        <td class="col-val">${fmtNum(totalFinDeSemana.registro.noRegistrado)}</td>
      </tr>
      <tr>
        <td class="col-label">Pendiente</td>
        <td class="col-val">${fmtNum(matriz.registro.pendiente[0])}</td>
        <td class="col-val">${fmtNum(matriz.registro.pendiente[1])}</td>
        <td class="col-val">${fmtNum(matriz.registro.pendiente[2])}</td>
        <td class="col-val">${fmtNum(totalFinDeSemana.registro.pendiente)}</td>
      </tr>
      <tr>
        <td class="col-label text-bold">TOTAL</td>
        <td class="col-val text-bold">${fmtNum(matriz.registro.total[0])}</td>
        <td class="col-val text-bold">${fmtNum(matriz.registro.total[1])}</td>
        <td class="col-val text-bold">${fmtNum(matriz.registro.total[2])}</td>
        <td class="col-val text-bold">${fmtNum(totalFinDeSemana.registro.total)}</td>
      </tr>

      <!-- FILA SEPARADORA -->
      <tr class="row-sep"><td colspan="5"></td></tr>

      <!-- BLOQUE 3: ESTADO GENERAL -->
      <tr>
        <td class="sub-header-col">Estado General</td>
        <td class="sub-header-qty">CANTIDAD</td>
        <td class="sub-header-qty">CANTIDAD</td>
        <td class="sub-header-qty">CANTIDAD</td>
        <td class="sub-header-qty">CANTIDAD</td>
      </tr>
      <tr>
        <td class="col-label text-green">Registrado</td>
        <td class="col-val">${fmtNum(matriz.general.registrado[0])}</td>
        <td class="col-val">${fmtNum(matriz.general.registrado[1])}</td>
        <td class="col-val">${fmtNum(matriz.general.registrado[2])}</td>
        <td class="col-val">${fmtNum(totalFinDeSemana.general.registrado)}</td>
      </tr>
      <tr>
        <td class="col-label text-red">Error</td>
        <td class="col-val">${fmtNum(matriz.general.error[0])}</td>
        <td class="col-val">${fmtNum(matriz.general.error[1])}</td>
        <td class="col-val">${fmtNum(matriz.general.error[2])}</td>
        <td class="col-val">${fmtNum(totalFinDeSemana.general.error)}</td>
      </tr>
      <tr>
        <td class="col-label">En Curso</td>
        <td class="col-val">${fmtNum(matriz.general.enCurso[0])}</td>
        <td class="col-val">${fmtNum(matriz.general.enCurso[1])}</td>
        <td class="col-val">${fmtNum(matriz.general.enCurso[2])}</td>
        <td class="col-val">${fmtNum(totalFinDeSemana.general.enCurso)}</td>
      </tr>
      <tr>
        <td class="col-label text-bold">TOTAL</td>
        <td class="col-val text-bold">${fmtNum(matriz.general.total[0])}</td>
        <td class="col-val text-bold">${fmtNum(matriz.general.total[1])}</td>
        <td class="col-val text-bold">${fmtNum(matriz.general.total[2])}</td>
        <td class="col-val text-bold">${fmtNum(totalFinDeSemana.general.total)}</td>
      </tr>
    </tbody>
  </table>
</div>
</body>
</html>`;

  return renderHtmlToPng(html, "#captura-root");
}

/**
 * Renderiza el tablero visual de 6 columnas estilo Excel para Enrolados / Registros ABIS
 */
function renderTableroExcelHtml({
  titulo,
  tipoFiltro = "ENROLADO", // "ENROLADO" | "TODOS"
  total = 0,
  nacionalidades = [],
  unidades = [],
  cuarteles = [],
  dispositivos = [],
  nna = null,
  edad = [],
  genero = [],
  regiones = null,
  regionesPivote = null,
  anios = [2023, 2024, 2025, 2026],
  esRango = false,
  anioRango = "2026",
}) {
  const isTodos = String(tipoFiltro).toUpperCase() === "TODOS";
  const fltLabel1 = isTodos ? "Usuario" : "TIPO REGISTRO";
  const fltVal1 = isTodos ? "(Todas)" : "ENROLADO";

  const renderFilterTable = (lbl1 = fltLabel1, val1 = fltVal1, lbl2 = "Fecha", val2 = "(Todas)") => `
    <table class="filter-table">
      <tr>
        <td class="flt-lbl">${lbl1}</td>
        <td class="flt-val">${val1} <span class="arrow">▼</span></td>
      </tr>
      ${lbl2 ? `<tr><td class="flt-lbl">${lbl2}</td><td class="flt-val">${val2} <span class="arrow">▼</span></td></tr>` : ""}
    </table>
  `;

  const renderRows = (items, keyName, max = 25) => {
    const slice = (items || []).slice(0, max);
    if (slice.length === 0) {
      return `<tr><td class="td-name">(en blanco)</td><td class="td-val">0</td></tr>`;
    }
    return slice
      .map(
        (it) =>
          `<tr><td class="td-name">${it[keyName] || it.descripcion || it.nombre || "-"}</td><td class="td-val">${fmtNum(it.total)}</td></tr>`
      )
      .join("");
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #ffffff;
    font-family: Arial, "Segoe UI", sans-serif;
    padding: 16px;
    display: inline-block;
  }
  #captura-root {
    background: #ffffff;
    padding: 14px 20px;
    display: inline-block;
    max-width: 1580px;
  }
  .main-title {
    text-align: center;
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 0.5px;
    margin-bottom: 14px;
    color: #000000;
  }
  .excel-board {
    display: flex;
    flex-direction: row;
    gap: 12px;
    align-items: flex-start;
  }
  .excel-col {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .filter-table {
    border-collapse: collapse;
    margin-bottom: 4px;
    font-size: 10px;
    color: #000000;
  }
  .filter-table td {
    border: 1px solid #d9d9d9;
    padding: 1px 5px;
    white-space: nowrap;
  }
  .flt-lbl {
    background: #f2f2f2;
    color: #333333;
  }
  .flt-val {
    background: #ffffff;
    font-weight: 500;
    min-width: 65px;
  }
  .table-card {
    border: 1px solid #d9d9d9;
    border-collapse: collapse;
    font-size: 11px;
    color: #000000;
  }
  .table-card th, .table-card td {
    border: 1px solid #d9d9d9;
    padding: 2px 6px;
    white-space: nowrap;
  }
  .th-excel {
    background-color: #d9e1f2;
    font-weight: bold;
    text-align: left;
    font-size: 11px;
    color: #000000;
  }
  .th-excel .arrow {
    float: right;
    margin-left: 6px;
    color: #595959;
    font-size: 9px;
  }
  .td-name {
    text-align: left;
    min-width: 115px;
    max-width: 165px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .td-val {
    text-align: right;
    min-width: 45px;
  }
  .tr-total {
    background-color: #f2f2f2;
    font-weight: bold;
  }
  .tr-total td {
    border-top: 1.5px solid #8ea9db;
  }
  .excel-bottom {
    margin-top: 20px;
    display: flex;
    justify-content: center;
  }
</style>
</head>
<body>
<div id="captura-root">
  <div class="main-title">${titulo}</div>
  <div class="excel-board">

    <!-- COLUMNA 1: NACIONALIDAD -->
    <div class="excel-col">
      ${renderFilterTable()}
      <table class="table-card">
        <thead>
          <tr>
            <th class="th-excel">Nacionalidad <span class="arrow">▼</span></th>
            <th class="th-excel">Cuenta de Nacionalidad <span class="arrow">▼</span></th>
          </tr>
        </thead>
        <tbody>
          ${renderRows(nacionalidades, "nacionalidad", 22)}
          <tr class="tr-total">
            <td class="td-name">Total general</td>
            <td class="td-val">${fmtNum(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- COLUMNA 2: UNIDAD -->
    <div class="excel-col">
      ${renderFilterTable()}
      <table class="table-card">
        <thead>
          <tr>
            <th class="th-excel">Unidad <span class="arrow">▼</span></th>
            <th class="th-excel">Cantidad <span class="arrow">▼</span></th>
          </tr>
        </thead>
        <tbody>
          ${renderRows(unidades, "unidad", 16)}
          <tr class="tr-total">
            <td class="td-name">Total general</td>
            <td class="td-val">${fmtNum(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- COLUMNA 3: CUARTEL -->
    <div class="excel-col">
      ${renderFilterTable()}
      <table class="table-card">
        <thead>
          <tr>
            <th class="th-excel">Cuartel <span class="arrow">▼</span></th>
            <th class="th-excel">Cantidad <span class="arrow">▼</span></th>
          </tr>
        </thead>
        <tbody>
          ${renderRows(cuarteles, "cuartel", 16)}
          <tr class="tr-total">
            <td class="td-name">Total general</td>
            <td class="td-val">${fmtNum(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- COLUMNA 4: EQUIPO Y MENORES X NACIONALIDAD -->
    <div class="excel-col">
      ${renderFilterTable()}
      <table class="table-card">
        <thead>
          <tr>
            <th class="th-excel">Equipo <span class="arrow">▼</span></th>
            <th class="th-excel">Cantidad <span class="arrow">▼</span></th>
          </tr>
        </thead>
        <tbody>
          ${renderRows(dispositivos, "dispositivo", 6)}
          <tr class="tr-total">
            <td class="td-name">Total general</td>
            <td class="td-val">${fmtNum(total)}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top: 12px;">
        ${renderFilterTable()}
        <table class="table-card">
          <thead>
            <tr>
              <th class="th-excel" colspan="2" style="font-size: 10px;">Cuenta de Nacionalidad <span class="arrow">▼</span></th>
            </tr>
            <tr>
              <th class="th-excel">Menores X Nacionalidad <span class="arrow">▼</span></th>
              <th class="th-excel">Cantidad <span class="arrow">▼</span></th>
            </tr>
          </thead>
          <tbody>
            ${
              nna && nna.porNacionalidad && nna.porNacionalidad.length > 0
                ? nna.porNacionalidad
                    .map((n) => `<tr><td class="td-name">${n.nacionalidad}</td><td class="td-val">${fmtNum(n.total)}</td></tr>`)
                    .join("")
                : `<tr><td class="td-name">(en blanco)</td><td class="td-val">0</td></tr>`
            }
            <tr class="tr-total">
              <td class="td-name">Total general</td>
              <td class="td-val">${fmtNum(nna?.total || 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- COLUMNA 5: N.N.A. ENROLADOS (EDAD MENORES) -->
    <div class="excel-col">
      ${renderFilterTable("Fecha", "(Todas)", "Nacionalidad", "(Todas)")}
      <table class="table-card">
        <thead>
          <tr>
            <th colspan="2" class="th-excel" style="text-align: center;">N.N.A. ENROLADOS</th>
          </tr>
          <tr>
            <th class="th-excel">Edad Menores <span class="arrow">▼</span></th>
            <th class="th-excel">Cantidad <span class="arrow">▼</span></th>
          </tr>
        </thead>
        <tbody>
          ${
            nna && nna.porEdad && nna.porEdad.length > 0
              ? nna.porEdad
                  .map((e) => `<tr><td class="td-name">${e.edad_exacta}</td><td class="td-val">${fmtNum(e.total)}</td></tr>`)
                  .join("")
              : `<tr><td class="td-name">(sin menores)</td><td class="td-val">0</td></tr>`
          }
          <tr class="tr-total">
            <td class="td-name">Total general</td>
            <td class="td-val">${fmtNum(nna?.total || 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- COLUMNA 6: ETARIO Y GÉNERO -->
    <div class="excel-col">
      ${renderFilterTable()}
      <table class="table-card">
        <thead>
          <tr>
            <th class="th-excel">Etario <span class="arrow">▼</span></th>
            <th class="th-excel">Cantidad <span class="arrow">▼</span></th>
          </tr>
        </thead>
        <tbody>
          ${renderRows(edad, "categoria", 4)}
          <tr class="tr-total">
            <td class="td-name">Total general</td>
            <td class="td-val">${fmtNum(total)}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top: 12px;">
        ${renderFilterTable(fltLabel1, fltVal1, null, null)}
        <table class="table-card">
          <thead>
            <tr>
              <th class="th-excel">Etiquetas de fila <span class="arrow">▼</span></th>
              <th class="th-excel">Cuenta de GENERO <span class="arrow">▼</span></th>
            </tr>
          </thead>
          <tbody>
            ${
              genero && genero.length > 0
                ? genero
                    .map((g) => {
                      const raw = (g.genero || "").toUpperCase().trim();
                      const label =
                        raw === "M" || raw === "HOMBRE" || raw === "MASCULINO"
                          ? "HOMBRE"
                          : raw === "F" || raw === "MUJER" || raw === "FEMENINO"
                          ? "MUJER"
                          : raw || "OTRO";
                      return `<tr><td class="td-name">${label}</td><td class="td-val">${fmtNum(g.total)}</td></tr>`;
                    })
                    .join("")
                : `<tr><td class="td-name">(en blanco)</td><td class="td-val">0</td></tr>`
            }
            <tr class="tr-total">
              <td class="td-name">Total general</td>
              <td class="td-val">${fmtNum(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>

  <!-- SECCIÓN INFERIOR: REGIONES -->
  <div class="excel-bottom">
    <div style="display: flex; flex-direction: column; align-items: flex-start;">
      <div style="font-size: 10px; color: #595959; margin-bottom: 2px;">
        ${esRango ? "CANTIDAD" : "Cuenta de REGION ▼"}
      </div>
      <table class="table-card">
        <thead>
          <tr>
            <th class="th-excel">${esRango ? "Etario / Región" : "CANTIDAD<br>Etario / Región"} <span class="arrow">▼</span></th>
            ${
              esRango
                ? `<th class="th-excel">${anioRango} <span class="arrow">▼</span></th>`
                : anios.map((a) => `<th class="th-excel">${a} <span class="arrow">▼</span></th>`).join("")
            }
            <th class="th-excel">Total general</th>
          </tr>
        </thead>
        <tbody>
          ${
            esRango
              ? (regiones && regiones.length > 0
                  ? regiones
                      .map(
                        (r) =>
                          `<tr><td class="td-name">${r.region}</td><td class="td-val">${fmtNum(r.total)}</td><td class="td-val">${fmtNum(r.total)}</td></tr>`
                      )
                      .join("")
                  : `<tr><td class="td-name">(en blanco)</td><td class="td-val">0</td><td class="td-val">0</td></tr>`)
              : (regionesPivote && regionesPivote.length > 0
                  ? regionesPivote
                      .map((r) => {
                        const celdasAnios = anios
                          .map((a) => `<td class="td-val">${fmtNum(r.anios[a] || 0)}</td>`)
                          .join("");
                        return `<tr><td class="td-name">${r.region}</td>${celdasAnios}<td class="td-val">${fmtNum(r.total)}</td></tr>`;
                      })
                      .join("")
                  : `<tr><td class="td-name">(en blanco)</td><td class="td-val">0</td></tr>`)
          }
          <tr class="tr-total">
            <td class="td-name">Total general</td>
            ${
              esRango
                ? `<td class="td-val">${fmtNum(total)}</td><td class="td-val">${fmtNum(total)}</td>`
                : anios
                    .map((a) => {
                      const sumaAnio = (regionesPivote || []).reduce((sum, r) => sum + (r.anios[a] || 0), 0);
                      return `<td class="td-val">${fmtNum(sumaAnio)}</td>`;
                    })
                    .join("") + `<td class="td-val">${fmtNum(total)}</td>`
            }
          </tr>
        </tbody>
      </table>
    </div>
  </div>

</div>
</body>
</html>`;
}

/**
 * Genera la Captura 3 de Lunes: Tablas Dinámicas de Enrolados del Fin de Semana (Foto 3)
 * Replica exactamente el formato de la Imagen 3 de Excel.
 */
async function generarCapturaDistribucionFinDeSemana(reporteFds) {
  const { fechas, distribucion } = reporteFds;
  const mesTexto = fechas.desdeFmt.split("-")[1];
  const meses = { "01": "ENE", "02": "FEB", "03": "MAR", "04": "ABR", "05": "MAY", "06": "JUN", "07": "JUL", "08": "AGO", "09": "SEP", "10": "OCT", "11": "NOV", "12": "DIC" };
  const tagMes = meses[mesTexto] || "SEP";
  const anio = fechas.viernes.split("-")[0];
  const diaDesde = fechas.desdeFmt.split("-")[0];
  const diaHasta = fechas.hastaFmt.split("-")[0];

  const titulo = `TOTAL DE ENROLADOS EN EL SISTEMA ABIS DEL ${diaDesde} AL ${diaHasta}.${tagMes}.${anio}`;

  const html = renderTableroExcelHtml({
    ...distribucion,
    titulo,
    tipoFiltro: "ENROLADO",
    esRango: true,
    anioRango: anio,
  });

  return renderHtmlToPng(html, "#captura-root");
}

/**
 * Genera la Captura Diaria (Martes a Viernes, D-1)
 * Replica exactamente el formato de la Imagen 4 (25-08-2026).
 */
async function generarCapturaDiaria(reporteDiario) {
  const { fecha, desde, hasta, sincronizacion, registro, general } = reporteDiario;
  
  let fechaFmt;
  if (desde && hasta && desde !== hasta) {
    const [y1, m1, d1] = desde.split("-");
    const [y2, m2, d2] = hasta.split("-");
    fechaFmt = `${d1}-${m1}-${y1} AL ${d2}-${m2}-${y2}`;
  } else {
    const [y, m, d] = (fecha || desde || "2026-08-25").split("-");
    fechaFmt = `${d}-${m}-${y}`;
  }

  // Helper para buscar cantidad y porcentaje de un estado
  const findVal = (list, searchWord) => {
    const item = (list || []).find((x) => (x.descripcion || "").toUpperCase().includes(searchWord.toUpperCase()));
    return {
      total: item ? item.total : 0,
      porcentaje: item ? item.porcentaje : 0,
    };
  };

  const sincOk = findVal(sincronizacion, "SINCRONIZADO");
  const sincPend = findVal(sincronizacion, "PENDIENTE");
  const sincErr = findVal(sincronizacion, "ERROR");
  const sincTot = (sincronizacion || []).reduce((sum, x) => sum + x.total, 0);

  const regOk = findVal(registro, "REGISTRADO");
  const regErr = findVal(registro, "ERROR");
  const regNoReg = findVal(registro, "NO REGISTRADO");
  const regPend = findVal(registro, "PENDIENTE");
  const regTot = (registro || []).reduce((sum, x) => sum + x.total, 0);

  const genOk = findVal(general, "REGISTRADO");
  const genErr = findVal(general, "ERROR");
  const genCurso = findVal(general, "CURSO");
  const genTot = (general || []).reduce((sum, x) => sum + x.total, 0);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #ffffff;
    font-family: Arial, "Segoe UI", sans-serif;
    padding: 16px;
    display: inline-block;
  }
  #captura-root {
    background: #ffffff;
    padding: 8px;
    display: inline-block;
  }
  .daily-table {
    border-collapse: collapse;
    border: 2px solid #000000;
    font-size: 13px;
    color: #000000;
  }
  .daily-table th, .daily-table td {
    border: 1px solid #000000;
    padding: 3px 8px;
    text-align: center;
    white-space: nowrap;
    vertical-align: middle;
  }
  .th-fecha {
    font-size: 14px;
    font-weight: bold;
    padding: 6px 12px;
  }
  .sub-header-col {
    font-weight: bold;
    font-size: 12px;
    padding: 4px 8px;
    text-align: center;
    line-height: 1.15;
    min-width: 140px;
  }
  .sub-header-qty {
    font-weight: bold;
    font-size: 12px;
    min-width: 85px;
  }
  .col-label {
    text-align: left;
    padding-left: 12px;
    font-size: 13px;
  }
  .col-val {
    font-size: 13px;
  }
  .text-green { color: #137333; font-weight: 500; }
  .text-gold { color: #b06000; font-weight: 500; }
  .text-red { color: #c5221f; font-weight: 500; }
  .text-bold { font-weight: bold; }
  .row-sep td {
    height: 12px;
    padding: 0;
    background: #ffffff;
    border-left: 1px solid #000000;
    border-right: 1px solid #000000;
  }
</style>
</head>
<body>
<div id="captura-root">
  <table class="daily-table">
    <thead>
      <tr>
        <th colspan="3" class="th-fecha">${fechaFmt}</th>
      </tr>
    </thead>
    <tbody>
      <!-- BLOQUE 1: SINCRONIZACIÓN PDI -->
      <tr>
        <td class="sub-header-col">Sincronización<br>PDI</td>
        <td class="sub-header-qty">CANTIDAD</td>
        <td class="sub-header-qty">PORCENTAJE</td>
      </tr>
      <tr>
        <td class="col-label text-green">Sincronizado</td>
        <td class="col-val">${fmtNum(sincOk.total)}</td>
        <td class="col-val">${fmtPct(sincOk.porcentaje)}</td>
      </tr>
      <tr>
        <td class="col-label text-gold">Pendiente</td>
        <td class="col-val">${fmtNum(sincPend.total)}</td>
        <td class="col-val">${fmtPct(sincPend.porcentaje)}</td>
      </tr>
      <tr>
        <td class="col-label text-red">Error</td>
        <td class="col-val">${fmtNum(sincErr.total)}</td>
        <td class="col-val">${fmtPct(sincErr.porcentaje)}</td>
      </tr>
      <tr>
        <td class="col-label text-bold">TOTAL</td>
        <td class="col-val text-bold">${fmtNum(sincTot)}</td>
        <td class="col-val text-bold">${fmtPct(sincTot > 0 ? 100 : 0)}</td>
      </tr>

      <!-- FILA SEPARADORA -->
      <tr class="row-sep"><td colspan="3"></td></tr>

      <!-- BLOQUE 2: REGISTRACIÓN BIOMÉTRICA -->
      <tr>
        <td class="sub-header-col">Registración<br>Biométrica</td>
        <td class="sub-header-qty">CANTIDAD</td>
        <td class="sub-header-qty">PORCENTAJE</td>
      </tr>
      <tr>
        <td class="col-label text-green">Registrado</td>
        <td class="col-val">${fmtNum(regOk.total)}</td>
        <td class="col-val">${fmtPct(regOk.porcentaje)}</td>
      </tr>
      <tr>
        <td class="col-label text-red">Error</td>
        <td class="col-val">${fmtNum(regErr.total)}</td>
        <td class="col-val">${fmtPct(regErr.porcentaje)}</td>
      </tr>
      <tr>
        <td class="col-label">No Registrado</td>
        <td class="col-val">${fmtNum(regNoReg.total)}</td>
        <td class="col-val">${fmtPct(regNoReg.porcentaje)}</td>
      </tr>
      <tr>
        <td class="col-label text-gold">Pendiente</td>
        <td class="col-val">${fmtNum(regPend.total)}</td>
        <td class="col-val">${fmtPct(regPend.porcentaje)}</td>
      </tr>
      <tr>
        <td class="col-label text-bold">TOTAL</td>
        <td class="col-val text-bold">${fmtNum(regTot)}</td>
        <td class="col-val text-bold">${fmtPct(regTot > 0 ? 100 : 0)}</td>
      </tr>

      <!-- FILA SEPARADORA -->
      <tr class="row-sep"><td colspan="3"></td></tr>

      <!-- BLOQUE 3: ESTADO GENERAL -->
      <tr>
        <td class="sub-header-col">Estado General</td>
        <td class="sub-header-qty">CANTIDAD</td>
        <td class="sub-header-qty">PORCENTAJE</td>
      </tr>
      <tr>
        <td class="col-label text-green">Registrado</td>
        <td class="col-val">${fmtNum(genOk.total)}</td>
        <td class="col-val">${fmtPct(genOk.porcentaje)}</td>
      </tr>
      <tr>
        <td class="col-label text-red">Error</td>
        <td class="col-val">${fmtNum(genErr.total)}</td>
        <td class="col-val">${fmtPct(genErr.porcentaje)}</td>
      </tr>
      <tr>
        <td class="col-label text-gold">En Curso</td>
        <td class="col-val">${fmtNum(genCurso.total)}</td>
        <td class="col-val">${fmtPct(genCurso.porcentaje)}</td>
      </tr>
      <tr>
        <td class="col-label text-bold">TOTAL</td>
        <td class="col-val text-bold">${fmtNum(genTot)}</td>
        <td class="col-val text-bold">${fmtPct(genTot > 0 ? 100 : 0)}</td>
      </tr>
    </tbody>
  </table>
</div>
</body>
</html>`;

  return renderHtmlToPng(html, "#captura-root");
}

/**
 * Genera las Capturas de Acumulados Históricos (Fotos 2 y 4 de los Lunes):
 * - Foto 2: TOTAL DE ENROLADOS EN EL SISTEMA ABIS ACUMULADO AL AÑO 2026 (tipoFiltro: 'ENROLADO')
 * - Foto 4: TOTAL DE REGISTROS EN EL SISTEMA ABIS ACOMULADO AL AÑO 2026 (tipoFiltro: 'TODOS')
 */
async function generarCapturaAcumulado(dataAcumulada, { titulo, tipoFiltro = "ENROLADO", anio = 2026 } = {}) {
  const html = renderTableroExcelHtml({
    ...dataAcumulada,
    titulo,
    tipoFiltro,
    esRango: false,
    anios: dataAcumulada.aniosDisponibles || [2023, 2024, 2025, 2026],
  });

  return renderHtmlToPng(html, "#captura-root");
}

module.exports = {
  generarCapturaMatrizFinDeSemana,
  generarCapturaDistribucionFinDeSemana,
  generarCapturaAcumulado,
  generarCapturaDiaria,
  renderHtmlToPng,
};

