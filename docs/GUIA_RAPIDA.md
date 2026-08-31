# Guía rápida — Encender todo y probar cada sprint

Referencia corta con los comandos exactos para levantar el entorno y ver funcionando lo que se
construyó en cada sprint. Para el detalle completo (qué hace cada cosa, salida esperada
línea por línea, por qué) ver el `docs/sprints/AVANCE_SPRINT{N}.md` correspondiente — este
documento es el índice rápido, no el reemplazo.

**Convención**: casi todas las secciones insertan datos de prueba en `registro_enrolamiento`.
Truncar entre secciones si no querés que se mezclen (comando al final de cada una).

## 0. Encender el entorno (antes de cualquier sprint)

```powershell
# 1. Levantar PostgreSQL si no está corriendo
Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue
# si no muestra nada:
powershell -File "C:\Users\Nicolás\pgdata-abis-5433\ensure-running.ps1"

# 2. (Opcional) Levantar el servidor Express, solo si vas a probar Sprint 5 vía HTTP
npm start
```

Ver [`README.md`](../README.md#solución-de-problemas-comunes) si PostgreSQL no arranca.

---

## Sprint 1 — Modelado y configuración inicial

```powershell
npm run db:schema   # crea las tablas
npm run db:seed     # carga catálogos de ejemplo
curl http://localhost:3000/health   # {"status":"ok","db":"connected"} (necesita npm start corriendo)
```

📄 [`AVANCE_SPRINT1.md`](sprints/AVANCE_SPRINT1.md)

## Sprint 2 — Lectura de Excel (solo lectura, no inserta)

```powershell
npm run ingest -- fixtures/enrolamiento_ejemplo.xlsx
```

Esperado: `Filas mapeadas correctamente: 2` / `Filas con errores: 1`.

📄 [`AVANCE_SPRINT2.md`](sprints/AVANCE_SPRINT2.md)

## Sprint 3 — ETL (corrige tipeos, inserta)

```powershell
npm run etl -- fixtures/enrolamiento_etl_prueba.xlsx
```

Esperado: `Filas insertadas: 2`, 1 corrección automática, 1 fila rechazada.

```powershell
$env:PGPASSWORD = "abis_dev_pw"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

📄 [`AVANCE_SPRINT3.md`](sprints/AVANCE_SPRINT3.md)

## Sprint 4 — Carga histórica y estrés

```powershell
npm run carga-historica -- 95000    # ~2.6s, 19 lotes
npm run validar-integridad          # chequeos + EXPLAIN ANALYZE
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

📄 [`AVANCE_SPRINT4.md`](sprints/AVANCE_SPRINT4.md)

## Sprint 5 — Vistas y reporte diario

```powershell
npm run db:views
npm run datos-reporte-prueba        # 10 filas fijas, fecha 2026-09-15
npm start                           # en otra terminal si no está corriendo
(Invoke-WebRequest "http://localhost:3000/reporte-diario?fecha=2026-09-15").Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

Esperado: porcentajes redondos (70/20/10, 80/20, 90/10, 40/30/20/10, 40/30/30, 50/50, 90/10).

📄 [`AVANCE_SPRINT5.md`](sprints/AVANCE_SPRINT5.md)

## Sprint 6 — Bot de Telegram

```powershell
npm run datos-reporte-prueba
npm run telegram:enviar -- 2026-09-15
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

Revisar el chat con el bot configurado en `TELEGRAM_CHAT_ID` — debería llegar el reporte
formateado.

📄 [`AVANCE_SPRINT6.md`](sprints/AVANCE_SPRINT6.md)

## Sprint 7 — Flujo diario completo (Excel → ETL → BD → Telegram)

```powershell
npm run flujo-diario -- fixtures/enrolamiento_etl_prueba.xlsx   # caso exitoso
npm run flujo-diario -- fixtures/enrolamiento_vacio.xlsx        # caso de alerta (Excel vacío)
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

📄 [`AVANCE_SPRINT7.md`](sprints/AVANCE_SPRINT7.md) (incluye el comando de la tarea programada)

## Sprint 8 — QA (simulación de días reales)

```powershell
npm run flujo-diario -- fixtures/enrolamiento_ejemplo.xlsx      # dia 1: 19/08/2026
npm run flujo-diario -- fixtures/enrolamiento_etl_prueba.xlsx   # dia 2: 01/09/2026
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "SELECT fecha_enrolamiento, count(*) FROM registro_enrolamiento GROUP BY fecha_enrolamiento;"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

📄 [`AVANCE_SPRINT8.md`](sprints/AVANCE_SPRINT8.md)

## Sprint 9 — Hardening de la base

```powershell
npm run db:hardening
$env:DATABASE_URL = "postgresql://abis_app:CAMBIAR_ESTA_PASSWORD_EN_PRODUCCION@localhost:5433/abis_db"
npm run flujo-diario -- fixtures/enrolamiento_etl_prueba.xlsx   # deberia funcionar igual
```

Abrir una terminal **nueva** después (para no dejar `$env:DATABASE_URL` pisado) y limpiar:

```powershell
$env:PGPASSWORD = "abis_dev_pw"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

📄 [`AVANCE_SPRINT9.md`](sprints/AVANCE_SPRINT9.md) · [`MANUAL_OPERACION.md`](MANUAL_OPERACION.md)

## Sprint 10 — Regresión final y cierre

```powershell
npm run db:schema; npm run db:seed; npm run db:views; npm run db:hardening   # deben ser no-op
npm run flujo-diario -- fixtures/enrolamiento_etl_prueba.xlsx
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

📄 [`AVANCE_SPRINT10.md`](sprints/AVANCE_SPRINT10.md) · [`PLAN_DESPLIEGUE.md`](PLAN_DESPLIEGUE.md)

---

## Tarea programada activa

Hay dos tareas reales trabajando en cadena (ver [`PruebDataBase_FAKE.md`](PruebDataBase_FAKE.md)):

- **`ABIS-FuenteDiaria`** (07:30): genera datos en la BD simulada `abis_fuente` y exporta el Excel
  del día a `Documents\ABIS_excel_diario\`.
- **`ABIS-FlujoDiario`** (08:00): procesa el Excel más reciente de esa carpeta
  (`scripts/tarea-diaria.ps1`, garantiza PostgreSQL arriba antes del flujo).

Ver estado con `Get-ScheduledTaskInfo -TaskName "ABIS-FuenteDiaria"` (y `"ABIS-FlujoDiario"`).
Para pausarlas/borrarlas, ver [`MANUAL_OPERACION.md`](MANUAL_OPERACION.md).
