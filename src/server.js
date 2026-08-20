require("dotenv").config();
const express = require("express");
const pool = require("./db");
const { obtenerReporteDiario } = require("./reportes/reporteDiario");

const app = express();
const port = process.env.PORT || 3000;

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", db: "disconnected", message: err.message });
  }
});

// Sprint 5: data del reporte diario (no el mensaje de Telegram formateado, eso es Sprint 6-7).
// Sin ?fecha=, usa la fecha de enrolamiento mas reciente que haya en la base.
app.get("/reporte-diario", async (req, res) => {
  try {
    let { fecha } = req.query;
    if (fecha && !FECHA_VALIDA.test(fecha)) {
      return res.status(400).json({ error: "fecha invalida, usar formato YYYY-MM-DD" });
    }
    if (!fecha) {
      const { rows } = await pool.query(
        "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS fecha FROM registro_enrolamiento"
      );
      fecha = rows[0].fecha;
      if (!fecha) return res.json({ fecha: null, total: 0, mensaje: "No hay registros cargados" });
    }
    const reporte = await obtenerReporteDiario(pool, fecha);
    res.json(reporte);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Sistema ABIS escuchando en http://localhost:${port}`);
});
