/**
 * Crea la base de datos unificada Abis_OCR y aplica el schema, catálogos y vistas.
 * Uso: node scripts/crear-bd-unificada.js
 */
require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const DB_NAME = "Abis_OCR";

// Extraer host, puerto, user y password del DATABASE_URL existente (o usar defaults)
function parseConnParams() {
  const url = process.env.DATABASE_URL || "postgresql://postgres:abis_dev_pw@localhost:5433/abis_db";
  try {
    const u = new URL(url);
    return {
      host: u.hostname || "localhost",
      port: parseInt(u.port || "5433", 10),
      user: u.username || "postgres",
      password: u.password || "abis_dev_pw",
    };
  } catch {
    return { host: "localhost", port: 5433, user: "postgres", password: "abis_dev_pw" };
  }
}

async function main() {
  const params = parseConnParams();
  console.log(`\n🔧 Conectando a PostgreSQL en ${params.host}:${params.port}...\n`);

  // 1. Conectar al servidor PostgreSQL (BD 'postgres' de admin)
  const admin = new Client({
    host: params.host,
    port: params.port,
    user: params.user,
    password: params.password,
    database: "postgres",
  });

  try {
    await admin.connect();
  } catch (err) {
    console.error(`❌ No se pudo conectar a PostgreSQL: ${err.message}`);
    console.error(`   Asegúrate de que PostgreSQL está corriendo en el puerto ${params.port}`);
    process.exit(1);
  }

  // 2. Crear la BD si no existe
  const { rows } = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [DB_NAME]
  );

  if (rows.length === 0) {
    // No se puede usar parámetros en CREATE DATABASE; el nombre está controlado por nosotros
    await admin.query(`CREATE DATABASE "${DB_NAME}"`);
    console.log(`✅ Base de datos "${DB_NAME}" creada exitosamente`);
  } else {
    console.log(`ℹ️  Base de datos "${DB_NAME}" ya existe`);
  }
  await admin.end();

  // 3. Conectar a la nueva BD y aplicar scripts
  const db = new Client({
    host: params.host,
    port: params.port,
    user: params.user,
    password: params.password,
    database: DB_NAME,
  });
  await db.connect();

  const dbDir = path.join(__dirname, "..", "db");

  // 3a. Schema unificado
  const schemaPath = path.join(dbDir, "schema_unificado.sql");
  if (fs.existsSync(schemaPath)) {
    const schemaSQL = fs.readFileSync(schemaPath, "utf-8");
    await db.query(schemaSQL);
    console.log("✅ Schema unificado aplicado (ABIS + SIAD)");
  } else {
    console.warn("⚠️  No se encontró db/schema_unificado.sql");
  }

  // 3b. Catálogos ABIS (seed)
  const seedPath = path.join(dbDir, "seed_catalogos.sql");
  if (fs.existsSync(seedPath)) {
    const seedSQL = fs.readFileSync(seedPath, "utf-8");
    await db.query(seedSQL);
    console.log("✅ Catálogos seed ABIS aplicados");
  }

  // 3c. Vistas ABIS
  const viewsPath = path.join(dbDir, "views.sql");
  if (fs.existsSync(viewsPath)) {
    const viewsSQL = fs.readFileSync(viewsPath, "utf-8");
    await db.query(viewsSQL);
    console.log("✅ Vistas ABIS aplicadas");
  }

  // 3d. Hardening (si existe)
  const hardeningPath = path.join(dbDir, "hardening.sql");
  if (fs.existsSync(hardeningPath)) {
    try {
      const hardeningSQL = fs.readFileSync(hardeningPath, "utf-8");
      await db.query(hardeningSQL);
      console.log("✅ Hardening de seguridad aplicado");
    } catch (err) {
      console.warn(`⚠️  Hardening aplicado parcialmente: ${err.message}`);
    }
  }

  await db.end();

  console.log(`\n🎉 Base de datos "${DB_NAME}" lista para usar.`);
  console.log(`   Cadena de conexión: postgresql://${params.user}:***@${params.host}:${params.port}/${DB_NAME}\n`);
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
