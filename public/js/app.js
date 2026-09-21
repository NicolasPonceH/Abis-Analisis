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

      if (tabTarget === "auditoria") {
        cargarBitacoraAuditoria();
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

// Helpers para diseño de gráficos amigables, legibles y modernos
function formatChartLabel(str, maxLen = 14) {
  if (!str) return "";
  const clean = String(str).trim();
  if (clean.length <= maxLen) return clean;
  const words = clean.split(" ");
  if (words.length === 1) return clean.length > maxLen ? clean.substring(0, maxLen - 1) + "…" : clean;
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxLen) {
      cur = (cur + " " + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 2 ? [lines[0], lines.slice(1).join(" ")] : lines;
}

function getVerticalGradient(ctx, colorTop, colorBottom, height = 280) {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, colorTop);
  g.addColorStop(1, colorBottom);
  return g;
}

function getHorizontalGradient(ctx, colorLeft, colorRight, width = 360) {
  const g = ctx.createLinearGradient(0, 0, width, 0);
  g.addColorStop(0, colorLeft);
  g.addColorStop(1, colorRight);
  return g;
}

// Configuración de Tooltip amigable, moderno y de alto contraste (Dark Card translúcida)
const BKLIT_TOOLTIP = {
  backgroundColor: "rgba(15, 23, 42, 0.94)",
  titleColor: "#ffffff",
  bodyColor: "#f1f5f9",
  borderColor: "rgba(255, 255, 255, 0.12)",
  borderWidth: 1,
  padding: { top: 10, bottom: 10, left: 14, right: 14 },
  boxPadding: 6,
  usePointStyle: true,
  boxWidth: 8,
  boxHeight: 8,
  cornerRadius: 10,
  titleFont: { family: "'Open Sans', sans-serif", size: 12.5, weight: "700" },
  bodyFont: { family: "'Open Sans', sans-serif", size: 12, weight: "500" },
  footerFont: { family: "'Open Sans', sans-serif", size: 11.5, weight: "600" },
  footerColor: "#38bdf8",
};

// Plugin de etiquetas numéricas directas y métricas visuales estilo amigable y limpio
const bklitDataLabelsPlugin = {
  id: "bklitDataLabels",
  afterDatasetsDraw(chart, args, options) {
    if (!options || options.display === false) return;
    const { ctx } = chart;
    ctx.save();

    const isHorizontal = chart.options.indexAxis === "y";
    const isDoughnut = chart.config.type === "doughnut";

    // 1. Centro del Doughnut: Métrica principal grande y subtítulo claro
    if (isDoughnut) {
      if (options.centerText) {
        const meta = chart.getDatasetMeta(0);
        if (meta && meta.data && meta.data[0]) {
          const centerX = meta.data[0].x;
          const centerY = meta.data[0].y;

          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          ctx.font = "800 23px 'Open Sans', sans-serif";
          ctx.fillStyle = options.centerTextColor || "#0f172a";
          ctx.fillText(options.centerText, centerX, centerY - 8);

          if (options.centerSubtext) {
            ctx.font = "600 11.5px 'Open Sans', sans-serif";
            ctx.fillStyle = "#64748b";
            ctx.fillText(options.centerSubtext, centerX, centerY + 14);
          }
        }
      }
      ctx.restore();
      return;
    }

    // 2. Gráficos de Barras: Cifras impresas con tipografía limpia y separadores de miles
    chart.data.datasets.forEach((dataset, datasetIdx) => {
      const meta = chart.getDatasetMeta(datasetIdx);
      if (meta.hidden) return;

      meta.data.forEach((element, index) => {
        const val = dataset.data[index];
        if (val === null || val === undefined || (options.hideZero && val === 0)) return;

        ctx.font = "700 11px 'Open Sans', sans-serif";
        ctx.fillStyle = options.color || "#1e293b";

        const formattedVal = Number(val).toLocaleString("es-CL");

        if (isHorizontal) {
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const x = element.x + 8;
          const y = element.y;

          let text = formattedVal;
          if (options.percentages && options.percentages[index] !== undefined) {
            text += ` · ${options.percentages[index]}%`;
          }
          ctx.fillText(text, x, y);
        } else {
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          const x = element.x;
          const y = element.y - 4;
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

  // 9. Gráfico de Profesiones y Oficios Declarados
  loadAndRenderProfesionesChart();
}

function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    delete state.charts[name];
  }
}

// Gráfico 1: Rendimiento por Cuartel (Con barras con gradiente suave, etiquetas legibles y números directos)
function renderCuartelesRendimientoChart(data) {
  destroyChart("chart-cuarteles");
  const ctx = document.getElementById("chart-cuarteles")?.getContext("2d");
  if (!ctx) return;

  const items = (data.rendimientoCuarteles || []).slice(0, 8);
  // Etiquetas horizontales multilínea amigables (evita rotaciones forzadas a 35°)
  const labels = items.map((i) => formatChartLabel(i.cuartel, 14));
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
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return "#10b981";
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, "#34d399");
            g.addColorStop(1, "#059669");
            return g;
          },
          hoverBackgroundColor: "#047857",
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 28,
        },
        {
          label: "Con Error",
          data: conError,
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return "#f43f5e";
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, "#fb7185");
            g.addColorStop(1, "#e11d48");
            return g;
          },
          hoverBackgroundColor: "#be123c",
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      barPercentage: 0.72,
      categoryPercentage: 0.78,
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 8,
            boxHeight: 8,
            padding: 16,
            color: "#334155",
            font: { family: "'Open Sans', sans-serif", weight: "600", size: 12 },
          },
        },
        tooltip: {
          ...BKLIT_TOOLTIP,
          callbacks: {
            footer: (tooltipItems) => {
              const idx = tooltipItems[0].dataIndex;
              const totalCuartel = items[idx]?.total || 0;
              const tasa = items[idx]?.tasaExito || 100;
              return `Total: ${totalCuartel.toLocaleString("es-CL")} (${tasa}% tasa de éxito)`;
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
            color: "#475569",
            font: { family: "'Open Sans', sans-serif", size: 11, weight: "600" },
            maxRotation: 0,
            minRotation: 0,
          },
        },
        y: {
          grid: { color: "rgba(226, 232, 240, 0.6)", borderDash: [4, 4] },
          border: { display: false },
          ticks: { color: "#64748b", font: { family: "'Open Sans', sans-serif", size: 11 } },
          beginAtZero: true,
          grace: "20%",
        },
      },
    },
  });
}

// Gráfico 2: Nacionalidades (Barras horizontales con gradientes armónicos y cifras holgadas)
function renderHorizontalBarChart(canvasId, items) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return;

  const topItems = items.slice(0, 8);
  const labels = topItems.map((i) => i.nacionalidad + (i.codigo_iso ? ` (${i.codigo_iso})` : ""));
  const values = topItems.map((i) => i.total);

  // Paleta moderna y armónica con gradientes de izquierda a derecha
  const nationPalette = [
    ["#2563eb", "#60a5fa"], // 1. Azul Zafiro
    ["#4f46e5", "#818cf8"], // 2. Índigo Suave
    ["#0284c7", "#38bdf8"], // 3. Celeste Oceánico
    ["#0d9488", "#2dd4bf"], // 4. Turquesa / Teal
    ["#059669", "#34d399"], // 5. Verde Esmeralda
    ["#d97706", "#fbbf24"], // 6. Ámbar Cálido
    ["#7c3aed", "#c084fc"], // 7. Violeta
    ["#475569", "#94a3b8"], // 8. Gris Pizarra
  ];

  state.charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Enrolamientos",
        data: values,
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return "#2563eb";
          const pair = nationPalette[context.dataIndex % nationPalette.length];
          const g = c.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
          g.addColorStop(0, pair[0]);
          g.addColorStop(1, pair[1]);
          return g;
        },
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 22,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      barPercentage: 0.7,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...BKLIT_TOOLTIP,
          callbacks: {
            label: (ctx) => ` Total: ${Number(ctx.raw).toLocaleString("es-CL")} · ${topItems[ctx.dataIndex]?.porcentaje}% del total`,
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
          grid: { color: "rgba(226, 232, 240, 0.6)", borderDash: [4, 4] },
          border: { display: false },
          ticks: { color: "#64748b", font: { family: "'Open Sans', sans-serif", size: 11 } },
          grace: "35%", // Amplitud generosa para evitar colisiones con las etiquetas
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#1e293b", font: { family: "'Open Sans', sans-serif", weight: "600", size: 11.5 } },
        },
      },
    },
  });
}

