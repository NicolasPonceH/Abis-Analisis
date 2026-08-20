-- Poblamiento inicial de tablas maestras (Sprint 1)
-- Datos de ejemplo tomados del Informe de Requerimientos.
-- IMPORTANTE: reemplazar/completar con el listado real institucional
-- de unidades, cuarteles y nacionalidades antes de cargar datos reales (Sprint 3+).

INSERT INTO nacionalidad (descripcion, codigo_iso) VALUES
    ('CHILE', 'CHL'),
    ('VENEZUELA', 'VEN'),
    ('BOLIVIA', 'BOL'),
    ('PERU', 'PER'),
    ('COLOMBIA', 'COL'),
    ('ECUADOR', 'ECU'),
    ('ARGENTINA', 'ARG')
ON CONFLICT (descripcion) DO NOTHING;

INSERT INTO region (nombre_region) VALUES
    ('ARICA - PARINACOTA'),
    ('TARAPACA')
ON CONFLICT (nombre_region) DO NOTHING;

INSERT INTO unidad (nombre_unidad, id_region) VALUES
    ('PREPOLIN ARICA', (SELECT id_region FROM region WHERE nombre_region = 'ARICA - PARINACOTA')),
    ('JENATID', (SELECT id_region FROM region WHERE nombre_region = 'ARICA - PARINACOTA')),
    ('BRIANCO ARICA', (SELECT id_region FROM region WHERE nombre_region = 'ARICA - PARINACOTA'))
ON CONFLICT (nombre_unidad, id_region) DO NOTHING;

INSERT INTO cuartel (nombre_cuartel, id_unidad) VALUES
    ('COLCHANES', (SELECT id_unidad FROM unidad WHERE nombre_unidad = 'PREPOLIN ARICA')),
    ('ANGAMOS', (SELECT id_unidad FROM unidad WHERE nombre_unidad = 'PREPOLIN ARICA')),
    ('CHACALLUTA', (SELECT id_unidad FROM unidad WHERE nombre_unidad = 'PREPOLIN ARICA'))
ON CONFLICT (nombre_cuartel, id_unidad) DO NOTHING;

INSERT INTO equipo (tipo_equipo) VALUES
    ('PC DE ESCRITORIO'),
    ('TABLET')
ON CONFLICT (tipo_equipo) DO NOTHING;

INSERT INTO estado_proceso (tipo_estado, descripcion) VALUES
    ('SINCRONIZACION', 'SINCRONIZADO'),
    ('SINCRONIZACION', 'PENDIENTE'),
    ('SINCRONIZACION', 'ERROR'),
    ('REGISTRO', 'REGISTRADO'),
    ('REGISTRO', 'PENDIENTE'),
    ('GENERAL', 'OK'),
    ('GENERAL', 'CON_ERROR')
ON CONFLICT (tipo_estado, descripcion) DO NOTHING;
