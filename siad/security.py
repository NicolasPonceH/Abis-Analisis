"""Módulo de Criptografía Policial para el Sistema SIAD / ABIS.

Implementa cifrado y descifrado AES-256-GCM con autenticación criptográfica
compatible al 100% con src/security/crypto.js (Node.js) para la protección de datos
sensibles y reservados (identidades de víctimas, imputados y menores según Ley RPA
y Ley 19.628 de Protección de Datos Personales).
"""

import os
import base64
import re
from typing import Optional, Dict, Any, List
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

_CACHED_KEY: Optional[bytes] = None


def get_encryption_key() -> bytes:
    """Obtiene la clave criptográfica de 32 bytes (256 bits)."""
    global _CACHED_KEY
    if _CACHED_KEY is not None:
        return _CACHED_KEY

    raw_key = os.environ.get("ENCRYPTION_KEY")
    if not raw_key:
        from dotenv import load_dotenv
        load_dotenv()
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
        raw_key = os.environ.get("ENCRYPTION_KEY")

    if not raw_key:
        raise ValueError("No se ha definido ENCRYPTION_KEY en las variables de entorno.")

    key_str = str(raw_key).strip()
    if re.match(r"^[0-9a-fA-F]{64}$", key_str):
        _CACHED_KEY = bytes.fromhex(key_str)
        return _CACHED_KEY

    kdf = Scrypt(
        salt=b"abis_security_salt_2026",
        length=32,
        n=16384,
        r=8,
        p=1,
    )
    _CACHED_KEY = kdf.derive(key_str.encode("utf-8"))
    return _CACHED_KEY


def es_texto_cifrado(valor: Optional[str]) -> bool:
    """Determina si un valor corresponde al formato de payload cifrado iv:tag:ciphertext."""
    if not valor or not isinstance(valor, str):
        return False
    partes = valor.split(":")
    if len(partes) != 3:
        return False
    return bool(re.match(r"^[A-Za-z0-9+/=]{16}:[A-Za-z0-9+/=]{22,24}:[A-Za-z0-9+/=]+$", valor))


def cifrar_texto(texto_plano: Optional[str]) -> Optional[str]:
    """Cifra un texto plano con AES-256-GCM.
    Retorna formato Base64: iv:authTag:ciphertext
    """
    if not texto_plano or not isinstance(texto_plano, str):
        return texto_plano

    if es_texto_cifrado(texto_plano):
        return texto_plano

    key = get_encryption_key()
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ct_and_tag = aesgcm.encrypt(iv, texto_plano.encode("utf-8"), None)
    ciphertext = ct_and_tag[:-16]
    tag = ct_and_tag[-16:]

    iv_b64 = base64.b64encode(iv).decode("ascii")
    tag_b64 = base64.b64encode(tag).decode("ascii")
    ct_b64 = base64.b64encode(ciphertext).decode("ascii")

    return f"{iv_b64}:{tag_b64}:{ct_b64}"


def descifrar_texto(payload_cifrado: Optional[str]) -> Optional[str]:
    """Descifra un payload iv:authTag:ciphertext con AES-256-GCM.
    Si no está cifrado o falla la autenticación, retorna el texto original de forma segura.
    """
    if not payload_cifrado or not isinstance(payload_cifrado, str):
        return payload_cifrado

    if not es_texto_cifrado(payload_cifrado):
        return payload_cifrado

    try:
        partes = payload_cifrado.split(":")
        iv = base64.b64decode(partes[0])
        tag = base64.b64decode(partes[1])
        ciphertext = base64.b64decode(partes[2])

        key = get_encryption_key()
        aesgcm = AESGCM(key)
        decrypted_bytes = aesgcm.decrypt(iv, ciphertext + tag, None)
        return decrypted_bytes.decode("utf-8")
    except Exception:
        return payload_cifrado


def es_menor_de_edad(texto: Optional[str]) -> bool:
    """Determina si una mención de persona corresponde a un menor de edad (0 a 17 años)."""
    if not texto or not isinstance(texto, str):
        return False
    texto_norm = texto.lower()
    if re.search(r"\b(?:menor(?:es)?(?:\s+de\s+edad)?|nna|lactante|infante|p[aá]rvulo|niñ[oa]s?|adolescentes?)\b", texto_norm):
        return True
    # Busca 'X años' o 'X anos' con X entre 0 y 17 (evita falsos positivos con RUTs o identificadores)
    if re.search(r"(?<!\d)(?:0|[1-9]|1[0-7])\s*(?:años?|anos?)\b", texto_norm):
        return True
    # 'edad: 13' o 'edad 13'
    if re.search(r"\bedad\s*[:\-]?\s*(?:0|[1-9]|1[0-7])\b", texto_norm):
        return True
    return False


