import { state } from './core/state.js';
import { escapeHtml } from './core/utils.js';
import { bklitDataLabelsPlugin } from './components/charts.js';
import { exportCurrentReportJson, exportCurrentReportWord, exportCurrentReportExcel, exportCurrentReportCsv, sendReportToTelegram } from './components/export.js';
import { promptAuthModal } from './modules/auth-modal.js';
import { loadMetrics, updateFilterInputsVisibility, applyPreset, cargarComparacionPeriodos, filterTableRows } from './modules/panel-ejecutivo.js';
import { setupDragAndDrop, initSpreadsheetIngest } from './modules/ingesta.js';
import { loadTrendData, setupTrendControls } from './modules/tendencias.js';
import { auditState, cargarBitacoraAuditoria } from './modules/auditoria.js';
import { loadScheduleSettings, renderTimeChips, setupScheduleEvents } from './modules/ajustes.js';

export function setupEventListeners() {
  // FunciÃ³n para activar pestaÃ±a basada en el hash o data-tab
  const activateTab = (tabTarget) => {
    document.querySelectorAll(".tab-button:not(a)").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => (c.style.display = "none"));
    
    const btn = document.querySelector(`.tab-button[data-tab="${tabTarget}"]`);
    if (btn) btn.classList.add("active");
    
    state.activeTab = tabTarget;
    const targetElement = document.getElementById(`tab-${tabTarget}`);
    if (targetElement) {
      targetElement.style.display = "block";
      targetElement.style.animation = 'none';
      targetElement.offsetHeight; // force reflow
      targetElement.style.animation = '';
    }

    window.scrollTo({ top: 0, behavior: 'instant' });

    if (tabTarget === "tendencias" && !state.trendData) {
      loadTrendData();
    }

    if (tabTarget === "auditoria") {
      cargarBitacoraAuditoria();
    }

    if (tabTarget === "ajustes") {
      loadScheduleSettings();
    }
    
    if (tabTarget === "analisis-documental") {
      initSIADTab();
    }
  };

  // Manejo de tabs (click -> cambia hash)
  document.querySelectorAll(".tab-button:not(a)").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabTarget = btn.getAttribute("data-tab");
      window.location.hash = tabTarget;
    });
  });

  // Escuchar cambios en la URL (hash)
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.replace("#", "") || "metricas";
    activateTab(hash);
  });

  // Activar pestaÃ±a inicial al cargar la pÃ¡gina
  const initialHash = window.location.hash.replace("#", "") || "metricas";
  activateTab(initialHash);

  // Selector de modo de filtro
  const filterModeSelect = document.getElementById("filter-mode-select");
  if (filterModeSelect) {
    filterModeSelect.addEventListener("change", (e) => {
      state.filterMode = e.target.value;
      updateFilterInputsVisibility();
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
      loadMetrics();
    });
  }

  // Cambio de fecha Ãºnica (Reactivo inmediato)
  const dateSingle = document.getElementById("filter-date-single");
  if (dateSingle) {
    dateSingle.addEventListener("change", (e) => {
      state.currentDate = e.target.value;
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
      loadMetrics();
    });
  }

  // Cambio de fecha inicial en rango (Desde)
  const dateFromInput = document.getElementById("filter-date-from");
  if (dateFromInput) {
    dateFromInput.addEventListener("change", (e) => {
      state.dateFrom = e.target.value;
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
      if (state.dateFrom && state.dateTo && state.dateFrom <= state.dateTo) {
        loadMetrics();
      }
    });
  }

  // Cambio de fecha final en rango (Hasta)
  const dateToInput = document.getElementById("filter-date-to");
  if (dateToInput) {
    dateToInput.addEventListener("change", (e) => {
      state.dateTo = e.target.value;
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
      if (state.dateFrom && state.dateTo && state.dateFrom <= state.dateTo) {
        loadMetrics();
      }
    });
  }

  // BotÃ³n Aplicar Filtro (Manual opcional)
  const btnApplyFilter = document.getElementById("btn-apply-filter");
  if (btnApplyFilter) {
    btnApplyFilter.addEventListener("click", () => {
      loadMetrics();
    });
  }

  // Botones de presets rÃ¡pidos para mÃ©tricas
  document.querySelectorAll(".preset-btn[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".preset-btn[data-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyPreset(btn.getAttribute("data-preset"));
    });
  });

  // BÃºsqueda en tabla de detalle
  const searchInput = document.getElementById("table-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      filterTableRows(e.target.value.toLowerCase());
    });
  }

  // Botones de exportaciÃ³n
  const btnExportWord = document.getElementById("btn-export-word");
  if (btnExportWord) {
    btnExportWord.addEventListener("click", exportCurrentReportWord);
  }

  const btnExportExcel = document.getElementById("btn-export-excel");
  if (btnExportExcel) {
    btnExportExcel.addEventListener("click", exportCurrentReportExcel);
  }

  const btnExportJson = document.getElementById("btn-export-json");
  if (btnExportJson) {
    btnExportJson.addEventListener("click", exportCurrentReportJson);
  }

  const btnExportCsv = document.getElementById("btn-export-csv");
  if (btnExportCsv) {
    btnExportCsv.addEventListener("click", exportCurrentReportCsv);
  }

  const btnExportTelegram = document.getElementById("btn-export-telegram");
  if (btnExportTelegram) {
    btnExportTelegram.addEventListener("click", sendReportToTelegram);
  }


  // Inicializar controles interactivos de Tendencias y EvoluciÃ³n
  setupTrendControls();

  // Inicializar controles de Ajustes y Horarios
  setupScheduleEvents();
}

