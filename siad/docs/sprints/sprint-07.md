# Sprint 7 — Modelado de base de datos e integración de persistencia histórica

**Fechas:** 29 sep–5 oct 2026 · **Tag:** `v0.7.0` · **Objetivo del roadmap:** conexión operativa a una base de datos PostgreSQL diseñada para el registro histórico inmutable de los documentos, textos, entidades y resúmenes procesados.

## Qué se hizo

- **Infraestructura**: instancia de PostgreSQL 16 dedicada a este proyecto (puerto `5434`),
  instalada aparte de otras instancias de PostgreSQL que ya existían en la máquina de
  desarrollo (una de ellas, de otro proyecto, no se tocó). Base de datos `sistema_analisis` con
  su propio rol (`sistema_analisis`, no el superusuario `postgres`).
- `db/schema.sql`: esquema de dos tablas.
  - `documentos`: `id`, `nombre_archivo`, `fecha_procesamiento`, `texto_original`, `resumen`.
  - `entidades`: `id`, `documento_id` (FK), `categoria` (`vehiculo`/`arma`/`droga`), `campo`,
    `valor` — un modelo EAV (entity-attribute-value), no columnas fijas por categoría.
  - Triggers `BEFORE UPDATE OR DELETE` en ambas tablas que abortan la operación con una
    excepción — inmutabilidad reforzada en la base de datos, no solo por convención en el
    código.
- `db.py`: `init_schema()` (aplica `schema.sql`, idempotente), `save_document(...)` (INSERT del
  documento + sus entidades en una transacción), `list_history(...)` (filtros por fecha,
  categoría, palabra clave), `get_document(...)` / `get_document_entities(...)` (detalle),
  `count_saves(...)` (cuántas veces se guardó un archivo).
- En `app.py`: `db.init_schema()` se corre al iniciar la app (envuelto en `try/except` para no
  impedir que arranque si PostgreSQL no está disponible). Rutas nuevas `POST /save/<filename>`,
  `GET /historial` y `GET /historial/<id>`.
- Templates nuevos `historial.html` (listado + formulario de filtros) y `historial_detalle.html`
  (texto original, resumen y entidades de un registro).
- Panel "Guardar en historial" en la vista del documento, con indicador de cuántas veces ya se
  guardó ese archivo (cada guardado es un registro nuevo, no reemplaza al anterior).

## Por qué se hizo

El RF-06 del SRS pide un registro inmutable en PostgreSQL con metadatos, texto original, resumen
y entidades, más la capacidad de consultar el historial filtrando por fecha, categoría de
entidad o palabra clave — eso es literalmente lo que implementan `db.save_document` y
`db.list_history`.

**Por qué EAV y no una tabla `vehiculos` + `armas` + `drogas` con columnas fijas**: el motor de
entidades (`entities.py`, Sprints 4-5) devuelve listas planas por campo (todas las marcas
encontradas, todas las patentes encontradas...), no registros de "un vehículo en particular"
con su marca+modelo+patente asociados entre sí — esa asociación no existe en los datos que el
sistema produce hoy. Forzar un esquema de columnas fijas habría significado inventar una
relación que no está respaldada por la extracción real. El modelo EAV, además, es la forma
estándar de cumplir el NFR del SRS de "escalabilidad para futuras entidades": agregar una
categoría o un campo nuevo es una fila más, no una migración de esquema.

**Por qué instancia propia de PostgreSQL**: la máquina de desarrollo ya tenía tres instancias de
PostgreSQL corriendo, una de ellas con nombre de otro proyecto ("abis"). No había forma de
conectar sin contraseña, y adivinar o resetear la contraseña de una base de datos ajena no era
una opción razonable — se instaló una instancia nueva, dedicada, en un puerto propio, para no
arriesgar interferir con datos de otro trabajo.

**Por qué reforzar la inmutabilidad con triggers y no solo con disciplina de código**: el
roadmap marca como riesgo explícito de este sprint "garantizar la inmutabilidad de los registros
históricos". Un `except` mal puesto o un script de mantenimiento corrido a mano con `UPDATE`
directo en `psql` podría romper esa garantía si solo dependiera de que la app nunca escriba
código de actualización. El trigger la garantiza también fuera de la app.

## explicacion

En este sprint se conectó el sistema a una base de datos (PostgreSQL) para guardar un historial
permanente de todo lo procesado: el documento, su resumen y sus entidades detectadas. Lo clave
es que estos registros son inmutables — una vez guardados, no se pueden modificar ni borrar, ni
siquiera por error o a propósito, porque la propia base de datos lo bloquea a nivel técnico, no
solo por una regla que la aplicación decide respetar. Esto importa porque se trata de un
registro de tipo policial, que necesita mantener su integridad para tener valor como evidencia.

## Cómo verificar

### Requisitos previos

```bash
pip install -r requirements.txt
```

Con PostgreSQL instalado y corriendo, crea el rol y la base de datos una vez (ajusta el
password si usas uno distinto al de `db.py`):

```sql
CREATE ROLE sistema_analisis WITH LOGIN PASSWORD 'SistemaAnalisisApp2026!';
CREATE DATABASE sistema_analisis OWNER sistema_analisis;
```

El esquema se aplica solo al arrancar la app (`db.init_schema()`); si prefieres aplicarlo a
mano: `psql -h 127.0.0.1 -p 5434 -U sistema_analisis -d sistema_analisis -f db/schema.sql`.

### Pasos

```bash
python app.py
```

1. Subir un PDF, extraer el texto, generar resumen e identidades (Sprints 2-5).
2. En el panel "Guardar en historial", pulsar "Guardar en historial". Confirmar el mensaje de
   éxito y que el indicador pasa a "guardado 1 vez".
3. Ir a "Ver historial" (link junto al título). Confirmar que el documento aparece en la tabla.
4. Probar los filtros: por categoría (vehículo/arma/droga), por rango de fechas, y por palabra
   clave (una palabra que sepas que está en el relato, y otra que no debería aparecer).
5. Entrar al detalle de un registro — confirmar que muestra el texto completo, el resumen y las
   entidades agrupadas por categoría.
6. Caso límite de inmutabilidad: intentar un `UPDATE` o `DELETE` manual sobre `documentos` o
   `entidades` vía `psql` — debe fallar con la excepción del trigger, no ejecutarse.
7. Caso límite de resiliencia: con la base de datos detenida (o apuntando `DB_PORT` a un puerto
   sin nada escuchando), abrir la vista de un documento — la app no debe caerse; el panel de
   historial debe mostrar el aviso de que no pudo conectar, y debe fallar en unos segundos
   (`connect_timeout`), no colgarse.

Verificación por línea de comandos:

```bash
curl -s -X POST http://127.0.0.1:5000/save/<archivo>.pdf -o /dev/null -w "%{http_code}\n"  # 302
curl -s "http://127.0.0.1:5000/historial?categoria=droga&palabra_clave=marihuana"
```

Verificación directa contra `db.py`, sin pasar por Flask:

```bash
python -c "
import db
for r in db.list_history(categoria='vehiculo'):
    print(r['id'], r['nombre_archivo'], r['fecha_procesamiento'])
"
```

## Archivos modificados

`db.py` (nuevo), `db/schema.sql` (nuevo), `app.py`, `templates/index.html`,
`templates/historial.html` (nuevo), `templates/historial_detalle.html` (nuevo),
`requirements.txt` (`psycopg[binary]`).
