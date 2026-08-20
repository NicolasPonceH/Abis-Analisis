# Sistema ABIS

Sistema de Gestión Automatizada de Identificación Biométrica. Procesa un Excel diario de
enrolamiento biométrico, lo normaliza en PostgreSQL y notifica un resumen estadístico por
Telegram.

Ver el [informe de requerimientos completo](docs/informe-requerimientos.md) para el detalle
funcional, no funcional y el flujo de integración con Telegram.

## Estado actual

- [x] **Sprint 1** (18-24 ago, `v0.1.0`): estructura del proyecto Node.js/Express, esquema
      normalizado (`db/schema.sql`), poblamiento de catálogos (`db/seed_catalogos.sql`).
- [x] **Sprint 2** (25-31 ago, `v0.2.0`): módulo de lectura de Excel, validación de cabeceras y
      mapeo en memoria a IDs de catálogo (`src/ingest/`).
- [ ] **Sprint 3** (1-7 sep): ETL — transformación/limpieza e inserción transaccional en
      `registro_enrolamiento`.
- [ ] Sprints 4-10: carga histórica, métricas, bot de Telegram, QA y despliegue.

Roadmap completo: 10 sprints semanales, 18 ago - 23 oct 2026 — ver
[`docs/diagramas/roadmap.md`](docs/diagramas/roadmap.md).

## Stack tecnológico