export async function checkSystemHealth() {
  try {
    const res = await fetch("/health");
    const data = await res.json();
    const badgeEl = document.getElementById("db-status-badge");
    if (badgeEl && data.status === "ok") {
      const pool = data.pool;
      const totalReg = (data.totalRegistros || 0).toLocaleString("es-CL");
      badgeEl.innerHTML = `<span class="status-dot"></span> ${totalReg} registros`;
      if (pool) {
        badgeEl.title = `Base de Datos PostgreSQL Conectada | Pool: ${pool.totalConexiones}/${pool.configuracion?.maxConexiones || 20} (${pool.conexionesLibres} libres / ${pool.conexionesActivas} activas) | Estado: ${pool.salud}`;
      }
      badgeEl.classList.add("connected");
    }
  } catch (err) {
    console.error("Error en health check:", err);
    const badgeEl = document.getElementById("db-status-badge");
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="status-dot" style="background:#dc2626;box-shadow:0 0 8px #dc2626;"></span> Error de conexiÃ³n`;
    }
  }
}

export async function loadAvailableDates() {
  try {
    const res = await fetch("/api/fechas");
    const fechas = await res.json();
    state.availableDates = fechas;

    const select = document.getElementById("filter-date-single");
    if (select && fechas.length > 0) {
      select.innerHTML = fechas
        .map((f) => `<option value="${f.fecha}">${f.fecha} (${f.total.toLocaleString()} enrolamientos)</option>`)
        .join("");
      state.currentDate = fechas[0].fecha;
      select.value = state.currentDate;

      const dateFromInput = document.getElementById("filter-date-from");
      const dateToInput = document.getElementById("filter-date-to");
      if (dateFromInput && dateToInput) {
        dateToInput.value = fechas[0].fecha;
        dateFromInput.value = fechas[Math.min(fechas.length - 1, 6)].fecha;
        state.dateTo = dateToInput.value;
        state.dateFrom = dateFromInput.value;
      }
    }
  } catch (err) {
    console.error("Error al cargar fechas disponibles:", err);
  }
}



/**
 * Sistema ABIS - Controlador de Frontend y Dashboard AnalÃ­tico Ejecutivo (PDI Chile)
 * Manejo de estado reactivo, grÃ¡ficos Chart.js de alta fidelidad, filtros y exportaciÃ³n.
 */

// Estado global de la aplicaciÃ³n


// Variable global para el reloj en vivo de ajustes


// FunciÃ³n de sanitizaciÃ³n anti-XSS


// Paleta de colores ejecutiva institucional para Chart.js (Fondo claro / Alto contraste)
// Paleta de colores ejecutiva inspirada en la estÃ©tica bklit-ui / shadcn


// Evitar que el navegador restaure la posiciÃ³n de scroll al recargar
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// InicializaciÃ³n de la aplicaciÃ³n
document.addEventListener("DOMContentLoaded", async () => {
  // Garantizar scroll al inicio
  window.scrollTo(0, 0);
  // Plugin para crear un verdadero "Glow Difuminado" en las grÃ¡ficas al pasar el mouse
  if (typeof Chart !== 'undefined') {
    const trueGlowPlugin = {
      id: 'trueGlowHover',
      afterDatasetsDraw(chart) {
        const active = chart.getActiveElements();
        if (active.length > 0) {
          const ctx = chart.ctx;
          ctx.save();
          // ConfiguraciÃ³n del difuminado (sombra HTML5 real)
          ctx.shadowColor = "rgba(255, 209, 0, 0.8)"; // Amarillo
          ctx.shadowBlur = 14; // MÃ¡s difuminado
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          
          // Redibujar solo el elemento bajo el mouse para que emita la luz
          for (const el of active) {
            const meta = chart.getDatasetMeta(el.datasetIndex);
            const element = meta.data[el.index];
            if (element && element.draw) {
              element.draw(ctx);
            }
          }
          ctx.restore();
        }
      }
    };
    Chart.register(trueGlowPlugin);
    
    // Restaurar el borde a la normalidad para que sea "mÃ¡s delgado"
    Chart.defaults.elements.bar.hoverBorderWidth = 0;
    Chart.defaults.elements.arc.hoverBorderWidth = 0;
  }

  setupEventListeners();
  setupDragAndDrop();
  initSpreadsheetIngest();
  await checkSystemHealth();
  await loadAvailableDates();
  await loadMetrics();
  await loadTrendData();
  await loadScheduleSettings();
  await cargarComparacionPeriodos("semana");
  await cargarBitacoraAuditoria();
});

// ConfiguraciÃ³n de escuchadores de eventos


// Verifica el estado del backend y la base de datos con mÃ©tricas del Connection Pool


// Carga la lista de fechas disponibles


// Control de visibilidad segÃºn modo de filtro


// Aplica presets de fecha


// Carga las mÃ©tricas principales segÃºn el filtro activo


// Actualiza el resumen textual y dinÃ¡mico del perÃ­odo


// Renderiza el banner superior de salud ejecutiva (Scorecard)


// Renderiza los KPIs con animaciones


// AnimaciÃ³n de conteo numÃ©rico


// Helpers para diseÃ±o de grÃ¡ficos amigables, legibles y modernos






// ConfiguraciÃ³n de Tooltip amigable, moderno y de alto contraste (Dark Card translÃºcida)


// Plugin de etiquetas numÃ©ricas directas y mÃ©tricas visuales estilo amigable y limpio

Chart.register(bklitDataLabelsPlugin);

// Actualiza los badges en las cabeceras de las tarjetas de grÃ¡ficos con los nÃºmeros relacionados


// Renderizado de grÃ¡ficos con Chart.js (Estilo bklit-ui / shadcn)




// GrÃ¡fico 1: Rendimiento por Cuartel (Con barras con gradiente suave, etiquetas legibles y nÃºmeros directos)


// GrÃ¡fico 2: Nacionalidades (Barras horizontales con gradientes armÃ³nicos y cifras holgadas)


// GrÃ¡fico 3: SincronizaciÃ³n Donut Amigable (Con anillo suave y cifra central nÃ­tida)


// GrÃ¡fico 4: DemografÃ­a Cruzada (Widget HTML Custom)


// GrÃ¡fico 5: Grupo Etario Donut Flotante (Con cifras en leyendas y centro)


// GrÃ¡fico 6: Dispositivos de Captura (Tablet vs PC con donut suave y balanceado)


// GrÃ¡fico 7: Despliegue Territorial por RegiÃ³n Policial (Barras con gradiente horizontal)


// GrÃ¡fico 8: Histograma de Tramos Etarios & ProtecciÃ³n NNA (Barras con gradientes verticales diferenciados)


// GrÃ¡fico 9: Perfil Sociolaboral (Top 10 Profesiones u Oficios Declarados)
 // "fecha" | "total"











// ==========================================================================
// MÃ“DULO AVANZADO: EVOLUCIÃ“N TEMPORAL Y TENDENCIAS HISTÃ“RICAS (TAB 3)
// ==========================================================================

// Carga de la serie histÃ³rica de tendencias desde la API


// Actualiza vista de tendencias: KPIs, filtros, grÃ¡fico y matriz detallada


// GrÃ¡fico de Tendencia HistÃ³rica Profesional (Gradiente Canvas Ãrea estilo bklit-ui)


// Renderizado de tabla de desglose histÃ³rico dÃ­a por dÃ­a


// Configura lÃ­mites min/max para el selector de calendario de la matriz histÃ³rica


// ConfiguraciÃ³n de eventos de la pestaÃ±a de EvoluciÃ³n y Tendencias


// Exporta la serie temporal histÃ³rica a formato CSV institucional


// AcciÃ³n interactiva: Salta desde la matriz histÃ³rica directamente a la jornada en el Panel AnalÃ­tico
window.examinarFecha = function(fecha) {
  if (!fecha) return;

  // 1. Activar pestaÃ±a de MÃ©tricas
  const tabBtn = document.querySelector('.tab-button[data-tab="metricas"]');
  if (tabBtn) tabBtn.click();

  // 2. Establecer modo a Fecha EspecÃ­fica
  const filterModeSelect = document.getElementById("filter-mode-select");
  if (filterModeSelect) {
    filterModeSelect.value = "single";
    state.filterMode = "single";
    updateFilterInputsVisibility();
  }

  // 3. Establecer selector de fecha
  const dateSingle = document.getElementById("filter-date-single");
  if (dateSingle) {
    dateSingle.value = fecha;
    state.currentDate = fecha;
  }

  // 4. Cargar mÃ©tricas de esa fecha
  loadMetrics();

  // 5. Scroll suave al inicio del panel
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// Renderizado de tabla de desglose operativo con indicadores de efectividad




// ConfiguraciÃ³n de Drag & Drop para Ingesta Web


// Variable para retener el archivo y tipo de acciÃ³n en espera de autorizaciÃ³n

 // "ingesta", "cifrar", "descifrar"

// Abre el modal de seguridad solicitando clave institucional


// Cierra el modal de autorizaciÃ³n


// ConfiguraciÃ³n de listeners del modal


// Procesa la confirmaciÃ³n de autorizaciÃ³n segÃºn la acciÃ³n solicitada


// Ejecuta el guardado de configuraciÃ³n de programaciÃ³n tras verificar la clave de autorizaciÃ³n


// EnvÃ­o y procesamiento seguro del archivo al backend con clave de autorizaciÃ³n


// ExportaciÃ³n del reporte a JSON


// Descarga de Informe Oficial en Microsoft Word (.docx) formal


// Descarga de Informe Oficial en Microsoft Excel (.xlsx) formateado institucional


// ExportaciÃ³n del reporte institucional a CSV con formato oficial PDI y BOM UTF-8


// EnvÃ­o manual del reporte activo al bot de Telegram institucional


// ==========================================================================
// MÃ“DULO DE AJUSTES: GESTIÃ“N DE HORARIOS DE REPORTE Y AUTOMATIZACIÃ“N
// ==========================================================================

state.scheduleConfig = null;
state.currentScheduleTimes = ["08:30", "19:00"];
state.serverTimeOffset = 0;

// Actualiza el reloj institucional en pantalla segundo a segundo ("hora corriendo")




// Carga la configuraciÃ³n actual de horarios desde la API


// Renderiza los chips visuales de las horas configuradas




// AÃ±ade un horario si no existe y es vÃ¡lido


// Actualiza el texto de alerta segÃºn el toggle switch


// Renderiza la tabla de bitÃ¡cora histÃ³rica de despachos


// Configura los eventos interactivos del mÃ³dulo de Ajustes


// ==========================================================================
// GESTOR DE DESTINATARIOS DE TELEGRAM (CLIENTE WEB)
// ==========================================================================

state.telegramDestinatarios = [];
state.telegramBotLink = "https://t.me/AbisSystemBot";

// Carga la lista de destinatarios desde el backend


// FunciÃ³n auxiliar de sanitizaciÃ³n para prevenir XSS en renderizado de texto


// Renderiza la tabla de destinatarios con acciones operativas


// Configura eventos interactivos del Gestor de Destinatarios


// Enviar prueba individual
window.probarDestinatarioIndividual = async function(id, nombre, btn) {
  const dest = (state.telegramDestinatarios || []).find((d) => d.id === id);
  const feedback = document.getElementById("dest-feedback");

  if (dest && !dest.activo) {
    if (feedback) {
      feedback.className = "crypto-feedback-box error";
      feedback.style.display = "block";
      feedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Destinatario Pausado</span>
        </div>
        No es posible enviar prueba a '${nombre}' porque estÃ¡ pausado. Debe activarlo primero.
      `;
      setTimeout(() => { feedback.style.display = "none"; }, 5000);
    }
    return;
  }

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="width:12px; height:12px; border-width:2px; vertical-align:middle;"></span> Enviando...`;

  try {
    const res = await fetch(`/api/telegram/destinatarios/${id}/probar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "No se pudo enviar el mensaje.");
    }

    if (typeof window.showTelegramPopup === "function") {
      const formattedDate = new Date().toLocaleDateString("es-CL", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      window.showTelegramPopup(`Se ha enviado la verificaciÃ³n exitosamente a ${nombre}.`, formattedDate);
    } else if (feedback) {
      feedback.className = "crypto-feedback-box success";
      feedback.style.display = "block";
      feedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Mensaje de VerificaciÃ³n Enviado</span>
        </div>
        ${data.mensaje}
      `;
      setTimeout(() => { feedback.style.display = "none"; }, 6000);
    }
  } catch (err) {
    if (feedback) {
      feedback.className = "crypto-feedback-box error";
      feedback.style.display = "block";
      feedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626; margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Error al Enviar Prueba a ${nombre}</span>
        </div>
        ${err.message}
      `;
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
};

// Solicitar cambio de estado (Toggle)
window.solicitarToggleDestinatario = function(id, nombre, chatId, estadoActual) {
  const nuevoEstado = !estadoActual;
  promptAuthModal({ id, nombre, chatId, nuevoEstado }, "destinatario_toggle");
};

// Solicitar eliminaciÃ³n de destinatario
window.solicitarEliminarDestinatario = function(id, nombre, chatId) {
  if (!confirm(`Â¿EstÃ¡ seguro de eliminar al destinatario '${nombre}' (${chatId}) de la base de datos de Telegram?`)) {
    return;
  }
  promptAuthModal({ id, nombre, chatId }, "destinatario_eliminar");
};

// EjecuciÃ³n autorizada para agregar destinatario


// EjecuciÃ³n autorizada para toggle estado destinatario


// EjecuciÃ³n autorizada para eliminar destinatario


// ==========================================================================
// MÃ“DULO: COMPARADOR DE PERÃODOS (BENCHMARKING)
// ==========================================================================



document.getElementById("btn-comp-semana")?.addEventListener("click", () => cargarComparacionPeriodos("semana"));
document.getElementById("btn-comp-mes")?.addEventListener("click", () => cargarComparacionPeriodos("mes"));

// ==========================================================================
// MÃ“DULO: BITÃCORA Y AUDITORÃA
// ==========================================================================





document.getElementById("btn-audit-search")?.addEventListener("click", () => {
  auditState.tipo = document.getElementById("audit-filter-tipo").value;
  auditState.desde = document.getElementById("audit-filter-desde").value;
  auditState.hasta = document.getElementById("audit-filter-hasta").value;
  cargarBitacoraAuditoria(true);
});

document.getElementById("btn-audit-prev")?.addEventListener("click", () => {
  if (auditState.offset > 0) {
    auditState.offset -= auditState.limit;
    cargarBitacoraAuditoria();
  }
});

document.getElementById("btn-audit-next")?.addEventListener("click", () => {
  auditState.offset += auditState.limit;
  cargarBitacoraAuditoria();
});

// ==========================================================================
// MÃ“DULO DE HOJA DE CÃLCULO / PORTAPAPELES DIRECTO (ORACLE & EXCEL)
// ==========================================================================

























// ========================================== 
// MÓDULO: ANÁLISIS DOCUMENTAL (SIAD) 
// ==========================================

let siadInitialized = false;

window.initSIADTab = async function() {
  if (siadInitialized) return;
  siadInitialized = true;

  const iframe = document.getElementById('siad-iframe');
  const statusText = document.getElementById('siad-status-text');
  const statusDot = document.getElementById('siad-status-dot');
  const btnFullscreen = document.getElementById('btn-siad-fullscreen');

  try {
    statusText.textContent = 'Conectando con el módulo SIAD...';
    // Test connection to the proxy
    const res = await fetch('/analisis/login');
    if (res.ok) {
      iframe.src = iframe.getAttribute('data-src');
      statusText.textContent = 'Módulo activo y conectado (Puerto 5001)';
      statusDot.style.background = '#22c55e'; // verde
    } else {
      throw new Error('No disponible');
    }
  } catch (err) {
    statusText.textContent = 'Módulo Análisis Documental no disponible (El servicio Python podría estar apagado)';
    statusDot.style.background = '#ef4444'; // rojo
    siadInitialized = false; // Permitir reintento la próxima vez que entre
  }

  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      window.open('/analisis/', '_blank');
    });
  }
};



