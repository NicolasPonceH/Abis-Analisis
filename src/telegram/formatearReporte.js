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

function formatearPeriodoDestacado(reporte, { desde, hasta, fecha } = {}) {
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  function formatearFechaEspanol(fStr) {
    if (!fStr || !fStr.includes("-")) return fStr || "";
    const [a, m, d] = fStr.split("-");
    const mesNom = meses[parseInt(m, 10) - 1] || m;
    return `${parseInt(d, 10)} de ${mesNom} de ${a}`;
  }

  function formatearFechaCorta(fStr) {
    if (!fStr || !fStr.includes("-")) return fStr || "";
    const [a, m, d] = fStr.split("-");
    return `${d}/${m}/${a}`;
  }

  const d = desde || reporte.desde;
  const h = hasta || reporte.hasta;
  const f = fecha || reporte.fecha;

  if (d && h && d !== h) {
    return `DEL ${formatearFechaCorta(d)} AL ${formatearFechaCorta(h)}`;
  } else if (f) {
    return `${formatearFechaEspanol(f).toUpperCase()} (${f})`;
  } else if (d) {
    return `${formatearFechaEspanol(d).toUpperCase()} (${d})`;
  }
  return "JORNADA HISTÓRICA CONSOLIDADA";
}

// Formatea el reporte extendido de alto impacto para Telegram
function formatearReporteExtenso(reporte, opciones = {}) {
  const total = reporte.total || 0;
  const exec = reporte.resumenEjecutivo || {};
  const periodoTexto = formatearPeriodoDestacado(reporte, opciones);

  const sincData = reporte.sincronizacion || [];
  const regData = reporte.registro || [];
  const sincOK = sincData.find((s) => s.descripcion.toUpperCase().includes("SINCRONIZADO"))?.total || 0;
  const regOK = regData.find((r) => r.descripcion.toUpperCase().includes("REGISTRADO"))?.total || 0;
  const errSinc = sincData.find((s) => s.descripcion.toUpperCase().includes("ERROR"))?.total || 0;
  const pendSinc = sincData.find((s) => s.descripcion.toUpperCase().includes("PENDIENTE"))?.total || 0;

  // Cuarteles
  const cuarteles = reporte.rendimientoCuarteles || [];
  const topCuarteles = cuarteles.slice(0, 4);

  // Nacionalidades
  const nacs = reporte.nacionalidadesPrincipales || [];
  const topNacs = nacs.slice(0, 5);

  // Demografía
  const genero = reporte.genero || [];
  const masc = genero.find((g) => g.genero.toUpperCase().startsWith("M"));
  const fem = genero.find((g) => g.genero.toUpperCase().startsWith("F"));
  const mascPct = masc ? masc.porcentaje : 0;
  const femPct = fem ? fem.porcentaje : 0;

  const edad = reporte.edad || [];
  const menores = edad.find((e) => e.categoria.toUpperCase().includes("MENOR"));
  const adultos = edad.find((e) => e.categoria.toUpperCase().includes("MAYOR"));
  const menoresCount = menores ? menores.total : 0;
  const adultosCount = adultos ? adultos.total : 0;
  const adultosPct = total > 0 ? Math.round((adultosCount / total) * 1000) / 10 : 0;

  // Timestamp actual en formato legible
  const ahora = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const horaStr = `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
  const fechaStr = `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()}`;

  let texto = `🏛 <b>POLICÍA DE INVESTIGACIONES DE CHILE</b>\n`;
  texto += `<b>Jefatura Nacional de Migraciones y Policía Internacional</b>\n`;
  texto += `📑 <i>Reporte Operativo ABIS de Enrolamiento Biométrico</i>\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `📅 <b>PERÍODO OPERATIVO:</b>\n`;
  texto += `👉 <b><u>${periodoTexto}</u></b> 👈\n`;
  texto += `👥 <b>Total Enrolamientos:</b> <b>${total.toLocaleString("es-CL")} registros</b>\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // 1. Indicadores Clave SLA
  texto += `📊 <b>INDICADORES CLAVE (SLA PDI)</b>\n`;
  texto += `• Sincronización PDI: <b>${exec.tasaSincronizacion || 0}%</b> (${sincOK.toLocaleString("es-CL")} casos) — <b>${exec.estadoSLA || "Óptimo"}</b>\n`;
  texto += `• Biometría ABIS: <b>${exec.tasaRegistroBiometrico || 0}%</b> (${regOK.toLocaleString("es-CL")} casos)\n`;
  texto += `• Inconsistencias / Errores: <b>${exec.tasaError || 0}%</b> (${errSinc.toLocaleString("es-CL")} casos)\n`;
  if (pendSinc > 0) {
    texto += `• Casos Pendientes: <b>${pendSinc.toLocaleString("es-CL")}</b> (${Math.round((pendSinc / total) * 1000) / 10}%)\n`;
  }
  texto += `\n`;

  // 2. Top Cuarteles con mayor carga
  if (topCuarteles.length > 0) {
    texto += `🏢 <b>TOP CUARTELES CON MAYOR CARGA</b>\n`;
    topCuarteles.forEach((c, idx) => {
      const pct = total > 0 ? (Math.round((c.total / total) * 1000) / 10).toFixed(1) : "0.0";
      texto += `${idx + 1}. <b>${escaparHtml(c.cuartel)}:</b> <b>${c.total.toLocaleString("es-CL")}</b> (${pct}%) — <i>${c.tasaExito}% éxito</i>\n`;
    });
    texto += `\n`;
  }

  // 3. Flujos Migratorios
  if (topNacs.length > 0) {
    texto += `🌎 <b>PRINCIPALES FLUJOS MIGRATORIOS</b>\n`;
    topNacs.forEach((n) => {
      texto += `• ${escaparHtml(n.nacionalidad)}: <b>${n.total.toLocaleString("es-CL")}</b> (${n.porcentaje}%)\n`;
    });
    texto += `\n`;
  }

  // 4. Perfil Demográfico & NNA
  texto += `👥 <b>PERFIL DEMOGRÁFICO & NNA</b>\n`;
  texto += `• Género: <b>${mascPct}%</b> Masc · <b>${femPct}%</b> Fem\n`;
  texto += `• Menores de Edad (NNA): <b>${menoresCount.toLocaleString("es-CL")}</b> (${exec.tasaMenoresNNA || 0}%)\n`;
  texto += `• Adultos: <b>${adultosCount.toLocaleString("es-CL")}</b> (${adultosPct}%)\n`;
  texto += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  texto += `⏰ <i>Generado: ${fechaStr} ${horaStr} hrs vía ${opciones.origen || "Dashboard Web PDI"}</i>`;

  return texto;
}

module.exports = {
  formatearReporte,
  formatearReporteExtenso,
  formatearAlerta,
  formatearAvisoFilasOmitidas,
};
