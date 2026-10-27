// Transformación compartida: los reportes diario y por rango conservan el mismo contrato.
const NACIONALIDADES_PRINCIPALES = 10;
function porcentaje(cantidad, total) {
  return total > 0 ? Math.round((Number(cantidad) / Number(total)) * 1000) / 10 : 0;
}

function conPorcentaje(filas, total) {
  return filas.map(f => ({ ...f, total: Number(f.total), porcentaje: porcentaje(f.total, total) }));
}

function normalizarEstado(descripcion) {
  return String(descripcion || "").trim().toUpperCase().replace(/[ _-]+/g, "_");
}

function porcentajeEstado(filas, estado, total) {
  const cantidad = filas.filter(f => normalizarEstado(f.descripcion) === estado)
    .reduce((suma, f) => suma + Number(f.total), 0);
  return porcentaje(cantidad, total);
}

async function obtenerErroresIngesta(pool, desde, hasta = desde) {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(filas_error), 0)::int AS total_errores
       FROM ingesta_lote
       WHERE iniciado_en::date >= $1::date AND iniciado_en::date <= $2::date AND estado = 'COMPLETADO'`,
      [desde, hasta]
    );
    return Number(rows[0]?.total_errores || 0);
  } catch (error) {
    // Compatibilidad solo con instalaciones antiguas sin historial; otros fallos se propagan.
    if (error.code === "42P01") return 0;
    throw error;
  }
}

function construirReporte(periodo, total, resultados, filasErrorIngesta = 0) {
  const {
    sincronizacion, registro, general, nacionalidades, cuarteles, unidades, genero, edad,
    demografiaCruzada, rendimientoCuarteles, dispositivos, regiones, tramosEtarios, errorSummary,
  } = resultados;
  // Una fila rechazada no es un registro sincronizado: se informa separadamente en el resumen.
  const sincData = conPorcentaje(sincronizacion.rows, total);
  const regData = conPorcentaje(registro.rows, total);

  const errStats = errorSummary.rows[0] || {
    errores_registro: 0,
    errores_sincronizacion: 0,
    errores_general: 0,
    total_inconsistencias: 0,
  };

  const totalErrores = Number(errStats.total_inconsistencias || 0) + filasErrorIngesta;
  const totalConIngesta = total + filasErrorIngesta;
  const tasaError = totalConIngesta > 0 ? Math.round((totalErrores / totalConIngesta) * 1000) / 10 : 0;

  const sincOK = porcentajeEstado(sincData, "SINCRONIZADO", total);
  const regOK = porcentajeEstado(regData, "REGISTRADO", total);
  const menoresCount = Number(edad.rows.find(e => e.categoria.toUpperCase().includes("MENOR"))?.total || 0);

  const resumenEjecutivo = {
    tasaSincronizacion: sincOK,
    tasaRegistroBiometrico: regOK,
    tasaError,
    totalErrores,
    erroresRegistro: Number(errStats.errores_registro || 0),
    erroresSincronizacion: Number(errStats.errores_sincronizacion || 0),
    erroresGeneral: Number(errStats.errores_general || 0),
    erroresIngesta: filasErrorIngesta,
    tasaMenoresNNA: total > 0 ? Math.round((menoresCount / total) * 1000) / 10 : 0,
    estadoSLA: sincOK >= 95 && tasaError < 5 ? "Óptimo" : sincOK >= 85 ? "Atención" : "Crítico",
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
    ...periodo,
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
      tasaExito: Number(c.total) > 0 ? Math.max(0, Math.round(((Number(c.total) - Number(c.con_error)) / Number(c.total)) * 1000) / 10) : 0
    })),
  };
}

module.exports = { NACIONALIDADES_PRINCIPALES, porcentaje, conPorcentaje, normalizarEstado, obtenerErroresIngesta, construirReporte };
