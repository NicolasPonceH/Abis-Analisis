const { obtenerReporteRango } = require("./reporteRango");

/**
 * Consulta y estructura el estado de proceso para una fecha específica.
 * Maneja los tres dominios institucionales: Sincronización, Registración Biométrica y Estado General.
 */
async function obtenerEstadosDia(pool, fecha) {
  const res = await pool.query(
    `SELECT tipo_estado, descripcion, total 
     FROM vw_resumen_estado_diario 
     WHERE fecha_enrolamiento = $1`,
    [fecha]
  );

  const sinc = { sincronizado: 0, pendiente: 0, error: 0, total: 0 };
  const reg = { registrado: 0, error: 0, noRegistrado: 0, pendiente: 0, total: 0 };
  const gen = { registrado: 0, error: 0, enCurso: 0, total: 0 };

  for (const row of res.rows) {
    const desc = (row.descripcion || "").toUpperCase();
    const t = Number(row.total) || 0;

    if (row.tipo_estado === "SINCRONIZACION") {
      if (desc.includes("SINCRONIZADO")) sinc.sincronizado += t;
      else if (desc.includes("PENDIENTE")) sinc.pendiente += t;
      else if (desc.includes("ERROR")) sinc.error += t;
      sinc.total += t;
    } else if (row.tipo_estado === "REGISTRO") {
      if (desc.includes("REGISTRADO")) reg.registrado += t;
      else if (desc.includes("ERROR")) reg.error += t;
      else if (desc.includes("NO REGISTRADO") || desc.includes("NO_REGISTRADO")) reg.noRegistrado += t;
      else if (desc.includes("PENDIENTE")) reg.pendiente += t;
      reg.total += t;
    } else if (row.tipo_estado === "GENERAL") {
      if (desc.includes("REGISTRADO") || desc === "OK") gen.registrado += t;
      else if (desc.includes("ERROR") || desc.includes("CON_ERROR")) gen.error += t;
      else if (desc.includes("CURSO") || desc.includes("PENDIENTE")) gen.enCurso += t;
      gen.total += t;
    }
  }

  // Verificación contra total global del día
  const totRes = await pool.query(
    "SELECT count(*) as total FROM registro_enrolamiento WHERE fecha_enrolamiento = $1",
    [fecha]
  );
  const totalDia = Number(totRes.rows[0]?.total || 0);

  if (sinc.total === 0 && totalDia > 0) {
    sinc.sincronizado = totalDia;
    sinc.total = totalDia;
  }
  if (reg.total === 0 && totalDia > 0) {
    reg.registrado = totalDia;
    reg.total = totalDia;
  }
  if (gen.total === 0 && totalDia > 0) {
    gen.registrado = totalDia;
    gen.total = totalDia;
  }

  return { sinc, reg, gen, total: totalDia };
}

/**
 * Consulta datos de menores NNA (Edades y Nacionalidades) en un rango de fechas.
 */
