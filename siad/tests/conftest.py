"""Fixtures compartidas (Sprint 9: pruebas de integracion).

DB_NAME se sobreescribe a una base de datos de pruebas dedicada *antes* de importar app/db,
para que la suite nunca toque el historial real -- y porque las tablas tienen triggers de
inmutabilidad (Sprint 7) que bloquean DELETE, asi que "limpiar" entre pruebas significa
recrear las tablas, no borrar filas.
"""

import os
import uuid

os.environ.setdefault("DB_NAME", "sistema_analisis_test")
os.environ.setdefault("FLASK_DEBUG", "0")
os.environ.setdefault("APP_PASSWORD", "test-only-password")

import pytest  # noqa: E402
# pyrefly: ignore [missing-import]
import pymupdf as fitz  # noqa: E402

import app as app_module  # noqa: E402
import db  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def reset_test_database():
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS entidades")
            cur.execute("DROP TABLE IF EXISTS documentos")
        conn.commit()
    db.init_schema()
    yield


@pytest.fixture
def client():
    """Cliente de pruebas ya autenticado -- el login (control de acceso, agregado despues del
    cierre del roadmap) se prueba aparte en test_auth.py con su propio cliente sin sesion."""
    app_module.app.testing = True
    with app_module.app.test_client() as test_client:
        with test_client.session_transaction() as sess:
            sess["autenticado"] = True
        yield test_client


@pytest.fixture
def unique_name():
    # Sin guion bajo al inicio: secure_filename() lo recorta (ver test_upload.py), asi que un
    # nombre que empiece con "_" no sobreviviria intacto para comparar contra la respuesta.
    return f"test-{uuid.uuid4().hex[:10]}.pdf"


@pytest.fixture
def cleanup_files():
    """Registra nombres de archivo usados en un test y borra todo lo que hayan generado en
    static/* al terminar, para no dejar basura de pruebas en el proyecto real. Limpia tanto
    el nombre tal cual se registro como su version pasada por secure_filename(): la app
    sanea el nombre antes de guardar, asi que si un test registra el nombre "crudo" (sin
    sanear) la limpieza igual encuentra el archivo real en disco."""
    from werkzeug.utils import secure_filename

    created = []

    def register(filename):
        created.append(filename)
        return filename

    yield register

    nombres = {n for f in created for n in (f, secure_filename(f))}
    for filename in nombres:
        for folder, suffix in (
            (app_module.UPLOAD_FOLDER, ""),
            (app_module.EXTRACTED_FOLDER, ".txt"),
            (app_module.SUMMARIES_FOLDER, ".txt"),
            (app_module.ENTITIES_FOLDER, ".json"),
            (app_module.EXPORTS_FOLDER, ".docx"),
        ):
            path = os.path.join(folder, filename + suffix)
            if os.path.isfile(path):
                os.remove(path)


def make_pdf_bytes(text):
    """PDF con texto embebido (no imagen): extract_text_from_pdf lo procesa directo, sin pasar
    por OCR -- las pruebas corren rapido y no dependen de que Tesseract este instalado."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_textbox(fitz.Rect(50, 50, 550, 750), text, fontsize=11)
    data = doc.tobytes()
    doc.close()
    return data


@pytest.fixture
def make_pdf():
    return make_pdf_bytes


ACTA_TEXTO = (
    "El dia 21 de agosto de 2026, personal policial intercepto un vehiculo marca Toyota, "
    "modelo Hilux, año 2019, color blanco, con patente BBTT21, en la comuna de Arica.\n\n"
    "En el interior del vehiculo se encontro un arma de fuego marca Glock, modelo 17, "
    "calibre 9mm, con numero de serie AB1234XZ.\n\n"
    "Se encontraron 250 gramos de marihuana en el maletero del vehiculo."
)
