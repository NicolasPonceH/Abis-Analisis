# Plan de despliegue — Sistema ABIS

Runbook para el pase a producción real. Complementa
[`MANUAL_OPERACION.md`](MANUAL_OPERACION.md) (cómo operar el sistema ya desplegado) y el
checklist de [`AVANCE_SPRINT9.md`](sprints/AVANCE_SPRINT9.md) (qué faltaba definir).

## 1. Estado al cierre del Sprint 10

Todo lo siguiente está implementado y verificado en la máquina de desarrollo — ver el detalle en
cada `docs/sprints/AVANCE_SPRINT{N}.md`:

- [x] Esquema de base de datos normalizado, con índices para las consultas de reporte.
- [x] Lectura y validación de Excel, con tolerancia a errores de tipeo menores.
- [x] Inserción transaccional por lotes (probada con 95.000 registros sintéticos).
- [x] Vistas SQL y endpoint `GET /reporte-diario` con los 5 desgloses que pide el informe (Unidad,
      Cuartel, Nacionalidad, Edad, Género).
- [x] Bot de Telegram, cliente HTTP, template del mensaje, con límites de tamaño de mensaje
      manejados.
- [x] Flujo diario completo (Excel → ETL → BD → Telegram) en un solo comando, con manejo de
      excepciones (no falla en silencio).
- [x] Rol de base de datos con privilegios mínimos (`abis_app`), probado positiva y
      negativamente.
- [x] Manual de operación para el día a día.

## 2. Prerrequisitos pendientes (bloquean el pase a producción real)

Ninguno de estos puede resolverse solo con código — son decisiones/insumos externos al proyecto:

| # | Qué falta | Quién lo define |
|---|---|---|
| 1 | Máquina/servidor de producción (con permisos de administrador, para poder registrar PostgreSQL y la tarea diaria como servicios reales de Windows, no procesos manuales) | Área de infraestructura/TI |
| 2 | Ruta o mecanismo real de dónde el sistema origen deja el Excel diario | Equipo dueño de "la otra base de datos" mencionada en el informe de requerimientos |
| 3 | Bot de Telegram de producción (no `@AbisSystemBot`, que es de pruebas) y el grupo/canal real de destino | Quien vaya a recibir los reportes |
| 4 | Catálogos institucionales reales (nacionalidades, regiones, unidades, cuarteles) reemplazando `db/seed_catalogos.sql` | Área operativa que mantiene esos datos |
| 5 | Password real para el rol `abis_app` (hoy `db/hardening.sql` tiene un placeholder a propósito) | Quien despliegue, al aplicar el script |

## 3. Procedimiento de despliegue (una vez resueltos los prerrequisitos)

1. Clonar el repositorio en el servidor de producción:
   ```bash
   git clone https://github.com/NicolasPonceH/Sistema_ABIS.git
   cd Sistema_ABIS
   git checkout v1.0.0
   npm install
   ```
2. Configurar PostgreSQL en el servidor (ver `README.md` para el detalle de cómo se hizo en esta
   máquina de desarrollo — en un servidor con permisos de administrador, preferir un servicio de
   Windows real en vez del proceso manual que se usó acá).
3. Copiar `.env.example` a `.env` y completar con las credenciales reales (`DATABASE_URL` con el
   rol `abis_app`, `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` del bot de producción).
4. Aplicar el esquema completo:
   ```bash
   npm run db:schema
   npm run db:views
   npm run db:hardening   # editar antes la password placeholder en db/hardening.sql
   ```
5. Cargar los catálogos institucionales reales (reemplazando `db/seed_catalogos.sql` por el
   listado real, o un script equivalente).
6. Registrar la tarea programada apuntando a la ruta real del Excel diario (ver el comando en
   [`AVANCE_SPRINT7.md`](sprints/AVANCE_SPRINT7.md), actualizado con logging en el addendum de
   Sprint 9) — o, si el servidor tiene permisos de administrador, registrarla como tarea a nivel
   de sistema en vez de usuario.
7. **Marcha blanca**: dejar correr el sistema con datos reales durante unos días, revisando cada
   mañana que el reporte de Telegram llegó y que los números tienen sentido comparados con el
   Excel de ese día a simple vista (esto es literalmente lo que pide la sección de QA del informe
   de requerimientos — "validación de las métricas de Telegram vs. Excel manual" — pero con datos
   reales en vez de los fixtures de prueba usados en el Sprint 8).

## 4. Si algo falla durante la marcha blanca

- Revisar `logs/flujo-diario.log` y el chat de Telegram (las alertas de error explican la causa
  más común — ver sección 4 de `MANUAL_OPERACION.md`).
- El flujo no es destructivo: nunca hace `UPDATE`/`DELETE` sobre `registro_enrolamiento` (el rol
  `abis_app` ni siquiera tiene permiso), así que un reintento manual del mismo día
  (`npm run flujo-diario -- <excel del dia>`) no corrompe nada — en el peor caso, duplica filas si
  el Excel ya se había cargado antes ese día (no hay una restricción de unicidad por fecha en el
  esquema — algo a tener en cuenta si se repite una carga).
- Para desactivar temporalmente sin desinstalar nada: `Disable-ScheduledTask -TaskName
  "ABIS-FlujoDiario"`.

## 5. Cómo mantenerlo actualizado

Este documento asume el estado del proyecto al cierre del Sprint 10 (`v1.0.0`). Si se agregan
funcionalidades después de la entrega, actualizar la sección 1; si se resuelve alguno de los
prerrequisitos de la sección 2, tacharlo y anotar cómo quedó resuelto.