// Gráfico 3: Sincronización Donut Amigable (Con anillo suave y cifra central nítida)
function renderDoughnutChart(canvasId, items, colors) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return;

  const labels = items.map((i) => i.descripcion);
  const values = items.map((i) => i.total);

  const total = items.reduce((acc, i) => acc + (Number(i.total) || 0), 0);
  const sincOk = items.find((i) => String(i.descripcion).toUpperCase().includes("SINCRONIZADO"))?.total || 0;
  const pctSinc = total > 0 ? ((sincOk / total) * 100).toFixed(1) : "100";

  // Colores visualmente amigables y balanceados
  const friendlyDoughnutColors = [
    "#10b981", // Sincronizado OK (Esmeralda)
    "#f43f5e", // Con Error (Rosa suave)
    "#f59e0b", // Pendiente (Ámbar)
    "#06b6d4"  // En Proceso (Cyan)
  ];

  state.charts[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: friendlyDoughnutColors.slice(0, items.length),
        borderWidth: 0,
        borderRadius: 8,
        spacing: 5,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%", // Anillo más suave, grueso y amigable
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 8,
            boxHeight: 8,
            padding: 14,
            color: "#334155",
            font: { family: "'Open Sans', sans-serif", weight: "600", size: 11.5 },
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
            label: (ctx) => ` ${ctx.label}: ${Number(ctx.raw).toLocaleString("es-CL")} (${items[ctx.dataIndex]?.porcentaje}%)`,
          },
        },
        bklitDataLabels: {
          display: true,
          centerText: `${pctSinc}%`,
          centerSubtext: "Sincronizados PDI",
          centerTextColor: "#059669",
        },
      },
    },
  });
}

// Gráfico 4: Demografía Cruzada (Widget HTML Custom)
function renderDemografiaCruzadaChart(demografia, generoFallback) {
  let mascAdultos = 0, mascMenores = 0;
  let femAdultos = 0, femMenores = 0;
  let xTotal = 0;

  if (demografia.length > 0) {
    demografia.forEach(d => {
      const isMenor = !d.esMayorEdad;
      if (d.genero === "M") {
        if (!isMenor) mascAdultos += Number(d.total);
        else mascMenores += Number(d.total);
      } else if (d.genero === "F") {
        if (!isMenor) femAdultos += Number(d.total);
        else femMenores += Number(d.total);
      } else {
        xTotal += Number(d.total);
      }
    });
  }

  const mascTot = mascAdultos + mascMenores;
  const femTot = femAdultos + femMenores;
  const totGen = mascTot + femTot + xTotal;

  const pctM = totGen > 0 ? ((mascTot / totGen) * 100).toFixed(1) : "0.0";
  const pctF = totGen > 0 ? ((femTot / totGen) * 100).toFixed(1) : "0.0";

  const totAdult = mascAdultos + femAdultos;
  const totNna = mascMenores + femMenores + xTotal;
  const pctAdult = totGen > 0 ? ((totAdult / totGen) * 100).toFixed(1) : "0.0";
  const pctNna = totGen > 0 ? ((totNna / totGen) * 100).toFixed(1) : "0.0";

  const badge = document.getElementById("badge-chart-demografia-cruzada");
  if (badge) badge.textContent = `${mascTot} Hombres · ${femTot} Mujeres · ${totAdult} Adultos · ${totNna} NNA`;

  const safeSet = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  // Top blocks
  safeSet("demo-m-total", Number(mascTot).toLocaleString("es-CL"));
  safeSet("demo-m-pct", `(${pctM}%)`);
  
  safeSet("demo-f-total", Number(femTot).toLocaleString("es-CL"));
  safeSet("demo-f-pct", `(${pctF}%)`);

  safeSet("demo-adult-total", Number(totAdult).toLocaleString("es-CL"));
  safeSet("demo-adult-pct", `(${pctAdult}%)`);

  safeSet("demo-x-total", Number(totNna).toLocaleString("es-CL"));
  safeSet("demo-x-pct", `(${pctNna}%)`);

  // Progress Bars
  const elBarM = document.getElementById("demo-bar-m");
  const elBarF = document.getElementById("demo-bar-f");
  if (elBarM && elBarF) {
    elBarM.style.width = `${pctM}%`;
    elBarF.style.width = `${pctF}%`;
  }
  safeSet("demo-bar-gender-text", `${pctM}% M · ${pctF}% F`);

  const elBarAdult = document.getElementById("demo-bar-adult");
  const elBarNna = document.getElementById("demo-bar-nna");
  if (elBarAdult && elBarNna) {
    elBarAdult.style.width = `${pctAdult}%`;
    elBarNna.style.width = `${pctNna}%`;
  }
  safeSet("demo-bar-age-text", `${pctAdult}% Adultos · ${pctNna}% NNA`);

  // Table
  safeSet("demo-m-adult", Number(mascAdultos).toLocaleString("es-CL"));
  safeSet("demo-m-nna", Number(mascMenores).toLocaleString("es-CL"));
  safeSet("demo-m-subtot", Number(mascTot).toLocaleString("es-CL"));

  safeSet("demo-f-adult", Number(femAdultos).toLocaleString("es-CL"));
  safeSet("demo-f-nna", Number(femMenores).toLocaleString("es-CL"));
  safeSet("demo-f-subtot", Number(femTot).toLocaleString("es-CL"));

  safeSet("demo-tot-adult", Number(totAdult).toLocaleString("es-CL"));
  safeSet("demo-tot-nna", Number(totNna).toLocaleString("es-CL"));
  safeSet("demo-tot-global", Number(totGen).toLocaleString("es-CL"));
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

// Gráfico 6: Dispositivos de Captura (Tablet vs PC con donut suave y balanceado)
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
  // Colores modernos y contrastantes: Azul Zafiro para Tablet, Cyan para PC
  const colors = ["#2563eb", "#06b6d4"];

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
      cutout: "68%", // Grosor amigable y suave
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 8,
            boxHeight: 8,
            padding: 14,
            color: "#334155",
            font: { family: "'Open Sans', sans-serif", weight: "600", size: 11.5 },
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
            label: (ctx) => ` ${ctx.label}: ${Number(ctx.raw).toLocaleString("es-CL")} (${validItems[ctx.dataIndex]?.porcentaje || 0}%)`,
          },
        },
        bklitDataLabels: {
          display: true,
          centerText: `${total.toLocaleString("es-CL")}`,
          centerSubtext: "Dispositivos Activos",
          centerTextColor: "#0284c7",
        },
      },
    },
  });
}

// Gráfico 7: Despliegue Territorial por Región Policial (Barras con gradiente horizontal)
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
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return "#0284c7";
          const g = c.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
          g.addColorStop(0, "#0284c7");
          g.addColorStop(1, "#38bdf8");
          return g;
        },
        hoverBackgroundColor: "#0369a1",
        borderRadius: 8,
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
            label: (ctx) => ` Total: ${Number(ctx.raw).toLocaleString("es-CL")} · ${validItems[ctx.dataIndex]?.porcentaje || 0}% del despliegue`,
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
          grid: { color: "rgba(226, 232, 240, 0.6)", borderDash: [4, 4] },
          border: { display: false },
          ticks: { color: "#64748b", font: { family: "'Open Sans', sans-serif", size: 11 } },
          grace: "32%", // Amplitud generosa para etiquetas de valores
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#1e293b", font: { family: "'Open Sans', sans-serif", weight: "600", size: 11.5 } },
        },
      },
    },
  });
}

