// Rutas ABIS; se registran detrás del middleware de sesión del servidor.
const { findLegacyIngest } = require('../ingest/deduplication');

function ingestMessage(inserted, duplicates) {
  return inserted === 0 && duplicates > 0
    ? `No se añadieron registros: ${duplicates} ya estaban cargados o se repetían en la carga.`
    : `Ingesta completada: ${inserted} registros nuevos y ${duplicates} duplicados omitidos.`;
}

async function rejectLegacyReplay(pool, res, type, hash) {
  const previous = await findLegacyIngest(pool, type, hash);
  if (!previous) return false;
  res.status(409).json({
    ok: false, codigo: 'POSIBLE_LOTE_REPETIDO', idLoteAnterior: previous.id_lote,
    error: `Posible carga repetida del lote #${previous.id_lote} (${previous.fecha}). No se insertó ningún registro. Revisa el historial: ese lote antiguo no conserva identificadores para comparar cada fila.`,
  });
  return true;
}

function registerIngestRoutes(app, { pool, requireSessionUser, upload, importarOracleLegacy, loadCatalogs, mapRow, bulkInsertRegistros, generarHashSHA256, ensureIngestHistory, crearLote, actualizarLote, listarLotes, esBufferCifrado, runEtl, runSheetEtl }) {
  app.post("/api/oracle/populate-legacy", requireSessionUser, async (req, res) => {
    const connectString = process.env.ORACLE_CONNECTION_STRING;
    const user = process.env.ORACLE_USER;
    const password = process.env.ORACLE_PASSWORD;
    if (!connectString || !user || !password) {
      return res.status(500).json({
        ok: false, error: "Servidor mal configurado. Faltan variables de entorno para Oracle.",
      });
    }

    try {
      const result = await importarOracleLegacy({
        pool, oracle: require("oracledb"),
        connectionOptions: { connectString, user, password, stmtCacheSize: 0 },
        loadCatalogs, bulkInsertRegistros,
        audit: async rows => {
          try {
            await pool.query(
              `INSERT INTO registro_auditoria_cifrada
               (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
               VALUES (NOW(), 'POBLAMIENTO_ORACLE_AUTORIZADA', 'desconocido', $1, $2, $3)`,
              [generarHashSHA256(Buffer.from(JSON.stringify(rows))), `Filas: ${rows.length}`, req.user.username]
            );
          } catch (error) {
            console.warn("[AUDITORÍA] Advertencia al registrar poblamiento desde Oracle:", error.message);
          }
        },
      });
      res.json({
        ok: true,
        mensaje: result.filasOracle === 0
          ? "Consulta ejecutada contra Oracle, pero no hay filas para insertar."
          : ingestMessage(result.filasPostgre, result.filasDuplicadas || 0),
        ...result,
      });
    } catch (error) {
      console.error("[ORACLE POPULATE ERROR]", error.message);
      res.status(error.status || 500).json({ ok: false, error: error.message });
    }
  });

  // Compatibilidad con consumidores anteriores; el adaptador se prueba sin arrancar servicios.


  // ===========================================================================
  // ORACLE -> POSTGRESQL POPULATION API (JSON PUSH)
  // ===========================================================================
  // Oracle entrega un lote JSON; ABIS valida, normaliza y persiste el lote en
  // una sola transaccion. Se mantiene /oracle/populate como contrato estable.

  const ORACLE_JSON_MAX_ROWS = 50000;

  function pickPayloadField(row, ...keys) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    }
    return undefined;
  }

  function normalizeOracleRecord(row) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;

    return {
      idRegistroOrigen: pickPayloadField(row, 'idRegistroOrigen', 'id_registro', 'ID_REGISTRO', 'ID Registro'),
      idOrigen: pickPayloadField(row, 'idOrigen', 'id_origen', 'ID_ORIGEN', 'ID Origen'),
      horaEnrolamiento: pickPayloadField(row, 'horaEnrolamiento', 'hora_enrolamiento', 'HORA_ENROLAMIENTO', 'hora', 'Hora', 'HORA'),
      documento: pickPayloadField(row, 'documento', 'DOCUMENTO', 'NUMERO_DOCUMENTO'),
      tipoDocumento: pickPayloadField(row, 'tipoDocumento', 'tipo_documento', 'TIPO_DOCUMENTO'),
      emitidoEn: pickPayloadField(row, 'emitidoEn', 'documento_emitido', 'DOCUMENTO_EMITIDO'),
      fechaEnrolamiento: pickPayloadField(row, "fechaEnrolamiento", "fecha_enrolamiento", "FECHA_ENROLAMIENTO"),
      nacionalidad: pickPayloadField(row, "nacionalidad", "NACIONALIDAD"),
      unidad: pickPayloadField(row, "unidad", "UNIDAD"),
      cuartel: pickPayloadField(row, "cuartel", "CUARTEL"),
      equipo: pickPayloadField(row, "equipo", "EQUIPO"),
      genero: pickPayloadField(row, "genero", "género", "GENERO", "GÉNERO"),
      mayorEdad: pickPayloadField(row, "mayorEdad", "mayor_edad", "esMayorEdad", "es_mayor_edad", "ES_MAYOR_EDAD"),
      edadExacta: pickPayloadField(row, "edadExacta", "edad_exacta", "EDAD_EXACTA"),
      profesion: pickPayloadField(row, "profesion", "profesión", "PROFESION", "PROFESIÓN"),
      estadoSincronizacion: pickPayloadField(row, "estadoSincronizacion", "estado_sincronizacion", "ESTADO_SINCRONIZACION"),
      estadoRegistro: pickPayloadField(row, "estadoRegistro", "estado_registro", "ESTADO_REGISTRO"),
      estadoGeneral: pickPayloadField(row, "estadoGeneral", "estado_general", "ESTADO_GENERAL"),
    };
  }

  async function validarCredencialIngesta(req) {
    return req.integrationAuth === true || Boolean(req.user?.username);
  }

  app.post("/api/oracle/populate", async (req, res) => {
    let idLote = null;
    try {
      if (!(await validarCredencialIngesta(req))) {
        console.warn("[SEGURIDAD] Intento de poblamiento JSON desde Oracle rechazado.");
        return res.status(401).json({
          ok: false,
          error: "Clave de autorizacion no valida o ausente.",
          codigo: "AUTH_REQUIRED",
        });
      }

      const { registros, periodo = null } = req.body || {};
      if (!Array.isArray(registros) || registros.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "El cuerpo debe incluir un arreglo 'registros' con al menos una fila.",
          codigo: "REGISTROS_REQUIRED",
        });
      }
      if (registros.length > ORACLE_JSON_MAX_ROWS) {
        return res.status(413).json({
          ok: false,
          error: `El lote supera el maximo permitido de ${ORACLE_JSON_MAX_ROWS} registros.`,
          codigo: "PAYLOAD_TOO_LARGE",
        });
      }

      const catalogs = await loadCatalogs(pool);
      const mappedRows = [];
      const errores = [];
      const correcciones = [];

      registros.forEach((rawRow, index) => {
        const normalizedRow = normalizeOracleRecord(rawRow);
        if (!normalizedRow) {
          errores.push({ fila: index + 1, errores: ["La fila debe ser un objeto JSON."] });
          return;
        }

        const result = mapRow(normalizedRow, catalogs);
        if (result.errors.length > 0) {
          errores.push({ fila: index + 1, errores: result.errors });
          return;
        }

        const { correcciones: rowCorrections = [], ...mapped } = result.mapped;
        mappedRows.push(mapped);
        if (rowCorrections.length > 0) {
          correcciones.push({ fila: index + 1, correcciones: rowCorrections });
        }
      });

      // No se inserta parcialmente: Oracle puede corregir y reenviar el lote.
      if (errores.length > 0) {
        return res.status(422).json({
          ok: false,
          error: "El JSON contiene registros invalidos; no se inserto ningun registro.",
          codigo: "VALIDATION_ERROR",
          filasRecibidas: registros.length,
          filasValidas: mappedRows.length,
          filasRechazadas: errores.length,
          totalErrores: errores.length,
          detalles: errores.slice(0, 100),
        });
      }

      const hashSHA256 = generarHashSHA256(JSON.stringify(registros));
      await ensureIngestHistory(pool);
      if (await rejectLegacyReplay(pool, res, 'ORACLE_JSON', hashSHA256)) return;
      idLote = await crearLote(pool, {
        tipoIngesta: "ORACLE_JSON",
        nombreArchivo: "oracle-push.json",
        hashSha256: hashSHA256,
        usuario: req.user.username,
        filasRecibidas: registros.length,
      });

      const insertResult = await bulkInsertRegistros(pool, mappedRows, {
        idLote,
        onBatchInserted: ({ batches, inserted, total }) => {
          console.log(`[ORACLE JSON] Lote ${batches}: ${inserted}/${total} registros insertados.`);
        },
      });

      await actualizarLote(pool, idLote, {
        estado: insertResult.inserted === 0 && insertResult.duplicates > 0 ? 'SIN_NOVEDADES' : 'COMPLETADO',
        finalizado: true,
        filasRecibidas: registros.length,
        filasValidas: mappedRows.length,
        filasInsertadas: insertResult.inserted,
        filasDuplicadas: insertResult.duplicates || 0,
        filasError: 0,
        detalle: JSON.stringify({ periodo, correcciones: correcciones.length }),
      });

      console.log(`[ORACLE JSON] ${insertResult.inserted} registros insertados. Lote ${idLote}.`);
      return res.json({
        ok: true,
        mensaje: ingestMessage(insertResult.inserted, insertResult.duplicates || 0),
        idLote,
        hashSHA256,
        filasRecibidas: registros.length,
        filasValidadas: mappedRows.length,
        filasInsertadas: insertResult.inserted,
        filasDuplicadas: insertResult.duplicates || 0,
        lotes: insertResult.batches,
        correcciones: correcciones.slice(0, 100),
      });
    } catch (err) {
      if (idLote) {
        try {
          await actualizarLote(pool, idLote, {
            estado: "ERROR",
            finalizado: true,
            filasError: 1,
            detalle: err.message,
          });
        } catch (historyErr) {
          console.error("[ORACLE JSON HISTORIAL ERROR]", historyErr.message);
        }
      }
      console.error("[ORACLE JSON ERROR]", err);
      return res.status(500).json({
        ok: false,
        error: "No fue posible procesar el JSON de Oracle.",
        detalle: err.message,
        idLote,
      });
    }
  });

  app.post("/api/ingest/upload", requireSessionUser, upload.single("archivo"), async (req, res) => {
    let idLote = null;
    try {

      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "No se ha enviado ningún archivo en el campo 'archivo'" });
      }

      const fileBuffer = req.file.buffer;
      const nombreOriginal = req.file.originalname || "archivo_cargado.xlsx";
      const tamañoBytes = fileBuffer.length;
      const hashSHA256 = generarHashSHA256(fileBuffer);
      const estaCifrado = esBufferCifrado(fileBuffer);

      await ensureIngestHistory(pool);
      if (await rejectLegacyReplay(pool, res, 'ARCHIVO', hashSHA256)) return;
      idLote = await crearLote(pool, {
        tipoIngesta: "ARCHIVO",
        nombreArchivo: nombreOriginal,
        hashSha256: hashSHA256,
        usuario: req.user.username,
      });

      console.log(`[UPLOAD AUTORIZADO] Procesando ${nombreOriginal} (${(tamañoBytes / 1024 / 1024).toFixed(2)} MB) - Cifrado: ${estaCifrado}`);

      const tiempoInicio = Date.now();
      const resultadoEtl = await runEtl(fileBuffer, pool, { idLote });
      const duracionMs = Date.now() - tiempoInicio;

      if (!resultadoEtl.headerValidation.ok) {
        await actualizarLote(pool, idLote, {
          estado: "ERROR",
          finalizado: true,
          filasError: 1,
          detalle: "Estructura de cabeceras invalida",
        });
        return res.status(422).json({
          ok: false,
          error: "Estructura de cabeceras inválida",
          headerValidation: resultadoEtl.headerValidation,
          nombreOriginal,
          hashSHA256,
        });
      }

      const totalInsertadas = resultadoEtl.insertResult ? resultadoEtl.insertResult.inserted : 0;
      const totalDuplicadas = resultadoEtl.insertResult?.duplicates || 0;
      const detalleErrores = resultadoEtl.errors.length > 0
        ? JSON.stringify(resultadoEtl.errors.slice(0, 50))
        : null;
      await actualizarLote(pool, idLote, {
        estado: totalInsertadas === 0 && totalDuplicadas > 0 && !resultadoEtl.errors.length ? 'SIN_NOVEDADES' : 'COMPLETADO',
        finalizado: true,
        filasRecibidas: resultadoEtl.rows.length + resultadoEtl.errors.length,
        filasValidas: resultadoEtl.rows.length,
        filasInsertadas: totalInsertadas,
        filasDuplicadas: totalDuplicadas,
        filasError: resultadoEtl.errors.length,
        detalle: detalleErrores,
      });

      // Registro formal en bitácora de auditoría inmutable
      try {
        await pool.query(
          `INSERT INTO registro_auditoria_cifrada 
           (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
           VALUES (NOW(), 'INGESTA_EXCEL_AUTORIZADA', $1, $2, $3, $4)`,
          [nombreOriginal, hashSHA256, `Lote #${idLote} · Insertadas: ${totalInsertadas}, Duplicadas: ${totalDuplicadas}, Cifrado: ${estaCifrado}`, req.user.username]
        );
      } catch (auditErr) {
        console.warn("[AUDITORÍA] Advertencia al registrar en bitácora:", auditErr.message);
      }

      res.json({
        ok: true,
        mensaje: ingestMessage(totalInsertadas, totalDuplicadas),
        nombreOriginal,
        tamañoBytes,
        hashSHA256,
        estaCifrado,
        duracionMs,
        totalMapeadas: resultadoEtl.rows.length,
        totalInsertadas,
        totalDuplicadas,
        erroresFilas: resultadoEtl.errors.length,
        erroresDetalle: resultadoEtl.errors.slice(0, 50),
        idLote,
      });
    } catch (err) {
      if (idLote) {
        try {
          await actualizarLote(pool, idLote, {
            estado: "ERROR",
            finalizado: true,
            detalle: err.message,
          });
        } catch (historyErr) {
          console.error("[INGESTA HISTORIAL ERROR]", historyErr.message);
        }
      }
      console.error("[UPLOAD ERROR]", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Ingesta directa desde Hoja de Cálculo / Portapapeles (Copiar y Pegar desde Oracle/Excel)
  app.post("/api/ingest/sheet", requireSessionUser, async (req, res) => {
    let idLote = null;
    try {

      const { headers, rows } = req.body || {};

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "No se suministraron filas para procesar en la hoja de cálculo.",
        });
      }

      const payloadSummary = JSON.stringify({ headers, count: rows.length, muestra: rows.slice(0, 3) });
      const legacyHash = generarHashSHA256(payloadSummary);
      const hashSHA256 = generarHashSHA256(JSON.stringify({ headers, rows }));

      await ensureIngestHistory(pool);
      if (await rejectLegacyReplay(pool, res, 'HOJA', legacyHash)) return;
      idLote = await crearLote(pool, {
        tipoIngesta: "HOJA",
        nombreArchivo: "Portapapeles / Oracle Sheet",
        hashSha256: hashSHA256,
        usuario: req.user.username,
        filasRecibidas: rows.length,
      });

      console.log(`[SHEET INGEST AUTORIZADO] Procesando ${rows.length} filas desde portapapeles/hoja de cálculo...`);

      const tiempoInicio = Date.now();
      const resultadoEtl = await runSheetEtl(headers, rows, pool, { idLote });
      const duracionMs = Date.now() - tiempoInicio;

      if (!resultadoEtl.headerValidation.ok) {
        await actualizarLote(pool, idLote, {
          estado: "ERROR",
          finalizado: true,
          filasError: rows.length,
          detalle: "Estructura de columnas invalida",
        });
        return res.status(422).json({
          ok: false,
          error: "Estructura de columnas inválida. No se detectaron las columnas requeridas del sistema ABIS.",
          headerValidation: resultadoEtl.headerValidation,
          hashSHA256,
        });
      }

      const totalInsertadas = resultadoEtl.insertResult ? resultadoEtl.insertResult.inserted : 0;
      const totalDuplicadas = resultadoEtl.insertResult?.duplicates || 0;
      const detalleErrores = resultadoEtl.errors.length > 0
        ? JSON.stringify(resultadoEtl.errors.slice(0, 50))
        : null;
      await actualizarLote(pool, idLote, {
        estado: totalInsertadas === 0 && totalDuplicadas > 0 && !resultadoEtl.errors.length ? 'SIN_NOVEDADES' : 'COMPLETADO',
        finalizado: true,
        filasRecibidas: rows.length,
        filasValidas: resultadoEtl.rows.length,
        filasInsertadas: totalInsertadas,
        filasDuplicadas: totalDuplicadas,
        filasError: resultadoEtl.errors.length,
        detalle: detalleErrores,
      });

      // Registro formal en bitácora de auditoría inmutable
      try {
        await pool.query(
          `INSERT INTO registro_auditoria_cifrada 
           (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
           VALUES (NOW(), 'INGESTA_PORTAPAPELES_AUTORIZADA', $1, $2, $3, $4)`,
          [
            'Portapapeles / Oracle Sheet',
            hashSHA256,
            `Lote #${idLote} · Insertadas: ${totalInsertadas}, Duplicadas: ${totalDuplicadas}, Filas Enviadas: ${rows.length}, Errores Mapeo: ${resultadoEtl.errors.length}`,
            req.user.username,
          ]
        );
      } catch (auditErr) {
        console.warn("[AUDITORÍA] Advertencia al registrar en bitácora:", auditErr.message);
      }

      res.json({
        ok: true,
        mensaje: ingestMessage(totalInsertadas, totalDuplicadas),
        hashSHA256,
        duracionMs,
        totalRecibidas: rows.length,
        totalInsertadas,
        totalDuplicadas,
        totalMapeadas: resultadoEtl.rows.length,
        erroresFilas: resultadoEtl.errors.length,
        erroresDetalle: resultadoEtl.errors.slice(0, 50),
        idLote,
      });
    } catch (err) {
      if (idLote) {
        try {
          await actualizarLote(pool, idLote, {
            estado: "ERROR",
            finalizado: true,
            detalle: err.message,
          });
        } catch (historyErr) {
          console.error("[INGESTA HISTORIAL ERROR]", historyErr.message);
        }
      }
      console.error("[SHEET INGEST ERROR]", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Historial de lotes cargados desde archivo o portapapeles.
  app.get("/api/ingest/historial", async (req, res) => {
    try {
      await ensureIngestHistory(pool);
      res.json({ ok: true, lotes: await listarLotes(pool) });
    } catch (err) {
      console.error("[INGESTA HISTORIAL ERROR]", err);
      res.status(500).json({ ok: false, error: "No se pudo cargar el historial de ingestas." });
    }
  });

  // Elimina solo los registros asociados a un lote y conserva el historial.
  // Requiere la sesión autenticada, sin solicitar nuevamente la contraseña.
  app.delete("/api/ingest/lotes/:id", requireSessionUser, async (req, res) => {
    const idLote = Number(req.params.id);

    if (!Number.isInteger(idLote) || idLote <= 0) {
      return res.status(400).json({ ok: false, error: "Identificador de lote invalido." });
    }

    try {

      await ensureIngestHistory(pool);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const loteResult = await client.query(
          "SELECT id_lote, nombre_archivo, estado, filas_insertadas FROM ingesta_lote WHERE id_lote = $1 FOR UPDATE",
          [idLote]
        );
        if (loteResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ ok: false, error: "Lote de ingesta no encontrado." });
        }

        const lote = loteResult.rows[0];
        if (lote.estado === "ELIMINADO") {
          await client.query("ROLLBACK");
          return res.status(409).json({ ok: false, error: "Este lote ya fue eliminado." });
        }

        const deletedResult = await client.query(
          "DELETE FROM registro_enrolamiento WHERE id_lote_ingesta = $1",
          [idLote]
        );
        const eliminados = deletedResult.rowCount || 0;

        await client.query(
          `UPDATE ingesta_lote
           SET estado = 'ELIMINADO', finalizado_en = NOW(), filas_eliminadas = $2,
               detalle = $3
           WHERE id_lote = $1`,
          [idLote, eliminados, `Eliminado por ${req.user.username}.`]
        );

        // La auditoría forma parte de la transacción: si falla, se revierte el borrado.
        await client.query(
          `INSERT INTO registro_auditoria_cifrada
            (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
           VALUES (NOW(), 'ELIMINACION_INGESTA_AUTORIZADA', $1, $2, $3, $4)`,
          [
            `Lote_${idLote}`,
            generarHashSHA256(Buffer.from(`lote:${idLote}:${eliminados}`)),
            `Registros eliminados: ${eliminados}. Archivo: ${lote.nombre_archivo || "sin nombre"}.`,
            req.user.username,
          ]
        );

        await client.query("COMMIT");
        res.json({ ok: true, idLote, eliminados, mensaje: "Lote eliminado correctamente." });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[INGESTA ELIMINACION ERROR]", err);
      res.status(500).json({ ok: false, error: "No se pudo eliminar el lote de ingesta." });
    }
  });

  // Disparo manual de reporte hacia el canal de Telegram institucional
}

module.exports = { registerIngestRoutes };
