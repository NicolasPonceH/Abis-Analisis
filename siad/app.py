import hmac
import io
import json
import zipfile
import os
import re
from datetime import datetime, timedelta
import converters
# pyrefly: ignore [missing-import]
import jwt

# pyrefly: ignore [missing-import]
import pymupdf as fitz
# pyrefly: ignore [missing-import]
import pytesseract
# pyrefly: ignore [missing-import]
import spacy
# pyrefly: ignore [missing-import]
import pytextrank  # noqa: F401 -- registra el componente "textrank" en el pipeline de spaCy
# pyrefly: ignore [missing-import]
from docxtpl import DocxTemplate
# pyrefly: ignore [missing-import]
from flask import (
    Flask, Response, flash, redirect, render_template, request, send_from_directory, session,
    url_for, send_file
)
import tempfile
from docx import Document
from docxcompose.composer import Composer
# pyrefly: ignore [missing-import]
from openpyxl import Workbook
# pyrefly: ignore [missing-import]
from openpyxl.styles import Font
from openpyxl.worksheet.table import Table, TableStyleInfo
# pyrefly: ignore [missing-import]
from PIL import Image, ImageOps
# pyrefly: ignore [missing-import]
from werkzeug.utils import secure_filename
# pyrefly: ignore [missing-import]
from werkzeug.security import check_password_hash, generate_password_hash

from dotenv import load_dotenv
load_dotenv()

import db
from entities import extract_entities, highlight_entities_html, normalize_entities

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "static", "uploads")
EXTRACTED_FOLDER = os.path.join(BASE_DIR, "static", "extracted")
SUMMARIES_FOLDER = os.path.join(BASE_DIR, "static", "summaries")
ENTITIES_FOLDER = os.path.join(BASE_DIR, "static", "entities")
EXPORTS_FOLDER = os.path.join(BASE_DIR, "static", "exports")
WORD_TEMPLATE_PATH = os.path.join(BASE_DIR, "word_templates", "acta_template.docx")
TESSDATA_DIR = os.environ.get("TESSDATA_DIR", os.path.join(BASE_DIR, "tessdata"))
ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "bmp", "tiff", "txt", "csv", "log", "docx", "doc", "xlsx", "xls", "pptx", "ppt"}
OCR_LANG = "spa"
MIN_EMBEDDED_TEXT_CHARS = 20  # bajo este umbral se asume PDF escaneado y se usa OCR
SPACY_MODEL = "es_core_news_sm"
SUMMARY_SENTENCES = 3  # cantidad de oraciones que retiene el resumen extractivo

class ReverseProxied(object):
    def __init__(self, app):
        self.app = app
    def __call__(self, environ, start_response):
        script_name = environ.get('HTTP_X_FORWARDED_PREFIX', '')
        if script_name:
            environ['SCRIPT_NAME'] = script_name
            path_info = environ.get('PATH_INFO', '')
            if path_info.startswith(script_name):
                environ['PATH_INFO'] = path_info[len(script_name):]
        return self.app(environ, start_response)

app = Flask(__name__)
app.wsgi_app = ReverseProxied(app.wsgi_app)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["TEMPLATES_AUTO_RELOAD"] = True
# Default de desarrollo documentado, no un secreto real -- sobreescribir con SECRET_KEY en
# cualquier instalacion que no sea localhost (Sprint 9: revision de seguridad).
app.secret_key = os.environ.get("SECRET_KEY", "dev-only-secret")
DEBUG = os.environ.get("FLASK_DEBUG", "0") == "1"
# Default de desarrollo documentado, no un secreto real -- sobreescribir con APP_PASSWORD en
# cualquier instalacion que no sea localhost.
LOGIN_EXEMPT_ENDPOINTS = {"login", "static", "register", "forgot_password", "verify_password"}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(EXTRACTED_FOLDER, exist_ok=True)
os.makedirs(SUMMARIES_FOLDER, exist_ok=True)
os.makedirs(ENTITIES_FOLDER, exist_ok=True)
os.makedirs(EXPORTS_FOLDER, exist_ok=True)

if os.environ.get("TESSERACT_CMD"):
    pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]
elif os.name == "nt" and os.path.exists(r"C:\Program Files\Tesseract-OCR\tesseract.exe"):
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

_nlp = spacy.load(SPACY_MODEL)
_nlp.add_pipe("textrank")
_nlp.max_length = 2_000_000  # actas largas pueden superar el limite por defecto de spaCy

try:
    db.init_schema()
    if db.count_users() == 0:
        db.create_user("admin", generate_password_hash("admin123"), "admin")
except Exception as exc:  # PostgreSQL puede no estar disponible; el resto de la app sigue andando
    print(f"Aviso: no se pudo inicializar el esquema de PostgreSQL ({exc}).")

@app.route('/debug_env')
def debug_env():
    return jsonify({
        "SCRIPT_NAME": request.environ.get("SCRIPT_NAME"),
        "PATH_INFO": request.environ.get("PATH_INFO"),
        "HTTP_X_FORWARDED_PREFIX": request.environ.get("HTTP_X_FORWARDED_PREFIX"),
        "url_for_login": url_for("login")
    })

@app.route("/redirect-abis")
def redirect_abis():
    return redirect("/")

@app.route("/api/verify_password", methods=["POST"])
def verify_password():
    data = request.get_json()
    if not data or not data.get("username") or not data.get("password"):
        return {"ok": False}, 400
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT password_hash FROM usuarios WHERE username = %s", (data["username"],))
                row = cur.fetchone()
                if row and check_password_hash(row[0], data["password"]):
                    return {"ok": True}
    except Exception as e:
        print(f"Error verificando password: {e}")
    return {"ok": False}


@app.context_processor
def inject_globals():
    """Estado de conexion mostrado en el indicador del sidebar en todas las paginas y usuario actual."""
    try:
        db_connected = db.is_connected()
    except Exception:
        db_connected = False
        
    def get_user_color_classes(username):
        if not username:
            return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
        
        # Generar un índice consistente basado en el username
        idx = sum(ord(c) for c in str(username)) % 6
        
        colors = [
            "bg-blue-600 text-white border-blue-700 dark:bg-blue-500 dark:border-blue-400",
            "bg-purple-600 text-white border-purple-700 dark:bg-purple-500 dark:border-purple-400",
            "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-500 dark:border-emerald-400",
            "bg-rose-600 text-white border-rose-700 dark:bg-rose-500 dark:border-rose-400",
            "bg-orange-600 text-white border-orange-700 dark:bg-orange-500 dark:border-orange-400",
            "bg-pink-600 text-white border-pink-700 dark:bg-pink-500 dark:border-pink-400"
        ]
        return colors[idx]

    def get_user_row_classes(username):
        if not username:
            return "bg-slate-50/50 hover:bg-slate-100 dark:bg-slate-900/30 dark:hover:bg-slate-800/50 border-slate-200"
            
        idx = sum(ord(c) for c in str(username)) % 6
        
        colors = [
            "bg-blue-50/40 hover:bg-blue-50 dark:bg-blue-900/10 dark:hover:bg-blue-900/20 border-blue-200",
            "bg-purple-50/40 hover:bg-purple-50 dark:bg-purple-900/10 dark:hover:bg-purple-900/20 border-purple-200",
            "bg-emerald-50/40 hover:bg-emerald-50 dark:bg-emerald-900/10 dark:hover:bg-emerald-900/20 border-emerald-200",
            "bg-rose-50/40 hover:bg-rose-50 dark:bg-rose-900/10 dark:hover:bg-rose-900/20 border-rose-200",
            "bg-orange-50/40 hover:bg-orange-50 dark:bg-orange-900/10 dark:hover:bg-orange-900/20 border-orange-200",
            "bg-pink-50/40 hover:bg-pink-50 dark:bg-pink-900/10 dark:hover:bg-pink-900/20 border-pink-200"
        ]
        return colors[idx]

    return {
        "db_connected": db_connected,
        "current_user": session.get("username"),
        "current_role": session.get("rol"),
        "get_user_color_classes": get_user_color_classes,
        "get_user_row_classes": get_user_row_classes
    }


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def is_valid_pdf(path):
    """Confirma que el archivo realmente abre como PDF -- la extension .pdf no lo garantiza
    (Sprint 9: 'sistema estabilizado frente a PDFs corruptos'). Sin esto, un archivo corrupto
    pasa la validacion de subida y recien falla mas tarde, en OCR, con un error poco claro."""
    try:
        with fitz.open(path) as doc:
            return doc.page_count > 0
    except Exception:
        return False