// Gráfico 8: Histograma de Tramos Etarios & Protección NNA (Barras con gradientes verticales diferenciados)
function renderTramosEtariosChart(items) {
  destroyChart("chart-tramos-etarios");
  const ctx = document.getElementById("chart-tramos-etarios")?.getContext("2d");
  if (!ctx) return;

  const validItems = Array.isArray(items) && items.length > 0 ? items : [
    { tramo: "Sin Registros", total: 0, porcentaje: 0 }
  ];

  // Etiquetas multilínea horizontales para evitar rotaciones oblicuas difíciles de leer
  const labels = validItems.map((i) => formatChartLabel(i.tramo, 13));
  const values = validItems.map((i) => i.total);

  state.charts["chart-tramos-etarios"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Personas",
        data: values,
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx: c, chartArea } = chart;
          const idx = context.dataIndex;
          const t = String(validItems[idx]?.tramo || "").toUpperCase();
          const isNna = t.includes("INFANCIA") || t.includes("NIÑEZ") || t.includes("NNA") || t.includes("ADOLESCENTES");
          if (!chartArea) return isNna ? "#f59e0b" : "#2563eb";
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          if (isNna) {
            g.addColorStop(0, "#fbbf24");
            g.addColorStop(1, "#d97706");
          } else {
            g.addColorStop(0, "#60a5fa");
            g.addColorStop(1, "#1d4ed8");
          }
          return g;
        },
        hoverBackgroundColor: (context) => {
          const idx = context.dataIndex;
          const t = String(validItems[idx]?.tramo || "").toUpperCase();
          return (t.includes("INFANCIA") || t.includes("NIÑEZ") || t.includes("NNA")) ? "#b45309" : "#1e40af";
        },
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 28,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      barPercentage: 0.68,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...BKLIT_TOOLTIP,
          callbacks: {
            label: (ctx) => ` Cantidad: ${Number(ctx.raw).toLocaleString("es-CL")} (${validItems[ctx.dataIndex]?.porcentaje || 0}%)`,
            afterLabel: (ctx) => {
              const t = String(validItems[ctx.dataIndex]?.tramo || "").toUpperCase();
              if (t.includes("INFANCIA") || t.includes("NIÑEZ") || t.includes("NNA")) {
                return "[!] Atención prioritaria: Menor de edad (N.N.A.)";
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
            color: "#475569",
            font: { family: "'Open Sans', sans-serif", weight: "600", size: 10.5 },
            maxRotation: 0,
            minRotation: 0,
          },
        },
        y: {
          grid: { color: "rgba(226, 232, 240, 0.6)", borderDash: [4, 4] },
          border: { display: false },
          ticks: { color: "#64748b", font: { family: "'Open Sans', sans-serif", size: 11 } },
          beginAtZero: true,
          grace: "20%",
        },
      },
    },
  });
}

