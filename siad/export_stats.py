"""Módulo de exportación de reportes estadísticos institucionales en Excel para SIAD.

Diseño ejecutivo de alta fidelidad con:
- Portada ejecutiva con Tablero de Indicadores (8 KPIs con estilos PDI).
- Tablas consolidadas con porcentajes, totales y protocolos.
- Gráficos integrados de distribución y tendencias temporales.
- Hojas individuales formateadas por categoría (Vehículos, Armas, Drogas, Personas, Víctimas, NNA, Tendencias).
- Hoja de datos en bruto formateada como Tabla de Excel para tablas dinámicas (RF-07).
"""

from datetime import datetime
import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

# Paleta institucional PDI / SIAD
C_NAVY_DARK = "00234C"
C_NAVY_MED = "0A366D"
C_NAVY_LIGHT = "1E4B8A"
C_GOLD = "FFD100"
C_GOLD_DARK = "C69214"
C_BORDER_GRAY = "E2E8F0"
C_BG_LIGHT = "F8FAFC"
C_BG_ZEBRA = "F1F5F9"

STATS_SHEET_NAMES = {
    "vehiculo": "Vehiculos",
    "arma": "Armas",
    "droga": "Drogas",
}

STATS_ENTITY_STYLE = {
    "vehiculo": ("0284C7", "F0F9FF", "BAE6FD", "0369A1", "Vehículos"),
    "arma": ("DC2626", "FEF2F2", "FECACA", "991B1B", "Armas"),
    "droga": ("D97706", "FFFBEB", "FDE68A", "92400E", "Sustancias"),
    "persona": ("7C3AED", "FAF5FF", "DDD6FE", "5B21B6", "Personas"),
    "victima": ("059669", "ECFDF5", "A7F3D0", "065F46", "Víctimas"),
    "victima_menor": ("0891B2", "ECFEFF", "A5F3FC", "155E75", "Víctimas menores"),
    "detenido_menor": ("EA580C", "FFF7ED", "FED7AA", "9A3412", "Detenidos menores"),
}


def _excel_thin_border(color=C_BORDER_GRAY):
    s = Side(style="thin", color=color)
    return Border(left=s, right=s, top=s, bottom=s)


def _excel_header_border():
    return Border(
        bottom=Side(style="medium", color=C_GOLD),
        left=Side(style="thin", color="1E3A8A"),
        right=Side(style="thin", color="1E3A8A"),
        top=Side(style="thin", color="1E3A8A"),
    )


def _excel_total_row_border():
    return Border(
        top=Side(style="thin", color=C_NAVY_DARK),
        bottom=Side(style="double", color=C_NAVY_DARK),
        left=Side(style="thin", color=C_BORDER_GRAY),
        right=Side(style="thin", color=C_BORDER_GRAY),
    )


def _setup_page_print(ws, landscape=True):
    """Configura la orientación y ajuste de página para exportación/impresión impecable."""
    if landscape:
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    else:
        ws.page_setup.orientation = ws.ORIENTATION_PORTRAIT
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True


def _style_kpi_card(ws, start_row, start_col, badge_text, title_text, value_val, unit_text, accent, tint, border_col):
    """Genera una tarjeta métrica ejecutiva en un bloque de 2 columnas x 4 filas."""
    end_row = start_row + 3
    end_col = start_col + 1

    for r in range(start_row, end_row + 1):
        for c in range(start_col, end_col + 1):
            cell = ws.cell(row=r, column=c)
            cell.fill = PatternFill("solid", fgColor=tint)

            top_s = Side(style="thin", color=border_col) if r == start_row else None
            bottom_s = Side(style="thin", color=border_col) if r == end_row else None
            left_s = Side(style="medium", color=accent) if c == start_col else None
            right_s = Side(style="thin", color=border_col) if c == end_col else None
            cell.border = Border(top=top_s, bottom=bottom_s, left=left_s, right=right_s)

    # Fila 1: Badge / Categoría
    ws.merge_cells(start_row=start_row, start_column=start_col, end_row=start_row, end_column=end_col)
    b_cell = ws.cell(row=start_row, column=start_col)
    b_cell.value = f"● {badge_text}"
    b_cell.font = Font(name="Segoe UI", size=8, bold=True, color=accent)
    b_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[start_row].height = 18

    # Fila 2: Título de la métrica
    ws.merge_cells(start_row=start_row + 1, start_column=start_col, end_row=start_row + 1, end_column=end_col)
    t_cell = ws.cell(row=start_row + 1, column=start_col)
    t_cell.value = title_text
    t_cell.font = Font(name="Segoe UI", size=9, bold=True, color="334155")
    t_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[start_row + 1].height = 16

    # Fila 3: Valor Numérico
    ws.merge_cells(start_row=start_row + 2, start_column=start_col, end_row=start_row + 2, end_column=end_col)
    v_cell = ws.cell(row=start_row + 2, column=start_col)
    try:
        v_cell.value = int(value_val)
    except (ValueError, TypeError):
        v_cell.value = 0
    v_cell.font = Font(name="Segoe UI", size=20, bold=True, color=accent)
    v_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    v_cell.number_format = "#,##0"
    ws.row_dimensions[start_row + 2].height = 28

    # Fila 4: Unidad técnica
    ws.merge_cells(start_row=start_row + 3, start_column=start_col, end_row=start_row + 3, end_column=end_col)
    u_cell = ws.cell(row=start_row + 3, column=start_col)
    u_cell.value = unit_text.upper()
    u_cell.font = Font(name="Segoe UI", size=8, bold=True, color="64748B")
    u_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[start_row + 3].height = 16


