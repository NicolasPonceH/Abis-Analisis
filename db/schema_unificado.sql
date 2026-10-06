-- ===================================================================
-- SCHEMA UNIFICADO: Abis_OCR
-- Sistema ABIS + Sistema de Análisis Documental (SIAD)
-- Policía de Investigaciones de Chile (PDI)
-- ===================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================
-- SECCIÓN 1: TABLAS DEL SISTEMA ABIS
-- (Enrolamiento Biométrico)
-- =============================================

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

CREATE TABLE IF NOT EXISTS profesion (
    id_profesion    SERIAL PRIMARY KEY,
    nombre_profesion VARCHAR(150) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS registro_enrolamiento (
    id_registro               BIGSERIAL PRIMARY KEY,
    fecha_enrolamiento        DATE NOT NULL,
    fecha_carga_sistema       TIMESTAMP NOT NULL DEFAULT NOW(),
    id_nacionalidad           INTEGER NOT NULL REFERENCES nacionalidad(id_nacionalidad),
    id_cuartel                INTEGER NOT NULL REFERENCES cuartel(id_cuartel),
    id_equipo                 INTEGER NOT NULL REFERENCES equipo(id_equipo),
    id_profesion              INTEGER REFERENCES profesion(id_profesion) DEFAULT 1,
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
CREATE INDEX IF NOT EXISTS idx_registro_profesion ON registro_enrolamiento (id_profesion);
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

-- Tabla de destinatarios institucionales de Telegram
CREATE TABLE IF NOT EXISTS destinatarios_telegram (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    chat_id TEXT NOT NULL,
    chat_id_hash VARCHAR(64) NOT NULL UNIQUE,
    rol_unidad VARCHAR(120) DEFAULT 'General',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_destinatarios_activo ON destinatarios_telegram (activo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_destinatarios_hash ON destinatarios_telegram (chat_id_hash);

-- Tabla para configuración del scheduler
CREATE TABLE IF NOT EXISTS scheduler_config (
    config_key VARCHAR(50) PRIMARY KEY,
    config_value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- SECCIÓN 2: TABLAS DEL SISTEMA DE ANÁLISIS DOCUMENTAL (SIAD)
-- (OCR, NLP, Extracción de Entidades)
-- =============================================

CREATE TABLE IF NOT EXISTS documentos (
    id BIGSERIAL PRIMARY KEY,
    nombre_archivo TEXT NOT NULL,
    fecha_procesamiento TIMESTAMPTZ NOT NULL DEFAULT now(),
    texto_original TEXT NOT NULL,
    resumen TEXT,
    usuario_username TEXT
);

CREATE TABLE IF NOT EXISTS entidades_vehiculos (
    id BIGSERIAL PRIMARY KEY,
    documento_id BIGINT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    marca TEXT,
    modelo TEXT,
    color TEXT,
    año TEXT,
    patente TEXT
);

CREATE TABLE IF NOT EXISTS entidades_armas (
    id BIGSERIAL PRIMARY KEY,
    documento_id BIGINT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    marca TEXT,
    modelo TEXT,
    tipo TEXT,
    calibre TEXT,
    serie TEXT
);

CREATE TABLE IF NOT EXISTS entidades_drogas (
    id BIGSERIAL PRIMARY KEY,
    documento_id BIGINT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    sustancia TEXT,
    medida TEXT
);

CREATE TABLE IF NOT EXISTS entidades_personas (
    id BIGSERIAL PRIMARY KEY,
    documento_id BIGINT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    nombre TEXT,
    rut TEXT,
    telefono TEXT
);

CREATE INDEX IF NOT EXISTS idx_vehiculos_doc ON entidades_vehiculos(documento_id);
CREATE INDEX IF NOT EXISTS idx_armas_doc ON entidades_armas(documento_id);
CREATE INDEX IF NOT EXISTS idx_drogas_doc ON entidades_drogas(documento_id);
CREATE INDEX IF NOT EXISTS idx_personas_doc ON entidades_personas(documento_id);
CREATE INDEX IF NOT EXISTS idx_documentos_fecha ON documentos(fecha_procesamiento);

-- Inmutabilidad (RF-06: "registro inmutable")
CREATE OR REPLACE FUNCTION bloquear_modificacion() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Los registros del historial son inmutables: % no permitido en %', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documentos_inmutable ON documentos;
CREATE TRIGGER documentos_inmutable
    BEFORE UPDATE OR DELETE ON documentos
    FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();

DROP TRIGGER IF EXISTS entidades_vehiculos_inmutable ON entidades_vehiculos;
CREATE TRIGGER entidades_vehiculos_inmutable
    BEFORE UPDATE OR DELETE ON entidades_vehiculos
    FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();

DROP TRIGGER IF EXISTS entidades_armas_inmutable ON entidades_armas;
CREATE TRIGGER entidades_armas_inmutable
    BEFORE UPDATE OR DELETE ON entidades_armas
    FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();

DROP TRIGGER IF EXISTS entidades_drogas_inmutable ON entidades_drogas;
CREATE TRIGGER entidades_drogas_inmutable
    BEFORE UPDATE OR DELETE ON entidades_drogas
    FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();

DROP TRIGGER IF EXISTS entidades_personas_inmutable ON entidades_personas;
CREATE TRIGGER entidades_personas_inmutable
    BEFORE UPDATE OR DELETE ON entidades_personas
    FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();

-- =============================================
-- SECCIÓN 3: TABLAS COMPARTIDAS
-- (Usuarios unificados para ambos sistemas)
-- =============================================

CREATE TABLE IF NOT EXISTS usuarios (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nombre_completo TEXT,
    rol TEXT NOT NULL DEFAULT 'operador',
    creado_en TIMESTAMPTZ DEFAULT now(),
    ultimo_ingreso TIMESTAMPTZ
);

-- Full-Text Search para documentos del SIAD
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS tsv tsvector;
CREATE INDEX IF NOT EXISTS idx_documentos_tsv ON documentos USING GIN (tsv);

-- Popular registros historicos de FTS (deshabilitando temporalmente el trigger inmutable)
ALTER TABLE documentos DISABLE TRIGGER documentos_inmutable;
UPDATE documentos
SET tsv = setweight(to_tsvector('spanish', coalesce(texto_original, '')), 'A') ||
          setweight(to_tsvector('spanish', coalesce(resumen, '')), 'B')
WHERE tsv IS NULL;
ALTER TABLE documentos ENABLE TRIGGER documentos_inmutable;
