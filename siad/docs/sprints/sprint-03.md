# Sprint 3 — Resumen del relato con NLP

**Fechas:** 1–7 sep 2026 · **Tag:** `v0.3.0` · **Objetivo del roadmap:** módulo que procesa el texto extraído y redacta una síntesis coherente de los hechos documentados.

## Qué se hizo

- `summarize_text` en `app.py`: quita los marcadores de página del texto extraído (Sprint 2),
  lo procesa con spaCy (`es_core_news_sm`) y usa el pipeline `textrank` (librería `pytextrank`)
  para puntuar las oraciones por relevancia y seleccionar las `SUMMARY_SENTENCES` (10) más
  importantes — resumen **extractivo**, no redactado de cero.
- Ruta `POST /summarize/<filename>`: exige que ya exista texto extraído; corre el resumen y lo
  cachea en `static/summaries/<archivo>.txt`.
- Panel "Resumen (síntesis del relato)" en `templates/index.html`, deshabilitado hasta que haya
  texto extraído.
- Modelo de idioma español de spaCy pineado directo en `requirements.txt` como wheel (URL de
  GitHub), para que quede instalado con un solo `pip install -r requirements.txt` — a diferencia
  de Tesseract, que sigue siendo un binario del sistema aparte.

## Por qué se hizo

El RF-03 del SRS pide una síntesis clara del relato. Se evaluaron dos rutas: un modelo
abstractivo vía API de un LLM (mejor calidad de redacción, pero el texto sale del servidor hacia
un tercero) o un enfoque extractivo local con spaCy — que el propio SRS ya sugiere como parte del
stack. Se optó por la segunda porque el NFR de "ejecución preferentemente on-premise" del SRS
pesa más que la mejora de calidad, y porque no tiene costo de API. Ver la discusión completa en
el historial de la conversación del sprint; queda documentado como decisión de arquitectura para
no repetirla sin motivo en sprints futuros.

## explicacion

Acá se agregó el resumen automático del relato. El sistema usa procesamiento de lenguaje
natural para leer todo el texto extraído y quedarse con las oraciones más importantes, armando
una síntesis. Es un resumen extractivo: no redacta texto nuevo con inteligencia artificial
generativa, sino que elige y ordena las frases más relevantes que ya están escritas en el propio
documento. Se optó por que corra localmente, en el mismo computador, sin mandar el texto a
internet ni a ningún servicio externo, porque se trata de información policial sensible.

## Cómo verificar

### Requisitos previos

Sin pasos manuales adicionales sobre el Sprint 2 — `spacy`, `pytextrank` y el modelo
`es_core_news_sm` ya están en `requirements.txt`:

```bash
pip install -r requirements.txt
```

### Pasos

```bash
python app.py
```

1. Subir un PDF y extraer su texto (Sprint 2) — el botón "Generar resumen" solo aparece
   habilitado si ya hay texto extraído.
2. Pulsar "Generar resumen".
3. Confirmar que aparece un bloque de oraciones (no todo el documento, solo las más relevantes)
   y que los acentos/eñes se ven bien en el navegador.
4. Revisar `static/summaries/<archivo>.pdf.txt`.
5. Intentar generar un resumen de un documento sin texto extraído (URL directa a
   `/summarize/<archivo>`) — debe redirigir con el mensaje flash pidiendo extraer primero, no
   fallar con un error.

Verificación por línea de comandos:

```bash
curl -s -X POST http://127.0.0.1:5000/summarize/<archivo>.pdf -o /dev/null -w "%{http_code}\n"  # 302
```

Verificación de la función de resumen sin pasar por Flask (útil para iterar rápido sobre el
umbral de `SUMMARY_SENTENCES` o el modelo):

```bash
python -c "from app import summarize_text; print(summarize_text(open('static/extracted/<archivo>.pdf.txt', encoding='utf-8').read()))"
```

## Archivos modificados

`app.py`, `templates/index.html`, `requirements.txt` (`spacy`, `pytextrank`,
`es_core_news_sm`), `.gitignore` (`static/summaries/`), `static/summaries/.gitkeep`.
