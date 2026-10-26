// Rutas ABIS; se registran detrás del middleware de sesión del servidor.
function registerSecurityRoutes(app, { pool, requireSessionUser, upload, uploadEncrypted, generarHashSHA256, cifrarBuffer, descifrarBuffer, esBufferCifrado }) {
  app.post("/api/security/cifrar", requireSessionUser, upload.single("archivo"), async (req, res) => {
    try {

      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ ok: false, error: "No se ha seleccionado ningún archivo para cifrar." });
      }
      const bufferOriginal = req.file.buffer;
      const nombreOriginal = req.file.originalname || "archivo.xlsx";
      const hashOriginal = generarHashSHA256(bufferOriginal);

      const bufferCifrado = cifrarBuffer(bufferOriginal);
      const hashCifrado = generarHashSHA256(bufferCifrado);

      // Registro de auditoría inmutable
      try {
        await pool.query(
          `INSERT INTO registro_auditoria_cifrada 
           (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
           VALUES (NOW(), 'CIFRADO_WEB_AUTORIZADO', $1, $2, $3, $4)`,
          [nombreOriginal, hashCifrado, `Original: ${hashOriginal}`, req.user.username]
        );
      } catch (auditErr) {
        console.warn("[AUDITORÍA] Advertencia al registrar en bitácora:", auditErr.message);
      }

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${nombreOriginal}.enc"`);
      res.setHeader("Access-Control-Expose-Headers", "X-Hash-Original, X-Hash-Cifrado");
      res.setHeader("X-Hash-Original", hashOriginal);
      res.setHeader("X-Hash-Cifrado", hashCifrado);
      res.send(bufferCifrado);
    } catch (err) {
      console.error("[CIFRAR WEB ERROR]", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Herramienta Web: Descifrar y validar integridad de archivo .enc (retorna .xlsx)
  app.post("/api/security/descifrar", requireSessionUser, uploadEncrypted.single("archivo"), async (req, res) => {
    try {

      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ ok: false, error: "No se ha seleccionado ningún archivo para descifrar." });
      }
      const bufferCifrado = req.file.buffer;
      const nombreOriginal = req.file.originalname || "archivo.enc";

      if (!esBufferCifrado(bufferCifrado)) {
        return res.status(400).json({
          ok: false,
          error: "El archivo no posee la cabecera mágica de cifrado ABIS (ABIS_ENC_V1) o no fue cifrado con el sistema.",
        });
      }

      const bufferDescifrado = descifrarBuffer(bufferCifrado);
      const nombreDescifrado = nombreOriginal.replace(/\.enc$/i, "") || "archivo_descifrado.xlsx";
      const hashDescifrado = generarHashSHA256(bufferDescifrado);

      // Registro de auditoría inmutable
      try {
        await pool.query(
          `INSERT INTO registro_auditoria_cifrada 
           (fecha_evento, tipo_evento, archivo_procesado, hash_sha256, detalles_cifrados, usuario_o_proceso)
           VALUES (NOW(), 'DESCIFRADO_WEB_AUTORIZADO', $1, $2, $3, $4)`,
          [nombreOriginal, hashDescifrado, `Descifrado a: ${nombreDescifrado}`, req.user.username]
        );
      } catch (auditErr) {
        console.warn("[AUDITORÍA] Advertencia al registrar en bitácora:", auditErr.message);
      }

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${nombreDescifrado}"`);
      res.setHeader("Access-Control-Expose-Headers", "X-Hash-Descifrado");
      res.setHeader("X-Hash-Descifrado", hashDescifrado);
      res.send(bufferDescifrado);
    } catch (err) {
      console.error("[DESCIFRAR WEB ERROR]", err);
      res.status(500).json({ ok: false, error: "Fallo en el descifrado: la clave maestra no coincide o el archivo fue manipulado/corrompido." });
    }
  });

  // ==========================================================================
  // AJUSTES Y GESTIÓN DE HORARIOS DE REPORTES AUTOMÁTICOS
  // ==========================================================================

  // Obtiene la configuración actual de horarios de reporte y próxima ejecución
}

module.exports = { registerSecurityRoutes };
