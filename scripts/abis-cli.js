const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const HELP = [
  "ABIS CLI",
  "  validate <archivo.xlsx|archivo.enc>       Valida sin escribir catálogos ni registros",
  "  ingest <archivo> --apply                  Importa con historial de lote",
  "  encrypt <origen> <destino>                Cifra sin sobrescribir archivos",
  "  decrypt <origen.enc> <destino.xlsx>        Descifra sin sobrescribir archivos",
  "  report [YYYY-MM-DD]                       Resume el reporte, sin enviarlo",
  "  send [YYYY-MM-DD] --send                  Envía el reporte configurado",
  "  init-db --apply                           Prepara las tablas ABIS en DATABASE_URL",
  "  integrity                                Comprueba referencias de registros (solo lectura)",
  "  --help                                   Muestra esta ayuda",
].join("\n");

async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes("--help")) { console.log(HELP); return; }
  const [command, ...args] = argv;
  const positional = args.filter(a => !a.startsWith("--"));
  const allowed = ["validate", "ingest", "encrypt", "decrypt", "report", "send", "init-db", "integrity"];
  if (!allowed.includes(command)) throw new Error("Comando no reconocido. Use --help.");
  if (["ingest", "init-db"].includes(command) && !args.includes("--apply")) {
    throw new Error("Esta operación modifica la base de datos. Agregue --apply para ejecutarla.");
  }
  if (command === "send" && !args.includes("--send")) throw new Error("Agregue --send para autorizar el envío a Telegram.");
  if (["validate", "ingest", "encrypt", "decrypt"].includes(command) && !positional[0]) {
    throw new Error("Falta el archivo de entrada.");
  }
  if (command === "encrypt" || command === "decrypt") {
    if (!positional[1]) throw new Error("Especifique un archivo de salida distinto del original.");
    const crypto = require("../src/security/crypto");
    const input = fs.readFileSync(path.resolve(positional[0]));
    const output = command === "encrypt" ? crypto.cifrarBuffer(input) : crypto.descifrarBuffer(input);
    fs.writeFileSync(path.resolve(positional[1]), output, { flag: "wx" });
    console.log("Archivo generado sin sobrescribir el original.");
    return;
  }

  const pool = require("../src/db");
  try {
    if (command === "validate") {
      const result = await require("../src/ingest").processExcelFile(path.resolve(positional[0]), pool, { readOnly: true });
      console.log(JSON.stringify({ cabecerasValidas: result.headerValidation.ok, filasValidas: result.rows.length, filasConError: result.errors.length }));
      if (!result.headerValidation.ok || result.errors.length) process.exitCode = 1;
    } else if (command === "ingest") {
      const { ensureIngestHistory, crearLote, actualizarLote } = require("../src/ingest/ingestHistory");
      const { generarHashSHA256 } = require("../src/security/crypto");
      const input = fs.readFileSync(path.resolve(positional[0]));
      await ensureIngestHistory(pool);
      const previous = await require('../src/ingest/deduplication').findLegacyIngest(pool, 'ARCHIVO', generarHashSHA256(input));
      if (previous) throw new Error(`Posible carga repetida del lote #${previous.id_lote}. Revisa el historial antes de volver a cargarla.`);
      const id = await crearLote(pool, { tipoIngesta: "ARCHIVO", nombreArchivo: path.basename(positional[0]), hashSha256: generarHashSHA256(input), usuario: "CLI" });
      try {
        const result = await require("../src/etl").runEtl(input, pool, { idLote: id });
        if (!result.headerValidation.ok) throw new Error("Cabeceras inválidas.");
        const duplicated = result.insertResult?.duplicates || 0;
        await actualizarLote(pool, id, { estado: result.insertResult?.inserted === 0 && duplicated && !result.errors.length ? 'SIN_NOVEDADES' : 'COMPLETADO', finalizado: true,
          filasRecibidas: result.rows.length + result.errors.length, filasValidas: result.rows.length,
          filasInsertadas: result.insertResult?.inserted || 0, filasDuplicadas: duplicated, filasError: result.errors.length });
        console.log(JSON.stringify({ lote: id, insertadas: result.insertResult?.inserted || 0, duplicadas: duplicated, rechazadas: result.errors.length }));
      } catch (error) {
        await actualizarLote(pool, id, { estado: "ERROR", finalizado: true, detalle: error.message });
        throw error;
      }
    } else if (command === "init-db") {
      // Solo ABIS: no altera tablas, triggers ni fuentes del módulo SIAD.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const name of ["schema.sql", "seed_catalogos.sql", "views.sql"]) {
          await client.query(fs.readFileSync(path.resolve(__dirname, "../db", name), "utf8"));
        }
        await client.query("CREATE TABLE IF NOT EXISTS scheduler_config (config_key VARCHAR(50) PRIMARY KEY, config_value JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())");
        await client.query("COMMIT");
        console.log("Esquema ABIS, catálogos y vistas preparados. No se modificó SIAD.");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    } else if (command === "integrity") {
      const { rows } = await pool.query(
        "SELECT count(*)::int AS total, count(*) FILTER (WHERE n.id_nacionalidad IS NULL OR c.id_cuartel IS NULL OR e.id_equipo IS NULL OR s.tipo_estado IS DISTINCT FROM 'SINCRONIZACION' OR b.tipo_estado IS DISTINCT FROM 'REGISTRO' OR g.tipo_estado IS DISTINCT FROM 'GENERAL')::int AS inconsistencias_referenciales FROM registro_enrolamiento r LEFT JOIN nacionalidad n USING(id_nacionalidad) LEFT JOIN cuartel c USING(id_cuartel) LEFT JOIN equipo e USING(id_equipo) LEFT JOIN estado_proceso s ON s.id_estado=r.id_estado_sincronizacion LEFT JOIN estado_proceso b ON b.id_estado=r.id_estado_registro LEFT JOIN estado_proceso g ON g.id_estado=r.id_estado_general");
      console.log(JSON.stringify(rows[0]));
      if (rows[0].inconsistencias_referenciales) process.exitCode = 1;
    } else {
      const { reporte } = await require("../src/reportes/reportSelection").cargarReporte(pool, positional[0] ? { fecha: positional[0] } : {});
      if (command === "report") console.log(JSON.stringify({ fecha: reporte.fecha, total: reporte.total, resumen: reporte.resumenEjecutivo }));
      else {
        const token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_CHAT_ID;
        if (!token || !chatId) throw new Error("Telegram no configurado.");
        await require("../src/telegram/telegramClient").enviarMensaje({
          token, chatId, texto: require("../src/telegram/formatearReporte").formatearReporteExtenso(reporte, { fecha: reporte.fecha, origen: "CLI" }),
        });
        console.log("Reporte enviado.");
      }
    }
  } finally { await pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main, HELP };
