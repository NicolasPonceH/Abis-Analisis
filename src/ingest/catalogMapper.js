const { resolve } = require("../etl/catalogResolver");

const norm = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

// Carga los seis catalogos en mapas de texto normalizado -> ID, para mapear el Excel en
// memoria sin ida y vuelta a la base de datos por cada fila.
async function loadCatalogs(pool) {
  const [nacionalidad, region, unidad, cuartel, equipo, estadoProceso, profesion] = await Promise.all([
    pool.query("SELECT id_nacionalidad, descripcion, codigo_iso FROM nacionalidad"),
    pool.query("SELECT id_region, nombre_region FROM region"),
    pool.query(
      "SELECT u.id_unidad, u.nombre_unidad, r.nombre_region FROM unidad u JOIN region r ON r.id_region = u.id_region"
    ),
    pool.query(
      "SELECT c.id_cuartel, c.nombre_cuartel, u.nombre_unidad FROM cuartel c JOIN unidad u ON u.id_unidad = c.id_unidad"
    ),
    pool.query("SELECT id_equipo, tipo_equipo FROM equipo"),
    pool.query("SELECT id_estado, tipo_estado, descripcion FROM estado_proceso"),
    pool.query("SELECT id_profesion, nombre_profesion FROM profesion"),
  ]);

  const nacMap = new Map();
  nacionalidad.rows.forEach((r) => {
    nacMap.set(norm(r.descripcion), r.id_nacionalidad);
    if (r.codigo_iso) {
      nacMap.set(norm(r.codigo_iso), r.id_nacionalidad);
    }
  });

  return {
    nacionalidad: nacMap,
    region: new Map(region.rows.map((r) => [norm(r.nombre_region), r.id_region])),
    unidad: new Map(
      unidad.rows.map((r) => [`${norm(r.nombre_region)}|${norm(r.nombre_unidad)}`, r.id_unidad])
    ),
    unidadDirect: new Map(unidad.rows.map((r) => [norm(r.nombre_unidad), r.id_unidad])),
    cuartel: new Map(
      cuartel.rows.map((r) => [`${norm(r.nombre_unidad)}|${norm(r.nombre_cuartel)}`, r.id_cuartel])
    ),
    cuartelDirect: new Map(cuartel.rows.map((r) => [norm(r.nombre_cuartel), r.id_cuartel])),
    equipo: new Map(equipo.rows.map((r) => [norm(r.tipo_equipo), r.id_equipo])),
    estadoProceso: new Map(
      estadoProceso.rows.map((r) => [`${norm(r.tipo_estado)}|${norm(r.descripcion)}`, r.id_estado])
    ),
    profesion: new Map(profesion.rows.map((r) => [norm(r.nombre_profesion), r.id_profesion])),
  };
}

const GENEROS_MAP = {
  HOMBRE: "M",
  MASCULINO: "M",
  M: "M",
  MUJER: "F",
  FEMENINO: "F",
  F: "F",
  OTRO: "X",
  X: "X",
};

const SI_NO_MAP = {
  SI: true,
  S: true,
  TRUE: true,
  "1": true,
  "MAYOR DE EDAD": true,
  MAYOR: true,
  NO: false,
  N: false,
  FALSE: false,
  "0": false,
  "MENOR DE EDAD": false,
  MENOR: false,
};

