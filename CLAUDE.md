# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Sistema ABIS (Sistema de Gestión Automatizada de Identificación Biométrica): processes a daily
biometric enrollment Excel file, normalizes it into PostgreSQL, computes daily summary metrics,
and (eventually) notifies that summary via Telegram. The project follows a 10-week sprint roadmap
(18 Aug – 23 Oct 2026); through Sprint 5 (of 10) is implemented — Excel ingestion, typo-tolerant
catalog mapping, batched transactional inserts, and a daily-report endpoint all exist. Telegram
integration (Sprint 6+) does not exist yet.

## Commands

```bash
npm install
npm start                              # starts the Express server on http://localhost:3000
npm run db:schema                      # applies db/schema.sql against DATABASE_URL
npm run db:seed                        # loads db/seed_catalogos.sql against DATABASE_URL
npm run db:views                       # applies db/views.sql (reporting views) against DATABASE_URL
npm run ingest -- <file.xlsx>          # dry-run: read/validate/map an Excel, no DB writes
npm run etl -- <file.xlsx>             # full pipeline: maps + transactionally inserts
npm run carga-historica -- <N>         # stress test: N synthetic rows (default 95000), no Excel
npm run validar-integridad             # integrity checks + EXPLAIN ANALYZE on report-style queries
npm run datos-reporte-prueba           # fixed 10-row deterministic dataset for testing /reporte-diario
```

There is no test suite, linter, or build step configured yet.

`GET /health` confirms the server is up and the PostgreSQL connection works. `GET /reporte-diario
?fecha=YYYY-MM-DD` returns the daily report data (see Sprint 5 section below); without `?fecha=`
it uses the most recent date that has data.

`node scripts/run-sql.js <path-to-file.sql>` runs any arbitrary `.sql` file against
`DATABASE_URL` — this is the general mechanism for applying schema/data changes, not just the
`db:schema`/`db:seed`/`db:views` npm scripts above.

## Local environment

- This machine has a pre-existing PostgreSQL 18 instance on the default port 5432 (unrelated to
  this project), plus a **second, dedicated instance for ABIS on port 5433**, running from its own
  data directory at `C:\Users\Nicolás\pgdata-abis-5433` (created with the same PostgreSQL 18
  binaries via `initdb`).
- Unlike the original setup machine (where it ran as the Windows service
  `postgresql-x64-17-abis`), here it runs as a **manually-started process** — this account lacks
  admin rights to register a Windows service. It does not survive a reboot; start it with:
  `& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Users\Nicolás\pgdata-abis-5433" -l "C:\Users\Nicolás\pgdata-abis-5433\server.log" start`
  (stop with the same command plus `stop` instead of `start`). If `/health` reports
  `db: disconnected`, check this first.
- Database: `abis_db`, superuser `postgres` / `abis_dev_pw`. Credentials and `DATABASE_URL` live in
  `.env` (gitignored); see `.env.example` for the shape.

## Architecture

- `src/db.js` — single shared `pg` `Pool`, built from `DATABASE_URL`. Import this module rather
  than creating new pools.
- `src/server.js` — Express app entrypoint; wires up `/health` and `/reporte-diario`.
- `db/schema.sql` — DDL for the full normalized (3NF) schema, idempotent (`CREATE TABLE IF NOT
  EXISTS`). This is the source of truth for the data model, not an ORM/migration tool — there is
  no migration framework, so schema changes are made directly here and re-applied with `npm run
  db:schema`.
- `db/seed_catalogos.sql` — sample data for the catalog tables, sourced from the project's
  requirements document. Placeholder data only; must be replaced with the real institutional
  catalogs before production loads (planned for Sprint 3+).

### Data model

Six catalog (master) tables plus one transactional table:

- `nacionalidad`, `region`, `equipo` — flat catalogs.
- `unidad` → references `region`; `cuartel` → references `unidad` (region → unidad → cuartel is a
  strict hierarchy).
- `estado_proceso` — a single generic catalog table reused across three independent status
  domains, distinguished by its `tipo_estado` column: `SINCRONIZACION`, `REGISTRO`, `GENERAL`.
  Don't create separate status tables per domain — extend this one.
