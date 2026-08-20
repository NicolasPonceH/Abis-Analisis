# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Sistema ABIS (Sistema de Gestión Automatizada de Identificación Biométrica): processes a daily
biometric enrollment Excel file, normalizes it into PostgreSQL, and (eventually) notifies a
statistical summary via Telegram. The project follows a 10-week sprint roadmap (18 Aug – 23 Oct
2026); it is currently early-stage (Sprint 1: data modeling and initial setup only — no Excel
ingestion or Telegram integration exists yet).

## Commands

```bash
npm install
npm start               # starts the Express server on http://localhost:3000
npm run db:schema       # applies db/schema.sql against DATABASE_URL
npm run db:seed         # loads db/seed_catalogos.sql against DATABASE_URL
```

There is no test suite, linter, or build step configured yet.

`GET /health` confirms the server is up and the PostgreSQL connection works.

`node scripts/run-sql.js <path-to-file.sql>` runs any arbitrary `.sql` file against
`DATABASE_URL` — this is the general mechanism for applying schema/data changes, not just the two
npm scripts above.

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
- `src/server.js` — Express app entrypoint; currently only wires up `/health`.
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
  and `id_nacionalidad` to support the planned statistics dashboard.

## Roadmap context

Sprint 2 (25–31 Aug 2026) is the next planned milestone: an Excel reading module (`xlsx` library),
header/structure validation, and mapping of raw Excel text values to catalog IDs. When working on
ingestion code, expect it to map free-text Excel columns (nationality, region/unit/cuartel names,
equipment type) onto the catalog tables above rather than storing free text directly.

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
