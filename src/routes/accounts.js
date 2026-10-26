// Rutas ABIS; se registran detrás del middleware de sesión del servidor.
function registerAccountRoutes(app, { pool, requireAuth, express }) {
  app.post("/api/user/change-password", requireAuth, express.json(), async (req, res) => {
    const { password } = req.body;
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }
    if (!password) return res.status(400).json({ error: "Falta la nueva contraseña." });
    
    try {
      const siadUrl = process.env.SIAD_URL || "http://127.0.0.1:5001";
      const updateRes = await fetch(`${siadUrl}/api/update_password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": process.env.SECRET_KEY || "",
        },
        body: JSON.stringify({ username: req.user.username, password })
      });
      let data = null;
      try {
        data = await updateRes.json();
      } catch (_) {
        console.warn("SIAD update_password no devolvió JSON:", updateRes.status);
      }
      if (data && data.ok) return res.json({ ok: true });
      if (data && data.error) return res.status(400).json({ error: data.error });
      return res.status(updateRes.ok ? 200 : 400).json({ error: "Error al actualizar la contraseña." });
    } catch (err) {
      console.error("Error in change-password:", err);
      return res.status(500).json({ error: "Error de conexión con el sistema de validación." });
    }
  });

  app.post("/api/admin/reset-password", requireAuth, express.json(), async (req, res) => {
    if (req.user.rol !== "admin") return res.status(403).json({ error: "No tienes permisos." });
    const { id, password } = req.body;
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }
    if (!id || !password) return res.status(400).json({ error: "Faltan datos." });
    
    try {
      const userRes = await pool.query("SELECT username FROM usuarios WHERE id = $1", [id]);
      if (userRes.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado." });
      
      const siadUrl = process.env.SIAD_URL || "http://127.0.0.1:5001";
      const updateRes = await fetch(`${siadUrl}/api/update_password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": process.env.SECRET_KEY || "",
        },
        body: JSON.stringify({ username: userRes.rows[0].username, password })
      });
      let data = null;
      try {
        data = await updateRes.json();
      } catch (_) {
        console.warn("SIAD reset-password no devolvió JSON:", updateRes.status);
      }
      if (data && data.ok) return res.json({ ok: true });
      if (data && data.error) return res.status(400).json({ error: data.error });
      return res.status(updateRes.ok ? 200 : 400).json({ error: "Error al actualizar la contraseña." });
    } catch (err) {
      console.error("Error in reset-password:", err);
      return res.status(500).json({ error: "Error de servidor." });
    }
  });

  app.post("/api/admin/create-user", requireAuth, express.json(), async (req, res) => {
    if (req.user.rol !== "admin") return res.status(403).json({ error: "No tienes permisos." });
    const { username, password, rol } = req.body;
    const normalizedUsername = typeof username === "string" ? username.trim() : "";
    if (normalizedUsername.length < 3 || typeof password !== "string" || password.length < 6 || !["admin", "operador"].includes(rol)) {
      return res.status(400).json({ error: "Usuario, contraseña o rol no válidos." });
    }
    if (!username || !password || !rol) return res.status(400).json({ error: "Faltan datos." });
    
    try {
      const siadUrl = process.env.SIAD_URL || "http://127.0.0.1:5001";
      const createRes = await fetch(`${siadUrl}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalizedUsername, password, nombre_completo: normalizedUsername })
      });
      const data = await createRes.json();
      
      if (data.ok) {
        await pool.query("UPDATE usuarios SET rol = $1 WHERE LOWER(username) = LOWER($2)", [rol, normalizedUsername]);
        return res.json({ ok: true });
      }
      return res.status(400).json({ error: data.error || "Error al crear usuario." });
    } catch (err) {
      console.error("Error in create-user:", err);
      return res.status(500).json({ error: "Error de servidor." });
    }
  });

  // Elimina una cuenta de usuario desde el panel de administración.
  // No permite eliminar la cuenta autenticada ni dejar el sistema sin administradores.
  app.delete("/api/admin/users/:id", requireAuth, async (req, res) => {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ ok: false, error: "No tienes permisos de administrador." });
    }

    const userId = Number(req.params.id);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: "Identificador de usuario no válido." });
    }
    if (!password) {
      return res.status(400).json({ ok: false, error: "Debes introducir tu contraseña para validar la acción." });
    }

    try {
      const authRes = await fetch(`${process.env.SIAD_URL || "http://127.0.0.1:5001"}/api/verify_password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: req.user.username, password }),
      });
      const authData = await authRes.json();
      if (!authRes.ok || !authData.ok) {
        return res.status(401).json({ ok: false, error: "Contraseña incorrecta. No se eliminó ningún usuario." });
      }
    } catch (err) {
      console.error("Error validating admin password for user deletion:", err);
      return res.status(503).json({ ok: false, error: "No se pudo validar la contraseña en este momento." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const targetResult = await client.query(
        "SELECT id, username, rol FROM usuarios WHERE id = $1 FOR UPDATE",
        [userId]
      );
      if (targetResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "Usuario no encontrado." });
      }

      const target = targetResult.rows[0];
      if (String(target.username).toLowerCase() === String(req.user.username).toLowerCase()) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "No puedes eliminar tu propia cuenta." });
      }

      if (target.rol === "admin") {
        const adminsResult = await client.query(
          "SELECT COUNT(*)::int AS total FROM usuarios WHERE rol = 'admin'"
        );
        if (adminsResult.rows[0].total <= 1) {
          await client.query("ROLLBACK");
          return res.status(400).json({ ok: false, error: "No se puede eliminar al último administrador." });
        }
      }

      await client.query("DELETE FROM usuarios WHERE id = $1", [userId]);
      await client.query("COMMIT");

      console.log(`[ADMIN] Usuario eliminado: ${target.username} por ${req.user.username}`);
      return res.json({ ok: true, usuario: target.username });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // La conexión puede haber quedado cerrada; se conserva el error original.
      }
      console.error("Error deleting user:", err);
      return res.status(500).json({ ok: false, error: "No se pudo eliminar el usuario." });
    } finally {
      client.release();
    }
  });

  app.post("/api/admin/update-role", requireAuth, express.json(), async (req, res) => {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ error: "No tienes permisos de administrador." });
    }
    const { id, rol } = req.body;
    if (!id || !rol) {
      return res.status(400).json({ error: "Faltan datos." });
    }
    if (!["admin", "operador"].includes(rol)) {
      return res.status(400).json({ error: "Rol no válido." });
    }
    try {
      await pool.query("UPDATE usuarios SET rol = $1 WHERE id = $2", [rol, id]);
      res.json({ ok: true });
    } catch (err) {
      console.error("Error updating user role:", err);
      res.status(500).json({ error: "Error de base de datos." });
    }
  });
}

module.exports = { registerAccountRoutes };
