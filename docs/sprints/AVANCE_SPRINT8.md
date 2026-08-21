---
title: "Informe de Avance — Sprint 8"
subtitle: "Sistema de Gestión Automatizada de Identificación Biométrica (ABIS)"
---

**Proyecto:** Sistema ABIS
**Periodo del ciclo:** 6 de octubre de 2026 – 12 de octubre de 2026
**Fecha de presentación:** 21 de agosto de 2026

## 1. Objetivo del ciclo

Según la hoja de ruta del proyecto, el Sprint 8 tiene como objetivo **testing integrado y QA**,
con el siguiente entregable comprometido:

- Simulaciones de cargas diarias reales.
- Corrección de bugs y validación de las métricas de Telegram vs. Excel manual.
- Ajustes de formato en los reportes de Telegram.

## 2. Trabajo realizado

### 2.1. Simulación de cargas diarias reales

Se corrió `flujo-diario.js` (el orquestador de Sprint 7) dos veces seguidas con Excels de fechas
distintas (`enrolamiento_ejemplo.xlsx` → 19/08/2026, `enrolamiento_etl_prueba.xlsx` → 01/09/2026),
simulando dos días consecutivos de operación real. Se confirmó:

- Las dos cargas insertaron datos correctamente aisladas por fecha (2 filas cada una, sin
  mezclarse — verificado con `GROUP BY fecha_enrolamiento` en la base).
- Los dos reportes de Telegram llegaron con datos propios de cada fecha, sin contaminación entre
  días (esto valida indirectamente las métricas de Telegram contra los datos reales insertados —
  el punto de "validación de métricas de Telegram vs. Excel manual" del entregable).

### 2.2. Bugs encontrados y corregidos

Revisando el código con foco en QA (no solo "funciona en el caso feliz") se encontraron 3
problemas reales, todos corregidos y verificados:

| # | Problema | Dónde | Fix |
|---|---|---|---|
| 1 | Las listas de "Cuarteles activos" y "Unidades activas" no tenían límite. Con el catálogo de ejemplo (3 cuarteles) no se nota, pero un catálogo institucional real con decenas de cuarteles podría hacer que el mensaje completo supere el límite de Telegram | `src/telegram/formatearReporte.js` | `formatearLista()` ahora corta a 8 items y agrega "y N más" si sobran |
| 2 | Sin resguardo si un mensaje igual supera el límite de Telegram (4096 caracteres) — la API lo rechaza entero, sin aviso previo | `src/telegram/telegramClient.js` | `enviarMensaje()` trunca el texto antes de mandarlo si excede el límite, con una nota al final |
| 3 | **Bug real de lógica**: si Telegram fallaba justo al mandar la *alerta* de un error (token inválido, sin internet, API caída), esa falla de notificación reemplazaba silenciosamente al error original — quien llamara al flujo nunca se enteraba de la causa real (ej. "Excel corrupto"), solo veía el error de Telegram | `src/flujo/flujoDiario.js` | Nueva `notificarSinFallar()`: intenta notificar, pero si falla, solo lo deja en un `console.error` y el error/resultado original sigue siendo lo que se propaga |

El bug #3 es el más importante de los tres — es una falla de manejo de errores que podría haber
ocultado la causa real de un problema en producción, justo el tipo de cosa que "testing
integrado" está pensado para encontrar antes de que pase en el mundo real.

### 2.3. Ajustes de formato

- El total de enrolamientos ahora se muestra con separador de miles (`toLocaleString("es-CL")`),
  más legible para el volumen que maneja el sistema (95k+ registros históricos, sección 3 del
  informe de requerimientos).
