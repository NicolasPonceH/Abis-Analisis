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
  charts: {},
};

// Paleta de colores ejecutiva institucional para Chart.js (Fondo claro / Alto contraste)
const CHART_PALETTE = {
  navy: "#002B49",
  navyLight: "#0A4A7A",
  blue: "#2563EB",
  blueLight: "#60A5FA",
  blueSubtle: "rgba(37, 99, 235, 0.12)",
  emerald: "#059669",
  emeraldLight: "#34D399",
  emeraldSubtle: "rgba(5, 150, 105, 0.12)",
  amber: "#D97706",
  amberLight: "#FBBF24",
  amberSubtle: "rgba(217, 119, 6, 0.12)",
  crimson: "#DC2626",
  crimsonLight: "#F87171",
  crimsonSubtle: "rgba(220, 38, 38, 0.12)",
  gold: "#C69214",
  goldLight: "#F5CF53",
  indigo: "#4F46E5",
  purple: "#7C3AED",
  teal: "#0D9488",
  cyan: "#0284C7",
  slate: "#64748B",
  gridColor: "rgba(203, 213, 225, 0.45)",
  textColor: "#334155",
  nations: [
    "#002B49", "#0284C7", "#059669", "#7C3AED", "#D97706",
    "#2563EB", "#0D9488", "#DC2626", "#4F46E5", "#C69214"
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

  // Botones de presets rápidos
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
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

  // Botón de imprimir informe
  const btnPrint = document.getElementById("btn-print");
  if (btnPrint) {
    btnPrint.addEventListener("click", () => window.print());
  }

  // Inicializar herramientas web criptográficas (Sin terminal)
  setupCryptoWebTools();
}

// Verifica el estado del backend y la base de datos
async function checkSystemHealth() {
  try {
    const res = await fetch("/health");
    const data = await res.json();
    const badgeEl = document.getElementById("db-status-badge");
    if (badgeEl && data.status === "ok") {
      badgeEl.innerHTML = `<span class="status-dot"></span> PostgreSQL Conectado (${(data.totalRegistros || 0).toLocaleString()} reg.)`;
      badgeEl.classList.add("connected");
    }
  } catch (err) {
    console.error("Error en health check:", err);
    const badgeEl = document.getElementById("db-status-badge");
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="status-dot" style="background:#dc2626;box-shadow:0 0 8px #dc2626;"></span> Desconectado`;
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

// Renderizado de gráficos con Chart.js
function renderCharts(data) {
  // Configuración global de Chart.js para fondo claro profesional
  Chart.defaults.color = CHART_PALETTE.textColor;
  Chart.defaults.borderColor = CHART_PALETTE.gridColor;
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  Chart.defaults.font.size = 12;

  // 1. Matriz de Rendimiento por Cuartel (Barras apiladas / agrupadas: Sincronizados vs Errores)
  renderCuartelesRendimientoChart(data);

  // 2. Gráfico de Nacionalidades (Horizontal Bar)
  renderHorizontalBarChart(
    "chart-nacionalidades",
    data.nacionalidadesPrincipales || []
  );

  // 3. Gráfico de Estados de Sincronización (Donut)
  renderDoughnutChart(
    "chart-sincronizacion",
    data.sincronizacion || [],
    [CHART_PALETTE.emerald, CHART_PALETTE.crimson, CHART_PALETTE.amber, CHART_PALETTE.cyan]
  );

  // 4. Demografía Cruzada (Pirámide de Género vs Adultos / N.N.A.)
  renderDemografiaCruzadaChart(data.demografiaCruzada || [], data.genero || []);

  // 5. Gráfico de Edad / N.N.A.
  renderEdadChart("chart-edad", data.edad || []);
}

function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    delete state.charts[name];
  }
}

// Gráfico 1: Rendimiento por Cuartel (Sincronizados vs Con Error)
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
          label: "Sincronizados PDI (Exitosos)",
          data: sincronizados,
          backgroundColor: CHART_PALETTE.emerald,
          borderRadius: 4,
          maxBarThickness: 32,
        },
        {
          label: "Con Error de Sincronización",
          data: conError,
          backgroundColor: CHART_PALETTE.crimson,
          borderRadius: 4,
          maxBarThickness: 32,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { boxWidth: 12, padding: 14 } },
        tooltip: {
          callbacks: {
            footer: (tooltipItems) => {
              const idx = tooltipItems[0].dataIndex;
              const totalCuartel = items[idx]?.total || 0;
              const tasa = items[idx]?.tasaExito || 100;
              return `Total Cuartel: ${totalCuartel.toLocaleString()} (${tasa}% éxito)`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 35, minRotation: 0 },
        },
        y: {
          grid: { color: CHART_PALETTE.gridColor },
          beginAtZero: true,
        },
      },
    },
  });
}

// Gráfico 2: Nacionalidades (Barra horizontal profesional)
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
        borderRadius: 5,
        maxBarThickness: 24,
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
            label: (ctx) => ` Total: ${ctx.raw.toLocaleString()} (${topItems[ctx.dataIndex]?.porcentaje}%)`,
          },
        },
      },
      scales: {
        x: { grid: { color: CHART_PALETTE.gridColor } },
        y: { grid: { display: false } },
      },
    },
  });
}

// Gráfico 3: Sincronización Donut
function renderDoughnutChart(canvasId, items, colors) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return;

  const labels = items.map((i) => i.descripcion);
  const values = items.map((i) => i.total);

  state.charts[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, items.length),
        borderWidth: 2,
        borderColor: "#ffffff",
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw.toLocaleString()} (${items[ctx.dataIndex]?.porcentaje}%)`,
          },
        },
      },
      cutout: "70%",
    },
  });
}

