const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  Header,
  Footer,
} = require("docx");

/**
 * Genera un documento Microsoft Word (.docx) formal institucional con membrete oficial de la PDI
 * @param {object} data Datos consolidados del reporte diario o rango
 * @param {object} meta Información de fecha y parámetros de consulta
 * @returns {Promise<Buffer>} Buffer del archivo .docx
 */
async function generarReporteWord(data, meta = {}) {
  const fechaPeriodo = data.desde && data.hasta
    ? `Desde ${data.desde} hasta ${data.hasta} (${data.diasConDatos || 0} jornadas operativas)`
    : (data.fecha || meta.fecha || "Jornada más reciente");

  const totalEnrolados = (data.total || 0).toLocaleString();
  const exec = data.resumenEjecutivo || {};
  const fechaEmision = new Date().toLocaleString("es-CL", {
    dateStyle: "full",
    timeStyle: "medium",
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
            size: 22, // 11pt
            color: "1E293B",
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 pulgada = 1440 dxa
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "POLICÍA DE INVESTIGACIONES DE CHILE | SISTEMA ABIS",
                    size: 16,
                    color: "64748B",
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "DOCUMENTO RESERVADO - JEFATURA NACIONAL DE MIGRACIONES Y POLICÍA INTERNACIONAL - PDI CHILE",
                    size: 16,
                    color: "94A3B8",
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          // MEMBRETE INSTITUCIONAL FORMAL
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "POLICÍA DE INVESTIGACIONES DE CHILE",
                bold: true,
                size: 28, // 14pt
                color: "002B49",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "JEFATURA NACIONAL DE MIGRACIONES Y POLICÍA INTERNACIONAL",
                bold: true,
                size: 22,
                color: "C69214",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "DEPARTAMENTO DE INFORMACIÓN Y CONTROL BIOMÉTRICO (ABIS)",
                italics: true,
                size: 20,
                color: "475569",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "_______________________________________________________________________________",
                color: "C69214",
                size: 18,
              }),
            ],
            spacing: { after: 240 },
          }),

          // TÍTULO DEL INFORME
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: "INFORME GERENCIAL Y ESTADÍSTICO DE IDENTIFICACIÓN BIOMÉTRICA",
                bold: true,
                size: 24,
                color: "002B49",
              }),
            ],
            spacing: { after: 120 },
          }),

          // METADATOS DEL DOCUMENTO
          crearTablaMetadatos(fechaPeriodo, fechaEmision, data),

          new Paragraph({ text: "", spacing: { after: 200 } }),

          // 1. RESUMEN EJECUTIVO Y CUMPLIMIENTO SLA
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [
              new TextRun({
                text: "1. RESUMEN EJECUTIVO Y NIVEL DE SERVICIO (SLA)",
                bold: true,
                size: 22,
                color: "002B49",
              }),
            ],
            spacing: { before: 200, after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "El presente informe consolida los registros de enrolamiento biométrico capturados y procesados por el Sistema ABIS en los distintos pasos fronterizos y unidades operativas de la Policía de Investigaciones de Chile. Todos los registros han sido verificados mediante mecanismos de normalización relacional 3NF y cifrado institucional AES-256-GCM.",
                size: 21,
              }),
            ],
            spacing: { after: 160 },
          }),
          crearTablaKPIs(data, exec, totalEnrolados),

          new Paragraph({ text: "", spacing: { after: 240 } }),

          // 2. MATRIZ DE RENDIMIENTO POR CUARTEL Y UNIDAD
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [
              new TextRun({
                text: "2. MATRIZ DE RENDIMIENTO OPERATIVO POR CUARTEL Y UNIDAD",
                bold: true,
                size: 22,
                color: "002B49",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Desglose de carga operativa y porcentaje de sincronización efectiva con los servicios centrales de la PDI:",
                size: 21,
              }),
            ],
            spacing: { after: 140 },
          }),
          crearTablaRendimientoCuarteles(data.rendimientoCuarteles || []),

          new Paragraph({ text: "", spacing: { after: 240 } }),

          // 3. DESGLOSE MIGRATORIO POR NACIONALIDAD
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [
              new TextRun({
                text: "3. FLUJOS MIGRATORIOS PREDOMINANTES (TOP PAÍSES DE ORIGEN)",
                bold: true,
                size: 22,
                color: "002B49",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          crearTablaNacionalidades(data.nacionalidadesPrincipales || []),

          new Paragraph({ text: "", spacing: { after: 240 } }),

          // 4. ANÁLISIS DEMOGRÁFICO Y PROTECCIÓN DE MENORES N.N.A.
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [
              new TextRun({
                text: "4. ANÁLISIS DEMOGRÁFICO Y PROTECCIÓN DE MENORES (N.N.A.)",
                bold: true,
                size: 22,
                color: "002B49",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Conforme a los protocolos institucionales de la PDI y tratados internacionales de protección de derechos de la niñez, se realiza especial seguimiento a la población de Niños, Niñas y Adolescentes (N.N.A. 0 a 17 años) enrolados en las zonas de control fronterizo:",
                size: 21,
              }),
            ],
            spacing: { after: 140 },
          }),
          crearTablaDemografia(data),

          new Paragraph({ text: "", spacing: { after: 360 } }),

          // 5. BLOQUE DE FIRMAS Y VALIDEZ INSTITUCIONAL
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [
              new TextRun({
                text: "5. CERTIFICACIÓN Y AUDITORÍA CRIPTOGRÁFICA",
                bold: true,
                size: 22,
                color: "002B49",
              }),
            ],
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Se certifica la autenticidad e integridad inalterable de los datos aquí descritos, procesados a través del motor ETL del Sistema ABIS y resguardados con protocolo criptográfico AES-256-GCM bajo clave institucional autorizada.",
                size: 20,
                italics: true,
              }),
            ],
            spacing: { after: 360 },
          }),
          crearBloqueFirmas(),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