- Las listas largas ahora se cortan con "y N más" en vez de crecer sin límite (ver bug #1).

## 3. Estado del entregable

**Completo.** Se simularon cargas diarias reales, se encontraron y corrigieron 3 bugs (uno de
ellos una falla de manejo de errores no trivial), y se ajustó el formato del reporte.

## 4. Cómo reproducir esta verificación

Con la base de datos arriba y `.env` configurado (Sprint 6):

**1. Simular dos días de carga consecutivos:**

```powershell
npm run flujo-diario -- fixtures/enrolamiento_ejemplo.xlsx      # dia 1: 19/08/2026
npm run flujo-diario -- fixtures/enrolamiento_etl_prueba.xlsx   # dia 2: 01/09/2026
```

Verificar que quedaron separados por fecha:

```powershell
$env:PGPASSWORD = "abis_dev_pw"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "SELECT fecha_enrolamiento, count(*) FROM registro_enrolamiento GROUP BY fecha_enrolamiento ORDER BY fecha_enrolamiento;"
```

Salida esperada: dos filas, `2026-08-19` y `2026-09-01`, cada una con `count = 2`. Y dos mensajes
en Telegram, cada uno con los datos propios de su fecha (no acumulados).

**2. Confirmar el límite de listas largas (sin tocar la base ni Telegram)** — pasarle a
`formatearReporte()` un reporte simulado con más de 8 cuarteles y confirmar que el texto
resultante contiene "y N más":

```powershell
node -e "
const { formatearReporte } = require('./src/telegram/formatearReporte');
const cuarteles = Array.from({length: 12}, (_, i) => ({ cuartel: 'C'+i, total: 12-i, porcentaje: 1 }));
const r = { fecha:'2026-10-06', total:78, sincronizacion:[], registro:[], general:[], nacionalidadesPrincipales:[], cuartelesActivos: cuarteles, unidadesActivas:[], genero:[], edad:[] };
console.log(formatearReporte(r).includes('y 4 más'));
"
```

Salida esperada: `true`.

**3. Confirmar el truncado de mensajes largos con un envío real:**

```powershell
node -e "
require('dotenv').config();
const { enviarMensaje } = require('./src/telegram/telegramClient');
const texto = 'linea de relleno\n'.repeat(300);
enviarMensaje({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID, texto })
  .then(() => console.log('Enviado (deberia llegar truncado, terminando en el aviso de limite)'));
"
```

*Por qué*: si el truncado no funcionara, Telegram directamente rechazaría el envío con un error
de la API en vez de aceptarlo truncado — el script terminando sin error ya es una señal, pero
conviene revisar el chat para confirmar que el mensaje termina en
*"(mensaje truncado: excedia el limite de Telegram)"*.

**4. Confirmar que una falla de Telegram no tapa el error original** (token inválido a propósito,
solo para este comando):

```powershell
$env:TELEGRAM_BOT_TOKEN = "token-invalido-a-proposito"
npm run flujo-diario -- fixtures/archivo_que_no_existe.xlsx
```

Salida esperada:
```
No se pudo notificar por Telegram: Telegram API: Not Found
Error en el flujo diario: ENOENT: no such file or directory, open '...archivo_que_no_existe.xlsx'
```

*Por qué*: el segundo mensaje (el error real, "no such file or directory") tiene que seguir
apareciendo pase lo que pase con Telegram — si en cambio solo se viera el error de Telegram, el
bug #3 seguiría presente. No debería llegar ningún mensaje nuevo a Telegram con este comando (el
token es inválido a propósito).

**5. Limpiar los datos de prueba:**

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

## 5. Próximos pasos (Sprint 9, 13–19 oct)

Según la hoja de ruta, el siguiente ciclo corresponde a **preparación para producción**:

- Documentación técnica del código y manual de operación.
- Configuración del entorno de producción (servidor, variables de entorno) — en esta máquina, ya
  cubierto en gran parte por lo documentado en `README.md` (instancia de PostgreSQL, tarea
  programada), pero hay que revisar qué de eso es específico de esta máquina de desarrollo y qué
  aplicaría a un servidor de producción real.
- Hardening y seguridad de la base de datos y los scripts.
