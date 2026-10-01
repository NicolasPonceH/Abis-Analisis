export let auditState = {
  offset: 0,
  limit: 25,
  tipo: "",
  desde: "",
  hasta: ""
};

export async function cargarBitacoraAuditoria(reset = false) {
  if (reset) auditState.offset = 0;
  
  const tbody = document.getElementById("audit-table-body");
  if (!tbody) return;
  
  if (reset) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px;">Consultando bitácora...</td></tr>`;

  try {
    const params = new URLSearchParams({
      limit: auditState.limit,
      offset: auditState.offset
    });
    if (auditState.tipo) params.append("tipo", auditState.tipo);
    if (auditState.desde) params.append("desde", auditState.desde);
    if (auditState.hasta) params.append("hasta", auditState.hasta);

    const res = await fetch(`/api/auditoria?${params.toString()}`);
    if (!res.ok) throw new Error("Error en auditoría");
    
    const rows = await res.json();
    
    if (rows.length === 0 && auditState.offset === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted);">No hay eventos registrados en la bitácora.</td></tr>`;
    } else if (rows.length === 0) {
      // no-op (no hay mas pags)
    } else {
      tbody.innerHTML = rows.map(r => {
        const d = new Date(r.fecha_evento);
        const fecha = d.toLocaleDateString("es-CL") + " " + d.toLocaleTimeString("es-CL");
        
        let badgeClass = "audit-badge-default";
        if (r.tipo_evento.includes("INGESTA")) badgeClass = "audit-badge-ingesta";
        if (r.tipo_evento.includes("TELEGRAM")) badgeClass = "audit-badge-telegram";
        if (r.tipo_evento.includes("SEGURIDAD")) badgeClass = "audit-badge-seguridad";
        
        return `
          <tr>
            <td style="font-size: 0.82rem;">${fecha}</td>
            <td><span class="audit-badge ${badgeClass}">${r.tipo_evento}</span></td>
            <td style="font-family: monospace; font-size: 0.8rem; color: var(--pdi-navy);">${r.archivo_procesado || '-'}</td>
            <td>${r.usuario_o_proceso || '-'}</td>
            <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 300px; white-space: normal;">${r.detalles_cifrados || '-'}</td>
          </tr>
        `;
      }).join("");
    }
    
    document.getElementById("audit-page-info").textContent = `Página ${Math.floor(auditState.offset / auditState.limit) + 1}`;
    document.getElementById("btn-audit-prev").disabled = auditState.offset === 0;
    document.getElementById("btn-audit-next").disabled = rows.length < auditState.limit;

  } catch (e) {
    console.error("[AUDIT ERROR]", e);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: #dc2626;">Error al cargar bitácora.</td></tr>`;
  }
}

