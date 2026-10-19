"""Módulo de Criptografía Policial para el Sistema SIAD / ABIS.

Implementa cifrado y descifrado AES-256-GCM con autenticación criptográfica
compatible al 100% con src/security/crypto.js (Node.js) para la protección de datos
sensibles y reservados (identidades de víctimas, imputados y menores según Ley RPA
y Ley 19.628 de Protección de Datos Personales).
"""

import os
import base64
import re
from typing import Optional
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