// Gráfico 9: Perfil Sociolaboral (Top 10 Profesiones u Oficios Declarados)
async function loadAndRenderProfesionesChart() {
  try {
    let url = "/api/metricas/profesiones?limit=10";
    if (state.filterMode === "single" && state.currentDate) {
      url += `&fecha=${encodeURIComponent(state.currentDate)}`;
    } else if (state.filterMode === "range" && state.dateFrom && state.dateTo) {
      url += `&desde=${encodeURIComponent(state.dateFrom)}&hasta=${encodeURIComponent(state.dateTo)}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    renderProfesionesChart(data);
  } catch (err) {
    console.error("Error al cargar profesiones:", err);
  }
}

function renderProfesionesChart(data) {
  destroyChart("chart-profesiones");
  const ctx = document.getElementById("chart-profesiones")?.getContext("2d");
  if (!ctx) return;

  const items = data.profesiones || [];
  const badge = document.getElementById("badge-chart-profesiones");
  if (badge) {
    if (data.totalConProfesion > 0) {
      badge.textContent = `${data.totalConProfesion.toLocaleString()} con ocupación declarada`;
    } else {
      badge.textContent = "Extracción Oracle DB";
    }
  }

  if (items.length === 0) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    ctx.font = "600 13px 'Open Sans', sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("Sin registros de profesión en la fecha seleccionada (Oracle DB)", ctx.canvas.width / 2, 140);
    ctx.restore();
    return;
  }

  const labels = items.map((i) => formatChartLabel(i.profesion, 22));
  const values = items.map((i) => i.total);

  state.charts["chart-profesiones"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Personas",
        data: values,
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return "rgba(2, 132, 199, 0.85)";
          const g = c.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
          g.addColorStop(0, "rgba(2, 132, 199, 0.7)");
          g.addColorStop(1, "rgba(2, 132, 199, 0.95)");
          return g;
        },
        hoverBackgroundColor: "#0284c7",
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 20,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const item = items[context.dataIndex];
              return ` ${item.total.toLocaleString()} personas (${item.porcentaje}% del total identificado)`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(226, 232, 240, 0.6)", borderDash: [4, 4] },
          border: { display: false },
          ticks: { color: "#64748b", font: { family: "'Open Sans', sans-serif", size: 11 }, precision: 0 },
          beginAtZero: true,
        },
        y: {
          grid: { display: false },
          ticks: { color: "#1e293b", font: { family: "'Open Sans', sans-serif", weight: "600", size: 11 } },
        }
      }
    }
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

  // Integrar datos de las tarjetas ocultas
  if (elTotal && elTotal.nextElementSibling) {
    elTotal.nextElementSibling.textContent = `Total analizado en ${totalDias.toLocaleString("es-CL")} jornadas`;
  }
  if (elAvg && elAvg.nextElementSibling) {
    elAvg.nextElementSibling.textContent = `SLA Global Histórico: ${slaGlobal}%`;
  }

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

  // Configurar los límites del calendario (min y max) y datalist de fechas disponibles
  configureTrendCalendar();

  // Renderizar gráfico de tendencia principal
  renderTrendChart(displayItems, "chart-tendencia-historica");

  // Renderizar tabla detallada día a día (respetando si hay un filtro de fecha activo en el calendario)
  const calendarPicker = document.getElementById("trend-calendar-picker");
  if (!calendarPicker || !calendarPicker.value) {
    renderTrendTable(filteredItems);
  }

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

// Configura límites min/max para el selector de calendario de la matriz histórica
function configureTrendCalendar() {
  const cal = document.getElementById("trend-calendar-picker");
  if (!cal || !state.trendData || state.trendData.length === 0) return;

  const fechas = state.trendData.map((d) => d.fecha).sort();
  cal.min = fechas[0];
  cal.max = fechas[fechas.length - 1];
}

// Configuración de eventos de la pestaña de Evolución y Tendencias
function setupTrendControls() {
  // Presets de rango temporal de tendencia
  document.querySelectorAll("#trend-period-presets .preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#trend-period-presets .preset-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.trendRange = btn.getAttribute("data-trend-range");
      // Limpiar filtro de fecha en calendario
      const cal = document.getElementById("trend-calendar-picker");
      if (cal) cal.value = "";
      const btnClearCal = document.getElementById("btn-clear-trend-calendar");
      if (btnClearCal) btnClearCal.style.display = "none";
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

  // Selector de Fecha mediante Calendario Nativo
  const calendarBox = document.getElementById("trend-calendar-box");
  const calendarPicker = document.getElementById("trend-calendar-picker");
  const btnClearCalendar = document.getElementById("btn-clear-trend-calendar");
  const countEl = document.getElementById("trend-matrix-count");
  const searchInput = document.getElementById("trend-search-input");

  // Abrir de inmediato el calendario visual al hacer clic en cualquier parte de la caja
  if (calendarBox && calendarPicker) {
    calendarBox.addEventListener("click", (e) => {
      if (e.target === btnClearCalendar || btnClearCalendar?.contains(e.target)) return;
      try {
        calendarPicker.showPicker();
      } catch (err) {
        calendarPicker.focus();
      }
    });
  }

  if (calendarPicker) {
    calendarPicker.addEventListener("change", (e) => {
      const selectedDate = e.target.value;
      if (!selectedDate) {
        if (btnClearCalendar) btnClearCalendar.style.display = "none";
        updateTrendView();
        return;
      }

      if (searchInput) searchInput.value = "";
      if (btnClearCalendar) btnClearCalendar.style.display = "inline-flex";

      const match = (state.trendData || []).find((d) => d.fecha === selectedDate);
      if (match) {
        renderTrendTable([match]);
        if (countEl) countEl.textContent = `1 jornada operativa (${selectedDate})`;
      } else {
        const tbody = document.getElementById("trend-table-body");
        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="8" style="text-align:center; padding: 28px; color: var(--text-muted);">
                <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                  <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke:var(--text-muted);"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                  <span>No se registraron enrolamientos en el sistema el día <strong>${selectedDate}</strong>.</span>
                  <button type="button" id="btn-reset-trend-calendar" class="btn btn-secondary btn-sm" style="margin-top:6px;">
                    Restablecer y ver todas las jornadas
                  </button>
                </div>
              </td>
            </tr>
          `;
          document.getElementById("btn-reset-trend-calendar")?.addEventListener("click", () => {
            calendarPicker.value = "";
            if (btnClearCalendar) btnClearCalendar.style.display = "none";
            updateTrendView();
          });
        }
        if (countEl) countEl.textContent = `0 jornadas (${selectedDate})`;
      }
    });
  }

  if (btnClearCalendar) {
    btnClearCalendar.addEventListener("click", () => {
      if (calendarPicker) calendarPicker.value = "";
      btnClearCalendar.style.display = "none";
      updateTrendView();
    });
  }

  // Búsqueda en la matriz detallada de tendencias
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      if (calendarPicker && calendarPicker.value) {
        calendarPicker.value = "";
        if (btnClearCalendar) btnClearCalendar.style.display = "none";
      }
      const term = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll("#trend-table-body tr");
      let visible = 0;
      rows.forEach((tr) => {
        const text = tr.textContent.toLowerCase();
        const match = text.includes(term);
        tr.style.display = match ? "" : "none";
        if (match) visible++;
      });
      if (countEl && term) {
        countEl.textContent = `${visible} ${visible === 1 ? 'jornada encontrada' : 'jornadas encontradas'}`;
      } else if (countEl) {
        const rawItems = state.trendData || [];
        countEl.textContent = `${rows.length} jornadas operativas`;
      }
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

  if (actionType === "programacion") {
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
  } else if (actionType === "destinatario_agregar") {
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: #0284c7;">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="8.5" cy="7" r="4"/>
          <line x1="20" y1="8" x2="20" y2="14"/>
          <line x1="23" y1="11" x2="17" y2="11"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = "Autorización de Destinatario Policial";
    if (subtitleEl) subtitleEl.textContent = "Asignación de Nuevo Oficial / Canal en Telegram";
    if (warningEl) warningEl.textContent = "Para registrar y asignar una nueva ID de Telegram para recibir reportes se requiere verificar su credencial policial autorizada.";
    if (confirmBtn) {
      confirmBtn.innerHTML = `
        <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>Autorizar y Asignar ID</span>
      `;
    }
    if (fileNameEl) fileNameEl.textContent = `${file.nombre} (Chat ID: ${file.chatId})`;
    if (fileDetailsEl) fileDetailsEl.textContent = `Rol/Unidad: ${file.rolUnidad || 'Operativo'} • Almacenamiento Seguro PostgreSQL`;
  } else if (actionType === "destinatario_toggle") {
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: #0284c7;">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      `;
    }
    const accionTexto = file.nuevoEstado ? "Activar" : "Pausar";
    if (titleEl) titleEl.textContent = `Autorización para ${accionTexto} Destinatario`;
    if (subtitleEl) subtitleEl.textContent = "Modificación de Estado Operativo de Notificaciones";
    if (warningEl) warningEl.textContent = `Para ${accionTexto.toLowerCase()} el envío de reportes a este oficial se requiere verificar su credencial policial autorizada.`;
    if (confirmBtn) {
      confirmBtn.innerHTML = `<span>Autorizar y ${accionTexto}</span>`;
    }
    if (fileNameEl) fileNameEl.textContent = `${file.nombre} (Chat ID: ${file.chatId})`;
    if (fileDetailsEl) fileDetailsEl.textContent = `Nuevo estado solicitado: ${file.nuevoEstado ? 'Activo (Recibirá Reportes)' : 'Pausado (Sin Envíos)'}`;
  } else if (actionType === "destinatario_eliminar") {
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: #dc2626;">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = "Autorización para Eliminar Destinatario";
    if (subtitleEl) subtitleEl.textContent = "Revocación y Desvinculación de Oficial en Telegram";
    if (warningEl) warningEl.textContent = "Esta acción eliminará de forma permanente al oficial de la lista de destinatarios. Se requiere credencial policial.";
    if (confirmBtn) {
      confirmBtn.innerHTML = `<span>Autorizar y Eliminar</span>`;
    }
    if (fileNameEl) fileNameEl.textContent = `${file.nombre} (Chat ID: ${file.chatId})`;
    if (fileDetailsEl) fileDetailsEl.textContent = `Acción: Eliminación de PostgreSQL`;
  } else if (actionType === "sheet_ingest") {
    if (summaryIconEl) {
      summaryIconEl.innerHTML = `
        <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" style="stroke: #10b981;">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="3" y1="15" x2="21" y2="15"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
          <line x1="15" y1="3" x2="15" y2="21"/>
        </svg>
      `;
    }
    if (titleEl) titleEl.textContent = "Autorización de Ingesta desde Hoja de Cálculo";
    if (subtitleEl) subtitleEl.textContent = "Control de Acceso para Inserción Directa en Base de Datos";
    if (warningEl) warningEl.textContent = "Para insertar los registros copiados del portapapeles a PostgreSQL se requiere verificar su credencial policial de operador autorizado.";
    if (confirmBtn) {
      confirmBtn.innerHTML = `
        <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        <span>Autorizar e Ingestar en BD</span>
      `;
    }
    if (fileNameEl) {
      fileNameEl.textContent = `Hoja de Cálculo / Portapapeles (${(file.rows ? file.rows.length : 0).toLocaleString()} filas)`;
    }
    if (fileDetailsEl) {
      const colCount = file.headers ? file.headers.length : 0;
      fileDetailsEl.textContent = `${colCount} columnas detectadas • Inserción Transaccional PostgreSQL`;
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

  if (pendingAuthAction === "programacion") {
    await executeSaveScheduleAuthorized(pendingAuthFile, clave);
  } else if (pendingAuthAction === "destinatario_agregar") {
    await executeAgregarDestinatarioAuthorized(pendingAuthFile, clave);
  } else if (pendingAuthAction === "destinatario_toggle") {
    await executeToggleDestinatarioAuthorized(pendingAuthFile, clave);
  } else if (pendingAuthAction === "destinatario_eliminar") {
    await executeEliminarDestinatarioAuthorized(pendingAuthFile, clave);
  } else if (pendingAuthAction === "sheet_ingest") {
    await executeSheetIngestAuthorized(pendingAuthFile, clave);
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

    // 8. Cargar Gestor de Destinatarios de Telegram (PostgreSQL)
    cargarDestinatariosTelegram();

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

  // Inicializar eventos del gestor de destinatarios
  setupDestinatariosTelegramEvents();
}

// ==========================================================================
// GESTOR DE DESTINATARIOS DE TELEGRAM (CLIENTE WEB)
// ==========================================================================

state.telegramDestinatarios = [];
state.telegramBotLink = "https://t.me/AbisSystemBot";

// Carga la lista de destinatarios desde el backend
async function cargarDestinatariosTelegram() {
  const tbody = document.getElementById("destinatarios-table-body");
  try {
    const res = await fetch("/api/telegram/destinatarios");
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Fallo al consultar destinatarios.");

    state.telegramDestinatarios = data.destinatarios || [];

    if (data.botInfo && data.botInfo.link) {
      state.telegramBotLink = data.botInfo.link;
      const linkDirecto = document.getElementById("link-directo-bot");
      const labelLink = document.getElementById("label-link-bot");
      if (linkDirecto) {
        linkDirecto.href = data.botInfo.link;
      }
      if (labelLink) {
        labelLink.textContent = `Abrir @${data.botInfo.username}`;
      }
    }

    renderTablaDestinatarios(state.telegramDestinatarios);

  } catch (err) {
    console.error("Error al cargar destinatarios de Telegram:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; color:#dc2626; padding:16px;">
            Error cargando destinatarios: ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

// Función auxiliar de sanitización para prevenir XSS en renderizado de texto
function escaparHtml(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Renderiza la tabla de destinatarios con acciones operativas
function renderTablaDestinatarios(destinatarios) {
  const tbody = document.getElementById("destinatarios-table-body");
  const countBadge = document.getElementById("destinatarios-count-badge");
  if (!tbody) return;

  if (countBadge) {
    const total = (destinatarios || []).length;
    const activos = (destinatarios || []).filter(d => d.activo).length;
    countBadge.textContent = `${total} ${total === 1 ? 'destinatario' : 'destinatarios'} (${activos} activos)`;
  }

  if (!destinatarios || destinatarios.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No hay destinatarios registrados aún. Asigne uno usando el formulario superior.</td></tr>`;
    return;
  }

  tbody.innerHTML = destinatarios.map((d) => {
    const estadoBadge = d.activo
      ? `<span class="badge-active"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#15803d;"><polyline points="20 6 9 17 4 12"/></svg> Activo</span>`
      : `<span class="badge-paused"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#64748b;"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg> Pausado</span>`;

    const toggleText = d.activo ? "Pausar" : "Activar";
    const toggleIcon = d.activo
      ? `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>`
      : `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;

    const testButtonHtml = d.activo
      ? `<button type="button" class="btn-dest-action btn-dest-test" onclick="probarDestinatarioIndividual(${d.id}, '${escaparHtml(d.nombre).replace(/'/g, "\\'")}', this)" title="Enviar mensaje de prueba individual a este destinatario">
           <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
           <span>Probar</span>
         </button>`
      : `<button type="button" class="btn-dest-action btn-dest-test" disabled style="opacity: 0.45; cursor: not-allowed;" title="No es posible probar porque el oficial está pausado. Actívelo primero para enviar pruebas.">
           <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
           <span>Probar</span>
         </button>`;

    return `
      <tr>
        <td style="font-weight:600; color:var(--pdi-navy);">
          ${escaparHtml(d.nombre)}
        </td>
        <td>
          <code>${escaparHtml(d.chat_id)}</code>
        </td>
        <td>
          <span class="badge badge-info">${escaparHtml(d.rol_unidad || "General")}</span>
        </td>
        <td>${estadoBadge}</td>
        <td><small style="color:var(--text-muted);">${d.fecha_registro || '-'}</small></td>
        <td style="text-align:center;">
          <div class="dest-actions-group">
            ${testButtonHtml}
            <button type="button" class="btn-dest-action btn-dest-toggle" onclick="solicitarToggleDestinatario(${d.id}, '${escaparHtml(d.nombre).replace(/'/g, "\\'")}', '${d.chat_id}', ${d.activo})" title="${toggleText} envíos para este oficial">
              ${toggleIcon}
              <span>${toggleText}</span>
            </button>
            <button type="button" class="btn-dest-action btn-dest-delete" onclick="solicitarEliminarDestinatario(${d.id}, '${escaparHtml(d.nombre).replace(/'/g, "\\'")}', '${d.chat_id}')" title="Eliminar este oficial del sistema">
              <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <span>Eliminar</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Configura eventos interactivos del Gestor de Destinatarios
function setupDestinatariosTelegramEvents() {
  // Formulario nuevo destinatario
  const form = document.getElementById("form-nuevo-destinatario");
  const destFeedback = document.getElementById("dest-feedback");

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const nombre = document.getElementById("dest-nombre")?.value?.trim();
      const chatId = document.getElementById("dest-chat-id")?.value?.trim();
      const rolUnidad = document.getElementById("dest-rol")?.value?.trim() || "Operativo";

      if (!nombre) {
        alert("Por favor ingrese el nombre u oficial.");
        return;
      }
      if (!chatId || !/^-?\d+$/.test(chatId)) {
        alert("El Chat ID debe ser un número entero válido de Telegram (ej: 7961617813).");
        return;
      }

      promptAuthModal({ nombre, chatId, rolUnidad }, "destinatario_agregar");
    });
  }

  // Botón Copiar Enlace Directo
  const btnCopiar = document.getElementById("btn-copiar-link-bot");
  if (btnCopiar) {
    btnCopiar.addEventListener("click", () => {
      const link = state.telegramBotLink || "https://t.me/AbisSystemBot";
      navigator.clipboard.writeText(link).then(() => {
        const textEl = document.getElementById("text-copiar-link-bot");
        if (textEl) {
          const prev = textEl.textContent;
          textEl.textContent = "¡Enlace Copiado!";
          setTimeout(() => { textEl.textContent = prev; }, 3000);
        }
      }).catch(() => {
        prompt("Copie el enlace directo del bot para enviarlo al destinatario:", link);
      });
    });
  }

  // Botón Actualizar Lista
  const btnRefresh = document.getElementById("btn-refresh-destinatarios");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      cargarDestinatariosTelegram();
    });
  }
}

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
async function executeAgregarDestinatarioAuthorized(payload, clave) {
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");
  const destFeedback = document.getElementById("dest-feedback");

  try {
    const res = await fetch("/api/telegram/destinatarios", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ingesta-Auth": clave,
      },
      body: JSON.stringify({
        ...payload,
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
        errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Clave no autorizada. Verifique su credencial.`;
        errorMsg.style.display = "flex";
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>Reintentar Autorización</span>`;
      }
      if (claveInput) {
        claveInput.select();
        claveInput.focus();
      }
      return;
    }

    if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo registrar el destinatario.");

    closeAuthModal();

    // Limpiar campos del formulario
    const form = document.getElementById("form-nuevo-destinatario");
    if (form) form.reset();
    const destRol = document.getElementById("dest-rol");
    if (destRol) destRol.value = "Operativo";

    if (destFeedback) {
      destFeedback.className = "crypto-feedback-box success";
      destFeedback.style.display = "block";
      destFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Oficial Asignado Exitosamente</span>
        </div>
        ${data.mensaje}
      `;
      setTimeout(() => { destFeedback.style.display = "none"; }, 5000);
    }

    await cargarDestinatariosTelegram();

  } catch (err) {
    closeAuthModal();
    if (destFeedback) {
      destFeedback.className = "crypto-feedback-box error";
      destFeedback.style.display = "block";
      destFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626; margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Error al Asignar Destinatario</span>
        </div>
        ${err.message}
      `;
    }
  }
}

