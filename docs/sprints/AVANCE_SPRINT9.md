---
title: "Informe de Avance — Sprint 9"
subtitle: "Sistema de Gestión Automatizada de Identificación Biométrica (ABIS)"
---

**Proyecto:** Sistema ABIS
**Periodo del ciclo:** 13 de octubre de 2026 – 19 de octubre de 2026
**Fecha de presentación:** 21 de agosto de 2026

## 1. Objetivo del ciclo

Según la hoja de ruta del proyecto, el Sprint 9 tiene como objetivo **preparación para
producción**, con el siguiente entregable comprometido:

- Documentación técnica del código y manual de operación.
- Configuración del entorno de producción (servidor, variables de entorno).
- Hardening y seguridad de la base de datos y los scripts.

**Nota de alcance honesta**: no existe todavía una máquina de producción separada — todo el
proyecto se desarrolló y probó en esta máquina de desarrollo. Este sprint entrega lo que sí se
puede hacer sin esa máquina: el manual de operación, el hardening de la base (aplicable a
cualquier instancia, dev o prod), y un checklist de qué falta definir para el despliegue real
(Sprint 10).

## 2. Trabajo realizado

### 2.1. Manual de operación (`docs/MANUAL_OPERACION.md`)

Documento nuevo, distinto de `CLAUDE.md` (que es para desarrollo). Pensado para alguien que tenga
que operar el sistema día a día sin necesitar leer el código: qué esperar en operación normal, un
chequeo de salud de 2 minutos, qué hacer si no llegó el reporte de un día, cómo correrlo a mano
para un día puntual, y dónde está todo (rutas de logs, credenciales, datos de la BD).

### 2.2. Hardening de la base de datos (`db/hardening.sql`)

Hasta ahora toda la aplicación corría con el superusuario `postgres` — funcional en desarrollo,
pero no es una buena práctica para producción (un bug o una inyección SQL con ese usuario podría
borrar tablas enteras, no solo corromper datos). Se creó el rol `abis_app`, con privilegios
mínimos:

| Objeto | Permiso de `abis_app` |
|---|---|
| Catálogos (`nacionalidad`, `region`, `unidad`, `cuartel`, `equipo`, `estado_proceso`) | Solo `SELECT` |
| `registro_enrolamiento` | `SELECT` + `INSERT` (sin `UPDATE`/`DELETE`/DDL) |
| Vistas de reporte (`db/views.sql`) | Solo `SELECT` |

`npm run db:hardening` lo aplica (idempotente vía `DO`/`EXCEPTION`, se puede re-correr sin error).

**Auditoría adicional realizada**: se revisaron todas las consultas SQL del proyecto
(`src/**/*.js`) — todas usan parámetros (`$1`, `$2`, ...) en vez de concatenar texto, sin
excepciones. `npm audit` sigue en 0 vulnerabilidades (confirmado de nuevo desde Sprint 2).

### 2.3. Logging de la tarea programada

Al escribir el manual de operación se encontró que la tarea programada (Sprint 7) no guardaba su
salida de consola en ningún lado — si fallaba antes de llegar a notificar por Telegram, no había
forma de investigar la causa. Se corrigió agregando redirección a `logs/flujo-diario.log`
(carpeta nueva, gitignored). Ver el addendum en
[`AVANCE_SPRINT7.md`](AVANCE_SPRINT7.md#addendum-sprint-9-comando-actualizado-con-log-a-archivo)
con el comando actualizado.

### 2.4. Checklist de entorno de producción

No hay un servidor real todavía, así que esto queda como checklist para cuando exista, no como
trabajo ya hecho:

- [ ] Definir la máquina/servidor donde va a correr (Windows con permisos de administrador, para
      poder registrar PostgreSQL y la tarea diaria como servicios reales — ver la limitación
      documentada en `README.md` sobre esta máquina de desarrollo).
- [ ] Definir la ruta real donde el sistema origen deja el Excel diario.
- [ ] Crear el bot de Telegram de producción (no reusar `@AbisSystemBot`, que es el de pruebas) y
      el grupo/canal real de destino.
- [ ] Reemplazar los catálogos de ejemplo (`db/seed_catalogos.sql`) por el listado institucional
      real de nacionalidades, regiones, unidades y cuarteles.
- [ ] Usar el rol `abis_app` (2.2) para la `DATABASE_URL` de la aplicación en producción — reservar
      un rol con permisos de DDL solo para aplicar `schema.sql`/`views.sql`/`hardening.sql`.
- [ ] Cambiar el password de ejemplo de `abis_app` en `db/hardening.sql` antes de aplicarlo en
      producción (queda con un placeholder a propósito, no una contraseña real).

## 3. Estado del entregable

**Completo, con la salvedad explícita de 2.4**: el hardening y la documentación de operación
están hechos y verificados; la configuración del entorno de producción en sí queda como checklist
porque depende de decisiones (máquina, bot, catálogos reales) que no corresponden a este sprint
resolver solo.

## 4. Cómo reproducir esta verificación

Con la base de datos arriba:

**1. Aplicar el hardening:**

```powershell
npm run db:hardening
```

**2. Confirmar que el rol restringido puede hacer el flujo completo** (lectura de catálogos,
inserción, consulta de vistas, notificación):

```powershell
$env:DATABASE_URL = "postgresql://abis_app:CAMBIAR_ESTA_PASSWORD_EN_PRODUCCION@localhost:5433/abis_db"
npm run flujo-diario -- fixtures/enrolamiento_etl_prueba.xlsx
```

Salida esperada: `Resultado: reporte` / `Filas insertadas: 2` — igual que con el superusuario.

**3. Confirmar que el rol restringido NO puede hacer lo que no debería** (prueba negativa — sin
esto, no queda demostrado que el hardening realmente restringe algo):

```powershell
$env:PGPASSWORD = "CAMBIAR_ESTA_PASSWORD_EN_PRODUCCION"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U abis_app -d abis_db -c "DROP TABLE registro_enrolamiento;"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U abis_app -d abis_db -c "UPDATE registro_enrolamiento SET genero = 'X';"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U abis_app -d abis_db -c "DELETE FROM registro_enrolamiento;"
```

Salida esperada: los tres comandos fallan (`ERROR: debe ser dueño de la tabla` / `ERROR: permiso
denegado a la tabla`) — confirmado así en esta verificación.

**4. Confirmar la redirección de logs de la tarea programada** (sin registrar la tarea, solo el
mecanismo de redirección):

```powershell
cmd.exe /c "node.exe scripts\flujo-diario.js fixtures\enrolamiento_etl_prueba.xlsx >> logs\flujo-diario.log 2>&1"
Get-Content logs\flujo-diario.log
```

Salida esperada: el log contiene `Resultado: reporte` / `Filas insertadas: 2`.

**5. Limpiar los datos de prueba:**

```powershell
$env:PGPASSWORD = "abis_dev_pw"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

## 5. Próximos pasos (Sprint 10, 20–23 oct)

Según la hoja de ruta, el ciclo final corresponde a **despliegue y marcha blanca**:

- Pase a producción del sistema (depende del checklist de la sección 2.4).
- Monitoreo de los primeros envíos reales por Telegram.
- Entrega final del proyecto (viernes 23 de octubre).
