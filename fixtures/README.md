# Fixtures

Archivos de ejemplo para probar el proyecto manualmente, sin depender de datos reales.

- `enrolamiento_ejemplo.xlsx` — Excel de prueba para el módulo de ingesta (`src/ingest/`), con
  cabeceras según `src/ingest/headerSchema.js`. Tres filas: dos válidas (coinciden con los
  catálogos de `db/seed_catalogos.sql`) y una con una nacionalidad inexistente a propósito, para
  verificar que el reporte de errores funciona. Probar con:

  ```bash
  npm run ingest -- fixtures/enrolamiento_ejemplo.xlsx
  ```
