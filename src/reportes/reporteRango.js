const NACIONALIDADES_PRINCIPALES = 10;

function conPorcentaje(filas, total) {
  return filas.map((f) => ({
    ...f,
    total: Number(f.total),
    porcentaje: total > 0 ? Math.round((Number(f.total) / total) * 1000) / 10 : 0,
  }));
}

const VACIO_RANGO = {
  desde: null, hasta: null, total: 0,
  sincronizacion: [], registro: [], general: [],
  nacionalidadesPrincipales: [], cuartelesActivos: [], unidadesActivas: [],
  genero: [], edad: [], diasConDatos: 0,
};

/**
 * Obtiene métricas agregadas entre dos fechas (desde y hasta inclusive)
 * @param {import('pg').Pool} pool 
 * @param {string} desde Formato YYYY-MM-DD
 * @param {string} hasta Formato YYYY-MM-DD
 */
async function obtenerReporteRango(pool, desde, hasta) {
  const { rows: totalRows } = await pool.query(
    `SELECT count(*) AS total, count(DISTINCT fecha_enrolamiento) AS dias
     FROM registro_enrolamiento
     WHERE fecha_enrolamiento >= $1 AND fecha_enrolamiento <= $2`,
    [desde, hasta]
  );

  const total = totalRows.length > 0 ? Number(totalRows[0].total) : 0;
  const diasConDatos = totalRows.length > 0 ? Number(totalRows[0].dias) : 0;

  if (total === 0) {
    return { ...VACIO_RANGO, desde, hasta };
  }

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
      `SELECT ep.descripcion, count(*) AS total
       FROM registro_enrolamiento r
       JOIN estado_proceso ep ON ep.id_estado = r.id_estado_sincronizacion
       WHERE r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY ep.descripcion
       ORDER BY total DESC`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT ep.descripcion, count(*) AS total
       FROM registro_enrolamiento r
       JOIN estado_proceso ep ON ep.id_estado = r.id_estado_registro
       WHERE r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY ep.descripcion
       ORDER BY total DESC`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT ep.descripcion, count(*) AS total
       FROM registro_enrolamiento r
       JOIN estado_proceso ep ON ep.id_estado = r.id_estado_general
       WHERE r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY ep.descripcion
       ORDER BY total DESC`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT n.descripcion AS nacionalidad, n.codigo_iso, count(*) AS total
       FROM registro_enrolamiento r
       JOIN nacionalidad n ON n.id_nacionalidad = r.id_nacionalidad
       WHERE r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY n.descripcion, n.codigo_iso
       ORDER BY total DESC
       LIMIT $3`,
      [desde, hasta, NACIONALIDADES_PRINCIPALES]
    ),
    pool.query(
      `SELECT c.nombre_cuartel AS cuartel, count(*) AS total
       FROM registro_enrolamiento r
       JOIN cuartel c ON c.id_cuartel = r.id_cuartel
       WHERE r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY c.nombre_cuartel
       ORDER BY total DESC`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT u.nombre_unidad AS unidad, count(*) AS total
       FROM registro_enrolamiento r
       JOIN cuartel c ON c.id_cuartel = r.id_cuartel
       JOIN unidad u ON u.id_unidad = c.id_unidad
       WHERE r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY u.nombre_unidad
       ORDER BY total DESC`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT genero, count(*) AS total
       FROM registro_enrolamiento r
       WHERE r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY genero
       ORDER BY total DESC`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT CASE WHEN es_mayor_edad THEN 'MAYOR DE EDAD' ELSE 'MENOR DE EDAD' END AS categoria,
              count(*) AS total
       FROM registro_enrolamiento r
       WHERE r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY es_mayor_edad
       ORDER BY total DESC`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT genero, es_mayor_edad, count(*) AS total
       FROM registro_enrolamiento
       WHERE fecha_enrolamiento >= $1 AND fecha_enrolamiento <= $2
       GROUP BY genero, es_mayor_edad`,
      [desde, hasta]
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
       WHERE r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY c.nombre_cuartel, u.nombre_unidad
       ORDER BY total DESC`,
      [desde, hasta]
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
    desde,
    hasta,
    total,
    diasConDatos,
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

/**
 * Obtiene la serie temporal histórica por fecha para gráficos de evolución
 * @param {import('pg').Pool} pool 
 */
async function obtenerTendenciaHistorica(pool) {
  const { rows } = await pool.query(
    `SELECT to_char(fecha_enrolamiento, 'YYYY-MM-DD') AS fecha,
            count(*) AS total,
            count(*) FILTER (WHERE id_estado_sincronizacion = 1) AS sincronizados,
            count(*) FILTER (WHERE id_estado_sincronizacion = 2) AS con_error,
            count(*) FILTER (WHERE id_estado_sincronizacion = 3) AS pendientes
     FROM registro_enrolamiento
     GROUP BY fecha_enrolamiento
     ORDER BY fecha_enrolamiento ASC`
  );

  return rows.map((r) => ({
    fecha: r.fecha,
    total: Number(r.total),
    sincronizados: Number(r.sincronizados),
    con_error: Number(r.con_error),
    pendientes: Number(r.pendientes),
  }));
}

/**
 * Retorna la lista de todas las fechas que contienen registros en la base de datos
 * @param {import('pg').Pool} pool 
 */
async function obtenerFechasDisponibles(pool) {
  const { rows } = await pool.query(
    `SELECT to_char(fecha_enrolamiento, 'YYYY-MM-DD') AS fecha, count(*) AS total
     FROM registro_enrolamiento
     GROUP BY fecha_enrolamiento
     ORDER BY fecha_enrolamiento DESC`
  );
  return rows.map(r => ({ fecha: r.fecha, total: Number(r.total) }));
}

module.exports = {
  obtenerReporteRango,
  obtenerTendenciaHistorica,
  obtenerFechasDisponibles,
};
