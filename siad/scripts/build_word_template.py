"""Genera la plantilla Word institucional bajo formato APA con tipografía Arial,
logo PDI con fondo transparente y recuadros formales para cada categoría de entidad.

Diseño formal institucional unificado para Alto Mando:
- Tipografía: Arial uniforme en todo el documento (14 pt título, 12 pt encabezados/cuerpo, 10.5 pt tablas, 8.5 pt pie).
- Logo PDI sin fondo: Imagen PNG con transparencia alpha en la cabecera institucional.
- Paleta sobria y ejecutiva: Azul Marino Institucional PDI (#0B2A5B), Gris Carbón (#1F2937),
  Gris Pizarra (#64748B) y fondos sutiles (#F8FAFC). Se eliminaron completamente colores
  informales (amarillos mostaza, morados, rojos encendidos, cian/naranja saturados) para
  cumplir el estándar protocolar del Alto Mando.
- Recuadros de Entidades: Diseño unificado en Azul Marino PDI (#0B2A5B) con división sutil.
- Indicadores N.N.A.: Tarjetas métricas ejecutivas sobrias y formales.
- Márgenes reglamentarios: 2.54 cm en laterales e inferior; 2.80 cm en superior.
- Cabecera Institucional: Logotipo PDI y membrete anclados en section.header (1.0 cm de distancia).
- Etiquetas Jinja2 limpias y unificadas para docxtpl.
"""

from pathlib import Path
import docx
from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Cm, Inches, Pt, RGBColor

BASE_DIR = Path(__file__).resolve().parent.parent
WORD_TEMPLATES_DIR = BASE_DIR / "word_templates"
DOCS_DIR = BASE_DIR / "docs"
OUT_PATH_ACTA = WORD_TEMPLATES_DIR / "acta_template.docx"
OUT_PATH_DOCS = DOCS_DIR / "Plantilla_Word.docx"
LOGO_PATH = BASE_DIR / "static" / "img" / "pdi-logo-blue.png"
if not LOGO_PATH.is_file():
    LOGO_PATH = BASE_DIR / "static" / "img" / "pdi-logo-transparent.png"
if not LOGO_PATH.is_file():
    LOGO_PATH = BASE_DIR / "static" / "img" / "pdi-logo.jpg"

COLOR_PDI_NAVY = RGBColor(11, 42, 91)      # #0B2A5B - Azul Marino Institucional PDI
COLOR_TEXT_MAIN = RGBColor(31, 41, 55)     # #1F2937 - Gris Carbón Formal
COLOR_MUTED = RGBColor(100, 116, 139)     # #64748B - Gris Pizarra Medio
DEFAULT_FONT = "Arial"

# Constantes de diseño formal ejecutivo PDI (Alto Mando)
HEX_PDI_NAVY = "0B2A5B"
HEX_BG_LABEL = "F8FAFC"
HEX_BORDER_NAVY = "0B2A5B"
HEX_BORDER_SUBTLE = "CBD5E1"
HEX_BORDER_DIVIDER = "E2E8F0"


