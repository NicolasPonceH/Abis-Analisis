# Diagrama de arquitectura — Sistema ABIS

Vista de componentes: lo ya implementado (Sprint 1) versus lo planificado por el roadmap. Se
actualiza a medida que cada pieza planificada pasa a estar implementada.

```mermaid
flowchart LR
    subgraph impl["Implementado (Sprint 1-5)"]
        direction LR
        API["Express server<br/>src/server.js<br/>GET /health<br/>GET /reporte-diario"]
        POOL["Pool pg<br/>src/db.js"]
        DB[("PostgreSQL<br/>abis_db<br/>indices en fecha/cuartel/<br/>nacionalidad/3 estados")]
        VIEWS[("Vistas de resumen<br/>db/views.sql")]
        REPORTE["reporteDiario.js<br/>(consulta vistas, calcula %)"]
        RUNSQL["scripts/run-sql.js<br/>(aplica .sql sueltos)"]
        EXCEL[/"Excel diario de<br/>enrolamiento"/]
        READER["excelReader.js<br/>(lee xlsx a filas crudas)"]
        VALID["headerValidator.js<br/>(valida cabeceras)"]
        MAP["catalogMapper.js<br/>(texto -> ID, con correccion<br/>de tipeos menores)"]
        BULKINSERT["bulkInsert.js<br/>(insercion transaccional<br/>por lotes de 5000)"]
        CLI["scripts/ingest-excel.js<br/>(npm run ingest, solo lectura)"]
        CLIETL["scripts/procesar-excel.js<br/>(npm run etl, inserta)"]
        SINTETICO["scripts/carga-historica-sintetica.js<br/>(npm run carga-historica)"]
        INTEGRIDAD["scripts/validar-integridad-historica.js<br/>(npm run validar-integridad)"]

        API --> POOL --> DB
        DB --- VIEWS
        API --> REPORTE --> VIEWS
        RUNSQL --> DB
        EXCEL --> READER --> VALID --> MAP
        MAP --> BULKINSERT --> POOL
        CLI --> READER
        CLIETL --> READER
        SINTETICO --> BULKINSERT
        INTEGRIDAD --> POOL
    end

    subgraph plan["Planificado (Sprint 6+)"]
        direction LR
        TG(["Bot de Telegram<br/>(formatea la data de<br/>reporteDiario.js)"])
    end

    REPORTE -.-> TG

    classDef planned stroke-dasharray: 4 3
    class TG planned
```

## Lectura del diagrama

- **Implementado**: el servidor Express expone `GET /health` y `GET /reporte-diario`, que usa el
  pool compartido de `src/db.js` para verificar la conexión a PostgreSQL y para consultar las
  vistas de resumen, respectivamente. `scripts/run-sql.js` es el mecanismo genérico para aplicar
  cualquier `.sql` (schema, seed o vistas) contra la misma base. El módulo de ingesta
  (`src/ingest/`) lee un Excel, valida sus cabeceras y mapea cada fila de texto libre a los IDs de
  catálogo correspondientes, tolerando errores de tipeo menores (`src/etl/`). El módulo ETL
  (`src/etl/index.js`) encadena ese mapeo con la inserción transaccional por lotes
  (`bulkInsert.js`) en `registro_enrolamiento`. `npm run ingest` corre solo la lectura/mapeo (no
  inserta, útil para previsualizar); `npm run etl` corre el flujo completo e inserta.
  `scripts/carga-historica-sintetica.js` y `scripts/validar-integridad-historica.js` (Sprint 4)
  son herramientas de prueba de estrés e integridad, no parte del flujo diario de producción.
  `src/reportes/reporteDiario.js` (Sprint 5) consulta las vistas de `db/views.sql` y arma el JSON
  del reporte diario con conteos y porcentajes ya calculados.
- **Planificado** (líneas punteadas): Sprint 6-7 va a tomar la data que ya arma
  `reporteDiario.js` y formatearla como el mensaje de Telegram (ver [roadmap.md](roadmap.md)) —
  no va a reimplementar las consultas, solo el formateo y el envío.

## Notas sobre el módulo de ingesta y ETL

- Las cabeceras esperadas del Excel (`src/ingest/headerSchema.js`) son **inferidas** del informe
  de requerimientos — no se validaron todavía contra un archivo Excel real. Es el único archivo a
  editar si los nombres de columna reales difieren.
- `catalogMapper.js` resuelve `Cuartel` dentro de `Unidad` dentro de `Region`, porque
  `nombre_cuartel` no es único a nivel global en el esquema (solo `(nombre_cuartel, id_unidad)`
  lo es) — ver [er-diagrama.md](er-diagrama.md).
- **Corrección de tipeos (Sprint 3)**: `src/etl/catalogResolver.js` tolera errores de tipeo menores
  (distancia de edición ≤ 2) en `Nacionalidad`, `Equipo` y los tres campos de `Estado`, dejando
  rastro de cada corrección aplicada. `Region`/`Unidad`/`Cuartel` exigen coincidencia exacta a
  propósito — al ser una jerarquía de 3 niveles, una corrección automática ambigua ahí es más
  riesgosa que en un catálogo plano.
- `bulkInsert.js` inserta todas las filas válidas de un archivo en una única transacción; las
  filas con errores no bloquean al resto del lote (se reportan aparte, no tumban la carga diaria).
- **Carga por lotes (Sprint 4)**: `bulkInsert.js` particiona internamente en lotes de 5.000 filas
  (límite de PostgreSQL: 65.535 parámetros por consulta), pero todos los lotes de una misma
  llamada comparten una única transacción — probado con 95.000 filas sintéticas insertadas en
  19 lotes en ~2.6s, ver [`AVANCE_SPRINT4.md`](../sprints/AVANCE_SPRINT4.md).
- **Vistas y reporte diario (Sprint 5)**: `db/views.sql` tiene 7 vistas (`vw_resumen_estado_diario`,
  `vw_resumen_nacionalidad_diario`, `vw_resumen_cuartel_diario`, `vw_resumen_unidad_diario`,
  `vw_resumen_genero_diario`, `vw_resumen_edad_diario`, `vw_total_diario`), todas
  `CREATE OR REPLACE VIEW` (idempotentes, se aplican con `npm run db:views`). Las tres de
  unidad/género/edad se sumaron después del cierre inicial, al auditar el proyecto contra la
  sección 2 del informe de requerimientos ("resúmenes por Unidad, Cuartel, Nacionalidad, Edad y
  Género") — ver el addendum en
  [`AVANCE_SPRINT5.md`](../sprints/AVANCE_SPRINT5.md#5-addendum-resúmenes-por-unidad-edad-y-género).
  `reporteDiario.js` las consulta y devuelve JSON con porcentajes ya calculados — no el mensaje de
  Telegram formateado, eso queda para Sprint 6-7. `GET /reporte-diario?fecha=YYYY-MM-DD` lo expone
  vía HTTP; sin `fecha`, usa la más reciente con datos.

## Cómo mantenerlo actualizado

Cuando un componente del subgrafo "Planificado" se implemente:

1. Moverlo al subgrafo `impl` y quitarle la clase `planned` (para que deje de verse punteado).
2. Ajustar las flechas sólidas/punteadas según las nuevas dependencias reales.
3. Actualizar la sección "Lectura del diagrama" con una frase breve sobre qué hace el componente.
