"""Tests para validación de cifrado AES-256-GCM y privacidad de identidades."""

import os
import sys
import pytest

from security import cifrar_texto, descifrar_texto, es_texto_cifrado
import db
from export_stats import build_stats_workbook


def test_encryption_roundtrip():
    original = "Masiel Anthonella SOTO PEREZ, 14 años, RUT 21.078.904-9"
    encrypted = cifrar_texto(original)
    
    assert encrypted != original
    assert es_texto_cifrado(encrypted)
    
    decrypted = descifrar_texto(encrypted)
    assert decrypted == original


def test_encryption_random_iv():
    """El mismo texto plano debe generar diferentes textos cifrados debido al IV aleatorio."""
    original = "Renato Javier RAMIREZ MESÍAS"
    enc1 = cifrar_texto(original)
    enc2 = cifrar_texto(original)
    
    assert enc1 != enc2
    assert descifrar_texto(enc1) == original
    assert descifrar_texto(enc2) == original


def test_encryption_safe_fallbacks():
    assert cifrar_texto(None) is None
    assert cifrar_texto("") == ""
    assert descifrar_texto(None) is None
    assert descifrar_texto("TextoNoCifrado") == "TextoNoCifrado"


def test_stats_removes_personal_rankings():
    """Verifica que get_stats() no exponga nombres de personas en los rankings de top."""
    stats = db.get_stats()
    assert stats["top_nacionalidades"] == []
    assert stats["top_victimas"] == []
    assert stats["top_victimas_menores"] == []
    assert stats["top_detenidos_menores"] == []
    
    # Pero las métricas numéricas agregadas se mantienen
    assert "persona" in stats["por_categoria"]
    assert "victima" in stats["por_categoria"]
    assert "detenido_menor" in stats["por_categoria"]


def test_document_entities_decrypted():
    """Verifica que get_document_entities() descifre los nombres correctamente para usuarios autenticados."""
    entities = db.get_document_entities(1)
    personas = [e for e in entities if e["categoria"] == "personas"]
    
    assert len(personas) > 0
    for p in personas:
        # Ningún valor entregado al frontend de detalle debe ser un ciphertext en crudo
        assert not es_texto_cifrado(p["valor"])


def test_excel_export_does_not_expose_names():
    """Verifica que el reporte Excel consolide únicamente evidencia material y parque vehicular."""
    stats = db.get_stats()
    filas = db.get_entidades_resumen()
    detalle = db.get_entidades_detalle()
    
    wb = build_stats_workbook(filas, detalle, stats)
    
    # Hoja Resumen
    resumen = wb["Resumen"]
    # Comprobar que el encabezado no diga 'SUJETOS IMPUTADOS'
    cell_val = resumen.cell(row=22, column=5).value or ""
    assert "SUJETOS IMPUTADOS" not in str(cell_val)
    
    # Hojas por entidad no deben incluir 'Personas' ni 'Victimas'
    assert "Personas" not in wb.sheetnames
    assert "Victimas" not in wb.sheetnames
    assert "Vehiculos" in wb.sheetnames
