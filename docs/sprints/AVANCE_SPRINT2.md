---
title: "Informe de Avance — Sprint 2"
subtitle: "Sistema de Gestión Automatizada de Identificación Biométrica (ABIS)"
---

**Proyecto:** Sistema ABIS
**Periodo del ciclo:** 25 de agosto de 2026 – 31 de agosto de 2026
**Fecha de presentación:** 20 de agosto de 2026

## 1. Objetivo del ciclo

Según la hoja de ruta del proyecto, el Sprint 2 tiene como objetivo el **módulo de conexión y
lectura de archivos**, con el siguiente entregable comprometido:

- Implementación de la librería de lectura de Excel (`xlsx`).
- Desarrollo del módulo de validación de estructura del Excel (cabeceras).
- Mapeo inicial de datos en memoria (texto a identificadores de catálogo).

## 2. Trabajo realizado

### 2.1. Dependencia de lectura de Excel

Se agregó la librería `xlsx` (SheetJS). La versión publicada en el registro de npm (0.18.5) tiene
una vulnerabilidad de severidad alta sin fix disponible ahí (SheetJS dejó de publicar actualizaciones
en npm); se instaló en su lugar la versión parcheada 0.20.3 directamente desde el CDN oficial del
proveedor (`https://cdn.sheetjs.com/`), que es el método de instalación que ellos mismos
recomiendan. `npm audit` queda en 0 vulnerabilidades.

### 2.2. Módulo de ingesta (`src/ingest/`)

| Archivo | Responsabilidad |
|---|---|
| `headerSchema.js` | Fuente de verdad de las cabeceras esperadas del Excel y su mapeo a campos internos |
| `excelReader.js` | Lee la primera hoja de un `.xlsx` y devuelve cabeceras + filas crudas |
| `headerValidator.js` | Compara las cabeceras leídas contra las esperadas (faltantes / no reconocidas) |
| `catalogMapper.js` | Carga los 6 catálogos en mapas de texto normalizado → ID, y mapea cada fila |
| `index.js` | Orquesta lectura → validación → mapeo; no inserta en la base de datos |

`scripts/ingest-excel.js` (`npm run ingest -- <archivo.xlsx>`) permite correr el módulo
manualmente y ver el resultado (filas mapeadas, filas con error) por consola.

**Importante:** las cabeceras esperadas en `headerSchema.js` están **inferidas** del informe de
requerimientos (sección 4.2) — todavía no se validaron contra un Excel real de producción. Es el
único archivo que hay que ajustar si los nombres de columna reales son distintos.

### 2.3. Resolución de jerarquía Región → Unidad → Cuartel

Como `cuartel.nombre_cuartel` no es único a nivel global en el esquema (solo `(nombre_cuartel,
id_unidad)` lo es), el mapeo resuelve `Unidad` dentro de `Region` y luego `Cuartel` dentro de esa
`Unidad`, en vez de buscar el nombre del cuartel directamente.

### 2.4. Verificación

Se generó un Excel de prueba con una fila válida (coincidente con los catálogos sembrados en
Sprint 1) y una fila con una nacionalidad inexistente a propósito. El módulo:

- Validó las cabeceras correctamente.
- Mapeó la fila válida a los IDs de catálogo reales (`id_nacionalidad`, `id_cuartel`, `id_equipo`,
  los tres `id_estado_*`).
- Reportó el error de la fila inválida (`Nacionalidad desconocida: "MARCIANO"`) junto con el
  número de fila del Excel donde ocurrió.

## 3. Estado del entregable

**Completo**, con una salvedad: el mapeo de cabeceras es una inferencia razonable del informe de
requerimientos, pendiente de confirmar contra un archivo Excel real de producción.

## 4. Próximos pasos (Sprint 3, 1–7 sep)

Según la hoja de ruta, el siguiente ciclo corresponde al **desarrollo del proceso de ingesta
(ETL)**:

- Lógica de transformación y limpieza de datos diarios.
- Resolución de inconsistencias (manejo de errores de tipeo en Excel).
- Inserción transaccional (bulk insert) en PostgreSQL de las filas que `catalogMapper.js` ya deja
  mapeadas en memoria.
