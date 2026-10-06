# Sprint 9 — Pruebas de integración, manejo de excepciones y seguridad

**Fechas:** 13–19 oct 2026 · **Tag:** `v0.9.0` · **Objetivo del roadmap:** sistema estabilizado frente a PDFs corruptos y validación de los mecanismos de respaldo de la base de datos PostgreSQL y protección de la información.

## Qué se hizo

### Pruebas de integración (`tests/`, pytest)

- `tests/conftest.py`: fixtures compartidas. `DB_NAME` se sobreescribe a
  `sistema_analisis_test` **antes** de importar `app`/`db`, para que la suite nunca toque el
  historial real. Un fixture de sesión recrea las tablas al empezar (no puede hacer `DELETE`
  para "limpiar" entre corridas — el trigger de inmutabilidad de Sprint 7 lo bloquea también
  ahí). `cleanup_files` registra archivos generados por cada test y los borra al terminar,
  incluyendo su versión pasada por `secure_filename()` (ver el bug de abajo).
- `tests/test_entities.py` (7 pruebas, sin DB): cubre extracción normal, y **formaliza como
  regresión automatizada** varios bugs reales encontrados y corregidos a mano en sprints
  anteriores — el falso positivo de patente ("de 2026" leído como placa, Sprint 4), la mezcla
  de modelo de arma/vehículo cuando comparten oración (Sprint 5), el `UndefinedError` con
  `entities.json` de formato viejo (corregido después de Sprint 5), y el escape HTML del
  resaltado de OCR (corregido en el rediseño de interfaz).
- `tests/test_upload.py` (5 pruebas): archivo faltante, extensión no-PDF, **PDF corrupto**
  (el caso que el roadmap nombra explícitamente para este sprint), subida válida, y carga
  masiva (varios PDFs fusionados).
- `tests/test_pipeline.py` (2 pruebas): el flujo completo por HTTP —
  subir → OCR → resumen → entidades → exportar (sin depender de la base de datos), y una
  segunda que además guarda en el historial y verifica los filtros de `/historial` y el
  tablero de `/estadisticas` (se salta si PostgreSQL no está disponible).
- `tests/test_db.py` (9 pruebas): `save_document`/`list_history` con sus filtros, conteo de
  guardados, `get_stats`, y **prueba directa de que los triggers de inmutabilidad bloquean
  `UPDATE` y `DELETE`** — no solo se confía en que la app nunca escriba esas sentencias.

### Manejo de excepciones ("sistema estabilizado frente a PDFs corruptos")

- `is_valid_pdf()`: al subir un archivo, además de la extensión `.pdf` se confirma que
  realmente abre como PDF (`fitz.open` + al menos una página). Si no, se borra y se avisa de
  inmediato — antes un archivo dañado se guardaba igual y recién fallaba (sin manejo) al
  intentar el OCR.
- `/extract` ahora captura `fitz.FileDataError`/`RuntimeError` con un mensaje claro, por si un
  PDF se corrompe después de subido (o la validación de subida no alcanza a cubrir algún caso).
- `load_entities_json()`: un `entities.json` cacheado con contenido corrupto (JSON inválido,
  escritura interrumpida a medias) se trata como si no existiera, no como un error 500. De
  paso reemplaza cuatro bloques de código duplicados que hacían lo mismo sin esta protección.
- `@app.errorhandler(500)`: red de seguridad genérica para cualquier excepción no anticipada.

### Seguridad

- **Modo debug desactivado por defecto** (`FLASK_DEBUG=1` para reactivarlo). El depurador
  interactivo de Werkzeug (el mismo que mostró la traza con "Brought to you by DON'T PANIC" en
  un error de una sesión anterior) permite ejecutar código Python arbitrario desde el
  navegador — aceptable en desarrollo local, pero un riesgo serio si el puerto se expusiera
  más allá de `127.0.0.1`. Ya no queda encendido por accidente.
- `SECRET_KEY` configurable por variable de entorno (antes hardcodeado).
- Revisión de los vectores comunes, sin cambios de código donde ya estaban cubiertos:
  - **Inyección SQL**: todas las consultas de `db.py` usan parámetros (`%s`), nunca
    interpolación de strings — verificado, sin hallazgos.
  - **XSS**: Jinja2 escapa por defecto; el único punto que inserta HTML sin escapar
    (`highlight_entities_html`) escapa todo el texto primero y solo agrega tags `<mark>`
    propios — cubierto por prueba automatizada con un intento de inyección real.
  - **Path traversal**: `secure_filename()` se aplica a todo nombre de archivo que toca el
    sistema de archivos — verificado, sin hallazgos.
  - **Control de acceso a la base de datos**: la app se conecta con un rol dedicado
    (`sistema_analisis`, Sprint 7), no con el superusuario `postgres`.
