require("dotenv").config();
const { Pool } = require("pg");

/**
 * Configuración Robusta del Connection Pool de PostgreSQL para Sistema ABIS
 * Optimizado para alta concurrencia, tolerancia a fallos, monitoreo en vivo y cero caídas.
 */
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  application_name: "Sistema_ABIS_PDI",
  options: "-c timezone=America/Santiago",
  
  // Capacidad del Pool
  max: parseInt(process.env.DB_POOL_MAX || "20", 10), // Máximo 20 conexiones simultáneas
  min: parseInt(process.env.DB_POOL_MIN || "4", 10),  // Mínimo 4 conexiones calientes en reposo
  
  // Tiempos de espera y ciclo de vida
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || "30000", 10), // 30s de ocio antes de cerrar
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONN_TIMEOUT || "5000", 10), // 5s timeout al conectar
  
  // Parámetros de seguridad y sesión
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || "45000", 10), // Cancela queries > 45s
  allowExitOnIdle: false,
};

const pool = new Pool(poolConfig);

// Evento Crítico: Manejo de errores en clientes inactivos (evita caídas del proceso Node.js)
pool.on("error", (err, client) => {
  console.error("⚠️ [DATABASE POOL ERROR] Error en cliente inactivo de PostgreSQL:", err.message);
  // El pool descarta automáticamente el socket muerto y crea uno nuevo cuando se requiera
});

// Helper de diagnóstico: Obtiene el estado y métricas en vivo del Connection Pool
function getPoolStatus() {
  const total = pool.totalCount || 0;
  const idle = pool.idleCount || 0;
  const waiting = pool.waitingCount || 0;
  const active = Math.max(total - idle, 0);

  return {
    estado: "activo",
    totalConexiones: total,
    conexionesActivas: active,
    conexionesLibres: idle,
    peticionesEnEspera: waiting,
    configuracion: {
      maxConexiones: pool.options?.max || poolConfig.max,
      minConexiones: pool.options?.min || poolConfig.min,
      idleTimeoutMs: pool.options?.idleTimeoutMillis || poolConfig.idleTimeoutMillis,
      connectionTimeoutMs: pool.options?.connectionTimeoutMillis || poolConfig.connectionTimeoutMillis,
    },
    salud: waiting > 5 ? "saturado" : active >= (pool.options?.max || 20) * 0.9 ? "alto_consumo" : "optimo",
  };
}

// Compatibilidad total hacia atrás (export default + métodos adjuntos)
pool.getPoolStatus = getPoolStatus;
module.exports = pool;
module.exports.pool = pool;
module.exports.getPoolStatus = getPoolStatus;
