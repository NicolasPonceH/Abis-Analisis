import { state } from '../core/state.js';

export const BKLIT_TOOLTIP = {
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

export const bklitDataLabelsPlugin = {
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

export function renderHorizontalBarChart(canvasId, items) {
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

export function renderDoughnutChart(canvasId, items, colors) {
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

export function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    delete state.charts[name];
  }
}