// Ejecución autorizada para toggle estado destinatario
async function executeToggleDestinatarioAuthorized(payload, clave) {
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");
  const destFeedback = document.getElementById("dest-feedback");

  try {
    const res = await fetch(`/api/telegram/destinatarios/${payload.id}/toggle`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Ingesta-Auth": clave,
      },
      body: JSON.stringify({
        activo: payload.nuevoEstado,
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
        errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Clave no autorizada. Verifique su credencial.`;
        errorMsg.style.display = "flex";
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>Reintentar Autorización</span>`;
      }
      if (claveInput) {
        claveInput.select();
        claveInput.focus();
      }
      return;
    }

    if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo actualizar el estado.");

    closeAuthModal();

    if (destFeedback) {
      destFeedback.className = "crypto-feedback-box success";
      destFeedback.style.display = "block";
      destFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Estado Actualizado</span>
        </div>
        ${data.mensaje}
      `;
      setTimeout(() => { destFeedback.style.display = "none"; }, 4000);
    }

    await cargarDestinatariosTelegram();

  } catch (err) {
    closeAuthModal();
    if (destFeedback) {
      destFeedback.className = "crypto-feedback-box error";
      destFeedback.style.display = "block";
      destFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626; margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Error de Actualización</span>
        </div>
        ${err.message}
      `;
    }
  }
}

// Ejecución autorizada para eliminar destinatario
async function executeEliminarDestinatarioAuthorized(payload, clave) {
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");
  const destFeedback = document.getElementById("dest-feedback");

  try {
    const res = await fetch(`/api/telegram/destinatarios/${payload.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Ingesta-Auth": clave,
      },
      body: JSON.stringify({ clave }),
    });

    const data = await res.json();

    if (res.status === 401 || data.codigo === "AUTH_REQUIRED") {
      if (modalDialog) {
        modalDialog.classList.remove("modal-shake");
        void modalDialog.offsetWidth;
        modalDialog.classList.add("modal-shake");
      }
      if (errorMsg) {
        errorMsg.innerHTML = `<svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Clave no autorizada. Verifique su credencial.`;
        errorMsg.style.display = "flex";
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>Reintentar Autorización</span>`;
      }
      if (claveInput) {
        claveInput.select();
        claveInput.focus();
      }
      return;
    }

    if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo eliminar el destinatario.");

    closeAuthModal();

    if (destFeedback) {
      destFeedback.className = "crypto-feedback-box success";
      destFeedback.style.display = "block";
      destFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--status-success); margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:var(--status-success);"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Destinatario Eliminado</span>
        </div>
        ${data.mensaje}
      `;
      setTimeout(() => { destFeedback.style.display = "none"; }, 4000);
    }

    await cargarDestinatariosTelegram();

  } catch (err) {
    closeAuthModal();
    if (destFeedback) {
      destFeedback.className = "crypto-feedback-box error";
      destFeedback.style.display = "block";
      destFeedback.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#dc2626; margin-bottom:4px;">
          <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24" style="stroke:#dc2626;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Error de Eliminación</span>
        </div>
        ${err.message}
      `;
    }
  }
}

