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
  // Función para activar pestaña basada en el hash o data-tab
  const activateTab = (tabTarget) => {
    document.querySelectorAll(".tab-button").forEach((b) => b.classList.remove("active"));
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
  };

  // Manejo de tabs (click -> cambia hash)
  document.querySelectorAll(".tab-button").forEach((btn) => {
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

  // Activar pestaña inicial al cargar la página
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

  // Cambio de fecha única (Reactivo inmediato)
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

  // Botón Aplicar Filtro (Manual opcional)
  const btnApplyFilter = document.getElementById("btn-apply-filter");
  if (btnApplyFilter) {
    btnApplyFilter.addEventListener("click", () => {
      loadMetrics();
    });
  }

  // Botones de presets rápidos para métricas
  document.querySelectorAll(".preset-btn[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".preset-btn[data-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyPreset(btn.getAttribute("data-preset"));
    });
  });

  // Búsqueda en tabla de detalle
  const searchInput = document.getElementById("table-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      filterTableRows(e.target.value.toLowerCase());
    });
  }

  // Botones de exportación
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


  // Inicializar controles interactivos de Tendencias y Evolución
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
      badgeEl.innerHTML = `<span class="status-dot" style="background:#dc2626;box-shadow:0 0 8px #dc2626;"></span> Error de conexión`;
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
 * Sistema ABIS - Controlador de Frontend y Dashboard Analítico Ejecutivo (PDI Chile)
 * Manejo de estado reactivo, gráficos Chart.js de alta fidelidad, filtros y exportación.
 */

// Estado global de la aplicación


// Variable global para el reloj en vivo de ajustes


// Función de sanitización anti-XSS


// Paleta de colores ejecutiva institucional para Chart.js (Fondo claro / Alto contraste)
// Paleta de colores ejecutiva inspirada en la estética bklit-ui / shadcn


