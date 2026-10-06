"""Pruebas del motor de entidades (Sprint 9). Varias de estas formalizan bugs reales que se
encontraron y corrigieron a mano durante el desarrollo -- quedan aqui para que no vuelvan a
colarse sin que un test los marque."""

from entities import (
    extract_entities,
    find_models_by_proximity,
    highlight_entities_html,
    normalize_entities,
    split_sentences,
)

RELATO = (
    "El dia 21 de agosto de 2026, personal policial intercepto un vehiculo marca Toyota, "
    "modelo Hilux, año 2019, color blanco, con patente BBTT21, en la comuna de Arica. "
    "En el interior del vehiculo se encontro un arma de fuego marca Glock, modelo 17, "
    "calibre 9mm, con numero de serie AB1234XZ. Ademas se incauto un arma blanca tipo "
    "cuchillo. Se encontraron 250 gramos de marihuana en el maletero del vehiculo."
)


def test_extract_entities_encuentra_vehiculo_arma_y_droga():
    data = extract_entities(RELATO)

    assert data["vehiculos"]["marcas"] == ["Toyota"]
    assert data["vehiculos"]["modelos"] == ["Hilux"]
    assert data["vehiculos"]["colores"] == ["blanco"]
    assert data["vehiculos"]["anios"] == ["2019"]
    assert data["vehiculos"]["patentes"] == ["BBTT21"]

    assert data["armas"]["marcas"] == ["Glock"]
    assert data["armas"]["modelos"] == ["17"]
    assert data["armas"]["calibres"] == ["9MM"]
    assert data["armas"]["series"] == ["AB1234XZ"]
    assert set(data["armas"]["tipos"]) == {"fuego", "blanca"}

    assert data["drogas"]["sustancias"] == ["marihuana"]
    assert data["drogas"]["medidas"] == ["250 gramos"]


def test_patente_regex_no_confunde_una_fecha_con_una_placa():
    """Regresion: 'de 2026' dentro de una oracion que menciona 'patente' en otra parte se
    leia como placa antigua (2 letras + 4 numeros) hasta que se saco el espacio como
    separador valido."""
    texto = (
        "El dia 20 de agosto de 2026, se revisó un vehiculo con patente BBTT21 en el lugar."
    )
    data = extract_entities(texto)
    assert data["vehiculos"]["patentes"] == ["BBTT21"]
    assert "DE 2026" not in data["vehiculos"]["patentes"]


def test_modelo_de_arma_no_se_filtra_a_vehiculos_cuando_comparten_oracion():
    """Regresion: 'arma encontrada dentro del vehiculo' menciona ambos contextos en la misma
    oracion; el modelo del arma se filtraba tambien a la lista de vehiculos hasta que se
    resolvio por proximidad (la palabra clave mas cercana al match gana)."""
    sentences = split_sentences(
        "En el interior del vehiculo se encontro un arma de fuego marca Glock, modelo 17, "
        "calibre 9mm."
    )
    vehiculos, armas = find_models_by_proximity(
        sentences,
        ("vehiculo", "toyota"),
        ("arma", "glock"),
    )
    assert armas == ["17"]
    assert vehiculos == []


def test_normalize_entities_completa_formato_viejo_sin_drogas():
    """Regresion: entities.json guardados antes de Sprint 5 no tienen la categoria 'drogas'
    ni los campos 'modelos'/'anios' -- sin normalizar, el template rompia con UndefinedError
    al acceder a esas claves inexistentes."""
    formato_viejo = {
        "vehiculos": {"marcas": ["Toyota"], "colores": ["blanco"], "patentes": ["BBTT21"]},
        "armas": {"marcas": ["Glock"], "tipos": ["fuego"], "calibres": ["9MM"], "series": []},
    }
    normalizado = normalize_entities(formato_viejo)

    assert normalizado["drogas"] == {"sustancias": [], "medidas": []}
    assert normalizado["vehiculos"]["modelos"] == []
    assert normalizado["vehiculos"]["anios"] == []
    assert normalizado["vehiculos"]["marcas"] == ["Toyota"]  # se preserva lo que si existia


def test_normalize_entities_con_none():
    assert normalize_entities(None)["vehiculos"]["marcas"] == []


def test_highlight_entities_html_escapa_intentos_de_inyeccion():
    """El texto OCR es contenido no confiable (viene de un documento externo); el resaltado
    debe escaparlo antes de insertar cualquier <mark>, para que un '<script>' capturado por
    el OCR no se ejecute en el navegador."""
    texto = "Vehiculo Toyota. <script>alert(1)</script> fue revisado."
    entities_data = normalize_entities({"vehiculos": {"marcas": ["Toyota"]}})

    resultado = str(highlight_entities_html(texto, entities_data))

    assert "<script>alert(1)</script>" not in resultado
    assert "&lt;script&gt;" in resultado
    assert '<mark class="bg-secondary-container text-on-secondary-container px-1 rounded">Toyota</mark>' in resultado


def test_highlight_entities_html_sin_entidades_solo_escapa():
    texto = "Texto plano sin entidades <b>raro</b>."
    resultado = str(highlight_entities_html(texto, None))
    assert "<mark" not in resultado
    assert "&lt;b&gt;" in resultado
