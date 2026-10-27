function registerPageRoutes(app, { pool, jwt, secret, requireAuth }) {
  app.get("/", (req, res) => {
    let user = null;
    const token = req.cookies?.abis_auth;
    if (token) {
      try {
        user = jwt.verify(token, secret);
      } catch (_) {
        user = null;
      }
    }
    return res.render("portal", { user });
  });

  app.get("/abis", requireAuth, (req, res) => res.render("index", { user: req.user }));

  app.get("/ajustes/:seccion?", requireAuth, async (req, res) => {
    const seccion = req.params.seccion || "general";
    const validSections = ["general", "horarios", "cuenta", "administracion"];
    if (!validSections.includes(seccion)) return res.redirect("/ajustes/general");

    let dbUsers = [];
    if (seccion === "administracion" && req.user.rol_abis !== "admin") {
      return res.status(403).send("No tienes permisos para administrar usuarios de ABIS.");
    }
    if (seccion === "administracion") {
      try {
        const usersRes = await pool.query("SELECT id, username, rol_abis AS rol, rol_siad, ultimo_ingreso FROM usuarios ORDER BY id ASC");
        dbUsers = usersRes.rows;
      } catch (err) {
        console.error("Error fetching users:", err);
      }
    }
    return res.render("ajustes", { user: req.user, activeSection: seccion, dbUsers });
  });
}

module.exports = { registerPageRoutes };