def merge_uploaded_pdfs(file_paths, original_filenames):
    """Une varios PDFs subidos en un solo documento (carga masiva -> un unico archivo a
    procesar). Guarda ademas un archivo de metadatos con los limites de cada archivo original."""
    merged = fitz.open()
    metadata = []
    current_page = 1
    try:
        for path, orig_name in zip(file_paths, original_filenames):
            with fitz.open(path) as part:
                num_pages = part.page_count
                merged.insert_pdf(part)
                metadata.append({
                    "filename": orig_name,
                    "start_page": current_page,
                    "end_page": current_page + num_pages - 1
                })
                current_page += num_pages
        filename = f"carga_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        merged.save(os.path.join(UPLOAD_FOLDER, filename))
        
        with open(os.path.join(UPLOAD_FOLDER, filename + ".meta.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
    finally:
        merged.close()
    return filename


def extracted_text_path(filename):
    return os.path.join(EXTRACTED_FOLDER, f"{filename}.txt")


def summary_text_path(filename):
    return os.path.join(SUMMARIES_FOLDER, f"{filename}.txt")


def summary_options_path(filename):
    return os.path.join(SUMMARIES_FOLDER, f"{filename}_options.json")


def entities_path(filename):
    return os.path.join(ENTITIES_FOLDER, f"{filename}.json")


def load_entities_json(filename):
    """Lee y normaliza el entities.json cacheado, si existe. Si el archivo esta corrupto
    (JSON invalido, truncado a medio escribir) lo trata como si no existiera en vez de
    tumbar la pagina con un error 500."""
    path = entities_path(filename)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return normalize_entities(json.load(f))
    except (json.JSONDecodeError, OSError):
        return None


def guardar_en_historial(filename, raw_text, summary_text, entities_data, usuario_username=None):
    """Intenta guardar un registro inmutable en el historial. No propaga la excepcion si
    PostgreSQL no esta disponible -- guardar es un paso "best effort" que no debe tumbar el
    flujo de analisis del documento (extraer/resumir/identificar entidades sigue funcionando
    igual aunque la base de datos este caida)."""
    try:
        db.save_document(filename, raw_text, summary_text, entities_data, usuario_username)
        return True
    except Exception:
        return False


def export_path(filename):
    return os.path.join(EXPORTS_FOLDER, f"{filename}.docx")


def join_or_placeholder(values):
    return ", ".join(values) if values else "No identificado"


def build_docx_context(filename, summary_text, entities_data):
    """Claves alineadas a las etiquetas Jinja de word_templates/acta_template.docx (plantilla
    institucional provista por el usuario). "Marcas"/"Modelos" quedan reservados para vehiculos;
    la seccion de armas de la plantilla usa "Marcas_Arma"/"Modelos_Arma" -- la plantilla original
    repetia "Marcas"/"Modelos" en ambas secciones, lo que habria mostrado el mismo valor en las
    dos (docxtpl/Jinja no puede resolver dos valores distintos para la misma etiqueta)."""
    entities_data = entities_data or {}
    vehiculos = entities_data.get("vehiculos", {})
    armas = entities_data.get("armas", {})
    drogas = entities_data.get("drogas", {})
    personas = entities_data.get("personas", {})
    metadata = entities_data.get("metadata", {})
    
    fecha_hecho = metadata.get("fecha", "No identificada")
    unidad = metadata.get("unidad", "No identificada")
    hecho = metadata.get("hecho", "No identificado")
    
    # Limpiar saltos de línea excesivos en el resumen para que no se vea desordenado en Word
    clean_summary = "No generado."
    if summary_text:
        import re
        s = summary_text.replace('\r\n', '\n')
        s = re.sub(r'<br\s*/?>', '\n', s, flags=re.IGNORECASE)
        s = re.sub(r'</p>', '\n', s, flags=re.IGNORECASE)
        s = re.sub(r'</li>', '\n', s, flags=re.IGNORECASE)
        s = re.sub(r'<[^>]+>', '', s)
        s = re.sub(r'\n{3,}', '\n\n', s)
        clean_summary = s.strip() if s.strip() else "No generado."

    ctx = {
        "Nombre_Documento": filename,
        "Fecha_Generacion": datetime.now().strftime("%d-%m-%Y %H:%M"),
        "Fecha_Hecho": fecha_hecho if fecha_hecho else "No identificada",
        "Unidad": unidad if unidad else "No identificada",
        "Hecho": hecho if hecho else "No identificado",
        "Resumen_Relato": clean_summary,
        "Marcas": join_or_placeholder(vehiculos.get("marcas")),
        "Modelos": join_or_placeholder(vehiculos.get("modelos")),
        "Colores": join_or_placeholder(vehiculos.get("colores")),
        "Años": join_or_placeholder(vehiculos.get("anios")),
        "Anios": join_or_placeholder(vehiculos.get("anios")),
        "Patentes_PPU": join_or_placeholder(vehiculos.get("patentes")),
        "Marcas_Arma": join_or_placeholder(armas.get("marcas")),
        "Modelos_Arma": join_or_placeholder(armas.get("modelos")),
        "Tipo": join_or_placeholder(armas.get("tipos")),
        "Calibres": join_or_placeholder(armas.get("calibres")),
        "Numerosdeserie": join_or_placeholder(armas.get("series")),
        "Sustancias": join_or_placeholder(drogas.get("sustancias")),
        "Medidas_pesajes": join_or_placeholder(drogas.get("medidas")),
    }
    
    detenidos_lista = personas.get("detenidos", []).copy()
    ruts_lista = personas.get("ruts", []).copy()
    
    if detenidos_lista:
        ctx["Detenidos"] = "\n".join(detenidos_lista)
    elif ruts_lista:
        ctx["Detenidos"] = "Identificados por RUT: " + ", ".join(ruts_lista)
    else:
        ctx["Detenidos"] = "No identificado"
    
    tiene_vehiculos = bool(vehiculos.get("marcas") or vehiculos.get("modelos") or vehiculos.get("colores") or vehiculos.get("anios") or vehiculos.get("patentes"))
    tiene_armas = bool(armas.get("marcas") or armas.get("modelos") or armas.get("tipos") or armas.get("calibres") or armas.get("series"))
    tiene_drogas = bool(drogas.get("sustancias") or drogas.get("medidas"))
    tiene_personas = bool(detenidos_lista or ruts_lista)
    
    tiene_entidades = tiene_vehiculos or tiene_armas or tiene_drogas or tiene_personas
    
    faltantes = []
    if not tiene_vehiculos:
        faltantes.append("Vehículos")
    if not tiene_armas:
        faltantes.append("Armas de Fuego")
    if not tiene_drogas:
        faltantes.append("Sustancias Ilícitas")
    if not tiene_personas:
        faltantes.append("Personas")
        
    if not tiene_entidades:
        advertencia = "No se detectaron entidades (Vehículos, Armas de Fuego, Sustancias Ilícitas, Personas) en el documento analizado."
    elif faltantes:
        advertencia = f"No se detectaron entidades para las categorías de: {', '.join(faltantes)}."
    else:
        advertencia = ""
        
    ctx.update({
        "tiene_entidades": tiene_entidades,
        "tiene_vehiculos": tiene_vehiculos,
        "tiene_armas": tiene_armas,
        "tiene_drogas": tiene_drogas,
        "tiene_personas": tiene_personas,
        "advertencia_faltantes": advertencia,
    })
    
    return ctx


def export_to_docx(filename, summary_options, entities_data):
    subdocuments = entities_data.get("subdocuments") if entities_data else None
    
    subdoc_summaries = []
    if isinstance(summary_options, list):
        for opt in summary_options:
            sel = opt.get("selected", "a")
            subdoc_summaries.append(opt.get(sel, ""))
    elif isinstance(summary_options, dict):
        sel = summary_options.get("selected", "a")
        subdoc_summaries.append(summary_options.get(sel, ""))
    elif isinstance(summary_options, str):
        parts = re.split(r"(=== INICIO DOCUMENTO: .*? ===|=== FIN DOCUMENTO: .*? ===)", summary_options or "")
        current_subdoc_name = None
        current_text = []
        for part in parts:
            if part.startswith("=== INICIO DOCUMENTO:"):
                current_subdoc_name = part.replace("=== INICIO DOCUMENTO: ", "").replace(" ===", "")
            elif part.startswith("=== FIN DOCUMENTO:"):
                subdoc_summaries.append("".join(current_text).strip())
                current_text = []
            else:
                if current_subdoc_name:
                    current_text.append(part)
        if not subdoc_summaries:
            subdoc_summaries.append(summary_options)
                
    if not subdocuments or len(subdocuments) <= 1:
        template = DocxTemplate(WORD_TEMPLATE_PATH)
        doc_name = subdocuments[0].get("filename", filename) if (subdocuments and len(subdocuments) == 1) else filename
        sub_ent = subdocuments[0] if (subdocuments and len(subdocuments) == 1) else entities_data
        summary_to_use = subdoc_summaries[0] if subdoc_summaries else ""
        template.render(build_docx_context(doc_name, summary_to_use, sub_ent))
        template.save(export_path(filename))
        return
    
    master_composer = None
    first_temp_path = None
    
    for i, sub_ent in enumerate(subdocuments):
        sub_name = sub_ent.get("filename", f"Parte_{i+1}")
        sub_summary = subdoc_summaries[i] if (subdoc_summaries and i < len(subdoc_summaries)) else (subdoc_summaries[0] if subdoc_summaries else "")
        
        template = DocxTemplate(WORD_TEMPLATE_PATH)
        template.render(build_docx_context(sub_name, sub_summary, sub_ent))
        
        temp_docx = os.path.join(tempfile.gettempdir(), f"temp_{i}_{filename}.docx")
        template.save(temp_docx)
        
        if i == 0:
            first_temp_path = temp_docx
            master_doc = Document(temp_docx)
            master_composer = Composer(master_doc)
        else:
            master_doc.add_page_break()
            doc_to_append = Document(temp_docx)
            master_composer.append(doc_to_append)
            try:
                os.remove(temp_docx)
            except Exception:
                pass
            
    if master_composer:
        master_composer.save(export_path(filename))
        if first_temp_path and os.path.exists(first_temp_path):
            try:
                os.remove(first_temp_path)
            except Exception:
                pass


STATS_SHEET_NAMES = {"vehiculo": "Vehiculos", "arma": "Armas", "droga": "Drogas"}


def build_stats_workbook(filas, detalle=None):
    """Reporte historico exportable (RF-07) separado por categoria: una hoja de Excel por
    categoria (vehiculo/arma/droga), no todo mezclado en una sola tabla.

    Ademas incluye una hoja "Datos" con el detalle sin agrupar (una fila por entidad
    detectada) formateada como Tabla de Excel real -- es la fuente que hace falta para insertar
    una tabla dinamica: un pivot table resume datos en bruto, no un reporte que ya viene sumado
    por categoria/campo/valor como las otras hojas. openpyxl no puede generar un objeto
    PivotTable nativo de forma confiable desde cero (solo esta pensado para preservar uno ya
    existente al releer un archivo, no para crearlo) -- el riesgo de entregar un .xlsx que Excel
    marque para "reparar" es peor que no tener la funcion. Con los datos ya en una Tabla de
    Excel, insertar la tabla dinamica real es Insertar > Tabla dinamica en dos clics."""
    agrupado = {"vehiculo": [], "arma": [], "droga": []}
    for categoria, campo, valor, n in filas:
        agrupado.setdefault(categoria, []).append((campo, valor, n))

    workbook = Workbook()
    workbook.remove(workbook.active)
    for categoria, nombre_hoja in STATS_SHEET_NAMES.items():
        hoja = workbook.create_sheet(nombre_hoja)
        hoja.append(["Campo", "Valor", "Conteo"])
        
        # Insertar los datos
        for campo, valor, n in agrupado.get(categoria, []):
            hoja.append([campo, valor, n])
            
        # Ajustar anchos
        hoja.column_dimensions["A"].width = 16
        hoja.column_dimensions["B"].width = 32
        hoja.column_dimensions["C"].width = 10
        
        # Aplicar estilo de tabla oficial si hay datos
        if hoja.max_row > 1:
            tabla = Table(displayName=f"Tabla{nombre_hoja}", ref=f"A1:C{hoja.max_row}")
            tabla.tableStyleInfo = TableStyleInfo(
                name="TableStyleMedium2", showRowStripes=True, showFirstColumn=False,
            )
            hoja.add_table(tabla)
            hoja.freeze_panes = "A2"
        else:
            # Si está vacío, solo poner negrita en el encabezado
            for cell in hoja[1]:
                cell.font = Font(bold=True)

    hoja_datos = workbook.create_sheet("Datos")
    hoja_datos.append(["Documento", "Fecha", "Categoria", "Campo", "Valor"])
    for documento, fecha, categoria, campo, valor in (detalle or []):
        hoja_datos.append([documento, fecha.replace(tzinfo=None), categoria, campo, valor])
    hoja_datos.column_dimensions["A"].width = 30
    hoja_datos.column_dimensions["B"].width = 18
    hoja_datos.column_dimensions["C"].width = 14
    hoja_datos.column_dimensions["D"].width = 16
    hoja_datos.column_dimensions["E"].width = 32
    if detalle:
        tabla = Table(displayName="TablaDatos", ref=f"A1:E{hoja_datos.max_row}")
        tabla.tableStyleInfo = TableStyleInfo(
            name="TableStyleMedium2", showRowStripes=True, showFirstColumn=False,
        )
        hoja_datos.add_table(tabla)
        hoja_datos.freeze_panes = "A2"
        nota = hoja_datos.cell(row=hoja_datos.max_row + 2, column=1)
        nota.value = (
            "Para una tabla dinamica: Insertar > Tabla dinamica, usando este rango como origen."
        )
        nota.font = Font(italic=True, size=9)
    return workbook


def preprocess_for_ocr(image):
    """Escala de grises + autocontraste: mejora la lectura de actas escaneadas de baja calidad."""
    return ImageOps.autocontrast(image.convert("L"))


def ocr_page(page):
    pix = page.get_pixmap(dpi=300)
    image = preprocess_for_ocr(Image.open(io.BytesIO(pix.tobytes("png"))))
    # pytesseract usa shlex con posix=False en Windows: no despoja comillas, asi que
    # el path no debe ir entrecomillado aqui (por eso TESSDATA_DIR no debe tener espacios).
    return pytesseract.image_to_string(
        image, lang=OCR_LANG, config=f"--tessdata-dir {TESSDATA_DIR}"
    ).strip()


def extract_text_from_pdf(pdf_path):
    meta_path = pdf_path + ".meta.json"
    metadata = None
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            metadata = json.load(f)
            
    pages_text = []
    with fitz.open(pdf_path) as doc:
        for page_number, page in enumerate(doc, start=1):
            text = page.get_text().strip()
            was_ocr = False
            if len(text) < MIN_EMBEDDED_TEXT_CHARS:
                text = ocr_page(page)
                was_ocr = True
                
            inicio_marker = None
            fin_marker = None
            
            if not metadata:
                # Si no hay metadatos (ej: se subió un solo PDF con múltiples páginas),
                # el usuario indicó que CADA PÁGINA es un reporte independiente y no deben mezclarse.
                inicio_marker = f"=== INICIO DOCUMENTO: Página {page_number} ==="
                fin_marker = f"=== FIN DOCUMENTO: Página {page_number} ==="
            else:
                for subdoc in metadata:
                    if subdoc["start_page"] == page_number:
                        inicio_marker = f"=== INICIO DOCUMENTO: {subdoc['filename']} ==="
                        break
                for subdoc in metadata:
                    if subdoc["end_page"] == page_number:
                        fin_marker = f"=== FIN DOCUMENTO: {subdoc['filename']} ==="
                        break
                        
            chunks = [text]
            if was_ocr:
                import re
                # Dividir heurísticamente si es una imagen de tabla con múltiples filas que empiezan en "Fecha"
                _chunks = re.split(r'\n(?=Fecha\s*\d+)', text, flags=re.IGNORECASE)
                if len(_chunks) > 1:
                    chunks = [c.strip() for c in _chunks if c.strip()]
                    
            if len(chunks) > 1:
                base_name = "Imagen"
                if inicio_marker:
                    base_name = inicio_marker.replace("=== INICIO DOCUMENTO: ", "").replace(" ===", "")
                for i, chunk in enumerate(chunks):
                    pages_text.append(f"=== INICIO DOCUMENTO: {base_name} (Fila {i+1}) ===")
                    pages_text.append(f"--- Pagina {page_number} ---\n{chunk}")
                    pages_text.append(f"=== FIN DOCUMENTO: {base_name} (Fila {i+1}) ===")
            else:
                if inicio_marker:
                    pages_text.append(inicio_marker)
                pages_text.append(f"--- Pagina {page_number} ---\n{text}")
                if fin_marker:
                    pages_text.append(fin_marker)
                        
    return "\n\n".join(pages_text)


import spacy
import pytextrank

try:
    _nlp = spacy.load("es_core_news_sm")
    _nlp.add_pipe("textrank")
    _nlp.max_length = 2_000_000
except OSError:
    _nlp = None

def clean_narrative_text(text):
    """Limpia delimitadores de sistema, numeración de páginas y saltos de línea rotos."""
    if not text:
        return ""
    # Quitar marcadores internos
    text = re.sub(r"=== (?:INICIO|FIN) DOCUMENTO:.*?===", "", text)
    text = re.sub(r"--- P[aá]gina \d+ ---", "", text, flags=re.IGNORECASE)
    # Arreglar guiones al final de línea (ej. foca-\nlizado -> focalizado)
    text = re.sub(r"(\b\w+)-\s*\n\s*(\w+\b)", r"\1\2", text)
    # Quitar asteriscos de formato markdown o OCR residual
    text = re.sub(r"\*+", "", text)
    # Unir líneas rotas dentro del mismo párrafo
    text = re.sub(r"(?<![.:;\n])\n(?!\n)", " ", text)
    # Normalizar espacios
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()

def split_sentences_safely(text):
    """Divide un texto en oraciones respetando abreviaturas jurídicas y policiales comunes."""
    if not text:
        return []
    masked = text
    masks = [
        (r"\bArt\.", "##ART##"),
        (r"\bart\.", "##art##"),
        (r"\bC\.I\.", "##CI##"),
        (r"\bRUN\.", "##RUN##"),
        (r"\bRUT\.", "##RUT##"),
        (r"\bN°", "##NUM##"),
        (r"\bN\.N\.A", "##NNA##"),
        (r"\bJdoGt[ií]a\.", "##JDOGTIA##"),
        (r"\bDr\.", "##DR##"),
        (r"\bDra\.", "##DRA##"),
        (r"\bSr\.", "##SR##"),
        (r"\bSra\.", "##SRA##"),
        (r"\bdomic\.", "##DOMIC##"),
    ]
    for p, repl in masks:
        masked = re.sub(p, repl, masked, flags=re.IGNORECASE)
        
    raw_sents = re.split(r"\.\s+(?=[A-ZÁÉÍÓÚÑ0-9])", masked)
    clean_sents = []
    for s in raw_sents:
        unmasked = s
        for p, repl in masks:
            orig = p.replace(r"\b", "").replace(r"\.", ".").replace("[ií]", "í")
            unmasked = unmasked.replace(repl, orig)
        unmasked = unmasked.strip()
        if unmasked:
            if not unmasked.endswith("."):
                unmasked += "."
            clean_sents.append(unmasked)
    return clean_sents

def parse_police_report(raw_text):
    """Extrae metadatos policiales (delito, tribunal, fecha, brigada, hechos) para estructurar el resumen."""
    data = {}
    clean_text = re.sub(r"\*+", "", raw_text or "")
    
    m_uni = re.search(r"(?:UNIDAD|BRIGADA|\b(?:BICRIM|BRISEX|BRICRIM|BH|BRIANCO|BIDECO|BRICON|BIP|BIPE|BRILAC))\s*[:\.]?\s*([A-ZÁÉÍÓÚÑ\s\.\-]+?)(?=\s+INFORMA|\n|$)", clean_text, re.I)
    if m_uni:
        u = clean_narrative_text(m_uni.group(0))
        u = re.sub(r"\s+INFORMA.*$", "", u, flags=re.IGNORECASE).strip().rstrip(".")
        data["unidad"] = u
    else:
        data["unidad"] = ""
        
    m_fec = re.search(r"(?:FECHA)\s*[:\-]?\s*([0-9A-Za-z\.\-/]+)", clean_text, re.I)
    data["fecha"] = m_fec.group(1).strip().rstrip(".") if m_fec else ""
    
    m_del = re.search(r"(?:DELITO|PROCEDIMIENTO|MOTIVO|ORDEN DE)\s*[:\-]\s*(.*?)(?=\n|$)", clean_text, re.I)
    data["delito"] = clean_narrative_text(m_del.group(1)).rstrip(".") if m_del else ""
    
    m_trib = re.search(r"(?:TRIBUNAL|FISCAL[IÍ]A|JUZGADO|MINISTERIO P[UÚ]BLICO)\s*[:\-]\s*(.*?)(?=\n|$)", clean_text, re.I)
    data["tribunal_fiscalia"] = clean_narrative_text(m_trib.group(1)).rstrip(".") if m_trib else ""
    
    pattern_hechos = r"(?:^|\n)\s*\*?\s*(HECHOS?|DILIGENCIAS?(?:\s+REALIZADAS)?|SÍNTESIS(?:\s+DE\s+LOS\s+HECHOS|\s+DEL\s+RELATO)?|RELATO|ANTECEDENTES|PROCEDIMIENTO)\*?\s*:\s*(.*?)(?=(?:\n\s*\*?(?:DETENID[OAS]+|IMPUTAD[OAS]+|V[IÍ]CTIMAS?|INCAUTACI[OÓ]N|ESPECIES?|ARMAS?|VEH[IÍ]CULOS?|DROGAS?|TRIBUNAL|FISCAL[IÍ]A|INSTRUCCIONES|DISPOSICI[OÓ]N|CONCLUSI[OÓ]N|OBSERVACIONES|=== FIN DOCUMENTO)\*?\s*:)|=== FIN DOCUMENTO|\Z)"
    matches = list(re.finditer(pattern_hechos, raw_text, re.IGNORECASE | re.DOTALL))
    narratives = []
    for m in matches:
        hdr = m.group(1).upper()
        content = clean_narrative_text(m.group(2))
        if not content:
            continue
        if "PROCEDIMIENTO" in hdr and len(content.split()) < 8 and len(matches) > 1:
            continue
        if len(content) > 15:
            narratives.append(content)
            
    if not narratives:
        cleaned = clean_narrative_text(raw_text)
        paragraphs = [
            p.strip() for p in cleaned.split("\n")
            if len(p.strip()) > 30 and not re.match(r"^(UNIDAD|FECHA|DELITO|FISCAL[ÍI]A|TRIBUNAL|DETENIDO|REPORTE|GEPOL)\s*:", p.strip(), re.IGNORECASE)
        ]
        narratives = paragraphs[:3]
        
    data["narrativas"] = narratives
    return data

def build_summary_options(raw_text, entities=None):
    """Genera dos opciones de resumen limpias y fluidas para el parte policial,
       exclusivas para el campo 'Resumen Diligencia' del Word."""
    meta = parse_police_report(raw_text)
    narratives = meta.get("narrativas", [])
    
    # 1. SÍNTESIS CORTA (Opción A)
    sintesis_parts = []
    for nar in narratives:
        sents = split_sentences_safely(nar)
        if len(sents) > 1:
            sintesis_parts.append(f"{sents[0]} {sents[-1]}")
        elif sents:
            sintesis_parts.append(sents[0])
            
    hechos_sinteticos = " ".join(sintesis_parts) if sintesis_parts else "Procedimiento policial ejecutado conforme a las diligencias informadas."
    
    # 2. COMPLETO (Opción B)
    hechos_completos = "<br><br>".join(narratives) if narratives else hechos_sinteticos

    # Devolvemos puramente el relato para no duplicar datos en la tabla del Word
    return {"a": hechos_sinteticos, "b": hechos_completos}

def summarize_text(raw_text, limit_sentences=3):
    options = build_summary_options(raw_text)
    return options.get("a", "")


@app.before_request
def require_login():
    if request.endpoint is None or request.endpoint in LOGIN_EXEMPT_ENDPOINTS:
        return None
    if not session.get("user_id"):
        return redirect(url_for("login", next=request.path))
    return None


@app.route("/login", methods=["GET", "POST"])
def login():
    # request.values (no solo request.args): "next" llega por query string en el primer GET
    # (redirigido desde require_login), pero por el campo oculto del formulario en un POST --
    # incluida la re-renderizacion tras una clave incorrecta, para no perder el destino original.
    next_url = request.values.get("next", "")
    if request.method == "POST":
        username = request.form.get("username", "")
        password = request.form.get("password", "")
        try:
            user = db.get_user_by_username(username)
            if user and check_password_hash(user["password_hash"], password):
                session["user_id"] = user["id"]
                session["username"] = user["username"]
                session["rol"] = user["rol"]
                session["nombre_completo"] = user.get("nombre_completo")
                db.update_last_login(username)
                return redirect(next_url or url_for("index"))
        except Exception:
            pass
        flash("Credenciales incorrectas.")
    return render_template("login.html", next=next_url)


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "")
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")
        nombre_completo = request.form.get("nombre_completo", "")

        if not username or not password or not nombre_completo:
            flash("Todos los campos son obligatorios.")
            return render_template("register.html")

        if password != confirm_password:
            flash("Las contraseñas no coinciden.")
            return render_template("register.html")
            
        try:
            existing_user = db.get_user_by_username(username)
            if existing_user:
                flash("El nombre de usuario ya existe.")
                return render_template("register.html")
                
            db.create_user(username, generate_password_hash(password), nombre_completo=nombre_completo)
            flash("Usuario registrado exitosamente. Ahora puedes iniciar sesión.", "success")
            return redirect(url_for("login"))
        except Exception as e:
            flash(f"Error al registrar usuario: {e}")
            
    return render_template("register.html")


@app.route("/forgot-password", methods=["GET", "POST"])
def forgot_password():
    if request.method == "POST":
        username = request.form.get("username", "")
        new_password = request.form.get("new_password", "")
        confirm_password = request.form.get("confirm_password", "")

        if not username or not new_password:
            flash("Todos los campos son obligatorios.")
            return render_template("forgot_password.html")

        if new_password != confirm_password:
            flash("Las contraseñas no coinciden.")
            return render_template("forgot_password.html")
            
        try:
            user = db.get_user_by_username(username)
            if not user:
                flash("El usuario no existe.")
                return render_template("forgot_password.html")
                
            db.update_password(username, generate_password_hash(new_password))
            flash("Contraseña actualizada exitosamente. Inicia sesión.", "success")
            return redirect(url_for("login"))
        except Exception as e:
            flash(f"Error al actualizar la contraseña: {e}")
            
    return render_template("forgot_password.html")

@app.route("/logout")
def logout():
    motivo = request.args.get("motivo")
    session.clear()
    if motivo == "inactividad":
        flash("Tu sesión ha sido bloqueada por inactividad. Por favor, ingresa nuevamente por tu seguridad.", "warning")
    return redirect(url_for("login"))


@app.route("/")
def index():
    username = session.get("username", "anon")
    rol = session.get("rol", "operador")
    all_files = [f for f in os.listdir(app.config["UPLOAD_FOLDER"]) if allowed_file(f)]
    
    if rol == "admin":
        files = sorted(all_files)
    else:
        files = sorted(f for f in all_files if f.startswith(f"{username}_"))
        
    return render_template("index.html", files=files, viewing=None, active_page="procesar")


def eliminar_documento(filename):
    """Borra el PDF cargado y todos sus archivos derivados (texto extraido, resumen, entidades,
    Word exportado). No toca el historial en PostgreSQL -- esos registros son inmutables por
    diseno (Sprint 7) y no dependen de que el archivo original siga en disco."""
    for ruta in (
        os.path.join(UPLOAD_FOLDER, filename),
        extracted_text_path(filename),
        summary_text_path(filename),
        entities_path(filename),
        export_path(filename),
    ):
        if os.path.isfile(ruta):
            os.remove(ruta)


@app.route("/delete/<filename>", methods=["POST"])
def delete_document(filename):
    username = session.get("username", "anon")
    rol = session.get("rol", "operador")
    filename = secure_filename(filename)
    
    if rol != "admin" and not filename.startswith(f"{username}_"):
        flash("Permiso denegado: No puedes eliminar un documento que no te pertenece.", "error")
        return redirect(url_for("index"))
        
    files = [f for f in os.listdir(app.config["UPLOAD_FOLDER"]) if allowed_file(f)]
    if filename not in files:
        flash("El documento solicitado no existe.", "error")
    else:
        eliminar_documento(filename)
        flash(f"{filename} eliminado.", "success")
    return redirect(url_for("index"))


@app.route("/delete_all", methods=["POST"])
def delete_all_documents():
    username = session.get("username", "anon")
    rol = session.get("rol", "operador")
    all_files = [f for f in os.listdir(app.config["UPLOAD_FOLDER"]) if allowed_file(f)]
    
    if rol == "admin":
        files = all_files
    else:
        files = [f for f in all_files if f.startswith(f"{username}_")]
        
    for filename in files:
        eliminar_documento(filename)
    flash("Se eliminaron todos los documentos de tu espacio de trabajo.", "success")
    return redirect(url_for("index"))


@app.route("/upload_pasted_text", methods=["POST"])
def upload_pasted_text():
    pasted_texts_raw = request.form.getlist("pasted_text")
    pasted_titles_raw = request.form.getlist("pasted_title")
    
    valid_reports = []
    # Usar zip_longest o similar, pero sabemos que llegan en pares por el HTML
    for i in range(len(pasted_texts_raw)):
        txt = pasted_texts_raw[i].strip()
        if txt:
            tit = pasted_titles_raw[i].strip() if i < len(pasted_titles_raw) else ""
            valid_reports.append({"text": txt, "title": tit})
            
    titulo_opcional = request.form.get("titulo_general", "").strip()
    pasted_images = [img for img in request.files.getlist("pasted_images") if img and img.filename]
    
    if not valid_reports and not pasted_images:
        flash("No se proporcionó texto ni imágenes.", "error")
        return redirect(url_for("index"))
        
    fecha_hora = datetime.now().strftime('%d-%m-%Y_%H-%M')
    
    file_paths = []
    original_filenames = []
    
    try:
        # 1. Procesar cada caja de texto
        for idx, report in enumerate(valid_reports):
            txt_filename = f"temp_{fecha_hora}_text_{idx}.txt"
            pdf_filename = f"temp_{fecha_hora}_text_{idx}.pdf"
            txt_path = os.path.join(app.config["UPLOAD_FOLDER"], txt_filename)
            pdf_path = os.path.join(app.config["UPLOAD_FOLDER"], pdf_filename)
            
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(report["text"])
                
            converters.convert_to_pdf(txt_path, pdf_path)
            file_paths.append(pdf_path)
            
            doc_name = report["title"] or f"Reporte_Texto_{idx+1}"
            original_filenames.append(doc_name)
            os.remove(txt_path)
            
        # 2. Procesar cada imagen
        for idx, img_file in enumerate(pasted_images):
            ext = img_file.filename.rsplit(".", 1)[-1].lower() if "." in img_file.filename else "png"
            img_temp_path = os.path.join(app.config["UPLOAD_FOLDER"], f"temp_{fecha_hora}_img_{idx}.{ext}")
            img_pdf_path = os.path.join(app.config["UPLOAD_FOLDER"], f"temp_{fecha_hora}_img_{idx}.pdf")
            
            img_file.save(img_temp_path)
            converters.convert_to_pdf(img_temp_path, img_pdf_path)
            
            file_paths.append(img_pdf_path)
            original_filenames.append(img_file.filename or f"Imagen_Adjunta_{idx+1}")
            os.remove(img_temp_path)
            
        # 3. Unir todo usando la función existente que genera meta.json
        if len(file_paths) == 1 and not titulo_opcional:
            # Caso simple: 1 texto o 1 imagen, sin titulo. 
            # De igual manera podemos usar merge para mantener el flujo de metadatos.
            pass
            
        merged_filename = merge_uploaded_pdfs(file_paths, original_filenames)
        merged_path = os.path.join(app.config["UPLOAD_FOLDER"], merged_filename)
        
        # Si había título, renombramos el resultado
        if titulo_opcional:
            titulo_limpio = secure_filename(titulo_opcional) or "Reporte_WhatsApp"
            new_filename = f"{titulo_limpio}_{fecha_hora}.pdf"
            
            os.rename(merged_path, os.path.join(app.config["UPLOAD_FOLDER"], new_filename))
            if os.path.exists(merged_path + ".meta.json"):
                os.rename(merged_path + ".meta.json", os.path.join(app.config["UPLOAD_FOLDER"], new_filename + ".meta.json"))
            merged_filename = new_filename
            merged_path = os.path.join(app.config["UPLOAD_FOLDER"], merged_filename)
            
        username = session.get("username", "anon")
        if session.get("rol") != "admin" and not merged_filename.startswith(f"{username}_"):
            new_merged_filename = f"{username}_{merged_filename}"
            os.rename(merged_path, os.path.join(app.config["UPLOAD_FOLDER"], new_merged_filename))
            if os.path.exists(merged_path + ".meta.json"):
                os.rename(merged_path + ".meta.json", os.path.join(app.config["UPLOAD_FOLDER"], new_merged_filename + ".meta.json"))
            merged_filename = new_merged_filename
            merged_path = os.path.join(app.config["UPLOAD_FOLDER"], merged_filename)
            
        # Limpiar temporales
        for p in file_paths:
            if os.path.exists(p):
                os.remove(p)
                
    except Exception as e:
        # Limpiar en caso de error
        for p in file_paths:
            if os.path.exists(p): os.remove(p)
            txt_version = p.replace(".pdf", ".txt")
            if os.path.exists(txt_version): os.remove(txt_version)
        flash(f"Error al procesar: {e}", "error")
        return redirect(url_for("index"))
        
    error = extraer_y_cachear_texto(merged_filename, merged_path)
    if error:
        flash(error, "error")
    else:
        flash("Textos e imágenes procesados correctamente.", "success")
        
    return redirect(url_for("view_pdf", filename=merged_filename))


@app.route("/upload", methods=["POST"])
def upload():
    files = [f for f in request.files.getlist("pdf_file") if f and f.filename]
    if not files:
        flash("Selecciona al menos un archivo antes de continuar.", "error")
        return redirect(url_for("index"))
    if not all(allowed_file(f.filename) for f in files):
        flash("Solo se permiten archivos soportados.", "error")
        return redirect(url_for("index"))

    processed_pdf_paths = []
    original_filenames = []

    for f in files:
        original_filename = secure_filename(f.filename)
        if not original_filename:
            continue
            
        username = session.get("username", "anon")
        if not original_filename.startswith(f"{username}_") and session.get("rol") != "admin":
            original_filename = f"{username}_{original_filename}"
            
        temp_path = os.path.join(app.config["UPLOAD_FOLDER"], original_filename)
        pdf_filename_check = original_filename.rsplit(".", 1)[0] + ".pdf" if "." in original_filename else original_filename + ".pdf"
        pdf_path_check = os.path.join(app.config["UPLOAD_FOLDER"], pdf_filename_check)
        
        if os.path.exists(temp_path) or os.path.exists(pdf_path_check):
            flash(f"El documento '{original_filename}' ya fue registrado anteriormente en el sistema. (Protección Antiduplicados)", "error")
            return redirect(url_for("index"))
            
        f.save(temp_path)
        
        ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else ""
        if ext != "pdf":
            pdf_filename = original_filename.rsplit(".", 1)[0] + ".pdf"
            pdf_path = os.path.join(app.config["UPLOAD_FOLDER"], pdf_filename)
            try:
                converters.convert_to_pdf(temp_path, pdf_path)
                os.remove(temp_path)
            except Exception as e:
                os.remove(temp_path)
                flash(f"Error al convertir {original_filename} a PDF: {e}", "error")
                return redirect(url_for("index"))
        else:
            pdf_filename = original_filename
            pdf_path = temp_path
            
        if not is_valid_pdf(pdf_path):
            os.remove(pdf_path)
            flash(f"El archivo {pdf_filename} esta dañado o no es un PDF valido.", "error")
            return redirect(url_for("index"))
            
        processed_pdf_paths.append(pdf_path)
        original_filenames.append(pdf_filename)

    if not processed_pdf_paths:
        flash("El nombre de archivo no es valido.", "error")
        return redirect(url_for("index"))

    if len(processed_pdf_paths) == 1:
        filename = original_filenames[0]
        pdf_path_para_extraer = processed_pdf_paths[0]
    else:
        try:
            filename = merge_uploaded_pdfs(processed_pdf_paths, original_filenames)
            for path in processed_pdf_paths:
                os.remove(path)
        except Exception:
            for path in processed_pdf_paths:
                if os.path.exists(path):
                    os.remove(path)
            flash("No se pudieron unir los documentos seleccionados.", "error")
            return redirect(url_for("index"))
        flash(f"Se unieron {len(processed_pdf_paths)} documentos en un solo PDF: {filename}", "success")
        pdf_path_para_extraer = os.path.join(app.config["UPLOAD_FOLDER"], filename)

    # Extraer el texto (OCR) apenas se sube el documento, sin que haya que presionar "Extraer"
    # a mano -- "best effort": si falla, el documento igual queda cargado y se puede reintentar
    # despues con el boton "Reextraer".
    error = extraer_y_cachear_texto(filename, pdf_path_para_extraer)
    if error:
        flash(error, "error")

    return redirect(url_for("view_pdf", filename=filename))

from flask import jsonify

@app.route("/api/upload", methods=["POST"])
def api_upload():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "No file uploaded"}), 400
        
    original_filename = secure_filename(f.filename)
    temp_path = os.path.join(app.config["UPLOAD_FOLDER"], original_filename)
    pdf_filename_check = original_filename.rsplit(".", 1)[0] + ".pdf" if "." in original_filename else original_filename + ".pdf"
    pdf_path_check = os.path.join(app.config["UPLOAD_FOLDER"], pdf_filename_check)
    
    if os.path.exists(temp_path) or os.path.exists(pdf_path_check):
        return jsonify({"error": f"El documento '{original_filename}' ya fue registrado anteriormente."}), 409
        
    f.save(temp_path)
    
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else ""
    if ext != "pdf":
        pdf_filename = original_filename.rsplit(".", 1)[0] + ".pdf"
        pdf_path = os.path.join(app.config["UPLOAD_FOLDER"], pdf_filename)
        try:
            converters.convert_to_pdf(temp_path, pdf_path)
            os.remove(temp_path)
        except Exception as e:
            os.remove(temp_path)
            return jsonify({"error": f"Error al convertir {original_filename} a PDF: {e}"}), 400
    else:
        pdf_filename = original_filename
        pdf_path = temp_path
        
    if not is_valid_pdf(pdf_path):
        os.remove(pdf_path)
        return jsonify({"error": f"El archivo {pdf_filename} esta dañado o no es un PDF valido."}), 400
        
    # Extraer texto (OCR)
    error = extraer_y_cachear_texto(pdf_filename, pdf_path)
    if error:
        return jsonify({"error": error, "filename": pdf_filename}), 400
        
    # Procesamiento completo automático (Resumen y Entidades)
    try:
        text_path = extracted_text_path(pdf_filename)
        with open(text_path, encoding="utf-8") as file:
            raw_text = file.read()
            
        # 1. Entidades
        ent = extract_entities(raw_text)
        
        # 2. Generar opciones de resumen profesional
        summary_options_list = []
        subdocuments = ent.get("subdocuments")
        
        if subdocuments and len(subdocuments) > 0:
            parts = re.split(r"(=== INICIO DOCUMENTO: .*? ===|=== FIN DOCUMENTO: .*? ===)", raw_text)
            current_subdoc_name = None
            current_text = []
            
            for part in parts:
                if part.startswith("=== INICIO DOCUMENTO:"):
                    current_subdoc_name = part.replace("=== INICIO DOCUMENTO: ", "").replace(" ===", "")
                elif part.startswith("=== FIN DOCUMENTO:"):
                    subdoc_text = "".join(current_text)
                    # We pass None for entities here to let parse_police_report extract narratives directly
                    opts = build_summary_options(subdoc_text, None)
                    summary_options_list.append({
                        "filename": current_subdoc_name,
                        "a": opts["a"],
                        "b": opts["b"],
                        "selected": "a"
                    })
                    current_text = []
                else:
                    if current_subdoc_name:
                        current_text.append(part)
        else:
            summary_opts = build_summary_options(raw_text, ent)
            summary_options_list.append({
                "filename": pdf_filename,
                "a": summary_opts["a"],
                "b": summary_opts["b"],
                "selected": "a"
            })
            
        with open(summary_options_path(pdf_filename), "w", encoding="utf-8") as f_json:
            json.dump(summary_options_list, f_json, ensure_ascii=False, indent=2)
            
        # Guardar la opción A por defecto para exportación
        with open(summary_text_path(pdf_filename), "w", encoding="utf-8") as f_summary:
            # Just save the first one for the plain text summary fallback
            f_summary.write(summary_options_list[0]["a"])
            
        with open(entities_path(pdf_filename), "w", encoding="utf-8") as f_ent:
            json.dump(ent, f_ent, ensure_ascii=False, indent=2)
            
        db.save_document(pdf_filename, ent) # Guardar en BD para historial
            
    except Exception as e:
        # Falla silenciosa de la parte de análisis avanzado, el texto ya está
        pass
        
    return jsonify({"success": True, "filename": pdf_filename})


