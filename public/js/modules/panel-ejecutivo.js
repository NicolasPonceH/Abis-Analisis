import { state, CHART_PALETTE } from '../core/state.js';
import { escapeHtml, animateValue, formatChartLabel } from '../core/utils.js';
import { BKLIT_TOOLTIP, renderHorizontalBarChart, renderDoughnutChart, destroyChart } from '../components/charts.js';

export let profesionChartMode = "fecha";

export async function loadMetrics() {
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

export function updateFilterInputsVisibility() {
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

export function applyPreset(preset) {
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

export function updateFilterSummary(data) {
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

export function renderExecutiveBanner(data) {
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

export function renderKPIs(data) {
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

export function updateChartBadges(data) {
  const total = Number(data.total) || 0;

  // 1. Cuarteles
  const badgeCuarteles = document.getElementById("badge-chart-cuarteles");
  if (badgeCuarteles) {
    const cuarteles = data.rendimientoCuarteles || [];
    const sinc = cuarteles.reduce((acc, c) => acc + (Number(c.sincronizados) || 0), 0);
    const err = cuarteles.reduce((acc, c) => acc + (Number(c.conError) || 0), 0);
    badgeCuarteles.innerHTML = `${cuarteles.length} Cuarteles &bull; <strong style="color:#059669;">${sinc.toLocaleString("es-CL")} OK</strong> &bull; <strong style="color:#dc2626;">${err.toLocaleString("es-CL")} Error</strong>`;
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
    badgeSinc.innerHTML = `<strong style="color:#059669;">${Number(sincOk).toLocaleString("es-CL")} OK</strong> &bull; <strong style="color:#dc2626;">${Number(errOk).toLocaleString("es-CL")} Error</strong> (${pct}% SLA)`;
  }

  // 4. Demografía Cruzada
  const badgeDemo = document.getElementById("badge-chart-demografia-cruzada");
  if (badgeDemo) {
    let masc = 0, fem = 0;
    (data.genero || []).forEach(g => {
      if (String(g.genero).toUpperCase().startsWith("M")) masc = Number(g.total) || 0;
      if (String(g.genero).toUpperCase().startsWith("F")) fem = Number(g.total) || 0;
    });
    badgeDemo.innerHTML = `${masc.toLocaleString("es-CL")} Hombres &bull; ${fem.toLocaleString("es-CL")} Mujeres`;
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

export function renderCharts(data) {
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

export function renderCuartelesRendimientoChart(data) {
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

export function renderDemografiaCruzadaChart(demografia, generoFallback) {
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

export function renderEdadChart(canvasId, items) {
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

export function renderDispositivosChart(items) {
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

export function renderRegionesChart(items) {
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

export function renderTramosEtariosChart(items) {
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

export function initProfesionChartControls() {
  const btnFecha = document.getElementById("btn-prof-fecha");
  const btnTotal = document.getElementById("btn-prof-total");
  const btnSwitch = document.getElementById("btn-prof-switch-total");

  if (btnFecha && !btnFecha.dataset.bound) {
    btnFecha.dataset.bound = "true";
    btnFecha.addEventListener("click", () => {
      profesionChartMode = "fecha";
      updateProfesionToggleUI();
      loadAndRenderProfesionesChart();
    });
  }

  if (btnTotal && !btnTotal.dataset.bound) {
    btnTotal.dataset.bound = "true";
    btnTotal.addEventListener("click", () => {
      profesionChartMode = "total";
      updateProfesionToggleUI();
      loadAndRenderProfesionesChart();
    });
  }

  if (btnSwitch && !btnSwitch.dataset.bound) {
    btnSwitch.dataset.bound = "true";
    btnSwitch.addEventListener("click", () => {
      profesionChartMode = "total";
      updateProfesionToggleUI();
      loadAndRenderProfesionesChart();
    });
  }
}

export function updateProfesionToggleUI() {
  const btnFecha = document.getElementById("btn-prof-fecha");
  const btnTotal = document.getElementById("btn-prof-total");
  if (btnFecha && btnTotal) {
    if (profesionChartMode === "fecha") {
      btnFecha.style.background = "#ffd100";
      btnFecha.style.color = "#00234c";
      btnTotal.style.background = "rgba(255, 209, 0, 0.15)";
      btnTotal.style.color = "rgba(255, 209, 0, 0.9)";
    } else {
      btnTotal.style.background = "#ffd100";
      btnTotal.style.color = "#00234c";
      btnFecha.style.background = "rgba(255, 209, 0, 0.15)";
      btnFecha.style.color = "rgba(255, 209, 0, 0.9)";
    }
  }
}

export async function loadAndRenderProfesionesChart() {
  initProfesionChartControls();
  updateProfesionToggleUI();

  try {
    let url = `/api/metricas/profesiones?limit=500&agrupar=${profesionChartMode === "total"}`;
    if (profesionChartMode === "fecha") {
      if (state.filterMode === "single" && state.currentDate) {
        url += `&fecha=${encodeURIComponent(state.currentDate)}`;
      } else if (state.filterMode === "range" && state.dateFrom && state.dateTo) {
        url += `&desde=${encodeURIComponent(state.dateFrom)}&hasta=${encodeURIComponent(state.dateTo)}`;
      }
    }
    const res = await fetch(url);
    const data = await res.json();
    renderProfesionesChart(data);
  } catch (err) {
    console.error("Error al cargar profesiones:", err);
  }
}

export function getProfesionIcon(profesion) {
  if (!profesion) return "\uf068"; // minus
  const p = profesion.toUpperCase();
  if (p.includes("COMERCIO") || p.includes("VENTAS") || p.includes("VENDEDOR")) return "\uf54e"; // store
  if (p.includes("ESTUDIANTE")) return "\uf19d"; // user-graduate
  if (p.includes("ALBAÑIL") || p.includes("CONSTRUCCION") || p.includes("CONSTRUCCIÓN")) return "\uf818"; // trowel-bricks
  if (p.includes("TRANSPORTE") || p.includes("LOGÍSTICA") || p.includes("CHOFER") || p.includes("CONDUCTOR")) return "\uf0d1"; // truck
  if (p.includes("AGRICULTURA") || p.includes("TEMPORERO") || p.includes("CAMPESINO")) return "\uf722"; // tractor
  if (p.includes("MECÁNICA") || p.includes("AUTOMOTRIZ") || p.includes("MECANICO")) return "\uf0ad"; // wrench
  if (p.includes("HOGAR") || p.includes("DUEÑA DE CASA")) return "\uf015"; // home
  if (p.includes("GASTRONOMÍA") || p.includes("ALIMENTOS") || p.includes("COCIN") || p.includes("CHEF")) return "\uf2e7"; // utensils
  if (p.includes("OPERARIO") || p.includes("OBRERO")) return "\uf805"; // hard-hat
  if (p.includes("ESTÉTICA") || p.includes("BELLEZA") || p.includes("PELUQUER")) return "\uf0c4"; // scissors
  if (p.includes("ADMINISTRACIÓN") || p.includes("OFICINA") || p.includes("CONTADOR")) return "\uf1ec"; // calculator
  if (p.includes("SALUD") || p.includes("MEDICO") || p.includes("ENFERMER")) return "\uf0f1"; // stethoscope
  if (p.includes("SEGURIDAD") || p.includes("GUARDIA")) return "\uf3ed"; // shield-halved
  if (p.includes("LIMPIEZA") || p.includes("ASEO") || p.includes("ASESORA")) return "\uf51a"; // broom
  if (p.includes("INDEPENDIENTE") || p.includes("EMPRESARIO")) return "\uf0b1"; // briefcase
  if (p.includes("EDUCACIÓN") || p.includes("PROFESOR") || p.includes("DOCENTE")) return "\uf51c"; // chalkboard-user
  if (p.includes("INGENIERÍA") || p.includes("INGENIERO")) return "\uf085"; // cogs
  if (p.includes("TÉCNICO") || p.includes("TECNICO")) return "\uf7d9"; // tools
  if (p.includes("JUBILADO") || p.includes("PENSIONADO")) return "\uf007"; // user
  if (p.includes("CESANTE") || p.includes("OCUPACIÓN") || p.includes("DESEMPLEADO")) return "\uf068"; // minus
  if (p.includes("NO ESPECIFICADO")) return "\uf007"; // user
  return "\uf0b1"; // default briefcase
}

export function renderProfesionesChart(data) {
  destroyChart("chart-profesiones");
  const canvas = document.getElementById("chart-profesiones");
  const emptyState = document.getElementById("profesiones-empty-state");
  const badge = document.getElementById("badge-chart-profesiones");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const items = data.profesiones || [];

  if (badge) {
    if (profesionChartMode === "total") {
      badge.textContent = `Acumulado General (${(data.totalConProfesion || 0).toLocaleString()} identificados)`;
      badge.style.background = "#ffd100";
      badge.style.color = "#001733";
      badge.style.border = "1px solid rgba(255, 209, 0, 0.6)";
    } else if (data.totalConProfesion > 0) {
      badge.textContent = `${data.totalConProfesion.toLocaleString()} con ocupación declarada`;
      badge.style.background = "#ffd100";
      badge.style.color = "#001733";
      badge.style.border = "1px solid rgba(255, 209, 0, 0.6)";
    } else {
      badge.textContent = "0 con profesión en esta fecha";
      badge.style.background = "rgba(255,255,255,0.05)";
      badge.style.color = "rgba(255,255,255,0.6)";
      badge.style.border = "1px solid rgba(255,255,255,0.2)";
    }
  }

  if (items.length === 0) {
    canvas.style.display = "none";
    if (emptyState) {
      emptyState.style.display = "flex";
      const title = document.getElementById("profesiones-empty-title");
      if (title && state.currentDate) {
        title.textContent = `Sin registros de profesión para el ${state.currentDate}`;
      }
    }
    return;
  }

  // Hay items para mostrar
  canvas.style.display = "block";
  if (emptyState) emptyState.style.display = "none";

  const isGlobal = profesionChartMode === "total";
  const chartContainer = canvas.parentElement;

  // Ajustar altura del contenedor dinámicamente si hay muchos ítems (siempre horizontal)
  if (items.length > 8) {
    chartContainer.style.height = `${items.length * 22 + 40}px`; 
  } else {
    chartContainer.style.height = "280px";
  }

  const labels = items.map((i) => {
    const icon = getProfesionIcon(i.profesion);
    const formatted = formatChartLabel(i.profesion, 22);
    if (Array.isArray(formatted)) {
      return [icon + " " + formatted[0], ...formatted.slice(1)];
    }
    return icon + " " + formatted;
  });
  const values = items.map((i) => i.total);

  // Configuraciones de ejes dinámicas según la orientación
  const labelTicksConfig = { 
    color: "#475569", 
    font: { family: "'Font Awesome 6 Free', 'Open Sans', sans-serif", weight: "600", size: 11.5 },
    autoSkip: false, // Forzar que NUNCA se oculten etiquetas, ni en global ni en día
    maxRotation: 0,
    minRotation: 0
  };

  const valueTicksConfig = { color: "#64748b", font: { family: "'Open Sans', sans-serif", size: 11 }, precision: 0 };
  const valueGridConfig = { color: "rgba(226, 232, 240, 0.6)", borderDash: [4, 4] };

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
          const isHoriz = chart.options.indexAxis === "y";
          const g = isHoriz 
            ? c.createLinearGradient(chartArea.left, 0, chartArea.right, 0)
            : c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          g.addColorStop(0, "rgba(2, 132, 199, 0.7)");
          g.addColorStop(1, "rgba(2, 132, 199, 0.95)");
          return g;
        },
        hoverBackgroundColor: "#0284c7",
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 14,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 0, right: 30 }
      },
      plugins: {
        legend: { display: false },
        bklitDataLabels: {
          display: true 
        },
        tooltip: {
          titleFont: { family: "'Font Awesome 6 Free', 'Open Sans', sans-serif", weight: "900", size: 13 },
          bodyFont: { family: "'Open Sans', sans-serif", size: 12 },
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
          grid: valueGridConfig,
          border: { display: false },
          ticks: valueTicksConfig,
          beginAtZero: true,
        },
        y: {
          grid: { display: false },
          border: undefined,
          ticks: labelTicksConfig,
          beginAtZero: true,
        }
      }
    }
  });
}

export async function cargarComparacionPeriodos(tipo) {
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

export function renderDataTable(data) {
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
          <td><strong>${escapeHtml(r.cuartel)}</strong></td>
          <td><span class="badge badge-info">${escapeHtml(r.unidad)}</span></td>
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

export function filterTableRows(query) {
  document.querySelectorAll(".table-row-item").forEach((row) => {
    const text = row.innerText.toLowerCase();
    row.style.display = text.includes(query) ? "" : "none";
  });
}