- Limitaciones conocidas, documentadas en vez de resueltas (fuera de alcance para este
  sprint): no hay protección CSRF en los formularios (riesgo bajo para una herramienta
  on-premise de un solo operador, pero real si se expusiera en red); la contraseña por
  defecto de la base de datos sigue en el código fuente como valor de desarrollo — cualquier
  instalación real debe sobreescribir `DB_PASSWORD` y `SECRET_KEY`.

### Respaldo de PostgreSQL

- `scripts/backup_db.py`: corre `pg_dump` en formato custom (comprimido, restaurable con
  `pg_restore`) hacia `backups/`, no versionado.
- **Se probó el ciclo completo, no solo que el script generara un archivo**: backup →
  restauración en una base de datos nueva → comparación de conteos de filas → confirmación de
  que el trigger de inmutabilidad sigue funcionando en la base restaurada.

## Por qué se hizo

El objetivo del sprint en el roadmap es literal: "sistema estabilizado frente a PDFs
corruptos y validación de los mecanismos de respaldo de la base de datos PostgreSQL". No dice
"agregar un script de respaldo" — dice **validar** que el mecanismo funciona, por eso el paso
de restaurar y comparar no es opcional. Mismo criterio para las excepciones: el roadmap nombra
específicamente PDFs corruptos como el caso a cubrir, no manejo de errores en general.

La suite de pruebas se diseñó deliberadamente para formalizar bugs ya encontrados en sprints
anteriores (patente/modelo/UndefinedError/XSS) en vez de empezar de cero con pruebas
genéricas — son las regresiones más probables de este proyecto específico, porque ya
ocurrieron una vez.

## explicacion

Este sprint fue de estabilidad y seguridad, no de funciones nuevas que se vean en pantalla. Se
armó una batería de 23 pruebas automáticas que revisan que todo el sistema siga funcionando
correctamente cada vez que se modifica algo, incluyendo un caso concreto: subir un archivo
dañado que dice ser PDF pero no lo es — antes eso podía romper la aplicación, ahora se rechaza
con un mensaje claro. También se apagó el modo de desarrollo (que muestra información técnica
sensible si algo falla) y se probó de verdad que el respaldo de la base de datos funciona,
restaurándolo en una base nueva para confirmarlo, no solo generando el archivo.

## Cómo verificar

### Requisitos previos

```bash
pip install -r requirements.txt
```

Para las pruebas que usan PostgreSQL, crear la base de datos de pruebas una vez:

```sql
CREATE DATABASE sistema_analisis_test OWNER sistema_analisis;
```

### Pasos

```bash
python -m pytest -v
```

Deben pasar las 23 pruebas (o saltarse las de base de datos si PostgreSQL no está corriendo,
nunca fallar por eso).

Caso límite específico del sprint — subir un PDF corrupto por la interfaz:

1. Crear un archivo de texto plano y renombrarlo `falso.pdf`.
2. Subirlo desde "Procesar Documentos".
3. Debe rechazarse con un mensaje claro ("El archivo está dañado o no es un PDF válido"), sin
   error 500 y sin quedar listado como documento cargado.

Verificar el respaldo de punta a punta:

```bash
python scripts/backup_db.py
# crear una base de datos nueva y restaurar el .dump generado
createdb -h 127.0.0.1 -p 5434 -U sistema_analisis sistema_analisis_verificacion
pg_restore -h 127.0.0.1 -p 5434 -U sistema_analisis -d sistema_analisis_verificacion backups/<archivo>.dump
psql -h 127.0.0.1 -p 5434 -U sistema_analisis -d sistema_analisis_verificacion -c "SELECT COUNT(*) FROM documentos;"
# comparar contra el conteo real: psql ... -d sistema_analisis -c "SELECT COUNT(*) FROM documentos;"
dropdb -h 127.0.0.1 -p 5434 -U sistema_analisis sistema_analisis_verificacion
```

Verificar que el modo debug quedó desactivado por defecto:

```bash
python app.py
# la salida NO debe decir "Debug mode: on" a menos que hayas puesto FLASK_DEBUG=1
```

## Archivos modificados

`app.py`, `.gitignore`, `requirements.txt` (`pytest`), `pytest.ini` (nuevo), `tests/` (nuevo:
`conftest.py`, `test_entities.py`, `test_upload.py`, `test_pipeline.py`, `test_db.py`),
`scripts/backup_db.py` (nuevo), `backups/.gitkeep` (nuevo).