// ==========================================================================
// MÓDULO: COMPARADOR DE PERÍODOS (BENCHMARKING)
// ==========================================================================

async function cargarComparacionPeriodos(tipo) {
  try {
    document.getElementById("btn-comp-semana").classList.toggle("active", tipo === "semana");
    document.getElementById("btn-comp-mes").classList.toggle("active", tipo === "mes");
    
    document.getElementById("comp-sub-total").textContent = "Calculando...";
    
    const res = await fetch(`/api/metricas/comparar?tipo=${tipo}`);
    if (!res.ok) throw new Error("Error en comparador");
    
    const data = await res.json();
    
    const fmt = n => Number(n).toLocaleString("es-CL");
    const fmtPct = n => Number(n).toFixed(1) + "%";
    
    const updateCard = (prefix, valAct, valAnt, variacion, isInverted = false) => {
      document.getElementById(`comp-kpi-${prefix}`).textContent = prefix === "sla" ? fmtPct(valAct) : fmt(valAct);
      const deltaEl = document.getElementById(`comp-delta-${prefix}`);
      
      let sign = variacion > 0 ? "+" : (variacion < 0 ? "-" : "");
      let absVar = Math.abs(variacion);
      deltaEl.textContent = prefix === "sla" ? `${sign}${absVar.toFixed(1)} pp` : `${sign}${absVar.toFixed(1)}%`;
      
      deltaEl.className = "delta-badge";
      if (variacion === 0) {
        deltaEl.classList.add("delta-neutral");
      } else if (variacion > 0) {
        deltaEl.classList.add(isInverted ? "delta-negative" : "delta-positive");
      } else {
        deltaEl.classList.add(isInverted ? "delta-positive" : "delta-negative");
      }
      
      document.getElementById(`comp-sub-${prefix}`).textContent = `Anterior: ${prefix === "sla" ? fmtPct(valAnt) : fmt(valAnt)}`;
    };

    updateCard("total", data.actual.total, data.anterior.total, data.variacion.total);
    updateCard("sinc", data.actual.sincronizados, data.anterior.sincronizados, data.variacion.sincronizados);
    updateCard("sla", data.actual.sla, data.anterior.sla, data.variacion.sla);
    updateCard("err", data.actual.errores, data.anterior.errores, data.variacion.errores, true);

    // Enriquecer el subtitulo del SLA Medio con la cantidad absoluta
    const slaSub = document.getElementById("comp-sub-sla");
    if (slaSub) {
      slaSub.textContent = `(${fmt(data.actual.sincronizados)} regs) Anterior: ${fmtPct(data.anterior.sla)}`;
    }

  } catch (e) {
    console.error("[BENCHMARKING ERROR]", e);
    document.getElementById("comp-sub-total").textContent = "Error al cargar comparativa";
  }
}

document.getElementById("btn-comp-semana")?.addEventListener("click", () => cargarComparacionPeriodos("semana"));
document.getElementById("btn-comp-mes")?.addEventListener("click", () => cargarComparacionPeriodos("mes"));

// ==========================================================================
// MÓDULO: BITÁCORA Y AUDITORÍA
// ==========================================================================

let auditState = {
  offset: 0,
  limit: 25,
  tipo: "",
  desde: "",
  hasta: ""
};

async function cargarBitacoraAuditoria(reset = false) {
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

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const sheetState = {
  headers: [],
  rows: [],
};

const SHEET_SCHEMA = [
  { field: "fechaEnrolamiento", label: "Fecha", required: true, aliases: ["fecha", "fecha_enrolamiento", "fecha enrolamiento"] },
  { field: "nacionalidad", label: "Nacionalidad", required: true, aliases: ["nacionalidad", "documento_emitido", "emitido en", "documento_emitido_1"] },
  { field: "region", label: "Región", required: false, aliases: ["region", "región", "region2"] },
  { field: "unidad", label: "Unidad Policial", required: true, aliases: ["unidad"] },
  { field: "cuartel", label: "Cuartel", required: true, aliases: ["cuartel", "cuartel_new", "cuartelnew"] },
  { field: "equipo", label: "Equipo ABIS", required: true, aliases: ["equipo", "dispositivo"] },
  { field: "genero", label: "Género", required: true, aliases: ["genero", "género"] },
  { field: "mayorEdad", label: "Rango Etario", required: true, aliases: ["mayor de edad", "rango_etario", "edades", "mayor edad"] },
  { field: "edadExacta", label: "Edad", required: false, aliases: ["edad", "edad exacta", "edad_1"] },
  { field: "estadoSincronizacion", label: "Sincronización PDI", required: true, aliases: ["estado sincronizacion", "sincronización pdi", "sincronizacion_pdi", "sincronizacion pdi", "estado sincronización"] },
  { field: "estadoRegistro", label: "Registración Biométrica", required: true, aliases: ["estado registro", "registración biométrica", "registracion_biometrica", "registracion biometrica"] },
  { field: "estadoGeneral", label: "Estado General", required: true, aliases: ["estado general", "estado_general"] },
  { field: "profesion", label: "Profesión / Ocupación", required: false, aliases: ["profesion", "cod_profesion", "profesión", "oficio", "ocupacion", "ocupación"] },
];

function initSpreadsheetIngest() {
  const btnModeSheet = document.getElementById("btn-mode-sheet");
  const btnModeFile = document.getElementById("btn-mode-file");
  const viewSheet = document.getElementById("ingesta-view-sheet");
  const viewFile = document.getElementById("ingesta-view-file");

  if (btnModeSheet && btnModeFile) {
    btnModeSheet.addEventListener("click", () => {
      btnModeSheet.classList.add("active");
      btnModeFile.classList.remove("active");
      if (viewSheet) viewSheet.style.display = "block";
      if (viewFile) viewFile.style.display = "none";
    });

    btnModeFile.addEventListener("click", () => {
      btnModeFile.classList.add("active");
      btnModeSheet.classList.remove("active");
      if (viewFile) viewFile.style.display = "block";
      if (viewSheet) viewSheet.style.display = "none";
    });
  }

  // Captura global de evento 'paste' cuando se está en la pestaña de ingesta
  document.addEventListener("paste", (e) => {
    if (state.activeTab !== "ingesta") return;
    const authModal = document.getElementById("modal-auth-ingesta");
    if (authModal && authModal.style.display === "flex") return;

    if (document.activeElement && document.activeElement.id === "sheet-hidden-paste-area") return;

    const clipboardText = e.clipboardData ? e.clipboardData.getData("text") : "";
    if (clipboardText && clipboardText.trim().length > 0) {
      e.preventDefault();
      handlePastedClipboardText(clipboardText);
    }
  });

  const btnPasteClipboard = document.getElementById("btn-paste-clipboard");
  if (btnPasteClipboard) {
    btnPasteClipboard.addEventListener("click", async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text && text.trim().length > 0) {
            handlePastedClipboardText(text);
            return;
          }
        }
      } catch (err) {
        console.warn("Acceso directo a portapapeles restringido:", err.message);
      }
      const textarea = document.getElementById("sheet-hidden-paste-area");
      if (textarea) {
        textarea.focus();
        textarea.placeholder = "Por favor pega aquí los datos con Ctrl + V...";
      }
    });
  }

  const dropzoneArea = document.getElementById("sheet-paste-dropzone");
  if (dropzoneArea) {
    dropzoneArea.addEventListener("click", (e) => {
      if (e.target.id !== "sheet-hidden-paste-area") {
        const textarea = document.getElementById("sheet-hidden-paste-area");
        if (textarea) textarea.focus();
      }
    });
  }

  const hiddenTextarea = document.getElementById("sheet-hidden-paste-area");
  if (hiddenTextarea) {
    hiddenTextarea.addEventListener("input", (e) => {
      const val = e.target.value;
      if (val && val.trim().length > 0) {
        handlePastedClipboardText(val);
        e.target.value = "";
      }
    });
  }

  const btnLoadSample = document.getElementById("btn-load-sample-sheet");
  if (btnLoadSample) {
    btnLoadSample.addEventListener("click", () => {
      loadSampleOracleData();
    });
  }

  const btnClearSheet = document.getElementById("btn-clear-sheet");
  if (btnClearSheet) {
    btnClearSheet.addEventListener("click", () => {
      clearSpreadsheetData();
    });
  }

  const btnAddRow = document.getElementById("btn-sheet-add-row");
  if (btnAddRow) {
    btnAddRow.addEventListener("click", () => {
      addEmptyRowToSpreadsheet();
    });
  }

  const btnSubmit = document.getElementById("btn-sheet-submit");
  const btnSubmitBottom = document.getElementById("btn-sheet-submit-bottom");
  const submitHandler = () => {
    submitSpreadsheetIngest();
  };
  if (btnSubmit) btnSubmit.addEventListener("click", submitHandler);
  if (btnSubmitBottom) btnSubmitBottom.addEventListener("click", submitHandler);
}

