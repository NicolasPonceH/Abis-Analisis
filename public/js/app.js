/**
 * Sistema ABIS - Controlador de Frontend y Dashboard Analítico Ejecutivo (PDI Chile)
 * Manejo de estado reactivo, gráficos Chart.js de alta fidelidad, filtros y exportación.
 */

// Estado global de la aplicación
const state = {
  activeTab: "metricas",
  filterMode: "single", // "single" | "range" | "all"
  currentDate: null,
  dateFrom: null,
  dateTo: null,
  availableDates: [],
  metricsData: null,
  trendData: null,
  trendRange: "30", // "15" | "30" | "90" | "365" | "all"
  trendGranularity: "day", // "day" | "month"
  trendExpanded: false,
  charts: {},
};

// Variable global para el reloj en vivo de ajustes
var liveClockInterval = null;

// Paleta de colores ejecutiva institucional para Chart.js (Fondo claro / Alto contraste)
// Paleta de colores ejecutiva inspirada en la estética bklit-ui / shadcn
const CHART_PALETTE = {
  navy: "#0f172a",
  navyLight: "#1e293b",
  blue: "#2563eb",
  blueLight: "#60a5fa",
  blueSubtle: "rgba(37, 99, 235, 0.10)",
  emerald: "#10b981", // Bklit Vivid Emerald
  emeraldLight: "#34d399",
  emeraldSubtle: "rgba(16, 185, 129, 0.12)",
  amber: "#f59e0b", // Warm Amber
  amberLight: "#fbbf24",
  amberSubtle: "rgba(245, 158, 11, 0.12)",
  crimson: "#f43f5e", // Modern Soft Rose / Crimson
  crimsonLight: "#fb7185",
  crimsonSubtle: "rgba(244, 63, 94, 0.12)",
  gold: "#c69214",
  goldLight: "#f5cf53",
  indigo: "#6366f1",
  purple: "#8b5cf6",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  slate: "#64748b",
  gridColor: "rgba(226, 232, 240, 0.75)",
  textColor: "#475569",
  nations: [
    "#2563eb", "#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b",
    "#06b6d4", "#f43f5e", "#6366f1", "#14b8a6", "#3b82f6"
  ]
};

// Inicialización de la aplicación
document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  setupDragAndDrop();
  await checkSystemHealth();
  await loadAvailableDates();
  await loadMetrics();
  await loadTrendData();
  await loadScheduleSettings();
});

// Configuración de escuchadores de eventos
function setupEventListeners() {
  // Manejo de tabs
  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => (c.style.display = "none"));
      btn.classList.add("active");
      const tabTarget = btn.getAttribute("data-tab");
      state.activeTab = tabTarget;
      const targetElement = document.getElementById(`tab-${tabTarget}`);
      if (targetElement) {
        targetElement.style.display = "block";
      }

      if (tabTarget === "tendencias" && !state.trendData) {
        loadTrendData();
      }

      if (tabTarget === "ajustes") {
        loadScheduleSettings();
      }
    });
  });

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


  // Inicializar herramientas web criptográficas (Sin terminal)
  setupCryptoWebTools();

  // Inicializar controles interactivos de Tendencias y Evolución
  setupTrendControls();

  // Inicializar controles de Ajustes y Horarios
  setupScheduleEvents();
}

// Verifica el estado del backend y la base de datos con métricas del Connection Pool
async function checkSystemHealth() {
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

// Carga la lista de fechas disponibles
async function loadAvailableDates() {
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

// Control de visibilidad según modo de filtro
function updateFilterInputsVisibility() {
  const groupSingle = document.getElementById("group-date-single");
  const groupRangeFrom = document.getElementById("group-date-from");
  const groupRangeTo = document.getElementById("group-date-to");

  if (state.filterMode === "single") {
    if (groupSingle) groupSingle.style.display = "flex";
    if (groupRangeFrom) groupRangeFrom.style.display = "none";
    if (groupRangeTo) groupRangeTo.style.display = "none";
  } else if (state.filterMode === "range" || state.filterMode === "all") {
    if (groupSingle) groupSingle.style.display = "none";
    if (groupRangeFrom) groupRangeFrom.style.display = "flex";
    if (groupRangeTo) groupRangeTo.style.display = "flex";
  }
}

// Aplica presets de fecha
function applyPreset(preset) {
  const modeSelect = document.getElementById("filter-mode-select");
  if (preset === "latest") {
    state.filterMode = "single";
    if (modeSelect) modeSelect.value = "single";
    if (state.availableDates.length > 0) {
      state.currentDate = state.availableDates[0].fecha;
      const select = document.getElementById("filter-date-single");
      if (select) select.value = state.currentDate;
    }
  } else if (preset === "7days") {
    state.filterMode = "range";
    if (modeSelect) modeSelect.value = "range";
    if (state.availableDates.length > 0) {
      state.dateTo = state.availableDates[0].fecha;
      state.dateFrom = state.availableDates[Math.min(state.availableDates.length - 1, 6)].fecha;
      document.getElementById("filter-date-to").value = state.dateTo;
      document.getElementById("filter-date-from").value = state.dateFrom;
    }
  } else if (preset === "all") {
    state.filterMode = "range";
    if (modeSelect) modeSelect.value = "range";
    if (state.availableDates.length > 0) {
      state.dateTo = state.availableDates[0].fecha;
      state.dateFrom = state.availableDates[state.availableDates.length - 1].fecha;
      document.getElementById("filter-date-to").value = state.dateTo;
      document.getElementById("filter-date-from").value = state.dateFrom;
    }
  }
  updateFilterInputsVisibility();
  loadMetrics();
}

// Carga las métricas principales según el filtro activo
async function loadMetrics() {
  const loadingIndicator = document.getElementById("loading-indicator");
  if (loadingIndicator) loadingIndicator.style.display = "inline-flex";

  try {
    let url = "/api/metricas";
    if (state.filterMode === "single") {
      const selected = document.getElementById("filter-date-single")?.value || state.currentDate;
      if (selected) url += `?fecha=${selected}`;
    } else if (state.filterMode === "range" || state.filterMode === "all") {
      const from = document.getElementById("filter-date-from")?.value || state.dateFrom;
      const to = document.getElementById("filter-date-to")?.value || state.dateTo;
      if (from && to) {
        url = `/api/metricas/rango?desde=${from}&hasta=${to}`;
      }
    }

    const res = await fetch(url);
    const data = await res.json();
    state.metricsData = data;

    renderExecutiveBanner(data);
    renderKPIs(data);
    renderCharts(data);
    renderDataTable(data);
    updateFilterSummary(data);
  } catch (err) {
    console.error("Error al obtener métricas:", err);
  } finally {
    if (loadingIndicator) loadingIndicator.style.display = "none";
  }
}

// Actualiza el resumen textual y dinámico del período
function updateFilterSummary(data) {
  const summaryContainer = document.getElementById("period-summary-container");
  const summaryEl = document.getElementById("period-summary-text");
  if (!summaryEl) return;

  const total = (data.total !== undefined ? data.total : 0).toLocaleString();

  if (data.desde && data.hasta) {
    summaryEl.innerHTML = `Consolidado analítico desde <strong>${data.desde}</strong> hasta <strong>${data.hasta}</strong> (${data.diasConDatos || 0} jornadas operativas &bull; <strong>${total}</strong> enrolamientos procesados)`;
  } else if (data.fecha) {
    summaryEl.innerHTML = `Reporte operativo correspondiente a la jornada del <strong>${data.fecha}</strong> (&bull; <strong>${total}</strong> enrolamientos procesados)`;
  } else {
    summaryEl.innerHTML = `Sin datos registrados en el período seleccionado`;
  }

  // Micro-animación de refresco visual
  if (summaryContainer) {
    summaryContainer.classList.remove("updated");
    void summaryContainer.offsetWidth; // Forzar reflujo de animación
    summaryContainer.classList.add("updated");
  }
}

// Renderiza el banner superior de salud ejecutiva (Scorecard)
function renderExecutiveBanner(data) {
  const banner = document.getElementById("executive-banner");
  if (!banner) return;

  const exec = data.resumenEjecutivo || {};
  const total = data.total || 0;

  // SLA de Sincronización
  const slaVal = exec.tasaSincronizacion !== undefined ? exec.tasaSincronizacion : 100;
  const slaEl = document.getElementById("exec-sla-val");
  const slaBadge = document.getElementById("exec-sla-badge");
  const slaIcon = document.getElementById("sla-icon");

  if (slaEl) {
    let badgeClass = "badge-success";
    let badgeText = "Óptimo";
    if (slaVal < 85) {
      badgeClass = "badge-danger";
      badgeText = "Crítico";
      if (slaIcon) { slaIcon.className = "exec-stat-icon sla-warn"; }
    } else if (slaVal < 95) {
      badgeClass = "badge-warning";
      badgeText = "Atención";
      if (slaIcon) { slaIcon.className = "exec-stat-icon sla-warn"; }
    } else {
      if (slaIcon) { slaIcon.className = "exec-stat-icon sla-ok"; }
    }
    slaEl.innerHTML = `${slaVal}% <span class="badge ${badgeClass}">${badgeText}</span>`;
  }

  // Eficacia Biometría
  const bioVal = exec.tasaRegistroBiometrico !== undefined ? exec.tasaRegistroBiometrico : 0;
  const bioEl = document.getElementById("exec-bio-val");
  if (bioEl) bioEl.textContent = `${bioVal}%`;

  // Cuartel Líder
  const quarterVal = document.getElementById("exec-quarter-val");
  const quarterSub = document.getElementById("exec-quarter-sub");
  if (quarterVal && exec.cuartelLider) {
    quarterVal.textContent = exec.cuartelLider.nombre;
    if (quarterSub) quarterSub.textContent = `${exec.cuartelLider.total.toLocaleString()} enrolamientos (${exec.cuartelLider.porcentaje}%)`;
  } else if (quarterVal) {
    quarterVal.textContent = "Sin datos";
  }

  // Nacionalidad Líder
  const natVal = document.getElementById("exec-nat-val");
  const natSub = document.getElementById("exec-nat-sub");
  if (natVal && exec.nacionalidadLider) {
    natVal.textContent = exec.nacionalidadLider.nombre;
    if (natSub) natSub.textContent = `${exec.nacionalidadLider.total.toLocaleString()} registros (${exec.nacionalidadLider.porcentaje}%)`;
  } else if (natVal) {
    natVal.textContent = "Sin datos";
  }
}

// Renderiza los KPIs con animaciones
function renderKPIs(data) {
  const total = data.total || 0;
  animateValue("kpi-total-enrolados", total);

  // Sincronización PDI
  const sincObj = data.sincronizacion?.find((s) => s.descripcion.toUpperCase().includes("SINCRONIZADO")) || { total: 0, porcentaje: 0 };
  const errObj = data.sincronizacion?.find((s) => s.descripcion.toUpperCase().includes("ERROR")) || { total: 0, porcentaje: 0 };
  
  animateValue("kpi-sincronizados", sincObj.total);
  document.getElementById("kpi-sinc-pct").textContent = `${sincObj.porcentaje}% del total procesado`;
  document.getElementById("kpi-sinc-bar").style.width = `${Math.min(sincObj.porcentaje, 100)}%`;
  
  const sincTag = document.getElementById("kpi-sinc-tag");
  if (sincTag) {
    sincTag.textContent = sincObj.porcentaje >= 95 ? "Meta Cumplida" : "En Seguimiento";
  }

  // Registro Biométrico
  const regObj = data.registro?.find((r) => r.descripcion.toUpperCase().includes("REGISTRADO")) || { total: 0, porcentaje: 0 };
  animateValue("kpi-registrados", regObj.total);
  document.getElementById("kpi-reg-pct").textContent = `${regObj.porcentaje}% del total procesado`;
  document.getElementById("kpi-reg-bar").style.width = `${Math.min(regObj.porcentaje, 100)}%`;

  // Errores / Inconsistencias
  animateValue("kpi-errores", errObj.total);
  document.getElementById("kpi-err-pct").textContent = `${errObj.porcentaje}% del total procesado`;
  document.getElementById("kpi-err-bar").style.width = `${Math.min(errObj.porcentaje, 100)}%`;
  
  const errTag = document.getElementById("kpi-err-tag");
  if (errTag) {
    errTag.textContent = errObj.total === 0 ? "Sin Incidentes" : `${errObj.total} Casos`;
  }
}

// Animación de conteo numérico
function animateValue(id, endValue) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = 0;
  const duration = 500;
  let startTime = null;

  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = Math.min((timestamp - startTime) / duration, 1);
    const current = Math.floor(progress * (endValue - start) + start);
    el.textContent = current.toLocaleString();
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      el.textContent = endValue.toLocaleString();
    }
  }
  window.requestAnimationFrame(step);
}

