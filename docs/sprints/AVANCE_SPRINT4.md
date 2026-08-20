---
title: "Informe de Avance — Sprint 4"
subtitle: "Sistema de Gestión Automatizada de Identificación Biométrica (ABIS)"
---

**Proyecto:** Sistema ABIS
**Periodo del ciclo:** 8 de septiembre de 2026 – 14 de septiembre de 2026
**Fecha de presentación:** 20 de agosto de 2026

## 1. Objetivo del ciclo

Según la hoja de ruta del proyecto, el Sprint 4 tiene como objetivo **carga histórica y pruebas
de estrés**, con el siguiente entregable comprometido:

- Procesamiento del acumulado anual (más de 95.000 registros).
- Optimización de índices en base de datos para lectura rápida.
- Validación de integridad de los datos históricos.

## 2. Trabajo realizado

### 2.1. Carga por lotes (`src/etl/bulkInsert.js`)

Hasta Sprint 3, `bulkInsertRegistros` armaba un único `INSERT ... VALUES (...), (...)` con todas
las filas de una vez — funcional para un Excel diario, pero PostgreSQL limita una consulta a
65.535 parámetros (~6.553 filas con las 10 columnas de `registro_enrolamiento`), muy por debajo
de los 95.000+ registros del acumulado histórico.

Se modificó para particionar en lotes de 5.000 filas (`BATCH_SIZE`), manteniendo **una sola
transacción** para todos los lotes: si un lote falla a mitad de una carga grande, se hace
`ROLLBACK` de todo lo insertado hasta ese momento, no solo del lote que falló. La firma de
`bulkInsertRegistros(pool, rows)` no cambió, así que Sprint 3 (`src/etl/index.js`, el ETL diario)
sigue funcionando sin modificaciones — un archivo diario de pocas filas simplemente termina en un
solo lote.

### 2.2. Índices nuevos (`db/schema.sql`)

Se agregaron índices sobre los tres campos de estado (`id_estado_sincronizacion`,
`id_estado_registro`, `id_estado_general`), que ya tenían los de `fecha_enrolamiento`, `id_cuartel`
e `id_nacionalidad` desde Sprint 1. Justificación: el informe de requerimientos describe el reporte
diario como agrupaciones por estos tres estados ("Sincronizados/Pendientes/Error",
"Registrados/Pendientes", estado general) — sin índice, cada agrupación implica un recorrido
completo de la tabla histórica.

### 2.3. Prueba de estrés con datos sintéticos

`scripts/carga-historica-sintetica.js` genera filas **sintéticas** (no reales) directamente contra
los catálogos ya sembrados — sin pasar por lectura de Excel, para aislar la prueba a la inserción
masiva y el uso de índices (la lectura/mapeo de Excel ya la cubren Sprint 2 y 3). Genera fechas
distribuidas en el último año, nacionalidad/cuartel/equipo/estados aleatorios entre los valores
reales del catálogo, y una proporción ~8% de menores de edad.

**Resultado**: 95.000 filas insertadas en 19 lotes en **2.6 segundos**.

### 2.4. Validación de integridad (`scripts/validar-integridad-historica.js`)

Corre después de la carga:

- Conteo total y rango de fechas.
- Filas con FK o campos obligatorios en `NULL` (debería ser 0 — ya lo garantizan las constraints
  `NOT NULL`/`REFERENCES`, pero se confirma explícitamente).
- Filas con `es_mayor_edad`/`edad_exacta` lógicamente inconsistentes (nada en el esquema impide
  que un registro tenga `es_mayor_edad = true` y además una `edad_exacta` cargada, o viceversa —
  es una regla de negocio, no una constraint de base de datos).
- Distribución por nacionalidad, para detectar sesgos obvios en la carga.
- `EXPLAIN ANALYZE` de dos consultas representativas del futuro dashboard, para confirmar que los
  índices nuevos realmente se usan (no solo que existen).

**Resultado sobre los 95.000 registros sintéticos**: 0 filas con NULL inesperado, 0 inconsistencias
de edad, distribución pareja entre las 7 nacionalidades (~13.4k-13.8k cada una, sin sesgo). Ambas
consultas usaron `Index Only Scan`/`Bitmap Index Scan` sobre los índices nuevos y respondieron en
0.2ms y 6.3ms respectivamente — ver el detalle completo en la sección de verificación más abajo.

