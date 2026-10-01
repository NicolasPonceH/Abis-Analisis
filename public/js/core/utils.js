export function escapeHtml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function escaparHtml(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function animateValue(id, endValue) {
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

export function formatChartLabel(str, maxLen = 14) {
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

export function getVerticalGradient(ctx, colorTop, colorBottom, height = 280) {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, colorTop);
  g.addColorStop(1, colorBottom);
  return g;
}

export function getHorizontalGradient(ctx, colorLeft, colorRight, width = 360) {
  const g = ctx.createLinearGradient(0, 0, width, 0);
  g.addColorStop(0, colorLeft);
  g.addColorStop(1, colorRight);
  return g;
}

