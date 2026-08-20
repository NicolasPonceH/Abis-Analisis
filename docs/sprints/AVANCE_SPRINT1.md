---
title: "Informe de Avance — Sprint 1"
subtitle: "Sistema de Gestión Automatizada de Identificación Biométrica (ABIS)"
---

**Proyecto:** Sistema ABIS
**Periodo del ciclo:** 18 de agosto de 2026 – 24 de agosto de 2026
**Fecha de presentación:** 19 de agosto de 2026

## 1. Objetivo del ciclo

Según la hoja de ruta del proyecto, el Sprint 1 tiene como objetivo el **modelado y la
configuración inicial** del sistema, con el siguiente entregable comprometido para la revisión
semanal:

- Creación del repositorio y estructura del proyecto (Node.js).
- Script DDL de la base de datos PostgreSQL (esquema normalizado).
- Poblamiento de tablas maestras (catálogos de nacionalidades, regiones, etc.).

## 2. Trabajo realizado

### 2.1. Arquitectura y estructura del proyecto

Se definió el stack tecnológico: **Node.js con Express** para el backend, **PostgreSQL** como
motor de base de datos. Se creó la estructura base del repositorio:

| Carpeta / archivo | Contenido |
|---|---|
| `db/schema.sql` | DDL del esquema normalizado |
| `db/seed_catalogos.sql` | Datos iniciales de las tablas maestras |
| `scripts/run-sql.js` | Utilidad para aplicar scripts `.sql` contra la base de datos |
| `src/db.js` | Pool de conexión a PostgreSQL |
| `src/server.js` | Servidor Express con endpoint de verificación |
| `package.json` | Dependencias del proyecto (`express`, `pg`, `dotenv`) |

### 2.2. Diseño del esquema de base de datos (3NF)

Se modeló el esquema relacional normalizado descrito en el informe de requerimientos, compuesto
por seis tablas de catálogo y una tabla transaccional:

**Tablas de catálogo (maestras):**

| Tabla | Descripción |
|---|---|
| `nacionalidad` | Catálogo de países |
| `region` | Regiones |
| `unidad` | Unidades, asociadas a una región |
| `cuartel` | Cuarteles, asociados a una unidad |
| `equipo` | Tipos de equipo utilizados en el enrolamiento |
| `estado_proceso` | Catálogo genérico reutilizado para tres dominios de estado: sincronización, registro y estado general |

**Tabla transaccional:**

`registro_enrolamiento` — almacena cada registro de enrolamiento biométrico, con llaves foráneas
hacia los seis catálogos anteriores (incluyendo tres referencias independientes a
`estado_proceso`, una por cada dominio de estado) y con índices sobre fecha de enrolamiento,
cuartel y nacionalidad para soportar las consultas del futuro tablero de estadísticas.

### 2.3. Poblamiento de catálogos

Se cargaron datos iniciales de ejemplo (tomados del informe de requerimientos) en las seis tablas
maestras: 7 nacionalidades, 2 regiones, 3 unidades, 3 cuarteles, 2 tipos de equipo y 7 estados de
proceso. Estos datos son un punto de partida; deberán completarse con el listado real
institucional antes de la carga de datos productivos (Sprint 3 en adelante).

### 2.4. Entorno de base de datos

Se instaló y configuró una instancia de **PostgreSQL 17** dedicada a este proyecto (puerto 5433,
para no interferir con otras instancias de PostgreSQL ya presentes en el equipo). Se creó la base
de datos `abis_db`, se aplicó el script DDL y se ejecutó el poblamiento de catálogos.

### 2.5. Verificación

Se implementó un endpoint de verificación (`GET /health`) en el servidor Express, que confirma
tanto que el proceso está activo como que la conexión a PostgreSQL es exitosa. Se validó de
extremo a extremo:

- `npm run db:schema` — aplica el esquema sin errores.
- `npm run db:seed` — carga los catálogos sin errores.
- `npm start` seguido de `GET /health` — responde `{"status":"ok","db":"connected"}`.
- Verificación directa en base de datos: las 7 tablas existen y los catálogos contienen los
  registros esperados.

## 3. Estado del entregable

**Completo.** Los tres puntos comprometidos para el Sprint 1 (estructura del proyecto, script DDL
del esquema normalizado, poblamiento de catálogos) están implementados y verificados.

## 4. Próximos pasos (Sprint 2, 25–31 de agosto)

Según la hoja de ruta, el siguiente ciclo corresponde al **módulo de conexión y lectura de
archivos**:

- Implementación de la librería de lectura de Excel (`xlsx`).
- Desarrollo del módulo de validación de estructura del Excel (cabeceras).
- Mapeo inicial de datos en memoria (texto a identificadores de catálogo).
