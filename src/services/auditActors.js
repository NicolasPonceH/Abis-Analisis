// Presentación de responsables: nunca modifica los eventos históricos.
const LEGACY_ACTORS = new Set([
  'Operador Autorizado Web', 'Operador Hoja de Cálculo Web',
  'Operador Criptográfico Web', 'Operador Administrador Web',
  'Prueba manual sin usuario registrado',
]);

function presentAuditActor(row, linkedLot) {
  const recorded = String(row.usuario_o_proceso || '').trim();
  if (linkedLot && LEGACY_ACTORS.has(recorded)) {
    return { ...row, responsable: linkedLot.usuario, responsable_tipo: 'usuario',
      responsable_fuente: `Historial del lote #${linkedLot.id_lote}` };
  }
  if (!recorded || LEGACY_ACTORS.has(recorded)) {
    return { ...row, responsable: 'Usuario no registrado', responsable_tipo: 'desconocido',
      responsable_fuente: recorded || 'Evento histórico sin identificación' };
  }
  const automatic = recorded === 'Servicio Programador ABIS' || recorded === 'SISTEMA' || recorded === 'oracle-integration';
  return { ...row, responsable: recorded, responsable_tipo: automatic ? 'sistema' : 'usuario',
    responsable_fuente: automatic ? 'Proceso automático' : 'Registrado en el evento' };
}

async function withAuditActors(pool, events) {
  const legacyIds = events.filter(row => LEGACY_ACTORS.has(row.usuario_o_proceso) &&
    ['INGESTA_EXCEL_AUTORIZADA', 'INGESTA_PORTAPAPELES_AUTORIZADA'].includes(row.tipo_evento))
    .map(row => row.id_auditoria);
  let matches = [];
  if (legacyIds.length) {
    try {
      // Una coincidencia única de contenido, origen y finalización. Si hay
      // ambigüedad, no atribuimos la operación a ninguna persona.
      ({ rows: matches } = await pool.query(`
        SELECT a.id_auditoria, min(l.id_lote) AS id_lote, min(l.usuario) AS usuario
        FROM registro_auditoria_cifrada a
        JOIN ingesta_lote l ON l.hash_sha256 = a.hash_sha256
          AND l.nombre_archivo = a.archivo_procesado
          AND l.tipo_ingesta = CASE WHEN a.tipo_evento = 'INGESTA_EXCEL_AUTORIZADA' THEN 'ARCHIVO' ELSE 'HOJA' END
          AND l.iniciado_en <= a.fecha_evento
          AND l.finalizado_en BETWEEN a.fecha_evento - interval '1 minute' AND a.fecha_evento
        WHERE a.id_auditoria = ANY($1::bigint[])
        GROUP BY a.id_auditoria
        HAVING count(*) = 1 AND min(nullif(trim(l.usuario), '')) IS NOT NULL`, [legacyIds]));
    } catch (error) {
      // Una instalación antigua puede no tener historial de lotes todavía.
      if (error.code !== '42P01') throw error;
    }
  }
  const byId = new Map(matches.map(row => [String(row.id_auditoria), row]));
  return events.map(row => presentAuditActor(row, byId.get(String(row.id_auditoria))));
}

module.exports = { presentAuditActor, withAuditActors };
