require("dotenv").config();
const express = require("express");
const pool = require("./db");

const app = express();
const port = process.env.PORT || 3000;

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", db: "disconnected", message: err.message });
  }
});

app.listen(port, () => {
  console.log(`Sistema ABIS escuchando en http://localhost:${port}`);
});
