# Sprint 5 — Extracción de entidades: drogas y afinamiento general

**Fechas:** 15–21 sep 2026 · **Tag:** `v0.5.0` · **Objetivo del roadmap:** identificación de tipos de sustancias, pesajes y medidas. Se considera una carga de trabajo ajustada considerando los feriados de Fiestas Patrias.

## Qué se hizo

- En `entities.py`, extracción de entidades de **drogas**:
  - `DRUG_SUBSTANCES`: lista de sustancias comunes en actas policiales chilenas (marihuana,
    cocaína, pasta base, heroína, metanfetamina, éxtasis/MDMA, ketamina, LSD, hachís,
    anfetamina).
  - `DRUG_KEYWORDS` + `DRUG_UNIT_REGEX`: patrón de cantidad+unidad (gramos, kg, miligramos,
    dosis, papelillos, unidades, plantas, litros, onzas).
  - `find_drug_measures(sentences)`: solo cuenta un pesaje/medida si la oración ya menciona una
    sustancia conocida o una palabra clave de droga ("droga", "sustancia", "estupefaciente",
    "incautación"...).
- "Afinamiento general" (parte explícita del objetivo del sprint): se agregaron dos campos del
  RF-04 que el Sprint 4 había dejado fuera:
  - **Modelo** de vehículo y de arma (`MODEL_REGEX`, gatillado por la palabra "modelo").
  - **Año de fabricación** de vehículo (`YEAR_REGEX`, gatillado por "año"/"fabricación").
- `find_models_by_proximity`: como "modelo X" por sí solo no dice si es de un vehículo o de un
  arma, se resuelve por proximidad — se asigna a la categoría (vehículo/arma) cuya palabra
  clave de contexto aparece más cerca, antes, del match dentro de la misma oración.
- Panel de entidades en `templates/index.html` pasó de dos a tres columnas (vehículos / armas /
  drogas), con los campos nuevos de modelo y año.

## Por qué se hizo

El RF-04 del SRS pide identificar drogas ("sustancias y aislamiento de medidas y pesos"), y el
roadmap agrupa el riesgo de precisión de NER para Sprints 4 y 5 juntos — por eso las drogas
usan exactamente el mismo criterio de mitigación de falsos positivos ya validado en Sprint 4
(palabra clave de contexto obligatoria en la misma oración), en vez de inventar un enfoque
nuevo.

El "afinamiento general" no es un requisito nuevo: es cerrar una brecha real del RF-04 —
"vehículos: marcas, **modelos**, **años de fabricación**, colores y PPU" y "armas: ...marcas,
**modelos** y series" — que Sprint 4 no cubrió completo. Se detectó al revisar el SRS contra lo
construido.

Durante las pruebas manuales de este sprint apareció un caso no cubierto por el diseño
original: una oración que menciona un arma encontrada *dentro de* un vehículo satisface el
contexto de ambas categorías a la vez, así que "modelo X" se filtraba a las dos listas. Se
corrigió con una heurística de proximidad en vez de descartar el campo modelo — es el tipo de
iteración que el roadmap anticipa explícitamente para estos dos sprints.

## explicacion

Se agregó la detección de drogas: qué sustancia es y cuánto se incautó (gramos, kilos, dosis,
plantas, etc.), usando el mismo método de palabras clave del sprint anterior. También se
completaron dos datos que habían quedado pendientes: el modelo y el año del vehículo, y el
modelo del arma. Un caso interesante que se resolvió acá: cuando una oración menciona un arma
encontrada dentro de un vehículo, el sistema tenía que decidir a cuál de los dos pertenece la
palabra "modelo" mencionada — se resolvió mirando cuál de las dos palabras de contexto
(vehículo o arma) está escrita más cerca.

## Cómo verificar

### Requisitos previos

Ninguno adicional sobre el Sprint 4 — no se agregaron dependencias nuevas.

### Pasos

```bash
python app.py
```

1. Subir un PDF cuyo relato mencione: un vehículo con modelo y año, un arma con modelo, y al
   menos una sustancia con su pesaje (p. ej. "250 gramos de marihuana").
2. Extraer el texto e identificar entidades (Sprints 2 y 4).
3. Confirmar que el panel ahora muestra tres columnas, con "Modelos" y "Años" en vehículos,
   "Modelos" en armas, y "Sustancias"/"Medidas" en la columna nueva de drogas.
4. Caso límite específico de este sprint: un relato donde la misma oración mencione un arma
   *dentro de* un vehículo con ambos "modelo X" (p. ej. "arma marca Glock, modelo 17,
   encontrada en el vehículo") — confirmar que "17" aparece **solo** en armas.modelos, no en
   vehiculos.modelos.

Verificación por línea de comandos:

```bash
curl -s -X POST http://127.0.0.1:5000/entities/<archivo>.pdf -o /dev/null -w "%{http_code}\n"  # 302
```

Verificación de la función de extracción sin pasar por Flask:

```bash
python -c "
import json
from entities import extract_entities
print(json.dumps(extract_entities(open('static/extracted/<archivo>.pdf.txt', encoding='utf-8').read()), indent=2, ensure_ascii=False))
"
```

## Archivos modificados

`entities.py`, `templates/index.html`. (`app.py` no requirió cambios — ya pasaba el diccionario
completo de `extract_entities` al template desde Sprint 4.)
