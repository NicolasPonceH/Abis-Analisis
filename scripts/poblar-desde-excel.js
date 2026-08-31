require("dotenv").config();
const path = require("path");
const fs = require("fs");
const pool = require("../src/db");
const { processExcelFile } = require("../src/ingest");
const { bulkInsertRegistros } = require("../src/etl/bulkInsert");

async function runSeed() {
  const seedPath = path.join(__dirname, "..", "db", "seed_catalogos.sql");
  if (fs.existsSync(seedPath)) {
    const sql = fs.readFileSync(seedPath, "utf8");
    await pool.query(sql);
    console.log("✅ Catálogos maestros asegurados/actualizados desde db/seed_catalogos.sql");
  }
}

async function poblarBaseDeDatos(excelPath = "New_Enrolados Abis.xlsx") {
  const fullPath = path.isAbsolute(excelPath) ? excelPath : path.join(process.cwd(), excelPath);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Archivo Excel no encontrado en: ${fullPath}`);
    process.exit(1);
  }

  console.log("================================================================================");
  console.log("🚀 INICIANDO POBLAMIENTO DE BASE DE DATOS ABIS DESDE EXCEL");
  console.log(`📁 Archivo: ${fullPath}`);
  console.log("================================================================================\n");

  const startTime = Date.now();

  try {
    // 1. Asegurar seed de catálogos
    console.log("1️⃣ Asegurando catálogos maestros...");
    await runSeed();

    // 2. Limpiar tabla transaccional anterior
    console.log("\n2️⃣ Limpiando tabla transaccional registro_enrolamiento...");
    await pool.query("TRUNCATE registro_enrolamiento RESTART IDENTITY;");
    console.log("✅ Tabla registro_enrolamiento reiniciada.");

    // 3. Leer y mapear el archivo Excel
    console.log("\n3️⃣ Leyendo y mapeando registros desde Excel (hoja ENROLADOS)...");
    const ingestStart = Date.now();
    const result = await processExcelFile(fullPath, pool);
    const ingestTime = ((Date.now() - ingestStart) / 1000).toFixed(2);

    if (!result.headerValidation.ok) {
      console.error("❌ Error de validación de cabeceras en el archivo Excel:");
      console.error("Cabeceras faltantes:", result.headerValidation.missing);
      process.exit(1);
    }

    console.log(`✅ Procesamiento de Excel completado en ${ingestTime}s.`);
    console.log(`📊 Hoja utilizada: "${result.sheetName}"`);
    console.log(`📊 Filas mapeadas exitosamente: ${result.rows.length.toLocaleString()}`);
    console.log(`⚠️ Filas con errores de mapeo: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log("\nMuestra de errores (primeros 5):", result.errors.slice(0, 5));
    }

    if (result.rows.length === 0) {
      console.error("❌ No se encontraron filas válidas para insertar.");
      process.exit(1);
    }

    // 4. Inserción masiva transaccional por lotes
    console.log(`\n4️⃣ Insertando ${result.rows.length.toLocaleString()} registros en PostgreSQL...`);
    const insertStart = Date.now();
    const insertResult = await bulkInsertRegistros(pool, result.rows, {
      onBatchInserted: ({ batches, inserted, total }) => {
        const pct = ((inserted / total) * 100).toFixed(1);
        process.stdout.write(
          `\r   -> Lote ${batches}: ${inserted.toLocaleString()} / ${total.toLocaleString()} (${pct}%) insertados...`
        );
      },
    });
    const insertTime = ((Date.now() - insertStart) / 1000).toFixed(2);
    console.log(`\n✅ Inserción finalizada: ${insertResult.inserted.toLocaleString()} registros en ${insertResult.batches} lotes (${insertTime}s).`);

    // 5. Validaciones de Integridad y Resumen
    console.log("\n5️⃣ Resumen de Integridad de la Base de Datos:");
    const countRes = await pool.query("SELECT count(*) AS total FROM registro_enrolamiento");
    const dateRes = await pool.query(
      "SELECT min(fecha_enrolamiento)::text AS min_fecha, max(fecha_enrolamiento)::text AS max_fecha FROM registro_enrolamiento"
    );
    const nacRes = await pool.query(
      "SELECT n.descripcion, count(*) AS total FROM registro_enrolamiento r JOIN nacionalidad n ON n.id_nacionalidad = r.id_nacionalidad GROUP BY n.descripcion ORDER BY total DESC LIMIT 5"
    );
    const regRes = await pool.query(
      "SELECT reg.nombre_region, count(*) AS total FROM registro_enrolamiento r JOIN cuartel c ON c.id_cuartel = r.id_cuartel JOIN unidad u ON u.id_unidad = c.id_unidad JOIN region reg ON reg.id_region = u.id_region GROUP BY reg.nombre_region ORDER BY total DESC"
    );

    console.log(`   • Total de registros en DB : ${Number(countRes.rows[0].total).toLocaleString()}`);
    console.log(`   • Rango de fechas          : ${dateRes.rows[0].min_fecha} hasta ${dateRes.rows[0].max_fecha}`);
    console.log("\n   • Top 5 Nacionalidades:");
    nacRes.rows.forEach((r) => {
      console.log(`     - ${r.descripcion.padEnd(20)}: ${Number(r.total).toLocaleString()}`);
    });
    console.log("\n   • Distribución por Región:");
    regRes.rows.forEach((r) => {
      console.log(`     - ${r.nombre_region.padEnd(20)}: ${Number(r.total).toLocaleString()}`);
    });

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n================================================================================");
    console.log(`✨ POBLAMIENTO EXITOSO Y COMPLETO EN ${totalElapsed} SEGUNDOS`);
    console.log("================================================================================\n");
  } catch (err) {
    console.error("\n❌ Error durante el poblamiento de la base de datos:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const excelArg = process.argv[2] || "New_Enrolados Abis.xlsx";
  poblarBaseDeDatos(excelArg);
}

module.exports = { poblarBaseDeDatos };