// Evitar que el navegador restaure la posición de scroll al recargar
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Inicialización de la aplicación
document.addEventListener("DOMContentLoaded", async () => {
  // Garantizar scroll al inicio
  window.scrollTo(0, 0);
  // Plugin para crear un verdadero "Glow Difuminado" en las gráficas al pasar el mouse
  if (typeof Chart !== 'undefined') {
    const trueGlowPlugin = {
      id: 'trueGlowHover',
      afterDatasetsDraw(chart) {
        const active = chart.getActiveElements();
        if (active.length > 0) {
          const ctx = chart.ctx;
          ctx.save();
          // Configuración del difuminado (sombra HTML5 real)
          ctx.shadowColor = "rgba(255, 209, 0, 0.8)"; // Amarillo
          ctx.shadowBlur = 14; // Más difuminado
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
    
    // Restaurar el borde a la normalidad para que sea "más delgado"
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

// Configuración de escuchadores de eventos


// Verifica el estado del backend y la base de datos con métricas del Connection Pool


// Carga la lista de fechas disponibles


// Control de visibilidad según modo de filtro


// Aplica presets de fecha


// Carga las métricas principales según el filtro activo


// Actualiza el resumen textual y dinámico del período


// Renderiza el banner superior de salud ejecutiva (Scorecard)


// Renderiza los KPIs con animaciones


// Animación de conteo numérico


// Helpers para diseño de gráficos amigables, legibles y modernos






// Configuración de Tooltip amigable, moderno y de alto contraste (Dark Card translúcida)


// Plugin de etiquetas numéricas directas y métricas visuales estilo amigable y limpio

Chart.register(bklitDataLabelsPlugin);

// Actualiza los badges en las cabeceras de las tarjetas de gráficos con los números relacionados


// Renderizado de gráficos con Chart.js (Estilo bklit-ui / shadcn)




// Gráfico 1: Rendimiento por Cuartel (Con barras con gradiente suave, etiquetas legibles y números directos)


// Gráfico 2: Nacionalidades (Barras horizontales con gradientes armónicos y cifras holgadas)


// Gráfico 3: Sincronización Donut Amigable (Con anillo suave y cifra central nítida)


// Gráfico 4: Demografía Cruzada (Widget HTML Custom)


// Gráfico 5: Grupo Etario Donut Flotante (Con cifras en leyendas y centro)


// Gráfico 6: Dispositivos de Captura (Tablet vs PC con donut suave y balanceado)


// Gráfico 7: Despliegue Territorial por Región Policial (Barras con gradiente horizontal)


// Gráfico 8: Histograma de Tramos Etarios & Protección NNA (Barras con gradientes verticales diferenciados)


// Gráfico 9: Perfil Sociolaboral (Top 10 Profesiones u Oficios Declarados)
 // "fecha" | "total"











// ==========================================================================
// MÓDULO AVANZADO: EVOLUCIÓN TEMPORAL Y TENDENCIAS HISTÓRICAS (TAB 3)
// ==========================================================================

// Carga de la serie histórica de tendencias desde la API


// Actualiza vista de tendencias: KPIs, filtros, gráfico y matriz detallada


// Gráfico de Tendencia Histórica Profesional (Gradiente Canvas Área estilo bklit-ui)


// Renderizado de tabla de desglose histórico día por día


// Configura límites min/max para el selector de calendario de la matriz histórica


// Configuración de eventos de la pestaña de Evolución y Tendencias


// Exporta la serie temporal histórica a formato CSV institucional


// Acción interactiva: Salta desde la matriz histórica directamente a la jornada en el Panel Analítico
window.examinarFecha = function(fecha) {
  if (!fecha) return;

  // 1. Activar pestaña de Métricas
  const tabBtn = document.querySelector('.tab-button[data-tab="metricas"]');
  if (tabBtn) tabBtn.click();

  // 2. Establecer modo a Fecha Específica
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

  // 4. Cargar métricas de esa fecha
  loadMetrics();

  // 5. Scroll suave al inicio del panel
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// Renderizado de tabla de desglose operativo con indicadores de efectividad




// Configuración de Drag & Drop para Ingesta Web


// Variable para retener el archivo y tipo de acción en espera de autorización

 // "ingesta", "cifrar", "descifrar"

// Abre el modal de seguridad solicitando clave institucional


// Cierra el modal de autorización


// Configuración de listeners del modal


// Procesa la confirmación de autorización según la acción solicitada


// Ejecuta el guardado de configuración de programación tras verificar la clave de autorización


// Envío y procesamiento seguro del archivo al backend con clave de autorización


// Exportación del reporte a JSON


// Descarga de Informe Oficial en Microsoft Word (.docx) formal


// Descarga de Informe Oficial en Microsoft Excel (.xlsx) formateado institucional


// Exportación del reporte institucional a CSV con formato oficial PDI y BOM UTF-8


// Envío manual del reporte activo al bot de Telegram institucional


// ==========================================================================
// MÓDULO DE AJUSTES: GESTIÓN DE HORARIOS DE REPORTE Y AUTOMATIZACIÓN
// ==========================================================================

state.scheduleConfig = null;
state.currentScheduleTimes = ["08:30", "19:00"];
state.serverTimeOffset = 0;

// Actualiza el reloj institucional en pantalla segundo a segundo ("hora corriendo")




// Carga la configuración actual de horarios desde la API


// Renderiza los chips visuales de las horas configuradas




// Añade un horario si no existe y es válido


// Actualiza el texto de alerta según el toggle switch


// Renderiza la tabla de bitácora histórica de despachos


// Configura los eventos interactivos del módulo de Ajustes


// ==========================================================================
// GESTOR DE DESTINATARIOS DE TELEGRAM (CLIENTE WEB)
// ==========================================================================

state.telegramDestinatarios = [];
state.telegramBotLink = "https://t.me/AbisSystemBot";

// Carga la lista de destinatarios desde el backend


// Función auxiliar de sanitización para prevenir XSS en renderizado de texto


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
        No es posible enviar prueba a '${nombre}' porque está pausado. Debe activarlo primero.
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

    if (feedback) {
      feedback.className = "crypto-feedback-box success";
      feedback.style.display = "block";
      feedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Mensaje de Verificación Enviado</span>
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

// Solicitar eliminación de destinatario
window.solicitarEliminarDestinatario = function(id, nombre, chatId) {
  if (!confirm(`¿Está seguro de eliminar al destinatario '${nombre}' (${chatId}) de la base de datos de Telegram?`)) {
    return;
  }
  promptAuthModal({ id, nombre, chatId }, "destinatario_eliminar");
};

// Ejecución autorizada para agregar destinatario


// Ejecución autorizada para toggle estado destinatario


// Ejecución autorizada para eliminar destinatario


// ==========================================================================
// MÓDULO: COMPARADOR DE PERÍODOS (BENCHMARKING)
// ==========================================================================



document.getElementById("btn-comp-semana")?.addEventListener("click", () => cargarComparacionPeriodos("semana"));
document.getElementById("btn-comp-mes")?.addEventListener("click", () => cargarComparacionPeriodos("mes"));

// ==========================================================================
// MÓDULO: BITÁCORA Y AUDITORÍA
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
// MÓDULO DE HOJA DE CÁLCULO / PORTAPAPELES DIRECTO (ORACLE & EXCEL)
// ==========================================================================
























