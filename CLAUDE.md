# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Sistema ABIS (Sistema de Gestión Automatizada de Identificación Biométrica): processes a daily
biometric enrollment Excel file, normalizes it into PostgreSQL, computes daily summary metrics,
and notifies that summary via Telegram. The project followed a 10-week sprint roadmap (18 Aug –
23 Oct 2026) and is **functionally complete as of Sprint 10 (`v1.0.0`)** — every piece (ingestion,
typo-tolerant mapping, batched inserts, reporting views/endpoint, Telegram bot, the automated
daily flow, QA fixes, DB hardening) is implemented and verified with real test runs. **There was
no real production deployment** — no separate server, no real daily-Excel source, no production
Telegram bot/catalogs exist; see `docs/PLAN_DESPLIEGUE.md` for what's still needed and
`docs/sprints/AVANCE_SPRINT10.md` for the honest final-state writeup. Treat this repo as
feature-complete but not yet live.

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
  `powershell -File "C:\Users\Nicolás\pgdata-abis-5433\ensure-running.ps1"`. Stop with
  `& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Users\Nicolás\pgdata-abis-5433" stop`.
  If `/health` reports `db: disconnected`, check this first.
- **Never start it with `pg_ctl start` directly** — on Windows that leaves `postgres.exe` attached
  to the launching console, and when that console/terminal window closes, Windows kills the
  process with `STATUS_CONTROL_C_EXIT` (`0xC000013A` in `server.log`) instead of a clean shutdown.
  This was the actual cause of repeated "random" crashes during Sprint 1-5 development.
  `ensure-running.ps1` launches `postgres.exe` via `Invoke-CimMethod -ClassName Win32_Process
  -MethodName Create` instead, fully detached from any console, so it survives the terminal
  closing. `pg_ctl stop` is fine to use directly — it just signals the running process and exits.
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

