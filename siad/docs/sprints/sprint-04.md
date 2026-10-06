# Sprint 4 — Extracción de entidades: vehículos y armas

**Fechas:** 8–14 sep 2026 · **Tag:** `v0.4.0` · **Objetivo del roadmap:** sistema capaz de identificar y aislar marcas, modelos, patentes, calibres y números de serie.

## Qué se hizo

- Módulo nuevo `entities.py` con:
  - Listas de marcas conocidas de vehículos (`VEHICLE_BRANDS`) y de armas (`WEAPON_BRANDS`),
    y de colores de vehículos (`VEHICLE_COLORS`).
  - `WEAPON_TYPES`: diccionario de palabras clave para clasificar el tipo de arma mencionada
    (fuego, fogueo, blanca).
  - Regex con palabra clave de contexto obligatoria para **patente/PPU**, **calibre** y
    **número de serie** — el patrón solo se evalúa dentro de una oración que ya menciona
    "patente"/"ppu"/"placa", "calibre" o "serie", respectivamente.
  - `extract_entities(raw_text)`: función pública que devuelve un diccionario
    `{"vehiculos": {...}, "armas": {...}}` con cada categoría como lista.
- Ruta `POST /entities/<filename>` en `app.py`: exige que ya exista texto extraído, corre
  `extract_entities` y cachea el resultado en `static/entities/<archivo>.json`.
- Panel "Entidades detectadas (vehículos y armas)" en `templates/index.html`, con las listas de
  cada categoría en dos columnas (vehículos / armas).

## Por qué se hizo

El RF-04 del SRS pide identificar y clasificar vehículos (marcas, modelos, años, colores, PPU) y
armas (fuego, fogueo, blancas, calibres, marcas, modelos y series). No existe un modelo de NER
en español pre-entrenado para este dominio (terminología policial/legal chilena), y no hay datos
etiquetados propios para entrenar uno en el marco de un sprint semanal — por eso se optó por un
enfoque basado en reglas (listas + regex), consistente con el enfoque on-premise ya usado en el
resumen del Sprint 3.

El roadmap marca explícitamente como riesgo de este sprint que "el modelamiento de la extracción
(NER) requiere iteraciones precisas... sin generar falsos positivos" (ver
[ROADMAP.md](../ROADMAP.md)). Por eso los patrones de patente/calibre/serie no corren sueltos
sobre todo el documento: solo se evalúan dentro de una oración que ya menciona la palabra clave
correspondiente. Se detectó en pruebas manuales que un regex de patente sin esa restricción
generaba falsos positivos (p. ej. "de 2026" leído como placa antigua "LL NNNN"); se corrigió
quitando el espacio como separador válido, exactamente el tipo de iteración que el roadmap
anticipaba.

## explicacion

En este sprint el sistema empezó a detectar automáticamente información específica dentro del
texto: datos de vehículos (marca, color, patente) y de armas (marca, tipo, calibre, número de
serie). Como no existe una inteligencia artificial ya entrenada para reconocer este tipo de
información en español y en el contexto de un acta policial chilena, se armó un sistema basado
en listas de palabras conocidas (marcas, colores) y patrones de texto, con la precaución de que
cada patrón solo se active si aparece cerca de una palabra clave de contexto — por ejemplo, para
no confundir una fecha ("de 2026") con una patente antigua.

## Cómo verificar

### Requisitos previos

Ninguno adicional sobre el Sprint 3 — `entities.py` no agrega dependencias nuevas.

### Pasos

```bash
python app.py
```

1. Subir un PDF cuyo relato mencione al menos un vehículo (marca, color, patente) y un arma
   (marca, tipo, calibre, número de serie).
2. Extraer el texto (Sprint 2) — el botón "Identificar entidades" solo aparece habilitado si
   ya hay texto extraído.
3. Pulsar "Identificar entidades".
4. Confirmar que el panel muestra las listas correctas en ambas columnas (Vehículos / Armas),
   y que las categorías sin coincidencias muestran "Ninguna/o detectado" en vez de romper la
   página.
5. Revisar `static/entities/<archivo>.pdf.json` — debe ser JSON válido con la estructura
   `{"vehiculos": {...}, "armas": {...}}`.

Verificación por línea de comandos:

```bash
curl -s -X POST http://127.0.0.1:5000/entities/<archivo>.pdf -o /dev/null -w "%{http_code}\n"  # 302
```

Verificación de la función de extracción sin pasar por Flask (útil para iterar rápido sobre los
patrones o las listas de marcas):

```bash
python -c "
import json
from entities import extract_entities
print(json.dumps(extract_entities(open('static/extracted/<archivo>.pdf.txt', encoding='utf-8').read()), indent=2, ensure_ascii=False))
"
```

Caso límite a probar explícitamente (falso positivo de patente): un texto que mencione
"patente" en una oración y, en otra parte del mismo párrafo, una fecha con año (p. ej. "de
2026") — confirmar que el año **no** aparece en la lista de patentes.

## Archivos modificados

`entities.py` (nuevo), `app.py`, `templates/index.html`, `.gitignore` (`static/entities/`),
`static/entities/.gitkeep`.
