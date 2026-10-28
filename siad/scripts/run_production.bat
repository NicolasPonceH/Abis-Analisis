@echo off
REM Arranque en produccion (Sprint 10): servidor WSGI real (waitress), no el servidor
REM de desarrollo de Flask. SIAD queda aislado en loopback; los usuarios llegan a el
REM mediante el proxy de ABIS en /analisis.
REM
REM Requiere que SECRET_KEY, DATABASE_URL (o DB_PASSWORD/DB_HOST/DB_PORT/DB_NAME) y el resto de
REM variables de entorno de produccion ya esten configuradas en el sistema (setx), no
REM se hardcodean aqui para no dejar secretos en un archivo versionado.

setlocal
cd /d "%~dp0.."

if not defined FLASK_DEBUG set FLASK_DEBUG=0

".venv\Scripts\waitress-serve.exe" --listen=127.0.0.1:5001 --threads=8 app:app

endlocal
