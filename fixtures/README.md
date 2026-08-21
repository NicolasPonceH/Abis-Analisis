# Fixtures

Archivos de ejemplo para probar el proyecto manualmente, sin depender de datos reales.

- `enrolamiento_ejemplo.xlsx` — Excel de prueba para el módulo de ingesta (`src/ingest/`), con
  cabeceras según `src/ingest/headerSchema.js`. Tres filas: dos válidas (coinciden con los
  catálogos de `db/seed_catalogos.sql`) y una con una nacionalidad inexistente a propósito, para
  verificar que el reporte de errores funciona. Probar con:

  ```bash
  npm run ingest -- fixtures/enrolamiento_ejemplo.xlsx
  ```

- `enrolamiento_etl_prueba.xlsx` — Excel de prueba para el ETL completo (`src/etl/`). Tres filas:
  una válida, una con un error de tipeo corregible ("SINCRONIZDO" en vez de "SINCRONIZADO") y una
  con un valor irrecuperable ("MARCIANO"). **Insertar este archivo escribe filas reales en
  `registro_enrolamiento`** — si lo corrés más de una vez, limpiá la tabla antes
  (`TRUNCATE registro_enrolamiento RESTART IDENTITY;`) para no acumular duplicados de prueba.
  Probar con:

  ```bash
  npm run etl -- fixtures/enrolamiento_etl_prueba.xlsx
  ```

- `enrolamiento_vacio.xlsx` — Excel con las cabeceras correctas pero **cero filas de datos**.
  Para probar el manejo de excepciones del flujo diario completo (`src/flujo/`, Sprint 7): debe
  disparar una alerta por Telegram en vez de fallar en silencio. Probar con:

  ```bash
  npm run flujo-diario -- fixtures/enrolamiento_vacio.xlsx
  ```