def set_cell_margins(cell, top=70, bottom=70, left=120, right=120):
    """Establece relleno interno (padding dxa) en celdas de tabla."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement("w:tcMar")
    for m, val in [("top", top), ("bottom", bottom), ("left", left), ("right", right)]:
        node = OxmlElement(f"w:{m}")
        node.set(qn("w:w"), str(val))
        node.set(qn("w:type"), "dxa")
        tcMar.append(node)
    tcPr.append(tcMar)


def set_cell_shading(cell, color_hex):
    """Aplica color de fondo a una celda."""
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    tcPr.append(shd)


def apply_recuadro_borders(table, border_color=HEX_BORDER_NAVY, inner_color=HEX_BORDER_DIVIDER):
    """Aplica formato de recuadro cerrado con borde exterior e interior horizontal."""
    tblPr = table._tbl.tblPr
    tblBorders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>\n'
        f'  <w:top w:val="single" w:sz="6" w:space="0" w:color="{border_color}"/>\n'
        f'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="{border_color}"/>\n'
        f'  <w:left w:val="single" w:sz="6" w:space="0" w:color="{border_color}"/>\n'
        f'  <w:right w:val="single" w:sz="6" w:space="0" w:color="{border_color}"/>\n'
        f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="{inner_color}"/>\n'
        f'  <w:insideV w:val="none"/>\n'
        f'</w:tblBorders>'
    )
    tblPr.append(tblBorders)


def apply_grid_borders(table, border_color=HEX_BORDER_SUBTLE):
    """Aplica formato de tabla con cuadrícula sobria y nítida en todas las celdas."""
    tblPr = table._tbl.tblPr
    tblBorders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>\n'
        f'  <w:top w:val="single" w:sz="6" w:space="0" w:color="{border_color}"/>\n'
        f'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="{border_color}"/>\n'
        f'  <w:left w:val="single" w:sz="6" w:space="0" w:color="{border_color}"/>\n'
        f'  <w:right w:val="single" w:sz="6" w:space="0" w:color="{border_color}"/>\n'
        f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>\n'
        f'  <w:insideV w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>\n'
        f'</w:tblBorders>'
    )
    tblPr.append(tblBorders)


def remove_table_borders(table):
    """Elimina completamente todos los bordes de la tabla."""
    tblPr = table._tbl.tblPr
    tblBorders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>\n'
        f'  <w:top w:val="none"/>\n'
        f'  <w:bottom w:val="none"/>\n'
        f'  <w:left w:val="none"/>\n'
        f'  <w:right w:val="none"/>\n'
        f'  <w:insideH w:val="none"/>\n'
        f'  <w:insideV w:val="none"/>\n'
        f'</w:tblBorders>'
    )
    tblPr.append(tblBorders)


def add_apa_styled_run(paragraph, text, bold=False, italic=False, size_pt=11, color=COLOR_TEXT_MAIN, font_name=DEFAULT_FONT):
    """Agrega un run con tipografía Arial garantizando nodo XML limpio."""
    run = paragraph.add_run(text)
    run.font.name = font_name
    run.font.size = Pt(size_pt)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = color
    return run


def create_entity_recuadro(doc, title, rows_data):
    """Crea una tabla con recuadro formal institucional unificado para una categoría de entidad.
    
    Diseño sobrio para Alto Mando: encabezado Azul Marino Institucional PDI uniforme,
    columna de etiquetas en gris pizarra suave y texto formal sin colores informales.
    """
    table = doc.add_table(rows=len(rows_data) + 1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    apply_recuadro_borders(table, border_color=HEX_BORDER_NAVY, inner_color=HEX_BORDER_DIVIDER)

    header = table.rows[0].cells[0].merge(table.rows[0].cells[1])
    set_cell_margins(header, top=85, bottom=85, left=130, right=130)
    set_cell_shading(header, HEX_PDI_NAVY)
    p_header = header.paragraphs[0]
    p_header.paragraph_format.space_before = Pt(1)
    p_header.paragraph_format.space_after = Pt(1)
    add_apa_styled_run(p_header, title.upper(), bold=True, size_pt=10, color=RGBColor(255, 255, 255), font_name=DEFAULT_FONT)

    col_widths = [Cm(5.0), Cm(11.0)]

    for row_idx, (campo, valor_tag) in enumerate(rows_data):
        row = table.rows[row_idx + 1]
        
        # Celda Campo (Izquierda) - Fondo suave y texto sobrio en azul marino institucional
        cell_0 = row.cells[0]
        cell_0.width = col_widths[0]
        set_cell_margins(cell_0, top=65, bottom=65, left=110, right=110)
        set_cell_shading(cell_0, HEX_BG_LABEL)
        p0 = cell_0.paragraphs[0]
        p0.paragraph_format.space_before = Pt(2)
        p0.paragraph_format.space_after = Pt(2)
        p0.paragraph_format.line_spacing = 1.15
        add_apa_styled_run(p0, campo, bold=True, size_pt=10, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)

        # Celda Valor (Derecha) - Fondo blanco y texto oscuro estándar
        cell_1 = row.cells[1]
        cell_1.width = col_widths[1]
        set_cell_margins(cell_1, top=65, bottom=65, left=110, right=110)
        set_cell_shading(cell_1, "FFFFFF")
        p1 = cell_1.paragraphs[0]
        p1.paragraph_format.space_before = Pt(2)
        p1.paragraph_format.space_after = Pt(2)
        p1.paragraph_format.line_spacing = 1.15
        add_apa_styled_run(p1, valor_tag, bold=False, size_pt=10, color=COLOR_TEXT_MAIN, font_name=DEFAULT_FONT)

    doc.add_paragraph().paragraph_format.space_after = Pt(6)


def create_nna_cards(doc):
    """Tarjetas ejecutivas de indicadores N.N.A. con diseño formal y sobrio para Alto Mando.
    
    Elimina colores saturados (cian, naranjo) y unifica con paleta institucional.
    """
    table = doc.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    apply_recuadro_borders(table, border_color=HEX_BORDER_SUBTLE, inner_color="FFFFFF")
    cards = [
        ("VÍCTIMAS MENORES DE EDAD (N.N.A.)", "{{ Victimas_Menores }}"),
        ("DETENIDOS MENORES DE EDAD (N.N.A.)", "{{ Detenidos_Menores }}"),
    ]
    for idx, (label, value) in enumerate(cards):
        cell = table.cell(0, idx)
        cell.width = Cm(8.0)
        set_cell_margins(cell, top=100, bottom=100, left=130, right=130)
        set_cell_shading(cell, HEX_BG_LABEL)
        
        p_label = cell.paragraphs[0]
        p_label.paragraph_format.space_before = Pt(1)
        p_label.paragraph_format.space_after = Pt(2)
        add_apa_styled_run(p_label, label, bold=True, size_pt=8.5, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)
        
        p_value = cell.add_paragraph()
        p_value.paragraph_format.space_before = Pt(0)
        p_value.paragraph_format.space_after = Pt(1)
        add_apa_styled_run(p_value, value, bold=True, size_pt=18, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)
        
        p_caption = cell.add_paragraph()
        p_caption.paragraph_format.space_before = Pt(0)
        p_caption.paragraph_format.space_after = Pt(1)
        add_apa_styled_run(p_caption, "Personas detectadas en el documento", size_pt=8.5, color=COLOR_MUTED, font_name=DEFAULT_FONT)
    doc.add_paragraph().paragraph_format.space_after = Pt(6)


def build():
    doc = Document()
    section = doc.sections[0]

    # --- Configuración de Márgenes ---
    # 2.54 cm en laterales e inferior; 2.80 cm en superior para espacio seguro de cabecera
    section.top_margin = Cm(2.80)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(2.54)
    section.right_margin = Cm(2.54)
    section.header_distance = Cm(1.0)
    section.footer_distance = Cm(1.2)

    # --- Membrete Institucional (Header) con Logo sin fondo ---
    header = section.header
    header_table = header.add_table(rows=1, cols=2, width=Cm(16.0))
    header_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    header_table.autofit = False
    remove_table_borders(header_table)

    # Celda 0: Logo PDI sin fondo
    c_logo = header_table.cell(0, 0)
    c_logo.width = Cm(3.2)
    c_logo.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p_logo = c_logo.paragraphs[0]
    p_logo.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_logo.paragraph_format.space_before = Pt(0)
    p_logo.paragraph_format.space_after = Pt(2)
    if LOGO_PATH.is_file():
        run_img = p_logo.add_run()
        run_img.add_picture(str(LOGO_PATH), height=Pt(32))

    # Celda 1: Texto Institucional
    c_text = header_table.cell(0, 1)
    c_text.width = Cm(12.8)
    c_text.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p_inst = c_text.paragraphs[0]
    p_inst.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p_inst.paragraph_format.space_before = Pt(0)
    p_inst.paragraph_format.space_after = Pt(1)
    add_apa_styled_run(p_inst, "POLICÍA DE INVESTIGACIONES DE CHILE", bold=True, size_pt=10, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)

    p_sub = c_text.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(2)
    add_apa_styled_run(p_sub, "Sistema de Análisis Documental, OCR y Estadísticas — SIAD", italic=True, size_pt=8.5, color=COLOR_MUTED, font_name=DEFAULT_FONT)

    # --- Pie de Página (Footer) ---
    footer = section.footer
    p_foot = footer.paragraphs[0]
    p_foot.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_foot.paragraph_format.space_before = Pt(4)
    p_foot.paragraph_format.space_after = Pt(0)
    add_apa_styled_run(
        p_foot,
        "Documento emitido para análisis policial — Estándar APA 7ma Edición — Confidencial",
        italic=True,
        size_pt=8.5,
        color=COLOR_MUTED,
        font_name=DEFAULT_FONT,
    )

    # --- CUERPO DEL DOCUMENTO ---

    # 1. Título Principal (Centrado, Negrita, 14 pt, Arial)
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(6)
    p_title.paragraph_format.space_after = Pt(14)
    p_title.paragraph_format.line_spacing = 1.15
    add_apa_styled_run(p_title, "INFORME DE ANÁLISIS DOCUMENTAL", bold=True, size_pt=14, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)

    p_rule = doc.add_paragraph()
    p_rule.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_rule.paragraph_format.space_before = Pt(0)
    p_rule.paragraph_format.space_after = Pt(10)
    add_apa_styled_run(p_rule, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", bold=True, size_pt=7.5, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)

    # 2. Tabla de Metadatos del Documento (Recuadro formal sutil)
    meta_table = doc.add_table(rows=2, cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_table.autofit = False
    apply_recuadro_borders(meta_table, border_color=HEX_BORDER_SUBTLE, inner_color=HEX_BORDER_DIVIDER)

    meta_rows = [
        ("Documento Analizado:", "{{ Nombre_Documento }}"),
        ("Fecha de Generación:", "{{ Fecha_Generacion }}"),
    ]
    for r_idx, (k, v) in enumerate(meta_rows):
        row = meta_table.rows[r_idx]
        cell_k, cell_v = row.cells[0], row.cells[1]
        cell_k.width = Cm(4.8)
        cell_v.width = Cm(11.2)
        set_cell_margins(cell_k, top=60, bottom=60, left=100, right=100)
        set_cell_margins(cell_v, top=60, bottom=60, left=100, right=100)
        set_cell_shading(cell_k, HEX_BG_LABEL)
        set_cell_shading(cell_v, "FFFFFF")
        
        pk = cell_k.paragraphs[0]
        pk.paragraph_format.space_before = Pt(2)
        pk.paragraph_format.space_after = Pt(2)
        add_apa_styled_run(pk, k, bold=True, size_pt=10, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)

        pv = cell_v.paragraphs[0]
        pv.paragraph_format.space_before = Pt(2)
        pv.paragraph_format.space_after = Pt(2)
        add_apa_styled_run(pv, v, bold=False, size_pt=10, color=COLOR_TEXT_MAIN, font_name=DEFAULT_FONT)

    # 3. Sección Resumen de Diligencia
    p_h1 = doc.add_paragraph()
    p_h1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_h1.paragraph_format.space_before = Pt(18)
    p_h1.paragraph_format.space_after = Pt(8)
    p_h1.paragraph_format.keep_with_next = True
    add_apa_styled_run(p_h1, "1. Resumen de Diligencia", bold=True, size_pt=12, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)

    ficha_table = doc.add_table(rows=8, cols=2)
    ficha_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    ficha_table.autofit = False
    apply_grid_borders(ficha_table, border_color=HEX_BORDER_SUBTLE)

    col_widths = [Cm(3.8), Cm(12.2)]
    
    rows_data = [
        ("Fecha", "{{ Fecha_Hecho }}"),
        ("Unidad", "{{ Unidad }}"),
        ("Hecho", "{{ Hecho }}"),
        ("Detenido", "{{ Detenidos }}"),
        ("Víctima", "{{ Victimas }}"),
        ("Detenidos menores de edad", "{{ Detenidos_Menores }}"),
        ("Víctimas menores de edad", "{{ Victimas_Menores }}"),
        ("Resumen Diligencia", "{{ Resumen_Relato }}"),
    ]

    for row_idx, (campo, valor_tag) in enumerate(rows_data):
        row = ficha_table.rows[row_idx]
        
        # Celda Campo (Izquierda) - Fondo suave y texto formal en Azul Marino Institucional
        cell_0 = row.cells[0]
        cell_0.width = col_widths[0]
        set_cell_margins(cell_0, top=65, bottom=65, left=110, right=110)
        set_cell_shading(cell_0, HEX_BG_LABEL)
        p0 = cell_0.paragraphs[0]
        p0.paragraph_format.space_before = Pt(2)
        p0.paragraph_format.space_after = Pt(2)
        add_apa_styled_run(p0, campo, bold=True, size_pt=10, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)

        # Celda Valor (Derecha) - Fondo blanco y texto oscuro estándar
        cell_1 = row.cells[1]
        cell_1.width = col_widths[1]
        set_cell_margins(cell_1, top=65, bottom=65, left=110, right=110)
        set_cell_shading(cell_1, "FFFFFF")
        p1 = cell_1.paragraphs[0]
        p1.paragraph_format.space_before = Pt(2)
        p1.paragraph_format.space_after = Pt(2)
        add_apa_styled_run(p1, valor_tag, bold=False, size_pt=10, color=COLOR_TEXT_MAIN, font_name=DEFAULT_FONT)

    doc.add_paragraph().paragraph_format.space_after = Pt(16)

    p_nna = doc.add_paragraph()
    p_nna.paragraph_format.space_before = Pt(5)
    p_nna.paragraph_format.space_after = Pt(5)
    p_nna.paragraph_format.keep_with_next = True
    add_apa_styled_run(p_nna, "INDICADORES DE NIÑOS, NIÑAS Y ADOLESCENTES", bold=True, size_pt=10.5, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)
    create_nna_cards(doc)

    doc.add_paragraph("{%p if tiene_entidades %}")
    # 4. Sección Entidades Identificadas
    p_h2 = doc.add_paragraph()
    p_h2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_h2.paragraph_format.space_before = Pt(18)
    p_h2.paragraph_format.space_after = Pt(10)
    p_h2.paragraph_format.keep_with_next = True
    add_apa_styled_run(p_h2, "2. Entidades Identificadas", bold=True, size_pt=12, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)

    doc.add_paragraph("{%p if tiene_vehiculos %}")
    # 4.1 Vehículos en Recuadro
    p_sub_veh = doc.add_paragraph()
    p_sub_veh.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_sub_veh.paragraph_format.space_before = Pt(10)
    p_sub_veh.paragraph_format.space_after = Pt(4)
    p_sub_veh.paragraph_format.keep_with_next = True
    add_apa_styled_run(p_sub_veh, "2.1 Vehículos Detectados", bold=True, size_pt=11.5, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)

    create_entity_recuadro(doc, "Vehículos detectados", [
        ("Marcas:", "{{ Marcas }}"),
        ("Modelos:", "{{ Modelos }}"),
        ("Colores:", "{{ Colores }}"),
        ("Años de Fabricación:", "{{ Anios }}"),
        ("Patentes / PPU:", "{{ Patentes_PPU }}"),
    ])
    doc.add_paragraph("{%p endif %}")

    doc.add_paragraph("{%p if tiene_armas %}")
    # 4.2 Armas en Recuadro
    p_sub_arm = doc.add_paragraph()
    p_sub_arm.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_sub_arm.paragraph_format.space_before = Pt(10)
    p_sub_arm.paragraph_format.space_after = Pt(4)
    p_sub_arm.paragraph_format.keep_with_next = True
    add_apa_styled_run(p_sub_arm, "2.2 Armas de Fuego Detectadas", bold=True, size_pt=11.5, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)

    create_entity_recuadro(doc, "Armas de fuego detectadas", [
        ("Marcas:", "{{ Marcas_Arma }}"),
        ("Modelos:", "{{ Modelos_Arma }}"),
        ("Tipo de Arma:", "{{ Tipo }}"),
        ("Calibres:", "{{ Calibres }}"),
        ("Números de Serie:", "{{ Numerosdeserie }}"),
    ])
    doc.add_paragraph("{%p endif %}")

    doc.add_paragraph("{%p if tiene_drogas %}")
    # 4.3 Drogas en Recuadro
    p_sub_dro = doc.add_paragraph()
    p_sub_dro.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_sub_dro.paragraph_format.space_before = Pt(10)
    p_sub_dro.paragraph_format.space_after = Pt(4)
    p_sub_dro.paragraph_format.keep_with_next = True
    add_apa_styled_run(p_sub_dro, "2.3 Sustancias Ilícitas Detectadas", bold=True, size_pt=11.5, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)

    create_entity_recuadro(doc, "Sustancias ilícitas detectadas", [
        ("Sustancias:", "{{ Sustancias }}"),
        ("Medidas / Pesajes:", "{{ Medidas_pesajes }}"),
    ])
    doc.add_paragraph("{%p endif %}")

    doc.add_paragraph("{%p if tiene_personas %}")
    # 4.4 Personas Involucradas
    p_sub_per = doc.add_paragraph()
    p_sub_per.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_sub_per.paragraph_format.space_before = Pt(10)
    p_sub_per.paragraph_format.space_after = Pt(4)
    p_sub_per.paragraph_format.keep_with_next = True
    add_apa_styled_run(p_sub_per, "2.4 Personas Involucradas", bold=True, size_pt=11.5, color=COLOR_PDI_NAVY, font_name=DEFAULT_FONT)

    create_entity_recuadro(doc, "Personas involucradas y N.N.A.", [
        ("Detenidos / Imputados:", "{{ Detenidos }}"),
        ("Víctimas Identificadas:", "{{ Victimas }}"),
        ("Detenidos menores de edad:", "{{ Detenidos_Menores }}"),
        ("Víctimas menores de edad:", "{{ Victimas_Menores }}"),
        ("Detalle detenidos menores:", "{{ Detenidos_Menores_Detalle }}"),
        ("Detalle víctimas menores:", "{{ Victimas_Menores_Detalle }}"),
    ])
    doc.add_paragraph("{%p endif %}")

    doc.add_paragraph("{%p endif %}")
    
    doc.add_paragraph("{%p if advertencia_faltantes %}")
    p_adv = doc.add_paragraph()
    p_adv.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_adv.paragraph_format.space_before = Pt(12)
    add_apa_styled_run(p_adv, "Nota: ", bold=True, italic=True, size_pt=10, color=COLOR_MUTED, font_name=DEFAULT_FONT)
    add_apa_styled_run(p_adv, "{{ advertencia_faltantes }}", italic=True, size_pt=10, color=COLOR_MUTED, font_name=DEFAULT_FONT)
    doc.add_paragraph("{%p endif %}")

    # Guardar en ambas rutas
    WORD_TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    doc.save(OUT_PATH_ACTA)
    doc.save(OUT_PATH_DOCS)
    print(f"OK: Generada plantilla en {OUT_PATH_ACTA}")
    print(f"OK: Generada plantilla en {OUT_PATH_DOCS}")


if __name__ == "__main__":
    build()
