-- Esquema del historial estructurado en tablas independientes (Sprint 11).
-- Se reemplazó el modelo EAV por tablas separadas para cada categoría (Vehículos, Armas, Drogas)
-- con columnas específicas, facilitando búsquedas directas.

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

CREATE TABLE IF NOT EXISTS usuarios (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nombre_completo TEXT,
    rol TEXT NOT NULL DEFAULT 'admin',
    creado_en TIMESTAMPTZ DEFAULT now(),
    ultimo_ingreso TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS resumenes_feedback (
    id BIGSERIAL PRIMARY KEY,
    usuario_username TEXT NOT NULL,
    documento_id BIGINT,
    resumen_original TEXT NOT NULL,
    resumen_editado TEXT NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- Full-Text Search (FTS)
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS tsv tsvector;
CREATE INDEX IF NOT EXISTS idx_documentos_tsv ON documentos USING GIN (tsv);

-- Popular registros historicos (deshabilitando temporalmente el trigger inmutable)
ALTER TABLE documentos DISABLE TRIGGER documentos_inmutable;
UPDATE documentos 
SET tsv = setweight(to_tsvector('spanish', coalesce(texto_original, '')), 'A') || 
          setweight(to_tsvector('spanish', coalesce(resumen, '')), 'B') 
WHERE tsv IS NULL;
ALTER TABLE documentos ENABLE TRIGGER documentos_inmutable;
