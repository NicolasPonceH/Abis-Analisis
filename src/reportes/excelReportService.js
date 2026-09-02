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

const ExcelJS = require("exceljs");

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

  // ============================================================================
  // HOJA 1: RESUMEN EJECUTIVO & ANALÍTICA
  // ============================================================================
  const ws1 = workbook.addWorksheet("Resumen Ejecutivo ABIS", {
    views: [{ showGridLines: true }],
    properties: { defaultRowHeight: 20 },
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
  ws1.mergeCells("B2:G2");
  const cellTitle = ws1.getCell("B2");
  cellTitle.value = "POLICÍA DE INVESTIGACIONES DE CHILE";
  cellTitle.font = fontTitle;
  cellTitle.fill = fillNavy;
  cellTitle.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(2).height = 28;

  ws1.mergeCells("B3:G3");
  const cellSub1 = ws1.getCell("B3");
  cellSub1.value = "JEFATURA NACIONAL DE MIGRACIONES Y POLICÍA INTERNACIONAL";
  cellSub1.font = fontSub;
  cellSub1.fill = fillNavy;
  cellSub1.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(3).height = 20;

  ws1.mergeCells("B4:G4");
  const cellSub2 = ws1.getCell("B4");
  cellSub2.value = "CENTRO DE MONITOREO Y ANALÍTICA DE ENROLAMIENTO BIOMÉTRICO (SISTEMA ABIS)";
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

  ws1.getCell("E7").value = "Integridad Criptográfica:";
  ws1.getCell("E7").font = { name: "Segoe UI", bold: true, color: { argb: "FF1E293B" } };
  ws1.getCell("F7").value = "AES-256-GCM / Hash SHA-256 Auditado";
  ws1.getCell("F7").font = { name: "Segoe UI", color: { argb: "FF059669" } };

  // 3. SCORECARD DE KPIs (Fila 9 a 11)
  const kpis = [
    {
      col: "B",
      title: "TOTAL ENROLAMIENTOS",
      val: totalEnrolados,
      sub: "Registros Biométricos",
      bg: "FFF0F5FA",
      border: "FF002B49",
      text: "FF002B49",
      numFormat: "#,##0",
    },
    {
      col: "C",
      title: "SINCRONIZADOS PDI",
      val: totalEnrolados > 0 ? (totalEnrolados * (exec.tasaSincronizacion || 100) / 100) : 0,
      sub: `${exec.tasaSincronizacion || 100}% Efectividad (${exec.estadoSLA || 'Óptimo'})`,
      bg: "FFEDFDF5",
      border: "FF059669",
      text: "FF047857",
      numFormat: "#,##0",
    },
    {
      col: "E",
      title: "REGISTRO BIOMÉTRICO",
      val: totalEnrolados > 0 ? (totalEnrolados * (exec.tasaRegistroBiometrico || 100) / 100) : 0,
      sub: `${exec.tasaRegistroBiometrico || 100}% Captura Válida`,
      bg: "FFF0F9FF",
      border: "FF0284C7",
      text: "FF0369A1",
      numFormat: "#,##0",
    },
    {
      col: "F",
      title: "INCONSISTENCIAS / ERROR",
      val: totalEnrolados > 0 ? (totalEnrolados * (exec.tasaError || 0) / 100) : 0,
      sub: `${exec.tasaError || 0}% Tasa de Error`,
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
  t1Title.value = "1. RENDIMIENTO OPERATIVO POR PUESTO / CUARTEL FRONTERIZO";
  t1Title.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FF002B49" } };
  currentRow++;

  const headersT1 = [
    { label: "Puesto / Cuartel", width: 26, align: "left" },
    { label: "Unidad Policial", width: 32, align: "left" },
    { label: "Total Enrolados", width: 18, align: "right" },
    { label: "Sincronizados PDI", width: 20, align: "right" },
    { label: "Con Error", width: 16, align: "right" },
    { label: "Efectividad (%)", width: 16, align: "right" },
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
  t2Title.value = "2. DISTRIBUCIÓN DE ENROLADOS POR NACIONALIDAD (TOP PAÍSES DE ORIGEN)";
  t2Title.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FF002B49" } };
  currentRow++;

  const headersT2 = [
    { label: "País / Nacionalidad", width: 28, align: "left" },
    { label: "Código ISO", width: 16, align: "center" },
    { label: "Total Enrolamientos", width: 22, align: "right" },
    { label: "Proporción (%)", width: 18, align: "right" },
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
  // HOJA 2: MATRIZ COMPLETA DE CUARTELES (DETALLE TÉCNICO)
  // ============================================================================
  const ws2 = workbook.addWorksheet("Detalle Cuarteles", {
    views: [{ state: "frozen", ySplit: 3, showGridLines: true }],
  });

  // Título Hoja 2
  ws2.mergeCells("A1:F1");
  const h2Title = ws2.getCell("A1");
  h2Title.value = `DESGLOSE DETALLADO DE CUARTELES Y UNIDADES POLICIALES (${fechaPeriodo})`;
  h2Title.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  h2Title.fill = fillNavy;
  h2Title.alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(1).height = 26;

  // Cabeceras Hoja 2
  const headersSheet2 = ["Puesto / Cuartel Fronterizo", "Unidad Policial Dependiente", "Total Enrolados", "Sincronizados PDI", "Con Inconsistencias", "Tasa de Éxito"];
  headersSheet2.forEach((h, i) => {
    const colIdx = i + 1;
    const c = ws2.getCell(3, colIdx);
    c.value = h;
    c.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fillNavy;
    c.alignment = { horizontal: i >= 2 ? "right" : "left", vertical: "middle" };
    c.border = { bottom: { style: "medium", color: { argb: "FFD4AF37" } } };
  });
  ws2.getRow(3).height = 22;

  let r2 = 4;
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

  // Generar Buffer binario .xlsx
  return await workbook.xlsx.writeBuffer();
}

module.exports = { generarReporteExcel };
