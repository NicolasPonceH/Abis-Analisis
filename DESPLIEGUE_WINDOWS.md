# Despliegue de ABIS y SIAD en Windows Server

Esta guía prepara la operación de ambos módulos en un servidor Windows. No reemplaza la configuración del servidor institucional, sus reglas de red ni la gestión de credenciales.

## Arquitectura recomendada

- PostgreSQL, SIAD y ABIS se ejecutan en el servidor o en servidores privados accesibles desde él.
- ABIS corre como un único servicio Node.js y atiende en el puerto interno `3000`.
- SIAD corre como un servicio de Windows independiente, con Waitress en `127.0.0.1:5001`.
- Una tarea supervisora comprueba periódicamente SIAD y reinicia solo ese servicio tras tres fallos consecutivos.
- Un proxy HTTPS institucional (por ejemplo, IIS) publica el sitio. Los puertos `3000`, `5001` y el puerto PostgreSQL no se publican a Internet.
- El programador de reportes se inicia dentro de ABIS. Por eso se mantiene una sola instancia ABIS.

## Configuración

Definir las variables de entorno en el contexto de los servicios de Windows, con permisos de lectura restringidos a la cuenta de servicio. No copiar `.env`, `.env.local` ni archivos `.env` de `siad` desde el computador de desarrollo.

ABIS necesita al menos:

- `NODE_ENV=production`
- `PORT=3000`
- `SECRET_KEY`: secreto largo, aleatorio y exclusivo de producción.
- `DATABASE_URL`: conexión a PostgreSQL con un rol de aplicación de privilegios limitados.
- `ENCRYPTION_KEY`: clave de 64 caracteres hexadecimales. Mantenerla respaldada de forma segura; cambiarla puede impedir descifrar datos existentes.
- `ENABLE_SIAD=false`
- `SIAD_URL=http://127.0.0.1:5001`
- `ENABLE_TELEGRAM_BOT=false`, salvo que se haya configurado y aprobado su uso.

Con `ENABLE_SIAD=false`, ABIS no crea ni detiene un proceso SIAD: Windows administra SIAD por separado. Esto permite que SIAD se reinicie sin bajar ABIS.

SIAD también necesita `SECRET_KEY` y `DATABASE_URL`. Antes de inicializar una base nueva, establecer `ADMIN_INITIAL_PASSWORD` con una contraseña temporal segura y cambiarla al primer ingreso. No desplegar con las credenciales de desarrollo.

## Comandos de inicio

Registrar SIAD como servicio de Windows con directorio de trabajo `siad` y este comando:

```powershell
siad\.venv\Scripts\waitress-serve.exe --listen=127.0.0.1:5001 app:app
```

Configurar el servicio ABIS con directorio de trabajo en la raíz del repositorio y este comando:

```powershell
node src/server.js
```

Configurar ambos servicios para iniciar automáticamente con Windows. PostgreSQL debe iniciar primero; SIAD y luego ABIS. Usar la recuperación automática del administrador de servicios si cualquiera de los procesos termina inesperadamente. Confirmar que cada cuenta de servicio tenga solo los permisos de escritura que necesita.

El archivo `siad/scripts/run_production.bat` existente escucha en `0.0.0.0:5000`; no usarlo sin ajustarlo. ABIS espera SIAD en loopback, puerto `5001`.

## Reinicio automático si SIAD deja de responder

SIAD expone dos rutas locales:

- `http://127.0.0.1:5001/health/live`: responde si el proceso puede atender una solicitud. El supervisor usa esta ruta.
- `http://127.0.0.1:5001/health/ready`: informa si SIAD puede conectarse a PostgreSQL. Una caída de PostgreSQL se reporta como no disponible, pero no provoca reinicios repetidos de SIAD.

Crear en el Programador de tareas una tarea llamada, por ejemplo, `SIAD Watchdog`:

1. Disparador: al iniciar el servidor.
2. Acción: iniciar `powershell.exe` con argumentos:

   ```text
   -NoProfile -File "C:\ruta\sistema-abis\siad\scripts\watchdog.ps1" -SiadServiceName "SIAD"
   ```

3. Ejecutar con una cuenta autorizada para consultar y reiniciar el servicio SIAD, con privilegios suficientes para esa acción.
4. Configurar la tarea para no iniciar una segunda copia si ya está ejecutándose y para reiniciarse si el propio supervisor termina.

El script espera 120 segundos al iniciar para permitir que SIAD cargue spaCy, revisa cada 15 segundos, espera hasta 5 segundos por respuesta y reinicia SIAD tras 3 fallos seguidos. Después de un reinicio, espera otros 120 segundos antes de volver a evaluar. Registra los reinicios en `logs/siad-watchdog.log`. El valor `SIAD` debe coincidir con el **nombre de servicio** configurado en Windows, no necesariamente con su nombre visible.

## Proxy, red y operación

- Configurar el proxy HTTPS para enviar las solicitudes de usuarios a ABIS. ABIS deriva `/analisis` a SIAD.
- Habilitar el reenvío de protocolo HTTPS para que las cookies de sesión queden protegidas.
- Abrir desde la red de usuarios solo HTTPS. Restringir `3000`, `5001` y PostgreSQL al propio servidor o a la red privada necesaria.
- Supervisar `https://<dominio>/health` para ABIS y `http://127.0.0.1:5001/health/ready` para SIAD/PostgreSQL.
- Hacer respaldos periódicos de PostgreSQL y de `siad/static/uploads`, `siad/static/extracted`, `siad/static/summaries`, `siad/static/entities` y `siad/static/exports`. Proteger los respaldos con controles equivalentes a los datos originales.
- Revisar registros de ABIS, SIAD, PostgreSQL y del proxy. Probar primero restauración y acceso en un entorno de prueba.
- Mantener una sola instancia de ABIS: cada proceso inicia su propio programador y podría enviar reportes duplicados. Para alta disponibilidad habría que separar el programador o agregar un mecanismo distribuido de exclusión mutua.

## Puesta en marcha gradual

1. Preparar el servidor de prueba, PostgreSQL, runtime de Node/Python, Tesseract y dependencias de SIAD.
2. Configurar variables, servicios y tarea supervisora con datos de prueba; verificar el inicio y la recuperación de SIAD.
3. Probar login, carga y procesamiento de documentos, reportes, exportaciones y la ruta Oracle/Telegram solo si se van a habilitar.
4. Configurar proxy HTTPS, firewall, respaldos y monitoreo.
5. Con la validación institucional, migrar los datos y archivos requeridos al entorno productivo.

No publicar el repositorio, archivos `.env`, respaldos ni documentos cargados en repositorios o servicios públicos.
