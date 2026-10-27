// Contrato público consumido por ajustes.js: nunca expone el ID completo ni su cifrado.
function maskSensitiveId(id) {
  const value = String(id ?? "").trim();
  if (!value) return "";
  return value.length <= 7 ? "***" : value.slice(0, 4) + "***" + value.slice(-3);
}

function destinatarioPublico(destinatario) {
  return {
    id: destinatario.id,
    nombre: destinatario.nombre,
    activo: destinatario.activo,
    chatId: maskSensitiveId(destinatario.chat_id),
    rol_unidad: destinatario.rol_unidad,
    fecha_registro: destinatario.fecha_registro,
  };
}

module.exports = { destinatarioPublico, maskSensitiveId };