// Configuración de Tooltip estilo bklit-ui / shadcn (Card flotante clara, sombra suave, punto de color)
const BKLIT_TOOLTIP = {
  backgroundColor: "rgba(255, 255, 255, 0.98)",
  titleColor: "#0f172a",
  bodyColor: "#334155",
  borderColor: "rgba(226, 232, 240, 0.95)",
  borderWidth: 1,
  padding: { top: 9, bottom: 9, left: 13, right: 13 },
  boxPadding: 6,
  usePointStyle: true,
  boxWidth: 7,
  boxHeight: 7,
  cornerRadius: 10,
  titleFont: { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", size: 12, weight: "700" },
  bodyFont: { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", size: 12, weight: "500" },
  footerFont: { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", size: 11, weight: "600" },
  footerColor: "#0284c7",
};

// Plugin de etiquetas numéricas directas y métricas visuales estilo bklit-ui
const bklitDataLabelsPlugin = {
  id: "bklitDataLabels",
  afterDatasetsDraw(chart, args, options) {
    if (!options || options.display === false) return;
    const { ctx } = chart;
    ctx.save();

    const isHorizontal = chart.options.indexAxis === "y";
    const isDoughnut = chart.config.type === "doughnut";

    // 1. Centro del Doughnut: Métricas destacadas en el hueco central
    if (isDoughnut) {
      if (options.centerText) {
        const meta = chart.getDatasetMeta(0);
        if (meta && meta.data && meta.data[0]) {
          const centerX = meta.data[0].x;
          const centerY = meta.data[0].y;

          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          ctx.font = "800 21px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
          ctx.fillStyle = options.centerTextColor || "#0f172a";
          ctx.fillText(options.centerText, centerX, centerY - 9);

          if (options.centerSubtext) {
            ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.fillStyle = "#64748b";
            ctx.fillText(options.centerSubtext, centerX, centerY + 13);
          }
        }
      }
      ctx.restore();
      return;
    }

    // 2. Gráficos de Barras: Etiquetas numéricas impresas sobre o junto a las barras
    chart.data.datasets.forEach((dataset, datasetIdx) => {
      const meta = chart.getDatasetMeta(datasetIdx);
      if (meta.hidden) return;

      meta.data.forEach((element, index) => {
        const val = dataset.data[index];
        if (val === null || val === undefined || (options.hideZero && val === 0)) return;

        ctx.font = "700 10.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillStyle = options.color || "#334155";

        const formattedVal = Number(val).toLocaleString("es-CL");

        if (isHorizontal) {
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const x = element.x + 6;
          const y = element.y;

          let text = formattedVal;
          if (options.percentages && options.percentages[index] !== undefined) {
            text += ` (${options.percentages[index]}%)`;
          }
          ctx.fillText(text, x, y);
        } else {
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          const x = element.x;
          const y = element.y - 3;
          ctx.fillText(formattedVal, x, y);
        }
      });
    });

    ctx.restore();
  },
};
Chart.register(bklitDataLabelsPlugin);

// Actualiza los badges en las cabeceras de las tarjetas de gráficos con los números relacionados
function updateChartBadges(data) {
  const total = Number(data.total) || 0;

  // 1. Cuarteles
  const badgeCuarteles = document.getElementById("badge-chart-cuarteles");
  if (badgeCuarteles) {
    const cuarteles = data.rendimientoCuarteles || [];
    const sinc = cuarteles.reduce((acc, c) => acc + (Number(c.sincronizados) || 0), 0);
    const err = cuarteles.reduce((acc, c) => acc + (Number(c.conError) || 0), 0);
    badgeCuarteles.textContent = `${cuarteles.length} Cuarteles · ${sinc.toLocaleString("es-CL")} OK · ${err.toLocaleString("es-CL")} Error`;
  }

  // 2. Nacionalidades
  const badgeNac = document.getElementById("badge-chart-nacionalidades");
  if (badgeNac) {
    const nacs = data.nacionalidadesPrincipales || [];
    badgeNac.textContent = `Top ${nacs.length} Países · ${total.toLocaleString("es-CL")} Casos`;
  }

  // 3. Sincronización (Distribución PDI / ABIS)
  const badgeSinc = document.getElementById("badge-chart-sincronizacion");
  if (badgeSinc) {
    const sincList = data.sincronizacion || [];
    const sincOk = sincList.find(s => String(s.descripcion).toUpperCase().includes("SINCRONIZADO"))?.total || 0;
    const errOk = sincList.find(s => String(s.descripcion).toUpperCase().includes("ERROR"))?.total || 0;
    const pct = total > 0 ? ((sincOk / total) * 100).toFixed(1) : "100";
    badgeSinc.textContent = `${Number(sincOk).toLocaleString("es-CL")} OK · ${Number(errOk).toLocaleString("es-CL")} Error (${pct}% SLA)`;
  }

  // 4. Demografía Cruzada
  const badgeDemo = document.getElementById("badge-chart-demografia-cruzada");
  if (badgeDemo) {
    let masc = 0, fem = 0;
    (data.genero || []).forEach(g => {
      if (String(g.genero).toUpperCase().startsWith("M")) masc = Number(g.total) || 0;
      if (String(g.genero).toUpperCase().startsWith("F")) fem = Number(g.total) || 0;
    });
    badgeDemo.textContent = `${masc.toLocaleString("es-CL")} Hombres · ${fem.toLocaleString("es-CL")} Mujeres`;
  }

  // 5. Rango Etario (Adultos vs Menores)
  const badgeEdad = document.getElementById("badge-chart-edad");
  if (badgeEdad) {
    const edadList = data.edad || [];
    const mayores = edadList.find(e => String(e.categoria).toUpperCase().includes("MAYOR"))?.total || 0;
    const menores = edadList.find(e => String(e.categoria).toUpperCase().includes("MENOR"))?.total || 0;
    const pctNna = total > 0 ? ((menores / total) * 100).toFixed(1) : "0";
    badgeEdad.textContent = `${Number(mayores).toLocaleString("es-CL")} Adultos · ${Number(menores).toLocaleString("es-CL")} N.N.A. (${pctNna}%)`;
  }

  // 6. Dispositivos de Captura
  const badgeDisp = document.getElementById("badge-chart-dispositivos");
  if (badgeDisp) {
    const dispList = data.dispositivos || [];
    const pc = dispList.find(d => String(d.dispositivo).toUpperCase().includes("PC"))?.total || 0;
    const tab = dispList.find(d => String(d.dispositivo).toUpperCase().includes("TABLET"))?.total || 0;
    badgeDisp.textContent = `${Number(pc).toLocaleString("es-CL")} PC Fija · ${Number(tab).toLocaleString("es-CL")} Tablet`;
  }

  // 7. Regiones Policiales
  const badgeReg = document.getElementById("badge-chart-regiones");
  if (badgeReg) {
    const regs = data.regiones || [];
    badgeReg.textContent = `${regs.length} Regiones · ${total.toLocaleString("es-CL")} Registros`;
  }

  // 8. Tramos Etarios
  const badgeTramos = document.getElementById("badge-chart-tramos-etarios");
  if (badgeTramos) {
    let menores = 0, adultos = 0;
    (data.tramosEtarios || []).forEach(t => {
      const nom = String(t.tramo || "").toUpperCase();
      if (nom.includes("INFANCIA") || nom.includes("NIÑEZ") || nom.includes("NNA") || nom.includes("ADOLESCENTES")) {
        menores += Number(t.total) || 0;
      } else {
        adultos += Number(t.total) || 0;
      }
    });
    badgeTramos.textContent = `${menores.toLocaleString("es-CL")} Menores NNA · ${adultos.toLocaleString("es-CL")} Adultos`;
  }
}

// Renderizado de gráficos con Chart.js (Estilo bklit-ui / shadcn)
function renderCharts(data) {
  // Configuración global de Chart.js
  Chart.defaults.color = "#64748b";
  Chart.defaults.borderColor = CHART_PALETTE.gridColor;
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  Chart.defaults.font.size = 11.5;
  Chart.defaults.font.weight = "500";

  // Actualizar los números destacados en los badges de cada tarjeta
  updateChartBadges(data);

  // 1. Matriz de Rendimiento por Cuartel (Barras apiladas / agrupadas: Sincronizados vs Errores)
  renderCuartelesRendimientoChart(data);

  // 2. Gráfico de Nacionalidades (Horizontal Bar)
  renderHorizontalBarChart(
    "chart-nacionalidades",
    data.nacionalidadesPrincipales || []
  );

  // 3. Gráfico de Estados de Sincronización (Donut flotante)
  renderDoughnutChart(
    "chart-sincronizacion",
    data.sincronizacion || [],
    [CHART_PALETTE.emerald, CHART_PALETTE.crimson, CHART_PALETTE.amber, CHART_PALETTE.cyan]
  );

  // 4. Demografía Cruzada (Pirámide de Género vs Adultos / N.N.A.)
  renderDemografiaCruzadaChart(data.demografiaCruzada || [], data.genero || []);

  // 5. Gráfico de Edad / N.N.A. (Donut flotante)
  renderEdadChart("chart-edad", data.edad || []);

  // 6. Gráfico de Dispositivos (Tablet vs PC)
  renderDispositivosChart(data.dispositivos || []);

  // 7. Gráfico de Regiones Policiales (Despliegue Macro-Zonal)
  renderRegionesChart(data.regiones || []);

  // 8. Gráfico de Tramos Etarios & Protección NNA
  renderTramosEtariosChart(data.tramosEtarios || []);
}

function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    delete state.charts[name];
  }
}

// Gráfico 1: Rendimiento por Cuartel (Con números directos sobre barras)
function renderCuartelesRendimientoChart(data) {
  destroyChart("chart-cuarteles");
  const ctx = document.getElementById("chart-cuarteles")?.getContext("2d");
  if (!ctx) return;

  const items = (data.rendimientoCuarteles || []).slice(0, 8);
  const labels = items.map((i) => i.cuartel);
  const sincronizados = items.map((i) => i.sincronizados);
  const conError = items.map((i) => i.conError);

  state.charts["chart-cuarteles"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Sincronizados PDI",
          data: sincronizados,
          backgroundColor: CHART_PALETTE.emerald,
          hoverBackgroundColor: "#059669",
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 30,
        },
        {
          label: "Con Error",
          data: conError,
          backgroundColor: CHART_PALETTE.crimson,
          hoverBackgroundColor: "#e11d48",
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 30,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      barPercentage: 0.7,
      categoryPercentage: 0.75,
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 7,
            boxHeight: 7,
            padding: 16,
            color: "#334155",
            font: { weight: "600", size: 12 },
          },
        },
        tooltip: {
          ...BKLIT_TOOLTIP,
          callbacks: {
            footer: (tooltipItems) => {
              const idx = tooltipItems[0].dataIndex;
              const totalCuartel = items[idx]?.total || 0;
              const tasa = items[idx]?.tasaExito || 100;
              return `Total: ${totalCuartel.toLocaleString()} (${tasa}% éxito)`;
            },
          },
        },
        bklitDataLabels: {
          display: true,
          hideZero: true,
          color: "#1e293b",
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#64748b", font: { weight: "500" }, maxRotation: 35, minRotation: 0 },
        },
        y: {
          grid: { color: "rgba(226, 232, 240, 0.75)", borderDash: [5, 5] },
          border: { display: false },
          ticks: { color: "#64748b" },
          beginAtZero: true,
          grace: "18%",
        },
      },
    },
  });
}

