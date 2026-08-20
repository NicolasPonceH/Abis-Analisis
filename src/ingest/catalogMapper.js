const { resolve } = require("../etl/catalogResolver");

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

// Resuelve un campo contra un catalogo, tolerando errores de tipeo menores (Sprint 3).
// "matchKey" es lo que se busca en el mapa (ya normalizado, puede ser una clave compuesta
// como "SINCRONIZACION|SINCRONIZADO"); "displayText" es lo que ve el usuario en errores y
// correcciones (el valor tal cual venia en el Excel). Si hubo que corregir el texto, lo
// registra en "correcciones" para dejar rastro de auditoria.
// "unknownPhrase" es la frase completa a usar si no hay match (ej. "Nacionalidad desconocida"),
// para no perder concordancia de genero componiendola genericamente.
function resolveField(map, matchKey, displayText, label, unknownPhrase, errors, correcciones) {
  const result = resolve(map, matchKey);
  if (!result) {
    errors.push(`${unknownPhrase}: "${displayText}"`);
    return null;
  }
  if (result.corrected) {
    const matchedDisplay = result.matched.includes("|")
      ? result.matched.split("|")[1]
      : result.matched;
    correcciones.push(`${label}: "${displayText}" interpretado como "${matchedDisplay}"`);
  }
  return result.id;
}

// Mapea una fila cruda del Excel (ya con las cabeceras esperadas) a los campos de
// registro_enrolamiento, resolviendo cada texto libre contra los catalogos cargados
// (con tolerancia a tipeos menores en nacionalidad, equipo y estados — Sprint 3).
// Region/Unidad/Cuartel se resuelven por coincidencia exacta unicamente: al ser una jerarquia
// de 3 niveles, una correccion automatica ambigua ahi es mas riesgosa que en un catalogo plano.
// Devuelve { mapped, errors } — si errors no esta vacio, la fila no debe insertarse tal cual.
function mapRow(row, catalogs) {
  const errors = [];
  const correcciones = [];

  const idNacionalidad = resolveField(
    catalogs.nacionalidad, norm(row.nacionalidad), row.nacionalidad,
    "Nacionalidad", "Nacionalidad desconocida", errors, correcciones
  );

  const idUnidad = catalogs.unidad.get(`${norm(row.region)}|${norm(row.unidad)}`);
  if (!idUnidad) {
    errors.push(`Unidad "${row.unidad}" no encontrada en region "${row.region}"`);
  }

  const idCuartel = catalogs.cuartel.get(`${norm(row.unidad)}|${norm(row.cuartel)}`);
  if (!idCuartel) {
    errors.push(`Cuartel "${row.cuartel}" no encontrado en unidad "${row.unidad}"`);
  }

  const idEquipo = resolveField(
    catalogs.equipo, norm(row.equipo), row.equipo,
    "Equipo", "Equipo desconocido", errors, correcciones
  );

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

  const idEstadoSincronizacion = resolveField(
    catalogs.estadoProceso, `SINCRONIZACION|${norm(row.estadoSincronizacion)}`, row.estadoSincronizacion,
    "Estado de sincronizacion", "Estado de sincronizacion desconocido", errors, correcciones
  );

  const idEstadoRegistro = resolveField(
    catalogs.estadoProceso, `REGISTRO|${norm(row.estadoRegistro)}`, row.estadoRegistro,
    "Estado de registro", "Estado de registro desconocido", errors, correcciones
  );

  const idEstadoGeneral = resolveField(
    catalogs.estadoProceso, `GENERAL|${norm(row.estadoGeneral)}`, row.estadoGeneral,
    "Estado general", "Estado general desconocido", errors, correcciones
  );

  // Se guarda como string "YYYY-MM-DD", no como objeto Date: Postgres parsea el string
  // directamente sin conversion de zona horaria. Pasarla por un Date de JS y volver a
  // serializarla corre la fecha un dia para atras en zonas detras de UTC (como Chile).
  const fechaEnrolamiento = String(row.fechaEnrolamiento || "").trim();
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fechaEnrolamiento)
    && !Number.isNaN(new Date(fechaEnrolamiento).getTime());
  if (!fechaValida) {
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
      correcciones,
    },
    errors: [],
  };
}

module.exports = { loadCatalogs, mapRow };