## 3. Estado del entregable

**Completo.** Los tres puntos comprometidos están implementados y verificados con una carga
sintética del volumen objetivo (95.000+ registros).

**Nota**: los 95.000 registros son sintéticos, generados para la prueba de estrés — no hay
todavía un acumulado histórico real que cargar (eso depende de que el informe original tenga uno
disponible). El pipeline queda probado y listo para cuando exista ese archivo real.

## 4. Cómo reproducir esta verificación

Con la base de datos arriba (ver
[Solución de problemas comunes](../../README.md#solución-de-problemas-comunes) si no lo está),
desde la raíz del proyecto:

**1. Aplicar los índices nuevos** (si vas a partir de un `db:schema` anterior a este sprint):

```powershell
npm run db:schema
```

*Por qué*: `db/schema.sql` es idempotente (`CREATE INDEX IF NOT EXISTS`), así que correrlo de
nuevo no rompe nada si ya lo habías aplicado — solo agrega los tres índices de estado si faltan.

**2. Confirmar que la tabla está vacía antes de la prueba:**

```powershell
$env:PGPASSWORD = "abis_dev_pw"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "SELECT count(*) FROM registro_enrolamiento;"
```

**3. Correr la carga histórica sintética (95.000 filas por defecto):**

```powershell
npm run carga-historica -- 95000
```

Salida esperada (el tiempo puede variar según la máquina):

```
Generando 95000 filas sinteticas...
Insertando (por lotes)...
  lote 1: 5000/95000 filas  lote 2: 10000/95000 filas  ...  lote 19: 95000/95000 filas
Insertadas 95000 filas en 19 lotes, en 2.6s.
```

*Por qué*: confirma que `bulkInsertRegistros` divide correctamente en 19 lotes de 5.000
(95.000 ÷ 5.000 = 19 exacto) y que la carga completa termina en pocos segundos, no minutos —
señal de que los índices no están penalizando demasiado la escritura.

**4. Validar integridad y ver los planes de consulta:**

```powershell
npm run validar-integridad
```

Salida esperada (resumen — la salida completa de `EXPLAIN ANALYZE` es más larga):

```
Total de registros: 95000
Rango de fechas: 2025-08-21 a 2026-08-20
Filas con FK/campos obligatorios en NULL: 0 (deberia ser 0)
Filas con es_mayor_edad/edad_exacta inconsistentes: 0 (deberia ser 0)

┌─────────┬─────────────┬─────────┐
│ (index) │ descripcion │ total   │
├─────────┼─────────────┼─────────┤
│ 0       │ 'PERU'      │ '13785' │
...
└─────────┴─────────────┴─────────┘

--- Resumen de estado general por fecha (patron del reporte diario) ---
...
  ->  Index Only Scan Backward using idx_registro_fecha_enrolamiento ...
...
Execution Time: 0.2 ms

--- Conteo por estado de sincronizacion (todo el historico) ---
...
  ->  Index Only Scan using idx_registro_estado_sincronizacion on registro_enrolamiento ...
Execution Time: 6.3 ms
```

*Por qué*: los dos ceros confirman integridad de datos. La distribución pareja entre
nacionalidades confirma que el generador sintético no tiene sesgos que invaliden la prueba. Y lo
más importante: los planes de `EXPLAIN ANALYZE` deben mostrar **`Index Only Scan`** o
**`Bitmap Index Scan`** usando `idx_registro_fecha_enrolamiento` e
`idx_registro_estado_sincronizacion` — si en cambio aparece **`Seq Scan`** (recorrido secuencial
de toda la tabla), algo está mal con los índices (no se aplicaron, o Postgres decidió no usarlos).

**5. Limpiar los datos sintéticos** (no son datos reales, no deben quedar en la base):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

## 5. Próximos pasos (Sprint 5, 15–21 sep)

Según la hoja de ruta, el siguiente ciclo corresponde a **cálculo de métricas y agrupaciones**:

- Consultas SQL para resúmenes (sincronizado, errores, estados) — ya se probó que los índices
  necesarios para esto existen y se usan (ver 2.4).
- Creación de vistas (views) en la base para facilitar los reportes.
- Endpoints o funciones internas que generen la data del reporte diario descrito en la sección 5
  del [informe de requerimientos](../informe-requerimientos.md).