- `registro_enrolamiento` — the transactional table, one row per biometric enrollment record.
  Holds three independent foreign keys into `estado_proceso` (one per status domain above) plus
  FKs into `nacionalidad`, `cuartel`, and `equipo`. Indexed on `fecha_enrolamiento`, `id_cuartel`,
  `id_nacionalidad`, and (since Sprint 4) all three `id_estado_*` columns, to support the
  statistics/reporting queries in `db/views.sql`.

### Excel ingestion module (`src/ingest/`, Sprint 2)

- `headerSchema.js` is the single source of truth for expected Excel column headers and their
  mapping to internal field names — **inferred** from the requirements doc, not yet validated
  against a real production Excel file. Edit only this file if real headers differ.
- `excelReader.js` reads the first sheet into raw header+row data (no validation/transformation).
- `headerValidator.js` checks read headers against `headerSchema.js`.
- `catalogMapper.js` loads all 6 catalog tables into normalized text→ID lookup maps and maps each
  row. Because `cuartel.nombre_cuartel` is only unique per `(nombre_cuartel, id_unidad)` (not
  globally), it resolves `unidad` within `region` first, then `cuartel` within that `unidad`.
- `index.js`'s `processExcelFile(filePath, pool)` orchestrates read → validate → map. It does
  **not** insert into the database — that's Sprint 3's ETL/bulk-insert step, which will consume
  the mapped rows this module already produces.
- `scripts/ingest-excel.js` (`npm run ingest -- <file.xlsx>`) runs the module manually.
- The `xlsx` dependency is installed from SheetJS's own CDN
  (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), not the npm registry — the npm-published
  version is stuck at 0.18.5 with an unfixed high-severity advisory. Don't `npm install xlsx`
  plain; it'll silently reintroduce the vulnerable version.

### ETL module (`src/etl/`, Sprint 3)

- `fuzzyMatch.js` / `catalogResolver.js`: Levenshtein-based typo tolerance (max edit distance 2,
  only auto-corrects when the closest candidate is unique). `catalogMapper.js` (Sprint 2) uses
  this for `Nacionalidad`, `Equipo`, and the three `Estado` fields via `resolveField()`.
  `Region`/`Unidad`/`Cuartel` deliberately stay exact-match-only — fuzzy-correcting a 3-level
  hierarchy is ambiguous in a way a flat catalog isn't. Each mapped row carries a `correcciones`
  array documenting what got auto-corrected.
- `bulkInsert.js`: single transactional multi-row `INSERT` into `registro_enrolamiento`. Capped
  by Postgres's 65535-parameter limit (~6500 rows at 10 columns/row) — fine for a daily file, but
  Sprint 4's historical load (95k+ rows) will need batching; don't call it with the full backlog
  at once.
- `index.js`'s `runEtl(filePath, pool)` chains `processExcelFile` (Sprint 2) with
  `bulkInsertRegistros`. Rows with mapping errors don't block the rest of the batch — valid rows
  still get inserted, invalid ones are reported separately.
- `scripts/procesar-excel.js` (`npm run etl -- <file.xlsx>`) runs the full pipeline and inserts.
  `npm run ingest` (Sprint 2) still exists as a dry-run/preview mode that never writes to the DB.
- **Date handling gotcha**: `fecha_enrolamiento` must stay a plain `"YYYY-MM-DD"` string through
  the mapping/insert path, never a JS `Date` object — constructing `new Date("YYYY-MM-DD")` parses
  as UTC, and this machine's timezone (Chile, behind UTC) shifts it back a day on serialization.
  This bit us once already; don't reintroduce a `Date` object in that field.

### Historical load & indexing (Sprint 4)

