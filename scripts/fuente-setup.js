require("dotenv").config();
const { Pool } = require("pg");

// Simulacion de la BD fuente (PruebDataBase_FAKE): crea la base abis_fuente en el mismo
// servidor de abis_db y aplica su esquema, idempotente. Representa al sistema origen que en
// produccion generaria el Excel diario — ver docs/PruebDataBase_FAKE.md.
//
// La BD fuente es deliberadamente "sucia": texto libre, sin normalizar, sin llaves foraneas.
// La normalizacion es trabajo del ETL de abis_db (Sprints 2-3), no de la fuente.

const NOMBRE_BD = "abis_fuente";

// Toma DATABASE_URL y le cambia solo la base: mismo servidor/credenciales.
function urlHacia(base) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${base}`;
  return url.toString();
}

const DDL = `
CREATE TABLE IF NOT EXISTS enrolamiento_origen (
  id                    BIGSERIAL PRIMARY KEY,
  fecha_enrolamiento    DATE NOT NULL,
  nacionalidad          TEXT NOT NULL,
  region                TEXT NOT NULL,
  unidad                TEXT NOT NULL,
  cuartel               TEXT NOT NULL,
  equipo                TEXT NOT NULL,
  genero                TEXT NOT NULL,
  mayor_edad            TEXT NOT NULL,
  edad_exacta           INT,
  estado_sincronizacion TEXT NOT NULL,
  estado_registro       TEXT NOT NULL,
  estado_general        TEXT NOT NULL,
  creado_en             TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_origen_fecha ON enrolamiento_origen (fecha_enrolamiento);
`;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no definida (.env)");
  }

  // CREATE DATABASE no puede ir dentro de una transaccion/multi-statement, por eso se
  // ejecuta solo contra la BD 'postgres' y separado del DDL de la tabla.
  const admin = new Pool({ connectionString: urlHacia("postgres") });
  const existe = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [NOMBRE_BD]);
  if (existe.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${NOMBRE_BD}`);
    console.log(`BD ${NOMBRE_BD} creada.`);
  } else {
    console.log(`BD ${NOMBRE_BD} ya existe.`);
  }
  await admin.end();

  const pool = new Pool({ connectionString: urlHacia(NOMBRE_BD) });
  try {
    await pool.query(DDL);
    console.log(`Esquema de ${NOMBRE_BD} verificado/aplicado (tabla enrolamiento_origen).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Error en fuente-setup:", err.message);
  process.exit(1);
});
