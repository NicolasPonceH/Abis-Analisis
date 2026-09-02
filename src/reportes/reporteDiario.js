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

// Arma la data del reporte diario a partir de las vistas y consultas analiticas.
async function obtenerReporteDiario(pool, fecha) {
  const { rows: totalRows } = await pool.query(
    "SELECT total FROM vw_total_diario WHERE fecha_enrolamiento = $1", [fecha]
  );
  const total = totalRows.length > 0 ? Number(totalRows[0].total) : 0;

  if (total === 0) return { ...VACIO, fecha };

  const [
    sincronizacion,
    registro,
    general,
    nacionalidades,
    cuarteles,
    unidades,
    genero,
    edad,
    demografiaCruzada,
    rendimientoCuarteles,
  ] = await Promise.all([
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
      `SELECT n.descripcion AS nacionalidad, n.codigo_iso, count(*) AS total
       FROM registro_enrolamiento r
       JOIN nacionalidad n ON n.id_nacionalidad = r.id_nacionalidad
       WHERE r.fecha_enrolamiento = $1
       GROUP BY n.descripcion, n.codigo_iso
       ORDER BY total DESC LIMIT 10`,
      [fecha]
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
    pool.query(
      `SELECT genero, es_mayor_edad, count(*) AS total
       FROM registro_enrolamiento
       WHERE fecha_enrolamiento = $1
       GROUP BY genero, es_mayor_edad`,
      [fecha]
    ),
    pool.query(
      `SELECT c.nombre_cuartel AS cuartel,
              u.nombre_unidad AS unidad,
              count(*) AS total,
              count(*) FILTER (WHERE r.id_estado_sincronizacion = 1) AS sincronizados,
              count(*) FILTER (WHERE r.id_estado_sincronizacion = 2) AS con_error,
              count(*) FILTER (WHERE r.id_estado_sincronizacion = 3) AS pendientes
       FROM registro_enrolamiento r
       JOIN cuartel c ON c.id_cuartel = r.id_cuartel
       JOIN unidad u ON u.id_unidad = c.id_unidad
       WHERE r.fecha_enrolamiento = $1
       GROUP BY c.nombre_cuartel, u.nombre_unidad
       ORDER BY total DESC`,
      [fecha]
    ),
  ]);

  const sincData = conPorcentaje(sincronizacion.rows, total);
  const regData = conPorcentaje(registro.rows, total);
  const sincOK = sincData.find(s => s.descripcion.toUpperCase().includes("SINCRONIZADO"))?.porcentaje || 0;
  const regOK = regData.find(r => r.descripcion.toUpperCase().includes("REGISTRADO"))?.porcentaje || 0;
  const errSinc = sincData.find(s => s.descripcion.toUpperCase().includes("ERROR"))?.porcentaje || 0;
  const menoresCount = Number(edad.rows.find(e => e.categoria.toUpperCase().includes("MENOR"))?.total || 0);

  const resumenEjecutivo = {
    tasaSincronizacion: sincOK,
    tasaRegistroBiometrico: regOK,
    tasaError: errSinc,
    tasaMenoresNNA: total > 0 ? Math.round((menoresCount / total) * 1000) / 10 : 0,
    estadoSLA: sincOK >= 95 ? "Óptimo" : sincOK >= 85 ? "Atención" : "Crítico",
    cuartelLider: rendimientoCuarteles.rows[0] ? {
      nombre: rendimientoCuarteles.rows[0].cuartel,
      total: Number(rendimientoCuarteles.rows[0].total),
      porcentaje: Math.round((Number(rendimientoCuarteles.rows[0].total) / total) * 1000) / 10
    } : null,
    nacionalidadLider: nacionalidades.rows[0] ? {
      nombre: nacionalidades.rows[0].nacionalidad,
      codigoIso: nacionalidades.rows[0].codigo_iso,
      total: Number(nacionalidades.rows[0].total),
      porcentaje: Math.round((Number(nacionalidades.rows[0].total) / total) * 1000) / 10
    } : null,
  };

  return {
    fecha,
    total,
    resumenEjecutivo,
    sincronizacion: sincData,
    registro: regData,
    general: conPorcentaje(general.rows, total),
    nacionalidadesPrincipales: conPorcentaje(nacionalidades.rows, total),
    cuartelesActivos: conPorcentaje(cuarteles.rows, total),
    unidadesActivas: conPorcentaje(unidades.rows, total),
    genero: conPorcentaje(genero.rows, total),
    edad: conPorcentaje(edad.rows, total),
    demografiaCruzada: demografiaCruzada.rows.map(d => ({
      genero: d.genero,
      esMayorEdad: d.es_mayor_edad,
      total: Number(d.total)
    })),
    rendimientoCuarteles: rendimientoCuarteles.rows.map(c => ({
      cuartel: c.cuartel,
      unidad: c.unidad,
      total: Number(c.total),
      sincronizados: Number(c.sincronizados),
      conError: Number(c.con_error),
      pendientes: Number(c.pendientes),
      tasaExito: Number(c.total) > 0 ? Math.round((Number(c.sincronizados) / Number(c.total)) * 1000) / 10 : 0
    })),
  };
}

module.exports = { obtenerReporteDiario };