// Gráfico 4: Demografía Cruzada (Adultos vs Menores N.N.A. por Sexo)
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
          label: "Adultos (&ge; 18)",
          data: [mascAdultos, femAdultos],
          backgroundColor: CHART_PALETTE.blue,
          borderRadius: 4,
          maxBarThickness: 36,
        },
        {
          label: "Menores N.N.A. (0-17)",
          data: [mascMenores, femMenores],
          backgroundColor: CHART_PALETTE.amber,
          borderRadius: 4,
          maxBarThickness: 36,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { boxWidth: 12, padding: 12 } },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: CHART_PALETTE.gridColor }, beginAtZero: true },
      },
    },
  });
}

// Gráfico 5: Grupo Etario
function renderEdadChart(canvasId, items) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return;

  const labels = items.map((i) => i.categoria);
  const values = items.map((i) => i.total);

  state.charts[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [CHART_PALETTE.navy, CHART_PALETTE.amber],
        borderWidth: 2,
        borderColor: "#ffffff",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, padding: 10 } },
      },
      cutout: "65%",
    },
  });
}

// Carga de la serie histórica de tendencias
async function loadTrendData() {
  try {
    const res = await fetch("/api/metricas/tendencia");
    const data = await res.json();
    state.trendData = data;
    renderTrendChart(data);
  } catch (err) {
    console.error("Error al cargar tendencia:", err);
  }
}

// Gráfico de Tendencia Histórica Profesional
function renderTrendChart(items) {
  destroyChart("chart-tendencia-historica");
  const ctx = document.getElementById("chart-tendencia-historica")?.getContext("2d");
  if (!ctx || !items || items.length === 0) return;

  const labels = items.map((i) => i.fecha);
  const totalData = items.map((i) => i.total);
  const sincData = items.map((i) => i.sincronizados);
  const errData = items.map((i) => i.con_error);

  state.charts["chart-tendencia-historica"] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Total Enrolamientos",
          data: totalData,
          borderColor: CHART_PALETTE.navy,
          backgroundColor: "rgba(0, 43, 73, 0.08)",
          fill: true,
          tension: 0.3,
          borderWidth: 2.5,
          pointRadius: 2,
          pointHoverRadius: 6,
        },
        {
          label: "Sincronizados PDI",
          data: sincData,
          borderColor: CHART_PALETTE.emerald,
          borderDash: [4, 4],
          borderWidth: 2,
          pointRadius: 1,
          tension: 0.25,
        },
        {
          label: "Con Error",
          data: errData,
          borderColor: CHART_PALETTE.crimson,
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { boxWidth: 14, padding: 16 } },
      },
      scales: {
        x: { grid: { color: "rgba(203, 213, 225, 0.3)" } },
        y: { grid: { color: CHART_PALETTE.gridColor } },
      },
    },
  });
}

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

// Variable para retener el archivo en espera de autorización
let pendingUploadFile = null;

// Abre el modal de seguridad solicitando clave institucional
function promptAuthModal(file) {
  pendingUploadFile = file;

  const modal = document.getElementById("modal-auth-ingesta");
  const fileNameEl = document.getElementById("modal-file-name");
  const fileDetailsEl = document.getElementById("modal-file-details");
  const claveInput = document.getElementById("input-auth-clave");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");

  if (!modal) return;

  if (fileNameEl) fileNameEl.textContent = file.name;
  if (fileDetailsEl) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(2);
    const tipoDesc = file.name.toLowerCase().endsWith(".enc")
      ? "Archivo Cifrado AES-256-GCM"
      : "Planilla Excel (Oracle ABIS)";
    fileDetailsEl.textContent = `${sizeMb} MB • ${tipoDesc}`;
  }

  if (claveInput) {
    claveInput.value = "";
    claveInput.type = "password";
  }
  if (errorMsg) errorMsg.style.display = "none";
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = `
      <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
      <span>Autorizar y Poblar BD</span>
    `;
  }

  modal.style.display = "flex";
  setTimeout(() => {
    if (claveInput) claveInput.focus();
  }, 100);
}

