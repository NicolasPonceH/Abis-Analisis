const NACIONALIDADES_PRINCIPALES = 5;

function conPorcentaje(filas, total) {
  return filas.map((f) => ({
    ...f,
    total: Number(f.total),
    porcentaje: total > 0 ? Math.round((Number(f.total) / total) * 1000) / 10 : 0,
  }));
}

// Arma la data del reporte diario (Sprint 5) a partir de las vistas de db/views.sql, con el
// mismo desglose que describe el informe de requerimientos (seccion 5): totales por dominio de
// estado, nacionalidades principales y cuarteles activos. Devuelve JSON estructurado, no el
// mensaje de Telegram formateado — eso es Sprint 6-7, que va a consumir esta funcion.
async function obtenerReporteDiario(pool, fecha) {
  const { rows: totalRows } = await pool.query(
    "SELECT total FROM vw_total_diario WHERE fecha_enrolamiento = $1", [fecha]
  );
  const total = totalRows.length > 0 ? Number(totalRows[0].total) : 0;

  if (total === 0) {
    return { fecha, total: 0, sincronizacion: [], registro: [], general: [], nacionalidadesPrincipales: [], cuartelesActivos: [] };
  }

  const [sincronizacion, registro, general, nacionalidades, cuarteles] = await Promise.all([
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
  ]);

  return {
    fecha,
    total,
    sincronizacion: conPorcentaje(sincronizacion.rows, total),
    registro: conPorcentaje(registro.rows, total),
    general: conPorcentaje(general.rows, total),
    nacionalidadesPrincipales: conPorcentaje(nacionalidades.rows, total),
    cuartelesActivos: conPorcentaje(cuarteles.rows, total),
  };
}

module.exports = { obtenerReporteDiario };
