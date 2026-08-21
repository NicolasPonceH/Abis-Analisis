---
title: "Informe de Avance — Sprint 6"
subtitle: "Sistema de Gestión Automatizada de Identificación Biométrica (ABIS)"
---

**Proyecto:** Sistema ABIS
**Periodo del ciclo:** 22 de septiembre de 2026 – 28 de septiembre de 2026
**Fecha de presentación:** 21 de agosto de 2026

## 1. Objetivo del ciclo

Según la hoja de ruta del proyecto, el Sprint 6 tiene como objetivo la **configuración del bot de
Telegram**, con el siguiente entregable comprometido:

- Creación del bot en BotFather y obtención de un token seguro.
- Configuración del cliente HTTP para la API de Telegram.
- Diseño del template del mensaje en formato Markdown.

## 2. Trabajo realizado

### 2.1. Bot de Telegram

Se creó el bot **@AbisSystemBot** vía [@BotFather](https://t.me/BotFather) (`/newbot`). El token
se guardó en `.env` como `TELEGRAM_BOT_TOKEN` (nunca comprometido al repositorio — `.env` está en
`.gitignore` desde Sprint 1). El `TELEGRAM_CHAT_ID` de destino (chat personal con el bot, para
pruebas) se obtuvo consultando `https://api.telegram.org/bot<TOKEN>/getUpdates` después de
mandarle `/start` al bot desde Telegram.

**Decisión de alcance**: el destino configurado es un chat personal, no un grupo — más simple
para probar ahora. Migrar a un grupo/canal del equipo más adelante es solo cambiar
`TELEGRAM_CHAT_ID` en `.env`, no requiere tocar código.

### 2.2. Cliente HTTP (`src/telegram/telegramClient.js`)

Cliente mínimo para `sendMessage` de la API de Telegram, usando el `fetch` nativo de Node 18+
(sin agregar dependencias nuevas). Lanza un error claro si Telegram responde `ok: false`.

### 2.3. Template del mensaje (`src/telegram/formatearReporte.js`)

Toma el JSON de `obtenerReporteDiario()` (Sprint 5) y arma el mensaje Markdown, siguiendo el
formato de ejemplo de la sección 5 del informe de requerimientos (título con emoji, secciones en
negrita, checkmarks por estado).

**Decisiones de diseño**:

- El informe muestra un ejemplo con etiquetas fijas ("Sincronizados", "Registrados", "Con
  Error"), pero como ya se decidió en Sprint 5, el catálogo `estado_proceso` es genérico y sus
  descripciones son configurables — no hardcodeamos esas etiquetas. En cambio, cada fila se
  muestra con su propia descripción tal cual está en el catálogo, y el emoji se asigna por un
  patrón simple (`ERROR` → ❌, `PENDIENTE` → ⏳, `MENOR` → ⚠️, cualquier otra cosa → ✅). Esto
  sigue funcionando aunque el catálogo real institucional (todavía pendiente de reemplazar el
  placeholder de `seed_catalogos.sql`) use descripciones distintas a las de ejemplo.
- El mensaje incluye los 5 desgloses que agregamos en el addendum de Sprint 5 (nacionalidad,
  cuartel, unidad, género, edad), no solo los 2 que muestra el ejemplo del informe (nacionalidad y
  cuartel) — la data ya estaba disponible, y la sección 2 del informe pide expresamente los 5.
- **Bug evitado en la prueba real**: el catálogo de ejemplo tiene un estado `CON_ERROR` (con
  guión bajo). El "Markdown" clásico de Telegram usa `_` para cursiva — un guión bajo suelto sin
  cerrar rompe el parseo del mensaje completo. Se agregó `escaparMarkdown()`, que escapa
  `_ * \` [ ]` en cualquier texto que venga de datos (nunca en los literales que escribimos
  nosotros). Confirmado visualmente: el mensaje real en Telegram muestra `CON_ERROR` tal cual,
  sin la barra invertida del escape ni cursiva rota.

### 2.4. Script de envío (`scripts/enviar-reporte-telegram.js`, `npm run telegram:enviar`)

Script manual: arma el reporte de una fecha, lo imprime en consola, y lo manda por Telegram.
Para Sprint 7 (automatización del flujo completo), este mismo script es la pieza que un cron job
va a invocar — Sprint 6 no lo automatiza todavía, solo lo deja funcionando de forma manual.

### 2.5. Verificación con envío real

Se usó el dataset determinístico de Sprint 5 (`npm run datos-reporte-prueba`, 10 filas con
porcentajes exactos) y se mandó el mensaje real al chat de prueba. Se confirmó visualmente en la
app de Telegram: título y secciones en negrita, emojis correctos por estado, y `CON_ERROR`
renderizado correctamente (el escape de Markdown funcionó). Ver el detalle completo en la sección
de verificación más abajo.

## 3. Estado del entregable

**Completo.** Los tres puntos comprometidos están implementados y verificados con un envío real
a Telegram, no solo una simulación.

## 4. Cómo reproducir esta verificación

Con la base de datos arriba (ver
[Solución de problemas comunes](../../README.md#solución-de-problemas-comunes) si no lo está) y
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` ya configurados en `.env` (ver
[README](../../README.md#variables-de-entorno) — si no tenés un bot propio, hay que crear uno
nuevo con [@BotFather](https://t.me/BotFather), mandarle `/start`, y obtener el `chat_id` con
`https://api.telegram.org/bot<TOKEN>/getUpdates`):

**1. Insertar el dataset de prueba determinístico:**

```powershell
npm run datos-reporte-prueba
```

**2. Mandar el reporte de esa fecha por Telegram:**

```powershell
npm run telegram:enviar -- 2026-09-15
```

Salida esperada: el script imprime el mensaje completo en consola (para revisar el texto plano
antes de que salga) y termina con `Mensaje enviado correctamente.`

*Por qué se imprime antes de enviar*: permite detectar un problema de formato (como el bug del
guión bajo de 2.3) sin tener que ir a revisar Telegram cada vez — si el texto en consola ya se ve
mal, no hace falta ni mandar el mensaje.

**3. Confirmar visualmente en Telegram**: abrir el chat con el bot y revisar que el mensaje
llegó con el formato esperado — título en negrita, secciones con checkmarks/emojis, y
`CON_ERROR` (o cualquier descripción con guión bajo del catálogo real) sin romper el resto del
mensaje.

**4. Limpiar los datos de prueba:**

```powershell
$env:PGPASSWORD = "abis_dev_pw"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

## 5. Próximos pasos (Sprint 7, 29 sep–05 oct)

Según la hoja de ruta, el siguiente ciclo corresponde a la **automatización del flujo completo**:

- Integración real: Excel → ETL → BD → Cálculos → Notificación Telegram, encadenando
  `runEtl()` (Sprint 3) con `obtenerReporteDiario()` + `enviarMensaje()` (Sprint 5-6) en un solo
  flujo, en vez de correrlos como scripts manuales separados.
- Configuración de disparadores (tareas programadas / cron jobs) — en esta máquina, sin permisos
  de administrador, probablemente una Tarea Programada a nivel de usuario (igual que se evaluó
  para PostgreSQL, ver `README.md`), no un servicio de Windows.
- Manejo de excepciones: notificar (¿por el mismo Telegram?) si el Excel del día viene vacío o
  corrupto.