- `db/views.sql` (`npm run db:views`, `CREATE OR REPLACE VIEW` — idempotent) defines 7 views:
  `vw_resumen_estado_diario` (a `UNION ALL` across all three `estado_proceso` FKs, one row per
  date/domain/description — this is how the schema's "one generic catalog, three independent FK
  columns" design gets flattened for reporting), `vw_resumen_nacionalidad_diario`,
  `vw_resumen_cuartel_diario`, `vw_resumen_unidad_diario`, `vw_resumen_genero_diario`,
  `vw_resumen_edad_diario` (mayor/menor via `es_mayor_edad`, not exact age — the requirements doc
  says `edad_exacta` is specifically for the 0-17 minor breakdown, not for exposing adults' exact
  ages in a report), and `vw_total_diario`.
- The unidad/genero/edad views were added **after** Sprint 5's initial close, discovered during a
  full-project audit against the requirements doc: section 2 ("Generación de Reportes Diarios")
  explicitly asks for summaries "por Unidad, Cuartel, Nacionalidad, Edad y Género" — the initial
  close only covered Cuartel and Nacionalidad. This fix landed as a plain commit on `main`, not a
  new tag — it's a correction to Sprint 5, not a new sprint. See the addendum in
  `docs/sprints/AVANCE_SPRINT5.md`.
- `src/reportes/reporteDiario.js`'s `obtenerReporteDiario(pool, fecha)` queries those views and
  returns structured JSON with pre-computed percentages (rounded to 1 decimal): sync/registro/
  general breakdowns, top-5 nationalities, active cuarteles, active unidades, genero, and edad.
  It does **not** produce the Telegram-formatted Markdown message described in the requirements
  doc section 5 — that's Sprint 6-7's job, consuming this function rather than re-querying.
- `GET /reporte-diario` in `src/server.js` exposes it: `?fecha=YYYY-MM-DD` for a specific date
  (400 if malformed), no param defaults to the most recent date with data, a valid date with no
  rows returns `200` with empty breakdowns and `total: 0` (not an error).
- **PowerShell gotcha when checking this endpoint**: `curl` in PowerShell is an alias for
  `Invoke-WebRequest`, whose default console output truncates the `Content` field — the JSON
  looks cut off even though the actual response is complete. Use
  `(Invoke-WebRequest "...").Content | ConvertFrom-Json | ConvertTo-Json -Depth 10` (or the real
  `curl.exe`, not the alias) to see the full body when verifying this endpoint.
- `scripts/generar-datos-reporte-prueba.js` (`npm run datos-reporte-prueba`) inserts a **fixed,
  non-random** 10-row dataset on `2026-09-15` with round percentages (70/20/10, 80/20, 90/10,
  40/30/20/10, 40/30/30) — deliberately deterministic, unlike Sprint 4's synthetic generator, so
  the report output can be checked against exact expected numbers rather than "looks about
  right." Not idempotent; truncate after use like the other test data scripts.

### Telegram bot (`src/telegram/`, Sprint 6)

- Bot `@AbisSystemBot` created via BotFather; `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` live in
  `.env` (never committed). To get a chat ID for a new bot/chat: message the bot `/start`, then
  `GET https://api.telegram.org/bot<TOKEN>/getUpdates` and read `result[].message.chat.id`.
- `telegramClient.js`'s `enviarMensaje({ token, chatId, texto })` wraps Telegram's `sendMessage`
  using Node 18's native `fetch` — no new dependency. Throws if Telegram responds `ok: false`.
- `formatearReporte.js` turns `obtenerReporteDiario()`'s JSON (Sprint 5) into the Telegram message,
  using `parse_mode: "HTML"` (not the classic `Markdown` mode originally used — redesigned
  27/08/2026 to a boxed layout with monospace `<code>` tables). It does **not** hardcode status
  labels like "Sincronizados" — `estado_proceso` descriptions are catalog-driven and still
  placeholder data, so `formatearEstadoProcesos()` renders every state that actually exists per
  domain (sincronización/registro/general), title-cased from the real `descripcion`, with an emoji
  picked by regex pattern (`ERROR`→❌, `PENDIENTE`→⏳, `MENOR`→⚠️, else→✅), column-aligned by padding
  to the widest label/total/percentage actually present that day.
- **HTML-escaping gotcha**: Telegram's `HTML` parse mode only reserves `&`, `<`, `>` — far fewer
  special characters than classic `Markdown` (which needed escaping `_*\`[]`). Any value that comes
  from data (not a literal we wrote) must still go through `escaparHtml()` before being
  interpolated, e.g. inside the `<code>` blocks — confirmed necessary with a real send.
- `scripts/enviar-reporte-telegram.js` (`npm run telegram:enviar -- <YYYY-MM-DD>`) is the manual
  trigger: builds the report, prints the plain-text message to console first (so a formatting bug
  is visible before spending a real Telegram send), then sends it. Sprint 7 will wire this into an
  automatic scheduler rather than requiring a manual run.

### Automated daily flow (`src/flujo/`, Sprint 7)

- `flujoDiario.js`'s `ejecutarFlujoDiario(filePath, pool)` is the single entry point that chains
  everything: `runEtl` (Sprint 3) → `obtenerReporteDiario` (Sprint 5) → `formatearReporte` +
  `enviarMensaje` (Sprint 6). `scripts/flujo-diario.js` (`npm run flujo-diario -- <file.xlsx>`) is
  the CLI wrapper — this is the command a scheduled trigger should call, not `npm run etl` +
  `npm run telegram:enviar` chained separately.
- **Never fails silently**: a corrupt/unreadable file, invalid headers, or zero successfully-
  mapped rows each send a Telegram alert (`formatearAlerta()` in `src/telegram/formatearReporte.js`)
  before returning/throwing, instead of just logging to a console nobody's watching. A partial
  success (some rows rejected) still sends the normal report, with an appended warning line.
- If the Excel has rows spanning more than one `fecha_enrolamiento` (shouldn't happen for a real
  daily file, but not validated against), the report is generated for the **most recent** date
  among the inserted rows, not all of them.
- **Two scheduled tasks run the daily chain** (since Aug 24-25, 2026), user-level:
  `ABIS-FuenteDiaria` (07:30) → `scripts/tarea-fuente.ps1`: ensures PostgreSQL is up
  (`ensure-running.ps1` + wait on `pg_isready`, max ~60 s), generates today's rows into the
  simulated source DB `abis_fuente` and exports `Documents\ABIS_excel_diario\enrolamiento_<date>.xlsx`
  (log: `logs/fuente-diario.log`). Then `ABIS-FlujoDiario` (08:00) → `scripts/tarea-diaria.ps1`
  picks the NEWEST matching xlsx from that folder and runs the flow (log:
  `logs/flujo-diario.log`). Both redirect node output via `cmd.exe /c "... >> log"` (NOT
  PowerShell's `>>`, which writes UTF-16 and garbles the log). The whole simulation is documented
  in `docs/PruebDataBase_FAKE.md`; when a real daily-drop folder exists, point tarea-diaria at it
  and unregister ABIS-FuenteDiaria. Re-registering over an existing task fails with "ya existe";
  unregister first (`Unregister-ScheduledTask -Confirm:$false`).
  Gotcha fixed on Aug 25: node-pg parses DATE columns as JS Date objects — always select them as
  `::text` or the mapper rejects every row with "Fecha de enrolamiento invalida".

### QA fixes (Sprint 8)

- `src/telegram/formatearReporte.js`'s `formatearLista()` now caps each list at `MAX_ITEMS_LISTA`
  (8) items, appending "y N más" — the example seed catalog only has 3 cuarteles, so this never
  triggered before, but a real institutional catalog with dozens of cuarteles/unidades could
  otherwise blow past Telegram's 4096-character message limit.
- `telegramClient.js`'s `enviarMensaje()` now truncates `texto` if it exceeds 4096 chars before
  sending, as a last-resort safety net (belt-and-suspenders alongside the list cap above).
- **Real bug fixed in `flujoDiario.js`**: the alert-sending calls (`notificar()`, inside the
  `catch`/error branches) were unguarded — if Telegram itself failed while trying to report an
  error (bad token, network down), that secondary failure replaced the original error, hiding the
  real cause. Fixed with `notificarSinFallar()`, which logs a Telegram failure to console but
  always lets the original error/result propagate. `ejecutarFlujoDiario`'s returned `notificado`
  field now has `_sin_notificar`-suffixed variants (e.g. `"reporte_sin_notificar"`) when the
  underlying step succeeded but the Telegram send itself failed — `scripts/flujo-diario.js` exits
  non-zero in that case so a scheduled-task failure is visible even though the data load worked.

### Production readiness (Sprint 9)

- `db/hardening.sql` (`npm run db:hardening`, idempotent via `DO`/exception check) creates role
  `abis_app` with least-privilege grants: `SELECT` only on catalogs and the reporting views,
  `SELECT`+`INSERT` (no `UPDATE`/`DELETE`, no DDL) on `registro_enrolamiento`. Verified two ways:
  the full `flujo-diario` pipeline works end-to-end connected as `abis_app`, and `DROP`/`UPDATE`/
  `DELETE` as that role are all rejected by Postgres. **Dev's `.env` still uses the `postgres`
  superuser** (needed for `db:schema`/`db:views`/`db:hardening` themselves) — only a genuine
  production `DATABASE_URL` should switch to `abis_app`. The password in `db/hardening.sql` is a
  placeholder (`CAMBIAR_ESTA_PASSWORD_EN_PRODUCCION`); change it before applying to a real prod DB.
- `docs/MANUAL_OPERACION.md` is a separate, non-developer-facing runbook (this file, `CLAUDE.md`,
  stays dev-focused) — health checks, what each Telegram alert means, how to re-run a failed day
  manually, where logs/credentials live.
- **Scheduled-task logging gap found and fixed**: the Sprint 7 `Register-ScheduledTask` command
  never captured console output anywhere — a failure before the Telegram-alert step was
  invisible. Fixed by wrapping the action in `cmd.exe /c "... >> logs\flujo-diario.log 2>&1"`
  instead of calling `node.exe` directly; see the addendum in `docs/sprints/AVANCE_SPRINT7.md`.
  `logs/` is gitignored (`logs/*.log`) but the directory itself is tracked via `logs/.gitkeep`.
- No real production server/machine exists yet — Sprint 9's "production environment config"
  deliverable is a checklist (in `docs/sprints/AVANCE_SPRINT9.md`) of what's still undecided
  (target machine, real daily-Excel drop path, a separate production Telegram bot, the real
  institutional catalogs replacing `seed_catalogos.sql`), not a completed deployment.

### Project closeout (Sprint 10, final)

- No code changes — Sprint 10 was a final regression (re-ran `db:schema`/`db:seed`/`db:views`/
  `db:hardening` from an already-applied state to confirm idempotency held, plus a full
  `flujo-diario` + `/health` + `/reporte-diario` + `npm audit` pass) and two new docs:
  `docs/PLAN_DESPLIEGUE.md` (the actual deployment runbook/checklist, consolidating Sprint 9's
  checklist into concrete steps) and `docs/sprints/AVANCE_SPRINT10.md` (closing report).
- **Don't describe this project as "in production" or "deployed."** It's feature-complete and
  repeatedly verified with real Telegram sends against test/fixture data, but no real daily-Excel
  source, production server, or production bot was ever connected. If asked to "go live" or
  connect a real data source, that's new work building on top of a finished v1.0.0, not something
  already done — start from `docs/PLAN_DESPLIEGUE.md`.

## Roadmap context

Full 10-sprint plan (dates, deliverables, critical milestones) is in
[`docs/diagramas/roadmap.md`](docs/diagramas/roadmap.md); the original requirements doc is in
[`docs/informe-requerimientos.md`](docs/informe-requerimientos.md); a copy of the source PDF is at
`sistema_abis.pdf` on the Desktop (outside the repo). **All 10 sprints are closed** (`v1.0.0`,
tagged and pushed) — there is no "next sprint." Any further work is either a new feature request
or resolving `docs/PLAN_DESPLIEGUE.md`'s prerequisites for a real deployment.

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
