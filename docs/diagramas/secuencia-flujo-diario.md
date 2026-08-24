# Diagrama de secuencia — Flujo diario end-to-end

Recorrido de `npm run flujo-diario -- <archivo.xlsx>` (Sprint 7), desde el Excel hasta la
notificación en Telegram, incluyendo las tres ramas de error que `flujoDiario.js` maneja sin
fallar en silencio. Se renderiza automáticamente en GitHub.

```mermaid
sequenceDiagram
    actor Op as Operador / Tarea programada
    participant CLI as scripts/flujo-diario.js
    participant Flujo as flujoDiario.js
    participant ETL as etl/index.js
    participant Ingest as ingest/index.js
    participant Excel as excelReader.js
    participant Valid as headerValidator.js
    participant Map as catalogMapper.js
    participant Bulk as bulkInsert.js
    participant DB as PostgreSQL
    participant Rep as reporteDiario.js
    participant Fmt as formatearReporte.js
    participant TG as telegramClient.js
    participant API as API de Telegram

    Op->>CLI: node flujo-diario.js archivo.xlsx
    CLI->>Flujo: ejecutarFlujoDiario(filePath, pool)
    Flujo->>ETL: runEtl(filePath, pool)
    ETL->>Ingest: processExcelFile(filePath, pool)
    Ingest->>Excel: readExcelFile(filePath)

    Note over Flujo,TG: notificarSinFallar() esta definida en flujoDiario.js, no en<br/>telegramClient.js: llama a enviarMensaje() y atrapa cualquier error<br/>de Telegram para que nunca tape el error/resultado original.

    alt Excel corrupto o ilegible
        Excel-->>Ingest: throw error
        Ingest-->>ETL: throw error
        ETL-->>Flujo: throw error
        Flujo->>Flujo: notificarSinFallar(formatearAlerta("No se pudo leer el archivo..."))
        Flujo->>TG: enviarMensaje({token, chatId, texto})
        TG->>API: POST sendMessage
        API-->>TG: ok / error
        TG-->>Flujo: resultado (o excepcion capturada)
        Flujo-->>CLI: throw error (propaga igual, la notificacion nunca lo tapa)
    end

    Excel-->>Ingest: headers, rows crudos
    Ingest->>Valid: validateHeaders(headers)

    alt Cabeceras invalidas
        Valid-->>Ingest: ok=false, missing/unexpected
        Ingest-->>ETL: headerValidation.ok=false
        ETL-->>Flujo: headerValidation.ok=false
        Flujo->>Flujo: notificarSinFallar(formatearAlerta("Cabeceras del Excel invalidas..."))
        Flujo->>TG: enviarMensaje({token, chatId, texto})
        TG->>API: POST sendMessage
        API-->>TG: ok / error
        TG-->>Flujo: resultado (o excepcion capturada)
        Flujo-->>CLI: resultado (reporte=null, notificado="alerta_cabeceras"/"..._sin_notificar")
    end

    Valid-->>Ingest: ok=true
    Ingest->>Map: loadCatalogs(pool) + mapRow() por fila
    Note over Map: tolera tipeos menores (distancia ≤2)<br/>en Nacionalidad/Equipo/Estado
    Map-->>Ingest: mappedRows, rowErrors
    Ingest-->>ETL: rows, errors
    ETL->>Bulk: bulkInsertRegistros(pool, rows)
    Bulk->>DB: INSERT por lotes de 5000<br/>(1 sola transaccion)
    DB-->>Bulk: insertResult {inserted, ...}
    Bulk-->>ETL: insertResult
    ETL-->>Flujo: resultadoEtl completo

    alt 0 filas insertadas (todas con error o Excel vacio)
        Flujo->>Flujo: notificarSinFallar(formatearAlerta("El Excel no cargo ningun registro..."))
        Flujo->>TG: enviarMensaje({token, chatId, texto})
        TG->>API: POST sendMessage
        API-->>TG: ok / error
        TG-->>Flujo: resultado (o excepcion capturada)
        Flujo-->>CLI: resultado (reporte=null, notificado="alerta_vacio"/"..._sin_notificar")
    end

    Flujo->>Flujo: determina fecha mas reciente entre las filas
    Flujo->>Rep: obtenerReporteDiario(pool, fecha)
    Rep->>DB: consulta vw_total_diario + 6 vistas de resumen
    DB-->>Rep: totales, sincronizacion, registro, general,<br/>nacionalidad, cuartel, unidad, genero, edad
    Rep-->>Flujo: reporte JSON con porcentajes
    Flujo->>Fmt: formatearReporte(reporte)
    Fmt-->>Flujo: texto Markdown
    Flujo->>Flujo: notificarSinFallar(texto)
    Flujo->>TG: enviarMensaje({token, chatId, texto})
    TG->>TG: truncarSiExcede() (limite 4096 chars)
    TG->>API: POST bot<TOKEN>/sendMessage
    API-->>TG: ok / error
    TG-->>Flujo: resultado (o excepcion capturada)
    Flujo->>Flujo: notificado = true/false segun exito (nunca tapa el resultado del ETL)
    Flujo-->>CLI: resultado (reporte, notificado="reporte"/"reporte_sin_notificar")
```

## Lectura del diagrama

- El flujo tiene **una sola entrada** (`ejecutarFlujoDiario`) y **tres puntos de salida
  temprana**, cada uno notificando por Telegram *antes* de retornar (nunca falla en silencio):
  Excel ilegible, cabeceras inválidas, o cero filas insertadas.
- `notificarSinFallar()` y `notificar()` están definidas en `flujoDiario.js`, no en
  `telegramClient.js` — son las que deciden el `true`/`false` que determina si `notificado`
  termina con el sufijo `_sin_notificar`. La única función que vive en `telegramClient.js` es
  `enviarMensaje()`, que hace la llamada HTTP real. Ver
  [`AVANCE_SPRINT8.md`](../sprints/AVANCE_SPRINT8.md) sobre por qué `notificarSinFallar` existe:
  para que una falla de Telegram nunca tape el error/resultado original que se estaba
  reportando.
- El mapeo de catálogos (`catalogMapper.js`) y la inserción (`bulkInsert.js`) son los únicos pasos
  que tocan la base de datos antes del reporte final; el reporte en sí vuelve a consultarla
  (vistas de `db/views.sql`), no reutiliza los datos ya insertados en memoria.
- Si el Excel trae varias fechas de enrolamiento (no debería, pero no se asume), el flujo reporta
  sobre la más reciente en vez de fallar.

## Cómo mantenerlo actualizado

Si cambia el orden de pasos en `flujoDiario.js`, `etl/index.js` o `ingest/index.js` (por ejemplo,
una nueva validación o un nuevo punto de notificación), reflejar el cambio acá antes de cerrar el
sprint correspondiente — igual que con `arquitectura.md`.
