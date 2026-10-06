"""Pruebas de build_stats_workbook() sin depender de PostgreSQL -- usa datos sinteticos con la
misma forma que devuelven db.get_entidades_resumen() y db.get_entidades_detalle()."""

from datetime import datetime, timezone

from app import build_stats_workbook

FILAS_RESUMEN = [
    ("vehiculo", "marcas", "Toyota", 2),
    ("arma", "calibres", "9mm", 1),
]

DETALLE = [
    ("acta_1.pdf", datetime(2026, 8, 21, 14, 40, tzinfo=timezone.utc), "vehiculo", "marcas", "Toyota"),
    ("acta_2.pdf", datetime(2026, 8, 22, 9, 0, tzinfo=timezone.utc), "vehiculo", "marcas", "Toyota"),
    ("acta_2.pdf", datetime(2026, 8, 22, 9, 0, tzinfo=timezone.utc), "arma", "calibres", "9mm"),
]


def test_hoja_datos_incluye_una_fila_por_entidad_sin_agrupar():
    wb = build_stats_workbook(FILAS_RESUMEN, DETALLE)
    assert "Datos" in wb.sheetnames

    hoja = wb["Datos"]
    assert [c.value for c in hoja[1]] == ["Documento", "Fecha", "Categoria", "Campo", "Valor"]
    assert hoja.max_row == 6  # encabezado(1) + 3 filas de detalle(2-4) + fila en blanco(5) + nota(6)


def test_hoja_datos_se_formatea_como_tabla_de_excel_lista_para_pivotear():
    wb = build_stats_workbook(FILAS_RESUMEN, DETALLE)
    hoja = wb["Datos"]

    assert "TablaDatos" in hoja.tables
    tabla = hoja.tables["TablaDatos"]
    assert tabla.ref == "A1:E4"  # encabezado + 3 filas de detalle, sin la fila de la nota


def test_hoja_datos_sin_detalle_no_agrega_tabla_pero_no_falla():
    wb = build_stats_workbook(FILAS_RESUMEN, detalle=[])
    hoja = wb["Datos"]
    assert [c.value for c in hoja[1]] == ["Documento", "Fecha", "Categoria", "Campo", "Valor"]
    assert hoja.tables == {}


def test_fechas_con_zona_horaria_no_rompen_la_exportacion():
    """openpyxl no acepta datetimes con tzinfo -- PostgreSQL (TIMESTAMPTZ) siempre los entrega
    con zona horaria, asi que build_stats_workbook() debe despojarla antes de escribir la celda."""
    wb = build_stats_workbook(FILAS_RESUMEN, DETALLE)
    hoja = wb["Datos"]
    primera_fecha = hoja.cell(row=2, column=2).value
    assert primera_fecha.tzinfo is None
