const NACIONALIDADES_PRINCIPALES = 5;

function conPorcentaje(filas, total) {
  return filas.map((f) => ({
    ...f,
    total: Number(f.total),
    porcentaje: total > 0 ? Math.round((Number(f.total) / total) * 1000) / 10 : 0,
  }));
}

const VACIO = {
  fecha: null, total: 0, sincronizacion: [], registro: [], general: [],
  nacionalidadesPrincipales: [], cuartelesActivos: [], unidadesActivas: [], genero: [], edad: [],
};

// Arma la data del reporte diario a partir de las vistas de db/views.sql. Cubre los cinco
// desgloses que pide la seccion 2 del informe de requerimientos ("resumenes por Unidad, Cuartel,
// Nacionalidad, Edad y Genero") mas los tres dominios de estado de la seccion 5. Devuelve JSON
// estructurado, no el mensaje de Telegram formateado — eso es Sprint 6-7, que va a consumir esta
// funcion en vez de reimplementar las consultas.
async function obtenerReporteDiario(pool, fecha) {
  const { rows: totalRows } = await pool.query(
    "SELECT total FROM vw_total_diario WHERE fecha_enrolamiento = $1", [fecha]
  );
  const total = totalRows.length > 0 ? Number(totalRows[0].total) : 0;

  if (total === 0) return { ...VACIO, fecha };

  const [sincronizacion, registro, general, nacionalidades, cuarteles, unidades, genero, edad] = await Promise.all([
    pool.query(
      "SELECT descripcion, total FROM vw_resumen_estado_diario WHERE fecha_enrolamiento = $1 AND tipo_estado = 'SINCRONIZACION' ORDER BY total DESC",
      [fecha]
    ),
    pool.query(
      "SELECT descripcion, total FROM vw_resumen_estado_diario WHERE fecha_enrolamiento = $1 AND tipo_estado = 'REGISTRO' ORDER BY total DESC",
      [fecha]
    ),
    pool.query(
      "SELECT descripcion, total FROM vw_resumen_estado_diario WHERE fecha_enrolamiento = $1 AND tipo_estado = 'GENERAL' ORDER BY total DESC",
      [fecha]
    ),
    pool.query(
      "SELECT nacionalidad, total FROM vw_resumen_nacionalidad_diario WHERE fecha_enrolamiento = $1 ORDER BY total DESC LIMIT $2",
      [fecha, NACIONALIDADES_PRINCIPALES]
    ),
    pool.query(
      "SELECT cuartel, total FROM vw_resumen_cuartel_diario WHERE fecha_enrolamiento = $1 ORDER BY total DESC",
      [fecha]
    ),
    pool.query(
      "SELECT unidad, total FROM vw_resumen_unidad_diario WHERE fecha_enrolamiento = $1 ORDER BY total DESC",
      [fecha]
    ),
    pool.query(
      "SELECT genero, total FROM vw_resumen_genero_diario WHERE fecha_enrolamiento = $1 ORDER BY total DESC",
      [fecha]
    ),
    pool.query(
      "SELECT categoria, total FROM vw_resumen_edad_diario WHERE fecha_enrolamiento = $1 ORDER BY total DESC",
      [fecha]
    ),
  ]);

  return {
    fecha,
    total,
    sincronizacion: conPorcentaje(sincronizacion.rows, total),
    registro: conPorcentaje(registro.rows, total),
    general: conPorcentaje(general.rows, total),
    nacionalidadesPrincipales: conPorcentaje(nacionalidades.rows, total),
    cuartelesActivos: conPorcentaje(cuarteles.rows, total),
    unidadesActivas: conPorcentaje(unidades.rows, total),
    genero: conPorcentaje(genero.rows, total),
    edad: conPorcentaje(edad.rows, total),
  };
}

module.exports = { obtenerReporteDiario };
