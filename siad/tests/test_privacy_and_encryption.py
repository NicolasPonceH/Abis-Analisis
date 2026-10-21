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


def test_menor_de_edad_censorship_web():
    """Valida que menores de edad sean detectados y censurados en la web."""
    from security import es_menor_de_edad, censurar_identidad_persona

    # Menor de 13 años (caso real)
    menor = "Masiel Anthonet ALEJO AREMBAY, Boliviana, 13 años"
    assert es_menor_de_edad(menor) is True

    res = censurar_identidad_persona(menor, hecho="HOMICIDIO", unidad="BH ARICA")
    assert res["es_censurado"] is True
    assert res["motivo"] == "menor"
    assert "Masiel" not in res["nombre_mostrado"]
    assert res["nombre_mostrado"] == "[IDENTIDAD RESERVADA - MENOR DE EDAD]"
    assert res["detalle_mostrado"] == "Boliviana, 13 años"

    # Adulto no debe censurarse por edad
    adulto = "Carlos Alberto PEREZ LOPEZ, Chileno, 32 años, RUT 17.555.444-3"
    assert es_menor_de_edad(adulto) is False
    res_adulto = censurar_identidad_persona(adulto, hecho="ROBO EN LUGAR NO HABITADO", unidad="BIRO")
    assert res_adulto["es_censurado"] is False
    assert res_adulto["nombre_mostrado"] == "Carlos Alberto PEREZ LOPEZ"


def test_delito_sexual_censorship_web():
    """Valida que en delitos sexuales las personas sean censuradas en la web aunque sean adultas."""
    from security import es_delito_sexual, censurar_identidad_persona

    assert es_delito_sexual("ABUSO SEXUAL AGRAVADO") is True
    assert es_delito_sexual("VIOLACION DE MAYOR DE 14") is True
    assert es_delito_sexual("UNIDAD BRISEX METROPOLITANA") is True
    assert es_delito_sexual("ROBO CON FUERZA") is False

    victima_adulta = "Camila Francisca MORALES SILVA, Chilena, 28 años"
    res = censurar_identidad_persona(victima_adulta, hecho="ABUSO SEXUAL", unidad="BRISEX")
    assert res["es_censurado"] is True
    assert res["motivo"] == "delito_sexual"
    assert "Camila" not in res["nombre_mostrado"]
    assert res["nombre_mostrado"] == "[IDENTIDAD RESERVADA - DELITO SEXUAL]"
    assert res["detalle_mostrado"] == "Chilena, 28 años"


def test_word_export_preserves_full_uncensored_names():
    """Valida que en el informe oficial Word (.docx) SIEMPRE aparezcan los nombres reales sin censura."""
    from app import build_docx_context

    entities_data = {
        "metadata": {
            "fecha": "10.OCT.2026",
            "unidad": "BH ARICA",
            "hecho": "HOMICIDIO / HALLAZGO DE CADAVER"
        },
        "personas": {
            "victimas": ["Masiel Anthonet ALEJO AREMBAY, Boliviana, 13 años"],
            "detenidos": ["Renato Javier RAMIREZ MESÍAS, Chileno, 17 años"],
            "ruts": [],
            "telefonos": []
        }
    }

    ctx = build_docx_context("doc_prueba.pdf", "Resumen del hecho", entities_data)

    # En Word los nombres reales deben estar completos
    assert "Masiel Anthonet ALEJO AREMBAY" in ctx["Victimas"]
    assert "Renato Javier RAMIREZ MESÍAS" in ctx["Detenidos"]
    assert "Masiel Anthonet ALEJO AREMBAY" in ctx["Victimas_Menores_Detalle"]
    assert "Renato Javier RAMIREZ MESÍAS" in ctx["Detenidos_Menores_Detalle"]


def test_detenidos_y_victimas_menores_ambos_censurados():
    """Valida exhaustivamente que tanto detenidos como víctimas menores sean censurados en la web."""
    from security import censurar_identidad_persona

    # 1. Víctima menor de edad (ej. 13 años)
    vic = "Masiel Anthonet ALEJO AREMBAY, Boliviana, 13 años"
    r_vic = censurar_identidad_persona(vic, hecho="HOMICIDIO", unidad="BH ARICA", tipo_persona="victima")
    assert r_vic["es_censurado"] is True
    assert r_vic["nombre_mostrado"] == "[IDENTIDAD RESERVADA - MENOR DE EDAD]"
    assert "Masiel" not in r_vic["nombre_mostrado"]
    assert "13 años" in r_vic["detalle_mostrado"]

    # 2. Detenido menor de edad (ej. 16 años o imputado RPA)
    det = "Cristóbal Ignacio TAPIA ROJAS, Chileno, 16 años"
    r_det = censurar_identidad_persona(det, hecho="ROBO CON INTIMIDACION", unidad="BICRIM", tipo_persona="detenido")
    assert r_det["es_censurado"] is True
    assert r_det["nombre_mostrado"] == "[IDENTIDAD RESERVADA - MENOR DE EDAD]"
    assert "Cristóbal" not in r_det["nombre_mostrado"]
    assert "16 años" in r_det["detalle_mostrado"]

    # 3. Detenido con mención RPA directa sin edad explícita
    det_rpa = "Matías VALENZUELA, Imputado menor RPA"
    r_rpa = censurar_identidad_persona(det_rpa, hecho="HURTO SIMPLE", unidad="BICRIM", tipo_persona="detenido")
    assert r_rpa["es_censurado"] is True
    assert r_rpa["nombre_mostrado"] == "[IDENTIDAD RESERVADA - MENOR DE EDAD]"

    # 4. Detenido y víctima adultos no deben censurarse
    det_adulto = "Rodrigo ESTEBAN, 34 años"
    vic_adulta = "Andrea PEREZ, 42 años"
    r_da = censurar_identidad_persona(det_adulto, hecho="LESIONES", tipo_persona="detenido")
    r_va = censurar_identidad_persona(vic_adulta, hecho="LESIONES", tipo_persona="victima")
    assert r_da["es_censurado"] is False
    assert r_da["nombre_mostrado"] == "Rodrigo ESTEBAN"
    assert r_va["es_censurado"] is False
    assert r_va["nombre_mostrado"] == "Andrea PEREZ"


