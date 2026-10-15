const fs = require("fs");
const path = require("path");

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow: DocxTableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  Header,
  Footer,
  VerticalAlign,
  ImageRun,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  VerticalPositionAlign,
  VerticalPositionRelativeFrom,
  TextWrappingType,
} = require("docx");

const LOGO_PATH = path.join(__dirname, "../../public/assets/acta-template-logo.png");

function TableRow(options) {
  return new DocxTableRow({ cantSplit: true, ...options });
}

function leerLogo() {
  try {
    return fs.readFileSync(LOGO_PATH);
  } catch (error) {
    console.warn("[WORD] No se pudo cargar el logo del template:", error.message);
    return null;
  }
}

function logoInline(logoBuffer, width = 68, height = 37) {
  if (!logoBuffer) return run("PDI", { size: 24, bold: true, color: "FFFFFF" });
  return new ImageRun({
    type: "png",
    data: logoBuffer,
    transformation: { width, height },
  });
}

function logoMarcaAgua(logoBuffer) {
  if (!logoBuffer) return null;
  const encoded = logoBuffer.toString("base64");
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="760" height="420" viewBox="0 0 760 420">
      <image href="data:image/png;base64,${encoded}" x="70" y="70" width="620" height="280" opacity="0.075" preserveAspectRatio="xMidYMid meet" />
    </svg>
  `);

  return new Paragraph({
    spacing: { before: 0, after: 0, line: 1 },
    children: [new ImageRun({
      type: "svg",
      data: svg,
      fallback: { type: "png", data: logoBuffer },
      transformation: { width: 380, height: 210 },
      floating: {
        horizontalPosition: {
          relative: HorizontalPositionRelativeFrom.PAGE,
          align: HorizontalPositionAlign.CENTER,
        },
        verticalPosition: {
          relative: VerticalPositionRelativeFrom.PAGE,
          align: VerticalPositionAlign.CENTER,
        },
        wrap: { type: TextWrappingType.NONE },
        behindDocument: true,
        allowOverlap: true,
        zIndex: 0,
      },
    })],
  });
}

const COLORS = {
  navy: "0B2A5B",
  teal: "0F766E",
  blue: "2B5FAE",
  pink: "C2255C",
  red: "D92D20",
  gold: "C69214",
  text: "1F2937",
  muted: "64748B",
  border: "CBD5E1",
  light: "E8EDF5",
};

const FONT = "Arial";

function numero(valor) {
  return Number(valor || 0).toLocaleString("es-CL");
}

function porcentaje(valor, fallback = 0) {
  const n = Number(valor);
  return `${Number.isFinite(n) ? n : fallback}%`;
}

function fechaCorta(fecha) {
  if (!fecha) return "N/D";
  const match = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(fecha);
}

function fechaPeriodo(data, meta) {
  if (data.desde && data.hasta) {
    const jornadas = data.diasConDatos ? ` (${numero(data.diasConDatos)} jornadas operativas)` : "";
    return `Desde ${fechaCorta(data.desde)} hasta ${fechaCorta(data.hasta)}${jornadas}`;
  }
  return fechaCorta(data.fecha || meta.fecha);
}

function textoSeguro(valor, fallback = "N/D") {
  return valor === undefined || valor === null || String(valor).trim() === ""
    ? fallback
    : String(valor);
}

function bordes(color = COLORS.border, size = 1) {
  const borde = { style: BorderStyle.SINGLE, size, color };
  return { top: borde, bottom: borde, left: borde, right: borde };
}

const SIN_BORDES = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function run(text, options = {}) {
  return new TextRun({
    text: String(text),
    font: FONT,
    size: options.size || 19,
    color: options.color || COLORS.text,
    bold: Boolean(options.bold),
    italics: Boolean(options.italics),
  });
}

function parrafo(text = "", options = {}) {
  return new Paragraph({
    alignment: options.alignment,
    spacing: options.spacing,
    keepNext: options.keepNext,
    children: options.children || [run(text, options)],
  });
}

function celda(text, options = {}) {
  return new TableCell({
    children: options.children || [
      parrafo(textoSeguro(text, ""), {
        alignment: options.alignment,
        spacing: { before: 45, after: 45 },
        children: [run(textoSeguro(text, ""), {
          size: options.size || 18,
          color: options.color || COLORS.text,
          bold: options.bold,
          italics: options.italics,
        })],
      }),
    ],
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    borders: options.borders,
    shading: options.fill ? { fill: options.fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: options.columnSpan,
  });
}

function celdaCabecera(text, width, fill = COLORS.navy, alignment = AlignmentType.LEFT) {
  return celda(text, {
    width,
    fill,
    alignment,
    bold: true,
    color: "FFFFFF",
    size: 17,
    borders: bordes("FFFFFF", 1),
  });
}

function tabla(rows, options = {}) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: options.borders || bordes(),
    rows,
  });
}

function espacio(after = 100) {
  return parrafo("", { spacing: { after } });
}

function tituloSeccion(numeroSeccion, titulo, descripcion) {
  return [
    parrafo(`${numeroSeccion}. ${titulo}`, {
      spacing: { before: 190, after: 55 },
      keepNext: true,
      children: [run(`${numeroSeccion}. ${titulo}`, { size: 21, bold: true, color: COLORS.navy })],
    }),
    parrafo(descripcion, {
      spacing: { after: 110 },
      keepNext: true,
      children: [run(descripcion, { size: 16, color: COLORS.muted, italics: true })],
    }),
  ];
}

function crearMembrete(logoBuffer) {
  return tabla([
    new TableRow({
      children: [
        celda("", {
          width: 18,
          fill: "FFFFFF",
          alignment: AlignmentType.CENTER,
          borders: SIN_BORDES,
          children: [parrafo("", {
            alignment: AlignmentType.CENTER,
            spacing: { before: 45, after: 45 },
            children: [logoInline(logoBuffer, 74, 41)],
          })],
        }),
        celda("POLICÍA DE INVESTIGACIONES DE CHILE\nSISTEMA ABIS\nINFORME ESTADÍSTICO DE IDENTIFICACIÓN BIOMÉTRICA", {
          width: 82,
          alignment: AlignmentType.LEFT,
          bold: true,
          color: COLORS.navy,
          size: 18,
          borders: SIN_BORDES,
        }),
      ],
    }),
  ], { borders: SIN_BORDES });
}

function crearTablaMetadatos(periodo, fechaEmision) {
  return tabla([
    new TableRow({ children: [celda("PERÍODO CONSULTADO", { width: 25, fill: COLORS.light, bold: true, size: 17 }), celda(periodo, { width: 75, size: 17 })] }),
    new TableRow({ children: [celda("FECHA DE EMISIÓN", { width: 25, fill: COLORS.light, bold: true, size: 17 }), celda(fechaEmision, { width: 75, size: 17 })] }),
    new TableRow({ children: [celda("CLASIFICACIÓN", { width: 25, fill: COLORS.light, bold: true, size: 17 }), celda("RESERVADO - USO OFICIAL EXCLUSIVO", { width: 75, bold: true, color: COLORS.red, size: 17 })] }),
  ]);
}

function crearTablaResumen(data) {
  const exec = data.resumenEjecutivo || {};
  const kpis = [
    ["TOTAL ENROLAMIENTOS", numero(data.total), COLORS.navy],
    ["SINCRONIZACIÓN PDI", porcentaje(exec.tasaSincronizacion, 100), COLORS.teal],
    ["REGISTRO ABIS VÁLIDO", porcentaje(exec.tasaRegistroBiometrico), COLORS.blue],
    ["INCONSISTENCIAS / ERROR", porcentaje(exec.tasaError), COLORS.red],
  ];

  return tabla([
    new TableRow({
      children: kpis.map(([label, , color]) => celda(label, {
        width: 25,
        fill: color,
        alignment: AlignmentType.CENTER,
        bold: true,
        color: "FFFFFF",
        size: 15,
        borders: SIN_BORDES,
      })),
    }),
    new TableRow({
      children: kpis.map(([, value, color]) => celda(value, {
        width: 25,
        alignment: AlignmentType.CENTER,
        bold: true,
        color,
        size: 25,
        borders: bordes(COLORS.border),
      })),
    }),
  ]);
}

function crearTablaIndicadores(data) {
  const exec = data.resumenEjecutivo || {};
  const filas = [
    ["Total de Enrolamientos Procesados", numero(data.total), "Volumen consolidado"],
    ["Sincronización PDI", porcentaje(exec.tasaSincronizacion, 100), `Meta: ≥ 95% (${textoSeguro(exec.estadoSLA, "Óptimo")})`],
    ["Eficacia Registro Biométrico ABIS", porcentaje(exec.tasaRegistroBiometrico), "Captura biométrica válida"],
    ["Tasa de Inconsistencias o Error", porcentaje(exec.tasaError), "Indicador de control operativo"],
    ["Cuartel con Mayor Demanda", exec.cuartelLider ? `${textoSeguro(exec.cuartelLider.nombre)} (${porcentaje(exec.cuartelLider.porcentaje)})` : "N/D", "Principal concentración operativa"],
    ["Nacionalidad Predominante", exec.nacionalidadLider ? `${textoSeguro(exec.nacionalidadLider.nombre)} (${porcentaje(exec.nacionalidadLider.porcentaje)})` : "N/D", "Mayor presencia registrada"],
  ];

  return tabla([
    new TableRow({
      tableHeader: true,
      children: [
        celdaCabecera("INDICADOR INSTITUCIONAL", 45),
        celdaCabecera("VALOR REGISTRADO", 25, COLORS.navy, AlignmentType.CENTER),
        celdaCabecera("ESTADO / META", 30),
      ],
    }),
    ...filas.map(([label, value, detail]) => new TableRow({
      children: [
        celda(label, { width: 45, bold: true }),
        celda(value, { width: 25, alignment: AlignmentType.CENTER, bold: true }),
        celda(detail, { width: 30, alignment: AlignmentType.CENTER, color: COLORS.muted }),
      ],
    })),
  ]);
}

function crearTablaRendimiento(cuarteles) {
  const filas = (cuarteles || []).slice(0, 20);
  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        celdaCabecera("PUESTO / CUARTEL", 30, COLORS.teal),
        celdaCabecera("UNIDAD POLICIAL", 25, COLORS.teal, AlignmentType.CENTER),
        celdaCabecera("TOTAL ENROLADOS", 15, COLORS.teal, AlignmentType.CENTER),
        celdaCabecera("SINCRONIZADOS PDI", 15, COLORS.teal, AlignmentType.CENTER),
        celdaCabecera("TASA ÉXITO (%)", 15, COLORS.teal, AlignmentType.CENTER),
      ],
    }),
  ];

  if (!filas.length) {
    rows.push(new TableRow({ children: [celda("Sin registros para el período", { columnSpan: 5, alignment: AlignmentType.CENTER, color: COLORS.muted })] }));
  } else {
    filas.forEach((item) => {
      rows.push(new TableRow({
        children: [
          celda(textoSeguro(item.cuartel), { width: 30, bold: true }),
          celda(textoSeguro(item.unidad), { width: 25 }),
          celda(numero(item.total), { width: 15, alignment: AlignmentType.RIGHT }),
          celda(numero(item.sincronizados), { width: 15, alignment: AlignmentType.RIGHT }),
          celda(porcentaje(item.tasaExito), { width: 15, alignment: AlignmentType.RIGHT, bold: true, color: Number(item.tasaExito) >= 95 ? "16803C" : COLORS.red }),
        ],
      }));
    });
  }

  return tabla(rows);
}

function crearTablaNacionalidades(nacionalidades) {
  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        celdaCabecera("PAÍS / NACIONALIDAD", 45, COLORS.blue),
        celdaCabecera("CÓDIGO ISO", 20, COLORS.blue, AlignmentType.CENTER),
        celdaCabecera("TOTAL ENROLAMIENTOS", 20, COLORS.blue, AlignmentType.CENTER),
        celdaCabecera("PROPORCIÓN (%)", 15, COLORS.blue, AlignmentType.CENTER),
      ],
    }),
  ];

  (nacionalidades || []).slice(0, 10).forEach((item) => {
    rows.push(new TableRow({
      children: [
        celda(textoSeguro(item.nacionalidad), { width: 45, bold: true }),
        celda(textoSeguro(item.codigo_iso || item.codigoIso), { width: 20, alignment: AlignmentType.CENTER }),
        celda(numero(item.total), { width: 20, alignment: AlignmentType.RIGHT }),
        celda(porcentaje(item.porcentaje), { width: 15, alignment: AlignmentType.RIGHT, bold: true }),
      ],
    }));
  });

  if (rows.length === 1) rows.push(new TableRow({ children: [celda("Sin datos de nacionalidad para el período", { columnSpan: 4, alignment: AlignmentType.CENTER, color: COLORS.muted })] }));
  return tabla(rows);
}

function crearTablaDemografia(data) {
  let hombresAdultos = 0;
  let mujeresAdultas = 0;
  let hombresNna = 0;
  let mujeresNna = 0;

  (data.demografiaCruzada || []).forEach((item) => {
    const total = Number(item.total || 0);
    const esHombre = String(item.genero || "").toUpperCase().startsWith("M");
    if (item.esMayorEdad) {
      if (esHombre) hombresAdultos += total;
      else mujeresAdultas += total;
    } else if (esHombre) {
      hombresNna += total;
    } else {
      mujeresNna += total;
    }
  });

  return tabla([
    new TableRow({
      tableHeader: true,
      children: [
        celdaCabecera("GRUPO POBLACIONAL / RANGO ETARIO", 50, COLORS.navy),
        celdaCabecera("HOMBRES (M)", 25, "1D5FBF", AlignmentType.CENTER),
        celdaCabecera("MUJERES (F)", 25, COLORS.pink, AlignmentType.CENTER),
      ],
    }),
    new TableRow({
      children: [
        celda("Adultos (≥ 18)", { width: 50, bold: true }),
        celda(numero(hombresAdultos), { width: 25, alignment: AlignmentType.RIGHT }),
        celda(numero(mujeresAdultas), { width: 25, alignment: AlignmentType.RIGHT }),
      ],
    }),
    new TableRow({
      children: [
        celda("Niños, Niñas y Adolescentes (0–17)", { width: 50, bold: true, color: "8A4B08" }),
        celda(numero(hombresNna), { width: 25, alignment: AlignmentType.RIGHT, color: "8A4B08" }),
        celda(numero(mujeresNna), { width: 25, alignment: AlignmentType.RIGHT, color: "8A4B08" }),
      ],
    }),
  ]);
}

function crearTablaControl(periodo, fechaEmision) {
  const idReporte = `RPT-${Date.now()}`;
  return tabla([
    new TableRow({ children: [celda("ID DE REPORTE", { width: 30, fill: COLORS.light, bold: true }), celda(idReporte, { width: 70 })] }),
    new TableRow({ children: [celda("FUENTE DE DATOS", { width: 30, fill: COLORS.light, bold: true }), celda("SISTEMA ABIS PDI", { width: 70 })] }),
    new TableRow({ children: [celda("PERÍODO INFORMADO", { width: 30, fill: COLORS.light, bold: true }), celda(periodo, { width: 70 })] }),
    new TableRow({ children: [celda("FECHA/HORA DE GENERACIÓN", { width: 30, fill: COLORS.light, bold: true }), celda(fechaEmision, { width: 70 })] }),
  ]);
}

/**
 * Genera un informe Word ejecutivo, inspirado en el formato SIAD.
 * El documento presenta resultados y contexto operativo; no expone detalles
 * internos de cifrado, hashes, ETL ni estructura técnica de la base de datos.
 */
async function generarReporteWord(data, meta = {}) {
  const periodo = fechaPeriodo(data, meta);
  const fechaEmision = new Date().toLocaleString("es-CL", {
    dateStyle: "full",
    timeStyle: "medium",
  });
  const logoBuffer = leerLogo();

  const children = [
    crearMembrete(logoBuffer),
    espacio(70),
    parrafo("REPORTE EJECUTIVO DE ENROLAMIENTO BIOMÉTRICO", {
      alignment: AlignmentType.CENTER,
      spacing: { after: 70 },
      children: [run("REPORTE EJECUTIVO DE ENROLAMIENTO BIOMÉTRICO", { size: 23, bold: true, color: COLORS.navy })],
    }),
    parrafo("Sistema Analítico ABIS | PDI", {
      alignment: AlignmentType.CENTER,
      spacing: { after: 150 },
      children: [run("Sistema Analítico ABIS | PDI", { size: 17, color: COLORS.gold, bold: true })],
    }),
    crearTablaMetadatos(periodo, fechaEmision),
    espacio(120),
    ...tituloSeccion("1", "RESUMEN EJECUTIVO", "Consolidado automático del período seleccionado."),
    parrafo("Este informe presenta los principales resultados de enrolamiento biométrico registrados por el Sistema ABIS en pasos fronterizos y unidades operativas de la Policía de Investigaciones de Chile.", {
      spacing: { after: 120 },
      children: [run("Este informe presenta los principales resultados de enrolamiento biométrico registrados por el Sistema ABIS en pasos fronterizos y unidades operativas de la Policía de Investigaciones de Chile.", { size: 17 })],
    }),
    crearTablaResumen(data),
    espacio(120),
    crearTablaIndicadores(data),
    espacio(80),
    ...tituloSeccion("2", "MATRIZ DE RENDIMIENTO OPERATIVO", "Carga operativa y sincronización efectiva con los servicios centrales de la PDI."),
    crearTablaRendimiento(data.rendimientoCuarteles),
    espacio(120),
    ...tituloSeccion("3", "FLUJOS MIGRATORIOS PREDOMINANTES", "Distribución de nacionalidades detectadas durante el período."),
    crearTablaNacionalidades(data.nacionalidadesPrincipales),
    espacio(120),
    ...tituloSeccion("4", "ANÁLISIS DEMOGRÁFICO Y PROTECCIÓN DE MENORES (N.N.A.)", "Seguimiento diferenciado por género y rango etario."),
    crearTablaDemografia(data),
    espacio(120),
    ...tituloSeccion("5", "CONTROL DE GENERACIÓN", "Identificación básica del documento y de su período informado."),
    crearTablaControl(periodo, fechaEmision),
  ];

  const headerChildren = [
    logoMarcaAgua(logoBuffer),
    parrafo("SISTEMA ABIS | INFORME EJECUTIVO", {
      alignment: AlignmentType.RIGHT,
      children: [run("SISTEMA ABIS | INFORME EJECUTIVO", { size: 14, color: COLORS.muted, bold: true })],
    }),
  ].filter(Boolean);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: 18,
            color: COLORS.text,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 820,
              bottom: 720,
              left: 820,
            },
          },
        },
        headers: {
          default: new Header({ children: headerChildren }),
        },
        footers: {
          default: new Footer({
            children: [
              parrafo("Informe generado por Sistema Analítico ABIS | PDI", {
                alignment: AlignmentType.CENTER,
                spacing: { after: 15 },
                children: [run("Informe generado por Sistema Analítico ABIS | PDI", { size: 13, color: COLORS.muted, bold: true })],
              }),
              parrafo("DOCUMENTO RESERVADO - USO OFICIAL EXCLUSIVO", {
                alignment: AlignmentType.CENTER,
                children: [run("DOCUMENTO RESERVADO - USO OFICIAL EXCLUSIVO", { size: 11, color: "94A3B8" })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generarReporteWord };