// Gráfico 2: Nacionalidades (Barra horizontal con números y porcentaje impresos)
function renderHorizontalBarChart(canvasId, items) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return;

  const topItems = items.slice(0, 8);
  const labels = topItems.map((i) => i.nacionalidad + (i.codigo_iso ? ` (${i.codigo_iso})` : ""));
  const values = topItems.map((i) => i.total);

  state.charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Enrolamientos",
        data: values,
        backgroundColor: CHART_PALETTE.nations.slice(0, topItems.length),
        borderRadius: 7,
        borderSkipped: false,
        maxBarThickness: 22,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      barPercentage: 0.68,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...BKLIT_TOOLTIP,
          callbacks: {
            label: (ctx) => ` Total: ${ctx.raw.toLocaleString()} (${topItems[ctx.dataIndex]?.porcentaje}%)`,
          },
        },
        bklitDataLabels: {
          display: true,
          percentages: topItems.map((i) => i.porcentaje),
          color: "#0f172a",
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(226, 232, 240, 0.75)", borderDash: [5, 5] },
          border: { display: false },
          ticks: { color: "#64748b" },
          grace: "25%",
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#1e293b", font: { weight: "600" } },
        },
      },
    },
  });
}

// Gráfico 3: Sincronización Donut Flotante (Con cifra central y conteo en leyendas)
function renderDoughnutChart(canvasId, items, colors) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return;

  const labels = items.map((i) => i.descripcion);
  const values = items.map((i) => i.total);

  const total = items.reduce((acc, i) => acc + (Number(i.total) || 0), 0);
  const sincOk = items.find((i) => String(i.descripcion).toUpperCase().includes("SINCRONIZADO"))?.total || 0;
  const pctSinc = total > 0 ? ((sincOk / total) * 100).toFixed(1) : "100";

  state.charts[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, items.length),
        borderWidth: 0,
        borderRadius: 8,
        spacing: 5,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "76%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 7,
            boxHeight: 7,
            padding: 14,
            color: "#334155",
            font: { weight: "600", size: 11.5 },
            generateLabels: (chart) => {
              const orig = Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart);
              orig.forEach((l, idx) => {
                const it = items[idx];
                if (it) {
                  l.text = `${it.descripcion}: ${Number(it.total).toLocaleString("es-CL")} (${it.porcentaje}%)`;
                }
              });
              return orig;
            },
          },
        },
        tooltip: {
          ...BKLIT_TOOLTIP,
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw.toLocaleString()} (${items[ctx.dataIndex]?.porcentaje}%)`,
          },
        },
        bklitDataLabels: {
          display: true,
          centerText: `${pctSinc}%`,
          centerSubtext: "Sincronizados",
          centerTextColor: "#059669",
        },
      },
    },
  });
}

// Gráfico 4: Demografía Cruzada (Números sobre cada barra)
function renderDemografiaCruzadaChart(demografia, generoFallback) {
  destroyChart("chart-demografia-cruzada");
  const ctx = document.getElementById("chart-demografia-cruzada")?.getContext("2d");
  if (!ctx) return;

  let mascAdultos = 0, mascMenores = 0;
  let femAdultos = 0, femMenores = 0;

  if (demografia.length > 0) {
    demografia.forEach(d => {
      if (d.genero === "M") {
        if (d.esMayorEdad) mascAdultos += d.total;
        else mascMenores += d.total;
      } else if (d.genero === "F") {
        if (d.esMayorEdad) femAdultos += d.total;
        else femMenores += d.total;
      }
    });
  }

  state.charts["chart-demografia-cruzada"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Hombres (M)", "Mujeres (F)"],
      datasets: [
        {
          label: "Adultos (≥ 18)",
          data: [mascAdultos, femAdultos],
          backgroundColor: CHART_PALETTE.blue,
          hoverBackgroundColor: "#1d4ed8",
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 34,
        },
        {
          label: "Menores N.N.A. (0-17)",
          data: [mascMenores, femMenores],
          backgroundColor: CHART_PALETTE.amber,
          hoverBackgroundColor: "#d97706",
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 34,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      barPercentage: 0.65,
      categoryPercentage: 0.7,
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 7,
            boxHeight: 7,
            padding: 16,
            color: "#334155",
            font: { weight: "600", size: 12 },
          },
        },
        tooltip: BKLIT_TOOLTIP,
        bklitDataLabels: {
          display: true,
          hideZero: true,
          color: "#1e293b",
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#1e293b", font: { weight: "600" } },
        },
        y: {
          grid: { color: "rgba(226, 232, 240, 0.75)", borderDash: [5, 5] },
          border: { display: false },
          ticks: { color: "#64748b" },
          beginAtZero: true,
          grace: "18%",
        },
      },
    },
  });
}

// Gráfico 5: Grupo Etario Donut Flotante (Con cifras en leyendas y centro)
function renderEdadChart(canvasId, items) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return;

  const labels = items.map((i) => i.categoria);
  const values = items.map((i) => i.total);

  const total = items.reduce((acc, i) => acc + (Number(i.total) || 0), 0);
  const menores = items.find(i => String(i.categoria).toUpperCase().includes("MENOR"))?.total || 0;
  const pctNna = total > 0 ? ((menores / total) * 100).toFixed(1) : "0";

  state.charts[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [CHART_PALETTE.navyLight, CHART_PALETTE.amber],
        borderWidth: 0,
        borderRadius: 8,
        spacing: 5,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "74%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 7,
            boxHeight: 7,
            padding: 12,
            color: "#334155",
            font: { weight: "600", size: 11.5 },
            generateLabels: (chart) => {
              const orig = Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart);
              orig.forEach((l, idx) => {
                const it = items[idx];
                if (it) {
                  l.text = `${it.categoria}: ${Number(it.total).toLocaleString("es-CL")} (${it.porcentaje}%)`;
                }
              });
              return orig;
            },
          },
        },
        tooltip: BKLIT_TOOLTIP,
        bklitDataLabels: {
          display: true,
          centerText: `${total.toLocaleString("es-CL")}`,
          centerSubtext: "Total Enrolados",
          centerTextColor: "#0f172a",
        },
      },
    },
  });
}

// Gráfico 6: Dispositivos de Captura (Tablet vs PC)
function renderDispositivosChart(items) {
  destroyChart("chart-dispositivos");
  const ctx = document.getElementById("chart-dispositivos")?.getContext("2d");
  if (!ctx) return;

  const validItems = Array.isArray(items) && items.length > 0 ? items : [
    { dispositivo: "TABLET", total: 0, porcentaje: 0 },
    { dispositivo: "PC DE ESCRITORIO", total: 0, porcentaje: 0 }
  ];

  const labels = validItems.map((i) => i.dispositivo);
  const values = validItems.map((i) => i.total);
  const colors = [CHART_PALETTE.cyan, CHART_PALETTE.blue];

  const total = validItems.reduce((acc, i) => acc + (Number(i.total) || 0), 0);

  state.charts["chart-dispositivos"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, validItems.length),
        borderWidth: 0,
        borderRadius: 8,
        spacing: 5,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "76%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 7,
            boxHeight: 7,
            padding: 14,
            color: "#334155",
            font: { weight: "600", size: 11.5 },
            generateLabels: (chart) => {
              const orig = Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart);
              orig.forEach((l, idx) => {
                const it = validItems[idx];
                if (it) {
                  l.text = `${it.dispositivo}: ${Number(it.total).toLocaleString("es-CL")} (${it.porcentaje || 0}%)`;
                }
              });
              return orig;
            },
          },
        },
        tooltip: {
          ...BKLIT_TOOLTIP,
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw.toLocaleString()} (${validItems[ctx.dataIndex]?.porcentaje || 0}%)`,
          },
        },
        bklitDataLabels: {
          display: true,
          centerText: `${total.toLocaleString("es-CL")}`,
          centerSubtext: "Dispositivos",
          centerTextColor: "#0284c7",
        },
      },
    },
  });
}

// Gráfico 7: Despliegue Territorial por Región Policial (Con números en barras)
function renderRegionesChart(items) {
  destroyChart("chart-regiones");
  const ctx = document.getElementById("chart-regiones")?.getContext("2d");
  if (!ctx) return;

  const validItems = Array.isArray(items) && items.length > 0 ? items.slice(0, 6) : [
    { region: "Sin Registros", total: 0, porcentaje: 0 }
  ];

  const labels = validItems.map((i) => i.region);
  const values = validItems.map((i) => i.total);

  state.charts["chart-regiones"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Enrolamientos",
        data: values,
        backgroundColor: "#0ea5e9",
        hoverBackgroundColor: "#0284c7",
        borderRadius: 7,
        borderSkipped: false,
        maxBarThickness: 20,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      barPercentage: 0.65,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...BKLIT_TOOLTIP,
          callbacks: {
            label: (ctx) => ` Total: ${ctx.raw.toLocaleString()} (${validItems[ctx.dataIndex]?.porcentaje || 0}%)`,
          },
        },
        bklitDataLabels: {
          display: true,
          percentages: validItems.map((i) => i.porcentaje),
          color: "#0284c7",
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(226, 232, 240, 0.75)", borderDash: [5, 5] },
          border: { display: false },
          ticks: { color: "#64748b" },
          grace: "25%",
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#1e293b", font: { weight: "600" } },
        },
      },
    },
  });
}