function parseDateToString(val) {
  if (val === null || val === undefined || String(val).trim() === "") return "";

  // Numero serial de Excel (ej: 45078 -> 2023-06-01)
  if (
    typeof val === "number" ||
    (!Number.isNaN(Number(val)) && !String(val).includes("-") && !String(val).includes("/"))
  ) {
    const serial = Number(val);
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400 * 1000;
    const dateInfo = new Date(utcValue);
    const yyyy = dateInfo.getUTCFullYear();
    const mm = String(dateInfo.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dateInfo.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s;
}

// Resuelve un campo contra un catalogo, tolerando errores de tipeo menores (Sprint 3).
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

// Mapea una fila cruda del Excel a los campos de registro_enrolamiento.
function mapRow(row, catalogs) {
  const errors = [];
  const correcciones = [];

  const rawNac = norm(row.nacionalidad);
  const idNacionalidad = resolveField(
    catalogs.nacionalidad,
    rawNac,
    row.nacionalidad,
    "Nacionalidad",
    "Nacionalidad desconocida",
    errors,
    correcciones
  );

  // Limpieza de nombres de cuartel conocidos
  let cuartelTexto = norm(row.cuartel);
  if (cuartelTexto.startsWith("JENAMIGA6BFF") || cuartelTexto.startsWith("JENAMIG")) {
    cuartelTexto = "JENAMIG";
  } else if (cuartelTexto === "SUBDICR") {
    cuartelTexto = "SUBDICOR";
  }

  const unidadTexto = norm(row.unidad);
  let idCuartel = catalogs.cuartel.get(`${unidadTexto}|${cuartelTexto}`);

  if (!idCuartel) {
    // Fallback: busqueda directa en cuarteles por nombre
    idCuartel = catalogs.cuartelDirect.get(cuartelTexto);
  }

  if (!idCuartel) {
    // Si cuartel viene vacio o no especificado pero hay unidad conocida
    if (unidadTexto === "PREPOLIN ARICA") idCuartel = catalogs.cuartelDirect.get("ANGAMOS");
    else if (unidadTexto === "POLINT IQUIQUE") idCuartel = catalogs.cuartelDirect.get("COLCHANES");
    else if (unidadTexto === "JENATID") idCuartel = catalogs.cuartelDirect.get("JENATID");
    else if (unidadTexto === "JENAMIG") idCuartel = catalogs.cuartelDirect.get("JENAMIG");
    else if (unidadTexto === "NEC") idCuartel = catalogs.cuartelDirect.get("NEC");
    else idCuartel = catalogs.cuartelDirect.get("NO ESPECIFICADO");
  }

  if (!idCuartel) {
    errors.push(`Cuartel "${row.cuartel}" no encontrado`);
  }

  const idEquipo = resolveField(
    catalogs.equipo,
    norm(row.equipo),
    row.equipo,
    "Equipo",
    "Equipo desconocido",
    errors,
    correcciones
  );

  const rawGenero = norm(row.genero);
  const genero = GENEROS_MAP[rawGenero] || rawGenero;
  if (!["M", "F", "X"].includes(genero)) {
    errors.push(`Genero invalido: "${row.genero}"`);
  }

  let edadExacta = null;
  if (row.edadExacta !== undefined && String(row.edadExacta).trim() !== "") {
    edadExacta = Number(row.edadExacta);
    if (!Number.isInteger(edadExacta)) {
      errors.push(`Edad Exacta invalida: "${row.edadExacta}"`);
    }
  }

  const mayorEdadTexto = norm(row.mayorEdad);
  let esMayorEdad = SI_NO_MAP[mayorEdadTexto];
  if (esMayorEdad === undefined) {
    if (edadExacta !== null) {
      esMayorEdad = edadExacta >= 18;
    } else {
      errors.push(`"Mayor de Edad" invalido: "${row.mayorEdad}"`);
    }
  }

  // Estado Sincronizacion
  const rawSinc = norm(row.estadoSincronizacion || "SINCRONIZADO");
  const idEstadoSincronizacion = resolveField(
    catalogs.estadoProceso,
    `SINCRONIZACION|${rawSinc}`,
    row.estadoSincronizacion,
    "Estado de sincronizacion",
    "Estado de sincronizacion desconocido",
    errors,
    correcciones
  );

  // Estado Registro
  let rawReg = norm(row.estadoRegistro || "REGISTRADO");
  if (!rawReg || rawReg === "NULL" || rawReg === "(NULL)") rawReg = "REGISTRADO";
  const idEstadoRegistro = resolveField(
    catalogs.estadoProceso,
    `REGISTRO|${rawReg}`,
    row.estadoRegistro,
    "Estado de registro",
    "Estado de registro desconocido",
    errors,
    correcciones
  );

  // Estado General
  let rawGen = norm(row.estadoGeneral || "REGISTRADO");
  if (rawGen === "OK") rawGen = "OK";
  const idEstadoGeneral = resolveField(
    catalogs.estadoProceso,
    `GENERAL|${rawGen}`,
    row.estadoGeneral,
    "Estado general",
    "Estado general desconocido",
    errors,
    correcciones
  );

  // Profesion / Ocupacion
  let idProfesion = catalogs.profesion ? catalogs.profesion.get("NO ESPECIFICADO") || 1 : 1;
  let rawProf = norm(row.profesion);
  const PROF_ALIASES = {
    "DUE A DE CASA": "DUEÑA DE CASA",
    "ALBA IL": "ALBAÑIL",
    "ALBANIL": "ALBAÑIL",
    "ALBANIL EN GENERAL": "ALBAÑIL EN GENERAL",
    "ALBANIL (CONSTRUCCION)": "ALBAÑIL (CONSTRUCCION)",
    "COMERCIENTE": "COMERCIANTE EN GENERAL",
  };
  if (PROF_ALIASES[rawProf]) {
    rawProf = PROF_ALIASES[rawProf];
  }

  if (rawProf && catalogs.profesion) {
    if (catalogs.profesion.has(rawProf)) {
      idProfesion = catalogs.profesion.get(rawProf);
    } else {
      const resolvedProf = resolve(catalogs.profesion, rawProf);
      if (resolvedProf) {
        idProfesion = resolvedProf.id;
        if (resolvedProf.corrected) {
          correcciones.push(`Profesión: "${row.profesion}" interpretado como "${resolvedProf.matched}"`);
        }
      } else {
        idProfesion = catalogs.profesion.get("NO ESPECIFICADO") || 1;
      }
    }
  }

  // Fecha enrolamiento
  const fechaEnrolamiento = parseDateToString(row.fechaEnrolamiento);
  const fechaValida =
    /^\d{4}-\d{2}-\d{2}$/.test(fechaEnrolamiento) &&
    !Number.isNaN(new Date(fechaEnrolamiento).getTime());
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
      id_profesion: idProfesion,
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

