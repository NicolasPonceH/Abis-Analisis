-- Esquema normalizado (3NF) para el Sistema de Gestion ABIS
-- Ver Informe de Requerimientos, seccion 4 (Diseno de la Base de Datos)

-- Extension criptografica nativa para cifrado simetrico AES-256 y funciones hash
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nacionalidad (
    id_nacionalidad SERIAL PRIMARY KEY,
    descripcion     VARCHAR(100) NOT NULL UNIQUE,
    codigo_iso      CHAR(3)
);

CREATE TABLE IF NOT EXISTS region (
    id_region     SERIAL PRIMARY KEY,
    nombre_region VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS unidad (
    id_unidad     SERIAL PRIMARY KEY,
    nombre_unidad VARCHAR(150) NOT NULL,
    id_region     INTEGER NOT NULL REFERENCES region(id_region),
    UNIQUE (nombre_unidad, id_region)
);

CREATE TABLE IF NOT EXISTS cuartel (
    id_cuartel     SERIAL PRIMARY KEY,
    nombre_cuartel VARCHAR(150) NOT NULL,
    id_unidad      INTEGER NOT NULL REFERENCES unidad(id_unidad),
    UNIQUE (nombre_cuartel, id_unidad)
);

CREATE TABLE IF NOT EXISTS equipo (
    id_equipo   SERIAL PRIMARY KEY,
    tipo_equipo VARCHAR(50) NOT NULL UNIQUE
);

-- tipo_estado agrupa el catalogo por dominio: SINCRONIZACION | REGISTRO | GENERAL
CREATE TABLE IF NOT EXISTS estado_proceso (
    id_estado   SERIAL PRIMARY KEY,
    tipo_estado VARCHAR(30) NOT NULL,
    descripcion VARCHAR(50) NOT NULL,
    UNIQUE (tipo_estado, descripcion)
);

CREATE TABLE IF NOT EXISTS registro_enrolamiento (
    id_registro               BIGSERIAL PRIMARY KEY,
    fecha_enrolamiento        DATE NOT NULL,
    fecha_carga_sistema       TIMESTAMP NOT NULL DEFAULT NOW(),
    id_nacionalidad           INTEGER NOT NULL REFERENCES nacionalidad(id_nacionalidad),
    id_cuartel                INTEGER NOT NULL REFERENCES cuartel(id_cuartel),
    id_equipo                 INTEGER NOT NULL REFERENCES equipo(id_equipo),
    genero                    CHAR(1) NOT NULL CHECK (genero IN ('M', 'F', 'X')),
    es_mayor_edad             BOOLEAN NOT NULL,
    edad_exacta               SMALLINT,
    id_estado_sincronizacion  INTEGER NOT NULL REFERENCES estado_proceso(id_estado),
    id_estado_registro        INTEGER NOT NULL REFERENCES estado_proceso(id_estado),
    id_estado_general         INTEGER NOT NULL REFERENCES estado_proceso(id_estado)
);

CREATE INDEX IF NOT EXISTS idx_registro_fecha_enrolamiento ON registro_enrolamiento (fecha_enrolamiento);
CREATE INDEX IF NOT EXISTS idx_registro_cuartel ON registro_enrolamiento (id_cuartel);
CREATE INDEX IF NOT EXISTS idx_registro_nacionalidad ON registro_enrolamiento (id_nacionalidad);

-- Sprint 4: soportan las agrupaciones por estado del reporte diario (sincronizados/pendientes/
-- error, registrados/pendientes, general OK/con error) sin escanear toda la tabla historica.
CREATE INDEX IF NOT EXISTS idx_registro_estado_sincronizacion ON registro_enrolamiento (id_estado_sincronizacion);
CREATE INDEX IF NOT EXISTS idx_registro_estado_registro ON registro_enrolamiento (id_estado_registro);
CREATE INDEX IF NOT EXISTS idx_registro_estado_general ON registro_enrolamiento (id_estado_general);

-- Tabla de trazabilidad y auditoria criptografica (No-repudio e integridad SHA-256)
CREATE TABLE IF NOT EXISTS registro_auditoria_cifrada (
    id_auditoria          BIGSERIAL PRIMARY KEY,
    fecha_evento          TIMESTAMP NOT NULL DEFAULT NOW(),
    tipo_evento           VARCHAR(50) NOT NULL,
    archivo_procesado     VARCHAR(255) NOT NULL,
    hash_sha256           VARCHAR(64) NOT NULL,
    detalles_cifrados     TEXT,
    usuario_o_proceso     VARCHAR(100) NOT NULL DEFAULT 'SISTEMA_ABIS'
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON registro_auditoria_cifrada (fecha_evento);
