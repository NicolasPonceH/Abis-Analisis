// Rutas ABIS; se registran detrás del middleware de sesión del servidor.
const { withAuditActors } = require('../services/auditActors');
const { esFecha } = require('../reportes/reportSelection');
function registerMetricRoutes(app, { pool, FECHA_VALIDA, obtenerReporteDiario, obtenerReporteRango, obtenerFechasDisponibles, obtenerTendenciaHistorica, obtenerComparacionPeriodos }) {
  app.get("/api/fechas", async (req, res) => {
    try {
      const fechas = await obtenerFechasDisponibles(pool);
      res.json(fechas);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Endpoint de reporte diario (con o sin ?fecha=YYYY-MM-DD)
  app.get("/api/metricas", async (req, res) => {
    try {
      let { fecha } = req.query;
      if (fecha && !FECHA_VALIDA.test(fecha)) {
        return res.status(400).json({ error: "fecha invalida, usar formato YYYY-MM-DD" });
      }
      if (!fecha) {
        const { rows } = await pool.query(
          "SELECT to_char(max(fecha_enrolamiento), 'YYYY-MM-DD') AS fecha FROM registro_enrolamiento"
        );
        fecha = rows[0]?.fecha;
        if (!fecha) return res.json({ fecha: null, total: 0, mensaje: "No hay registros cargados" });
      }
      const reporte = await obtenerReporteDiario(pool, fecha);
      res.json(reporte);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Alias compatible hacia el endpoint original
  app.get("/reporte-diario", async (req, res) => {
    return res.redirect(`/api/metricas${req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""}`);
  });

  // Reporte agregado para un rango de fechas (?desde=YYYY-MM-DD&hasta=YYYY-MM-DD)
  app.get("/api/metricas/rango", async (req, res) => {
    try {
      const { desde, hasta } = req.query;
      if (!desde || !hasta || !FECHA_VALIDA.test(desde) || !FECHA_VALIDA.test(hasta)) {
        return res.status(400).json({ error: "Parámetros 'desde' y 'hasta' requeridos en formato YYYY-MM-DD" });
      }
      const reporte = await obtenerReporteRango(pool, desde, hasta);
      res.json(reporte);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Serie de tiempo histórica para gráficos de evolución y tendencia
  app.get("/api/metricas/tendencia", async (req, res) => {
    try {
      const tendencia = await obtenerTendenciaHistorica(pool);
      res.json(tendencia);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Endpoint analítico: Top profesiones y oficios registrados
  app.get("/api/metricas/profesiones", async (req, res) => {
    try {
      const { fecha, desde, hasta, limit = 10, incluirNoEspecificado = "false", agrupar = "false" } = req.query;
      let whereClause = "1=1";
      const params = [];
      let paramIdx = 1;

      if (fecha && FECHA_VALIDA.test(fecha)) {
        whereClause += ` AND r.fecha_enrolamiento = $${paramIdx++}`;
        params.push(fecha);
      } else if (desde && hasta && FECHA_VALIDA.test(desde) && FECHA_VALIDA.test(hasta)) {
        whereClause += ` AND r.fecha_enrolamiento >= $${paramIdx++} AND r.fecha_enrolamiento <= $${paramIdx++}`;
        params.push(desde, hasta);
      }

      const rawQuery = `
        SELECT p.id_profesion, p.nombre_profesion AS profesion, count(*) AS total
        FROM registro_enrolamiento r
        JOIN profesion p ON p.id_profesion = r.id_profesion
        WHERE ${whereClause}
        GROUP BY p.id_profesion, p.nombre_profesion
      `;
      // Extraemos todos para poder agruparlos en JS
      const { rows: rawRows } = await pool.query(rawQuery, params);

      // Función para normalizar profesiones similares
      const agruparProfesion = (prof) => {
        const p = prof.toUpperCase();
        if (p.includes("ALBAÑIL") || p.includes("CONSTRUCCION") || p.includes("EDIFICIOS")) return "ALBAÑILERÍA Y CONSTRUCCIÓN";
        if (p.includes("COMERCIA") || p.includes("VENDEDOR") || p.includes("CAJERO") || p.includes("CAJERA")) return "COMERCIO Y VENTAS";
        if (p.includes("CHOFER") || p.includes("CONDUCTOR") || p.includes("CAMION") || p.includes("TRANSPORTE") || p.includes("REPARTIDOR")) return "TRANSPORTE Y LOGÍSTICA";
        if (p.includes("AGRICULT") || p.includes("TEMPORER") || p.includes("CAMPESIN") || p.includes("AGRÍCOLA")) return "AGRICULTURA Y TEMPOREROS";
        if (p.includes("MECANIC") || p.includes("VULCANIZADOR") || p.includes("TALLER")) return "MECÁNICA Y AUTOMOTRIZ";
        if (p.includes("CASA") && p.includes("DUEÑA")) return "LABORES DE HOGAR / DUEÑA DE CASA";
        if (p.includes("ESTUDIANTE")) return "ESTUDIANTES";
        if (p.includes("COCIN") || p.includes("CHEF") || p.includes("GARZON") || p.includes("MESERO") || p.includes("PANADERO")) return "GASTRONOMÍA Y ALIMENTOS";
        if (p.includes("OBRERO") || p.includes("OPERARI") || p.includes("JORNALERO") || p.includes("PEON")) return "OPERARIOS Y OBREROS";
        if (p.includes("PELUQUER") || p.includes("BARBER") || p.includes("ESTILISTA") || p.includes("MANICURA")) return "ESTÉTICA Y BELLEZA";
        if (p.includes("ADMINISTRATIV") || p.includes("CONTADOR") || p.includes("SECRETARI")) return "ADMINISTRACIÓN Y OFICINA";
        if (p.includes("MEDIC") || p.includes("ENFERMER") || p.includes("PSICOLOG") || p.includes("DENTISTA") || p.includes("SALUD")) return "PROFESIONALES DE LA SALUD";
        if (p.includes("GUARDIA") || p.includes("SEGURIDAD")) return "SEGURIDAD PRIVADA";
        if (p.includes("ASESORA") || p.includes("NANA") || p.includes("DOMESTICA") || p.includes("ASEO") || p.includes("LIMPIEZA")) return "ASESORA DEL HOGAR / LIMPIEZA";
        if (p.includes("INDEPENDIENTE") || p.includes("EMPRESARIO") || p.includes("INDEPENDIENTE")) return "INDEPENDIENTE / EMPRESARIO";
        if (p.includes("PROFESOR") || p.includes("DOCENTE") || p.includes("EDUCADOR")) return "EDUCACIÓN";
        if (p.includes("INGENIERO")) return "INGENIERÍA";
        if (p.includes("TECNICO")) return "TÉCNICOS ESPECIALIZADOS";
        if (p.includes("JUBILADO") || p.includes("PENSIONADO")) return "JUBILADOS / PENSIONADOS";
        if (p.includes("CESANTE") || p.includes("DESEMPLEADO") || p.includes("SIN OCUPACION") || p.includes("BUSCA DE SU PRIMER EMPLEO") || p.includes("NINGUNA")) return "CESANTES / SIN OCUPACIÓN";
        return "OTROS OFICIOS / PROFESIONES";
      };

      const debeAgrupar = agrupar === "true";
      const groupedMap = new Map();
      
      for (const row of rawRows) {
        let g;
        const pText = row.profesion ? row.profesion.toUpperCase() : "";
        
        // Siempre normalizar los no especificados, sin importar el modo
        if (!row.profesion || pText === "0" || pText.includes("NO ESPECIFICADO") || pText.includes("SIN PROFESION") || pText === "NINGUNO") {
          g = "NO ESPECIFICADO";
        } else if (debeAgrupar) {
          g = agruparProfesion(row.profesion);
        } else {
          g = row.profesion; // Específico sin agrupar
        }
        
        const totalNum = parseInt(row.total, 10);
        groupedMap.set(g, (groupedMap.get(g) || 0) + totalNum);
      }

      let rows = Array.from(groupedMap.entries()).map(([profesion, total]) => ({
        profesion,
        total: total.toString()
      }));

      // Ordenar de mayor a menor y aplicar el límite (máx 50 para agrupadas, máx 15 para específicas sin agrupar)
      rows.sort((a, b) => b.total - a.total);
      const maxAllowed = debeAgrupar ? 50 : 15;
      const finalLimit = Math.min(Math.max(Number(limit) || 10, 1), maxAllowed);
      rows = rows.slice(0, finalLimit);

      const totalQuery = `
        SELECT count(*) AS total_general,
               count(*) FILTER (WHERE p.nombre_profesion NOT IN ('NO ESPECIFICADO', 'SIN PROFESION', '0')) AS total_con_profesion
        FROM registro_enrolamiento r
        JOIN profesion p ON p.id_profesion = r.id_profesion
        WHERE ${whereClause}
      `;
      const totalsRes = await pool.query(totalQuery, params);
      const totalConProf = Number(totalsRes.rows[0]?.total_con_profesion || 0);
      const totalGeneral = Number(totalsRes.rows[0]?.total_general || 0);

      const profesiones = rows.map(r => ({
        profesion: r.profesion,
        total: Number(r.total),
        porcentaje: totalConProf > 0 ? Number(((Number(r.total) / totalConProf) * 100).toFixed(1)) : 0
      }));

      res.json({
        ok: true,
        totalGeneral,
        totalConProfesion: totalConProf,
        profesiones,
      });
    } catch (err) {
      res.status(err.status || 500).json({ ok: false, error: err.message });
    }
  });

  // Endpoint para obtener la bitácora de auditoría
  app.get("/api/auditoria", async (req, res) => {
    try {
      const { tipo, desde, hasta, limit = 50, offset = 0 } = req.query;
      if ((tipo && typeof tipo !== 'string') || (desde && !esFecha(desde)) ||
          (hasta && !esFecha(hasta)) || (desde && hasta && desde > hasta) ||
          !/^\d+$/.test(String(limit)) || !/^\d+$/.test(String(offset)) ||
          Number(limit) < 1 || Number(limit) > 100 || !Number.isSafeInteger(Number(offset))) {
        return res.status(400).json({ error: 'Revisa el período y los parámetros de la consulta.' });
      }
      
      let whereClause = "1=1";
      const params = [];
      let paramIndex = 1;

      if (tipo) {
        whereClause += ` AND tipo_evento = $${paramIndex++}`;
        params.push(tipo);
      }
      
      if (desde && FECHA_VALIDA.test(desde)) {
        whereClause += ` AND fecha_evento >= $${paramIndex++}::date`;
        params.push(desde);
      }
      
      if (hasta && FECHA_VALIDA.test(hasta)) {
        whereClause += ` AND fecha_evento < ($${paramIndex++}::date + interval '1 day')`;
        params.push(hasta);
      }

      params.push(parseInt(limit, 10));
      params.push(parseInt(offset, 10));

      const { rows } = await pool.query(
        `SELECT id_auditoria, fecha_evento, tipo_evento, archivo_procesado, detalles_cifrados, usuario_o_proceso
         FROM registro_auditoria_cifrada
         WHERE ${whereClause}
         ORDER BY fecha_evento DESC, id_auditoria DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        params
      );

      res.json(await withAuditActors(pool, rows));
    } catch (err) {
      console.error("[ERROR AUDITORIA]", err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Endpoint de comparación de períodos (Semana/Mes)
  app.get("/api/metricas/comparar", async (req, res) => {
    try {
      const { tipo } = req.query;
      if (tipo !== "semana" && tipo !== "mes") {
        return res.status(400).json({ error: "Parámetro 'tipo' debe ser 'semana' o 'mes'" });
      }
      const comparacion = await obtenerComparacionPeriodos(pool, tipo);
      res.json(comparacion);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Exportación formal en Microsoft Word (.docx) con membrete oficial PDI
}

module.exports = { registerMetricRoutes };
