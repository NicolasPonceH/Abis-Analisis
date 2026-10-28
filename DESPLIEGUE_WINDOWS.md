# Despliegue de ABIS y SIAD en Windows Server

Esta guía prepara la operación de ambos módulos en un servidor Windows. No reemplaza la configuración del servidor institucional, sus reglas de red ni la gestión de credenciales.

## Arquitectura recomendada

- PostgreSQL, SIAD y ABIS se ejecutan en el servidor o en servidores privados accesibles desde él.
- ABIS corre como un único servicio Node.js. Prueba `PORT` y los siguientes `PORT_SEARCH_LIMIT` puertos si el primero está ocupado.
- SIAD corre como un servicio de Windows independiente, con Waitress en `127.0.0.1:5001`.
- Una tarea supervisora comprueba periódicamente SIAD y reinicia solo ese servicio tras tres fallos consecutivos.
- Un proxy HTTPS institucional (por ejemplo, IIS) publica el sitio. Los puertos de aplicación y PostgreSQL no se publican a Internet.
- El programador de reportes se inicia dentro de ABIS. Por eso se mantiene una sola instancia ABIS.

## Configuración

Definir las variables de entorno en el contexto de los servicios de Windows, con permisos de lectura restringidos a la cuenta de servicio. No copiar `.env`, `.env.local` ni archivos `.env` de `siad` desde el computador de desarrollo.

ABIS necesita al menos:

- `NODE_ENV=production`
- `HOST=172.25.7.79`: IP institucional asignada por TI. Si no está activa al arrancar, ABIS opera en `127.0.0.1` (localhost), accesible solo desde el servidor.
- `PORT=3000` y `PORT_SEARCH_LIMIT=50`: Puerto base y cantidad de puertos siguientes a probar si está ocupado. Si no encuentra ninguno en la IP institucional, intenta el mismo rango en localhost. Si tampoco encuentra uno, termina con error para que el administrador de servicios pueda recuperarlo.
- `SECRET_KEY`: secreto largo, aleatorio y exclusivo de producción.
- `DATABASE_URL`: conexión a PostgreSQL con un rol de aplicación de privilegios limitados.
- `ENCRYPTION_KEY`: clave de 64 caracteres hexadecimales. Mantenerla respaldada de forma segura; cambiarla puede impedir descifrar datos existentes.
- `ENABLE_SIAD=false`
- `SIAD_URL=http://127.0.0.1:5001`
- `ENABLE_TELEGRAM_BOT=false`, salvo que se haya configurado y aprobado su uso.

## Configuración de Red Institucional (IP asignada por TI y puerto web)

### 1. Servidor Asignado: IP `172.25.7.79` y Aislamiento de Red
- TI asignó `172.25.7.79`. Confirma que la IP, máscara, gateway, VLAN y DNS estén configurados por TI en la interfaz Ethernet antes de iniciar los servicios.
- Al iniciar, ABIS muestra en consola la IP y puerto elegidos. La URL remota queda como `http://172.25.7.79:<puerto_elegido>` mientras no se configure HTTPS/DNS.
- Si la IP no está disponible, ABIS cae a `127.0.0.1`; eso sirve para diagnóstico local, pero ninguna otra estación podrá entrar.
- Si el puerto base está ocupado, ABIS prueba puertos siguientes. El firewall institucional y el de Windows deben autorizar el puerto o rango acordado desde las redes de usuarios.
- Enlazar a una IP concreta reduce interfaces expuestas, pero **no** reemplaza el firewall. La posibilidad de llegar desde otra VLAN o segmento depende del enrutamiento y de las ACL/reglas institucionales.
- Si se utiliza IIS como proxy HTTPS, acuerda con TI un puerto backend fijo. Un proxy configurado con un puerto estático no seguirá automáticamente a ABIS si este cambia a otro puerto.

### 2. Configurar la interfaz Ethernet
TI debe aplicar o reservar `172.25.7.79` y entregar máscara, gateway, DNS y VLAN. No configures esos valores a mano suponiendo una máscara o router: una IP duplicada o gateway incorrecto puede dejar el servidor fuera de la red. No deshabilites otras interfaces sin autorización de TI.

### 3. Configuración de PostgreSQL (Base de Datos)
> [!IMPORTANT]
> **Norma informada por TI:** El puerto de PostgreSQL debe estar por encima de 6000. El número exacto lo debe asignar/confirmar TI; `6432` que aparece abajo es solo un ejemplo y suele usarse también para PgBouncer, no presupone que exista ese servicio.
> **No elegir el número por su cuenta:** confirmar con TI el puerto real configurado en PostgreSQL. Los puertos de la base y de la web son independientes.

- **Si PostgreSQL corre en el mismo Windows Server**:
  - En `postgresql.conf` (`C:\Program Files\PostgreSQL\<version>\data\postgresql.conf`):
    ```ini
    listen_addresses = 'localhost' # O '127.0.0.1' (nunca '*' ni 0.0.0.0)
    port = 6432                   # SOLO ejemplo: reemplazar por el puerto confirmado por TI
    ```
  - En `DATABASE_URL` (`.env`):
    ```env
    DATABASE_URL=postgresql://abis_app:password@127.0.0.1:6432/sistema_abis
    ```
  - Reemplazar `6432` por el puerto confirmado y la base por el nombre que se vaya a usar. Así PostgreSQL escucha solo en loopback y las estaciones de usuario no necesitan llegar a su puerto.

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
TI debe permitir desde la **subred de usuarios que indique la institución**, no desde todo el rango privado `172.16.0.0/12` por defecto. Si el acceso es directo a ABIS, permitir solo el rango web acordado (`PORT` hasta `PORT + PORT_SEARCH_LIMIT`). Si IIS publica HTTPS, permitir `443` desde los usuarios y dejar el puerto backend accesible solo desde el servidor/proxy. SIAD (`5001`) y PostgreSQL deben quedar en loopback; no crear reglas de entrada para ellos.

Con `ENABLE_SIAD=false`, ABIS no crea ni detiene un proceso SIAD: Windows administra SIAD por separado. Esto permite que SIAD se reinicie sin bajar ABIS.

SIAD también necesita `SECRET_KEY` y `DATABASE_URL`. Antes de inicializar una base nueva, establecer `ADMIN_INITIAL_PASSWORD` con una contraseña temporal segura y cambiarla al primer ingreso. No desplegar con las credenciales de desarrollo.

Para generar secretos aleatorios en el servidor (ejecutar dos veces y guardar cada valor en su variable correspondiente):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

No regenerar `ENCRYPTION_KEY` al migrar información cifrada: se necesita la clave original para poder descifrarla.

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

`siad/scripts/run_production.bat` inicia Waitress en `127.0.0.1:5001`, igual que la URL que usa ABIS. El servicio independiente debe arrancar desde el directorio `siad` y recibir las variables de entorno de producción.

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
- Abrir desde la red de usuarios solo HTTPS. Restringir el puerto backend de ABIS, `5001` y PostgreSQL al propio servidor o a la red estrictamente necesaria.
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
