---
title: "Informe de Avance — Sprint 3"
subtitle: "Sistema de Gestión Automatizada de Identificación Biométrica (ABIS)"
---

**Proyecto:** Sistema ABIS
**Periodo del ciclo:** 1 de septiembre de 2026 – 7 de septiembre de 2026
**Fecha de presentación:** 20 de agosto de 2026

## 1. Objetivo del ciclo

Según la hoja de ruta del proyecto, el Sprint 3 tiene como objetivo el **desarrollo del proceso
de ingesta (ETL)**, con el siguiente entregable comprometido:

- Lógica de transformación y limpieza de datos diarios.
- Resolución de inconsistencias (manejo de errores de tipeo en Excel).
- Inserción transaccional (bulk insert) en PostgreSQL.

## 2. Trabajo realizado

### 2.1. Corrección de errores de tipeo (`src/etl/`)

| Archivo | Responsabilidad |
|---|---|
| `fuzzyMatch.js` | Distancia de Levenshtein y búsqueda del candidato más cercano dentro de un catálogo |
| `catalogResolver.js` | Intenta coincidencia exacta primero (Sprint 2); si falla, corrige por tipeo (distancia ≤ 2) siempre que el candidato sea único |
| `bulkInsert.js` | Inserta un lote de filas ya mapeadas en `registro_enrolamiento` dentro de una única transacción |
| `index.js` | Orquesta lectura → validación → mapeo (con corrección) → inserción transaccional |

`src/ingest/catalogMapper.js` (Sprint 2) se extendió para usar este resolver en `Nacionalidad`,
`Equipo` y los tres campos de `Estado`. Cada fila mapeada ahora incluye un array `correcciones`
con el detalle de qué se corrigió y a qué se interpretó, para dejar rastro auditable.

**Decisión de alcance**: `Region`, `Unidad` y `Cuartel` siguen exigiendo coincidencia exacta — al
ser una jerarquía de 3 niveles, una corrección automática ambigua ahí (¿la unidad tiene el typo,
o el cuartel, o ambos?) es más riesgosa que en un catálogo plano de un solo campo.

### 2.2. Inserción transaccional (bulk insert)

`bulkInsert.js` arma un único `INSERT ... VALUES (...), (...), ...` con todas las filas válidas
del archivo y lo ejecuta dentro de una transacción (`BEGIN`/`COMMIT`/`ROLLBACK`) — si algo falla a
mitad de camino, no queda ninguna fila del lote insertada a medias.

**Decisión de diseño**: las filas con errores de mapeo **no bloquean** al resto del lote — se
insertan todas las filas válidas y se reportan las demás aparte, para que un puñado de filas con
datos malos no tumbe la carga diaria completa.

**Límite conocido**: PostgreSQL acepta como máximo 65.535 parámetros por consulta (~6.500 filas
con las 10 columnas de `registro_enrolamiento`). Alcanza de sobra para un Excel diario, pero la
carga histórica de 95k+ registros (Sprint 4) va a necesitar particionar en lotes — queda anotado
como pendiente explícito para ese sprint.

### 2.3. `scripts/procesar-excel.js` (`npm run etl`)

Corre el flujo completo (a diferencia de `npm run ingest`, que del Sprint 2 sigue existiendo como
modo de solo lectura/previsualización sin insertar). Reporta filas insertadas, correcciones
automáticas aplicadas y filas rechazadas.

### 2.4. Bug encontrado y corregido: desfase de fecha por zona horaria

Al probar la inserción real se detectó que `fecha_enrolamiento` quedaba guardada un día antes del
valor del Excel (ej. `2026-09-01` se guardaba como `2026-08-31`). Causa: el mapeo pasaba la fecha
por un objeto `Date` de JavaScript antes de insertarla; `new Date("2026-09-01")` se interpreta en
UTC, y al serializarse en una zona horaria detrás de UTC (Chile, `America/Santiago`) se corre un
día para atrás. Se corrigió pasando la fecha como string `"YYYY-MM-DD"` directamente a PostgreSQL,
sin pasar por `Date` — evita la conversión de zona horaria por completo.

### 2.5. Verificación

Se generó un Excel de prueba (`fixtures/enrolamiento_etl_prueba.xlsx`) con tres filas: una válida,
una con un error de tipeo corregible ("SINCRONIZDO" en vez de "SINCRONIZADO") y una con un valor
irrecuperable ("MARCIANO" como nacionalidad). Con `npm run etl`:

