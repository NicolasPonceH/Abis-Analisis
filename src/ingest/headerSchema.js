// Cabeceras esperadas del Excel diario de enrolamiento y su mapeo a campos internos.
// INFERIDO del informe de requerimientos (seccion 4.2) — no se dispone todavia de un Excel
// real de muestra. Si el Excel real usa otros nombres de columna, este es el unico archivo
// que hay que editar: EXPECTED_COLUMNS es la fuente de verdad para lectura, validacion y mapeo.
const EXPECTED_COLUMNS = [
  { header: "Fecha Enrolamiento", field: "fechaEnrolamiento", required: true },
  { header: "Nacionalidad", field: "nacionalidad", required: true },
  { header: "Region", field: "region", required: true },
  { header: "Unidad", field: "unidad", required: true },
  { header: "Cuartel", field: "cuartel", required: true },
  { header: "Equipo", field: "equipo", required: true },
  { header: "Genero", field: "genero", required: true },
  { header: "Mayor de Edad", field: "mayorEdad", required: true },
  { header: "Edad Exacta", field: "edadExacta", required: false },
  { header: "Estado Sincronizacion", field: "estadoSincronizacion", required: true },
  { header: "Estado Registro", field: "estadoRegistro", required: true },
  { header: "Estado General", field: "estadoGeneral", required: true },
];

module.exports = { EXPECTED_COLUMNS };
