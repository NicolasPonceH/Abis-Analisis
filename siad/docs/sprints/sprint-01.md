# Sprint 1 — Arquitectura base e interfaz de carga

**Fechas:** 18–24 ago 2026 · **Tag:** `v0.1.0` · **Objetivo del roadmap:** interfaz web operativa donde se puede subir un archivo PDF y visualizarlo correctamente.

## Qué se hizo

- Aplicación Flask base (`app.py`) con cuatro rutas:
  - `GET /` — lista los PDFs ya cargados.
  - `POST /upload` — recibe un PDF, lo valida y lo guarda.
  - `GET /view/<filename>` — muestra el visor embebido del documento.
  - `GET /uploads/<filename>` — sirve el archivo PDF crudo para el `<iframe>`.
- Plantilla única (`templates/index.html`) que combina el formulario de subida y el visor.
- Almacenamiento en `static/uploads/`, con nombres de archivo saneados vía
  `werkzeug.utils.secure_filename` (tanto al guardar como al buscar) y validación de extensión
  restringida a `.pdf`.

## Por qué se hizo

Es el punto de partida del roadmap de 10 sprints (ver [ROADMAP.md](../ROADMAP.md)): antes de
meter OCR, NLP o extracción de entidades, se necesita un esqueleto funcional donde cargar y ver
los documentos que todo lo demás va a procesar. `secure_filename` en ambos sentidos (subida y
lookup) evita path traversal vía nombres de archivo maliciosos — el único vector de entrada de
esta etapa.

## explicacion

En este sprint se construyó la base de la aplicación web: una página donde se puede subir un
archivo PDF (un acta) y verlo directamente en el navegador, sin tener que descargarlo aparte.
También se agregó la opción de subir varios PDF a la vez, que el sistema une automáticamente en
un solo documento antes de procesarlo. Es el punto de partida de todo el proyecto: antes de
poder sacar información de un documento (resumen, entidades, estadísticas), primero hay que
poder subirlo y visualizarlo correctamente.

## Cómo verificar

### Requisitos previos

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### Pasos

```bash
python app.py
```

Abrir `http://127.0.0.1:5000` y:

1. Confirmar que la página carga con el formulario de subida vacío.
2. Subir un PDF cualquiera — debe redirigir a `/view/<archivo>` y mostrarlo embebido.
3. Volver a `/` — el archivo debe aparecer listado en "Documentos cargados".
4. Intentar subir un archivo que no sea `.pdf` — debe rechazarlo con el mensaje flash
   correspondiente, sin guardarlo en `static/uploads/`.

Verificación por línea de comandos (sin navegador):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5000/          # 200
curl -s -F "pdf_file=@ruta/al/archivo.pdf" http://127.0.0.1:5000/upload  # 302 -> /view/archivo.pdf
```

## Archivos modificados

`app.py`, `templates/index.html`, `static/uploads/.gitkeep`, `.gitignore`, `requirements.txt`.

---

## Actualización — carga masiva (20 ago 2026, `v0.5.1`)

El RF-01 del SRS pide "carga masiva o individual" de PDFs; Sprint 1 solo implementó individual.
Quedó anotado como brecha pendiente durante una revisión de cumplimiento contra el SRS
(Sprint 4), y el usuario confirmó después que sí se necesita: van a llegar **muchos PDF que se
unen en uno solo antes de procesar**, no varios documentos independientes.

### Qué se hizo

- `merge_uploaded_pdfs(files)` en `app.py`: recibe varios archivos, los abre con PyMuPDF
  (`fitz.open(stream=..., filetype="pdf")`) y los concatena con `insert_pdf` en un único
  documento, guardado como `carga_<timestamp>.pdf`.
- `POST /upload` ahora usa `request.files.getlist("pdf_file")` en vez de un solo archivo: si
  se sube uno, se guarda igual que antes (compatibilidad hacia atrás, conserva su nombre
  original); si se suben varios, se combinan con `merge_uploaded_pdfs`.
- Si alguno de los archivos no es un PDF válido (aunque tenga extensión `.pdf`), la fusión falla
  de forma controlada — mensaje flash, redirección a `/`, sin error 500.
- `<input type="file" multiple>` en `templates/index.html`, con una nota indicando que los
  archivos se unen antes de procesarse.

### Por qué se hizo

No usa un modelo/librería nueva porque PyMuPDF ya era una dependencia del proyecto desde Sprint
2 — `insert_pdf` es la forma estándar de concatenar PDFs con esa librería. Se optó por fusionar
en un solo documento (en vez de procesar cada PDF por separado y agregar sus resultados) porque
es literalmente lo que se pidió: "se pueden unir en uno solo. Y procesar" — el resto del
pipeline (OCR, resumen, entidades) sigue operando sobre un único archivo sin cambios.

### Cómo verificar

```bash
python app.py
```

1. En el formulario de subida, seleccionar **varios** PDF a la vez (el input ahora lo permite).
2. Confirmar que redirige a `/view/carga_<fecha>_<hora>.pdf` y que el visor muestra todas las
   páginas de todos los documentos, en el orden en que se seleccionaron.
3. Subir un solo PDF — debe seguir guardándose con su nombre original, igual que antes.
4. Mezclar un archivo que no sea un PDF válido (p. ej. un `.txt` renombrado a `.pdf`) junto con
   uno válido — debe fallar con un mensaje flash, sin romper el servidor.

Verificación por línea de comandos:

```bash
curl -s -F "pdf_file=@doc1.pdf" -F "pdf_file=@doc2.pdf" http://127.0.0.1:5000/upload -D - -o /dev/null
# Location: /view/carga_<timestamp>.pdf

python -c "
import pymupdf as fitz
d = fitz.open('static/uploads/carga_<timestamp>.pdf')
print('paginas:', d.page_count)
"
```

### Archivos modificados

`app.py`, `templates/index.html`.
