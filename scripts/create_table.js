const { Pool } = require("pg");
require("dotenv").config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduler_config (
        id SERIAL PRIMARY KEY,
        config_key VARCHAR(50) UNIQUE NOT NULL,
        config_value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("OK");
  } catch(e){
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