- **Backend**: Node.js + Express.
- **Base de datos**: PostgreSQL (esquema normalizado 3NF).
- **Lectura de Excel**: `xlsx` (SheetJS), instalado desde el CDN oficial del proveedor — ver nota
  en [Comandos](#comandos-disponibles).
- **Sin build step ni framework de tests todavía** — proyecto en etapa temprana (ver
  [Estado actual](#estado-actual)).

## Requisitos

- Node.js 18+
- PostgreSQL 14+ accesible (local o remoto)

## Instalación y puesta en marcha

```bash
npm install
cp .env.example .env      # editar DATABASE_URL con las credenciales reales
npm run db:schema         # crea las tablas (idempotente)
npm run db:seed           # carga los catalogos de ejemplo
npm start                 # levanta el servidor en http://localhost:3000
```

`GET /health` confirma que el servidor está arriba y que la conexión a PostgreSQL funciona:

```bash
curl http://localhost:3000/health
# {"status":"ok","db":"connected"}
```

## Variables de entorno

Definidas en `.env` (gitignored — ver `.env.example` para la plantilla):

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión completa a PostgreSQL | `postgresql://usuario:password@localhost:5432/abis_db` |
| `PORT` | Puerto donde escucha el servidor Express | `3000` |

## Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm start` | Levanta el servidor Express (`src/server.js`) en `http://localhost:$PORT`. |
| `npm run db:schema` | Aplica `db/schema.sql` contra `DATABASE_URL` (crea/actualiza tablas, es idempotente). |
| `npm run db:seed` | Carga `db/seed_catalogos.sql` (datos de ejemplo en las tablas maestras). |
| `npm run ingest -- <archivo.xlsx>` | Corre el módulo de ingesta (`src/ingest/`) contra un Excel: lee, valida cabeceras y mapea filas a IDs de catálogo. No inserta en la base todavía (Sprint 3). |
| `node scripts/run-sql.js <archivo.sql>` | Mecanismo genérico para aplicar cualquier `.sql` suelto contra `DATABASE_URL` — no solo schema/seed. |

Ejemplo de ingesta con el archivo de prueba incluido en el repo:

```bash
npm run ingest -- fixtures/enrolamiento_ejemplo.xlsx
```

**Nota sobre `xlsx`**: la versión publicada en el registro de npm tiene una vulnerabilidad de
severidad alta sin fix ahí (SheetJS dejó de publicar actualizaciones en npm). Si alguna vez hay
que reinstalarla, usar la versión parcheada del CDN oficial, no `npm install xlsx` a secas:

```bash
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

## Entorno local de esta máquina

Esta máquina tiene una instancia PostgreSQL 18 preexistente (no relacionada con este proyecto) en
el puerto 5432, más una **segunda instancia dedicada a ABIS en el puerto 5433**, creada con los
mismos binarios (`initdb`/`pg_ctl` de PostgreSQL 18) en un data directory aparte:

```
C:\Users\Nicolás\pgdata-abis-5433
```

A diferencia de la máquina original (donde corría como servicio de Windows
`postgresql-x64-17-abis`), acá corre como **proceso manual**, porque esta cuenta no tiene permisos
de administrador para registrar un servicio. No sobrevive un reinicio de la PC ni una caída
inesperada (crash de un cliente, cierre de sesión) — hay que levantarla a mano cuando pase.

```powershell
# Revisar si esta corriendo
Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue

# Iniciar (o el script que hace ambos pasos: C:\Users\Nicolás\pgdata-abis-5433\ensure-running.ps1)
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Users\Nicolás\pgdata-abis-5433" -l "C:\Users\Nicolás\pgdata-abis-5433\server.log" start

# Detener
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Users\Nicolás\pgdata-abis-5433" stop
```

- Superusuario: `postgres`, password `abis_dev_pw` (solo desarrollo local).
- Base de datos creada: `abis_db`.
- `.env` ya está configurado con `DATABASE_URL=postgresql://postgres:abis_dev_pw@localhost:5433/abis_db`.
- Esquema y catálogos ya aplicados (`npm run db:schema && npm run db:seed`).

Si en el futuro se consigue una cuenta con permisos de administrador, se puede reemplazar este
proceso manual por un servicio de Windows real (`pg_ctl register` o reinstalando vía winget), sin
tener que tocar el puerto ni las credenciales.

### Solución de problemas comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `ECONNREFUSED` al correr `npm run db:schema`/`db:seed`/`npm start` | La instancia de 5433 no está corriendo | Correr el comando "Iniciar" de arriba |
| `pg_ctl: could not open log file ... Permission denied` | Ya está corriendo (el log está en uso por ese proceso) | No es un error real — confirmar con `Get-NetTCPConnection` |
| `el sistema de base de datos está iniciándose` | Está terminando de recuperarse de una caída/apagado abrupto | Esperar unos segundos y reintentar el mismo comando |

## Estructura

```
db/
  schema.sql                 DDL del esquema normalizado (3NF)
  seed_catalogos.sql         Datos de ejemplo para las tablas maestras
docs/
  informe-requerimientos.md  Informe de requerimientos original
  diagramas/                 ER, arquitectura y roadmap (Mermaid)
  sprints/                   Informe de avance por sprint cerrado
fixtures/
  enrolamiento_ejemplo.xlsx  Excel de prueba para el modulo de ingesta
scripts/
  run-sql.js                 Ejecuta un archivo .sql contra DATABASE_URL
  ingest-excel.js            Corre el modulo de ingesta contra un Excel (npm run ingest)
src/
  db.js                      Pool de conexion a PostgreSQL
  server.js                  Servidor Express
  ingest/                    Lectura de Excel, validacion de cabeceras y mapeo a catalogos
```

## Modelo de datos y arquitectura

- [`docs/diagramas/er-diagrama.md`](docs/diagramas/er-diagrama.md) — seis tablas de catálogo
  (`nacionalidad`, `region`, `unidad`, `cuartel`, `equipo`, `estado_proceso`) más la tabla
  transaccional `registro_enrolamiento`.
- [`docs/diagramas/arquitectura.md`](docs/diagramas/arquitectura.md) — componentes implementados
  vs. planificados por sprint.

## Notas

- Los catálogos de `seed_catalogos.sql` son de ejemplo (tomados del informe de requerimientos).
  Deben completarse con el listado real de unidades/cuarteles antes de cargar datos reales (Sprint 3+).
- Las cabeceras esperadas del Excel (`src/ingest/headerSchema.js`) están **inferidas** del informe
  de requerimientos, no confirmadas todavía contra un archivo real de producción.
- El token del bot de Telegram y las credenciales de BD se manejan por variables de entorno
  (`.env`, nunca comprometido al repositorio).

## Documentación y versionado

Documentación del proyecto (diagramas, informes de avance por sprint) en [`docs/`](docs/README.md).

Cada sprint cerrado se marca con un tag de git `v0.N.0` (Sprint 1 → `v0.1.0`, ..., Sprint 10 →
`v1.0.0`):

```bash
git add .
git commit -m "Sprint N: <resumen>"
git tag -a v0.N.0 -m "Sprint N: <resumen>"
git push origin main --tags
```

Para obtener el estado del proyecto tal como estaba al cierre de un sprint:

```bash
git clone https://github.com/NicolasPonceH/Sistema_ABIS.git
cd Sistema_ABIS
git checkout v0.1.0   # o el tag del sprint que se necesite
```