- `bulkInsertRegistros(pool, rows)` in `src/etl/bulkInsert.js` now batches internally
  (`BATCH_SIZE = 5000`, staying under Postgres's 65535-param limit) but keeps a single
  transaction across all batches — a failure partway through still rolls back everything, not
  just the failed batch. Signature is unchanged from Sprint 3, so `src/etl/index.js`'s daily ETL
  flow required no changes.
- `db/schema.sql` gained indexes on `id_estado_sincronizacion`, `id_estado_registro`, and
  `id_estado_general` (joining the Sprint 1 indexes on `fecha_enrolamiento`, `id_cuartel`,
  `id_nacionalidad`) — these back the status-breakdown groupings the daily Telegram report needs.
- `scripts/carga-historica-sintetica.js` (`npm run carga-historica -- <N>`, default 95000)
  generates synthetic rows directly against the already-seeded catalogs — bypasses Excel entirely,
  since Sprint 4 is testing bulk-insert/index performance, not re-exercising Sprint 2/3's parsing.
  **Not idempotent** — running it writes real rows; `TRUNCATE registro_enrolamiento RESTART
  IDENTITY;` afterward to keep the dev DB clean, same convention as the other test fixtures.
- `scripts/validar-integridad-historica.js` (`npm run validar-integridad`) checks for unexpected
  NULLs, `es_mayor_edad`/`edad_exacta` logical inconsistencies (nothing in the schema itself
  prevents that combination — it's a business rule, not a constraint), and runs `EXPLAIN ANALYZE`
  on representative dashboard-style queries to confirm the new indexes are actually used (not
  just present) — verified with a 95k-row synthetic load: `Index Only Scan`/`Bitmap Index Scan`
  in the plans, 95000 rows inserted in 19 batches in ~2.6s.

### Reporting views & daily report (Sprint 5)

- `db/views.sql` (`npm run db:views`, `CREATE OR REPLACE VIEW` — idempotent) defines 4 views:
  `vw_resumen_estado_diario` (a `UNION ALL` across all three `estado_proceso` FKs, one row per
  date/domain/description — this is how the schema's "one generic catalog, three independent FK
  columns" design gets flattened for reporting), `vw_resumen_nacionalidad_diario`,
  `vw_resumen_cuartel_diario`, and `vw_total_diario`.
- `src/reportes/reporteDiario.js`'s `obtenerReporteDiario(pool, fecha)` queries those views and
  returns structured JSON with pre-computed percentages (rounded to 1 decimal) — sync/registro/
  general breakdowns, top-5 nationalities, active cuarteles. It does **not** produce the
  Telegram-formatted Markdown message described in the requirements doc section 5 — that's
  Sprint 6-7's job, consuming this function rather than re-querying.
- `GET /reporte-diario` in `src/server.js` exposes it: `?fecha=YYYY-MM-DD` for a specific date
  (400 if malformed), no param defaults to the most recent date with data, a valid date with no
  rows returns `200` with empty breakdowns and `total: 0` (not an error).
- `scripts/generar-datos-reporte-prueba.js` (`npm run datos-reporte-prueba`) inserts a **fixed,
  non-random** 10-row dataset on `2026-09-15` with round percentages (70/20/10, 80/20, 90/10,
  40/30/20/10, 40/30/30) — deliberately deterministic, unlike Sprint 4's synthetic generator, so
  the report output can be checked against exact expected numbers rather than "looks about
  right." Not idempotent; truncate after use like the other test data scripts.

## Roadmap context

Full 10-sprint plan (dates, deliverables, critical milestones) is in
[`docs/diagramas/roadmap.md`](docs/diagramas/roadmap.md); the original requirements doc is in
[`docs/informe-requerimientos.md`](docs/informe-requerimientos.md); a copy of the source PDF is at
`sistema_abis.pdf` on the Desktop (outside the repo). Sprint 6 (22–28 Sep 2026) is next: creating
the Telegram bot via BotFather, an HTTP client for the Telegram API, and the Markdown message
template — which should format `obtenerReporteDiario()`'s output, not reimplement its queries.

## Documentation & versioning

- `docs/` holds project documentation as Markdown: `docs/diagramas/` (ER diagram, architecture
  diagram, sprint roadmap — all Mermaid, GitHub-rendered, manually kept in sync with the code —
  see the "Cómo mantenerlo actualizado" note at the end of each file) and `docs/sprints/` (one
  `AVANCE_SPRINT{N}.md` progress report per closed sprint, following the format of
  `docs/sprints/AVANCE_SPRINT1.md`).
- Each closed sprint is tagged in git as `v0.N.0` (Sprint 1 → `v0.1.0`, ..., Sprint 10 →
  `v1.0.0`), pushed with `git push origin main --tags`. When a sprint's deliverable is complete,
  update the relevant `docs/diagramas/*.md` files, write the sprint's `AVANCE_SPRINT{N}.md`, then
  commit and tag — don't leave documentation for a closed sprint until a later session.
- Repository: https://github.com/NicolasPonceH/Sistema_ABIS
