import { state } from '../core/state.js';

export function exportCurrentReportJson() {
  if (!state.metricsData) return;
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.metricsData, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `informe_abis_${state.currentDate || "rango"}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function exportCurrentReportWord() {
  let url = "/api/export/word";
  if (state.filterMode === "range" && state.dateFrom && state.dateTo) {
    url += `?desde=${state.dateFrom}&hasta=${state.dateTo}`;
  } else if (state.currentDate) {
    url += `?fecha=${state.currentDate}`;
  }
  window.location.href = url;
}

export function exportCurrentReportExcel() {
  let url = "/api/export/excel";
  if (state.filterMode === "range" && state.dateFrom && state.dateTo) {
    url += `?desde=${state.dateFrom}&hasta=${state.dateTo}`;
  } else if (state.currentDate) {
    url += `?fecha=${state.currentDate}`;
  }
  window.location.href = url;
}

export function exportCurrentReportCsv() {
  if (!state.metricsData) return;
  const data = state.metricsData;
  const exec = data.resumenEjecutivo || {};
  const total = data.total || 0;
  const periodo = data.desde && data.hasta
    ? `Desde ${data.desde} hasta ${data.hasta}`
    : (data.fecha || state.currentDate || "Jornada");

  const lines = [];

  // Membrete Institucional PDI
  lines.push('"POLICÍA DE INVESTIGACIONES DE CHILE"');
  lines.push('"JEFATURA NACIONAL DE MIGRACIONES Y POLICÍA INTERNACIONAL"');
  lines.push('"DEPARTAMENTO DE INFORMACIÓN Y CONTROL BIOMÉTRICO (SISTEMA ABIS)"');
  lines.push('"REPORTE GERENCIAL Y OPERATIVO DE ENROLAMIENTO FRONTERIZO"');
  lines.push('""');

  // Metadatos
  lines.push(`"Fecha de Emisión","${new Date().toLocaleString('es-CL')}"`);
  lines.push(`"Período Consultado","${periodo}"`);
  lines.push(`"Total Enrolamientos Procesados","${total.toLocaleString()}"`);
  lines.push(`"Cumplimiento SLA Sincronización PDI","${exec.tasaSincronizacion || 100}% (${exec.estadoSLA || 'Óptimo'})"`);
  lines.push(`"Eficacia Registro Biométrico ABIS","${exec.tasaRegistroBiometrico || 0}%"`);
  lines.push(`"Tasa de Inconsistencias o Error","${exec.tasaError || 0}%"`);
  lines.push(`"Puesto Fronterizo con Mayor Demanda","${exec.cuartelLider ? exec.cuartelLider.nombre + ' (' + exec.cuartelLider.porcentaje + '%)' : 'N/D'}"`);
  lines.push(`"Flujo Migratorio Principal","${exec.nacionalidadLider ? exec.nacionalidadLider.nombre + ' (' + exec.nacionalidadLider.porcentaje + '%)' : 'N/D'}"`);
  lines.push(`"Clasificación Institucional","RESERVADO - USO OFICIAL EXCLUSIVO POLICÍA DE INVESTIGACIONES"`);
  lines.push(`"Cifrado y Seguridad","AES-256-GCM / Huella Digital SHA-256"`);
  lines.push('""');

  // Sección 1: Rendimiento por Cuartel y Unidad Policial
  lines.push('"1. MATRIZ DE RENDIMIENTO OPERATIVO POR CUARTEL Y UNIDAD POLICIAL"');
  lines.push('"Puesto / Cuartel","Unidad Policial","Total Enrolados","Sincronizados PDI (Exitosos)","Con Error","Tasa de Efectividad (%)"');
  const cuarteles = data.rendimientoCuarteles || [];
  cuarteles.forEach((c) => {
    lines.push(`"${c.cuartel}","${c.unidad}",${c.total},${c.sincronizados},${c.conError},"${c.tasaExito}%"`);
  });
  lines.push('""');

  // Sección 2: Flujos Migratorios
  lines.push('"2. FLUJOS MIGRATORIOS POR NACIONALIDAD (TOP PAÍSES DE ORIGEN)"');
  lines.push('"País / Nacionalidad","Código ISO","Total Enrolamientos","Proporción (%)"');
  const nacionalidades = data.nacionalidadesPrincipales || [];
  nacionalidades.forEach((n) => {
    lines.push(`"${n.nacionalidad}","${n.codigo_iso || 'N/D'}",${n.total},"${n.porcentaje}%"`);
  });
  lines.push('""');

  // Sección 3: Demografía Cruzada (Adultos vs Menores N.N.A.)
  lines.push('"3. ANÁLISIS DEMOGRÁFICO Y PROTECCIÓN DE MENORES (N.N.A.)"');
  lines.push('"Grupo Poblacional","Hombres (M)","Mujeres (F)","Total","Proporción (%)"');
  let mascAdultos = 0, mascMenores = 0, femAdultos = 0, femMenores = 0;
  (data.demografiaCruzada || []).forEach((d) => {
    if (d.genero === "M") {
      if (d.esMayorEdad) mascAdultos += d.total;
      else mascMenores += d.total;
    } else if (d.genero === "F") {
      if (d.esMayorEdad) femAdultos += d.total;
      else femMenores += d.total;
    }
  });
  const totalAdultos = mascAdultos + femAdultos;
  const totalMenores = mascMenores + femMenores;
  const totalCalculo = total || 1;
  lines.push(`"Adultos (Mayores de Edad >= 18 años)",${mascAdultos},${femAdultos},${totalAdultos},"${((totalAdultos / totalCalculo) * 100).toFixed(1)}%"`);
  lines.push(`"Niños, Niñas y Adolescentes (N.N.A. 0 a 17 años)",${mascMenores},${femMenores},${totalMenores},"${((totalMenores / totalCalculo) * 100).toFixed(1)}%"`);
  lines.push('""');

  // Sección 4: Pie de Confidencialidad
  lines.push('"AVISO LEGAL: Documento oficial generado por el Sistema ABIS de la Policía de Investigaciones de Chile."');
  lines.push('"Confidencialidad amparada por la Ley N° 19.628 sobre Protección de la Vida Privada. Prohibida su divulgación no autorizada."');

  // \uFEFF es el Byte Order Mark (BOM) UTF-8 para que Microsoft Excel abra el archivo directamente con tildes, ñ y caracteres correctos
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.setAttribute("href", url);
  a.setAttribute("download", `informe_oficial_abis_pdi_${state.currentDate || "periodo"}.csv`);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function sendReportToTelegram() {
  const btn = document.getElementById("btn-export-telegram");
  if (!btn) return;
  const originalHtml = btn.innerHTML;
  try {
    btn.disabled = true;
    btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">Enviando...</span>`;

    const payload = {};
    if (state.filterMode === "range" && state.dateFrom && state.dateTo) {
      payload.desde = state.dateFrom;
      payload.hasta = state.dateTo;
    } else if (state.currentDate) {
      payload.fecha = state.currentDate;
    }

    const res = await fetch("/api/telegram/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Error en el despacho del mensaje.");
    }

    const dateStr = new Date().toLocaleDateString('es-CL', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    showTelegramPopup(data.mensaje, dateStr);
  } catch (err) {
    console.error("Error enviando reporte a Telegram:", err);
    alert(`No se pudo enviar el reporte a Telegram: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

window.showTelegramPopup = function(mensaje, dateStr) {
  const overlay = document.createElement('div');
  overlay.className = 'telegram-popup-overlay';
  
  const content = document.createElement('div');
  content.className = 'telegram-popup-content';
  
  const iconHtml = `
    <div class="telegram-icon-wrapper">
      <svg viewBox="0 0 24 24">
        <path d="m22 2-7 20-4-9-9-4Z"></path>
        <path d="M22 2 11 13"></path>
      </svg>
    </div>
  `;
  
  const dateIcon = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  `;
  
  content.innerHTML = `
    ${iconHtml}
    <div class="telegram-popup-title">¡Reporte Enviado!</div>
    <div class="telegram-popup-msg">${mensaje}</div>
    <div class="telegram-popup-date">${dateIcon} ${dateStr}</div>
    <br>
    <button class="telegram-popup-close">Aceptar</button>
  `;
  
  overlay.appendChild(content);
  document.body.appendChild(overlay);
  
  const closeBtn = content.querySelector('.telegram-popup-close');
  
  const closePopup = () => {
    overlay.classList.add('telegram-popup-fadeout');
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 400);
  };
  
  closeBtn.addEventListener('click', closePopup);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closePopup();
    }
  });

  // Auto-close after 6 seconds
  setTimeout(() => {
    if (overlay.parentNode) closePopup();
  }, 6000);
}
