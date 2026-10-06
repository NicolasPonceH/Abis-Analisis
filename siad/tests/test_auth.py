"""Pruebas del control de acceso (clave unica compartida, agregado despues del cierre del
roadmap). Usa su propio cliente sin autenticar -- a diferencia del fixture `client` de
conftest.py, que ya viene con sesion iniciada para no romper el resto de la suite."""

import app as app_module

APP_PASSWORD = "test-only-password"  # ver conftest.py: os.environ.setdefault("APP_PASSWORD", ...)


def _cliente_sin_sesion():
    app_module.app.testing = True
    return app_module.app.test_client()


def test_ruta_protegida_sin_sesion_redirige_al_login():
    resp = _cliente_sin_sesion().get("/estadisticas")
    assert resp.status_code == 302
    assert "/login" in resp.headers["Location"]


def test_login_con_clave_incorrecta_no_autentica():
    cliente = _cliente_sin_sesion()
    resp = cliente.post("/login", data={"password": "clave-equivocada"})
    assert resp.status_code == 200  # vuelve a mostrar el formulario, no redirige
    assert cliente.get("/estadisticas").status_code == 302


def test_login_con_clave_correcta_autentica_y_permite_navegar():
    cliente = _cliente_sin_sesion()
    resp = cliente.post("/login", data={"password": APP_PASSWORD}, follow_redirects=False)
    assert resp.status_code == 302
    assert cliente.get("/estadisticas").status_code == 200


def test_logout_cierra_la_sesion():
    cliente = _cliente_sin_sesion()
    cliente.post("/login", data={"password": APP_PASSWORD})
    assert cliente.get("/").status_code == 200

    cliente.get("/logout")
    resp = cliente.get("/")
    assert resp.status_code == 302
    assert "/login" in resp.headers["Location"]


def test_login_respeta_el_parametro_next():
    cliente = _cliente_sin_sesion()
    resp = cliente.post(
        "/login", data={"password": APP_PASSWORD, "next": "/historial"}, follow_redirects=False,
    )
    assert resp.headers["Location"] == "/historial"


def test_next_sobrevive_a_un_primer_intento_con_clave_incorrecta():
    """Regresion: el primer intento (clave incorrecta) debia perder el "next" porque el login
    solo lo leia de request.args (el query string del GET original), no del campo oculto del
    formulario reenviado por POST -- asi que un segundo intento, ya con la clave correcta,
    terminaba mandando al index en vez del destino que el usuario habia pedido originalmente."""
    cliente = _cliente_sin_sesion()
    cliente.get("/historial")  # genera el redirect a /login?next=/historial
    cliente.post("/login", data={"password": "clave-mala", "next": "/historial"})
    resp = cliente.post(
        "/login", data={"password": APP_PASSWORD, "next": "/historial"}, follow_redirects=False,
    )
    assert resp.headers["Location"] == "/historial"


def test_archivos_estaticos_no_requieren_sesion():
    """El logo de la pantalla de login (y de todo el sistema) tiene que poder cargar sin haber
    iniciado sesion todavia -- si no, la propia pantalla de login se veria rota."""
    resp = _cliente_sin_sesion().get("/static/img/pdi-logo.jpg")
    assert resp.status_code == 200


def test_login_resiste_intento_de_inyeccion_sql():
    """El login no consulta la base de datos -- compara la clave en memoria con
    hmac.compare_digest contra APP_PASSWORD, asi que un payload de inyeccion SQL no tiene forma
    de tener efecto: se trata como cualquier otra clave incorrecta."""
    cliente = _cliente_sin_sesion()
    resp = cliente.post("/login", data={"password": "' OR '1'='1"})
    assert resp.status_code == 200  # vuelve a mostrar el formulario, no autentico
    assert cliente.get("/estadisticas").status_code == 302  # sigue sin sesion

    resp = cliente.post("/login", data={"password": "x'; DROP TABLE documentos; --"})
    assert resp.status_code == 200
    assert cliente.get("/estadisticas").status_code == 302