async function obtenerDatosNNA(pool, desde, hasta) {
  const [edadesRes, nacRes] = await Promise.all([
    pool.query(
      `SELECT edad_exacta, count(*)::int AS total
       FROM registro_enrolamiento
       WHERE es_mayor_edad = false AND fecha_enrolamiento >= $1 AND fecha_enrolamiento <= $2
       GROUP BY edad_exacta
       ORDER BY edad_exacta ASC`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT n.descripcion AS nacionalidad, count(*)::int AS total
       FROM registro_enrolamiento r
       JOIN nacionalidad n ON n.id_nacionalidad = r.id_nacionalidad
       WHERE r.es_mayor_edad = false AND r.fecha_enrolamiento >= $1 AND r.fecha_enrolamiento <= $2
       GROUP BY n.descripcion
       ORDER BY total DESC`,
      [desde, hasta]
    ),
  ]);

  const totalMenores = edadesRes.rows.reduce((sum, r) => sum + r.total, 0);

  return {
    total: totalMenores,
    porEdad: edadesRes.rows,
    porNacionalidad: nacRes.rows,
  };
}

/**
 * Genera el reporte estructurado completo del fin de semana (Viernes, Sábado y Domingo).
 * @param {import('pg').Pool} pool
 * @param {{ fechaViernes: string, fechaSabado: string, fechaDomingo: string }} fechas Formato YYYY-MM-DD
 */
async function obtenerReporteFinDeSemana(pool, params) {
  const fViernes = params.fechaViernes || params.viernes;
  const fSabado = params.fechaSabado || params.sabado;
  const fDomingo = params.fechaDomingo || params.domingo;

  // 1. Obtener estados de cada uno de los 3 días en paralelo
  const [viernes, sabado, domingo, reporteRango, nna] = await Promise.all([
    obtenerEstadosDia(pool, fViernes),
    obtenerEstadosDia(pool, fSabado),
    obtenerEstadosDia(pool, fDomingo),
    obtenerReporteRango(pool, fViernes, fDomingo),
    obtenerDatosNNA(pool, fViernes, fDomingo),
  ]);

  // 2. Calcular la columna de Totales del Fin de Semana
  const matriz = {
    sincronizacion: {
      sincronizado: [viernes.sinc.sincronizado, sabado.sinc.sincronizado, domingo.sinc.sincronizado],
      pendiente: [viernes.sinc.pendiente, sabado.sinc.pendiente, domingo.sinc.pendiente],
      error: [viernes.sinc.error, sabado.sinc.error, domingo.sinc.error],
      total: [viernes.sinc.total, sabado.sinc.total, domingo.sinc.total],
    },
    registro: {
      registrado: [viernes.reg.registrado, sabado.reg.registrado, domingo.reg.registrado],
      error: [viernes.reg.error, sabado.reg.error, domingo.reg.error],
      noRegistrado: [viernes.reg.noRegistrado, sabado.reg.noRegistrado, domingo.reg.noRegistrado],
      pendiente: [viernes.reg.pendiente, sabado.reg.pendiente, domingo.reg.pendiente],
      total: [viernes.reg.total, sabado.reg.total, domingo.reg.total],
    },
    general: {
      registrado: [viernes.gen.registrado, sabado.gen.registrado, domingo.gen.registrado],
      error: [viernes.gen.error, sabado.gen.error, domingo.gen.error],
      enCurso: [viernes.gen.enCurso, sabado.gen.enCurso, domingo.gen.enCurso],
      total: [viernes.gen.total, sabado.gen.total, domingo.gen.total],
    },
  };

  const sumar = (arr) => arr.reduce((a, b) => a + b, 0);

  const totalFinDeSemana = {
    sincronizacion: {
      sincronizado: sumar(matriz.sincronizacion.sincronizado),
      pendiente: sumar(matriz.sincronizacion.pendiente),
      error: sumar(matriz.sincronizacion.error),
      total: sumar(matriz.sincronizacion.total),
    },
    registro: {
      registrado: sumar(matriz.registro.registrado),
      error: sumar(matriz.registro.error),
      noRegistrado: sumar(matriz.registro.noRegistrado),
      pendiente: sumar(matriz.registro.pendiente),
      total: sumar(matriz.registro.total),
    },
    general: {
      registrado: sumar(matriz.general.registrado),
      error: sumar(matriz.general.error),
      enCurso: sumar(matriz.general.enCurso),
      total: sumar(matriz.general.total),
    },
  };

  // 3. Formateo legible de fechas (DD-MM-YYYY)
  const formatearFechaChile = (fStr) => {
    const [y, m, d] = fStr.split("-");
    return `${d}-${m}-${y}`;
  };

  return {
    fechas: {
      viernes: fViernes,
      sabado: fSabado,
      domingo: fDomingo,
      viernesFmt: formatearFechaChile(fViernes),
      sabadoFmt: formatearFechaChile(fSabado),
      domingoFmt: formatearFechaChile(fDomingo),
      desdeFmt: formatearFechaChile(fViernes),
      hastaFmt: formatearFechaChile(fDomingo),
    },
    dias: {
      viernes,
      sabado,
      domingo,
    },
    matriz,
    totalFinDeSemana,
    distribucion: {
      total: reporteRango.total,
      nacionalidades: reporteRango.nacionalidadesPrincipales,
      cuarteles: reporteRango.cuartelesActivos,
      unidades: reporteRango.unidadesActivas,
      dispositivos: reporteRango.dispositivos,
      genero: reporteRango.genero,
      edad: reporteRango.edad,
      regiones: reporteRango.regiones,
      nna,
    },
  };
}

/**
 * Consulta las distribuciones acumuladas históricas (al año en curso)
 * Permite filtrar por soloEnrolados (Foto 2) o todos los registros del sistema (Foto 4).
 */
async function obtenerDatosAcumulados(pool, { soloEnrolados = false } = {}) {
  const [totRes, nacRes, uniRes, cuaRes, eqRes, nnaEdades, nnaNac, etarioRes, genRes, regRes] = await Promise.all([
    pool.query(`
      SELECT count(*) as total 
      FROM registro_enrolamiento r
      ${soloEnrolados ? "JOIN cuartel c ON c.id_cuartel = r.id_cuartel JOIN unidad u ON u.id_unidad = c.id_unidad WHERE u.nombre_unidad != 'JENATID'" : ""}
    `),
    pool.query(`
      SELECT n.descripcion as nacionalidad, count(*) as total
      FROM registro_enrolamiento r
      JOIN nacionalidad n ON n.id_nacionalidad = r.id_nacionalidad
      ${soloEnrolados ? "JOIN cuartel c ON c.id_cuartel = r.id_cuartel JOIN unidad u ON u.id_unidad = c.id_unidad WHERE u.nombre_unidad != 'JENATID'" : ""}
      GROUP BY n.descripcion
      ORDER BY count(*) DESC
      LIMIT 25
    `),
    pool.query(`
      SELECT u.nombre_unidad as unidad, count(*) as total
      FROM registro_enrolamiento r
      JOIN cuartel c ON c.id_cuartel = r.id_cuartel
      JOIN unidad u ON u.id_unidad = c.id_unidad
      ${soloEnrolados ? "WHERE u.nombre_unidad != 'JENATID'" : ""}
      GROUP BY u.nombre_unidad
      ORDER BY count(*) DESC
      LIMIT 15
    `),
    pool.query(`
      SELECT c.nombre_cuartel as cuartel, count(*) as total
      FROM registro_enrolamiento r
      JOIN cuartel c ON c.id_cuartel = r.id_cuartel
      ${soloEnrolados ? "JOIN unidad u ON u.id_unidad = c.id_unidad WHERE u.nombre_unidad != 'JENATID'" : ""}
      GROUP BY c.nombre_cuartel
      ORDER BY count(*) DESC
      LIMIT 15
    `),
    pool.query(`
      SELECT eq.tipo_equipo as dispositivo, count(*) as total
      FROM registro_enrolamiento r
      JOIN equipo eq ON eq.id_equipo = r.id_equipo
      ${soloEnrolados ? "JOIN cuartel c ON c.id_cuartel = r.id_cuartel JOIN unidad u ON u.id_unidad = c.id_unidad WHERE u.nombre_unidad != 'JENATID'" : ""}
      GROUP BY eq.tipo_equipo
      ORDER BY count(*) DESC
    `),
    pool.query(`
      SELECT r.edad_exacta, count(*) as total
      FROM registro_enrolamiento r
      WHERE r.es_mayor_edad = false
      ${soloEnrolados ? "AND r.id_cuartel IN (SELECT c.id_cuartel FROM cuartel c JOIN unidad u ON u.id_unidad = c.id_unidad WHERE u.nombre_unidad != 'JENATID')" : ""}
      GROUP BY r.edad_exacta
      ORDER BY r.edad_exacta ASC
    `),
    pool.query(`
      SELECT n.descripcion as nacionalidad, count(*) as total
      FROM registro_enrolamiento r
      JOIN nacionalidad n ON n.id_nacionalidad = r.id_nacionalidad
      WHERE r.es_mayor_edad = false
      ${soloEnrolados ? "AND r.id_cuartel IN (SELECT c.id_cuartel FROM cuartel c JOIN unidad u ON u.id_unidad = c.id_unidad WHERE u.nombre_unidad != 'JENATID')" : ""}
      GROUP BY n.descripcion
      ORDER BY count(*) DESC
      LIMIT 15
    `),
    pool.query(`
      SELECT CASE WHEN es_mayor_edad THEN 'MAYOR DE EDAD' ELSE 'MENOR DE EDAD' END as categoria, count(*) as total
      FROM registro_enrolamiento r
      ${soloEnrolados ? "JOIN cuartel c ON c.id_cuartel = r.id_cuartel JOIN unidad u ON u.id_unidad = c.id_unidad WHERE u.nombre_unidad != 'JENATID'" : ""}
      GROUP BY es_mayor_edad
      ORDER BY total DESC
    `),
    pool.query(`
      SELECT genero, count(*) as total
      FROM registro_enrolamiento r
      ${soloEnrolados ? "JOIN cuartel c ON c.id_cuartel = r.id_cuartel JOIN unidad u ON u.id_unidad = c.id_unidad WHERE u.nombre_unidad != 'JENATID'" : ""}
      GROUP BY genero
      ORDER BY total DESC
    `),
    pool.query(`
      SELECT 
        CASE WHEN u.nombre_unidad = 'JENATID' THEN 'SERMIG' ELSE reg.nombre_region END AS region,
        extract(year from r.fecha_enrolamiento)::int AS anio,
        count(*)::int AS total
      FROM registro_enrolamiento r
      JOIN cuartel c ON c.id_cuartel = r.id_cuartel
      JOIN unidad u ON u.id_unidad = c.id_unidad
      JOIN region reg ON reg.id_region = u.id_region
      ${soloEnrolados ? "WHERE u.nombre_unidad != 'JENATID'" : ""}
      GROUP BY 1, 2
      ORDER BY region, anio
    `),
  ]);

  const totalNna = nnaEdades.rows.reduce((sum, r) => sum + Number(r.total), 0);

  // Pivotear tabla de regiones por año (2023, 2024, 2025, 2026)
  const regionesMap = {};
  const aniosSet = [2023, 2024, 2025, 2026];
  for (const row of regRes.rows) {
    if (!regionesMap[row.region]) {
      regionesMap[row.region] = { region: row.region, anios: {}, total: 0 };
    }
    regionesMap[row.region].anios[row.anio] = Number(row.total);
    regionesMap[row.region].total += Number(row.total);
  }

  const regionesPivote = Object.values(regionesMap).sort((a, b) => b.total - a.total);

  return {
    total: Number(totRes.rows[0]?.total || 0),
    nacionalidades: nacRes.rows.map(r => ({ nacionalidad: r.nacionalidad, total: Number(r.total) })),
    unidades: uniRes.rows.map(r => ({ unidad: r.unidad, total: Number(r.total) })),
    cuarteles: cuaRes.rows.map(r => ({ cuartel: r.cuartel, total: Number(r.total) })),
    dispositivos: eqRes.rows.map(r => ({ dispositivo: r.dispositivo, total: Number(r.total) })),
    edad: etarioRes.rows.map(r => ({ categoria: r.categoria, total: Number(r.total) })),
    genero: genRes.rows.map(r => ({ genero: r.genero, total: Number(r.total) })),
    nna: {
      total: totalNna,
      porEdad: nnaEdades.rows.map(r => ({ edad_exacta: r.edad_exacta, total: Number(r.total) })),
      porNacionalidad: nnaNac.rows.map(r => ({ nacionalidad: r.nacionalidad, total: Number(r.total) })),
    },
    regionesPivote,
    aniosDisponibles: aniosSet,
  };
}

module.exports = {
  obtenerReporteFinDeSemana,
  obtenerEstadosDia,
  obtenerDatosNNA,
  obtenerDatosAcumulados,
};

