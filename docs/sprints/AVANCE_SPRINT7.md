---
title: "Informe de Avance — Sprint 7"
subtitle: "Sistema de Gestión Automatizada de Identificación Biométrica (ABIS)"
---

**Proyecto:** Sistema ABIS
**Periodo del ciclo:** 29 de septiembre de 2026 – 5 de octubre de 2026
**Fecha de presentación:** 21 de agosto de 2026

## 1. Objetivo del ciclo

Según la hoja de ruta del proyecto, el Sprint 7 tiene como objetivo la **automatización del flujo
completo**, con el siguiente entregable comprometido:

- Integración: Excel → ETL → BD → Cálculos → Notificación Telegram.
- Configuración de disparadores (tareas programadas / cron jobs).
- Manejo de excepciones (notificar si el Excel viene vacío o corrupto).

## 2. Trabajo realizado

### 2.1. Orquestación del flujo completo (`src/flujo/flujoDiario.js`)

`ejecutarFlujoDiario(filePath, pool)` encadena, en un solo llamado, todo lo construido en los
sprints anteriores:

```
runEtl()          (Sprint 3) → lee, mapea, corrige tipeos e inserta el Excel
obtenerReporteDiario()  (Sprint 5) → calcula el resumen del dia insertado
formatearReporte() + enviarMensaje()  (Sprint 6) → arma y manda el mensaje de Telegram
```

`scripts/flujo-diario.js` (`npm run flujo-diario -- <archivo.xlsx>`) es el punto de entrada único
para correr todo esto de punta a punta, en vez de encadenar `npm run etl` +
`npm run telegram:enviar` a mano.

### 2.2. Manejo de excepciones

El flujo no falla en silencio ante un Excel problemático — en cada caso, manda una alerta por el
mismo canal de Telegram antes de terminar:

| Situación | Qué pasa |
|---|---|
| Archivo no existe / corrupto (`XLSX.readFile` lanza excepción) | Alerta con el mensaje de error, después re-lanza la excepción (para que el proceso que llamó al script se entere igual, ej. una tarea programada) |
| Cabeceras del Excel inválidas | Alerta detallando qué columnas faltan o no se reconocen |
| Excel con cabeceras válidas pero cero filas cargadas (vacío, o todas las filas con errores) | Alerta indicando la causa |
| Carga exitosa pero con algunas filas rechazadas | Se manda el reporte normal, con una línea extra avisando cuántas filas no se pudieron procesar |

Las alertas usan `formatearAlerta()` (nuevo en `src/telegram/formatearReporte.js`), que reutiliza
el mismo `escaparMarkdown()` de Sprint 6 — un mensaje de error con caracteres especiales tampoco
debería romper el parseo de Telegram.

### 2.3. Disparador programado

**No se registró automáticamente** — igual que con la instancia de PostgreSQL (ver
`README.md`), crear una tarea programada de Windows es una acción que el modo automático de
Claude Code bloquea por defecto (es una técnica también usada para persistencia de malware) y
requiere confirmación explícita. Queda documentado el comando listo para correr manualmente en la
sección de verificación — `Register-ScheduledTask` no soporta `-WhatIf`, así que se validó por
separado que los objetos `$action`/`$trigger` se arman sin error, sin llegar a registrar la tarea.

**Nota de alcance**: el comando de ejemplo apunta a un archivo Excel de prueba
(`fixtures/enrolamiento_etl_prueba.xlsx`) porque todavía no existe una carpeta real de donde el
sistema origen deje el Excel diario — eso es un detalle de la instalación en producción (Sprint
9), no algo que este sprint pueda resolver sin esa información.

## 3. Estado del entregable

**Completo**, con la salvedad explícita de 2.3: el disparador está documentado y probado en modo
`-WhatIf`, pero no registrado — queda a criterio del usuario activarlo cuando decida la ruta real
del Excel diario y el horario.

## 4. Cómo reproducir esta verificación

