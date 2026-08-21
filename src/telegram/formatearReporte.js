// Escapa caracteres especiales de Markdown "clasico" de Telegram en texto que viene de datos
// (no de literales que nosotros escribimos). Sin esto, un valor de catalogo como "CON_ERROR"
// rompe el parseo (el "_" suelto se interpreta como inicio de italica sin cierre).
function escaparMarkdown(texto) {
  return String(texto).replace(/([_*`[\]])/g, "\\$1");
}

const EMOJI_POR_PATRON = [
  { patron: /ERROR/i, emoji: "❌" },
  { patron: /PENDIENTE/i, emoji: "⏳" },
  { patron: /MENOR/i, emoji: "⚠️" },
];

function emojiPara(descripcion) {
  const encontrado = EMOJI_POR_PATRON.find((e) => e.patron.test(descripcion));
  return encontrado ? encontrado.emoji : "✅";
}

function formatearSeccion(titulo, filas) {
  if (filas.length === 0) return `*${titulo}:*\nSin datos`;
  const lineas = filas.map(
    (f) => `${emojiPara(f.descripcion)} ${escaparMarkdown(f.descripcion)}: ${f.total} (${f.porcentaje}%)`
  );
  return `*${titulo}:*\n${lineas.join("\n")}`;
}

// Tope de items por lista (Sprint 8, QA): con el catalogo de ejemplo hay como mucho 3
// cuarteles, pero el catalogo institucional real puede tener decenas. Sin este limite, una
// lista larga puede hacer que el mensaje entero supere el limite de caracteres de Telegram.
const MAX_ITEMS_LISTA = 8;

function formatearLista(titulo, filas, campo) {
  if (filas.length === 0) return `- ${titulo}: sin datos`;
  const visibles = filas.slice(0, MAX_ITEMS_LISTA);
  const texto = visibles.map((f) => `${escaparMarkdown(f[campo])} (${f.porcentaje}%)`).join(", ");
  const restantes = filas.length - visibles.length;
  return `- ${titulo}: ${texto}${restantes > 0 ? ` y ${restantes} más` : ""}`;
}

function formatearFecha(fecha) {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

// Formatea la data de obtenerReporteDiario() (Sprint 5) como el mensaje de Telegram descrito
// en el informe de requerimientos, seccion 5. No consulta la base de datos ni sabe nada de
// como se calculo esa data — solo la formatea.
function formatearReporte(reporte) {
  const fecha = formatearFecha(reporte.fecha);

  if (reporte.total === 0) {
    return `📊 *Reporte Diario ABIS - ${fecha}* 📊\n\nNo hubo enrolamientos registrados en esta fecha.`;
  }

  return [
    `📊 *Reporte Diario ABIS - ${fecha}* 📊`,
    `Total de enrolamientos: ${reporte.total.toLocaleString("es-CL")}`,
    "",
    formatearSeccion("Sincronización", reporte.sincronizacion),
    "",
    formatearSeccion("Registro", reporte.registro),
    "",
    formatearSeccion("Estado General", reporte.general),
    "",
    "*Desglose principal:*",
    formatearLista("Nacionalidades principales", reporte.nacionalidadesPrincipales, "nacionalidad"),
    formatearLista("Cuarteles activos", reporte.cuartelesActivos, "cuartel"),
    formatearLista("Unidades activas", reporte.unidadesActivas, "unidad"),
    formatearLista("Género", reporte.genero, "genero"),
    formatearLista("Edad", reporte.edad, "categoria"),
  ].join("\n");
}

// Mensaje de alerta (Sprint 7) para cuando el flujo automatico no pudo generar el reporte
// diario — Excel vacio, corrupto, o con cabeceras invalidas. Se manda por el mismo canal de
// Telegram: si el proceso automatico falla, alguien tiene que enterarse igual.
function formatearAlerta(mensaje) {
  return `⚠️ *Alerta - Carga diaria ABIS* ⚠️\n\n${escaparMarkdown(mensaje)}`;
}

module.exports = { formatearReporte, formatearAlerta };
