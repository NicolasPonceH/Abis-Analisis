// Escapa los 3 caracteres que Telegram's `HTML` parse mode reserva (`&`, `<`, `>`) en texto que
// viene de datos (no de literales que nosotros escribimos, esos ya usan las etiquetas a proposito).
// Sin esto, un valor de catalogo con "<" o "&" rompe el parseo del mensaje entero.
function escaparHtml(texto) {
  return String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

// "SINCRONIZADO" / "CON_ERROR" -> "Sincronizado" / "Con Error". Solo cosmetica: el dato real
// (para el emoji, para deduplicar, etc.) sigue siendo la descripcion original del catalogo.
function tituloDesde(descripcion) {
  return String(descripcion)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/(^|\s)(\p{L})/gu, (_, espacio, letra) => espacio + letra.toUpperCase());
}

function formatearFecha(fecha) {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

const SEPARADOR = "━".repeat(20);

// Bloque "ESTADO DE PROCESOS": una tabla alineada (monoespaciada, <code>) con TODOS los estados
// que efectivamente existan en cada dominio (sincronizacion/registro/general) — a proposito no
// hay etiquetas fijas tipo "Sincronizados"/"Registrados": estado_proceso es catalogo (hoy datos
// de ejemplo) y una lista fija se queda corta o se desactualiza apenas cambien las descripciones
// reales o aparezca un estado nuevo. Cada linea usa la descripcion real, solo con formato titulo.
function formatearEstadoProcesos(reporte) {
  const dominios = [
    { titulo: "Sincronización", filas: reporte.sincronizacion },
    { titulo: "Registro", filas: reporte.registro },
    { titulo: "General", filas: reporte.general },
  ].filter((d) => d.filas.length > 0);

  if (dominios.length === 0) return null;

  const filasPlanas = dominios.flatMap((d) => d.filas);
  const anchoEtiqueta = Math.max(...filasPlanas.map((f) => tituloDesde(f.descripcion).length));
  const anchoTotal = Math.max(...filasPlanas.map((f) => String(f.total).length));
  const anchoPorcentaje = Math.max(...filasPlanas.map((f) => String(f.porcentaje).length));

  const lineas = dominios.flatMap((d) => [
    `• ${escaparHtml(d.titulo)}`,
    ...d.filas.map((f) => {
      const etiqueta = escaparHtml(tituloDesde(f.descripcion)).padEnd(anchoEtiqueta);
      const total = String(f.total).padStart(anchoTotal);
      const porcentaje = String(f.porcentaje).padStart(anchoPorcentaje);
      return `  - ${etiqueta} : ${total} [${porcentaje}%] ${emojiPara(f.descripcion)}`;
    }),
  ]);

  return `📊 <b>ESTADO DE PROCESOS</b>\n<code>${lineas.join("\n")}</code>`;
}

// Tope de items por lista (Sprint 8, QA): con el catalogo de ejemplo hay como mucho 3
// cuarteles, pero el catalogo institucional real puede tener decenas. Sin este limite, una
// lista larga puede hacer que el mensaje entero supere el limite de caracteres de Telegram.
const MAX_ITEMS_LISTA = 8;

// Cada item va en su propio bloque (etiqueta arriba, valores indentados abajo) en vez de todo en
// una sola linea — con varios items la version "todo junto" se veia amontonada.
function formatearItemDistribucion(etiqueta, filas, campo) {
  if (filas.length === 0) return `• <b>${etiqueta}</b>\n  sin datos`;
  const visibles = filas.slice(0, MAX_ITEMS_LISTA);
  const texto = visibles
    .map((f) => `${escaparHtml(f[campo])} (${f.porcentaje}%)`)
    .join(" · ");
  const restantes = filas.length - visibles.length;
  return `• <b>${etiqueta}</b>\n  ${texto}${restantes > 0 ? ` y ${restantes} más` : ""}`;
}

// "MAYOR DE EDAD" -> "Mayor" (solo la primera palabra, para la linea compacta de demografia).
function tituloCorto(categoria) {
  return tituloDesde(String(categoria).split(" ")[0]);
}

function formatearDemografia(genero, edad) {
  const lineas = [];
  if (genero.length > 0) {
    lineas.push(genero.map((f) => `${escaparHtml(f.genero)} (${f.porcentaje}%)`).join(" / "));
  }
  if (edad.length > 0) {
    lineas.push(edad.map((f) => `${escaparHtml(tituloCorto(f.categoria))} (${f.porcentaje}%)`).join(" / "));
  }
  if (lineas.length === 0) return "• <b>Demografía</b>\n  sin datos";
  return `• <b>Demografía</b>\n  ${lineas.join("\n  ")}`;
}

function formatearDistribucion(reporte) {
  const bloques = [
    formatearItemDistribucion("Nacionalidad", reporte.nacionalidadesPrincipales, "nacionalidad"),
    formatearItemDistribucion("Cuarteles", reporte.cuartelesActivos, "cuartel"),
    formatearItemDistribucion("Unidades", reporte.unidadesActivas, "unidad"),
    formatearDemografia(reporte.genero, reporte.edad),
  ];
  return `📌 <b>DISTRIBUCIÓN</b>\n\n${bloques.join("\n\n")}`;
}

// Formatea la data de obtenerReporteDiario() (Sprint 5) como el mensaje de Telegram (HTML parse
// mode). No consulta la base de datos ni sabe como se calculo esa data — solo la formatea.
function formatearReporte(reporte) {
  const fecha = formatearFecha(reporte.fecha);
  const encabezado = [
    `📋 <b>REPORTE DIARIO ABIS</b>`,
    `📅 <i>${fecha}</i>`,
    SEPARADOR,
  ].join("\n");

  if (reporte.total === 0) {
    return `${encabezado}\n\nNo hubo enrolamientos registrados en esta fecha.`;
  }

  const secciones = [
    `👥 <b>Total Enrolamientos:</b> <code>${reporte.total.toLocaleString("es-CL")}</code>`,
    formatearEstadoProcesos(reporte),
    formatearDistribucion(reporte),
  ].filter(Boolean);

  return `${encabezado}\n\n${secciones.join("\n\n")}`;
}

// Mensaje de alerta (Sprint 7) para cuando el flujo automatico no pudo generar el reporte
// diario — Excel vacio, corrupto, o con cabeceras invalidas. Se manda por el mismo canal de
// Telegram: si el proceso automatico falla, alguien tiene que enterarse igual.
function formatearAlerta(mensaje) {
  return `⚠️ <b>Alerta - Carga diaria ABIS</b> ⚠️\n\n${escaparHtml(mensaje)}`;
}

// Linea de aviso que flujoDiario.js agrega al final del reporte cuando el ETL
// insertó filas validas pero descarto otras (exito parcial) — se manda igual, no reemplaza al
// reporte, solo lo avisa, mostrando los motivos principales y sugiriendo usar /logs.
function formatearAvisoFilasOmitidas(erroresOParam) {
  if (typeof erroresOParam === "number") {
    return `${SEPARADOR}\n⚠️ <b>${erroresOParam} fila(s) omitida(s) en ETL</b>\n💡 Escribe <code>/logs</code> para ver el detalle.`;
  }

  const lista = Array.isArray(erroresOParam) ? erroresOParam : [];
  const cantidad = lista.length;
  if (cantidad === 0) return "";

  const lineas = [
    `${SEPARADOR}`,
    `⚠️ <b>${cantidad} fila(s) omitida(s) en ETL:</b>`,
  ];

  const maxVisibles = 3;
  const visibles = lista.slice(0, maxVisibles);
  for (const err of visibles) {
    const numFila = err.excelRow || err.row || "?";
    const motivos = Array.isArray(err.errors) ? err.errors.join("; ") : String(err.errors || "Error de validación");
    lineas.push(`• Fila ${numFila}: <i>${escaparHtml(motivos)}</i>`);
  }

  if (cantidad > maxVisibles) {
    const restantes = cantidad - maxVisibles;
    lineas.push(`<i>... y ${restantes} más</i>`);
  }

  lineas.push(`💡 Escribe <code>/logs</code> para ver el detalle completo.`);

  return lineas.join("\n");
}

module.exports = { formatearReporte, formatearAlerta, formatearAvisoFilasOmitidas };