// Gráfico 8: Histograma de Tramos Etarios & Protección NNA (Con números sobre barras)
function renderTramosEtariosChart(items) {
  destroyChart("chart-tramos-etarios");
  const ctx = document.getElementById("chart-tramos-etarios")?.getContext("2d");
  if (!ctx) return;

  const validItems = Array.isArray(items) && items.length > 0 ? items : [
    { tramo: "Sin Registros", total: 0, porcentaje: 0 }
  ];

  const labels = validItems.map((i) => i.tramo);
  const values = validItems.map((i) => i.total);

  // Colores diferenciados: Ámbar cálido para menores NNA (vulnerabilidad), Azul real para adultos
  const backgroundColors = validItems.map((i) => {
    const t = String(i.tramo || "").toUpperCase();
    if (t.includes("INFANCIA") || t.includes("NIÑEZ") || t.includes("NNA") || t.includes("ADOLESCENTES")) {
      return CHART_PALETTE.amber;
    }
    return CHART_PALETTE.blue;
  });

  const hoverColors = validItems.map((i) => {
    const t = String(i.tramo || "").toUpperCase();
    if (t.includes("INFANCIA") || t.includes("NIÑEZ") || t.includes("NNA") || t.includes("ADOLESCENTES")) {
      return "#d97706";
    }
    return "#1d4ed8";
  });

  state.charts["chart-tramos-etarios"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Personas",
        data: values,
        backgroundColor: backgroundColors,
        hoverBackgroundColor: hoverColors,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 28,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      barPercentage: 0.65,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...BKLIT_TOOLTIP,
          callbacks: {
            label: (ctx) => ` Cantidad: ${ctx.raw.toLocaleString()} (${validItems[ctx.dataIndex]?.porcentaje || 0}%)`,
            afterLabel: (ctx) => {
              const t = String(validItems[ctx.dataIndex]?.tramo || "").toUpperCase();
              if (t.includes("INFANCIA") || t.includes("NIÑEZ") || t.includes("NNA")) {
                return "[!] Atención prioritaria: Menor de edad (NNA)";
              }
              return "";
            },
          },
        },
        bklitDataLabels: {
          display: true,
          hideZero: true,
          color: "#0f172a",
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: "#64748b",
            font: { weight: "600", size: 10 },
            maxRotation: 35,
            minRotation: 15,
          },
        },
        y: {
          grid: { color: "rgba(226, 232, 240, 0.75)", borderDash: [5, 5] },
          border: { display: false },
          ticks: { color: "#64748b" },
          beginAtZero: true,
          grace: "18%",
        },
      },
    },
  });
}

// ==========================================================================
// MÓDULO AVANZADO: EVOLUCIÓN TEMPORAL Y TENDENCIAS HISTÓRICAS (TAB 3)
// ==========================================================================

// Carga de la serie histórica de tendencias desde la API
async function loadTrendData() {
  try {
    const res = await fetch("/api/metricas/tendencia");
    const data = await res.json();
    state.trendData = Array.isArray(data) ? data : [];
    updateTrendView();
  } catch (err) {
    console.error("Error al cargar tendencia:", err);
  }
}

// Actualiza vista de tendencias: KPIs, filtros, gráfico y matriz detallada
function updateTrendView() {
  const rawItems = state.trendData || [];
  if (rawItems.length === 0) return;

  // 1. Calcular KPIs globales de la serie histórica completa
  const totalHistorico = rawItems.reduce((acc, i) => acc + (Number(i.total) || 0), 0);
  const totalSincronizados = rawItems.reduce((acc, i) => acc + (Number(i.sincronizados) || 0), 0);
  const totalDias = rawItems.length;
  const promedioDiario = totalDias > 0 ? Math.round(totalHistorico / totalDias) : 0;
  
  let recordDia = { fecha: "N/D", total: 0 };
  rawItems.forEach(i => {
    if (Number(i.total) > recordDia.total) {
      recordDia = { fecha: i.fecha, total: Number(i.total) };
    }
  });

  const slaGlobal = totalHistorico > 0 ? ((totalSincronizados / totalHistorico) * 100).toFixed(1) : "100";

  // Actualizar tarjetas de KPI
  const elTotal = document.getElementById("trend-kpi-total");
  const elDays = document.getElementById("trend-kpi-days");
  const elAvg = document.getElementById("trend-kpi-avg");
  const elPeak = document.getElementById("trend-kpi-peak");
  const elPeakDate = document.getElementById("trend-kpi-peak-date");
  const elSla = document.getElementById("trend-kpi-sla");

  if (elTotal) elTotal.textContent = totalHistorico.toLocaleString("es-CL");
  if (elDays) elDays.textContent = `${totalDias.toLocaleString("es-CL")} jornadas`;
  if (elAvg) elAvg.textContent = `${promedioDiario.toLocaleString("es-CL")} / día`;
  if (elPeak) elPeak.textContent = `${recordDia.total.toLocaleString("es-CL")}`;
  if (elPeakDate) elPeakDate.textContent = `Pico el ${recordDia.fecha}`;
  if (elSla) elSla.textContent = `${slaGlobal}%`;

  // 2. Filtrar items según el rango temporal seleccionado
  let filteredItems = [...rawItems];
  if (state.trendRange === "15") {
    filteredItems = rawItems.slice(-15);
  } else if (state.trendRange === "30") {
    filteredItems = rawItems.slice(-30);
  } else if (state.trendRange === "90") {
    filteredItems = rawItems.slice(-90);
  } else if (state.trendRange === "365") {
    filteredItems = rawItems.slice(-365);
  }

  // 3. Aplicar agrupación si es mensual
  let displayItems = filteredItems;
  if (state.trendGranularity === "month") {
    const monthsMap = new Map();
    filteredItems.forEach(item => {
      const mesKey = item.fecha.slice(0, 7); // YYYY-MM
      if (!monthsMap.has(mesKey)) {
        monthsMap.set(mesKey, { fecha: mesKey, total: 0, sincronizados: 0, con_error: 0, pendientes: 0 });
      }
      const m = monthsMap.get(mesKey);
      m.total += Number(item.total) || 0;
      m.sincronizados += Number(item.sincronizados) || 0;
      m.con_error += Number(item.con_error) || 0;
      m.pendientes += Number(item.pendientes) || 0;
    });
    displayItems = Array.from(monthsMap.values());
  }

  // Actualizar badge del gráfico de tendencia
  const badgeTrend = document.getElementById("badge-chart-tendencia");
  if (badgeTrend) {
    const sumTotal = displayItems.reduce((acc, i) => acc + i.total, 0);
    const sumSinc = displayItems.reduce((acc, i) => acc + i.sincronizados, 0);
    const pct = sumTotal > 0 ? ((sumSinc / sumTotal) * 100).toFixed(1) : "100";
    badgeTrend.textContent = `${displayItems.length} ${state.trendGranularity === 'month' ? 'Meses' : 'Días'} · ${sumTotal.toLocaleString("es-CL")} Enrolamientos (${pct}% SLA)`;
  }

  // Renderizar gráfico de tendencia principal
  renderTrendChart(displayItems, "chart-tendencia-historica");

  // Renderizar tabla detallada día a día
  renderTrendTable(filteredItems);

  // Si el modal está abierto, renderizar gráfico en modal
  const modal = document.getElementById("modal-trend-fullscreen");
  if (modal && modal.style.display !== "none") {
    renderTrendChart(displayItems, "chart-tendencia-modal");
  }
}

// Gráfico de Tendencia Histórica Profesional (Gradiente Canvas Área estilo bklit-ui)
function renderTrendChart(items, canvasId = "chart-tendencia-historica") {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  const ctx = canvas?.getContext("2d");
  if (!ctx || !items || items.length === 0) return;

  const labels = items.map((i) => i.fecha);
  const totalData = items.map((i) => i.total);
  const sincData = items.map((i) => i.sincronizados);
  const errData = items.map((i) => i.con_error);

  // Gradiente suave de área estilo bklit-ui
  const gradientArea = ctx.createLinearGradient(0, 0, 0, 360);
  gradientArea.addColorStop(0, "rgba(37, 99, 235, 0.22)");
  gradientArea.addColorStop(1, "rgba(37, 99, 235, 0.00)");

  const showPointLabels = items.length <= 25;

  state.charts[canvasId] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Total Enrolamientos",
          data: totalData,
          borderColor: "#2563eb",
          backgroundColor: gradientArea,
          fill: true,
          tension: 0.32,
          borderWidth: 2.5,
          pointRadius: items.length > 60 ? 1 : 3,
          pointHoverRadius: 6,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "#2563eb",
          pointBorderWidth: 2,
        },
        {
          label: "Sincronizados PDI",
          data: sincData,
          borderColor: CHART_PALETTE.emerald,
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: items.length > 60 ? 0 : 2,
          tension: 0.3,
        },
        {
          label: "Con Error",
          data: errData,
          borderColor: CHART_PALETTE.crimson,
          borderWidth: 2,
          pointRadius: items.length > 60 ? 0 : 2.5,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 7,
            boxHeight: 7,
            padding: 16,
            color: "#334155",
            font: { weight: "600", size: 12 },
          },
        },
        tooltip: {
          ...BKLIT_TOOLTIP,
          callbacks: {
            afterBody: (tooltipItems) => {
              const idx = tooltipItems[0].dataIndex;
              const it = items[idx];
              if (!it) return "";
              const tasa = it.total > 0 ? ((it.sincronizados / it.total) * 100).toFixed(1) : "100";
              return `Cumplimiento SLA PDI: ${tasa}%`;
            }
          }
        },
        bklitDataLabels: {
          display: showPointLabels,
          hideZero: true,
          color: "#1e40af",
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(226, 232, 240, 0.6)", borderDash: [4, 4] },
          border: { display: false },
          ticks: {
            color: "#64748b",
            maxRotation: 45,
            minRotation: items.length > 30 ? 25 : 0,
            autoSkip: true,
            maxTicksLimit: items.length > 60 ? 24 : items.length,
          },
        },
        y: {
          grid: { color: "rgba(226, 232, 240, 0.75)", borderDash: [5, 5] },
          border: { display: false },
          ticks: { color: "#64748b" },
          beginAtZero: true,
          grace: "12%",
        },
      },
    },
  });
}