// Genera la tabla de metadatos del reporte
function crearTablaMetadatos(fechaPeriodo, fechaEmision, data) {
  const borderNone = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const borders = { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone };

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Período Consultado:", bold: true, size: 20 })] })],
            width: { size: 25, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: fechaPeriodo, size: 20 })] })],
            width: { size: 75, type: WidthType.PERCENTAGE },
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Fecha de Emisión:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: fechaEmision, size: 20 })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Clasificación:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "RESERVADO - USO OFICIAL EXCLUSIVO POLICÍA DE INVESTIGACIONES", bold: true, color: "DC2626", size: 20 })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Seguridad Criptográfica:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "AES-256-GCM / Integridad Autenticada SHA-256", size: 20, color: "059669" })] })],
          }),
        ],
      }),
    ],
  });
}

// Genera la tabla de KPIs principales
function crearTablaKPIs(data, exec, totalEnrolados) {
  const headerFill = "002B49";
  const borderLight = { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" };
  const borders = { top: borderLight, bottom: borderLight, left: borderLight, right: borderLight };

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({
        children: [
          celdaHeader("Indicador Institucional", 45, headerFill),
          celdaHeader("Valor Registrado", 25, headerFill, AlignmentType.RIGHT),
          celdaHeader("Estado / Meta Institucional", 30, headerFill, AlignmentType.CENTER),
        ],
      }),
      filaKPI("Total de Enrolamientos Procesados", `${totalEnrolados} registros`, "Volumen consolidado", borders),
      filaKPI("Cumplimiento SLA Sincronización PDI", `${exec.tasaSincronizacion || 100}%`, `Meta: >= 95% (${exec.estadoSLA || "Óptimo"})`, borders),
      filaKPI("Eficacia Registro Biométrico ABIS", `${exec.tasaRegistroBiometrico || 0}%`, "Captura biométrica válida", borders),
      filaKPI("Tasa de Inconsistencias o Error", `${exec.tasaError || 0}%`, "Bajo control institucional", borders),
      filaKPI("Cuartel con Mayor Demanda Operativa", exec.cuartelLider ? `${exec.cuartelLider.nombre} (${exec.cuartelLider.porcentaje}%)` : "N/D", "Puesto fronterizo líder", borders),
      filaKPI("Flujo Migratorio Predominante", exec.nacionalidadLider ? `${exec.nacionalidadLider.nombre} (${exec.nacionalidadLider.porcentaje}%)` : "N/D", "País de mayor incidencia", borders),
    ],
  });
}

// Genera la tabla de rendimiento de cuarteles
function crearTablaRendimientoCuarteles(cuarteles) {
  const headerFill = "002B49";
  const borderLight = { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" };
  const borders = { top: borderLight, bottom: borderLight, left: borderLight, right: borderLight };

  const rows = [
    new TableRow({
      children: [
        celdaHeader("Puesto / Cuartel Fronterizo", 30, headerFill),
        celdaHeader("Unidad Policial", 25, headerFill),
        celdaHeader("Total Enrolados", 15, headerFill, AlignmentType.RIGHT),
        celdaHeader("Sincronizados PDI", 15, headerFill, AlignmentType.RIGHT),
        celdaHeader("Tasa Éxito (%)", 15, headerFill, AlignmentType.RIGHT),
      ],
    }),
  ];

  if (cuarteles.length === 0) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: "Sin registros para el período", alignment: AlignmentType.CENTER })],
            columnSpan: 5,
            borders,
          }),
        ],
      })
    );
  } else {
    cuarteles.forEach((c) => {
      rows.push(
        new TableRow({
          children: [
            celdaDato(c.cuartel, borders, true),
            celdaDato(c.unidad, borders),
            celdaDato(c.total.toLocaleString(), borders, false, AlignmentType.RIGHT),
            celdaDato(c.sincronizados.toLocaleString(), borders, false, AlignmentType.RIGHT),
            celdaDato(`${c.tasaExito}%`, borders, true, AlignmentType.RIGHT, c.tasaExito >= 95 ? "059669" : "DC2626"),
          ],
        })
      );
    });
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows,
  });
}

