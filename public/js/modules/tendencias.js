import { state, CHART_PALETTE } from '../core/state.js';
import { BKLIT_TOOLTIP, destroyChart } from '../components/charts.js';

export async function loadTrendData() {
  try {
    const res = await fetch("/api/metricas/tendencia");
    const data = await res.json();
    state.trendData = Array.isArray(data) ? data : [];
    updateTrendView();
  } catch (err) {
    console.error("Error al cargar tendencia:", err);
  }
}

export function updateTrendView() {
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

export function renderTrendChart(items, canvasId = "chart-tendencia-historica") {
  if (typeof Chart === "undefined") return;
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

  const showPointLabels = true; // Forzar a mostrar siempre los números

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

export function renderTrendTable(items) {
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

export function configureTrendCalendar() {
  const cal = document.getElementById("trend-calendar-picker");
  if (!cal || !state.trendData || state.trendData.length === 0) return;

  const fechas = state.trendData.map((d) => d.fecha).sort();
  cal.min = fechas[0];
  cal.max = fechas[fechas.length - 1];
}

export function setupTrendControls() {
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

export function exportTrendCsv() {
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
