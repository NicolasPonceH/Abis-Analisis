"""Prueba de integracion de punta a punta: subir -> OCR -> resumen -> entidades -> exportar
-> guardar en historial -> verlo en /historial y /estadisticas. Usa un PDF con texto embebido
(sin escaneo) para no depender de que Tesseract este instalado -- eso ya lo prueban las
pruebas manuales de OCR real documentadas en docs/sprints/sprint-02.md."""

import io

import pytest

from conftest import ACTA_TEXTO, make_pdf_bytes

try:
    import db
    db.get_connection().close()
    DB_DISPONIBLE = True
except Exception:
    DB_DISPONIBLE = False


def _subir(client, cleanup_files, unique_name, texto):
    filename = cleanup_files(unique_name)
    data = {"pdf_file": (io.BytesIO(make_pdf_bytes(texto)), filename)}
    resp = client.post("/upload", data=data, content_type="multipart/form-data")
    assert resp.status_code == 302
    return filename


def test_pipeline_completo_sin_base_de_datos(client, cleanup_files, unique_name):
    """El texto ya sale extraido apenas se sube el documento (sin POST /extract explicito) --
    ver app.py: extraer_y_cachear_texto(), llamado desde upload()."""
    filename = _subir(client, cleanup_files, unique_name, ACTA_TEXTO)

    resp = client.get(f"/view/{filename}")
    body = resp.get_data(as_text=True)
    assert "Toyota" in body

    resp = client.post(f"/summarize/{filename}")
    assert resp.status_code == 302

    resp = client.post(f"/entities/{filename}")
    assert resp.status_code == 302
    resp = client.get(f"/view/{filename}")
    body = resp.get_data(as_text=True)
    assert "Glock" in body
    assert "marihuana" in body

    resp = client.post(f"/export/{filename}")
    assert resp.status_code == 302
    resp = client.get(f"/exports/{filename}")
    assert resp.status_code == 200
    assert resp.headers["Content-Type"] == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


@pytest.mark.skipif(not DB_DISPONIBLE, reason="PostgreSQL no esta disponible")
def test_pipeline_completo_con_historial(client, cleanup_files, unique_name):
    """Identificar entidades ya guarda automaticamente en el historial -- no hace falta un
    POST /save/ explicito (ver app.py: guardar_en_historial(), llamado desde entities_view())."""
    filename = _subir(client, cleanup_files, unique_name, ACTA_TEXTO)
    client.post(f"/summarize/{filename}")
    client.post(f"/entities/{filename}")

    resp = client.get("/historial")
    assert filename in resp.get_data(as_text=True)

    resp = client.get(f"/historial?palabra_clave=marihuana")
    assert filename in resp.get_data(as_text=True)

    resp = client.get("/historial?palabra_clave=esto-no-deberia-existir-en-ningun-relato")
    assert filename not in resp.get_data(as_text=True)

    resp = client.get("/historial?categoria=droga")
    assert filename in resp.get_data(as_text=True)

    resp = client.get("/estadisticas")
    assert resp.status_code == 200
    assert "Vehiculos detectados" in resp.get_data(as_text=True)


@pytest.mark.skipif(not DB_DISPONIBLE, reason="PostgreSQL no esta disponible")
def test_identificar_entidades_guarda_automaticamente_en_el_historial(client, cleanup_files, unique_name):
    filename = _subir(client, cleanup_files, unique_name, ACTA_TEXTO)
    assert db.count_saves(filename) == 0

    client.post(f"/summarize/{filename}")
    client.post(f"/entities/{filename}")
    assert db.count_saves(filename) == 1

    # Volver a identificar entidades genera otro guardado -- cada guardado es un registro
    # inmutable nuevo, no un upsert (mismo criterio que el guardado manual, ver test_db.py).
    client.post(f"/entities/{filename}")
    assert db.count_saves(filename) == 2
