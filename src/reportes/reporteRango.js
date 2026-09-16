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
    dispositivos,
    regiones,
    tramosEtarios,
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
    pool.query(
      `SELECT eq.tipo_equipo AS dispositivo, count(*)::int AS total
       FROM registro_enrolamiento r
       JOIN equipo eq ON eq.id_equipo = r.id_equipo
       WHERE r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY eq.tipo_equipo
       ORDER BY total DESC`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT reg.nombre_region AS region, count(*)::int AS total
       FROM registro_enrolamiento r
       JOIN cuartel c ON c.id_cuartel = r.id_cuartel
       JOIN unidad u ON u.id_unidad = c.id_unidad
       JOIN region reg ON reg.id_region = u.id_region
       WHERE r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY reg.nombre_region
       ORDER BY total DESC`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT 
         CASE 
           WHEN r.edad_exacta BETWEEN 0 AND 5 THEN '0-5 (1ª Infancia)'
           WHEN r.edad_exacta BETWEEN 6 AND 12 THEN '6-12 (Niñez)'
           WHEN r.edad_exacta BETWEEN 13 AND 17 THEN '13-17 (Adolescentes NNA)'
           WHEN r.edad_exacta BETWEEN 18 AND 29 THEN '18-29 (Jóvenes)'
           WHEN r.edad_exacta BETWEEN 30 AND 49 THEN '30-49 (Adultos)'
           WHEN r.edad_exacta >= 50 THEN '50+ (Adultos Mayores)'
           ELSE 'Sin Datos'
         END AS tramo,
         count(*)::int AS total
       FROM registro_enrolamiento r
       WHERE r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY 1
       ORDER BY min(COALESCE(r.edad_exacta, 999)) ASC`,
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
    dispositivos: conPorcentaje(dispositivos.rows, total),
    regiones: conPorcentaje(regiones.rows, total),
    tramosEtarios: conPorcentaje(tramosEtarios.rows, total),
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

/**
 * Calcula métricas comparativas entre dos períodos (Semana vs Anterior o Mes vs Anterior)
 * @param {import('pg').Pool} pool 
 * @param {string} tipo "semana" o "mes"
 */
async function obtenerComparacionPeriodos(pool, tipo) {
  const dias = tipo === "semana" ? 7 : 30;

  // 1. Obtener la última fecha registrada en la base de datos como pivote
  const { rows: maxRows } = await pool.query(
    "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS max_fecha FROM registro_enrolamiento"
  );
  
  if (!maxRows[0]?.max_fecha) {
    throw new Error("No hay registros en la base de datos para comparar.");
  }

  const fechaPivote = maxRows[0].max_fecha;

  const queryStats = `
    SELECT 
      count(*)::int AS total,
      count(*) FILTER (WHERE id_estado_sincronizacion = 1)::int AS sincronizados,
      count(*) FILTER (WHERE ep_reg.descripcion IN ('ERROR', 'CON_ERROR') OR ep_gen.descripcion IN ('ERROR', 'CON_ERROR'))::int AS errores,
      min(fecha_enrolamiento) AS desde,
      max(fecha_enrolamiento) AS hasta
    FROM registro_enrolamiento r
    JOIN estado_proceso ep_reg ON ep_reg.id_estado = r.id_estado_registro
    JOIN estado_proceso ep_gen ON ep_gen.id_estado = r.id_estado_general
    WHERE fecha_enrolamiento >= ($1::date - $2::interval) AND fecha_enrolamiento <= $1::date
  `;

  const pivoteDate = new Date(`${fechaPivote}T00:00:00`);
  pivoteDate.setDate(pivoteDate.getDate() - dias);
  const fechaAnterior = pivoteDate.toISOString().split('T')[0];

  const [actualRes, anteriorRes] = await Promise.all([
    pool.query(queryStats, [fechaPivote, `${dias - 1} days`]),
    pool.query(queryStats, [fechaAnterior, `${dias - 1} days`])
  ]);

  const act = actualRes.rows[0] || { total: 0, sincronizados: 0, errores: 0 };
  const ant = anteriorRes.rows[0] || { total: 0, sincronizados: 0, errores: 0 };

  const slaActual = act.total > 0 ? (act.sincronizados / act.total) * 100 : 100;
  const slaAnterior = ant.total > 0 ? (ant.sincronizados / ant.total) * 100 : 100;

  const calcVariacion = (vAct, vAnt) => vAnt === 0 ? (vAct > 0 ? 100 : 0) : ((vAct - vAnt) / vAnt) * 100;

  return {
    actual: {
      total: act.total,
      sincronizados: act.sincronizados,
      errores: act.errores,
      sla: slaActual,
      desde: act.desde,
      hasta: act.hasta
    },
    anterior: {
      total: ant.total,
      sincronizados: ant.sincronizados,
      errores: ant.errores,
      sla: slaAnterior,
      desde: ant.desde,
      hasta: ant.hasta
    },
    variacion: {
      total: calcVariacion(act.total, ant.total),
      sincronizados: calcVariacion(act.sincronizados, ant.sincronizados),
      errores: calcVariacion(act.errores, ant.errores),
      sla: slaActual - slaAnterior // Delta absoluto para SLA
    }
  };
}

module.exports = {
  obtenerReporteRango,
  obtenerTendenciaHistorica,
  obtenerFechasDisponibles,
  obtenerComparacionPeriodos,
};
