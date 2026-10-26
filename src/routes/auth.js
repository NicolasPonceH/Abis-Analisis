const { localRedirect: defaultLocalRedirect } = require("../middleware/session");

function registerAuthRoutes(app, { pool, jwt, secret, env = process.env, localRedirect = defaultLocalRedirect, fetchImpl = fetch }) {
  app.get("/login", (req, res) => {
    const token = req.cookies?.abis_auth;
    let currentUser = null;
    if (token) {
      try {
        currentUser = jwt.verify(token, secret);
        const requestedNext = localRedirect(req.query.next, null);
        if (requestedNext) return res.redirect(requestedNext);
        if (req.query.target === "siad") return res.redirect("/analisis/");
        return res.redirect("/abis");
      } catch (_) {
        currentUser = null;
      }
    }
    const error = req.query.motivo === "inactividad"
      ? "Tu sesión se cerró por inactividad. Ingresa nuevamente para continuar."
      : null;
    const requestedNext = localRedirect(req.query.next, null);
    const target = req.query.target || (requestedNext?.includes("/analisis") ? "siad" : "abis");
    const next = requestedNext || (target === "siad" ? "/analisis/" : "/abis");
    return res.render("login", { error, success: null, target, next, user: currentUser });
  });

  app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    const nextUrl = localRedirect(req.body.next || req.query.next);
    const target = req.body.target || (nextUrl.includes("/analisis") ? "siad" : "abis");
    const wantsJson = (req.get("Accept") || "").includes("application/json");
    const loginError = (status, error) => wantsJson
      ? res.status(status).json({ ok: false, error })
      : res.render("login", { error, success: null, target, next: nextUrl, user: null });
    res.set("Cache-Control", "no-store");

    try {
      const siadUrl = env.SIAD_URL || "http://127.0.0.1:5001";
      const authRes = await fetchImpl(`${siadUrl}/api/verify_password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (authRes.ok) {
        const data = await authRes.json();
        if (data.ok) {
          let userRole = "operador";
          try {
            const userRes = await pool.query("SELECT rol FROM usuarios WHERE LOWER(username) = LOWER($1)", [username]);
            if (userRes.rows.length > 0 && userRes.rows[0].rol) {
              userRole = userRes.rows[0].rol;
            }
          } catch (dbErr) {
            console.error("Error al obtener rol:", dbErr);
          }
          const token = jwt.sign({ username, rol: userRole }, secret, { expiresIn: "8h" });
          const isSecure = env.NODE_ENV === "production" || req.secure || req.headers["x-forwarded-proto"] === "https";
          res.cookie("abis_auth", token, {
            httpOnly: true,
            secure: Boolean(isSecure),
            sameSite: "lax",
            path: "/",
          });
          if (wantsJson) return res.json({ ok: true, redirect: nextUrl });
          return res.redirect(nextUrl);
        }
      }
      if (authRes.status >= 500) return loginError(503, "El servicio de validación no está disponible. Inténtalo nuevamente en unos momentos.");
      return loginError(401, "Usuario o contraseña incorrectos. Revisa tus credenciales.");
    } catch (_) {
      return loginError(503, "Error de conexión con el sistema de validación.");
    }
  });

  app.get("/register", (_req, res) => res.render("register", { error: null, success: null }));

  app.post("/register", async (req, res) => {
    const { username, password, confirm_password, nombre_completo } = req.body;
    if (password !== confirm_password) {
      return res.render("register", { error: "Las contraseñas no coinciden.", success: null });
    }
    try {
      const siadUrl = env.SIAD_URL || "http://127.0.0.1:5001";
      const authRes = await fetchImpl(`${siadUrl}/api/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": secret,
        },
        body: JSON.stringify({ username, password, nombre_completo }),
      });
      if (authRes.ok) {
        const data = await authRes.json();
        if (data.ok) return res.render("login", { error: null, success: "Usuario registrado exitosamente. Ahora puedes iniciar sesión." });
        return res.render("register", { error: data.error || "No se pudo registrar el usuario.", success: null });
      }
      return res.render("register", { error: "Error del servidor de base de datos.", success: null });
    } catch (_) {
      return res.render("register", { error: "Error de conexión con el sistema de validación.", success: null });
    }
  });

  const clearAuthCookies = res => {
    res.clearCookie("abis_auth", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    res.clearCookie("siad_session", { path: "/" });
  };
  app.get("/logout", (req, res) => {
    clearAuthCookies(res);
    return res.redirect(req.query.motivo === "inactividad" ? "/login?motivo=inactividad" : "/");
  });
  app.post("/logout", (_req, res) => {
    clearAuthCookies(res);
    return res.status(204).end();
  });
}

module.exports = { registerAuthRoutes };
