// Cabeceras esperadas del Excel de enrolamiento y sus alias para compatibilidad
// con el archivo institucional real (New_Enrolados Abis.xlsx - hoja ENROLADOS).

const EXPECTED_COLUMNS = [
  {
    header: "Fecha Enrolamiento",
    aliases: ["Fecha", "FECHA_ENROLAMIENTO", "FECHA ENROLAMIENTO", "fecha_enrolamiento", "Fecha Enrolamiento"],
    field: "fechaEnrolamiento",
    required: true,
  },
  {
    header: "Nacionalidad",
    aliases: ["Nacionalidad", "NACIONALIDAD", "Emitido En", "DOCUMENTO_EMITIDO", "DOCUMENTO_EMITIDO_1"],
    field: "nacionalidad",
    required: true,
  },
  {
    header: "Region",
    aliases: ["Region", "REGION", "Región", "REGIÓN", "REGION2"],
    field: "region",
    required: false,
  },
  {
    header: "Unidad",
    aliases: ["Unidad", "UNIDAD"],
    field: "unidad",
    required: true,
  },
  {
    header: "Cuartel",
    aliases: ["Cuartel", "CUARTEL", "CUARTEL_NEW", "CUARTELNEW"],
    field: "cuartel",
    required: true,
  },
  {
    header: "Equipo",
    aliases: ["Equipo", "EQUIPO", "Dispositivo", "DISPOSITIVO"],
    field: "equipo",
    required: true,
  },
  {
    header: "Genero",
    aliases: ["Genero", "GENERO", "Género", "GÉNERO"],
    field: "genero",
    required: true,
  },
  {
    header: "Mayor de Edad",
    aliases: ["Mayor de Edad", "RANGO_ETARIO", "EDADES", "MAYOR DE EDAD", "Mayor de edad"],
    field: "mayorEdad",
    required: true,
  },
  {
    header: "Edad Exacta",
    aliases: ["Edad Exacta", "EDAD", "Edad", "EDAD_1"],
    field: "edadExacta",
    required: false,
  },
  {
    header: "Estado Sincronizacion",
    aliases: [
      "Estado Sincronizacion",
      "Sincronización PDI",
      "SINCRONIZACION_PDI",
      "Sincronizacion PDI",
      "Estado Sincronización",
    ],
    field: "estadoSincronizacion",
    required: true,
  },
  {
    header: "Estado Registro",
    aliases: [
      "Estado Registro",
      "Registración Biométrica",
      "REGISTRACION_BIOMETRICA",
      "Registracion Biometrica",
      "Estado Registración",
    ],
    field: "estadoRegistro",
    required: true,
  },
  {
    header: "Estado General",
    aliases: ["Estado General", "ESTADO_GENERAL", "Estado general"],
    field: "estadoGeneral",
    required: true,
  },
];

function normalizeHeaderName(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findMatchingHeader(columnDef, actualHeaders) {
  const allAliases = [columnDef.header, ...(columnDef.aliases || [])];
  for (const alias of allAliases) {
    const normAlias = normalizeHeaderName(alias);
    const found = actualHeaders.find((h) => normalizeHeaderName(h) === normAlias);
    if (found !== undefined) return found;
  }
  return undefined;
}

module.exports = { EXPECTED_COLUMNS, normalizeHeaderName, findMatchingHeader };