// Cierra el modal de autorización
function closeAuthModal() {
  const modal = document.getElementById("modal-auth-ingesta");
  if (modal) modal.style.display = "none";
  pendingUploadFile = null;
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

// Procesa la confirmación de autorización
async function confirmAuthorizedUpload() {
  if (!pendingUploadFile) {
    closeAuthModal();
    return;
  }

  const claveInput = document.getElementById("input-auth-clave");
  const errorMsg = document.getElementById("modal-auth-error");
  const confirmBtn = document.getElementById("btn-modal-auth-confirm");
  const modalDialog = document.querySelector("#modal-auth-ingesta .modal-dialog");

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

  await handleFileUpload(pendingUploadFile, clave);
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

    alert(`✅ ${data.mensaje}`);
  } catch (err) {
    console.error("Error enviando reporte a Telegram:", err);
    alert(`❌ No se pudo enviar el reporte a Telegram: ${err.message}`);
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
  }

  if (btnRunEncrypt) {
    btnRunEncrypt.addEventListener("click", async () => {
      if (!selectedEncryptFile) return;
      const originalText = btnRunEncrypt.innerHTML;
      try {
        btnRunEncrypt.disabled = true;
        btnRunEncrypt.innerHTML = `<span>Cifrando con AES-256-GCM...</span>`;
        feedbackEncrypt.style.display = "none";

        const formData = new FormData();
        formData.append("archivo", selectedEncryptFile);

        const res = await fetch("/api/security/cifrar", {
          method: "POST",
          body: formData,
        });

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
        a.download = `${selectedEncryptFile.name}.enc`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        feedbackEncrypt.className = "crypto-feedback-box success";
        feedbackEncrypt.style.display = "block";
        feedbackEncrypt.innerHTML = `
          <strong>🛡️ Archivo Blindado con Éxito</strong><br>
          Se descargó <code>${selectedEncryptFile.name}.enc</code>.<br>
          <small>• Huella SHA-256 Original: <code>${hashOriginal.substring(0, 16)}...</code><br>
          • Huella SHA-256 Cifrada: <code>${hashCifrado.substring(0, 16)}...</code><br>
          • Algoritmo: AES-256-GCM (Auth Tag 128-bit)</small>
        `;
      } catch (err) {
        console.error("Error cifrando archivo web:", err);
        feedbackEncrypt.className = "crypto-feedback-box error";
        feedbackEncrypt.style.display = "block";
        feedbackEncrypt.innerHTML = `<strong>❌ Error al cifrar:</strong> ${err.message}`;
      } finally {
        btnRunEncrypt.disabled = false;
        btnRunEncrypt.innerHTML = originalText;
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
  }

  if (btnRunDecrypt) {
    btnRunDecrypt.addEventListener("click", async () => {
      if (!selectedDecryptFile) return;
      const originalText = btnRunDecrypt.innerHTML;
      try {
        btnRunDecrypt.disabled = true;
        btnRunDecrypt.innerHTML = `<span>Descifrando y validando...</span>`;
        feedbackDecrypt.style.display = "none";

        const formData = new FormData();
        formData.append("archivo", selectedDecryptFile);

        const res = await fetch("/api/security/descifrar", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Fallo en el descifrado: integridad inválida.");
        }

        const hashDescifrado = res.headers.get("X-Hash-Descifrado") || "N/D";
        const downloadName = selectedDecryptFile.name.replace(/\.enc$/i, "") || "archivo_descifrado.xlsx";

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        a.remove();

        feedbackDecrypt.className = "crypto-feedback-box success";
        feedbackDecrypt.style.display = "block";
        feedbackDecrypt.innerHTML = `
          <strong>🔓 Integridad Validada & Descifrado Correcto</strong><br>
          Se descargó el archivo original <code>${downloadName}</code>.<br>
          <small>• Verificación de Integridad: <strong>VÁLIDA (100% inalterado)</strong><br>
          • Huella SHA-256 Descifrada: <code>${hashDescifrado.substring(0, 16)}...</code><br>
          • Autenticación AEAD: Exitosa (Clave PDI verificada)</small>
        `;
      } catch (err) {
        console.error("Error descifrando archivo web:", err);
        feedbackDecrypt.className = "crypto-feedback-box error";
        feedbackDecrypt.style.display = "block";
        feedbackDecrypt.innerHTML = `<strong>❌ Error de Descifrado:</strong> ${err.message}`;
      } finally {
        btnRunDecrypt.disabled = false;
        btnRunDecrypt.innerHTML = originalText;
      }
    });
  }
}
