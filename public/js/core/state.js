export const state = {
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

export const CHART_PALETTE = {
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

