"""Extraccion de entidades operativas (vehiculos, armas y drogas) del relato ya extraido (OCR).

Enfoque basado en reglas (listas de marcas/sustancias + regex con palabra clave de contexto),
no en un modelo de NER entrenado: no hay datos etiquetados de actas policiales para entrenar
uno, y es el mismo enfoque on-premise usado en el resumen (Sprint 3). El SRS marca
explicitamente como riesgo que este tipo de extraccion necesita iteracion para no generar
falsos positivos (ver docs/ROADMAP.md) -- todos los patrones numericos/alfanumericos (patente,
calibre, serie, modelo, anio, pesajes de droga) por eso exigen una palabra clave de contexto en
la misma oracion antes de aceptar una coincidencia; las listas cerradas (marcas, colores,
sustancias, tipos de arma) no lo necesitan porque no son ambiguas.
"""

import re
import os
import json
from datetime import datetime

# pyrefly: ignore [missing-import]
import markupsafe

LEARNED_RULES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db", "learned_rules.json")

def get_learned_rules():
    default_rules = {
        "unidades": {
            "BH ARICA INFORMA CONCURRENCIA SS": "BH ARICA",
            "BH ARICA INFORMA": "BH ARICA",
            "BICRIM ARICA INFORMA": "BICRIM ARICA"
        },
        "delitos": {
            "CONCURRENCIA SS": "HOMICIDIO / HALLAZGO DE CADÁVER"
        },
        "detenidos_keywords": [],
        "victimas_keywords": [],
        "total_correcciones": 0,
        "historial": []
    }
    if not os.path.exists(LEARNED_RULES_PATH):
        try:
            os.makedirs(os.path.dirname(LEARNED_RULES_PATH), exist_ok=True)
            with open(LEARNED_RULES_PATH, "w", encoding="utf-8") as f:
                json.dump(default_rules, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
        return default_rules

    try:
        with open(LEARNED_RULES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default_rules

def save_learned_rule(campo, original, corregido, usuario="operador"):
    if not original or not corregido:
        return False
    original = original.strip()
    corregido = corregido.strip()
    if original == corregido:
        return False
        
    rules = get_learned_rules()
    ahora = datetime.now().strftime("%d-%m-%Y %H:%M")
    
    if campo == "unidad":
        rules.setdefault("unidades", {})[original] = corregido
    elif campo in ["hecho", "delito"]:
        rules.setdefault("delitos", {})[original] = corregido
    elif campo == "detenidos":
        if corregido not in rules.setdefault("detenidos_keywords", []):
            rules["detenidos_keywords"].append(corregido)
    elif campo == "victimas":
        if corregido not in rules.setdefault("victimas_keywords", []):
            rules["victimas_keywords"].append(corregido)
            
    rules["total_correcciones"] = rules.get("total_correcciones", 0) + 1
    rules.setdefault("historial", []).append({
        "fecha": ahora,
        "usuario": usuario or "operador",
        "campo": campo,
        "original": original,
        "corregido": corregido
    })
    
    try:
        os.makedirs(os.path.dirname(LEARNED_RULES_PATH), exist_ok=True)
        with open(LEARNED_RULES_PATH, "w", encoding="utf-8") as f:
            json.dump(rules, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error guardando regla aprendida: {e}")
        return False

VEHICLE_BRANDS = [
    "Toyota", "Nissan", "Chevrolet", "Hyundai", "Kia", "Suzuki", "Mazda", "Ford",
    "Volkswagen", "Peugeot", "Renault", "Honda", "Mitsubishi", "Subaru", "Great Wall",
    "Changan", "JAC", "BYD", "MG", "Jeep", "Citroen", "Fiat", "BMW", "Mercedes-Benz",
    "SsangYong", "Chery", "Baic", "Foton",
]

WEAPON_BRANDS = [
    "Glock", "Beretta", "Taurus", "Smith & Wesson", "Colt", "Browning", "Bersa",
    "Sig Sauer", "CZ", "Walther", "Ruger", "Remington", "Mossberg", "FN", "IMBEL",
    "Winchester", "Norinco",
]

VEHICLE_COLORS = [
    "blanco", "negro", "gris", "plata", "plateado", "rojo", "azul", "verde", "amarillo",
    "cafe", "café", "beige", "celeste", "morado", "naranjo", "dorado", "vino",
]

WEAPON_TYPES = {
    "fuego": ["arma de fuego", "pistola", "revolver", "revólver", "fusil", "escopeta",
              "subametralladora", "carabina", "metralleta", "ametralladora", "uzi"],
    "fogueo": ["arma de fogueo", "fogueo", "salva"],
    "blanca": ["arma blanca", "cuchillo", "cortaplumas", "machete", "puñal", "punal"],
}

# Placa/PPU chilena: formato nuevo LLLL·NN (4 letras + 2 numeros) o formato antiguo LL·NNNN.
# Sin espacio como separador (a proposito): "patente BB1234" es valido, pero "de 2026" dentro
# de una oracion que menciona "patente" en otra parte no debe colarse como placa.
PATENTE_KEYWORDS = ("patente", "ppu", "placa")
PATENTE_REGEX = re.compile(
    r"\b([A-Za-zÑñ]{4}[\-\.·]?\d{2}|[A-Za-zÑñ]{2}[\-\.·]?\d{4}|sin\s+(?:placas?\s+)?(?:patentes?|ppu|placas?))\b", re.IGNORECASE
)

CALIBRE_KEYWORDS = ("calibre",)
CALIBRE_REGEX = re.compile(
    r"calibre\s+([\.\w]+(?:\s?mm)?(?:\s+(?:largo|corto|magnum))?)",
    re.IGNORECASE,
)

SERIE_KEYWORDS = ("serie",)
SERIE_REGEX = re.compile(
    r"serie\s*(?:n[°ºo]?\s*)?[:\-]?\s*([A-Z0-9\-]{4,})",
    re.IGNORECASE,
)

# "afinamiento general" (Sprint 5): modelo y anio de fabricacion, campos del RF-04 que el
# Sprint 4 dejo fuera. Se gatillan por contexto de oracion (marca/palabra clave de vehiculo o
# de arma), no por keyword-en-el-patron, porque "modelo X" por si solo no dice a cual de los
# dos categorias pertenece.
MODEL_REGEX = re.compile(r"modelo\s+([A-Za-z0-9][\wÁÉÍÓÚÑáéíóúñ\-]{0,20})", re.IGNORECASE)
YEAR_REGEX = re.compile(r"(?:a[ñn]o|fabricaci[oó]n)\s+(?:de\s+)?(\d{4})\b", re.IGNORECASE)

VEHICLE_CONTEXT_WORDS = (
    "vehiculo", "vehículo", "auto", "automovil", "automóvil", "camioneta", "furgon", "furgón",
) + tuple(b.lower() for b in VEHICLE_BRANDS)

WEAPON_CONTEXT_WORDS = (
    "arma", "pistola", "revolver", "revólver", "fusil", "escopeta",
    "metralleta", "ametralladora", "subametralladora", "uzi", "carabina"
) + tuple(b.lower() for b in WEAPON_BRANDS)

# Drogas (Sprint 5): sustancias mas comunes en actas policiales chilenas.
DRUG_SUBSTANCES = [
    "marihuana", "cannabis", "cocaina", "cocaína", "pasta base",
    "clorhidrato de cocaina", "clorhidrato de cocaína", "heroina", "heroína",
    "metanfetamina", "extasis", "éxtasis", "mdma", "ketamina", "lsd", "hachis", "hachís",
    "anfetamina", "tusi", "tuci", "tussi", "crack", "fentanilo", "cripy"
]

DRUG_KEYWORDS = (
    "droga", "drogas", "sustancia", "sustancias", "estupefaciente", "estupefacientes",
    "incautacion", "incautación", "incauto", "incautó",
)

DRUG_UNIT_REGEX = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(gramos?|gr\.?|kilogramos?|kg\.?|miligramos?|mg\.?|dosis|"
    r"papelillos?|unidades?|plantas?|litros?|onzas?)\b",
    re.IGNORECASE,
)

# RUTs (Cédula de Identidad Chilena) - formato: 12.345.678-9 o 12345678-9
RUT_REGEX = re.compile(r"\b(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])\b", re.IGNORECASE)

# Teléfonos (Celulares chilenos o números con prefijo)
PHONE_KEYWORDS = ("telefono", "teléfono", "celular", "fono", "whatsapp", "contacto")
PHONE_REGEX = re.compile(r"((?:\+?56[\s\-]?)?9[\s\-]?\d{4}[\s\-]?\d{4})\b")

# Direcciones
DIRECCION_KEYWORDS = ("calle", "pasaje", "avenida", "av.", "avda", "ruta", "camino", "domicilio", "poblacion", "población", "villa", "condominio")
DIRECCION_REGEX = re.compile(r"((?:calle|pasaje|avenida|av\.|avda|ruta|camino)[\s\w]+?(?:(?:n[°ºo]?\s*)?\d+|s[/\.]?n))\b", re.IGNORECASE)

def find_ruts(text):
    found = []
    # Buscar RUT chileno tradicional
    for match in RUT_REGEX.finditer(text):
        v = match.group(1).upper()
        if v not in found: found.append(v)
        
    # Buscar Pasaportes y DNI extranjeros
    PASAPORTE_DNI_REGEX = re.compile(r"(?:pasaporte|dni|documento nacional de identidad|c\.?i\.?e\.?|c[eé]dula extranjera|identificaci[oó]n extranjera)\s*(?:n[°ºo]?\s*)?[:\-]?\s*([A-Za-z0-9\-\.]{5,15})\b", re.IGNORECASE)
    for match in PASAPORTE_DNI_REGEX.finditer(text):
        v = match.group(1).upper().rstrip('.')
        if v not in found: found.append(v)
        
    return found

def clean_person_name(raw_name):
    raw_name = raw_name.strip(" *-\t\r\n:.")
    # 1. Intentar capturar hasta la palabra "años" o "año"
    match = re.search(r"^(.*?(?:años?|anos?))\b", raw_name, re.IGNORECASE)
    if match:
        return match.group(1).strip()
        
    # 2. Si no especifica edad, truncamos usando las comas (máx 3 elementos)
    parts = [p.strip() for p in raw_name.split(',')]
    if len(parts) > 1:
        return ", ".join(parts[:3])
        
    return raw_name

def _is_invalid_person_name(name):
    if not name or len(name.strip()) < 3:
        return True
    upper = name.upper()
    stopwords = [
        "AMENAZAS", "FECHA", "VIF", "FUE ", "SAPU", "HOSPITAL",
        "ESTADO", "HORAS", "LA TARDE", "LA MAÑANA", "LA NOCHE", "SIN SIGNOS",
        "AL DOMICILIO", "POR PARTE", "ANTECEDENTES", "HECHOS", "ROBO", "HOMICIDIO",
        "LESIONES", "FLAGRANTE", "FISCALIA", "TRIBUNAL", "DROGAS", "ARMAS", "VEHICULO",
        "POLICIA", "CARABINEROS", "INSPECCION", "DECLARACION", "MINUTA", "INFORME",
        "PASAJE", "CALLE", "AVENIDA", "AVDA", "BLOCK", "VILLA", "POBLACION", "POBLACIÓN",
        "COMUNA", "DOMICILIO", "DOMICILIAD", "GEPOL", "SE DESCONOCE"
    ]
    if any(sw in upper for sw in stopwords):
        return True
    return False

def find_detenidos_in_text(text):
    text = text.replace('*', '')
    found = []
    lines = text.split('\n')
    
    in_detenidos_block = False
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            in_detenidos_block = False
            continue
            
        # Limpiar para buscar headers (ej. DETENIDO:)
        upper_line = line.upper().replace(':', '').strip()
        
        if upper_line in ["DETENIDO", "DETENIDOS", "IMPUTADO", "IMPUTADOS", "DETENIDA", "IMPUTADA", "DETENIDAS", "IMPUTADAS"]:
            in_detenidos_block = True
            continue
            
        # Si es un encabezado tipo "Detenido 1." o "Detenida 2. Flagrante"
        if re.match(r"^(?:DETENID[OA]S?|IMPUTAD[OA]S?)\s+\d+[\.\-]?.*", upper_line):
            in_detenidos_block = True
            # No hacemos continue, por si el nombre está en la misma línea
            
        # Captura inline si tiene formato clásico "DETENIDO: Juan Perez"
        inline_match = re.search(r"^(?:detenid[oa]s?|imputad[oa]s?)\s*[:\-]\s*(.+)", line, re.IGNORECASE)
        if inline_match:
            cl = clean_person_name(inline_match.group(1).strip())
            if cl and cl not in found and not _is_invalid_person_name(cl):
                found.append(cl)
            in_detenidos_block = True
            continue
            
        if in_detenidos_block:
            # Check if line hits another block
            if re.match(r"^[A-ZÁÉÍÓÚÑ]+[A-ZÁÉÍÓÚÑ\s]*[:\.]$", line.upper()) and len(line.split()) < 4:
                in_detenidos_block = False
                continue
                
            # Verifica si la línea parece realmente una persona (Nombre, nacionalidad, edad/RUT)
            person_match = re.search(r"^[\d\.\-\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]+),\s*(?:[a-záéíóúñ]+).*?(?:\d{1,2}\s*años?|anos?|C\.I\.|RUT|cédula)", line, re.IGNORECASE)
            if person_match:
                # Extraemos la línea entera, pero sin el prefijo "1. -"
                cleaned_line = re.sub(r"^[\d\.\-\s]+", "", line)
                cl = clean_person_name(cleaned_line)
                if cl and cl not in found and not _is_invalid_person_name(cl):
                    found.append(cl)
                    
    if found:
        return found
        
    # Buscar formato estructurado de persona: "* Juan Perez, Chileno, nacido en..." o "... CI N°"
    for line in lines:
        line = line.strip()
        person_match = re.search(r"^[\*\-]?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]+),\s*(?:[A-Z][a-záéíóúñ]+),\s*nacido en.*?(?:\d{1,2}\s*años?|anos?|C\.I\.|RUT|cédula)", line, re.IGNORECASE)
        if person_match:
            cl = clean_person_name(person_match.group(1).strip())
            if cl and cl not in found and not _is_invalid_person_name(cl):
                found.append(cl)
                
    if found:
        return found
        
    # Buscar menciones inline de imputados/detenidos
    for match in re.finditer(r"(?i:el|la)?\s*(?i:detenid[oa]|imputad[oa]|autor|aprehendid[oa])\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*){1,4})", text):
        name = match.group(1).strip()
        if not _is_invalid_person_name(name):
            cl = clean_person_name(name)
            if cl and cl not in found:
                found.append(cl)
        
    return found

def find_victimas_in_text(text):
    if not text:
        return []
    text_clean = text.replace('*', '').replace('_', '')
    found = []
    lines = text_clean.split('\n')
    
    in_victimas_block = False
    
    VICTIMA_KEYWORDS = (
        "VICTIMA", "VÍCTIMA", "OCCISO", "OCCISA", "AFECTADO", "AFECTADA",
        "DENUNCIANTE", "FALLECIDO", "FALLECIDA", "PERSONA FALLECIDA", "VICTIMA FATAL", "VÍCTIMA FATAL"
    )
    SECTION_HEADERS = (
        "HECHOS", "HECHO", "DILIGENCIAS", "FISCAL", "FISCALIA", "FISCALÍA",
        "TRIBUNAL", "JUZGADO", "LUGAR", "LUGAR SS", "SITIO DEL SUCESO",
        "ANTECEDENTES", "RELATO", "SINTESIS", "SÍNTESIS", "DETENIDO",
        "DETENIDOS", "IMPUTADO", "IMPUTADOS", "ESPECIES", "ARMAS",
        "VEHICULOS", "VEHÍCULOS", "DROGAS", "TELEFONO", "TELEFONOS",
        "CONCLUSION", "CONCLUSIONES", "CUNOCO", "INSTRUCCIONES"
    )
    
    for line in lines:
        line_str = line.strip()
        if not line_str:
            in_victimas_block = False
            continue
            
        upper = line_str.upper()
        # Verificar si entramos a otra sección conocida
        first_word = re.split(r'[:\s\.\-]', upper)[0]
        if in_victimas_block and first_word in SECTION_HEADERS:
            in_victimas_block = False
            
        # 1. Header de bloque: "VÍCTIMA:", "VICTIMAS", "OCCISO:", etc.
        clean_header = re.sub(r'^[-\d.•*\s]+', '', upper).rstrip(':. ')
        if clean_header in VICTIMA_KEYWORDS or clean_header in [k + "S" for k in VICTIMA_KEYWORDS]:
            in_victimas_block = True
            continue
            
        # Si es un encabezado numerado: "Víctima 1." o "Víctima N° 2"
        if re.match(r"^(?:V[IÍ]CTIMAS?|AFECTAD[OA]S?|DENUNCIANTES?|OCCIS[OA]S?|FALLECID[OA]S?)\s+(?:N[°º\.]\s*)?\d+[\.\-]?.*", clean_header):
            in_victimas_block = True
            continue
            
        # 2. Captura inline tipo "VÍCTIMA: Juan Pérez, 25 años...", "1. VÍCTIMA FATAL: ...", "- VICTIMA: ..."
        m_inline = re.search(r'(?:^|[-0-9.•*\s]+)(?:V[IÍ]CTIMAS?(?:\s+FATALES?)?|OCCIS[OA]S?|AFECTAD[OA]S?|DENUNCIANTES?|FALLECID[OA]S?|PERSONA\s+FALLECIDA)\s*[:\-]\s*(.+)', line_str, re.IGNORECASE)
        if m_inline:
            val = m_inline.group(1).strip()
            cl = clean_person_name(val)
            if cl and not _is_invalid_person_name(cl) and cl not in found:
                found.append(cl)
            continue
            
        # 3. Línea dentro del bloque de víctimas
        if in_victimas_block:
            # Si parece inicio de otra sección (ej: "LUGAR SS: ...", "FISCAL: ...")
            if re.match(r'^[A-ZÁÉÍÓÚÑ\s]{3,25}\s*[:\-]', line_str):
                in_victimas_block = False
                continue
            clean_item = re.sub(r'^[-\d.•*\s]+', '', line_str).strip()
            cl = clean_person_name(clean_item)
            if cl and len(cl) > 3 and not _is_invalid_person_name(cl) and cl not in found:
                found.append(cl)
                
    if found:
        return found
        
    # 4. Búsqueda narrativa fallback
    narrative_patterns = [
        r"(?i:la|el)?\s*(?i:v[ií]ctima|afectad[oa]|denunciante|occis[oa]|v[ií]ctima\s+fatal)\s+(?:identificad[oa]\s+(?:como|por)\s+)?(?:de\s+nombre\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*){1,4})",
        r"(?i:en\s+contra\s+de\s+(?:la\s+v[ií]ctima\s+)?)([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*){1,4})",
        r"(?i:afectando\s+a\s+(?:la\s+v[ií]ctima\s+)?)([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*){1,4})"
    ]
    for pattern in narrative_patterns:
        for match in re.finditer(pattern, text):
            name = match.group(1).strip()
            if not _is_invalid_person_name(name):
                cl = clean_person_name(name)
                if cl and cl not in found:
                    found.append(cl)
                    
    return found

def split_sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def find_brands(text, brands):
    found = []
    for brand in brands:
        if re.search(rf"\b{re.escape(brand)}\b", text, re.IGNORECASE):
            if brand not in found: found.append(brand)
    return found


def find_weapon_types(text):
    found = []
    for tipo, keywords in WEAPON_TYPES.items():
        for keyword in keywords:
            if re.search(rf"\b{re.escape(keyword)}\b", text, re.IGNORECASE):
                if tipo not in found: found.append(tipo)
                break
    return found


def find_with_context(sentences, keywords, pattern, upper=True):
    """Solo acepta una coincidencia del patron si aparece en una oracion que menciona
    al menos una de las palabras clave de contexto -- evita falsos positivos de un
    regex suelto sobre todo el documento (ver riesgo del SRS en el docstring del modulo)."""
    found = []
    for sentence in sentences:
        lower = sentence.lower()
        if any(keyword in lower for keyword in keywords):
            for match in pattern.finditer(sentence):
                value = match.group(1).strip()
                if upper:
                    value = value.upper()
                if value:
                    if value not in found: found.append(value)
    return found


def find_models_by_proximity(sentences, vehicle_words, weapon_words):
    """'modelo X' por si solo no dice si es de un vehiculo o de un arma. Si la misma oracion
    menciona ambos (p. ej. 'arma encontrada dentro del vehiculo'), se asigna a la categoria
    cuya palabra clave de contexto aparece mas cerca (antes) del match, en vez de contarla
    para las dos -- evita que un modelo de arma se filtre a la lista de vehiculos y viceversa."""
    vehicle_models, weapon_models = [], []
    for sentence in sentences:
        lower = sentence.lower()
        for match in MODEL_REGEX.finditer(sentence):
            pos = match.start()
            v_pos = max((lower.rfind(w, 0, pos) for w in vehicle_words), default=-1)
            w_pos = max((lower.rfind(w, 0, pos) for w in weapon_words), default=-1)
            if v_pos == -1 and w_pos == -1:
                continue
            value = match.group(1).strip()
            if v_pos > w_pos:
                if value not in vehicle_models: vehicle_models.append(value)
            else:
                if value not in weapon_models: weapon_models.append(value)
    return vehicle_models, weapon_models


def find_drug_measures(sentences):
    """Peso/medida de droga: solo cuenta si la oracion ya menciona una sustancia conocida o
    una palabra clave de droga -- de lo contrario cualquier '5 kg' del documento (peso de un
    vehiculo, de evidencia, etc.) se colaria como pesaje de droga."""
    found = []
    for sentence in sentences:
        lower = sentence.lower()
        has_context = any(k in lower for k in DRUG_KEYWORDS) or any(
            re.search(rf"\b{re.escape(s)}\b", lower) for s in DRUG_SUBSTANCES
        )
        if has_context:
            for match in DRUG_UNIT_REGEX.finditer(sentence):
                v = f"{match.group(1)} {match.group(2)}".lower()
                if v not in found: found.append(v)
    return found


def extract_metadata(text):
    text = text.replace('*', '')
    fecha = ""
    unidad = ""
    hecho = ""
    
    fecha_futura_warning = False
    
    # Detección exhaustiva de fecha de emisión/procedimiento
    # 1. Formato policial chileno tradicional: 13.OCT.026 o 13.OCT.2026
    fecha_match = re.search(r"FECHA\s*[:\-]?\s*([0-9]{1,2}\s*[\.\/\-]\s*[A-Z]{3,4}\s*[\.\/\-]\s*([0-9]{2,4}))", text, re.IGNORECASE)
    if fecha_match:
        fecha_raw = fecha_match.group(1).strip()
        year_str = fecha_match.group(2).strip()
        try:
            current_year = datetime.now().year
            if len(year_str) == 3 and year_str.startswith("0"):
                year_int = 2000 + int(year_str[1:])
                fecha = re.sub(r"\b" + year_str + r"\b", str(year_int), fecha_raw)
            else:
                fecha = fecha_raw
                year_int = int(year_str) if len(year_str) == 4 else 2000 + int(year_str)
            if year_int > current_year:
                fecha_futura_warning = True
        except Exception:
            fecha = fecha_raw
    else:
        # 2. Formato numérico DD/MM/AAAA o DD-MM-AAAA
        fecha_num_match = re.search(r"FECHA\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-]([0-9]{2,4}))", text, re.IGNORECASE)
        if fecha_num_match:
            fecha = fecha_num_match.group(1).strip()
            year_str = fecha_num_match.group(2).strip()
            try:
                current_year = datetime.now().year
                year_int = int(year_str) if len(year_str) == 4 else 2000 + int(year_str)
                if year_int > current_year:
                    fecha_futura_warning = True
            except Exception:
                pass
        else:
            # 3. Formato textual: DD de Mes de AAAA
            fecha_txt_match = re.search(r"FECHA\s*[:\-]?\s*([0-9]{1,2}\s+de\s+[a-záéíóúñA-ZÁÉÍÓÚÑ]+\s+de(?:l)?\s+([0-9]{4}))", text, re.IGNORECASE)
            if fecha_txt_match:
                fecha = fecha_txt_match.group(1).strip()
                try:
                    current_year = datetime.now().year
                    year_int = int(fecha_txt_match.group(2))
                    if year_int > current_year:
                        fecha_futura_warning = True
                except Exception:
                    pass
        
    unidad_match = re.search(r"UNIDAD\s*[:\-]?\s*([^\n]+)", text, re.IGNORECASE)
    if unidad_match:
        unidad = unidad_match.group(1).strip()
    else:
        unidad_match = re.search(r"\b(BICRIM|BIDEMA|BH|BIPE|BRIGADA|REPOL|BRISEX|BRIDEC)[^\n\.,]*", text, re.IGNORECASE)
        if unidad_match:
            unidad = unidad_match.group(0).strip()
        
    procedimiento_match = re.search(r"PROCEDIMIENTO\s*[:\-]?\s*([^\n\.,]+)", text, re.IGNORECASE)
    if procedimiento_match:
        hecho = procedimiento_match.group(1).strip()
    else:
        delito_match = re.search(r"DELITO\s*[:\-]?\s*([^\n\.,]+)", text, re.IGNORECASE)
        if delito_match:
            hecho = delito_match.group(1).strip()
        else:
            hecho_match = re.search(r"INFORMA\s+(?:DETENID[O|A]S?\s+)?(.*?)(?=\s+FECHA|\n|\.|$)", text, re.IGNORECASE)
            if hecho_match:
                hecho = hecho_match.group(1).strip()
    # Normalización basada en aprendizaje adaptativo de la IA
    try:
        learned = get_learned_rules()
        for raw_u, learned_u in learned.get("unidades", {}).items():
            if raw_u.upper() in text.upper() or (unidad and raw_u.upper() in unidad.upper()):
                unidad = learned_u
                break
                
        for raw_d, learned_d in learned.get("delitos", {}).items():
            if raw_d.upper() in text.upper() or (hecho and raw_d.upper() in hecho.upper()):
                hecho = learned_d
                break
    except Exception:
        pass
        
    return {"fecha": fecha, "unidad": unidad, "hecho": hecho, "fecha_futura_warning": fecha_futura_warning}

def _extract_entities_single(raw_text):
    plain_text = re.sub(r"--- Pagina \d+ ---\n?", "", raw_text)
    sentences = split_sentences(plain_text)
    vehicle_models, weapon_models = find_models_by_proximity(
        sentences, VEHICLE_CONTEXT_WORDS, WEAPON_CONTEXT_WORDS
    )

    vehiculos = {
        "marcas": find_brands(plain_text, VEHICLE_BRANDS),
        "modelos": vehicle_models,
        "colores": find_brands(plain_text, VEHICLE_COLORS),
        "anios": find_with_context(sentences, VEHICLE_CONTEXT_WORDS, YEAR_REGEX, upper=False),
        "patentes": find_with_context(sentences, PATENTE_KEYWORDS, PATENTE_REGEX),
    }
    armas = {
        "marcas": find_brands(plain_text, WEAPON_BRANDS),
        "modelos": weapon_models,
        "tipos": find_weapon_types(plain_text),
        "calibres": find_with_context(sentences, CALIBRE_KEYWORDS, CALIBRE_REGEX),
        "series": find_with_context(sentences, SERIE_KEYWORDS, SERIE_REGEX),
    }
    drogas = {
        "sustancias": find_brands(plain_text, DRUG_SUBSTANCES),
        "medidas": find_drug_measures(sentences),
    }
    personas = {
        "detenidos": find_detenidos_in_text(plain_text),
        "victimas": find_victimas_in_text(plain_text),
        "ruts": find_ruts(plain_text),
        "telefonos": find_with_context(sentences, PHONE_KEYWORDS, PHONE_REGEX, upper=False),
        "direcciones": find_with_context(sentences, DIRECCION_KEYWORDS, DIRECCION_REGEX, upper=False),
    }
    metadata = extract_metadata(plain_text)
    return {"vehiculos": vehiculos, "armas": armas, "drogas": drogas, "personas": personas, "metadata": metadata}

def extract_entities(raw_text):
    parts = re.split(r"(=== INICIO DOCUMENTO: .*? ===|=== FIN DOCUMENTO: .*? ===)", raw_text)
    if len(parts) == 1:
        return _extract_entities_single(raw_text)
        
    main_entities = _extract_entities_single(raw_text)
    subdocuments = []
    
    current_subdoc_name = None
    current_text = []
    
    for part in parts:
        if part.startswith("=== INICIO DOCUMENTO:"):
            current_subdoc_name = part.replace("=== INICIO DOCUMENTO: ", "").replace(" ===", "")
        elif part.startswith("=== FIN DOCUMENTO:"):
            sub_ent = _extract_entities_single("".join(current_text))
            sub_ent["filename"] = current_subdoc_name
            subdocuments.append(sub_ent)
            current_text = []
        else:
            if current_subdoc_name:
                current_text.append(part)
                
    main_entities["subdocuments"] = subdocuments
    return main_entities


# Forma completa esperada por los templates. Sirve para normalizar entities.json guardados por
# una version anterior de este modulo (p. ej. de antes de Sprint 5, sin "drogas" ni
# "modelos"/"anios") -- sin esto, un cache viejo rompe el template con UndefinedError en vez de
# mostrar la categoria/campo como vacio.
EMPTY_ENTITIES = {
    "vehiculos": {"marcas": [], "modelos": [], "colores": [], "anios": [], "patentes": []},
    "armas": {"marcas": [], "modelos": [], "tipos": [], "calibres": [], "series": []},
    "drogas": {"sustancias": [], "medidas": []},
    "personas": {"detenidos": [], "victimas": [], "ruts": [], "telefonos": [], "direcciones": []},
    "metadata": {"fecha": "", "unidad": "", "hecho": "", "fecha_futura_warning": False}
}


def normalize_entities(data):
    data = data or {}
    normalized = {}
    for categoria, campos in EMPTY_ENTITIES.items():
        normalized[categoria] = {}
        for campo, default_val in campos.items():
            val = data.get(categoria, {}).get(campo, default_val)
            normalized[categoria][campo] = val
            
    if "filename" in data:
        normalized["filename"] = data["filename"]
    if "subdocuments" in data and isinstance(data["subdocuments"], list):
        normalized["subdocuments"] = [normalize_entities(sub) for sub in data["subdocuments"]]
    return normalized


# Solo se resaltan los campos mas "identificadores" -- marcas, patentes, calibres, series,
# sustancias. Se dejan fuera colores/tipos/anios/modelos porque son palabras o numeros cortos
# y genericos (p. ej. "fuego", "2019", "17") que resaltarian coincidencias sueltas en el texto
# sin relacion real con la entidad, dando una lectura enganosa de que "se detecto algo" ahi.
HIGHLIGHT_FIELDS = {
    "vehiculos": ["marcas", "patentes"],
    "armas": ["marcas", "calibres", "series"],
    "drogas": ["sustancias"],
    "personas": ["detenidos", "victimas", "ruts", "telefonos", "direcciones"],
}

MARK_CLASS = {
    "vehiculos": "bg-secondary-container text-on-secondary-container",
    "armas": "bg-surface-variant text-on-surface-variant",
    "drogas": "bg-error-container text-on-error-container",
    "personas": "bg-tertiary-container text-on-tertiary-container",
}


def highlight_entities_html(raw_text, entities_data):
    """Texto OCR con las entidades identificadoras resaltadas (<mark>), para mostrar en la
    interfaz. Devuelve un markupsafe.Markup ya escapado -- todo el texto original pasa por
    escape() antes de insertar cualquier tag, y los valores de entidad tambien se escapan antes
    de compararlos, para que un caracter como '<' dentro del OCR no pueda inyectar HTML."""
    plain_text = re.sub(r"--- Pagina \d+ ---\n?", "", raw_text or "")
    escaped = str(markupsafe.escape(plain_text))

    entries = {}  # valor_escapado.lower() -> (valor_escapado, categoria)
    for categoria, campos in (entities_data or {}).items():
        for campo in HIGHLIGHT_FIELDS.get(categoria, []):
            for valor in campos.get(campo, []):
                valor_escaped = str(markupsafe.escape(valor)).strip()
                if valor_escaped and valor_escaped.lower() not in entries:
                    entries[valor_escaped.lower()] = (valor_escaped, categoria)

    if not entries:
        return markupsafe.Markup(escaped)

    # Mas largos primero: evita que un valor corto reviente uno largo que lo contiene.
    ordenadas = sorted(entries.values(), key=lambda item: len(item[0]), reverse=True)
    patron = re.compile(
        "|".join(re.escape(valor) for valor, _ in ordenadas), re.IGNORECASE
    )

    def reemplazar(match):
        _, categoria = entries[match.group(0).lower()]
        css = MARK_CLASS.get(categoria, "bg-surface-container")
        return f'<mark class="{css} px-1 rounded">{match.group(0)}</mark>'

    return markupsafe.Markup(patron.sub(reemplazar, escaped))
