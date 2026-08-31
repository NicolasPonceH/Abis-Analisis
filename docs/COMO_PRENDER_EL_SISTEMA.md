# Cómo prender el sistema y operarlo a mano por terminal

Chuleta para levantar Sistema ABIS de cero y disparar cada paso del flujo manualmente desde la
terminal — pensada para tener a mano durante una revisión en vivo. Para el detalle de qué hace
cada pieza ver `CLAUDE.md`; para diagnosticar fallas del flujo automático ver
[`MANUAL_OPERACION.md`](MANUAL_OPERACION.md); para probar sprint por sprint ver
[`GUIA_RAPIDA.md`](GUIA_RAPIDA.md).

## 1. Prender la base de datos

PostgreSQL (puerto 5433, dedicado a ABIS) no corre como servicio de Windows en esta cuenta — no
sobrevive reinicios y hay que asegurarse de que esté arriba. Desde el 26/08/2026 hay una tarea
programada (`ABIS-PostgreSQL-Inicio`) que lo hace solo al iniciar sesión, pero conviene verificar:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h localhost -p 5433
```

Si dice `rejecting connections` o no responde:

```powershell
powershell -File "C:\Users\Nicolás\pgdata-abis-5433\ensure-running.ps1"
```

Reintentar el `pg_isready` unos segundos después (puede tardar ~30s si venía de un apagado
brusco, por la recuperación automática de Postgres).

## 2. Dejar el esquema al día (idempotente — no rompe nada si ya está aplicado)

```powershell
npm run db:schema      # tablas
npm run db:seed        # catálogos de ejemplo
npm run db:views       # vistas de reporte
npm run db:hardening   # rol abis_app de bajo privilegio
```

## 3. Prender el servidor web

```powershell
npm start
```

Dejar esta terminal abierta — el servidor queda escuchando en `http://localhost:3000`. Abrir una
terminal nueva para todo lo que sigue.

## 4. Confirmar que está sano

```powershell
(Invoke-WebRequest "http://localhost:3000/health").Content
```

Esperado: `{"status":"ok","db":"connected"}`.

```powershell
(Invoke-WebRequest "http://localhost:3000/reporte-diario").Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

Sin `?fecha=` trae el reporte de la fecha más reciente con datos cargados. Usar
`?fecha=YYYY-MM-DD` para pedir un día puntual (`400` si el formato es inválido, `200` con
`total: 0` si el día existe pero no tiene datos).

**Nota PowerShell**: `curl` en PowerShell es alias de `Invoke-WebRequest`, que trunca el JSON al
imprimirlo directo en consola — por eso el `.Content | ConvertFrom-Json | ConvertTo-Json` de
arriba, o usar `curl.exe` (el real) si solo se quiere ver que responde.

## 5. Correr el flujo diario completo a mano (Excel → ETL → BD → Telegram)

Esto es lo que hacen solas las tareas programadas `ABIS-FuenteDiaria`/`ABIS-FlujoDiario` todos los
días — para dispararlo a demanda:

**Opción A — generar un Excel simulado del día y procesarlo** (igual que la tarea automática):

```powershell
node scripts/fuente-generar.js     # genera filas del día en la BD simulada abis_fuente
node scripts/fuente-exportar.js    # exporta el Excel a Documents\ABIS_excel_diario\
npm run flujo-diario -- "$env:USERPROFILE\Documents\ABIS_excel_diario\enrolamiento_<fecha>.xlsx"
```

**Opción B — usar un archivo de prueba ya existente en el repo:**

```powershell
npm run flujo-diario -- fixtures/enrolamiento_etl_prueba.xlsx
```

Salida esperada: filas insertadas, correcciones automáticas (typos de catálogo), reporte generado
y enviado por Telegram. Si algo falla a mitad de camino (Excel vacío/corrupto, cabeceras
inválidas), el sistema manda una alerta por Telegram en vez de fallar en silencio — revisar el chat
configurado en `TELEGRAM_CHAT_ID`.

## 6. Qué Excel de prueba usar (`fixtures/`)

Hay tres archivos en `fixtures/`, cada uno prueba una etapa distinta del pipeline (detalle en
[`fixtures/README.md`](../fixtures/README.md)):

| Archivo                          | Para qué sirve                                                                                                                                                                                                                                                                            | Comando                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `enrolamiento_ejemplo.xlsx`    | Prueba solo la**lectura/mapeo** (Sprint 2, `src/ingest/`) — no escribe en la BD. 3 filas: 2 válidas + 1 con nacionalidad inexistente a propósito, para ver que el reporte de errores funciona.                                                                                  | `npm run ingest -- fixtures/enrolamiento_ejemplo.xlsx`     |
| `enrolamiento_etl_prueba.xlsx` | Prueba el**ETL completo** (Sprint 3) — sí inserta filas reales en `registro_enrolamiento`. 3 filas: 1 válida, 1 con typo corregible ("SINCRONIZDO"→"SINCRONIZADO", corrección automática por Levenshtein), 1 irrecuperable ("MARCIANO"). Es el que usa el paso 5B de arriba. | `npm run etl -- fixtures/enrolamiento_etl_prueba.xlsx`     |
| `enrolamiento_vacio.xlsx`      | Cabeceras correctas pero**cero filas**. Para mostrar que el flujo diario completo (Sprint 7) manda una alerta por Telegram en vez de fallar en silencio cuando el Excel viene vacío.                                                                                                | `npm run flujo-diario -- fixtures/enrolamiento_vacio.xlsx` |

Para la demo de "flujo completo funcionando" (paso 5) corresponde `enrolamiento_etl_prueba.xlsx`;
`enrolamiento_vacio.xlsx` conviene mostrarlo aparte si quieren ver que las alertas de error
también funcionan.

## 7. Confirmar que llegó a Telegram

Revisar el chat del bot (`@AbisSystemBot`, o el que esté configurado). Debería verse un mensaje
con título `📊 Reporte Diario ABIS - DD/MM/AAAA`, o una alerta `⚠️ Alerta - Carga diaria ABIS` si
hubo un problema.

También queda registrado en:

```powershell
Get-Content logs\flujo-diario.log -Tail 30
```

## 8. Limpiar datos de prueba (opcional, entre corridas)

Los pasos 5A/5B insertan filas reales en `registro_enrolamiento`. Para no mezclar corridas de
prueba entre sí:

```powershell
$env:PGPASSWORD = "abis_dev_pw"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

## 9. Apagar

- `Ctrl+C` en la terminal donde corre `npm start` para bajar el servidor web.
- PostgreSQL se puede dejar corriendo (no hace daño) o bajarlo con:
  ```powershell
  & "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Users\Nicolás\pgdata-abis-5433" stop
  ```

## Si preguntan "¿esto está en producción?"

No. Está funcionalmente completo (`v1.0.0`, los 10 sprints cerrados) y verificado con corridas
reales, pero no hay servidor de producción, ni Excel diario real, ni bot de Telegram de
producción, ni catálogos institucionales reales — todo lo de arriba corre contra datos
simulados/de prueba en esta máquina de desarrollo. El detalle de qué falta está en
[`PLAN_DESPLIEGUE.md`](PLAN_DESPLIEGUE.md).