@app.route("/view/<filename>")
def view_pdf(filename):
    filename = secure_filename(filename)
    files = sorted(f for f in os.listdir(app.config["UPLOAD_FOLDER"]) if allowed_file(f))
    if filename not in files:
        flash("El documento solicitado no existe.", "error")
        return redirect(url_for("index"))
    extracted_text = None
    if os.path.isfile(extracted_text_path(filename)):
        with open(extracted_text_path(filename), encoding="utf-8") as f:
            extracted_text = f.read()
    summary_text = None
    if os.path.isfile(summary_text_path(filename)):
        with open(summary_text_path(filename), encoding="utf-8") as f:
            summary_text = f.read()
            
    summary_options = None
    if os.path.isfile(summary_options_path(filename)):
        with open(summary_options_path(filename), encoding="utf-8") as f:
            summary_options = json.load(f)
            if isinstance(summary_options, dict):
                summary_options = [summary_options]
            
    entities_data = load_entities_json(filename)
    
    # Búsqueda de Inteligencia: Coincidencias Cruzadas
    try:
        cross_references = db.find_cross_references(entities_data, exclude_filename=filename)
    except Exception:
        cross_references = []
        
    has_export = os.path.isfile(export_path(filename))
    try:
        saved_count = db.count_saves(filename)
    except Exception:
        saved_count = None  # base de datos no disponible
    ocr_html = highlight_entities_html(extracted_text, entities_data) if extracted_text else None
    return render_template(
        "index.html",
        files=files,
        viewing=filename,
        extracted_text=extracted_text,
        ocr_html=ocr_html,
        summary_text=summary_text,
        summary_options=summary_options,
        entities_data=entities_data,
        cross_references=cross_references,
        has_export=has_export,
        saved_count=saved_count,
        active_page="procesar",
    )


