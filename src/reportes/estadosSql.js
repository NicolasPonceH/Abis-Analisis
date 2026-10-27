// Identifica estados por dominio y descripción, nunca por IDs del seed.
function estadosSql(alias = "") {
  if (alias && !/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error("Alias SQL inválido");
  const prefix = alias ? alias + "." : "";
  const match = (column, domain, names) =>
    prefix + column + " IN (SELECT id_estado FROM estado_proceso WHERE tipo_estado = '" +
    domain + "' AND descripcion IN (" + names.map(n => "'" + n + "'").join(", ") + "))";
  const errorRegistro = match("id_estado_registro", "REGISTRO", ["ERROR", "CON_ERROR"]);
  const errorSincronizacion = match("id_estado_sincronizacion", "SINCRONIZACION", ["ERROR", "CON_ERROR"]);
  const errorGeneral = match("id_estado_general", "GENERAL", ["ERROR", "CON_ERROR"]);
  return {
    sincronizado: match("id_estado_sincronizacion", "SINCRONIZACION", ["SINCRONIZADO"]),
    errorRegistro, errorSincronizacion, errorGeneral,
    error: "(" + [errorRegistro, errorSincronizacion, errorGeneral].join(" OR ") + ")",
    pendiente: "(" + match("id_estado_registro", "REGISTRO", ["PENDIENTE"]) + " OR " +
      match("id_estado_sincronizacion", "SINCRONIZACION", ["PENDIENTE"]) + ")",
  };
}
module.exports = { estadosSql };