// Renderizado de tabla de desglose histórico día por día
function renderTrendTable(items) {
  const tbody = document.getElementById("trend-table-body");
  const countEl = document.getElementById("trend-matrix-count");
  if (!tbody) return;

  if (countEl) {
    countEl.textContent = `${items.length} jornadas operativas`;
  }

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:24px;">No hay jornadas para mostrar en el rango seleccionado</td></tr>`;
    return;
  }

  const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  // Ordenar descendente (los días más recientes primero)
  const sorted = [...items].reverse();

  tbody.innerHTML = sorted.map((row) => {
    let diaNombre = "Día";
    if (row.fecha && row.fecha.includes("-") && row.fecha.length === 10) {
      const [y, m, d] = row.fecha.split("-");
      const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      diaNombre = diasSemana[dt.getDay()] || "Día";
    }

    const total = Number(row.total) || 0;
    const sinc = Number(row.sincronizados) || 0;
    const err = Number(row.con_error) || 0;
    const pend = Number(row.pendientes) || 0;
    const tasa = total > 0 ? Math.round((sinc / total) * 1000) / 10 : 100;

    let slaBadge = `<span class="badge badge-success" style="font-weight:700;">${tasa}% Óptimo</span>`;
    if (tasa < 90) {
      slaBadge = `<span class="badge badge-danger" style="font-weight:700;">${tasa}% Crítico</span>`;
    } else if (tasa < 95) {
      slaBadge = `<span class="badge badge-warning" style="font-weight:700;">${tasa}% Aceptable</span>`;
    }

    const errorHtml = err > 0
      ? `<span class="badge badge-danger" style="font-weight:700;">${err.toLocaleString("es-CL")}</span>`
      : `<span style="color:#94a3b8;">0</span>`;

    return `
      <tr>
        <td style="font-weight: 700; color: var(--pdi-navy);">
          <code>${row.fecha}</code>
        </td>
        <td>
          <span class="badge badge-info">${diaNombre}</span>
        </td>
        <td style="text-align: right; font-weight: 700; color: #0f172a;">
          ${total.toLocaleString("es-CL")}
        </td>
        <td style="text-align: right; font-weight: 600; color: #059669;">
          ${sinc.toLocaleString("es-CL")}
        </td>
        <td style="text-align: right;">
          ${errorHtml}
        </td>
        <td style="text-align: right; color: var(--text-muted);">
          ${pend.toLocaleString("es-CL")}
        </td>
        <td>
          ${slaBadge}
        </td>
        <td style="text-align: center;">
          <button class="btn btn-primary btn-sm" style="padding: 4px 10px; font-size: 0.74rem;" onclick="examinarFecha('${row.fecha}')" title="Cargar este día en el Panel Analítico">
            <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#ffffff;"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>
            <span>Examinar</span>
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

// Configuración de eventos de la pestaña de Evolución y Tendencias
function setupTrendControls() {
  // Presets de rango temporal de tendencia
  document.querySelectorAll("#trend-period-presets .preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#trend-period-presets .preset-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.trendRange = btn.getAttribute("data-trend-range");
      updateTrendView();
    });
  });

  // Selector de granularidad (Diario vs Mensual)
  document.querySelectorAll(".granularity-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".granularity-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.trendGranularity = btn.getAttribute("data-granularity");
      updateTrendView();
    });
  });

  // Botón Expandir / Contraer Gráfico y Detalle
  const btnExpandTrend = document.getElementById("btn-toggle-expand-trend");
  if (btnExpandTrend) {
    btnExpandTrend.addEventListener("click", () => {
      state.trendExpanded = !state.trendExpanded;
      const chartBody = document.getElementById("trend-chart-body");
      const matrixCard = document.getElementById("trend-detail-matrix");
      const expandText = document.getElementById("trend-expand-text");

      if (chartBody) {
        chartBody.classList.toggle("is-expanded", state.trendExpanded);
      }
      if (matrixCard) {
        matrixCard.style.display = state.trendExpanded ? "block" : "none";
        if (state.trendExpanded) {
          matrixCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
      if (expandText) {
        expandText.textContent = state.trendExpanded ? "Contraer Vista" : "Expandir Vista Detallada";
      }

      // Redibujar gráfico para ajustarse a nueva altura
      setTimeout(() => {
        state.charts["chart-tendencia-historica"]?.resize();
      }, 150);
    });
  }

  // Botón contraer dentro de la tabla
  const btnCollapseTrend = document.getElementById("btn-collapse-trend");
  if (btnCollapseTrend) {
    btnCollapseTrend.addEventListener("click", () => {
      btnExpandTrend?.click();
    });
  }

  // Botón Pantalla Completa Modal
  const btnFullscreen = document.getElementById("btn-fullscreen-trend");
  const modalFullscreen = document.getElementById("modal-trend-fullscreen");
  const btnCloseFullscreen = document.getElementById("btn-close-trend-fullscreen");

  if (btnFullscreen && modalFullscreen) {
    btnFullscreen.addEventListener("click", () => {
      modalFullscreen.style.display = "flex";
      setTimeout(() => {
        updateTrendView();
      }, 100);
    });
  }

  if (btnCloseFullscreen && modalFullscreen) {
    btnCloseFullscreen.addEventListener("click", () => {
      modalFullscreen.style.display = "none";
      destroyChart("chart-tendencia-modal");
    });
  }

  // Cerrar modal con Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalFullscreen && modalFullscreen.style.display !== "none") {
      modalFullscreen.style.display = "none";
      destroyChart("chart-tendencia-modal");
    }
  });

  // Búsqueda en la matriz detallada de tendencias
  const searchInput = document.getElementById("trend-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll("#trend-table-body tr");
      rows.forEach((tr) => {
        const text = tr.textContent.toLowerCase();
        tr.style.display = text.includes(term) ? "" : "none";
      });
    });
  }

  // Botón Exportar Serie CSV
  const btnExportCsv = document.getElementById("btn-export-trend-csv");
  if (btnExportCsv) {
    btnExportCsv.addEventListener("click", exportTrendCsv);
  }
}

// Exporta la serie temporal histórica a formato CSV institucional
function exportTrendCsv() {
  const items = state.trendData || [];
  if (items.length === 0) {
    alert("No hay registros disponibles para exportar.");
    return;
  }

  const lines = [];
  lines.push('"POLICÍA DE INVESTIGACIONES DE CHILE"');
  lines.push('"JEFATURA NACIONAL DE MIGRACIONES Y POLICÍA INTERNACIONAL"');
  lines.push('"SISTEMA ABIS - SERIE TEMPORAL HISTÓRICA DE ENROLAMIENTOS"');
  lines.push(`"Fecha de Emisión","${new Date().toLocaleString('es-CL')}"`);
  lines.push(`"Total Registros","${items.reduce((a, i) => a + i.total, 0)}"`);
  lines.push('""');
  lines.push('"Fecha","Total Enrolamientos","Sincronizados PDI","Con Error","Pendientes","Cumplimiento SLA (%)"');

  items.forEach((item) => {
    const total = item.total || 0;
    const sinc = item.sincronizados || 0;
    const err = item.con_error || 0;
    const pend = item.pendientes || 0;
    const sla = total > 0 ? ((sinc / total) * 100).toFixed(1) : "100.0";
    lines.push(`"${item.fecha}",${total},${sinc},${err},${pend},"${sla}%"`);
  });

  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Serie_Temporal_Historica_ABIS_PDI_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
function renderDataTable(data) {
  const tbody = document.getElementById("data-table-body");
  if (!tbody) return;

  const rows = data.rendimientoCuarteles || [];

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No hay datos para mostrar en este período</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((r) => {
      const tasaExito = r.tasaExito !== undefined ? r.tasaExito : 100;
      let badgeClass = "badge-success";
      if (tasaExito < 85) badgeClass = "badge-danger";
      else if (tasaExito < 95) badgeClass = "badge-warning";

      return `
        <tr class="table-row-item">
          <td><strong>${r.cuartel}</strong></td>
          <td><span class="badge badge-info">${r.unidad}</span></td>
          <td style="text-align:right; font-weight:700;">${r.total.toLocaleString()}</td>
          <td style="text-align:right; color:var(--status-success); font-weight:600;">${r.sincronizados.toLocaleString()}</td>
          <td style="text-align:right; color:${r.conError > 0 ? 'var(--status-danger)' : 'var(--text-muted)'}; font-weight:600;">${r.conError.toLocaleString()}</td>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="badge ${badgeClass}">${tasaExito}%</span>
              <div style="flex:1; height:6px; background:#e2e8f0; border-radius:3px; max-width:90px; overflow:hidden;">
                <div style="height:100%; width:${Math.min(tasaExito, 100)}%; background:${tasaExito < 85 ? 'var(--status-danger)' : (tasaExito < 95 ? 'var(--status-warning)' : 'var(--status-success)')};"></div>
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function filterTableRows(query) {
  document.querySelectorAll(".table-row-item").forEach((row) => {
    const text = row.innerText.toLowerCase();
    row.style.display = text.includes(query) ? "" : "none";
  });
}

// Configuración de Drag & Drop para Ingesta Web
function setupDragAndDrop() {
  const dropzone = document.getElementById("upload-dropzone");
  const fileInput = document.getElementById("file-input");
  const btnSelect = document.getElementById("btn-select-file");

  if (!dropzone || !fileInput) return;

  if (btnSelect) {
    btnSelect.addEventListener("click", () => fileInput.click());
  }
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      promptAuthModal(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      promptAuthModal(e.target.files[0]);
    }
  });

  // Eventos del Modal de Autorización Policial
  setupAuthModalEvents();
}

// Variable para retener el archivo y tipo de acción en espera de autorización
let pendingAuthFile = null;
let pendingAuthAction = "ingesta"; // "ingesta", "cifrar", "descifrar"

// Abre el modal de seguridad solicitando clave institucional
function promptAuthModal(file, actionType = "ingesta") {
  pendingAuthFile = file;
  pendingAuthAction = actionType;

  const modal = document.getElementById("modal-auth-ingesta");
  const titleEl = document.getElementById("modal-title-text");
  const subtitleEl = document.getElementById("modal-subtitle-text");
  const warningEl = document.getElementById("modal-warning-text");
  const fileNameEl = document.getElementById("modal-file-name");
  const fileDetailsEl = document.getElementById("modal-file-details");
  const summaryIconEl = document.getElementById("modal-summary-icon");
  const claveInput = document.getElementById("input-auth-clave");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");

  if (!modal) return;

  if (actionType === "cifrar") {
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: var(--pdi-navy);">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = "Autorización de Cifrado Institucional";
    if (subtitleEl) subtitleEl.textContent = "Blindaje Criptográfico de Archivo (AES-256-GCM)";
    if (warningEl) warningEl.textContent = "Para blindar y generar el archivo protegido .enc se requiere verificar su credencial policial autorizada.";
    if (confirmBtn) {
      confirmBtn.innerHTML = `
        <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span>Autorizar y Cifrar Archivo</span>
      `;
    }
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileDetailsEl) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(2);
      const tipoDesc = file.name.toLowerCase().endsWith(".enc")
        ? "Archivo Cifrado AES-256-GCM"
        : "Planilla Excel (Oracle ABIS)";
      fileDetailsEl.textContent = `${sizeMb} MB • ${tipoDesc}`;
    }
  } else if (actionType === "descifrar") {
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: var(--pdi-navy);">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = "Autorización de Descifrado y Auditoría";
    if (subtitleEl) subtitleEl.textContent = "Apertura y Verificación de Archivo Protegido";
    if (warningEl) warningEl.textContent = "Para descifrar y recuperar la planilla original se requiere verificar su credencial policial autorizada.";
    if (confirmBtn) {
      confirmBtn.innerHTML = `
        <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
        <span>Autorizar y Descifrar Archivo</span>
      `;
    }
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileDetailsEl) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(2);
      const tipoDesc = file.name.toLowerCase().endsWith(".enc")
        ? "Archivo Cifrado AES-256-GCM"
        : "Planilla Excel (Oracle ABIS)";
      fileDetailsEl.textContent = `${sizeMb} MB • ${tipoDesc}`;
    }
  } else if (actionType === "programacion") {
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: var(--pdi-navy);">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = "Autorización de Seguridad Policial";
    if (subtitleEl) subtitleEl.textContent = "Control de Acceso para Guardar Programación de Reportes";
    if (warningEl) warningEl.textContent = "Para modificar y guardar los horarios de despacho automático a Telegram se requiere verificar su credencial policial autorizada.";
    if (confirmBtn) {
      confirmBtn.innerHTML = `
        <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        <span>Autorizar y Guardar Ajustes</span>
      `;
    }
    if (fileNameEl) {
      fileNameEl.textContent = `Horarios: ${file.times.join(", ")} hrs (${file.times.length} ${file.times.length === 1 ? 'despacho' : 'despachos'} al día)`;
    }
    if (fileDetailsEl) {
      const tipo = file.reportType === "extenso" ? "Reporte Extenso Oficial PDI" : "Resumen Ejecutivo";
      fileDetailsEl.textContent = `${file.days.length} días activos por semana • ${tipo}`;
    }
  } else {
    // Ingesta por defecto
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: var(--pdi-navy);">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = "Autorización de Seguridad";
    if (subtitleEl) subtitleEl.textContent = "Control de Acceso para Ingesta y Poblado de Base de Datos";
    if (warningEl) warningEl.textContent = "Para poblar la base de datos se requiere verificar su credencial policial de operador autorizado.";
    if (confirmBtn) {
      confirmBtn.innerHTML = `
        <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        <span>Autorizar y Poblar BD</span>
      `;
    }
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileDetailsEl) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(2);
      const tipoDesc = file.name.toLowerCase().endsWith(".enc")
        ? "Archivo Cifrado AES-256-GCM"
        : "Planilla Excel (Oracle ABIS)";
      fileDetailsEl.textContent = `${sizeMb} MB • ${tipoDesc}`;
    }
  }

  if (claveInput) {
    claveInput.value = "";
    claveInput.type = "password";
  }
  if (errorMsg) errorMsg.style.display = "none";
  if (confirmBtn) confirmBtn.disabled = false;

  modal.style.display = "flex";
  setTimeout(() => {
    if (claveInput) claveInput.focus();
  }, 100);
}

