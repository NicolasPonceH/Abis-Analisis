# Sprint 2 — Motor OCR y preprocesamiento de imágenes

**Fechas:** 25–31 ago 2026 · **Tag:** `v0.2.0` · **Objetivo del roadmap:** el sistema extrae el texto crudo de PDFs escaneados o digitales utilizando procesamiento de imágenes previo.

## Qué se hizo

- `extract_text_from_pdf` en `app.py`: recorre cada página del PDF con PyMuPDF; si trae texto
  embebido (PDF "digital") lo usa directo, y si no (acta escaneada, menos de
  `MIN_EMBEDDED_TEXT_CHARS` caracteres) la rasteriza a imagen a 300 dpi.
- `preprocess_for_ocr`: convierte la imagen rasterizada a escala de grises y le aplica
  autocontraste (Pillow) antes de pasarla a Tesseract.
- `ocr_page`: corre `pytesseract.image_to_string` con `lang="spa"` sobre la imagen preprocesada.
- Ruta `POST /extract/<filename>`: ejecuta la extracción completa del documento y cachea el
  resultado en `static/extracted/<archivo>.txt` (evita re-OCRear en cada visita).
- Panel "Texto extraído (OCR)" en `templates/index.html`, con botón para extraer o re-extraer.
- Instalación de Tesseract OCR (vía winget) y descarga del modelo de idioma español
  (`tessdata/spa.traineddata`), ya que el instalador por defecto solo trae inglés.

## Por qué se hizo

El RF-02 del SRS pide reconocer y digitalizar texto incrustado en imágenes dentro de los PDF.
El roadmap ([ROADMAP.md](../ROADMAP.md)) marca explícitamente como riesgo del sprint que "la
eficacia del OCR depende directamente de la legibilidad de las actas escaneadas" y pide
"incorporar filtros robustos para nivelar el contraste antes de extraer el texto" — de ahí el
paso de preprocesamiento, no es opcional. Usar el texto embebido cuando ya existe evita OCR
innecesario (más rápido y sin pérdida de precisión) en los PDFs que no son escaneados.

## explicacion

En este sprint el sistema empezó a "leer" el contenido de los documentos. Si el PDF es un
archivo digital (con texto real adentro), el texto se extrae directo; pero si es un acta
escaneada (una foto o un scan, solo una imagen), el sistema usa OCR — reconocimiento óptico de
caracteres — para leer el texto que aparece en la imagen, primero mejorando el contraste para
que se lea mejor. Así el sistema funciona igual de bien con documentos que ya vienen en formato
digital que con papeles escaneados, que es el caso más común en la práctica.

## Cómo verificar

### Requisitos previos

Además de lo del Sprint 1:

```bash
# Windows — instala el motor Tesseract
winget install --id UB-Mannheim.TesseractOCR -e

# Modelo de idioma espanol (el instalador solo trae ingles)
curl -L -o tessdata/spa.traineddata https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/spa.traineddata
```

### Pasos

```bash
python app.py
```

1. Subir un PDF (idealmente uno escaneado, para forzar la ruta de OCR).
2. En la vista del documento, pulsar "Extraer texto".
3. Confirmar que aparece el panel con el texto extraído, marcado por página
   (`--- Pagina N ---`).
4. Revisar `static/extracted/<archivo>.pdf.txt` — debe existir y tener contenido legible en
   español.
5. Volver a pulsar "Volver a extraer" y confirmar que no falla (sobrescribe el cache).

Verificación por línea de comandos:

```bash
curl -s -X POST http://127.0.0.1:5000/extract/<archivo>.pdf -o /dev/null -w "%{http_code}\n"  # 302
```

Si Tesseract no está instalado o no se encuentra en el `PATH`, la ruta debe responder con un
mensaje flash claro en vez de un error 500 — probarlo renombrando temporalmente el ejecutable o
desconfigurando `TESSERACT_CMD` es la forma de confirmar ese caso límite.

## Archivos modificados

`app.py`, `templates/index.html`, `requirements.txt` (`PyMuPDF`, `pytesseract`, `Pillow`),
`.gitignore` (`static/extracted/`, `tessdata/`), `static/extracted/.gitkeep`.