def es_delito_sexual(contexto: Optional[str]) -> bool:
    """Determina si un hecho, delito, unidad o contexto corresponde a delitos sexuales / indemnidad sexual."""
    if not contexto or not isinstance(contexto, str):
        return False
    delito_sexual_patterns = [
        r"\bdelitos?\s+sexual(?:es)?\b",
        r"\bsexual(?:es)?\b",
        r"\bviolaci[oó]n(?:es)?\b",
        r"\babuso\s+sexual\b",
        r"\babuso\s+por\s+sorpresa\b",
        r"\babuso\s+deshonesto\b",
        r"\bestupro\b",
        r"\bindemnidad\s+sexual\b",
        r"\bpornograf[ií]a\b",
        r"\bexplotaci[oó]n\s+sexual\b",
        r"\bprostituci[oó]n\b",
        r"\bacoso\s+sexual\b",
        r"\btocaciones\b",
        r"\bultrajo\b",
        r"\bbrisex\b",
        r"\bdelitos?\s+contra\s+la\s+indemnidad\b",
    ]
    for pat in delito_sexual_patterns:
        if re.search(pat, contexto, re.IGNORECASE):
            return True
    return False


def censurar_identidad_persona(
    persona_str: Optional[str],
    hecho: str = "",
    unidad: str = "",
    tipo_persona: str = "victima"
) -> Dict[str, Any]:
    """Evalúa si una persona debe tener su nombre censurado en la interfaz web por:
    1. Ser menor de edad (Ley 20.084 / Ley RPA / Protección de N.N.A.).
    2. Causa o delito sexual (Protección de identidad / Art. 369 ter Código Penal / Ley 19.628).

    Retorna un diccionario estructurado:
    - es_censurado: bool
    - motivo: 'menor', 'delito_sexual' o None
    - nombre_mostrado: string con el nombre censurado o el original
    - detalle_mostrado: nacionalidad, edad u otros datos complementarios
    - texto_completo: string completo censurado para listados compactos
    """
    if not persona_str:
        return {
            "es_censurado": False,
            "motivo": None,
            "nombre_mostrado": "",
            "detalle_mostrado": "",
            "texto_completo": "",
        }

    partes = [p.strip() for p in str(persona_str).split(",") if p.strip()]
    nombre_original = partes[0] if partes else str(persona_str).strip()
    detalle_original = ", ".join(partes[1:]) if len(partes) > 1 else ""

    contexto_delito = f"{hecho or ''} {unidad or ''} {persona_str}"
    es_menor = es_menor_de_edad(persona_str)
    es_sexual = es_delito_sexual(contexto_delito)

    if es_menor:
        motivo = "menor"
        nombre_mostrado = "[IDENTIDAD RESERVADA - MENOR DE EDAD]"
        es_censurado = True
    elif es_sexual:
        motivo = "delito_sexual"
        nombre_mostrado = "[IDENTIDAD RESERVADA - DELITO SEXUAL]"
        es_censurado = True
    else:
        motivo = None
        nombre_mostrado = nombre_original
        es_censurado = False

    if es_censurado:
        detalle_mostrado = detalle_original if detalle_original else ("Menor de edad" if es_menor else "Identidad protegida")
        texto_completo = f"{nombre_mostrado}, {detalle_mostrado}" if detalle_mostrado else nombre_mostrado
    else:
        detalle_mostrado = detalle_original if detalle_original else ("Víctima identificada" if tipo_persona == "victima" else "Detenido identificado")
        texto_completo = str(persona_str)

    return {
        "es_censurado": es_censurado,
        "motivo": motivo,
        "nombre_mostrado": nombre_mostrado,
        "detalle_mostrado": detalle_mostrado,
        "texto_completo": texto_completo,
    }


def censurar_lista_personas(
    lista_personas: Optional[List[Any]],
    hecho: str = "",
    unidad: str = "",
    tipo_persona: str = "victima"
) -> List[str]:
    """Devuelve la lista de personas con nombres censurados para presentación web segura."""
    if not lista_personas:
        return []
    res = []
    for p in lista_personas:
        info = censurar_identidad_persona(p, hecho, unidad, tipo_persona)
        res.append(info["texto_completo"])
    return res
