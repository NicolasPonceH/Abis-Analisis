@echo off
REM Arranque en produccion (Sprint 10): servidor WSGI real (waitress), no el servidor
REM de desarrollo de Flask. Pensado para usarse como accion de una tarea programada de
REM Windows (Task Scheduler) que arranque al iniciar el equipo -- ver docs/DEPLOYMENT.md.
REM
REM Requiere que SECRET_KEY, DB_PASSWORD (si no es el de desarrollo) y el resto de
REM variables de entorno de produccion ya esten configuradas en el sistema (setx), no
REM se hardcodean aqui para no dejar secretos en un archivo versionado.

setlocal
cd /d "%~dp0.."

if not defined FLASK_DEBUG set FLASK_DEBUG=0

".venv\Scripts\waitress-serve.exe" --listen=0.0.0.0:5000 app:app

endlocal