@app.route("/uploads/<filename>")
def serve_upload(filename):
    filename = secure_filename(filename)
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


def extraer_y_cachear_texto(filename, pdf_path):
    """Corre el OCR/extraccion de texto sobre el PDF y lo cachea en static/extracted/. Se usa
    tanto al subir un documento (para que el texto quede listo sin tener que presionar
    "Extraer") como en el boton manual "Reextraer". Devuelve None si tuvo exito, o un mensaje de
    error legible si fallo -- nunca lanza, para que subir un PDF nunca falle solo porque el OCR
    no pudo procesarlo todavia (el usuario puede reintentar despues con "Reextraer")."""
    try:
        text = extract_text_from_pdf(pdf_path)
    except pytesseract.TesseractNotFoundError:
        return "Tesseract OCR no esta instalado o no se encuentra en el PATH."
    except (fitz.FileDataError, RuntimeError):
        return "El PDF esta dañado o no se pudo leer. Sube el archivo nuevamente."

    with open(extracted_text_path(filename), "w", encoding="utf-8") as f:
        f.write(text)
    return None


@app.route("/extract/<filename>", methods=["POST"])
def extract(filename):
    filename = secure_filename(filename)
    pdf_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    if not os.path.isfile(pdf_path):
        flash("El documento solicitado no existe.", "error")
        return redirect(url_for("index"))

    error = extraer_y_cachear_texto(filename, pdf_path)
    flash(error or "Texto extraído correctamente.", "error" if error else "success")
    return redirect(url_for("view_pdf", filename=filename, _anchor="ocr"))


