# Manual de operación — Sistema ABIS

Guía para operar el sistema día a día (no para desarrollarlo — para eso está `CLAUDE.md` y el
resto de `docs/`). Pensada para quien tenga que revisar que todo funcione y reaccionar si algo
falla, sin necesitar leer el código.

## 1. Qué hace el sistema, en una frase

Todos los días, a la hora configurada, el sistema toma el Excel de enrolamiento del día, lo carga
en la base de datos, y manda un resumen por Telegram. Si algo sale mal (Excel vacío, corrupto, o
la base caída), avisa por el mismo Telegram en vez de fallar en silencio.

## 2. Operación normal

Si todo funciona bien, no hay que hacer nada: todos los días a la hora configurada llega un
mensaje al chat de Telegram con el reporte del día (título "📊 Reporte Diario ABIS - DD/MM/AAAA").

## 3. Chequeo rápido de salud (2 minutos)

1. **¿El servidor web responde?**
   ```powershell
   curl http://localhost:3000/health
   ```
   Debería devolver `{"status":"ok","db":"connected"}`. Si da error de conexión, el servidor
   Express no está corriendo (`npm start` para levantarlo) — pero esto **no** afecta al reporte
   diario automático, que no depende del servidor web (ver sección 5).

2. **¿La base de datos está arriba?**
   ```powershell
   Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue
   ```
   Si no muestra nada, está caída — ver sección 6.

3. **¿La tarea programada existe y está activa?**
   ```powershell
   Get-ScheduledTask -TaskName "ABIS-FlujoDiario"
   ```
   `State: Ready` significa que está esperando su próximo horario. Si da "no encontrado", no hay
   ninguna tarea registrada — ver `docs/sprints/AVANCE_SPRINT7.md` para el comando de registro.

4. **¿Qué pasó en la última corrida?**
   ```powershell
   Get-Content logs\flujo-diario.log -Tail 20
   ```

## 4. No llegó el reporte de hoy — ¿qué reviso?

En este orden:

1. **¿Llegó alguna alerta en su lugar?** Si el mensaje empieza con "⚠️ Alerta - Carga diaria
   ABIS", el sistema sí corrió pero encontró un problema — el mensaje explica cuál (Excel vacío,
   cabeceras inválidas, archivo corrupto). Solucionar la causa y correr el flujo a mano (sección 7)
   para ese día.

2. **¿No llegó ni reporte ni alerta?** El problema pasó antes de que el sistema llegara siquiera a
   intentar avisar por Telegram. Revisar, en orden:
   - `logs\flujo-diario.log` — si está vacío o no existe, la tarea programada no llegó a correr
     (ver punto 3 de la sección 3: ¿existe la tarea? ¿la PC estaba prendida y con sesión iniciada
     a esa hora?).
   - Si el log tiene un error de conexión a la base, ver sección 6.
   - Si el log tiene un error de Telegram (`Telegram API: ...`), el token pudo vencer o el bot fue
     bloqueado — revisar `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` en `.env`.

## 5. Diferencia entre el servidor web y el flujo diario

Son dos cosas independientes:

- **`npm start`** levanta el servidor Express (`/health`, `/reporte-diario`) — solo hace falta si
  alguien quiere consultar el reporte por HTTP a demanda. **No** es necesario para que el reporte
  diario automático funcione.
- **La tarea programada** (`ABIS-FlujoDiario`) corre `flujo-diario.js` directamente con `node`,
  sin pasar por el servidor Express. Es el proceso que efectivamente manda el reporte todos los
  días.

Si el servidor web está caído, el reporte diario automático **sigue funcionando igual**.

## 6. La base de datos no responde

Ver la sección "Solución de problemas comunes" en el `README.md` del repositorio — ahí está el
detalle completo (por qué se cae, cómo reiniciarla sin que vuelva a caerse). Resumen rápido:

```powershell
powershell -File "C:\Users\Nicolás\pgdata-abis-5433\ensure-running.ps1"
```

## 7. Correr el flujo diario a mano (para un día puntual)

Si automáticamente no corrió (o corrió con el archivo equivocado), se puede repetir a mano con el
Excel correcto:

```powershell
npm run flujo-diario -- "C:\ruta\al\excel_del_dia.xlsx"
```

Esto inserta los datos en la base **y** manda el reporte por Telegram — no hace falta correr nada
más aparte.

## 8. Dónde está todo

| Qué | Dónde |
|---|---|
| Código del proyecto | `C:\Users\Nicolás\Desktop\sistema-abis` |
| Credenciales (BD, Telegram) | `.env` en la raíz del proyecto (no está en git) |
| Datos de PostgreSQL | `C:\Users\Nicolás\pgdata-abis-5433` |
| Log de PostgreSQL | `C:\Users\Nicolás\pgdata-abis-5433\server.log` |
| Log del flujo diario | `logs\flujo-diario.log` (dentro del proyecto) |
| Documentación técnica completa | `docs\` dentro del proyecto (`CLAUDE.md` en la raíz para contexto de desarrollo) |

## 9. Limitaciones conocidas (a resolver antes de producción real)

- Este documento describe el entorno de **desarrollo**, no un servidor de producción — no existe
  todavía una máquina productiva separada. Ver `docs/sprints/AVANCE_SPRINT9.md` para el checklist
  de qué falta definir para un despliegue real.
- La tarea programada requiere que la PC esté encendida y con la sesión de usuario iniciada a la
  hora configurada — no es un servicio de Windows (ver `README.md`, sección de PostgreSQL, para
  el porqué de esa limitación en esta máquina).
- No hay todavía una ruta real de "carpeta de llegada" del Excel diario desde el sistema origen —
  la tarea programada, cuando se registre para uso real, tiene que apuntar a esa ruta en vez del
  archivo de prueba.