def _excel_add_title(hoja, titulo, subtitulo, max_col=8):
    """Crea una franja institucional PDI en la parte superior de una hoja."""
    hoja.insert_rows(1, amount=3)
    hoja.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max_col)
    hoja.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max_col)

    title = hoja.cell(1, 1, titulo)
    title.fill = PatternFill("solid", fgColor=C_NAVY_DARK)
    title.font = Font(name="Segoe UI", size=14, bold=True, color="FFFFFF")
    title.alignment = Alignment(horizontal="left", vertical="center", indent=1)

    subtitle = hoja.cell(2, 1, subtitulo)
    subtitle.fill = PatternFill("solid", fgColor=C_NAVY_MED)
    subtitle.font = Font(name="Segoe UI", size=9.5, italic=True, color="DCEBFF")
    subtitle.alignment = Alignment(horizontal="left", vertical="center", indent=1)

    hoja.merge_cells(start_row=3, start_column=1, end_row=3, end_column=max_col)
    gold_bar = hoja.cell(3, 1, "")
    gold_bar.fill = PatternFill("solid", fgColor=C_GOLD)

    hoja.row_dimensions[1].height = 28
    hoja.row_dimensions[2].height = 20
    hoja.row_dimensions[3].height = 4


def _excel_style_sheet_header(hoja, color=C_NAVY_DARK, header_row=1):
    """Aplica el encabezado institucional a una tabla de datos."""
    fill = PatternFill("solid", fgColor=color)
    white = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
    for cell in hoja[header_row]:
        cell.fill = fill
        cell.font = white
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = Border(
            bottom=Side(style="medium", color=C_GOLD),
            top=Side(style="thin", color=color),
            left=Side(style="thin", color=color),
            right=Side(style="thin", color=color),
        )
    hoja.row_dimensions[header_row].height = 26


def _excel_style_data_rows(hoja, accent, tint, numeric_column=3, first_data_row=2):
    """Da lectura ejecutiva a una tabla sin alterar sus valores ni su rango."""
    for row in hoja.iter_rows(min_row=first_data_row, max_row=hoja.max_row):
        for cell in row:
            cell.font = Font(name="Segoe UI", size=9.5, color="1F2937")
            cell.alignment = Alignment(vertical="center", wrap_text=True)
            cell.border = _excel_thin_border(C_BORDER_GRAY)
        if row[0].row % 2 == 0:
            for cell in row:
                cell.fill = PatternFill("solid", fgColor=tint)
        if len(row) >= numeric_column:
            num_cell = row[numeric_column - 1]
            num_cell.font = Font(name="Segoe UI", size=10, bold=True, color=accent)
            num_cell.alignment = Alignment(horizontal="center", vertical="center")
            num_cell.number_format = "#,##0"


def _excel_create_nna_sheet(workbook, stats):
    hoja = workbook.create_sheet("NNA")
    hoja.sheet_properties.tabColor = "0891B2"
    _setup_page_print(hoja, landscape=False)

    hoja.append(["Indicador", "Cantidad", "Clasificación"])
    counts = (stats or {}).get("por_categoria", {})
    hoja.append(["Víctimas menores de edad", int(counts.get("victima_menor", 0) or 0), "Víctimas / N.N.A."])
    hoja.append(["Detenidos menores de edad", int(counts.get("detenido_menor", 0) or 0), "Detenidos / N.N.A."])
    _excel_add_title(hoja, "INDICADORES N.N.A. — PROTECCIÓN Y CONTROL PENAL ADOLESCENTE", "Víctimas y detenidos menores de edad identificados en el período · Ley 20.084 RPA", 3)
    _excel_style_sheet_header(hoja, color="0891B2", header_row=4)
    _excel_style_data_rows(hoja, "0891B2", "ECFEFF", 2, first_data_row=5)
    for row_number, (accent, tint) in zip((5, 6), (("0891B2", "ECFEFF"), ("EA580C", "FFF7ED"))):
        for cell in hoja[row_number]:
            cell.fill = PatternFill("solid", fgColor=tint)
        hoja.cell(row_number, 1).font = Font(name="Segoe UI", size=10, bold=True, color=accent)
        hoja.cell(row_number, 2).font = Font(name="Segoe UI", size=11, bold=True, color=accent)
    hoja.column_dimensions["A"].width = 36
    hoja.column_dimensions["B"].width = 16
    hoja.column_dimensions["C"].width = 26
    hoja.freeze_panes = "A5"
    hoja.auto_filter.ref = f"A4:C{hoja.max_row}"
    hoja.sheet_view.showGridLines = True
    return hoja


