// Smoke/benchmark ABIS de solo lectura. No arranca SIAD, Telegram ni el scheduler.
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const jwt = require("jsonwebtoken");
const pool = require("../src/db");

const rounds = Number(process.env.ABIS_BENCHMARK_ROUNDS || 4);
const concurrency = Number(process.env.ABIS_BENCHMARK_CONCURRENCY || 2);

function percentile(values, percent) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * percent) - 1)];
}

function isoDateDaysBefore(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  assert.ok(process.env.SECRET_KEY, "Falta SECRET_KEY para autenticar el benchmark HTTP.");
  assert.ok(Number.isInteger(rounds) && rounds >= 2 && rounds <= 20, "ABIS_BENCHMARK_ROUNDS debe estar entre 2 y 20.");
  assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 5, "ABIS_BENCHMARK_CONCURRENCY debe estar entre 1 y 5.");

  // Fuerza el modo de solo lectura en cada conexión que este pool abra.
  const options = pool.options.options || "";
  pool.options.options = `${options} -c default_transaction_read_only=on`.trim();
  let server;
  try {
    const { rows: [readOnly] } = await pool.query("SHOW default_transaction_read_only");
    assert.equal(readOnly.default_transaction_read_only, "on", "La sesión PostgreSQL no quedó en modo de solo lectura.");
    const { rows: [bounds] } = await pool.query(
      "SELECT count(*)::int AS total, to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS hasta FROM registro_enrolamiento"
    );
    assert.ok(bounds.hasta, "No hay registros para medir los endpoints de reportes.");

    const { app } = require("../src/app");
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = jwt.sign({ username: "benchmark", rol: "administrador" }, process.env.SECRET_KEY, { expiresIn: "5m" });
    const headers = { Cookie: `abis_auth=${token}` };
    const desde = isoDateDaysBefore(bounds.hasta, 30);
    const endpoints = [
      ["fechas", "/api/fechas"],
      ["diario", `/api/metricas?fecha=${bounds.hasta}`],
      ["rango-30d", `/api/metricas/rango?desde=${desde}&hasta=${bounds.hasta}`],
      ["tendencia", "/api/metricas/tendencia"],
      ["comparacion-semanal", "/api/metricas/comparar?tipo=semana"],
      ["profesiones", `/api/metricas/profesiones?fecha=${bounds.hasta}`],
    ];

    async function request(path) {
      const started = performance.now();
      const response = await fetch(base + path, { headers });
      const body = await response.arrayBuffer();
      assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
      return { ms: performance.now() - started, bytes: body.byteLength };
    }

    const output = [];
    for (const [name, path] of endpoints) {
      await request(path); // Warm-up: evita mezclar carga inicial del pool en las muestras.
      const samples = [];
      for (let offset = 0; offset < rounds; offset += concurrency) {
        const count = Math.min(concurrency, rounds - offset);
        samples.push(...await Promise.all(Array.from({ length: count }, () => request(path))));
      }
      output.push({
        endpoint: name,
        muestras: samples.length,
        msMediana: Number(percentile(samples.map(sample => sample.ms), 0.5).toFixed(1)),
        msP95: Number(percentile(samples.map(sample => sample.ms), 0.95).toFixed(1)),
        bytesMediana: Math.round(percentile(samples.map(sample => sample.bytes), 0.5)),
      });
    }
    console.log(JSON.stringify({
      postgres: "READ ONLY",
      registros: bounds.total,
      fechaUltimaJornada: bounds.hasta,
      concurrenciaMaxima: concurrency,
      endpoints: output,
    }));
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error("Benchmark ABIS fallido:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, percentile, isoDateDaysBefore };
