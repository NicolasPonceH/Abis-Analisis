# Despliegue on-premise

Guía técnica para instalar el sistema en el equipo/servidor de producción, dentro de la red
local de la institución — el NFR del [SRS](SRS.md) pide "ejecución preferentemente on-premise",
así que este documento asume una máquina Windows en la LAN, sin exposición a internet, igual
que el entorno de desarrollo usado durante los 10 sprints.

## 1. Requisitos previos

Los mismos que para desarrollo (ver [README.md](../README.md#requisitos)): Python 3.10+,
Tesseract OCR + modelo en español, PostgreSQL con un rol dedicado, y

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

`requirements.txt` ya incluye `waitress`, el servidor WSGI de producción (ver sección 2).

## 2. Servidor de aplicaciones: por qué no `python app.py`

`python app.py` usa el servidor de desarrollo integrado de Flask/Werkzeug — de un solo hilo,
sin hardening, y la propia librería advierte en el arranque que no es apto para producción.

Para producción se usa **waitress**: un servidor WSGI puro Python, sin dependencias nativas que
compilar, y que corre igual de bien en Windows que en Linux — encaja con el resto del stack de
este proyecto (Tesseract y PostgreSQL también se instalaron vía `winget` en Windows). Se
descartó `gunicorn` porque no soporta Windows de forma nativa.

```bash
.venv\Scripts\waitress-serve.exe --listen=0.0.0.0:5000 app:app
```

`scripts/run_production.bat` envuelve ese comando (fija el directorio de trabajo, valida que
`FLASK_DEBUG` no quede encendido) para usarlo como acción de una tarea programada — ver
sección 5.

## 3. Variables de entorno de producción (checklist obligatorio)

Ningún valor de desarrollo debe llegar a producción tal cual. Configúralos como variables de
entorno permanentes del sistema (`setx NOMBRE "valor"` desde una consola, o Panel de
Control → Sistema → Variables de entorno) **antes** del primer arranque:

| Variable | Por qué cambiarla |
|---|---|
| `SECRET_KEY` | Firma las sesiones de Flask. El valor por defecto (`dev-only-secret`) está en el código fuente público del repo — cualquiera que lo lea puede falsificar sesiones. Generar uno nuevo: `python -c "import secrets; print(secrets.token_hex(32))"`. |
| `APP_PASSWORD` | Clave única para entrar al sistema (control de acceso, NFR del SRS — ver sección 4). El valor por defecto (`dev-only-password`) está en el código fuente. |
| `DB_PASSWORD` (y `DB_USER`/`DB_NAME`/`DB_HOST`/`DB_PORT` si aplica) | El valor por defecto en `db.py` es el que se usó durante todo el desarrollo. Cambiar la contraseña del rol en PostgreSQL (`ALTER ROLE sistema_analisis WITH PASSWORD '...'`) y reflejar el nuevo valor acá. |
| `FLASK_DEBUG` | Debe **no** estar definida, o valer `0`. Ya es el default desde Sprint 9, pero confirmar explícitamente — con `FLASK_DEBUG=1` el depurador interactivo de Werkzeug permite ejecutar código arbitrario desde el navegador. |
| `TESSERACT_CMD` / `TESSDATA_DIR` | Solo si la instalación de Tesseract en el servidor de producción no quedó en la ruta por defecto de `winget`. |

Si el servicio (waitress o la tarea de respaldo) corre bajo una cuenta que no sea la del
usuario que configuró estas variables con `setx` (por ejemplo, una tarea programada como
`SYSTEM`), hay que definirlas a **nivel de sistema**, no de usuario: `setx NOMBRE "valor" /M`
(requiere PowerShell como administrador), o Panel de Control → Variables de entorno →
"Variables del sistema" en vez de "Variables de usuario".

## 4. Control de acceso

El NFR de seguridad del SRS pide "control de acceso" además de la ejecución on-premise. La base
de datos ya lo cumple a su nivel (rol dedicado `sistema_analisis`, no el superusuario), pero
hasta que se agregó esto, la aplicación web en sí no tenía ninguna barrera: cualquiera que
llegara a la URL podía subir documentos y ver el historial completo sin autenticarse.

Se agregó una **clave única compartida** (no cuentas individuales por operador): un
`@app.before_request` en `app.py` bloquea toda ruta salvo `/login` y los archivos estáticos
(`static`, necesario para que el logo cargue en la propia pantalla de login), redirigiendo a
`/login?next=<ruta original>` si no hay sesión iniciada. Se eligió una clave única y no cuentas
individuales porque el resto del proyecto no maneja usuarios — agregar una tabla de cuentas,
hashes de contraseña y gestión de altas/bajas es una complejidad que nadie pidió todavía; si en
el futuro hace falta saber *quién* guardó cada documento, es el momento de revisar esta
decisión.

La comparación de la clave usa `hmac.compare_digest` (no `==`) para no filtrar por temporización
cuánto de la clave escrita coincide con la real.

## 5. Arranque automático (Task Scheduler)

Para que el sistema quede arriba después de un reinicio del servidor sin intervención manual.
Comando para registrar la tarea (PowerShell, **no** requiere permisos de administrador):

```powershell
$python = "C:\ruta\al\proyecto\.venv\Scripts\python.exe"
$app    = "C:\ruta\al\proyecto\scripts\run_production.bat"
$action  = New-ScheduledTaskAction -Execute $app -WorkingDirectory "C:\ruta\al\proyecto"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName "SIAD - Servidor" -Action $action -Trigger $trigger -Settings $settings -Force
```

Esto registra la tarea para que arranque **cuando el usuario inicia sesión** — no requiere
guardar una contraseña ni privilegios de administrador, pero por eso mismo solo dispara si
alguien efectivamente inicia sesión en el equipo (no sirve para un servidor headless que
arranca y se queda en la pantalla de login sin que nadie entre).

Para que corra **sin necesidad de que haya una sesión iniciada** (recomendado en un servidor
real, no un puesto de trabajo), hay que registrarla con credenciales guardadas o como cuenta de
sistema — esto **sí** requiere una consola PowerShell como administrador:

```powershell
# Ejecutar como administrador
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "SIAD - Servidor" -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $settings -Principal $principal -Force
```

Si se usa esta variante como `SYSTEM`, las variables de entorno de producción (sección 3) deben
quedar definidas a nivel de sistema (`setx ... /M`), no de usuario — `SYSTEM` no hereda las
variables de la cuenta que las configuró con un `setx` normal.

## 6. Respaldo de PostgreSQL en producción

`scripts/backup_db.py` (Sprint 9) ya está validado de punta a punta (backup + restore). La tarea
programada diaria se registra igual que la de arranque, apuntando al script en vez de al
servidor:

```powershell
$python = "C:\ruta\al\proyecto\.venv\Scripts\python.exe"
$script = "C:\ruta\al\proyecto\scripts\backup_db.py"
$action   = New-ScheduledTaskAction -Execute $python -Argument "`"$script`"" -WorkingDirectory "C:\ruta\al\proyecto"
$trigger  = New-ScheduledTaskTrigger -Daily -At 3:00AM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd
Register-ScheduledTask -TaskName "SIAD - Respaldo PostgreSQL" -Action $action -Trigger $trigger -Settings $settings -Force
```

Igual que en la sección 5: registrada así (sin `-Principal`), la tarea corre bajo el usuario que
la creó y **solo dispara si ese usuario tiene sesión iniciada** en el momento programado — se
probó en la máquina de desarrollo y, sin una sesión interactiva real, la tarea queda "en cola"
sin llegar a ejecutar el respaldo. Para un servidor de verdad, regístrala con
`-Principal (New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest)`
desde una consola de administrador, igual que en la sección 5.

Revisar periódicamente que `backups/` no crezca sin control (no hay rotación automática todavía
— limpieza manual o tarea adicional si el volumen lo justifica).

## 7. Red y firewall

- El servidor solo debe ser alcanzable dentro de la LAN institucional — no exponer el puerto
  5000 a internet (sin port-forwarding en el router/firewall perimetral).
- Regla de Firewall de Windows: permitir entrante TCP 5000 solo desde el rango de IPs de la
  subred local, no "Cualquier dirección".
- PostgreSQL (puerto configurado, `5434` en desarrollo) no necesita regla de entrada si la app
  y la base de datos corren en la misma máquina — solo el puerto de la app web debe abrirse a
  la red.

## 8. Marcha blanca — checklist antes de dar el sistema por operativo

- [ ] `python -m pytest` pasa completo contra la base de datos de pruebas del servidor de
      producción (no solo en la máquina de desarrollo).
- [ ] La app arranca con `scripts\run_production.bat` (o el comando de waitress directo) y
      responde desde **otra máquina de la red**, no solo `localhost`.
- [ ] Se confirma que `FLASK_DEBUG` no está en `1`: forzar un error y verificar que se ve el
      mensaje genérico del `errorhandler(500)`, no la traza interactiva de Werkzeug.
- [ ] `SECRET_KEY`, `APP_PASSWORD` y `DB_PASSWORD` en el servidor ya no son los valores de
      desarrollo del repo.
- [ ] Control de acceso probado: entrar sin sesión a cualquier ruta redirige a `/login`; una
      clave incorrecta se rechaza; la clave correcta entra y te devuelve a la página que
      pediste originalmente (no siempre al inicio).
- [ ] Flujo completo real desde un cliente de la red: subir un acta real → OCR → resumen →
      entidades → exportar a Word → guardar en historial → aparece en `/historial` y en
      `/estadisticas`.
- [ ] `python scripts/backup_db.py` corre manualmente una vez y genera el `.dump`; se restauró
      al menos una vez en una base de datos temporal para confirmar que el respaldo es usable
      (mismo procedimiento que en `docs/sprints/sprint-09.md`).
- [ ] Tarea programada de inicio automático **y** la del respaldo probadas de verdad (no solo
      registradas): confirmar que efectivamente corrieron (`Get-ScheduledTaskInfo -TaskName
      "..." | Select LastTaskResult` debe dar `0`, y en el caso del respaldo, que apareció un
      `.dump` nuevo en `backups/`) — no basta con que el estado diga "Ready".
- [ ] Regla de Firewall de Windows revisada (solo LAN, no expuesto a internet).

## 9. Entrega de código y cierre

- Repositorio: https://github.com/ashley-adaros/Sistema_analisis — tag `v1.0.0` es la entrega
  final del roadmap de 10 sprints.
- Punto de entrada para quien reciba el proyecto: [README.md](../README.md), que enlaza a toda
  la documentación técnica (`docs/SRS.md`, `docs/ROADMAP.md`, `docs/DIAGRAMS.md`,
  `docs/VERSIONING.md`, `docs/sprints/`, este archivo).
- Historial completo de decisiones y motivos por sprint en `docs/sprints/sprint-01.md` a
  `sprint-10.md` — no hace falta reconstruir el porqué de una decisión desde el código o los
  commits.