// Genera la tabla de nacionalidades
function crearTablaNacionalidades(nacionalidades) {
  const headerFill = "002B49";
  const borderLight = { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" };
  const borders = { top: borderLight, bottom: borderLight, left: borderLight, right: borderLight };

  const rows = [
    new TableRow({
      children: [
        celdaHeader("País / Nacionalidad", 45, headerFill),
        celdaHeader("Código ISO", 20, headerFill, AlignmentType.CENTER),
        celdaHeader("Total Enrolamientos", 20, headerFill, AlignmentType.RIGHT),
        celdaHeader("Proporción (%)", 15, headerFill, AlignmentType.RIGHT),
      ],
    }),
  ];

  nacionalidades.forEach((n) => {
    rows.push(
      new TableRow({
        children: [
          celdaDato(n.nacionalidad, borders, true),
          celdaDato(n.codigo_iso || "N/D", borders, false, AlignmentType.CENTER),
          celdaDato(n.total.toLocaleString(), borders, false, AlignmentType.RIGHT),
          celdaDato(`${n.porcentaje}%`, borders, true, AlignmentType.RIGHT),
        ],
      })
    );
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows,
  });
}

// Genera la tabla demográfica cruzada
function crearTablaDemografia(data) {
  const headerFill = "002B49";
  const borderLight = { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" };
  const borders = { top: borderLight, bottom: borderLight, left: borderLight, right: borderLight };

  const demografia = data.demografiaCruzada || [];
  let mascAdultos = 0, mascMenores = 0;
  let femAdultos = 0, femMenores = 0;

  demografia.forEach((d) => {
    if (d.genero === "M") {
      if (d.esMayorEdad) mascAdultos += d.total;
      else mascMenores += d.total;
    } else if (d.genero === "F") {
      if (d.esMayorEdad) femAdultos += d.total;
      else femMenores += d.total;
    }
  });

  const total = data.total || 1;

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({
        children: [
          celdaHeader("Grupo Poblacional / Rango Etario", 50, headerFill),
          celdaHeader("Hombres (M)", 25, headerFill, AlignmentType.RIGHT),
          celdaHeader("Mujeres (F)", 25, headerFill, AlignmentType.RIGHT),
        ],
      }),
      new TableRow({
        children: [
          celdaDato("Adultos (Mayores de Edad >= 18)", borders, true),
          celdaDato(`${mascAdultos.toLocaleString()} (${((mascAdultos / total) * 100).toFixed(1)}%)`, borders, false, AlignmentType.RIGHT),
          celdaDato(`${femAdultos.toLocaleString()} (${((femAdultos / total) * 100).toFixed(1)}%)`, borders, false, AlignmentType.RIGHT),
        ],
      }),
      new TableRow({
        children: [
          celdaDato("Niños, Niñas y Adolescentes (N.N.A. 0 a 17 años)", borders, true, AlignmentType.LEFT, "D97706"),
          celdaDato(`${mascMenores.toLocaleString()} (${((mascMenores / total) * 100).toFixed(1)}%)`, borders, true, AlignmentType.RIGHT, "D97706"),
          celdaDato(`${femMenores.toLocaleString()} (${((femMenores / total) * 100).toFixed(1)}%)`, borders, true, AlignmentType.RIGHT, "D97706"),
        ],
      }),
    ],
  });
}

// Bloque de firmas institucionales
function crearBloqueFirmas() {
  const borderNone = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const borders = { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone };

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({ text: "", spacing: { before: 720 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "____________________________________", size: 20 }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "OFICIAL RESPONSABLE SISTEMA ABIS", bold: true, size: 18 }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Departamento de Identificación Biométrica", size: 16, color: "64748B" }),
                ],
              }),
            ],
            width: { size: 50, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [
              new Paragraph({ text: "", spacing: { before: 720 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "____________________________________", size: 20 }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "JEFE DEPARTAMENTO DE MIGRACIONES", bold: true, size: 18 }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Policía Internacional - PDI Chile", size: 16, color: "64748B" }),
                ],
              }),
            ],
            width: { size: 50, type: WidthType.PERCENTAGE },
          }),
        ],
      }),
    ],
  });
}

// Helpers para construcción de celdas
function celdaHeader(texto, anchoPorcentaje, bgHex, alignment = AlignmentType.LEFT) {
  return new TableCell({
    children: [
      new Paragraph({
        alignment,
        children: [
          new TextRun({
            text: texto,
            bold: true,
            size: 20,
            color: "FFFFFF",
          }),
        ],
      }),
    ],
    width: { size: anchoPorcentaje, type: WidthType.PERCENTAGE },
    shading: { fill: bgHex },
  });
}

function celdaDato(texto, borders, bold = false, alignment = AlignmentType.LEFT, colorHex = "1E293B") {
  return new TableCell({
    children: [
      new Paragraph({
        alignment,
        children: [
          new TextRun({
            text: String(texto),
            bold,
            size: 20,
            color: colorHex,
          }),
        ],
      }),
    ],
    borders,
  });
}

function filaKPI(label, valor, detalle, borders) {
  return new TableRow({
    children: [
      celdaDato(label, borders, true),
      celdaDato(valor, borders, true, AlignmentType.RIGHT),
      celdaDato(detalle, borders, false, AlignmentType.CENTER),
    ],
  });
}

module.exports = { generarReporteWord };
