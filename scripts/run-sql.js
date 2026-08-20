require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const file = process.argv[2];
if (!file) {
  console.error("Uso: node scripts/run-sql.js <ruta-al-archivo.sql>");
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(file), "utf8");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool
  .query(sql)
  .then(() => {
    console.log(`Ejecutado correctamente: ${file}`);
    return pool.end();
  })
  .catch((err) => {
    console.error(`Error ejecutando ${file}:`, err);
    return pool.end().finally(() => process.exit(1));
  });
