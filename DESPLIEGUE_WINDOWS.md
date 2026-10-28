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
- `HOST=auto`: Detecta automáticamente la IP institucional del servidor (`172.25.7.79`) y habilita modo dual (Localhost + Red Institucional). Si la interfaz no está activa, opera automáticamente en `127.0.0.1` (localhost).
- `PORT=3000`: Puerto base. Si está ocupado, el sistema busca y asigna automáticamente el siguiente puerto libre (3001, 3002...).
- `SECRET_KEY`: secreto largo, aleatorio y exclusivo de producción.
- `DATABASE_URL`: conexión a PostgreSQL con un rol de aplicación de privilegios limitados.
- `ENCRYPTION_KEY`: clave de 64 caracteres hexadecimales. Mantenerla respaldada de forma segura; cambiarla puede impedir descifrar datos existentes.
- `ENABLE_SIAD=false`
- `SIAD_URL=http://127.0.0.1:5001`
- `ENABLE_TELEGRAM_BOT=false`, salvo que se haya configurado y aprobado su uso.

## Configuración de Red Institucional (IP Estática 172.25.7.79 y Puerto Dinámico)

### 1. Servidor Asignado: IP `172.25.7.79` y Aislamiento de Red
- **IP Institucional del Servidor**: `172.25.7.79` (Segmento institucional privado `172.16.0.0/12`).
- **Enlace Dual Automático**:
  - **Estación 1 (Servidor Local)**: Acceso por `http://localhost:3000` (o el puerto auto-asignado).
  - **Estación 2 (Estación remota en red institucional)**: Acceso por `http://172.25.7.79:3000`.
- **Fallback a Localhost**: Si el sistema se arranca antes de conectar el cable Ethernet o en entorno de pruebas donde `172.25.7.79` no esté activa, Node.js cae limpiamente a `localhost` (`127.0.0.1`) sin fallos de `EADDRNOTAVAIL`.
- **Búsqueda Automática de Puerto Libre**: Si el puerto `3000` está ocupado por otro proceso o servicio, el sistema no se detiene; explora y toma el siguiente puerto libre disponible (`3001`, `3002`, etc.) e informa en consola la URL exacta de acceso.
- **Protección contra escaneos en `192.168.x.x`**: El servidor **no** escucha en `0.0.0.0`. Cualquier escaneo desde redes Wi-Fi, no autorizadas o comerciales (`192.168.x.x`) verá los puertos cerrados.

### 2. Configurar la interfaz Ethernet en Windows Server
1. Abrir `ncpa.cpl` (Conexiones de red).
2. Clic derecho en el adaptador Ethernet institucional -> **Propiedades**.
3. Seleccionar **Protocolo de Internet versión 4 (TCP/IPv4)** -> **Propiedades**.
4. Seleccionar **Usar la siguiente dirección IP**:
   - **Dirección IP**: `172.25.7.79`
   - **Máscara de subred**: provista por TI (típicamente `255.255.255.0` o `255.255.0.0`).
   - **Puerta de enlace predeterminada**: IP del router institucional del segmento `172.25.7.x`.
   - **Servidores DNS**: IPs de los DNS internos institucionales.
5. Deshabilitar adaptadores Wi-Fi o interfaces secundarias no autorizadas.

### 3. Configuración de PostgreSQL (Base de Datos)
> [!IMPORTANT]
> **Norma de Seguridad de Red:** El puerto de PostgreSQL debe estar configurado **estrictamente por encima de 6000** (estándar recomendado: `6432` de PgBouncer / PostgreSQL reforzado).
> **PROHIBICIÓN:** NUNCA usar el puerto por defecto `5432`, ni puertos web como `8080` u `8000` (ya que colisionan con servicios HTTP, activan alertas de proxy y facilitan escaneos).

- **Si PostgreSQL corre en el mismo Windows Server**:
  - En `postgresql.conf` (`C:\Program Files\PostgreSQL\<version>\data\postgresql.conf`):
    ```ini
    listen_addresses = 'localhost' # O '127.0.0.1' (nunca '*' ni 0.0.0.0)
    port = 6432                   # Puerto arriba de 6000 (no 5432, 8080 ni 8000)
    ```
  - En `DATABASE_URL` (`.env`):
    ```env
    DATABASE_URL=postgresql://abis_app:password@127.0.0.1:6432/sistema_abis
    ```
  - De esta forma, el motor de base de datos solo acepta conexiones internas loopback y el puerto `6432` es completamente invisible para la red externa.

- **Si PostgreSQL está en otro servidor de la red institucional (172.x)**:
  - En el servidor de base de datos (`postgresql.conf`):
    ```ini
    listen_addresses = '172.X.Y.DB_IP, localhost'
    port = 6432
    ```
  - En `pg_hba.conf` del servidor de base de datos (permitir únicamente la IP estática del servidor de aplicación):
    ```text
    host  sistema_abis  abis_app  172.X.Y.APP_IP/32  scram-sha-256
    ```
  - En `DATABASE_URL` del servidor de aplicación:
    ```env
    DATABASE_URL=postgresql://abis_app:password@172.X.Y.DB_IP:6432/sistema_abis
    ```

### 4. Reglas del Firewall de Windows (`wf.msc`)
Ejecutar en PowerShell como Administrador para bloquear puertos sensibles desde redes no autorizadas y abrir solo los necesarios:

```powershell
# Bloquear puertos por defecto y puertos web de escaneo (5432, 5433, 8000, 8080)
New-NetFirewallRule -DisplayName "Bloquear Puertos Inseguros y Default" -Direction Inbound -LocalPort 5432,5433,8000,8080 -Protocol TCP -Action Block -Profile Any
New-NetFirewallRule -DisplayName "Bloquear SIAD Interno" -Direction Inbound -LocalPort 5001 -Protocol TCP -Action Block -Profile Any

# Si la DB está en este servidor y debe atender a otra estación en red 172.x:
# New-NetFirewallRule -DisplayName "PostgreSQL Institucional 6432" -Direction Inbound -LocalPort 6432 -Protocol TCP -Action Allow -RemoteAddress 172.16.0.0/12 -Profile Domain,Private

# Si se usa IIS (Proxy HTTPS), abrir solo el puerto 443 desde la red institucional
New-NetFirewallRule -DisplayName "ABIS HTTPS Institucional" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow -RemoteAddress 172.16.0.0/12 -Profile Domain,Private
```

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
