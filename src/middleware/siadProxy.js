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
      res.status(502).send("El módulo de Análisis Documental no está disponible.");
    });

    if (["POST", "PUT", "PATCH"].includes(req.method)) req.pipe(proxyReq);
    else proxyReq.end();
  };
}

module.exports = { createSiadProxy };