def _excel_create_trends_sheet(workbook, stats, periodo="Histórico completo"):
    """Crea una hoja ejecutiva con la evolución temporal y un gráfico de tendencias."""
    tendencias = (stats or {}).get("tendencias", [])
    if not tendencias:
        return None

    hoja = workbook.create_sheet("Tendencias")
    hoja.sheet_properties.tabColor = "1E3A8A"
    _setup_page_print(hoja, landscape=True)

    _excel_add_title(hoja, "EVOLUCIÓN TEMPORAL DE EVIDENCIAS Y ENTIDADES", f"Policía de Investigaciones de Chile · {periodo}", 8)

    headers = ["Período", "Vehículos", "Armamento", "Sustancias", "Imputados", "Víctimas", "Víctimas Menores", "Detenidos Menores"]
    hoja.append(headers)
    _excel_style_sheet_header(hoja, color=C_NAVY_DARK, header_row=4)

    for item in tendencias:
        hoja.append([
            item.get("label", ""),
            item.get("vehiculos", 0),
            item.get("armas", 0),
            item.get("drogas", 0),
            item.get("personas", 0),
            item.get("victimas", 0),
            item.get("victimas_menores", 0),
            item.get("detenidos_menores", 0),
        ])

    start_data = 5
    end_data = hoja.max_row

    for r in range(start_data, end_data + 1):
        is_even = (r % 2 == 0)
        for c in range(1, 9):
            cell = hoja.cell(row=r, column=c)
            cell.font = Font(name="Segoe UI", size=9.5)
            cell.border = _excel_thin_border(C_BORDER_GRAY)
            if is_even:
                cell.fill = PatternFill("solid", fgColor=C_BG_LIGHT)
            if c == 1:
                cell.font = Font(name="Segoe UI", size=9.5, bold=True, color="334155")
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.number_format = "#,##0"

    tot_row = end_data + 1
    hoja.cell(row=tot_row, column=1, value="TOTAL CONSOLIDADO")
    hoja.cell(row=tot_row, column=1).font = Font(name="Segoe UI", size=10, bold=True, color=C_NAVY_DARK)
    hoja.cell(row=tot_row, column=1).alignment = Alignment(horizontal="center", vertical="center")
    hoja.cell(row=tot_row, column=1).border = _excel_total_row_border()
    hoja.cell(row=tot_row, column=1).fill = PatternFill("solid", fgColor=C_BG_ZEBRA)

    for c in range(2, 9):
        col_letter = get_column_letter(c)
        tot_cell = hoja.cell(row=tot_row, column=c, value=f"=SUM({col_letter}{start_data}:{col_letter}{end_data})")
        tot_cell.font = Font(name="Segoe UI", size=10, bold=True, color=C_NAVY_DARK)
        tot_cell.alignment = Alignment(horizontal="center", vertical="center")
        tot_cell.number_format = "#,##0"
        tot_cell.border = _excel_total_row_border()
        tot_cell.fill = PatternFill("solid", fgColor=C_BG_ZEBRA)
    hoja.row_dimensions[tot_row].height = 22

    hoja.column_dimensions["A"].width = 14
    for c in "BCDEFGH":
        hoja.column_dimensions[c].width = 15

    chart = LineChart()
    chart.title = "Evolución Mensual de Hallazgos y Entidades"
    chart.style = 10
    chart.height = 10
    chart.width = 20
    chart.y_axis.title = "Cantidad"
    chart.x_axis.title = "Período"

    data = Reference(hoja, min_col=2, min_row=4, max_col=8, max_row=end_data)
    cats = Reference(hoja, min_col=1, min_row=5, max_row=end_data)
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)

    hoja.add_chart(chart, "A" + str(tot_row + 2))
    hoja.freeze_panes = "A5"
    hoja.sheet_view.showGridLines = True
    return hoja


