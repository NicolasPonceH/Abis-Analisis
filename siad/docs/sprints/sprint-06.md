# Sprint 6 — Exportación a formato Word (.docx)

**Fechas:** 22–28 sep 2026 · **Tag:** `v0.6.0` · **Objetivo del roadmap:** generación y descarga de un archivo .docx que integra los datos extraídos en los campos específicos de la plantilla institucional.

## Qué se hizo

- `scripts/build_word_template.py`: genera `word_templates/acta_template.docx`, la plantilla
  institucional. Se corre una sola vez (no en cada arranque de la app); el `.docx` resultante se
  versiona en git como un asset más de la aplicación, no como salida generada por el usuario.
  - El membrete ("POLICÍA DE INVESTIGACIONES DE CHILE" + subtítulo) y el pie de página van en
    `section.header` / `section.footer` — las regiones de layout reales del documento, no
    párrafos normales del cuerpo.
  - El cuerpo tiene 15 marcadores Jinja (`{{ nombre_archivo }}`, `{{ resumen }}`,
    `{{ vehiculos_marcas }}`, etc.), cada uno escrito en un único `run` de python-docx para que
    `docxtpl` los reconozca completos (un tag partido entre dos runs de Word queda ilegible
    para docxtpl).
- `export_to_docx(filename, summary_text, entities_data)` en `app.py`: arma el contexto
  (resumen + listas de entidades unidas con comas, o "No generado"/"No identificado" si algún
  paso previo no se corrió todavía) y renderiza la plantilla con `docxtpl.DocxTemplate`.
- Ruta `POST /export/<filename>`: exige que ya exista texto extraído (Sprint 2); toma el resumen
  y las entidades si existen (opcionales) y guarda el resultado en
  `static/exports/<archivo>.docx`.
- Ruta `GET /exports/<filename>`: descarga el `.docx` ya generado
  (`Content-Disposition: attachment`, nombre de descarga `informe_<archivo>.docx`).
- Panel "Exportar a Word" en `templates/index.html`, con botón generar/regenerar y enlace de
  descarga una vez que existe el archivo.

## Por qué se hizo

El RF-05 del SRS pide "poblado dinámico de documentos Word pre-formateados editables". El SRS
también sugiere `python-docx` y `docxtpl` como stack — se usó `docxtpl` porque es la herramienta
pensada exactamente para este caso: rellenar una plantilla ya diseñada sin reconstruir el
documento desde cero (que es lo que se tendría que hacer con `python-docx` solo).

El roadmap marca como riesgo explícito de este sprint que "las inyecciones de datos variables
(especialmente resúmenes extensos) pueden quebrar el diseño de un documento Word" y pide
"reglas de anclaje para mantener inalterados los márgenes y logos institucionales". La decisión
de poner el membrete en el header/footer real del `.docx` (en vez de, por ejemplo, un párrafo
fijo al principio del cuerpo) es esa regla de anclaje: en el formato DOCX, header y footer son
regiones de layout completamente separadas del flujo del cuerpo — no importa si el resumen tiene
2 oraciones o 20, el membrete no se desplaza ni se deforma, porque estructuralmente no puede.

## explicacion

Acá el sistema aprendió a generar un documento Word oficial con toda la información ya
procesada: el resumen y las entidades detectadas, puestas dentro de una plantilla institucional
ya diseñada (con el membrete de la PDI). Lo importante de este sprint es que, sin importar cuán
largo sea el resumen, el diseño de la plantilla (logos, márgenes, membrete) nunca se rompe,
porque esa parte vive en una región del documento que no se mueve aunque el resto crezca.

## Cómo verificar

### Requisitos previos

```bash
pip install -r requirements.txt
```

`word_templates/acta_template.docx` ya viene generado y versionado en el repo — no hace falta
correr `scripts/build_word_template.py` salvo que se quiera rediseñar la plantilla desde cero.

### Pasos

```bash
python app.py
```

1. Subir un PDF, extraer el texto, generar el resumen e identificar entidades (Sprints 2–5).
2. En el panel "Exportar a Word", pulsar "Generar Word".
3. Confirmar que aparece el enlace "Descargar .docx" y que el archivo descargado abre
   correctamente en Word (o LibreOffice/Google Docs) — sin marcadores `{{ }}` visibles, con el
   membrete institucional en la parte superior de cada página.
4. Caso límite: exportar un documento que **solo** tiene texto extraído (sin resumen ni
   entidades todavía) — el Word debe generarse igual, mostrando "No generado" / "No
   identificado" en los campos correspondientes, sin fallar.

Verificación por línea de comandos:

```bash
curl -s -X POST http://127.0.0.1:5000/export/<archivo>.pdf -o /dev/null -w "%{http_code}\n"  # 302
curl -s http://127.0.0.1:5000/exports/<archivo>.pdf -D - -o informe.docx  # Content-Disposition: attachment
```

Verificación de que la plantilla no tiene tags corruptos (útil si se edita `acta_template.docx`
a mano en Word en vez de regenerarla con el script):

```bash
python -c "
from docxtpl import DocxTemplate
t = DocxTemplate('word_templates/acta_template.docx')
print(sorted(t.get_undeclared_template_variables()))
"
```

Debe imprimir las 15 variables completas (`armas_calibres`, `armas_marcas`, ..., `vehiculos_patentes`).
Si aparecen menos, algún tag quedó partido entre dos runs de Word al editar manualmente.

## Archivos modificados

`app.py`, `templates/index.html`, `requirements.txt` (`docxtpl`), `.gitignore`
(`static/exports/`), `static/exports/.gitkeep`, `scripts/build_word_template.py` (nuevo),
`word_templates/acta_template.docx` (nuevo, versionado).
