"""Pruebas de carga de documentos (Sprint 9), incluyendo el caso que motiva el sprint:
'sistema estabilizado frente a PDFs corruptos'."""

import io
import os

import app as app_module
from conftest import make_pdf_bytes


def test_upload_sin_archivo_redirige_con_error(client):
    resp = client.post("/upload", data={}, content_type="multipart/form-data")
    assert resp.status_code == 302
    assert resp.headers["Location"] == "/"


def test_upload_rechaza_extension_no_pdf(client):
    data = {"pdf_file": (io.BytesIO(b"contenido cualquiera"), "documento.txt")}
    resp = client.post("/upload", data=data, content_type="multipart/form-data")
    assert resp.status_code == 302
    resp = client.get("/")
    assert "Solo se permiten archivos PDF" in resp.get_data(as_text=True)


def test_upload_rechaza_pdf_corrupto_sin_romper(client):
    """El archivo tiene extension .pdf pero el contenido no es un PDF real -- no debe
    guardarse ni tumbar el servidor con un 500."""
    data = {"pdf_file": (io.BytesIO(b"esto no es un PDF, es texto plano"), "falso.pdf")}
    resp = client.post("/upload", data=data, content_type="multipart/form-data")
    assert resp.status_code == 302
    resp = client.get("/")
    body = resp.get_data(as_text=True)
    assert "dañado" in body or "danado" in body
    assert "falso.pdf" not in body  # no debe quedar listado como documento cargado


def test_upload_pdf_valido_queda_disponible(client, unique_name, cleanup_files):
    filename = cleanup_files(unique_name)
    data = {"pdf_file": (io.BytesIO(make_pdf_bytes("Contenido de prueba.")), filename)}
    resp = client.post("/upload", data=data, content_type="multipart/form-data")
    assert resp.status_code == 302
    assert resp.headers["Location"] == f"/view/{filename}"

    resp = client.get(f"/view/{filename}")
    assert resp.status_code == 200


def test_upload_extrae_el_texto_automaticamente_sin_pedirlo(client, unique_name, cleanup_files):
    """El texto (OCR) ya debe quedar cacheado apenas se sube el documento, sin necesidad de un
    POST /extract explicito -- ver app.py: extraer_y_cachear_texto(), llamado desde upload()."""
    filename = cleanup_files(unique_name)
    data = {"pdf_file": (io.BytesIO(make_pdf_bytes("Un texto bien especifico de prueba.")), filename)}
    client.post("/upload", data=data, content_type="multipart/form-data")

    assert os.path.isfile(app_module.extracted_text_path(filename))
    resp = client.get(f"/view/{filename}")
    body = resp.get_data(as_text=True)
    assert "Un texto bien especifico de prueba." in body
    assert "Aún no se ha extraído texto" not in body


def test_upload_multiples_pdfs_los_une_en_uno_solo(client, cleanup_files):
    data = {
        "pdf_file": [
            (io.BytesIO(make_pdf_bytes("Primer documento.")), "a.pdf"),
            (io.BytesIO(make_pdf_bytes("Segundo documento.")), "b.pdf"),
        ],
    }
    resp = client.post("/upload", data=data, content_type="multipart/form-data")
    assert resp.status_code == 302
    location = resp.headers["Location"]
    assert location.startswith("/view/carga_")
    merged_filename = location.removeprefix("/view/")
    cleanup_files(merged_filename)

    resp = client.get(f"/view/{merged_filename}")
    assert resp.status_code == 200


def test_delete_document_borra_el_pdf_y_sus_archivos_derivados(client, unique_name, cleanup_files):
    filename = cleanup_files(unique_name)
    data = {"pdf_file": (io.BytesIO(make_pdf_bytes("Contenido de prueba.")), filename)}
    client.post("/upload", data=data, content_type="multipart/form-data")
    client.post(f"/extract/{filename}")
    assert os.path.isfile(os.path.join(app_module.UPLOAD_FOLDER, filename))
    assert os.path.isfile(app_module.extracted_text_path(filename))

    resp = client.post(f"/delete/{filename}")
    assert resp.status_code == 302
    assert not os.path.isfile(os.path.join(app_module.UPLOAD_FOLDER, filename))
    assert not os.path.isfile(app_module.extracted_text_path(filename))

    resp = client.get("/")
    # No queda listado como documento cargado -- el nombre puede seguir apareciendo en el
    # mensaje flash de confirmacion ("X eliminado."), asi que se verifica el enlace especifico.
    assert f"/view/{filename}" not in resp.get_data(as_text=True)


def test_delete_document_inexistente_no_falla(client):
    resp = client.post("/delete/no-existe-este-archivo.pdf")
    assert resp.status_code == 302
    resp = client.get("/")
    assert "no existe" in resp.get_data(as_text=True)


def test_delete_all_borra_todos_los_documentos(client, cleanup_files):
    nombres = ["a-borrar-1.pdf", "a-borrar-2.pdf"]
    for nombre in nombres:
        cleanup_files(nombre)
        data = {"pdf_file": (io.BytesIO(make_pdf_bytes("Contenido.")), nombre)}
        client.post("/upload", data=data, content_type="multipart/form-data")

    resp = client.get("/")
    body = resp.get_data(as_text=True)
    assert all(nombre in body for nombre in nombres)

    resp = client.post("/delete_all")
    assert resp.status_code == 302

    resp = client.get("/")
    body = resp.get_data(as_text=True)
    assert not any(nombre in body for nombre in nombres)