def build_stats_workbook(filas, detalle=None, stats=None, periodo="Histórico completo"):
    """Reporte institucional exportable SIAD con diseño ejecutivo, tarjetas KPI, tablas estilizadas y gráficos."""
    agrupado = {"vehiculo": [], "arma": [], "droga": [], "persona": [], "victima": []}
    for categoria, campo, valor, n in filas:
        agrupado.setdefault(categoria, []).append((campo, valor, n))

    workbook = Workbook()
    workbook.remove(workbook.active)

    counts_cat = (stats or {}).get("por_categoria", {})
    total_docs = (stats or {}).get("total_documentos", 0)
    if not total_docs and detalle:
        total_docs = len({d[0] for d in detalle})

    v_count = counts_cat.get("vehiculo", sum(int(x[2] or 0) for x in agrupado.get("vehiculo", [])))
    a_count = counts_cat.get("arma", sum(int(x[2] or 0) for x in agrupado.get("arma", [])))
    d_count = counts_cat.get("droga", sum(int(x[2] or 0) for x in agrupado.get("droga", [])))
    p_count = counts_cat.get("persona", sum(int(x[2] or 0) for x in agrupado.get("persona", [])))
    vic_count = counts_cat.get("victima", sum(int(x[2] or 0) for x in agrupado.get("victima", [])))
    vic_menor_count = counts_cat.get("victima_menor", 0)
    det_menor_count = counts_cat.get("detenido_menor", 0)

    # =========================================================================
    # HOJA 1: RESUMEN EJECUTIVO (DASHBOARD)
    # =========================================================================
    resumen = workbook.create_sheet("Resumen")
    resumen.sheet_properties.tabColor = C_NAVY_DARK
    resumen.sheet_view.showGridLines = True
    _setup_page_print(resumen, landscape=True)

    # 1. Header Institucional
    resumen.merge_cells("A1:H1")
    h1 = resumen["A1"]
    h1.value = "POLICÍA DE INVESTIGACIONES DE CHILE"
    h1.fill = PatternFill("solid", fgColor=C_NAVY_DARK)
    h1.font = Font(name="Segoe UI", size=9.5, bold=True, color="FFFFFF")
    h1.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    resumen.row_dimensions[1].height = 18

    resumen.merge_cells("A2:H2")
    h2 = resumen["A2"]
    h2.value = "SISTEMA INTEGRADO DE ANÁLISIS DOCUMENTAL — TABLERO ESTADÍSTICO"
    h2.fill = PatternFill("solid", fgColor=C_NAVY_DARK)
    h2.font = Font(name="Segoe UI", size=14, bold=True, color="FFFFFF")
    h2.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    resumen.row_dimensions[2].height = 26

    resumen.merge_cells("A3:H3")
    h3 = resumen["A3"]
    h3.value = f"Informe de Evidencias y Análisis Forense  ·  Período: {periodo}  ·  Generado: {datetime.now().strftime('%d-%m-%Y %H:%M')}"
    h3.fill = PatternFill("solid", fgColor=C_NAVY_MED)
    h3.font = Font(name="Segoe UI", size=9, italic=True, color="DCEBFF")
    h3.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    resumen.row_dimensions[3].height = 18

    # Franja Dorada Institucional
    resumen.merge_cells("A4:H4")
    gold = resumen["A4"]
    gold.fill = PatternFill("solid", fgColor=C_GOLD)
    resumen.row_dimensions[4].height = 4

    # Metadatos / Barra de Estado Operativo
    resumen.merge_cells("A5:B5")
    resumen["A5"] = f"PERÍODO: {periodo.upper()}"
    resumen.merge_cells("C5:D5")
    resumen["C5"] = f"EMISIÓN: {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    resumen.merge_cells("E5:F5")
    resumen["E5"] = "CLASIFICACIÓN: RESERVADO"
    resumen.merge_cells("G5:H5")
    resumen["G5"] = f"EXPEDIENTES: {total_docs} PROCESADOS"

    for c in ["A5", "C5", "E5", "G5"]:
        resumen[c].fill = PatternFill("solid", fgColor=C_BG_ZEBRA)
        resumen[c].font = Font(name="Segoe UI", size=8.5, bold=True, color="334155")
        resumen[c].alignment = Alignment(horizontal="center", vertical="center")
        resumen[c].border = _excel_thin_border(C_BORDER_GRAY)
    resumen.row_dimensions[5].height = 20

    resumen.row_dimensions[6].height = 8

    # 2. Panel de Tarjetas Métricas (2 Filas x 4 Tarjetas)
    _style_kpi_card(resumen, 7, 1, "EXPEDIENTES OCR", "Documentos Procesados", total_docs, "Partes Policiales", "0047AB", "EFF6FF", "BFDBFE")
    _style_kpi_card(resumen, 7, 3, "CONTROL VEHICULAR", "Vehículos Detectados", v_count, "Unidades Motorizadas", "0284C7", "F0F9FF", "BAE6FD")
    _style_kpi_card(resumen, 7, 5, "CONTROL BALÍSTICO", "Armamento Identificado", a_count, "Armas y Municiones", "DC2626", "FEF2F2", "FECACA")
    _style_kpi_card(resumen, 7, 7, "LEY 20.000 DROGAS", "Sustancias Ilícitas", d_count, "Incautaciones", "D97706", "FFFBEB", "FDE68A")

    resumen.row_dimensions[11].height = 8

    _style_kpi_card(resumen, 12, 1, "REGISTRO BIOMÉTRICO", "Personas Identificadas", p_count, "Sujetos e Imputados", "7C3AED", "FAF5FF", "DDD6FE")
    _style_kpi_card(resumen, 12, 3, "REGISTRO GENERAL", "Víctimas Identificadas", vic_count, "Casos Totales", "059669", "ECFDF5", "A7F3D0")
    _style_kpi_card(resumen, 12, 5, "PRIORIDAD N.N.A.", "Víctimas Menores", vic_menor_count, "Niños, Niñas y Adol.", "0891B2", "ECFEFF", "A5F3FC")
    _style_kpi_card(resumen, 12, 7, "CONTROL LEY RPA", "Detenidos Menores", det_menor_count, "Infractores N.N.A.", "EA580C", "FFF7ED", "FED7AA")

    resumen.row_dimensions[16].height = 12

    # 3. Título de Sección Central: Consolidado y Distribución
    resumen.merge_cells("A17:D17")
    sec_title = resumen["A17"]
    sec_title.value = "DISTRIBUCIÓN Y CONSOLIDADO DE EVIDENCIAS"
    sec_title.font = Font(name="Segoe UI", size=10.5, bold=True, color=C_NAVY_DARK)
    sec_title.alignment = Alignment(horizontal="left", vertical="center")
    resumen.row_dimensions[17].height = 20

    # Tabla de Distribución (Filas 18 a 26)
    table_headers = ["Categoría / Entidad", "Registros", "% Participación", "Protocolo / Estado"]
    for i, h in enumerate(table_headers, start=1):
        c = resumen.cell(row=18, column=i, value=h)
        c.fill = PatternFill("solid", fgColor=C_NAVY_DARK)
        c.font = Font(name="Segoe UI", size=9, bold=True, color="FFFFFF")
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = _excel_header_border()
    resumen.row_dimensions[18].height = 22

    cat_rows = [
        ("Vehículos Detectados", v_count, "Control Tránsito / Encargo", "0284C7", "F0F9FF"),
        ("Armamento y Municiones", a_count, "Control Balístico / Arsenal", "DC2626", "FEF2F2"),
        ("Sustancias Ilícitas", d_count, "Ley 20.000 / Químico", "D97706", "FFFBEB"),
        ("Personas / Imputados", p_count, "Verificación Biometría ABIS", "7C3AED", "FAF5FF"),
        ("Víctimas Identificadas", vic_count, "Protección a Víctimas", "059669", "ECFDF5"),
        ("Víctimas Menores (N.N.A.)", vic_menor_count, "Protocolo Especial N.N.A.", "0891B2", "ECFEFF"),
        ("Detenidos Menores (RPA)", det_menor_count, "Responsabilidad Penal Ley 20.084", "EA580C", "FFF7ED"),
    ]

    total_entidades = sum([v_count, a_count, d_count, p_count, vic_count])
    total_safe = max(total_entidades, 1)

    start_table_row = 19
    for idx, (cat_name, count_val, proto, acc, bg_tint) in enumerate(cat_rows):
        cur_row = start_table_row + idx
        resumen.row_dimensions[cur_row].height = 19

        c1 = resumen.cell(row=cur_row, column=1, value=cat_name)
        c1.font = Font(name="Segoe UI", size=9, bold=True, color=acc)
        c1.alignment = Alignment(horizontal="left", vertical="center", indent=1)
        c1.fill = PatternFill("solid", fgColor=bg_tint)
        c1.border = _excel_thin_border()

        c2 = resumen.cell(row=cur_row, column=2, value=int(count_val))
        c2.font = Font(name="Segoe UI", size=9.5, bold=True, color="1E293B")
        c2.alignment = Alignment(horizontal="center", vertical="center")
        c2.number_format = "#,##0"
        c2.fill = PatternFill("solid", fgColor=bg_tint)
        c2.border = _excel_thin_border()

        pct_val = count_val / total_safe if idx < 5 else (count_val / total_safe)
        c3 = resumen.cell(row=cur_row, column=3, value=pct_val)
        c3.font = Font(name="Segoe UI", size=9, color="334155")
        c3.alignment = Alignment(horizontal="center", vertical="center")
        c3.number_format = "0.0%"
        c3.fill = PatternFill("solid", fgColor=bg_tint)
        c3.border = _excel_thin_border()

        c4 = resumen.cell(row=cur_row, column=4, value=proto)
        c4.font = Font(name="Segoe UI", size=8.5, italic=True, color="475569")
        c4.alignment = Alignment(horizontal="left", vertical="center", indent=1)
        c4.fill = PatternFill("solid", fgColor=bg_tint)
        c4.border = _excel_thin_border()

    # Fila de Total
    tot_row = start_table_row + len(cat_rows)
    resumen.row_dimensions[tot_row].height = 20
    t1 = resumen.cell(row=tot_row, column=1, value="TOTAL EVIDENCIAS (Top 5)")
    t1.font = Font(name="Segoe UI", size=9.5, bold=True, color=C_NAVY_DARK)
    t1.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    t1.fill = PatternFill("solid", fgColor=C_BG_ZEBRA)
    t1.border = _excel_total_row_border()

    t2 = resumen.cell(row=tot_row, column=2, value=f"=SUM(B{start_table_row}:B{start_table_row + 4})")
    t2.font = Font(name="Segoe UI", size=10, bold=True, color=C_NAVY_DARK)
    t2.alignment = Alignment(horizontal="center", vertical="center")
    t2.number_format = "#,##0"
    t2.fill = PatternFill("solid", fgColor=C_BG_ZEBRA)
    t2.border = _excel_total_row_border()

    t3 = resumen.cell(row=tot_row, column=3, value=1.0)
    t3.font = Font(name="Segoe UI", size=9.5, bold=True, color=C_NAVY_DARK)
    t3.alignment = Alignment(horizontal="center", vertical="center")
    t3.number_format = "0.0%"
    t3.fill = PatternFill("solid", fgColor=C_BG_ZEBRA)
    t3.border = _excel_total_row_border()

    t4 = resumen.cell(row=tot_row, column=4, value="Consolidado General Activo")
    t4.font = Font(name="Segoe UI", size=8.5, bold=True, color=C_NAVY_DARK)
    t4.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    t4.fill = PatternFill("solid", fgColor=C_BG_ZEBRA)
    t4.border = _excel_total_row_border()

    # Gráfico de Barras al lado derecho (Cols F a H, filas 17 a 26)
    chart = BarChart()
    chart.type = "bar"
    chart.style = 10
    chart.title = "Distribución de Evidencias Identificadas"
    chart.height = 7.0
    chart.width = 13.5
    data_ref = Reference(resumen, min_col=2, min_row=18, max_row=start_table_row + 4)
    cats_ref = Reference(resumen, min_col=1, min_row=19, max_row=start_table_row + 4)
    chart.add_data(data_ref, titles_from_data=True)
    chart.set_categories(cats_ref)
    chart.legend = None
    resumen.add_chart(chart, "F17")

    # 4. Sección de Rankings y Destacados (Fila 28 en adelante)
    rankings_row = tot_row + 2
    resumen.row_dimensions[rankings_row].height = 10

    top_header_row = rankings_row + 1
    resumen.merge_cells(start_row=top_header_row, start_column=1, end_row=top_header_row, end_column=4)
    th1 = resumen.cell(row=top_header_row, column=1, value="HALLAZGOS DESTACADOS: SUSTANCIAS Y ARMAMENTO")
    th1.font = Font(name="Segoe UI", size=10, bold=True, color=C_NAVY_DARK)
    th1.alignment = Alignment(horizontal="left", vertical="center")

    resumen.merge_cells(start_row=top_header_row, start_column=5, end_row=top_header_row, end_column=8)
    th2 = resumen.cell(row=top_header_row, column=5, value="HALLAZGOS DESTACADOS: PARQUE VEHICULAR")
    th2.font = Font(name="Segoe UI", size=10, bold=True, color=C_NAVY_DARK)
    th2.alignment = Alignment(horizontal="left", vertical="center")
    resumen.row_dimensions[top_header_row].height = 20

    sub_head_row = top_header_row + 1
    for c_idx, text in [(1, "Elemento / Sustancia"), (2, "Tipo"), (3, "Frecuencia"), (4, "Prioridad")]:
        cell = resumen.cell(row=sub_head_row, column=c_idx, value=text)
        cell.fill = PatternFill("solid", fgColor=C_NAVY_MED)
        cell.font = Font(name="Segoe UI", size=8.5, bold=True, color="FFFFFF")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = _excel_header_border()

    for c_idx, text in [(5, "Marca / Tipo Vehículo"), (6, "Categoría"), (7, "Registros"), (8, "Estado")]:
        cell = resumen.cell(row=sub_head_row, column=c_idx, value=text)
        cell.fill = PatternFill("solid", fgColor=C_NAVY_MED)
        cell.font = Font(name="Segoe UI", size=8.5, bold=True, color="FFFFFF")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = _excel_header_border()
    resumen.row_dimensions[sub_head_row].height = 20

    top_drogas = (stats or {}).get("top_sustancias", [])[:4]
    top_armas = (stats or {}).get("top_marcas_armas", [])[:2]
    left_items = []
    for d in top_drogas:
        left_items.append((d.get("nombre", ""), "Droga / Sustancia", d.get("count", 0), "Alta Prioridad"))
    for a in top_armas:
        left_items.append((a.get("nombre", ""), "Armamento", a.get("count", 0), "Control Balístico"))
    if not left_items:
        left_items = [("Sin registros de sustancias", "General", 0, "N/A")]

    top_vehiculos = (stats or {}).get("top_marcas_vehiculos", [])[:5]
    right_items = []
    for v in top_vehiculos:
        name_clean = v.get("nombre", "")
        if len(name_clean) > 30:
            name_clean = name_clean[:28] + "..."
        right_items.append((name_clean, "Vehículo", v.get("count", 0), "Control Vehicular"))
    if not right_items:
        right_items = [("Sin registros de vehículos", "General", 0, "N/A")]

    max_sub_rows = max(len(left_items), len(right_items))
    for r_i in range(max_sub_rows):
        cur_r = sub_head_row + 1 + r_i
        resumen.row_dimensions[cur_r].height = 18
        bg = C_BG_LIGHT if r_i % 2 == 0 else "FFFFFF"

        if r_i < len(left_items):
            elem, tipo, cnt, prio = left_items[r_i]
            resumen.cell(row=cur_r, column=1, value=elem).font = Font(name="Segoe UI", size=8.5, bold=True, color="1E293B")
            resumen.cell(row=cur_r, column=2, value=tipo).font = Font(name="Segoe UI", size=8, color="475569")
            resumen.cell(row=cur_r, column=3, value=cnt).font = Font(name="Segoe UI", size=8.5, bold=True, color="D97706")
            resumen.cell(row=cur_r, column=3).number_format = "#,##0"
            resumen.cell(row=cur_r, column=3).alignment = Alignment(horizontal="center")
            resumen.cell(row=cur_r, column=4, value=prio).font = Font(name="Segoe UI", size=8, italic=True, color="059669")
            for c_i in range(1, 5):
                resumen.cell(row=cur_r, column=c_i).fill = PatternFill("solid", fgColor=bg)
                resumen.cell(row=cur_r, column=c_i).border = _excel_thin_border()
        else:
            for c_i in range(1, 5):
                resumen.cell(row=cur_r, column=c_i).border = _excel_thin_border()

        if r_i < len(right_items):
            elem, tipo, cnt, prio = right_items[r_i]
            resumen.cell(row=cur_r, column=5, value=elem).font = Font(name="Segoe UI", size=8.5, bold=True, color="1E293B")
            resumen.cell(row=cur_r, column=6, value=tipo).font = Font(name="Segoe UI", size=8, color="475569")
            resumen.cell(row=cur_r, column=7, value=cnt).font = Font(name="Segoe UI", size=8.5, bold=True, color="7C3AED")
            resumen.cell(row=cur_r, column=7).number_format = "#,##0"
            resumen.cell(row=cur_r, column=7).alignment = Alignment(horizontal="center")
            resumen.cell(row=cur_r, column=8, value=prio).font = Font(name="Segoe UI", size=8, italic=True, color="0284C7")
            for c_i in range(5, 9):
                resumen.cell(row=cur_r, column=c_i).fill = PatternFill("solid", fgColor=bg)
                resumen.cell(row=cur_r, column=c_i).border = _excel_thin_border()
        else:
            for c_i in range(5, 9):
                resumen.cell(row=cur_r, column=c_i).border = _excel_thin_border()

    footer_r = sub_head_row + 1 + max_sub_rows + 1
    resumen.merge_cells(start_row=footer_r, start_column=1, end_row=footer_r, end_column=8)
    foot_cell = resumen.cell(row=footer_r, column=1)
    foot_cell.value = "NOTA: Las pestañas por entidad consolidan los hallazgos por campo y valor; la hoja 'Datos' contiene el registro en bruto para análisis y tablas dinámicas."
    foot_cell.font = Font(name="Segoe UI", size=8, italic=True, color="64748B")

    # Columnas equilibradas para encajar perfecto en pantalla y A4 apaisado
    resumen.column_dimensions["A"].width = 24
    resumen.column_dimensions["B"].width = 12
    resumen.column_dimensions["C"].width = 16
    resumen.column_dimensions["D"].width = 26
    resumen.column_dimensions["E"].width = 28
    resumen.column_dimensions["F"].width = 12
    resumen.column_dimensions["G"].width = 12
    resumen.column_dimensions["H"].width = 16

    # =========================================================================
    # HOJAS ESPECÍFICAS POR ENTIDAD
    # =========================================================================
    for categoria, nombre_hoja in STATS_SHEET_NAMES.items():
        hoja = workbook.create_sheet(nombre_hoja)
        accent, tint, border_c, text_c, label_es = STATS_ENTITY_STYLE.get(categoria, ("0047AB", "EFF6FF", "BFDBFE", "1E3A8A", nombre_hoja))
        hoja.sheet_properties.tabColor = accent
        hoja.sheet_view.showGridLines = True
        _setup_page_print(hoja, landscape=False)

        hoja.append(["Campo", "Valor", "Conteo"])

        for campo, valor, n in agrupado.get(categoria, []):
            hoja.append([campo, valor, n])

        _excel_add_title(hoja, f"REGISTROS CONSOLIDADOS: {label_es.upper()}", f"Sistema Integrado de Análisis Documental · {periodo}", 3)
        _excel_style_sheet_header(hoja, color=accent, header_row=4)
        _excel_style_data_rows(hoja, accent, tint, 3, first_data_row=5)

        hoja.column_dimensions["A"].width = 18
        hoja.column_dimensions["B"].width = 40
        hoja.column_dimensions["C"].width = 14

        if agrupado.get(categoria):
            tabla = Table(displayName=f"Tabla{nombre_hoja}", ref=f"A4:C{hoja.max_row}")
            tabla.tableStyleInfo = TableStyleInfo(
                name="TableStyleMedium2", showRowStripes=True, showFirstColumn=False,
            )
            hoja.add_table(tabla)
            hoja.freeze_panes = "A5"

            tot_cat_row = hoja.max_row + 1
            hoja.cell(row=tot_cat_row, column=1, value="TOTAL REGISTROS").font = Font(name="Segoe UI", size=9.5, bold=True, color=accent)
            hoja.cell(row=tot_cat_row, column=1).border = _excel_total_row_border()
            hoja.cell(row=tot_cat_row, column=2, value="").border = _excel_total_row_border()
            tot_val = hoja.cell(row=tot_cat_row, column=3, value=f"=SUM(C5:C{hoja.max_row - 1})")
            tot_val.font = Font(name="Segoe UI", size=10.5, bold=True, color=accent)
            tot_val.alignment = Alignment(horizontal="center")
            tot_val.number_format = "#,##0"
            tot_val.border = _excel_total_row_border()
            hoja.row_dimensions[tot_cat_row].height = 20
        else:
            for cell in hoja[4]:
                cell.font = Font(bold=True)

    # =========================================================================
    # HOJA TENDENCIAS (si stats incluye tendencias)
    # =========================================================================
    if stats and stats.get("tendencias"):
        _excel_create_trends_sheet(workbook, stats, periodo=periodo)

    # =========================================================================
    # HOJA NNA (si stats está disponible)
    # =========================================================================
    if stats is not None:
        _excel_create_nna_sheet(workbook, stats)

    # =========================================================================
    # HOJA DATOS (Bruto para Tablas Dinámicas) - EXACTA SEGÚN ESPECIFICACIÓN RF-07
    # =========================================================================
    hoja_datos = workbook.create_sheet("Datos")
    hoja_datos.sheet_properties.tabColor = "475569"
    hoja_datos.sheet_view.showGridLines = True
    _setup_page_print(hoja_datos, landscape=False)

    hoja_datos.append(["Documento", "Fecha", "Categoria", "Campo", "Valor"])

    for documento, fecha, cat, campo, valor in (detalle or []):
        if cat in ("persona", "victima", "personas"):
            continue
        f_val = fecha.replace(tzinfo=None) if hasattr(fecha, "replace") else fecha
        hoja_datos.append([documento, f_val, cat, campo, valor])

    hoja_datos.column_dimensions["A"].width = 32
    hoja_datos.column_dimensions["B"].width = 18
    hoja_datos.column_dimensions["C"].width = 14
    hoja_datos.column_dimensions["D"].width = 16
    hoja_datos.column_dimensions["E"].width = 36

    _excel_style_sheet_header(hoja_datos, color=C_NAVY_DARK)
    _excel_style_data_rows(hoja_datos, C_NAVY_DARK, "F8FAFC", 5)

    for r in range(2, hoja_datos.max_row + 1):
        f_cell = hoja_datos.cell(row=r, column=2)
        if isinstance(f_cell.value, datetime):
            f_cell.number_format = "yyyy-mm-dd hh:mm"
            f_cell.alignment = Alignment(horizontal="center")

    if detalle:
        tabla = Table(displayName="TablaDatos", ref=f"A1:E{hoja_datos.max_row}")
        tabla.tableStyleInfo = TableStyleInfo(
            name="TableStyleMedium2", showRowStripes=True, showFirstColumn=False,
        )
        hoja_datos.add_table(tabla)
        hoja_datos.freeze_panes = "A2"
        nota = hoja_datos.cell(row=hoja_datos.max_row + 2, column=1)
        nota.value = "Para una tabla dinamica: Insertar > Tabla dinamica, usando este rango como origen."
        nota.font = Font(name="Segoe UI", italic=True, size=9, color="64748B")

    return workbook