@app.route("/summarize/<filename>", methods=["POST"])
def summarize(filename):
    filename = secure_filename(filename)
    text_path = extracted_text_path(filename)
    if not os.path.isfile(text_path):
        flash("Primero debes extraer el texto (OCR) antes de generar un resumen.", "error")
        return redirect(url_for("view_pdf", filename=filename, _anchor="resumen"))

    with open(text_path, encoding="utf-8") as f:
        raw_text = f.read()

    # 1. Entidades
    ent = extract_entities(raw_text)
    
    # 2. Generar opciones de resumen profesional
    summary_options_list = []
    subdocuments = ent.get("subdocuments")
    
    if subdocuments and len(subdocuments) > 0:
        parts = re.split(r"(=== INICIO DOCUMENTO: .*? ===|=== FIN DOCUMENTO: .*? ===)", raw_text)
        current_subdoc_name = None
        current_text = []
        
        for part in parts:
            if part.startswith("=== INICIO DOCUMENTO:"):
                current_subdoc_name = part.replace("=== INICIO DOCUMENTO: ", "").replace(" ===", "")
            elif part.startswith("=== FIN DOCUMENTO:"):
                subdoc_text = "".join(current_text)
                opts = build_summary_options(subdoc_text, None)
                summary_options_list.append({
                    "filename": current_subdoc_name,
                    "a": opts["a"],
                    "b": opts["b"],
                    "selected": "a"
                })
                current_text = []
            else:
                if current_subdoc_name:
                    current_text.append(part)
    else:
        summary_opts = build_summary_options(raw_text, ent)
        summary_options_list.append({
            "filename": filename,
            "a": summary_opts["a"],
            "b": summary_opts["b"],
            "selected": "a"
        })
    
    if os.path.isfile(summary_text_path(filename)):
        os.remove(summary_text_path(filename))

    with open(summary_options_path(filename), "w", encoding="utf-8") as f:
        json.dump(summary_options_list, f, ensure_ascii=False, indent=2)
        
    flash("Opciones de resumen generadas. Selecciona la que más te acomode.", "success")
    return redirect(url_for("view_pdf", filename=filename, _anchor="resumen"))


