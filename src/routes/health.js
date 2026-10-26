function registerHealthRoutes(app, { pool }) {
  app.get("/health", async (_req, res) => {
    try {
      const { rows } = await pool.query("SELECT count(*) AS total FROM registro_enrolamiento");
      return res.json({
        status: "ok",
        db: "connected",
        totalRegistros: Number(rows[0].total),
        pool: pool.getPoolStatus(),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return res.status(500).json({
        status: "error",
        db: "disconnected",
        message: err.message,
        pool: pool.getPoolStatus ? pool.getPoolStatus() : null,
      });
    }
  });

  app.get("/api/db/pool", (_req, res) => res.json({
    ok: true,
    pool: pool.getPoolStatus(),
    timestamp: new Date().toISOString(),
  }));
}

module.exports = { registerHealthRoutes };
