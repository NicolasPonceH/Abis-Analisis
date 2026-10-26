// Un día sin personalización hereda las horas generales. [] significa sin envíos.
function getScheduleTimes(config, day) {
  if (!(config.days || []).includes(Number(day))) return [];
  const overrides = config.timesByDay || {};
  return Object.hasOwn(overrides, String(day)) ? overrides[day] : (config.times || []);
}

// Transformación pura: no escribe archivos, no consulta DB ni inicia el scheduler.
function mergeScheduleConfig(current, patch = {}) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  const supplied = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  const merged = { ...current, ...supplied };
  for (const key of ["enabled", "sendFourPhotosDaily"]) {
    if (merged[key] !== undefined && typeof merged[key] !== "boolean") fail(key + " debe ser booleano.");
  }
  if (!Array.isArray(merged.times) || merged.times.some(t => typeof t !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) {
    fail("Los horarios deben usar HH:MM (00:00 a 23:59).");
  }
  merged.times = [...new Set(merged.times)].sort();
  if (merged.timesByDay !== undefined) {
    const overrides = merged.timesByDay;
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      fail('Los horarios por día deben ser un objeto con días de 0 a 6.');
    }
    merged.timesByDay = {};
    for (const [day, times] of Object.entries(overrides)) {
      if (!/^[0-6]$/.test(day) || !Array.isArray(times) || times.some(time => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
        fail('Cada día debe estar entre 0 y 6 y sus horarios deben usar HH:MM.');
      }
      merged.timesByDay[day] = [...new Set(times)].sort();
    }
  }
  if (!Array.isArray(merged.days) || merged.days.some(d => d === "" || !Number.isInteger(Number(d)) || Number(d) < 0 || Number(d) > 6)) {
    fail("Los días deben ser enteros de 0 a 6.");
  }
  merged.days = [...new Set(merged.days.map(Number))].sort();
  if (!["extenso", "resumen"].includes(merged.reportType)) fail("Tipo de reporte inválido.");
  // ABIS despacha siempre el reporte institucional completo.
  merged.reportType = "extenso";
  if (merged.telegramChatId && !/^-?\d+$/.test(String(merged.telegramChatId))) fail("Chat ID inválido.");
  return merged;
}
module.exports = { mergeScheduleConfig, getScheduleTimes };