Con la base de datos arriba (ver
[Solución de problemas comunes](../../README.md#solución-de-problemas-comunes) si no lo está) y
`.env` con las credenciales de Telegram configuradas (Sprint 6):

**1. Confirmar que la tabla está vacía:**

```powershell
$env:PGPASSWORD = "abis_dev_pw"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "SELECT count(*) FROM registro_enrolamiento;"
```

**2. Caso archivo inexistente/corrupto:**

```powershell
npm run flujo-diario -- fixtures/archivo_que_no_existe.xlsx
```

Salida esperada: `Error en el flujo diario: ENOENT: no such file or directory, ...` — y una alerta
de Telegram con el mismo mensaje debería haber llegado *antes* de que el script terminara con
error (revisar el chat con el bot).

**3. Caso Excel vacío:**

```powershell
npm run flujo-diario -- fixtures/enrolamiento_vacio.xlsx
```

Salida esperada: `Resultado: alerta_vacio` / `Filas insertadas: 0`, y una alerta de Telegram
explicando que el archivo no tenía filas de datos.

**4. Caso exitoso (con una fila rechazada a propósito):**

```powershell
npm run flujo-diario -- fixtures/enrolamiento_etl_prueba.xlsx
```

Salida esperada: `Resultado: reporte` / `Filas insertadas: 2`, y el reporte diario completo en
Telegram, con una línea extra al final: *"⚠️ 1 fila(s) del Excel no se pudieron procesar"*.

*Por qué estos 3 casos y no más*: cubren exactamente las 3 ramas de manejo de excepciones de
2.2 — archivo no legible, archivo sin datos válidos, y éxito parcial. No hace falta un cuarto
caso para "cabeceras inválidas" porque ya se probó indirectamente en Sprint 2
(`headerValidator.js`); acá solo hacía falta confirmar que ese resultado también dispara una
alerta en vez de quedarse en un log que nadie mira.

**5. Confirmar en la base que solo el caso 4 insertó datos, y limpiar:**

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "SELECT id_registro, fecha_enrolamiento FROM registro_enrolamiento;"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

**6. Cuando quieras activar el disparador programado de verdad** (ajustá primero `$excelDiario`
a la ruta real del Excel diario, y el horario en `-At`):

```powershell
$nodeExe = "C:\Program Files\nodejs\node.exe"
$proyecto = "C:\Users\Nicolás\Desktop\sistema-abis"
$excelDiario = "$proyecto\fixtures\enrolamiento_etl_prueba.xlsx"  # cambiar por la ruta real cuando exista

$action = New-ScheduledTaskAction -Execute $nodeExe -Argument "scripts\flujo-diario.js `"$excelDiario`"" -WorkingDirectory $proyecto
$trigger = New-ScheduledTaskTrigger -Daily -At "07:00"
Register-ScheduledTask -TaskName "ABIS-FlujoDiario" -Action $action -Trigger $trigger -Description "Corre Excel -> ETL -> BD -> Telegram todos los dias a las 07:00."
```

No requiere permisos de administrador (es una tarea a nivel de usuario, igual que
`ensure-running.ps1` de PostgreSQL). Para borrarla despues:
`Unregister-ScheduledTask -TaskName "ABIS-FlujoDiario" -Confirm:$false`.

## Addendum (Sprint 9): comando actualizado con log a archivo

El comando de arriba no guardaba la salida de consola en ningún lado — si la tarea fallaba antes
de siquiera intentar notificar por Telegram (ej. Node no arranca), no había forma de investigar
qué pasó. Se corrigió agregando redirección a `logs/flujo-diario.log` (carpeta gitignored, no se
versiona). El comando vigente es este, no el de arriba:

```powershell
$nodeExe = "C:\Program Files\nodejs\node.exe"
$proyecto = "C:\Users\Nicolás\Desktop\sistema-abis"
$excelDiario = "$proyecto\fixtures\enrolamiento_etl_prueba.xlsx"  # cambiar por la ruta real cuando exista
$log = "$proyecto\logs\flujo-diario.log"

$comando = "`"$nodeExe`" scripts\flujo-diario.js `"$excelDiario`" >> `"$log`" 2>&1"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$comando`"" -WorkingDirectory $proyecto
$trigger = New-ScheduledTaskTrigger -Daily -At "07:00"
Register-ScheduledTask -TaskName "ABIS-FlujoDiario" -Action $action -Trigger $trigger -Description "Corre Excel -> ETL -> BD -> Telegram todos los dias a las 07:00, log en logs\flujo-diario.log."
```

La redirección se verificó corriendo el mismo comando manualmente (no vía Task Scheduler) y
confirmando que `logs/flujo-diario.log` recibe la salida esperada — ver
[`AVANCE_SPRINT9.md`](AVANCE_SPRINT9.md).

## 5. Próximos pasos (Sprint 8, 6–12 oct)

Según la hoja de ruta, el siguiente ciclo corresponde a **testing integrado y QA**:

- Simulaciones de cargas diarias reales.
- Corrección de bugs y validación de las métricas de Telegram vs. Excel manual.
- Ajustes de formato en los reportes de Telegram.