@app.route("/select_summary/<filename>", methods=["POST"])
def select_summary(filename):
    filename = secure_filename(filename)
    
    options_path = summary_options_path(filename)
    if not os.path.isfile(options_path):
        flash("No hay opciones generadas.", "error")
        return redirect(url_for("view_pdf", filename=filename, _anchor="resumen"))
        
    with open(options_path, encoding="utf-8") as f:
        summary_options = json.load(f)
        
    if isinstance(summary_options, dict):
        summary_options = [summary_options]
        
    for i, opt in enumerate(summary_options):
        # Allow falling back to single option form if loop is not used
        opcion_elegida = request.form.get(f"opcion_{i}") or request.form.get("opcion")
        if not opcion_elegida or opcion_elegida not in ["a", "b"]:
            continue
            
        texto_editado = request.form.get(f"texto_{i}_{opcion_elegida}") or request.form.get(f"texto_{opcion_elegida}")
        if texto_editado:
            opt["selected"] = opcion_elegida
            cleaned_text = re.sub(r'</p>|<br\s*/?>', '\n', texto_editado)
            cleaned_text = re.sub(r'<[^>]+>', '', cleaned_text).strip()
            opt[opcion_elegida] = cleaned_text
            
    with open(options_path, "w", encoding="utf-8") as f:
        json.dump(summary_options, f, ensure_ascii=False, indent=2)
        
    if summary_options:
        first_opt = summary_options[0]
        sel = first_opt.get("selected", "a")
        with open(summary_text_path(filename), "w", encoding="utf-8") as f:
            f.write(first_opt.get(sel, ""))
            
    flash("Selección guardada. Ahora puedes exportar a Word.", "success")
    return redirect(url_for("view_pdf", filename=filename, _anchor="resumen"))


