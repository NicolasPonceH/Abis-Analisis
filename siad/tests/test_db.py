"""Pruebas de persistencia contra la base de datos de pruebas (sistema_analisis_test, ver
conftest.py). Requieren PostgreSQL corriendo -- si no esta disponible, se saltan en vez de
fallar (no todo el mundo tiene el server levantado para correr la suite completa)."""

import psycopg
import pytest

import db

try:
    db.get_connection().close()
    DB_DISPONIBLE = True
except Exception:
    DB_DISPONIBLE = False

pytestmark = pytest.mark.skipif(not DB_DISPONIBLE, reason="PostgreSQL no esta disponible")


ENTIDADES_EJEMPLO = {
    "vehiculos": {"marcas": ["Toyota"], "modelos": ["Hilux"], "colores": ["blanco"],
                  "anios": ["2019"], "patentes": ["BBTT21"]},
    "armas": {"marcas": ["Glock"], "modelos": ["17"], "tipos": ["fuego"],
              "calibres": ["9MM"], "series": ["AB1234XZ"]},
    "drogas": {"sustancias": ["marihuana"], "medidas": ["250 gramos"]},
}


def test_save_document_y_list_history():
    doc_id = db.save_document("acta_prueba.pdf", "texto original", "resumen corto", ENTIDADES_EJEMPLO)
    assert doc_id > 0

    registros = db.list_history()
    ids = [r["id"] for r in registros]
    assert doc_id in ids


def test_get_document_entities_agrupa_por_categoria():
    doc_id = db.save_document("acta_prueba2.pdf", "texto", "resumen", ENTIDADES_EJEMPLO)
    entidades = db.get_document_entities(doc_id)
    categorias = {e["categoria"] for e in entidades}
    assert categorias == {"vehiculo", "arma", "droga"}


def test_list_history_filtra_por_categoria():
    db.save_document("acta_con_droga.pdf", "texto con marihuana", "resumen",
                      {"drogas": {"sustancias": ["marihuana"], "medidas": []}})
    registros = db.list_history(categoria="droga")
    assert any(r["nombre_archivo"] == "acta_con_droga.pdf" for r in registros)
    assert all(r["nombre_archivo"] != "documento_sin_entidades_xyz.pdf" for r in registros)


def test_list_history_filtra_por_palabra_clave():
    db.save_document("acta_palabra_clave.pdf", "contiene la palabra XYZANDAMIO unica", "", None)
    registros = db.list_history(palabra_clave="XYZANDAMIO")
    assert len(registros) == 1
    assert registros[0]["nombre_archivo"] == "acta_palabra_clave.pdf"

    sin_resultados = db.list_history(palabra_clave="esto-no-existe-en-ningun-lado")
    assert sin_resultados == []


def test_list_history_resiste_intento_de_inyeccion_sql():
    """palabra_clave se pasa siempre como parametro (%s) al ILIKE, nunca concatenado en el
    texto del SQL -- un payload de inyeccion se trata como un simple criterio de busqueda de
    texto (sin coincidencias), no como codigo SQL."""
    db.save_document("acta_para_sqli.pdf", "texto normal del relato", "", None)

    payload = "x'; DROP TABLE documentos; --"
    registros = db.list_history(palabra_clave=payload)
    assert registros == []

    # La tabla documentos debe seguir intacta y aceptando consultas normales despues del intento
    assert db.count_saves("acta_para_sqli.pdf") == 1


def test_count_saves():
    filename = "acta_contada.pdf"
    assert db.count_saves(filename) == 0
    db.save_document(filename, "texto", "resumen", None)
    assert db.count_saves(filename) == 1
    db.save_document(filename, "texto de nuevo", "resumen de nuevo", None)
    assert db.count_saves(filename) == 2  # cada guardado es un registro nuevo, no un upsert


def test_registro_es_inmutable_no_permite_update():
    """El trigger de db/schema.sql debe bloquear un UPDATE directo -- RF-06 pide que el
    historial sea un registro inmutable, no solo por convencion de que la app nunca escriba
    UPDATE, sino tambien a nivel de base de datos."""
    doc_id = db.save_document("acta_inmutable.pdf", "texto", "resumen", None)
    with pytest.raises(psycopg.errors.RaiseException):
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE documentos SET resumen = 'modificado' WHERE id = %s", (doc_id,))
            conn.commit()


def test_registro_es_inmutable_no_permite_delete():
    doc_id = db.save_document("acta_inmutable_delete.pdf", "texto", "resumen", None)
    with pytest.raises(psycopg.errors.RaiseException):
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM documentos WHERE id = %s", (doc_id,))
            conn.commit()


def test_get_stats_cuenta_por_categoria():
    db.save_document("acta_stats.pdf", "texto", "resumen", ENTIDADES_EJEMPLO)
    stats = db.get_stats()
    assert stats["total_documentos"] >= 1
    assert stats["por_categoria"]["vehiculo"] >= 1
    assert stats["por_categoria"]["arma"] >= 1
    assert stats["por_categoria"]["droga"] >= 1


def test_is_connected_true_cuando_hay_servidor():
    assert db.is_connected() is True


def test_get_entidades_detalle_no_agrupa_como_get_entidades_resumen():
    """A diferencia de get_entidades_resumen() (GROUP BY), cada guardado debe generar su propia
    fila en el detalle -- es la fuente que necesita una tabla dinamica de Excel real."""
    entidades = {"vehiculos": {"marcas": ["Toyota"], "modelos": [], "colores": [], "anios": [],
                                "patentes": []}, "armas": {}, "drogas": {}}
    db.save_document("acta_detalle_1.pdf", "texto", "resumen", entidades)
    db.save_document("acta_detalle_2.pdf", "texto", "resumen", entidades)

    detalle = db.get_entidades_detalle()
    filas_toyota = [f for f in detalle if f[4] == "Toyota"]
    assert len(filas_toyota) >= 2

    nombres = {f[0] for f in filas_toyota}
    assert "acta_detalle_1.pdf" in nombres
    assert "acta_detalle_2.pdf" in nombres