// Cierra el modal de autorización
function closeAuthModal() {
  const modal = document.getElementById("modal-auth-ingesta");
  if (modal) modal.style.display = "none";
  pendingAuthFile = null;
  const fileInput = document.getElementById("file-input");
  if (fileInput) fileInput.value = "";
}

// Configuración de listeners del modal
function setupAuthModalEvents() {
  const modal = document.getElementById("modal-auth-ingesta");
  const btnClose = document.getElementById("btn-modal-auth-close");
  const btnCancel = document.getElementById("btn-modal-auth-cancel");
  const btnConfirm = document.getElementById("btn-modal-auth-confirm");
  const btnEye = document.getElementById("btn-toggle-password");
  const claveInput = document.getElementById("input-auth-clave");

  if (btnClose) btnClose.addEventListener("click", closeAuthModal);
  if (btnCancel) btnCancel.addEventListener("click", closeAuthModal);

  // Cerrar al hacer clic fuera del diálogo
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAuthModal();
    });
  }

  // Ver / Ocultar clave
  if (btnEye && claveInput) {
    btnEye.addEventListener("click", () => {
      const isPassword = claveInput.type === "password";
      claveInput.type = isPassword ? "text" : "password";
      const eyeIcon = document.getElementById("eye-icon");
      if (eyeIcon) {
        eyeIcon.innerHTML = isPassword
          ? `<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>`
          : `<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>`;
      }
    });
  }

  // Confirmar con Enter
  if (claveInput) {
    claveInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmAuthorizedUpload();
      }
    });
  }

  // Botón confirmar
  if (btnConfirm) {
    btnConfirm.addEventListener("click", confirmAuthorizedUpload);
  }
}

// Procesa la confirmación de autorización según la acción solicitada
async function confirmAuthorizedUpload() {
  if (!pendingAuthFile) {
    closeAuthModal();
    return;
  }

  const claveInput = document.getElementById("input-auth-clave");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");

  const clave = claveInput?.value?.trim();

  if (!clave) {
    if (errorMsg) {
      errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Ingrese la clave de autorización policial`;
      errorMsg.style.display = "flex";
    }
    if (claveInput) claveInput.focus();
    return;
  }

  // Bloquear botón con spinner
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-width:2px;vertical-align:middle;"></span> Verificando credencial...`;
  }
  if (errorMsg) errorMsg.style.display = "none";

  if (pendingAuthAction === "cifrar") {
    await executeWebEncrypt(pendingAuthFile, clave);
  } else if (pendingAuthAction === "descifrar") {
    await executeWebDecrypt(pendingAuthFile, clave);
  } else if (pendingAuthAction === "programacion") {
    await executeSaveScheduleAuthorized(pendingAuthFile, clave);
  } else {
    await handleFileUpload(pendingAuthFile, clave);
  }
}

// Ejecuta el guardado de configuración de programación tras verificar la clave de autorización
async function executeSaveScheduleAuthorized(scheduleData, clave) {
  const modal = document.getElementById("modal-auth-ingesta");
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");
  const saveFeedback = document.getElementById("schedule-save-feedback");

  try {
    const res = await fetch("/api/settings/schedule", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ingesta-Auth": clave,
      },
      body: JSON.stringify({
        ...scheduleData,
        clave,
      }),
    });

    const data = await res.json();

    if (res.status === 401 || data.codigo === "AUTH_REQUIRED") {
      if (modalDialog) {
        modalDialog.classList.remove("modal-shake");
        void modalDialog.offsetWidth;
        modalDialog.classList.add("modal-shake");
      }
      if (errorMsg) {
        errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Clave de autorización no válida. Verifique su credencial policial.`;
        errorMsg.style.display = "flex";
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `
          <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          <span>Autorizar y Guardar Ajustes</span>
        `;
      }
      if (claveInput) {
        claveInput.select();
        claveInput.focus();
      }
      return;
    }

    if (!data.ok) throw new Error(data.error || "Fallo al guardar.");

    // Autorización exitosa: cerrar modal
    closeAuthModal();

    if (saveFeedback) {
      saveFeedback.className = "crypto-feedback-box success";
      saveFeedback.style.display = "block";
      saveFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Ajustes Guardados y Autorizados Exitosamente</span>
        </div>
        • Horarios activos: <strong>${data.config.times.join(", ")} hrs</strong><br>
        • Próxima ejecución: <strong>${data.next?.text || 'Calculando...'}</strong><br>
        • Frecuencia: <strong>${data.config.times.length} despachos diarios programados</strong>
      `;
      setTimeout(() => {
        saveFeedback.style.display = "none";
      }, 6000);
    }

    // Actualizar badge de próximo envío
    const nextBadge = document.getElementById("schedule-next-text");
    if (nextBadge && data.next) {
      nextBadge.textContent = `Próximo Envío: ${data.next.text}`;
    }

    // Actualizar frecuencia en el cuadro lateral
    const freqSummary = document.getElementById("schedule-freq-summary");
    if (freqSummary && data.config?.times) {
      freqSummary.textContent = `${data.config.times.length} ${data.config.times.length === 1 ? 'envío' : 'envíos'} al día (${data.config.times.join(', ')} hrs)`;
    }

    // Actualizar historial de envíos si la función existe
    if (typeof cargarHistorialDespachos === "function") {
      cargarHistorialDespachos();
    }

  } catch (err) {
    closeAuthModal();
    if (saveFeedback) {
      saveFeedback.className = "crypto-feedback-box error";
      saveFeedback.style.display = "block";
      saveFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626; margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Error al Guardar Ajustes</span>
        </div>
        ${err.message}
      `;
    }
  }
}

// Envío y procesamiento seguro del archivo al backend con clave de autorización
async function handleFileUpload(file, clave) {
  const modal = document.getElementById("modal-auth-ingesta");
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");

  const resultsDiv = document.getElementById("upload-results");
  const statusDiv = document.getElementById("upload-status");

  const formData = new FormData();
  formData.append("archivo", file);
  formData.append("clave", clave);

  try {
    const res = await fetch("/api/ingest/upload", {
      method: "POST",
      headers: {
        "X-Ingesta-Auth": clave,
      },
      body: formData,
    });

    const data = await res.json();

    if (res.status === 401 || data.codigo === "AUTH_REQUIRED") {
      // Clave incorrecta: mostrar feedback en el modal
      if (modalDialog) {
        modalDialog.classList.remove("modal-shake");
        void modalDialog.offsetWidth; // reiniciar animación
        modalDialog.classList.add("modal-shake");
      }
      if (errorMsg) {
        errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Clave de autorización no válida. Verifique su credencial.`;
        errorMsg.style.display = "flex";
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `
          <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <span>Autorizar y Poblar BD</span>
        `;
      }
      if (claveInput) {
        claveInput.select();
        claveInput.focus();
      }
      return;
    }

    // Autorización exitosa: cerrar modal
    closeAuthModal();

    if (resultsDiv) resultsDiv.style.display = "block";

    if (res.ok && data.ok) {
      if (statusDiv) {
        statusDiv.innerHTML = `
          <div class="alert alert-success">
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" style="stroke:var(--status-success);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <strong style="font-size:1rem;">Ingesta Autorizada y Auditada Exitosamente</strong>
              </div>
              <div style="margin-top:8px; line-height:1.6;">
                &bull; <strong>Archivo:</strong> ${data.nombreOriginal}<br>
                &bull; <strong>Formato Criptográfico:</strong> ${data.estaCifrado ? '<span class="badge badge-success" style="display:inline-flex; align-items:center; gap:4px;"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> AES-256-GCM Descifrado en RAM</span>' : '<span class="badge badge-info" style="display:inline-flex; align-items:center; gap:4px;"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> Archivo Estándar .xlsx</span>'}<br>
                &bull; <strong>Registros Insertados en BD:</strong> <strong>${data.totalInsertadas.toLocaleString()}</strong> filas<br>
                &bull; <strong>Inconsistencias Registradas:</strong> ${data.erroresFilas}<br>
                &bull; <strong>Tiempo de Inserción:</strong> ${(data.duracionMs / 1000).toFixed(2)} segundos<br>
                &bull; <strong>Huella de Integridad SHA-256:</strong> <code>${data.hashSHA256}</code><br>
                &bull; <strong>Auditoría:</strong> Evento <code>INGESTA_EXCEL_AUTORIZADA</code> guardado en bitácora inmutable.
              </div>
            </div>
          </div>
        `;
      }

      await loadAvailableDates();
      await loadMetrics();
      await loadTrendData();
      await checkSystemHealth();
    } else {
      if (statusDiv) {
        statusDiv.innerHTML = `
          <div class="alert alert-error">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
              <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" style="stroke:#ef4444;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <strong>Error en la Ingesta:</strong>
            </div>
            ${data.error || "Ocurrió un error al procesar el archivo."}
          </div>
        `;
      }
    }
  } catch (err) {
    closeAuthModal();
    if (resultsDiv) resultsDiv.style.display = "block";
    if (statusDiv) {
      statusDiv.innerHTML = `
        <div class="alert alert-error">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" style="stroke:#ef4444;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <strong>Error de Conexión:</strong>
          </div>
          ${err.message}
        </div>
      `;
    }
  }
}