function handlePastedClipboardText(rawText) {
  const parsed = parseClipboardData(rawText);
  if (!parsed.rows || parsed.rows.length === 0) {
    alert("No se detectaron filas tabulares válidas en el contenido pegado.");
    return;
  }
  sheetState.headers = parsed.headers;
  sheetState.rows = parsed.rows;
  renderSpreadsheetGrid();
}

function parseClipboardData(text) {
  if (!text || typeof text !== "string") return { headers: [], rows: [] };

  const lines = text
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const firstLine = lines[0];
  let delim = "\t";
  if (firstLine.includes("\t")) {
    delim = "\t";
  } else if (firstLine.includes(";")) {
    delim = ";";
  } else if (firstLine.includes(",")) {
    delim = ",";
  }

  function splitLine(line, delimiter) {
    if (delimiter === "\t") {
      return line.split("\t").map((cell) => cell.trim().replace(/^["']|["']$/g, ""));
    }
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(cur.trim().replace(/^["']|["']$/g, ""));
        cur = "";
      } else {
        cur += char;
      }
    }
    result.push(cur.trim().replace(/^["']|["']$/g, ""));
    return result;
  }

  const grid = lines.map((l) => splitLine(l, delim));
  if (grid.length === 0) return { headers: [], rows: [] };

  const firstRow = grid[0];
  const knownKeywords = [
    "fecha", "enrolamiento", "nacionalidad", "documento", "emitido",
    "region", "unidad", "cuartel", "equipo", "genero", "edad",
    "edades", "sincronizacion", "biometrica", "estado", "pdi"
  ];

  const hasHeaderKeywords = firstRow.some((cell) => {
    const norm = String(cell).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return knownKeywords.some((kw) => norm.includes(kw));
  });

  let headers = [];
  let dataRows = [];

  if (hasHeaderKeywords) {
    headers = firstRow.map((h) => String(h || "").trim());
    dataRows = grid.slice(1);
  } else {
    headers = [
      "FECHA_ENROLAMIENTO",
      "DOCUMENTO_EMITIDO",
      "REGION",
      "UNIDAD",
      "CUARTEL_NEW",
      "EQUIPO",
      "GENERO",
      "EDADES",
      "EDAD_1",
      "SINCRONIZACION_PDI",
      "REGISTRACION_BIOMETRICA",
      "ESTADO_GENERAL"
    ];
    dataRows = grid;
  }

  return { headers, rows: dataRows };
}

function loadSampleOracleData() {
  const hoy = new Date().toISOString().split("T")[0];
  const sampleHeaders = [
    "Acciones", "Fecha", "hora", "EQUIPO", "Usuario", "UNIDAD",
    "Nombre Completo", "Tipo de Documento", "Documento", "Emitido En",
    "Nacionalidad", "Sincronización PDI", "Registración Biométrica",
    "Estado General", "CUARTEL", "REGION", "FECHA NACIMIENTO", "EDAD",
    "RANGO_ETARIO", "UUII", "IP", "CUARTELNEW", "NOMBRE_FUNCIONARIO",
    "REGION2", "GENERO", "TIPO REGISTRO"
  ];
  const sampleRows = [
    ["", hoy, "08:15:00", "PC DE ESCRITORIO", "operador1", "PREPOLIN ARICA", "GOMEZ PEREZ JUAN", "DNI", "87654321", "VENEZUELA", "VENEZUELA", "SINCRONIZADO", "REGISTRADO", "REGISTRADO", "CHACALLUTA", "ARICA Y PARINACOTA", "1994-02-10", "32", "MAYOR DE EDAD", "U101", "10.20.1.15", "", "SUBCOMISARIO DIAZ", "", "HOMBRE", "ENROLADO"],
    ["", hoy, "09:30:22", "TABLET", "operador2", "PREPOLIN ARICA", "SILVA MORA LAURA", "PASAPORTE", "PA123456", "COLOMBIA", "COLOMBIA", "SINCRONIZADO", "REGISTRADO", "REGISTRADO", "CHUNGARA", "ARICA Y PARINACOTA", "1998-07-25", "28", "MAYOR DE EDAD", "U102", "10.20.1.18", "", "INSPECTORA CASTRO", "", "MUJER", "ENROLADO"],
    ["", hoy, "10:45:10", "PC DE ESCRITORIO", "operador3", "JENATID", "MAMANI CHOQUE CARLOS", "CEDULA", "65432198", "BOLIVIA", "BOLIVIA", "SINCRONIZADO", "REGISTRADO", "REGISTRADO", "COLCHANES", "TARAPACA", "2012-11-03", "14", "MENOR DE EDAD", "U103", "10.20.2.11", "", "COMISARIO ROJAS", "", "HOMBRE", "ENROLADO"],
    ["", hoy, "11:20:05", "TABLET", "operador1", "PREPOLIN ARICA", "JEAN BAPTISTE MARIE", "PASAPORTE", "HT998877", "HAITI", "HAITI", "SINCRONIZADO", "REGISTRADO", "REGISTRADO", "BELEN", "ARICA Y PARINACOTA", "1985-04-12", "41", "MAYOR DE EDAD", "U104", "10.20.1.20", "", "SUBCOMISARIO DIAZ", "", "MUJER", "ENROLADO"],
    ["", hoy, "12:05:40", "PC DE ESCRITORIO", "operador2", "PREPOLIN ARICA", "QUISPE MAMANI LUIS", "DNI", "45678912", "PERU", "PERU", "SINCRONIZADO", "REGISTRADO", "REGISTRADO", "CHACALLUTA", "ARICA Y PARINACOTA", "1987-09-30", "39", "MAYOR DE EDAD", "U105", "10.20.1.22", "", "INSPECTORA CASTRO", "", "HOMBRE", "ENROLADO"]
  ];

  const tsvText = [
    sampleHeaders.join("\t"),
    ...sampleRows.map(r => r.join("\t"))
  ].join("\n");

  handlePastedClipboardText(tsvText);
}

function renderSpreadsheetGrid() {
  const dropzone = document.getElementById("sheet-paste-dropzone");
  const previewCard = document.getElementById("sheet-preview-card");
  const btnClear = document.getElementById("btn-clear-sheet");
  const statRows = document.getElementById("sheet-stat-rows");
  const statCols = document.getElementById("sheet-stat-cols");
  const statStatus = document.getElementById("sheet-stat-status");
  const countBadge = document.getElementById("sheet-preview-count-badge");
  const mappingChips = document.getElementById("sheet-column-mapping-chips");
  const thead = document.getElementById("sheet-table-head");
  const tbody = document.getElementById("sheet-table-body");

  if (!dropzone || !previewCard) return;

  const rowCount = sheetState.rows.length;
  const colCount = sheetState.headers.length;

  if (rowCount === 0) {
    dropzone.style.display = "block";
    previewCard.style.display = "none";
    if (btnClear) btnClear.style.display = "none";
    if (statRows) statRows.textContent = "0";
    if (statCols) statCols.textContent = "0 / 12";
    if (statStatus) {
      statStatus.className = "badge badge-default";
      statStatus.textContent = "Esperando datos";
    }
    return;
  }

  dropzone.style.display = "none";
  previewCard.style.display = "block";
  if (btnClear) btnClear.style.display = "inline-flex";

  if (statRows) statRows.textContent = rowCount.toLocaleString();
  if (countBadge) countBadge.textContent = `${rowCount.toLocaleString()} filas`;

  const mappedFieldKeys = new Set();
  const chipsHtml = sheetState.headers.map((h, colIdx) => {
    const normH = String(h || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const match = SHEET_SCHEMA.find(def => {
      const defNorm = def.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return normH === defNorm || def.aliases.some(a => normH === a.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    });

    if (match) {
      const isFirst = !mappedFieldKeys.has(match.field);
      mappedFieldKeys.add(match.field);
      const tagSuffix = isFirst ? `➔ <strong>${match.label}</strong>` : `(Alternativo ➔ ${match.label})`;
      return `<span class="col-map-chip matched" title="Mapeada al modelo ABIS: ${match.label}">✓ ${escapeHtml(h)} ${tagSuffix}</span>`;
    } else {
      return `<span class="col-map-chip extra" title="Columna informativa / no modelada">Col ${colIdx + 1}: ${escapeHtml(h)}</span>`;
    }
  });

  if (mappingChips) {
    mappingChips.innerHTML = chipsHtml.join("");
  }

  const requiredDefs = SHEET_SCHEMA.filter(s => s.required);
  const metRequiredCount = requiredDefs.filter(s => mappedFieldKeys.has(s.field)).length;

  if (statCols) {
    statCols.textContent = `${colCount} columnas (${metRequiredCount}/${requiredDefs.length} campos clave identificados)`;
  }

  if (statStatus) {
    if (metRequiredCount >= requiredDefs.length) {
      statStatus.className = "badge badge-success";
      statStatus.textContent = "Listo para Ingesta (100% Claves OK)";
    } else if (metRequiredCount >= 7) {
      statStatus.className = "badge badge-warning";
      statStatus.textContent = "Revisar Cabeceras Parciales";
    } else {
      statStatus.className = "badge badge-danger";
      statStatus.textContent = "Faltan Campos Requeridos";
    }
  }

  if (thead) {
    let theadHtml = "<tr>";
    theadHtml += `<th class="col-index">#</th>`;
    sheetState.headers.forEach((h, colIdx) => {
      theadHtml += `<th>${escapeHtml(h || `Columna ${colIdx + 1}`)}</th>`;
    });
    theadHtml += `<th class="col-action" title="Eliminar fila">✕</th>`;
    theadHtml += "</tr>";
    thead.innerHTML = theadHtml;
  }

  if (tbody) {
    const maxVisual = Math.min(rowCount, 100);
    let tbodyHtml = "";

    for (let r = 0; r < maxVisual; r++) {
      const row = sheetState.rows[r] || [];
      tbodyHtml += `<tr data-row-idx="${r}">`;
      tbodyHtml += `<td class="cell-index">${r + 1}</td>`;
      for (let c = 0; c < colCount; c++) {
        const val = row[c] !== undefined ? String(row[c]) : "";
        tbodyHtml += `<td class="cell-editable" contenteditable="true" data-row="${r}" data-col="${c}" title="Doble clic para editar">${escapeHtml(val)}</td>`;
      }
      tbodyHtml += `
        <td style="text-align: center;">
          <button type="button" class="btn-cell-delete" data-delete-row="${r}" title="Eliminar esta fila">
            <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </td>
      `;
      tbodyHtml += "</tr>";
    }

    if (rowCount > 100) {
      tbodyHtml += `
        <tr>
          <td colspan="${colCount + 2}" style="text-align: center; color: var(--text-muted); padding: 12px; font-style: italic; background: #f8fafc;">
            ... y ${(rowCount - 100).toLocaleString()} filas más que serán procesadas en su totalidad al ingestar.
          </td>
        </tr>
      `;
    }

    tbody.innerHTML = tbodyHtml;

    tbody.querySelectorAll("td.cell-editable").forEach((td) => {
      td.addEventListener("blur", (e) => {
        const r = parseInt(e.target.getAttribute("data-row"), 10);
        const c = parseInt(e.target.getAttribute("data-col"), 10);
        const val = e.target.innerText.trim();
        if (sheetState.rows[r]) {
          sheetState.rows[r][c] = val;
        }
      });
    });

    tbody.querySelectorAll("button[data-delete-row]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const r = parseInt(btn.getAttribute("data-delete-row"), 10);
        if (!isNaN(r)) {
          sheetState.rows.splice(r, 1);
          renderSpreadsheetGrid();
        }
      });
    });
  }
}

function clearSpreadsheetData() {
  sheetState.headers = [];
  sheetState.rows = [];
  const feedback = document.getElementById("sheet-ingest-feedback");
  if (feedback) feedback.style.display = "none";
  renderSpreadsheetGrid();
}

function addEmptyRowToSpreadsheet() {
  if (sheetState.headers.length === 0) {
    sheetState.headers = [
      "FECHA_ENROLAMIENTO", "DOCUMENTO_EMITIDO", "REGION", "UNIDAD",
      "CUARTEL_NEW", "EQUIPO", "GENERO", "EDADES",
      "EDAD_1", "SINCRONIZACION_PDI", "REGISTRACION_BIOMETRICA", "ESTADO_GENERAL"
    ];
  }
  const emptyRow = new Array(sheetState.headers.length).fill("");
  sheetState.rows.unshift(emptyRow);
  renderSpreadsheetGrid();
}

function submitSpreadsheetIngest() {
  if (!sheetState.rows || sheetState.rows.length === 0) {
    alert("No hay filas cargadas en la hoja de cálculo.");
    return;
  }
  if (!sheetState.headers || sheetState.headers.length === 0) {
    alert("No se han definido cabeceras válidas.");
    return;
  }

  promptAuthModal({
    headers: sheetState.headers,
    rows: sheetState.rows
  }, "sheet_ingest");
}

async function executeSheetIngestAuthorized(sheetData, clave) {
  const modal = document.getElementById("modal-auth-ingesta");
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const claveInput = document.getElementById("input-auth-clave");
  const feedbackDiv = document.getElementById("sheet-ingest-feedback");

  try {
    const res = await fetch("/api/ingest/sheet", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ingesta-Auth": clave,
      },
      body: JSON.stringify({
        headers: sheetData.headers,
        rows: sheetData.rows,
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
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <span>Autorizar e Ingestar en BD</span>
        `;
      }
      if (claveInput) {
        claveInput.select();
        claveInput.focus();
      }
      return;
    }

    closeAuthModal();

    if (feedbackDiv) feedbackDiv.style.display = "block";

    if (res.ok && data.ok) {
      if (feedbackDiv) {
        feedbackDiv.innerHTML = `
          <div class="alert alert-success">
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" style="stroke:var(--status-success);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <strong style="font-size:1.02rem;">Ingesta desde Hoja de Cálculo Auditada e Insertada Exitosamente</strong>
              </div>
              <div style="margin-top:8px; line-height:1.65;">
                &bull; <strong>Modo de Carga:</strong> <span class="badge badge-success">Portapapeles Directo Oracle DB / Excel</span><br>
                &bull; <strong>Filas Procesadas:</strong> <strong>${(data.totalMapeadas || sheetData.rows.length).toLocaleString()}</strong> recibidas &bull; <strong>${(data.totalInsertadas || 0).toLocaleString()}</strong> insertadas en PostgreSQL<br>
                &bull; <strong>Inconsistencias Registradas:</strong> ${data.erroresFilas || 0}<br>
                &bull; <strong>Tiempo de Inserción:</strong> ${((data.duracionMs || 0) / 1000).toFixed(2)} segundos<br>
                &bull; <strong>Huella Criptográfica SHA-256:</strong> <code>${data.hashSHA256}</code><br>
                &bull; <strong>Auditoría:</strong> Evento <code>INGESTA_PORTAPAPELES_AUTORIZADA</code> registrado en la bitácora inmutable.
              </div>
            </div>
          </div>
        `;
      }

      clearSpreadsheetData();

      await loadAvailableDates();
      await loadMetrics();
      await loadTrendData();
      await checkSystemHealth();
      if (typeof cargarBitacoraAuditoria === "function") {
        cargarBitacoraAuditoria();
      }
    } else {
      if (feedbackDiv) {
        feedbackDiv.innerHTML = `
          <div class="alert alert-error">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
              <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" style="stroke:#ef4444;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <strong>Error en la Ingesta de Hoja de Cálculo:</strong>
            </div>
            ${data.error || "Ocurrió un error al procesar las filas."}
          </div>
        `;
      }
    }
  } catch (err) {
    closeAuthModal();
    if (feedbackDiv) {
      feedbackDiv.style.display = "block";
      feedbackDiv.innerHTML = `
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
