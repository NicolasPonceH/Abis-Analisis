# Sistema ABIS

Sistema de Gestion Automatizada de Identificacion Biometrica. Procesa un Excel diario de
enrolamiento biometrico, lo normaliza en PostgreSQL y notifica un resumen estadistico por Telegram.

Roadmap completo: 10 sprints semanales, 18 ago - 23 oct 2026 (ver documento de planificacion).

## Estado actual — Sprint 1 (18-24 ago): Modelado y configuracion inicial

- [x] Estructura del proyecto Node.js/Express.
- [x] Script DDL del esquema normalizado (`db/schema.sql`).
- [x] Poblamiento de tablas maestras con datos de ejemplo (`db/seed_catalogos.sql`).

## Requisitos

- Node.js 18+
- PostgreSQL 14+ accesible (local o remoto)

## Entorno local de esta maquina

Esta maquina tiene una instancia PostgreSQL 18 preexistente (no relacionada con este proyecto) en
el puerto 5432, mas una **segunda instancia dedicada a ABIS en el puerto 5433**, creada con los
mismos binarios (`initdb`/`pg_ctl` de PostgreSQL 18) en un data directory aparte:

```
C:\Users\Nicolás\pgdata-abis-5433
```

A diferencia de la maquina original (donde corria como servicio de Windows
`postgresql-x64-17-abis`), aca corre como **proceso manual**, porque esta cuenta no tiene permisos
de administrador para registrar un servicio. Hay que iniciarla a mano despues de cada reinicio de
la PC:

```powershell
# Iniciar
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Users\Nicolás\pgdata-abis-5433" -l "C:\Users\Nicolás\pgdata-abis-5433\server.log" start

# Detener
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Users\Nicolás\pgdata-abis-5433" stop
```

- Superusuario: `postgres`, password `abis_dev_pw` (solo desarrollo local).
- Base de datos creada: `abis_db`.
- `.env` ya esta configurado con `DATABASE_URL=postgresql://postgres:abis_dev_pw@localhost:5433/abis_db`.
- Esquema y catalogos ya aplicados (`npm run db:schema && npm run db:seed`).

Si en el futuro se consigue una cuenta con permisos de administrador, se puede reemplazar este
proceso manual por un servicio de Windows real (`pg_ctl register` o reinstalando via winget), sin
tener que tocar el puerto ni las credenciales.

## Puesta en marcha

```bash
npm install
npm start               # levanta el servidor en http://localhost:3000/health
```

Si se necesita recrear el entorno desde cero (otra maquina, u otra instancia de PostgreSQL):

```bash
npm install
cp .env.example .env   # editar DATABASE_URL con las credenciales reales
npm run db:schema      # crea las tablas
npm run db:seed        # carga los catalogos de ejemplo
npm start
```

`GET /health` confirma que el servidor esta arriba y que la conexion a PostgreSQL funciona.

## Estructura

```
db/
  schema.sql          DDL del esquema normalizado (3NF)
  seed_catalogos.sql  Datos de ejemplo para las tablas maestras
scripts/
  run-sql.js           Ejecuta un archivo .sql contra DATABASE_URL
src/
  db.js                Pool de conexion a PostgreSQL
  server.js             Servidor Express
```

## Notas

- Los catalogos de `seed_catalogos.sql` son de ejemplo (tomados del informe de requerimientos).
  Deben completarse con el listado real de unidades/cuarteles antes de cargar datos reales (Sprint 3+).
- El token del bot de Telegram y las credenciales de BD se manejan por variables de entorno
  (`.env`, nunca comprometido al repositorio).