// Exportación del reporte a JSON
function exportCurrentReportJson() {
  if (!state.metricsData) return;
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.metricsData, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `informe_abis_${state.currentDate || "rango"}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// Descarga de Informe Oficial en Microsoft Word (.docx) formal
function exportCurrentReportWord() {
  let url = "/api/export/word";
  if (state.filterMode === "range" && state.dateFrom && state.dateTo) {
    url += `?desde=${state.dateFrom}&hasta=${state.dateTo}`;
  } else if (state.currentDate) {
    url += `?fecha=${state.currentDate}`;
  }
  window.location.href = url;
}

// Descarga de Informe Oficial en Microsoft Excel (.xlsx) formateado institucional
function exportCurrentReportExcel() {
  let url = "/api/export/excel";
  if (state.filterMode === "range" && state.dateFrom && state.dateTo) {
    url += `?desde=${state.dateFrom}&hasta=${state.dateTo}`;
  } else if (state.currentDate) {
    url += `?fecha=${state.currentDate}`;
  }
  window.location.href = url;
}

// Exportación del reporte institucional a CSV con formato oficial PDI y BOM UTF-8
function exportCurrentReportCsv() {
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

// Envío manual del reporte activo al bot de Telegram institucional
async function sendReportToTelegram() {
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

    alert(data.mensaje);
  } catch (err) {
    console.error("Error enviando reporte a Telegram:", err);
    alert(`No se pudo enviar el reporte a Telegram: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// Configuración de herramientas interactivas web de cifrado y descifrado (Sin Terminal)
function setupCryptoWebTools() {
  // 1. Cifrado Web (.xlsx -> .enc)
  const dropzoneEncrypt = document.getElementById("dropzone-encrypt");
  const fileInputEncrypt = document.getElementById("crypto-encrypt-file-input");
  const filenameEncrypt = document.getElementById("encrypt-selected-filename");
  const btnRunEncrypt = document.getElementById("btn-run-encrypt");
  const feedbackEncrypt = document.getElementById("encrypt-feedback");

  let selectedEncryptFile = null;

  if (dropzoneEncrypt && fileInputEncrypt) {
    dropzoneEncrypt.addEventListener("click", () => fileInputEncrypt.click());
    dropzoneEncrypt.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzoneEncrypt.classList.add("dragover");
    });
    dropzoneEncrypt.addEventListener("dragleave", () => dropzoneEncrypt.classList.remove("dragover"));
    dropzoneEncrypt.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzoneEncrypt.classList.remove("dragover");
      if (e.dataTransfer.files.length) {
        setEncryptFile(e.dataTransfer.files[0]);
      }
    });

    fileInputEncrypt.addEventListener("change", (e) => {
      if (e.target.files.length) {
        setEncryptFile(e.target.files[0]);
      }
    });
  }

  function setEncryptFile(file) {
    if (!file.name.endsWith(".xlsx")) {
      alert("Por favor selecciona un archivo de hoja de cálculo válido (.xlsx)");
      return;
    }
    selectedEncryptFile = file;
    filenameEncrypt.innerHTML = `<strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)`;
    btnRunEncrypt.disabled = false;
    feedbackEncrypt.style.display = "none";
    // Solicitar autorización policial inmediata
    promptAuthModal(file, "cifrar");
  }

  if (btnRunEncrypt) {
    btnRunEncrypt.addEventListener("click", () => {
      if (selectedEncryptFile) {
        promptAuthModal(selectedEncryptFile, "cifrar");
      }
    });
  }

  // 2. Descifrado Web (.enc -> .xlsx)
  const dropzoneDecrypt = document.getElementById("dropzone-decrypt");
  const fileInputDecrypt = document.getElementById("crypto-decrypt-file-input");
  const filenameDecrypt = document.getElementById("decrypt-selected-filename");
  const btnRunDecrypt = document.getElementById("btn-run-decrypt");
  const feedbackDecrypt = document.getElementById("decrypt-feedback");

  let selectedDecryptFile = null;

  if (dropzoneDecrypt && fileInputDecrypt) {
    dropzoneDecrypt.addEventListener("click", () => fileInputDecrypt.click());
    dropzoneDecrypt.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzoneDecrypt.classList.add("dragover");
    });
    dropzoneDecrypt.addEventListener("dragleave", () => dropzoneDecrypt.classList.remove("dragover"));
    dropzoneDecrypt.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzoneDecrypt.classList.remove("dragover");
      if (e.dataTransfer.files.length) {
        setDecryptFile(e.dataTransfer.files[0]);
      }
    });

    fileInputDecrypt.addEventListener("change", (e) => {
      if (e.target.files.length) {
        setDecryptFile(e.target.files[0]);
      }
    });
  }

  function setDecryptFile(file) {
    if (!file.name.endsWith(".enc")) {
      alert("Por favor selecciona un archivo protegido válido (.enc)");
      return;
    }
    selectedDecryptFile = file;
    filenameDecrypt.innerHTML = `<strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)`;
    btnRunDecrypt.disabled = false;
    feedbackDecrypt.style.display = "none";
    // Solicitar autorización policial inmediata
    promptAuthModal(file, "descifrar");
  }

  if (btnRunDecrypt) {
    btnRunDecrypt.addEventListener("click", () => {
      if (selectedDecryptFile) {
        promptAuthModal(selectedDecryptFile, "descifrar");
      }
    });
  }
}