- Se insertaron 2 filas en `registro_enrolamiento` (confirmado con `SELECT` directo).
- Se registró 1 corrección automática, correctamente detallada.
- Se rechazó 1 fila, con el mismo formato de error de Sprint 2.
- La fecha quedó guardada correctamente como `2026-09-01` tras el fix.

Se confirmó además que `npm run ingest` (Sprint 2) sigue funcionando igual que antes — no inserta
nada, mismo comportamiento de mapeo y errores.

#### Cómo reproducir esta verificación

Con la base de datos arriba (ver [Solución de problemas comunes](../../README.md#solución-de-problemas-comunes)
en el README si no lo está), desde la raíz del proyecto:

**1. Correr el ETL completo contra el Excel de prueba:**

```powershell
npm run etl -- fixtures/enrolamiento_etl_prueba.xlsx
```

Salida esperada:

```
Filas insertadas: 2
Correcciones automaticas aplicadas (1):
  - Estado de sincronizacion: "SINCRONIZDO" interpretado como "SINCRONIZADO"
Filas rechazadas (1):
[
  {
    "excelRow": 4,
    "errors": [
      "Nacionalidad desconocida: \"MARCIANO\""
    ]
  }
]
```

*Por qué*: el fixture tiene 3 filas armadas a propósito para ejercitar los 3 comportamientos del
ETL. La fila 1 (Venezuela, bien escrita) se mapea sin problema. La fila 2 (Chile, con
"SINCRONIZDO") no tiene coincidencia exacta en el catálogo de estados, pero `catalogResolver.js`
calcula la distancia de edición contra todos los valores posibles y encuentra que "SINCRONIZADO"
está a distancia 1 (falta una letra) — dentro del umbral de 2, así que la corrige sola y queda
anotada en `correcciones`. La fila 3 ("MARCIANO") está a una distancia enorme de cualquier
nacionalidad real, muy por encima del umbral, así que no se corrige y se reporta como error
irrecuperable. Resultado: 2 filas insertadas de verdad por `bulkInsert.js`, 1 afuera.

**2. Confirmar que la inserción fue real, no solo un mensaje en consola:**

```powershell
$env:PGPASSWORD = "abis_dev_pw"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "SELECT id_registro, fecha_enrolamiento, id_nacionalidad, genero FROM registro_enrolamiento ORDER BY id_registro;"
```

Salida esperada:

```
 id_registro | fecha_enrolamiento | id_nacionalidad | genero
-------------+--------------------+-----------------+--------
           1 | 2026-09-01         |               2 | M
           2 | 2026-09-01         |               1 | F
(2 rows)
```

*Por qué*: confirma dos cosas — que los datos están realmente en la tabla (no solo en el log del
script), y que `fecha_enrolamiento` quedó en `2026-09-01`, el valor correcto. Antes del fix
descrito en 2.4, esta misma prueba mostraba `2026-08-31` (un día antes) por la conversión de zona
horaria.

**3. Limpiar antes de repetir la prueba** (el fixture no es idempotente — correrlo de nuevo sin
limpiar sumaría otras 2 filas duplicadas):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

**4. Confirmar que el modo de solo lectura de Sprint 2 sigue sin tocar la base:**

```powershell
npm run ingest -- fixtures/enrolamiento_ejemplo.xlsx
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "SELECT count(*) FROM registro_enrolamiento;"
```

Salida esperada: el mismo resultado de mapeo (`Filas mapeadas correctamente: 2`, `Filas con
errores: 1`) pero el conteo final da `0`. *Por qué*: `npm run ingest` corre la misma lectura →
validación → mapeo que el ETL, pero nunca llama a `bulkInsert.js` — se queda en la etapa de
previsualización. Esto confirma que la separación entre "solo previsualizar" (`ingest`) e
"insertar de verdad" (`etl`) funciona como está documentada, sin efectos secundarios ocultos.

## 3. Estado del entregable

**Completo.** Los tres puntos comprometidos están implementados y verificados, con las
salvedades de alcance documentadas en 2.1 (jerarquía región/unidad/cuartel) y 2.2 (límite de
parámetros para cargas grandes).

## 4. Próximos pasos (Sprint 4, 8–14 sep)

Según la hoja de ruta, el siguiente ciclo corresponde a **carga histórica y pruebas de estrés**:

- Procesamiento del acumulado anual (más de 95.000 registros) — requiere particionar
  `bulkInsertRegistros` en lotes, dado el límite de parámetros de PostgreSQL anotado en 2.2.
- Optimización de índices en base de datos para lectura rápida.
- Validación de integridad de los datos históricos.
