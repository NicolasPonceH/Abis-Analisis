const http = require("http");

function createSiadProxy({ env = process.env, httpClient = http, logger = console } = {}) {
  return (req, res) => {
    const siadUrl = env.SIAD_URL || "http://127.0.0.1:5001";
    const targetUrl = `${siadUrl}${req.url}`;
    const proxyReq = httpClient.request(targetUrl, {
      method: req.method,
      headers: {
        ...req.headers,
        host: new URL(siadUrl).host,
        "X-Forwarded-Prefix": "/analisis",
      },
    }, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", err => {
      logger.error("[PROXY SIAD ERROR]", err.message);
      if (req.headers.accept && req.headers.accept.includes("text/html")) {
        res.status(503).send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="2">
  <title>Iniciando SIAD - PDI</title>
  <style>
    body {
      margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #020b18; color: #f8fafc; text-align: center; padding: 20px;
    }
    .box {
      background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px; padding: 36px 32px; max-width: 440px; box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    }
    .spinner {
      width: 44px; height: 44px; border: 4px solid rgba(255, 209, 0, 0.2);
      border-top-color: #ffd100; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { margin: 0 0 10px; font-size: 20px; color: #fff; }
    p { margin: 0 0 20px; font-size: 14px; color: #94a3b8; line-height: 1.5; }
    .btn {
      display: inline-block; background: #ffd100; color: #001a3a; font-weight: 700;
      text-decoration: none; padding: 10px 22px; border-radius: 8px; font-size: 14px; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <h2>Conectando con Módulo SIAD</h2>
    <p>El servicio de Análisis Documental se está iniciando. Esta pantalla se actualizará automáticamente en 2 segundos...</p>
    <a href="${req.originalUrl || req.url}" class="btn" onclick="location.reload(); return false;">Reintentar ahora</a>
  </div>
</body>
</html>`);
      } else {
        res.status(502).json({ error: "El módulo de Análisis Documental no está disponible en este momento." });
      }
    });

    if (["POST", "PUT", "PATCH"].includes(req.method)) req.pipe(proxyReq);
    else proxyReq.end();
  };
}

module.exports = { createSiadProxy };