// Ejecuta el cifrado web tras verificar la clave de autorización
async function executeWebEncrypt(file, clave) {
  const modal = document.getElementById("modal-auth-ingesta");
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");
  const feedbackEncrypt = document.getElementById("encrypt-feedback");

  const formData = new FormData();
  formData.append("archivo", file);

  try {
    const res = await fetch("/api/security/cifrar", {
      method: "POST",
      headers: { "X-Ingesta-Auth": clave },
      body: formData,
    });

    if (res.status === 401) {
      if (modalDialog) {
        modalDialog.classList.remove("modal-shake");
        void modalDialog.offsetWidth;
        modalDialog.classList.add("modal-shake");
      }
      if (errorMsg) {
        errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Clave de autorización incorrecta o no autorizada`;
        errorMsg.style.display = "flex";
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>Reintentar Autorización</span>`;
      }
      if (claveInput) {
        claveInput.value = "";
        claveInput.focus();
      }
      return;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Fallo en el cifrado del archivo.");
    }

    const hashOriginal = res.headers.get("X-Hash-Original") || "N/D";
    const hashCifrado = res.headers.get("X-Hash-Cifrado") || "N/D";

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file.name}.enc`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    closeAuthModal();

    if (feedbackEncrypt) {
      feedbackEncrypt.className = "crypto-feedback-box success";
      feedbackEncrypt.style.display = "block";
      feedbackEncrypt.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
          <span>Archivo Blindado con Éxito (Operación Autorizada)</span>
        </div>
        Se descargó <code>${file.name}.enc</code> tras validar la credencial de operador.<br>
        <small>• Huella SHA-256 Original: <code>${hashOriginal.substring(0, 16)}...</code><br>
        • Huella SHA-256 Cifrada: <code>${hashCifrado.substring(0, 16)}...</code><br>
        • Algoritmo: AES-256-GCM (Auth Tag 128-bit) &bull; Registrado en Bitácora de Auditoría</small>
      `;
    }
  } catch (err) {
    console.error("Error cifrando archivo web:", err);
    closeAuthModal();
    if (feedbackEncrypt) {
      feedbackEncrypt.className = "crypto-feedback-box error";
      feedbackEncrypt.style.display = "block";
      feedbackEncrypt.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Error al cifrar:</span>
        </div>
        ${err.message}
      `;
    }
  }
}

// Ejecuta el descifrado web tras verificar la clave de autorización
async function executeWebDecrypt(file, clave) {
  const modal = document.getElementById("modal-auth-ingesta");
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");
  const feedbackDecrypt = document.getElementById("decrypt-feedback");

  const formData = new FormData();
  formData.append("archivo", file);

  try {
    const res = await fetch("/api/security/descifrar", {
      method: "POST",
      headers: { "X-Ingesta-Auth": clave },
      body: formData,
    });

    if (res.status === 401) {
      if (modalDialog) {
        modalDialog.classList.remove("modal-shake");
        void modalDialog.offsetWidth;
        modalDialog.classList.add("modal-shake");
      }
      if (errorMsg) {
        errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Clave de autorización incorrecta o no autorizada`;
        errorMsg.style.display = "flex";
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>Reintentar Autorización</span>`;
      }
      if (claveInput) {
        claveInput.value = "";
        claveInput.focus();
      }
      return;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Fallo en el descifrado: integridad inválida.");
    }

    const hashDescifrado = res.headers.get("X-Hash-Descifrado") || "N/D";
    const downloadName = file.name.replace(/\.enc$/i, "") || "archivo_descifrado.xlsx";

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    closeAuthModal();

    if (feedbackDecrypt) {
      feedbackDecrypt.className = "crypto-feedback-box success";
      feedbackDecrypt.style.display = "block";
      feedbackDecrypt.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
          <span>Integridad Validada & Descifrado Correcto (Operación Autorizada)</span>
        </div>
        Se descargó el archivo original <code>${downloadName}</code> tras validar su credencial.<br>
        <small>• Verificación de Integridad: <strong>VÁLIDA (100% inalterado)</strong><br>
        • Huella SHA-256 Descifrada: <code>${hashDescifrado.substring(0, 16)}...</code><br>
        • Autenticación AEAD: Exitosa &bull; Registrado en Bitácora de Auditoría</small>
      `;
    }
  } catch (err) {
    console.error("Error descifrando archivo web:", err);
    closeAuthModal();
    if (feedbackDecrypt) {
      feedbackDecrypt.className = "crypto-feedback-box error";
      feedbackDecrypt.style.display = "block";
      feedbackDecrypt.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Error de Descifrado:</span>
        </div>
        ${err.message}
      `;
    }
  }
}

// ==========================================================================
// MÓDULO DE AJUSTES: GESTIÓN DE HORARIOS DE REPORTE Y AUTOMATIZACIÓN
// ==========================================================================

state.scheduleConfig = null;
state.currentScheduleTimes = ["08:30", "19:00"];
state.serverTimeOffset = 0;

// Actualiza el reloj institucional en pantalla segundo a segundo ("hora corriendo")
function updateLiveClockDisplay() {
  const clockDisplay = document.getElementById("schedule-clock-display");
  if (!clockDisplay) return;

  const now = new Date(Date.now() + (state.serverTimeOffset || 0));
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(now);
  const map = {};
  parts.forEach((p) => (map[p.type] = p.value));

  const hh = map.hour === "24" ? "00" : map.hour.padStart(2, "0");
  const mm = map.minute.padStart(2, "0");
  const ss = (map.second || "00").padStart(2, "0");
  const dateStr = `${map.year}-${map.month}-${map.day}`;

  clockDisplay.innerHTML = `Zona Horaria Oficial: <strong>America/Santiago (Chile)</strong> &bull; Hora Servidor: <strong class="live-clock-digits">${hh}:${mm}:${ss} hrs</strong> (${dateStr})`;
}

function startLiveClock() {
  if (liveClockInterval) {
    clearInterval(liveClockInterval);
  }
  updateLiveClockDisplay();
  liveClockInterval = setInterval(updateLiveClockDisplay, 1000);
}

// Carga la configuración actual de horarios desde la API
async function loadScheduleSettings() {
  try {
    const res = await fetch("/api/settings/schedule");
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "No se pudo cargar la configuración.");

    state.scheduleConfig = data.config;
    state.currentScheduleTimes = Array.isArray(data.config.times) ? [...data.config.times] : ["08:30", "19:00"];

    // 1. Sincronizar Reloj del Servidor & Próximo Envío
    if (data.serverTimestamp) {
      state.serverTimeOffset = data.serverTimestamp - Date.now();
    }
    startLiveClock();

    const nextBadge = document.getElementById("schedule-next-text");
    if (nextBadge && data.next) {
      nextBadge.textContent = `Próximo Envío: ${data.next.text}`;
    }

    // 2. Switch Habilitado / Deshabilitado
    const toggle = document.getElementById("schedule-enabled-toggle");
    if (toggle) {
      toggle.checked = Boolean(data.config.enabled);
      updateScheduleToggleAlert(toggle.checked);
    }

    // 3. Renderizar Chips de Horarios
    renderTimeChips(state.currentScheduleTimes);

    // 4. Marcar Días de la Semana
    const activeDays = Array.isArray(data.config.days) ? data.config.days : [1, 2, 3, 4, 5, 6, 0];
    document.querySelectorAll(".day-check").forEach((cb) => {
      cb.checked = activeDays.includes(Number(cb.value));
    });

    // 5. Tipo de Reporte
    const reportTypeSelect = document.getElementById("schedule-report-type");
    if (reportTypeSelect && data.config.reportType) {
      reportTypeSelect.value = data.config.reportType;
    }

    // 6. Canal de Telegram Info
    const chatIdDisplay = document.getElementById("telegram-chat-id-display");
    if (chatIdDisplay) {
      chatIdDisplay.textContent = data.defaultChatId || "Canal Institucional PDI (.env)";
    }

    const freqSummary = document.getElementById("schedule-freq-summary");
    if (freqSummary) {
      const timesCount = state.currentScheduleTimes.length;
      freqSummary.textContent = `${timesCount} ${timesCount === 1 ? 'envío programado' : 'envíos programados'} al día`;
    }

    // 7. Renderizar Historial de Despachos
    renderScheduleHistory(data.config.history || []);

  } catch (err) {
    console.error("Error al cargar ajustes de horario:", err);
  }
}

// Renderiza los chips visuales de las horas configuradas
function renderTimeChips(times) {
  const container = document.getElementById("time-chips-container");
  if (!container) return;

  if (!times || times.length === 0) {
    container.innerHTML = `<span style="color:var(--text-muted); font-size:0.8rem; padding: 4px;">No hay horarios definidos. Añade uno con el formulario inferior.</span>`;
    return;
  }

  // Ordenar cronológicamente
  const sorted = [...times].sort();
  state.currentScheduleTimes = sorted;

  container.innerHTML = sorted.map((time) => `
    <div class="time-chip">
      <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke: #0284c7;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>${time} hrs</span>
      <button type="button" class="time-chip-del" onclick="eliminarHorario('${time}')" title="Quitar este horario" aria-label="Quitar">
        <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join("");

  const freqSummary = document.getElementById("schedule-freq-summary");
  if (freqSummary) {
    const c = sorted.length;
    freqSummary.textContent = `${c} ${c === 1 ? 'envío programado' : 'envíos programados'} al día`;
  }
}

// Elimina un horario de la lista en memoria
window.eliminarHorario = function(time) {
  state.currentScheduleTimes = state.currentScheduleTimes.filter((t) => t !== time);
  renderTimeChips(state.currentScheduleTimes);
};

// Añade un horario si no existe y es válido
function agregarHorario(newTime) {
  if (!newTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(newTime)) {
    alert("Por favor ingresa un horario válido en formato HH:MM (24 horas).");
    return;
  }
  if (!state.currentScheduleTimes.includes(newTime)) {
    state.currentScheduleTimes.push(newTime);
    renderTimeChips(state.currentScheduleTimes);
  }
}

// Actualiza el texto de alerta según el toggle switch
function updateScheduleToggleAlert(enabled) {
  const alertBox = document.getElementById("schedule-enabled-alert");
  const alertText = document.getElementById("schedule-enabled-text");
  if (!alertBox || !alertText) return;

  if (enabled) {
    alertBox.className = "schedule-enabled-alert";
    alertText.innerHTML = `
      <span style="display:inline-flex; align-items:center; gap:6px;">
        <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#166534;"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Los reportes se despacharán automáticamente según las horas fijadas a continuación.</span>
      </span>
    `;
  } else {
    alertBox.className = "schedule-enabled-alert disabled";
    alertText.innerHTML = `
      <span style="display:inline-flex; align-items:center; gap:6px;">
        <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#991b1b;"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>
        <span>Los envíos automáticos están pausados temporalmente. No se emitirán reportes hasta reactivarlo.</span>
      </span>
    `;
  }
}

// Renderiza la tabla de bitácora histórica de despachos
function renderScheduleHistory(history) {
  const tbody = document.getElementById("schedule-history-tbody");
  const countBadge = document.getElementById("schedule-history-count");
  if (!tbody) return;

  if (countBadge) {
    countBadge.textContent = `${history.length} despachos`;
  }

  if (!history || history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:24px;">No se registran envíos automáticos recientes</td></tr>`;
    return;
  }

  tbody.innerHTML = history.map((item) => {
    const isExito = item.estado === "EXITO";
    const estadoBadge = isExito
      ? `<span class="badge badge-success">Entregado</span>`
      : `<span class="badge badge-danger">Fallo</span>`;

    const tipoBadge = item.tipo === "PRUEBA_MANUAL"
      ? `<span class="badge badge-info">Prueba Manual</span>`
      : `<span class="badge badge-primary">Automático</span>`;

    const slaText = item.slaPDI ? `${item.slaPDI}%` : "N/D";
    const enroladosText = item.totalEnrolados !== undefined ? item.totalEnrolados.toLocaleString("es-CL") : "-";

    return `
      <tr>
        <td style="font-weight:600; color:var(--pdi-navy);">
          <code>${item.horaChile || item.timestamp?.slice(0, 19).replace('T', ' ') || '-'}</code>
        </td>
        <td>${tipoBadge}</td>
        <td><code>${item.fechaReportada || '-'}</code></td>
        <td style="text-align:right; font-weight:700;">${enroladosText}</td>
        <td><span class="badge badge-success">${slaText} SLA</span></td>
        <td><small>${item.canal || 'Telegram'}</small></td>
        <td>${estadoBadge}</td>
        <td><small><code>#${item.messageId || 'N/D'}</code></small></td>
      </tr>
    `;
  }).join("");
}

// Configura los eventos interactivos del módulo de Ajustes
function setupScheduleEvents() {
  // Toggle Switch Habilitado
  const toggle = document.getElementById("schedule-enabled-toggle");
  if (toggle) {
    toggle.addEventListener("change", (e) => {
      updateScheduleToggleAlert(e.target.checked);
    });
  }

  // Botón Añadir Horario
  const btnAddTime = document.getElementById("btn-add-time");
  const inputNewTime = document.getElementById("input-new-time");
  if (btnAddTime && inputNewTime) {
    btnAddTime.addEventListener("click", () => {
      agregarHorario(inputNewTime.value);
    });
  }

  // Botones de Preajustes Operativos PDI
  document.querySelectorAll(".preset-pill-btn[data-add-time]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const timeToAdd = btn.getAttribute("data-add-time");
      agregarHorario(timeToAdd);
    });
  });

  // Selector rápido Días Hábiles
  const btnWeekdays = document.getElementById("btn-select-weekdays");
  if (btnWeekdays) {
    btnWeekdays.addEventListener("click", () => {
      document.querySelectorAll(".day-check").forEach((cb) => {
        const val = Number(cb.value);
        cb.checked = val >= 1 && val <= 5;
      });
    });
  }

  // Selector rápido Todos los Días
  const btnAllDays = document.getElementById("btn-select-all-days");
  if (btnAllDays) {
    btnAllDays.addEventListener("click", () => {
      document.querySelectorAll(".day-check").forEach((cb) => {
        cb.checked = true;
      });
    });
  }

  // Guardar Ajustes de Programación (Exige Clave Institucional Policial)
  const btnSaveSchedule = document.getElementById("btn-save-schedule");
  const saveFeedback = document.getElementById("schedule-save-feedback");
  if (btnSaveSchedule) {
    btnSaveSchedule.addEventListener("click", () => {
      try {
        const enabled = document.getElementById("schedule-enabled-toggle")?.checked ?? true;
        const reportType = document.getElementById("schedule-report-type")?.value || "extenso";

        const days = [];
        document.querySelectorAll(".day-check:checked").forEach((cb) => {
          days.push(Number(cb.value));
        });

        if (state.currentScheduleTimes.length === 0) {
          throw new Error("Debes definir al menos un horario para la programación.");
        }

        if (days.length === 0) {
          throw new Error("Debes seleccionar al menos un día de la semana para el despacho.");
        }

        const schedulePayload = {
          enabled,
          times: [...state.currentScheduleTimes],
          days,
          reportType,
        };

        // Solicitar clave institucional mediante el modal de seguridad policial
        promptAuthModal(schedulePayload, "programacion");

      } catch (err) {
        if (saveFeedback) {
          saveFeedback.className = "crypto-feedback-box error";
          saveFeedback.style.display = "block";
          saveFeedback.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626; margin-bottom:4px;">
              <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span>Error de Validación</span>
            </div>
            ${err.message}
          `;
          setTimeout(() => {
            saveFeedback.style.display = "none";
          }, 4000);
        }
      }
    });
  }

  // Disparo de Prueba Inmediata a Telegram
  const btnTestSchedule = document.getElementById("btn-trigger-test-schedule");
  const testFeedback = document.getElementById("schedule-test-feedback");
  if (btnTestSchedule) {
    btnTestSchedule.addEventListener("click", async () => {
      try {
        btnTestSchedule.disabled = true;
        btnTestSchedule.innerHTML = `<span class="spinner" style="width:14px; height:14px; border-width:2px; vertical-align:middle;"></span> Conectando y enviando a Telegram...`;

        if (testFeedback) testFeedback.style.display = "none";

        const testModo = document.getElementById("test-report-modo")?.value || "";
        const testAdjuntos = document.getElementById("test-report-adjuntos")?.checked ?? true;

        const res = await fetch("/api/settings/schedule/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modo: testModo, incluirAdjuntos: testAdjuntos }),
        });

        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Fallo en el despacho de prueba.");

        if (testFeedback) {
          testFeedback.className = "crypto-feedback-box success";
          testFeedback.style.display = "block";
          testFeedback.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
              <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Reporte de Prueba Despachado Exitosamente</span>
            </div>
            • Canal: <strong>Telegram Oficial PDI</strong><br>
            • Message ID: <code>#${data.resultado?.messageId || 'N/D'}</code><br>
            • Período: <code>${data.resultado?.fechaReportada || 'Actual'}</code> (${data.resultado?.totalEnrolados?.toLocaleString("es-CL")} registros)<br>
            • SLA: <strong>${data.resultado?.slaPDI}% Conforme</strong>
          `;
        }

        // Recargar historial para ver la nueva fila
        loadScheduleSettings();

      } catch (err) {
        if (testFeedback) {
          testFeedback.className = "crypto-feedback-box error";
          testFeedback.style.display = "block";
          testFeedback.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626;">
              <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span>Error al despachar prueba:</span>
            </div>
            ${err.message}
          `;
        }
      } finally {
        btnTestSchedule.disabled = false;
        btnTestSchedule.innerHTML = `
          <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          <span>Enviar Reporte de Prueba a Telegram Ahora</span>
        `;
      }
    });
  }

  // Botón Refrescar Historial
  const btnRefreshHistory = document.getElementById("btn-refresh-schedule-history");
  if (btnRefreshHistory) {
    btnRefreshHistory.addEventListener("click", () => {
      loadScheduleSettings();
    });
  }
}
