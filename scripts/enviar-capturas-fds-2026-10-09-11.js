require("dotenv").config();

const readline = require("readline");
const pool = require("../src/db");
const telegramClient = require("../src/telegram/telegramClient");
const { obtenerChatIdsActivos } = require("../src/telegram/recipientService");
const {
  obtenerReporteFinDeSemana,
  obtenerDatosAcumulados,
} = require("../src/reportes/reporteFinDeSemana");
const { obtenerReporteRango } = require("../src/reportes/reporteRango");
const { formatearReporteExtenso } = require("../src/telegram/formatearReporte");
const { crearBotonesDescarga } = require("../src/telegram/botService");
const {
  generarCapturaMatrizFinDeSemana,
  generarCapturaDistribucionFinDeSemana,
  generarCapturaAcumulado,
} = require("../src/reportes/imageReportService");

const FECHAS = {
  viernes: "2026-10-09",
  sabado: "2026-10-10",
  domingo: "2026-10-11",
};

function preguntar(texto) {
  const interfaz = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolver) => {
    interfaz.question(texto, (respuesta) => {
      interfaz.close();
      resolver(respuesta.trim());
    });
  });
}

async function obtenerDestinatarios() {
  const configurados = await obtenerChatIdsActivos(pool);
  if (configurados.length > 0) return configurados;

  return String(process.env.TELEGRAM_CHAT_ID || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN en el archivo .env");

  const destinatarios = await obtenerDestinatarios();
  if (destinatarios.length === 0) {
    throw new Error("No hay destinatarios activos ni TELEGRAM_CHAT_ID configurado.");
  }

  console.log("\nENVÍO DE 4 CAPTURAS INSTITUCIONALES");
  console.log("Período: 09-10-2026 al 11-10-2026");
  console.log(`Destinatarios: ${destinatarios.length}`);
  console.log("Se enviará un álbum de cuatro imágenes y el reporte institucional en texto.");
  console.log("\n");

  const confirmacion = await preguntar("Escribe ENVIAR 4 CAPTURAS para continuar: ");
  if (confirmacion !== "ENVIAR 4 CAPTURAS") {
    console.log("Operación cancelada. No se envió nada.");
    return;
  }

  const [reporteFds, datosEnrolados, datosRegistros] = await Promise.all([
    obtenerReporteFinDeSemana(pool, FECHAS),
    obtenerDatosAcumulados(pool, { soloEnrolados: true }),
    obtenerDatosAcumulados(pool, { soloEnrolados: false }),
  ]);

  const reporteTexto = await obtenerReporteRango(
    pool,
    FECHAS.viernes,
    FECHAS.domingo
  );
  const texto = formatearReporteExtenso(reporteTexto, {
    desde: FECHAS.viernes,
    hasta: FECHAS.domingo,
    origen: "Reenvío manual de capturas ABIS",
  });
  const botones = crearBotonesDescarga({
    desde: FECHAS.viernes,
    hasta: FECHAS.domingo,
  });

  const [matriz, acumuladoEnrolados, distribucion, acumuladoRegistros] =
    await Promise.all([
      generarCapturaMatrizFinDeSemana(reporteFds),
      generarCapturaAcumulado(datosEnrolados, {
        titulo: "TOTAL DE ENROLADOS EN EL SISTEMA ABIS ACUMULADO AL AÑO 2026",
        tipoFiltro: "ENROLADO",
        anio: 2026,
      }),
      generarCapturaDistribucionFinDeSemana(reporteFds),
      generarCapturaAcumulado(datosRegistros, {
        titulo: "TOTAL DE REGISTROS EN EL SISTEMA ABIS ACUMULADO AL AÑO 2026",
        tipoFiltro: "TODOS",
        anio: 2026,
      }),
    ]);

  const fotos = [
    {
      buffer: matriz,
      caption: "REPORTE OFICIAL ABIS - FOTO 1/4: MATRIZ DE ESTADOS | 09-10-2026 AL 11-10-2026",
    },
    {
      buffer: acumuladoEnrolados,
      caption: "REPORTE OFICIAL ABIS - FOTO 2/4: TOTAL DE ENROLADOS ACUMULADO 2026",
    },
    {
      buffer: distribucion,
      caption: "REPORTE OFICIAL ABIS - FOTO 3/4: DISTRIBUCION DE ENROLAMIENTOS | 09-10-2026 AL 11-10-2026",
    },
    {
      buffer: acumuladoRegistros,
      caption: "REPORTE OFICIAL ABIS - FOTO 4/4: TOTAL DE REGISTROS ACUMULADO 2026",
    },
  ];

  let enviados = 0;
  for (const chatId of destinatarios) {
    try {
      const respuesta = await telegramClient.enviarGrupoFotos({
        token,
        chatId,
        fotos,
      });
      await telegramClient.enviarMensaje({
        token,
        chatId,
        texto,
        replyMarkup: botones,
      });
      enviados += 1;
      console.log(`OK: álbum enviado al destinatario ${String(chatId).slice(0, 4)}***`);
      console.log(`   Mensajes recibidos por Telegram: ${respuesta.length}`);
    } catch (error) {
      console.error(`ERROR enviando al destinatario ${String(chatId).slice(0, 4)}***: ${error.message}`);
    }
  }

  if (enviados === 0) {
    throw new Error("No se pudo enviar el álbum a ningún destinatario.");
  }

  console.log(`\nEnvío finalizado: ${enviados}/${destinatarios.length} destinatarios.`);
}

main()
  .catch((error) => {
    console.error(`\nERROR: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
