const norm = (value) => String(value || "").trim().toUpperCase();

// Carga los seis catalogos en mapas de texto normalizado -> ID, para mapear el Excel en
// memoria sin ida y vuelta a la base de datos por cada fila.
async function loadCatalogs(pool) {
  const [nacionalidad, region, unidad, cuartel, equipo, estadoProceso] = await Promise.all([
    pool.query("SELECT id_nacionalidad, descripcion FROM nacionalidad"),
    pool.query("SELECT id_region, nombre_region FROM region"),
    pool.query(
      "SELECT u.id_unidad, u.nombre_unidad, r.nombre_region FROM unidad u JOIN region r ON r.id_region = u.id_region"
    ),
    pool.query(
      "SELECT c.id_cuartel, c.nombre_cuartel, u.nombre_unidad FROM cuartel c JOIN unidad u ON u.id_unidad = c.id_unidad"
    ),
    pool.query("SELECT id_equipo, tipo_equipo FROM equipo"),
    pool.query("SELECT id_estado, tipo_estado, descripcion FROM estado_proceso"),
  ]);

  return {
    nacionalidad: new Map(nacionalidad.rows.map((r) => [norm(r.descripcion), r.id_nacionalidad])),
    region: new Map(region.rows.map((r) => [norm(r.nombre_region), r.id_region])),
    unidad: new Map(
      unidad.rows.map((r) => [`${norm(r.nombre_region)}|${norm(r.nombre_unidad)}`, r.id_unidad])
    ),
    cuartel: new Map(
      cuartel.rows.map((r) => [`${norm(r.nombre_unidad)}|${norm(r.nombre_cuartel)}`, r.id_cuartel])
    ),
    equipo: new Map(equipo.rows.map((r) => [norm(r.tipo_equipo), r.id_equipo])),
    estadoProceso: new Map(
      estadoProceso.rows.map((r) => [`${norm(r.tipo_estado)}|${norm(r.descripcion)}`, r.id_estado])
    ),
  };
}

const GENEROS_VALIDOS = ["M", "F", "X"];
const SI_NO = { SI: true, NO: false };

// Mapea una fila cruda del Excel (ya con las cabeceras esperadas) a los campos de
// registro_enrolamiento, resolviendo cada texto libre contra los catalogos cargados.
// No inserta nada en la base de datos: eso corresponde al ETL de Sprint 3. Devuelve
// { mapped, errors } — si errors no esta vacio, la fila no debe insertarse tal cual.
function mapRow(row, catalogs) {
  const errors = [];

  const idNacionalidad = catalogs.nacionalidad.get(norm(row.nacionalidad));
  if (!idNacionalidad) errors.push(`Nacionalidad desconocida: "${row.nacionalidad}"`);

  const idUnidad = catalogs.unidad.get(`${norm(row.region)}|${norm(row.unidad)}`);
  if (!idUnidad) {
    errors.push(`Unidad "${row.unidad}" no encontrada en region "${row.region}"`);
  }

  const idCuartel = catalogs.cuartel.get(`${norm(row.unidad)}|${norm(row.cuartel)}`);
  if (!idCuartel) {
    errors.push(`Cuartel "${row.cuartel}" no encontrado en unidad "${row.unidad}"`);
  }

  const idEquipo = catalogs.equipo.get(norm(row.equipo));
  if (!idEquipo) errors.push(`Equipo desconocido: "${row.equipo}"`);

  const genero = norm(row.genero);
  if (!GENEROS_VALIDOS.includes(genero)) errors.push(`Genero invalido: "${row.genero}"`);

  const mayorEdadTexto = norm(row.mayorEdad);
  const esMayorEdad = SI_NO[mayorEdadTexto];
  if (esMayorEdad === undefined) errors.push(`"Mayor de Edad" invalido: "${row.mayorEdad}"`);

  let edadExacta = null;
  if (row.edadExacta !== undefined && String(row.edadExacta).trim() !== "") {
    edadExacta = Number(row.edadExacta);
    if (!Number.isInteger(edadExacta)) errors.push(`Edad Exacta invalida: "${row.edadExacta}"`);
  }

  const idEstadoSincronizacion = catalogs.estadoProceso.get(
    `SINCRONIZACION|${norm(row.estadoSincronizacion)}`
  );
  if (!idEstadoSincronizacion) {
    errors.push(`Estado de sincronizacion desconocido: "${row.estadoSincronizacion}"`);
  }

  const idEstadoRegistro = catalogs.estadoProceso.get(`REGISTRO|${norm(row.estadoRegistro)}`);
  if (!idEstadoRegistro) errors.push(`Estado de registro desconocido: "${row.estadoRegistro}"`);

  const idEstadoGeneral = catalogs.estadoProceso.get(`GENERAL|${norm(row.estadoGeneral)}`);
  if (!idEstadoGeneral) errors.push(`Estado general desconocido: "${row.estadoGeneral}"`);

  const fechaEnrolamiento = new Date(row.fechaEnrolamiento);
  if (Number.isNaN(fechaEnrolamiento.getTime())) {
    errors.push(`Fecha de enrolamiento invalida: "${row.fechaEnrolamiento}"`);
  }

  if (errors.length > 0) return { mapped: null, errors };

  return {
    mapped: {
      fecha_enrolamiento: fechaEnrolamiento,
      id_nacionalidad: idNacionalidad,
      id_cuartel: idCuartel,
      id_equipo: idEquipo,
      genero,
      es_mayor_edad: esMayorEdad,
      edad_exacta: edadExacta,
      id_estado_sincronizacion: idEstadoSincronizacion,
      id_estado_registro: idEstadoRegistro,
      id_estado_general: idEstadoGeneral,
    },
    errors: [],
  };
}

module.exports = { loadCatalogs, mapRow };