@app.route("/entities/<filename>", methods=["POST"])
def entities_view(filename):
    filename = secure_filename(filename)
    text_path = extracted_text_path(filename)
    if not os.path.isfile(text_path):
        flash("Primero debes extraer el texto (OCR) antes de identificar entidades.", "error")
        return redirect(url_for("view_pdf", filename=filename, _anchor="entidades"))

    with open(text_path, encoding="utf-8") as f:
        raw_text = f.read()

    data = extract_entities(raw_text)
    with open(entities_path(filename), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    summary_text = None
    if os.path.isfile(summary_text_path(filename)):
        with open(summary_text_path(filename), encoding="utf-8") as f:
            summary_text = f.read()

    # Con el analisis completo (texto + resumen si existe + entidades), se guarda solo en el
    # historial -- ya no hace falta el paso manual de "Guardar registro" en el flujo normal.
    if guardar_en_historial(filename, raw_text, summary_text, data, session.get('username')):
        flash("Entidades identificadas. Documento guardado automaticamente en el historial.", "success")
    else:
        flash("Entidades identificadas correctamente. No se pudo guardar automaticamente en el "
              "historial: la base de datos no esta disponible.", "error")
    return redirect(url_for("view_pdf", filename=filename, _anchor="entidades"))


@app.route("/export/<filename>", methods=["POST"])
def export_docx(filename):
    filename = secure_filename(filename)
    if not os.path.isfile(extracted_text_path(filename)):
        flash("Primero debes extraer el texto (OCR) antes de exportar a Word.", "error")
        return redirect(url_for("view_pdf", filename=filename, _anchor="exportar"))

    summary_options = None
    
    # Si viene desde el modal u otro lado editado en vivo
    texto_vivo = request.form.get("texto_a")
    if texto_vivo:
        import re
        texto_vivo = re.sub(r'</p>|<br\s*/?>', '\n', texto_vivo)
        summary_options = re.sub(r'<[^>]+>', '', texto_vivo).strip()
    elif os.path.isfile(summary_options_path(filename)):
        with open(summary_options_path(filename), encoding="utf-8") as f:
            summary_options = json.load(f)

    entities_data = load_entities_json(filename)
    if not entities_data:
        if os.path.isfile(extracted_text_path(filename)):
            with open(extracted_text_path(filename), encoding="utf-8") as f:
                raw_text = f.read()
            entities_data = extract_entities(raw_text)
            with open(entities_path(filename), "w", encoding="utf-8") as f:
                json.dump(entities_data, f, ensure_ascii=False, indent=2)

    try:
        export_to_docx(filename, summary_options, entities_data)
    except PermissionError:
        if request.headers.get("Content-Type") and "multipart/form-data" in request.headers.get("Content-Type"):
            return jsonify({"error": "El archivo Word está abierto. Ciérralo antes de generar la vista previa."}), 409
        flash("El archivo Word está abierto en tu computador. Por favor ciérralo antes de intentar generarlo nuevamente.", "error")
        return redirect(url_for("view_pdf", filename=filename, _anchor="exportar"))

    base_name = os.path.splitext(filename)[0]
    return send_from_directory(
        EXPORTS_FOLDER, f"{filename}.docx", as_attachment=True,
        download_name=f"{base_name}_resumido.docx",
    )


@app.route("/exports/<filename>")
def serve_export(filename):
    filename = secure_filename(filename)
    if not os.path.isfile(export_path(filename)):
        flash("Aun no se ha generado el Word de este documento.", "error")
        return redirect(url_for("view_pdf", filename=filename, _anchor="exportar"))
    base_name = os.path.splitext(filename)[0]
    return send_from_directory(
        EXPORTS_FOLDER, f"{filename}.docx", as_attachment=True,
        download_name=f"{base_name}_resumido.docx",
    )


@app.route("/save/<filename>", methods=["POST"])
def save_history(filename):
    filename = secure_filename(filename)
    text_path = extracted_text_path(filename)
    if not os.path.isfile(text_path):
        flash("Primero debes extraer el texto (OCR) antes de guardar en el historial.", "error")
        return redirect(url_for("view_pdf", filename=filename, _anchor="historial"))

    with open(text_path, encoding="utf-8") as f:
        raw_text = f.read()

    summary_text = None
    if os.path.isfile(summary_text_path(filename)):
        with open(summary_text_path(filename), encoding="utf-8") as f:
            summary_text = f.read()

    entities_data = load_entities_json(filename)

    if guardar_en_historial(filename, raw_text, summary_text, entities_data, session.get('username')):
        flash("Documento guardado en el historial.", "success")
    else:
        flash("No se pudo guardar en el historial: la base de datos no esta disponible.", "error")
    return redirect(url_for("view_pdf", filename=filename, _anchor="historial"))


@app.route("/historial")
def historial():
    from datetime import datetime, timedelta
    
    fecha_desde = request.args.get("fecha_desde") or None
    fecha_hasta = request.args.get("fecha_hasta") or None
    categoria = request.args.get("categoria") or None
    palabra_clave = request.args.get("palabra_clave") or None
    dias = request.args.get("dias", type=int)
    page = request.args.get("page", 1, type=int)
    per_page = 10
    
    if dias and not fecha_desde:
        fecha_desde = (datetime.now() - timedelta(days=dias)).strftime("%Y-%m-%d")

    try:
        registros, total_count = db.list_history(fecha_desde, fecha_hasta, categoria, palabra_clave, page, per_page)
        total_pages = (total_count + per_page - 1) // per_page
        db_error = None
    except Exception:
        registros = []
        total_count = 0
        total_pages = 1
        db_error = "No se pudo conectar a la base de datos."

    return render_template(
        "historial.html",
        registros=registros,
        db_error=db_error,
        fecha_desde=fecha_desde or "",
        fecha_hasta=fecha_hasta or "",
        categoria=categoria or "",
        palabra_clave=palabra_clave or "",
        page=page,
        total_pages=total_pages,
        total_count=total_count,
        active_page="historial",
    )


@app.route("/historial/<int:documento_id>")
def historial_detalle(documento_id):
    return_to = request.args.get("return_to")
    highlight = request.args.get("highlight")
    
    try:
        registro = db.get_document(documento_id)
        entidades = db.get_document_entities(documento_id) if registro else []
        db_error = None
    except Exception:
        registro = None
        entidades = []
        db_error = "No se pudo conectar a la base de datos."

    if db_error is None and registro is None:
        flash("Ese registro del historial no existe.", "error")
        return redirect(url_for("historial"))

    return render_template(
        "historial_detalle.html", registro=registro, entidades=entidades, db_error=db_error,
        active_page="historial", return_to=return_to, highlight=highlight
    )

# @app.route("/api/chat", methods=["POST"])
# def chat_api():
#     return {"error": "Chat desactivado temporalmente"}, 503


@app.route("/estadisticas")
def estadisticas():
    dias = request.args.get("dias", type=int)
    agrupacion = request.args.get("agrupacion")
    try:
        stats = db.get_stats(dias=dias, agrupacion=agrupacion)
        db_error = None
    except Exception:
        stats = None
        db_error = "No se pudo conectar a la base de datos."
    return render_template(
        "estadisticas.html", stats=stats, db_error=db_error, active_page="estadisticas", dias_actuales=dias, agrupacion_actual=agrupacion
    )






@app.route("/perfil")
def perfil():
    username = session.get("username", "")
    if not username:
        return redirect(url_for("login"))
    user = db.get_user_by_username(username)
    doc_count = db.get_user_doc_count(username)
    recent_docs = db.get_recent_docs_by_user(username, limit=5)
    return render_template("perfil.html", user=user, doc_count=doc_count, recent_docs=recent_docs, active_page="perfil")

@app.route("/perfil/cambiar_password", methods=["POST"])
def cambiar_password():
    username = session.get("username", "")
    if not username:
        return redirect(url_for("login"))
    
    new_password = request.form.get("new_password")
    if new_password:
        try:
            db.update_password(username, generate_password_hash(new_password))
            flash("Contraseña actualizada exitosamente.", "success")
        except Exception as e:
            flash(f"Error al actualizar contraseña: {e}", "error")
    else:
        flash("Debe proporcionar una nueva contraseña.", "error")
    
    return redirect(url_for("perfil"))

@app.route("/perfil/reporte.xlsx")
def perfil_reporte():
    username = session.get("username", "")
    if not username:
        return redirect(url_for("login"))
    
    try:
        docs = db.get_all_docs_by_user(username)
        wb = Workbook()
        ws = wb.active
        ws.title = "Mis Documentos"
        
        ws.append(["ID", "Nombre de Archivo", "Fecha Procesamiento", "Resumen"])
        for d in docs:
            dt = d["fecha_procesamiento"]
            if dt and dt.tzinfo:
                dt = dt.replace(tzinfo=None)
            ws.append([d["id"], d["nombre_archivo"], dt, d["resumen"]])
            
        if len(docs) > 0:
            tab = Table(displayName="MisDocumentos", ref=f"A1:D{len(docs)+1}")
            style = TableStyleInfo(name="TableStyleMedium9", showFirstColumn=False, showLastColumn=False, showRowStripes=True, showColumnStripes=True)
            tab.tableStyleInfo = style
            ws.add_table(tab)
            
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        return send_file(
            output,
            as_attachment=True,
            download_name=f"reporte_actividad_{username}.xlsx",
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        flash(f"Error al generar reporte: {e}", "error")
        return redirect(url_for("perfil"))


@app.route("/estadisticas/exportar.xlsx")
def estadisticas_excel():
    try:
        filas = db.get_entidades_resumen()
        detalle = db.get_entidades_detalle()
    except Exception:
        flash("No se pudo conectar a la base de datos.", "error")
        return redirect(url_for("estadisticas"))

    workbook = build_stats_workbook(filas, detalle)
    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    return Response(
        buffer.getvalue(),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=estadisticas_entidades.xlsx"},
    )


@app.errorhandler(500)
def handle_internal_error(exc):
    import traceback
    tb = traceback.format_exc()
    if tb == "NoneType: None\n":
        tb = str(exc)
    return f"<h1>Error 500</h1><pre>{tb}</pre>", 500


@app.route("/exportar_masivo", methods=["POST"])
def exportar_masivo():
    document_ids = request.form.getlist("document_ids")
    if not document_ids:
        flash("No se seleccionó ningún documento para exportar.", "error")
        return redirect(url_for("historial"))

    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w') as zf:
        for doc_id in document_ids:
            doc = db.get_document(doc_id)
            if not doc:
                continue
                
            entities_list = db.get_document_entities(doc_id)
            entities_data = {}
            for e in entities_list:
                cat = e["categoria"] + "s"
                campo = e["campo"]
                valor = e["valor"]
                if cat not in entities_data:
                    entities_data[cat] = {}
                if campo not in entities_data[cat]:
                    entities_data[cat][campo] = []
                entities_data[cat][campo].append(valor)
                
            template = DocxTemplate(WORD_TEMPLATE_PATH)
            template.render(build_docx_context(doc["nombre_archivo"], doc["resumen"], entities_data))
            
            doc_io = io.BytesIO()
            template.save(doc_io)
            doc_io.seek(0)
            
            zf.writestr(f"{doc['nombre_archivo']}_{doc_id}.docx", doc_io.read())
            
    memory_file.seek(0)
    return send_file(
        memory_file,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"exportacion_masiva_siad_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    )

if __name__ == "__main__":
    port = int(os.environ.get("FLASK_RUN_PORT", 5001))
    app.run(host="127.0.0.1", debug=False, port=port)
