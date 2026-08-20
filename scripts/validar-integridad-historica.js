// Valida integridad de registro_enrolamiento y mide el uso de indices en consultas
// representativas del futuro dashboard de estadisticas — Sprint 4.
require("dotenv").config();
const pool = require("../src/db");

async function contar(sql) {
  const { rows } = await pool.query(sql);
  return rows[0].count;
}

async function validarIntegridad() {
  console.log("=== Validacion de integridad ===\n");

  const total = await contar("SELECT count(*) FROM registro_enrolamiento");
  console.log(`Total de registros: ${total}`);

  const { rows: rango } = await pool.query(`
    SELECT to_char(min(fecha_enrolamiento), 'YYYY-MM-DD') AS desde,
           to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS hasta
    FROM registro_enrolamiento
  `);
  console.log(`Rango de fechas: ${rango[0].desde} a ${rango[0].hasta}`);

  // Las FK ya garantizan que no hay ids huerfanos (Postgres las rechaza al insertar);
  // esto confirma que no quedo ninguna fila con NULL en una columna NOT NULL por accidente
  // en algun camino de insercion que se salte las validaciones normales.
  const nulos = await contar(`
    SELECT count(*) FROM registro_enrolamiento
    WHERE fecha_enrolamiento IS NULL OR id_nacionalidad IS NULL OR id_cuartel IS NULL
       OR id_equipo IS NULL OR id_estado_sincronizacion IS NULL
       OR id_estado_registro IS NULL OR id_estado_general IS NULL
  `);
  console.log(`Filas con FK/campos obligatorios en NULL: ${nulos} (deberia ser 0)`);

  // Inconsistencia logica: un menor de edad no deberia tener es_mayor_edad = true y
  // simultaneamente una edad_exacta >= 18 (o viceversa) — esto no lo protege ninguna
  // constraint del esquema, solo la logica del ETL, asi que vale la pena confirmarlo.
  const inconsistentes = await contar(`
    SELECT count(*) FROM registro_enrolamiento
    WHERE (es_mayor_edad = true AND edad_exacta IS NOT NULL)
       OR (es_mayor_edad = false AND edad_exacta IS NULL)
  `);
  console.log(`Filas con es_mayor_edad/edad_exacta inconsistentes: ${inconsistentes} (deberia ser 0)`);

  console.log("\n=== Distribucion (para detectar sesgos obvios en la carga) ===\n");
  const { rows: porNacionalidad } = await pool.query(`
    SELECT n.descripcion, count(*) AS total
    FROM registro_enrolamiento r JOIN nacionalidad n ON n.id_nacionalidad = r.id_nacionalidad
    GROUP BY n.descripcion ORDER BY total DESC
  `);
  console.table(porNacionalidad);

  console.log("\n=== Planes de consulta (EXPLAIN ANALYZE) ===\n");

  const consultas = [
    {
      nombre: "Resumen de estado general por fecha (patron del reporte diario)",
      sql: `EXPLAIN ANALYZE
            SELECT id_estado_general, count(*) FROM registro_enrolamiento
            WHERE fecha_enrolamiento = (SELECT max(fecha_enrolamiento) FROM registro_enrolamiento)
            GROUP BY id_estado_general`,
    },
    {
      nombre: "Conteo por estado de sincronizacion (todo el historico)",
      sql: `EXPLAIN ANALYZE
            SELECT id_estado_sincronizacion, count(*) FROM registro_enrolamiento
            GROUP BY id_estado_sincronizacion`,
    },
  ];

  for (const { nombre, sql } of consultas) {
    console.log(`--- ${nombre} ---`);
    const { rows } = await pool.query(sql);
    rows.forEach((r) => console.log(r["QUERY PLAN"]));
    console.log("");
  }

  await pool.end();
}

validarIntegridad().catch((err) => {
  console.error("Error validando integridad:", err.message);
  pool.end().finally(() => process.exit(1));
});
