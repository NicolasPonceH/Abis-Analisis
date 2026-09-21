-- Migración: Incorporación de la dimensión Profesión/Ocupación en el Sistema ABIS

-- 1. Tabla de Catálogo Profesión
CREATE TABLE IF NOT EXISTS profesion (
    id_profesion    SERIAL PRIMARY KEY,
    nombre_profesion VARCHAR(150) NOT NULL UNIQUE
);

-- 2. Poblar profesiones base y reales de Oracle
INSERT INTO profesion (nombre_profesion) VALUES
    ('NO ESPECIFICADO'),
    ('SIN PROFESION'),
    ('AGRICULTOR'),
    ('ALBAÑIL'),
    ('ALBAÑIL (CONSTRUCCION)'),
    ('ALBAÑIL EN GENERAL'),
    ('ASESORA DEL HOGAR'),
    ('AYUDANTE DE COCINA'),
    ('BAILARIN'),
    ('CARGADOR DE CAMIONES'),
    ('CARPINTERO'),
    ('CHOFER'),
    ('COCINERO EN GENERAL'),
    ('COMERCIANTE EN GENERAL'),
    ('CONDUCTOR'),
    ('CONDUCTOR DE AUTOCAR O AUTOBUS'),
    ('CONTADOR AUDITOR'),
    ('COSTURERA'),
    ('DUEÑA DE CASA'),
    ('EMPLEADA'),
    ('EMPLEADO DE SERVICIOS DEL PERSONAL'),
    ('ESTUDIANTE'),
    ('GARZONA'),
    ('GUARDIA SEGURIDAD'),
    ('INGENIERO /CONSTRUCCION DE PUENTES/'),
    ('INGENIERO EN MANTENIMIENTO INDUSTRIAL'),
    ('JEFE DE SERVICIO'),
    ('LABORES DE CASA'),
    ('MANICURISTA'),
    ('MODELO DE PUBLICIDAD'),
    ('OBRERO DE LA CONSTRUCCION'),
    ('PERSONAS EN BUSCA DE SU PRIMER EMPLEO'),
    ('PSICOLOGO'),
    ('REPARTIDOR'),
    ('SOLDADOR'),
    ('TATUADOR'),
    ('TECNICO EN MECANICA INDUSTRIAL'),
    ('TECNICO EN SONIDO'),
    ('TECNICO MECANICO'),
    ('TECNICO ODONTOLOGICO'),
    ('TEMPORERA'),
    ('TEMPORERO'),
    ('TEMPORERO AGRICOLA'),
    ('VENDEDOR')
ON CONFLICT (nombre_profesion) DO NOTHING;

-- 3. Agregar columna id_profesion a registro_enrolamiento si no existe
ALTER TABLE registro_enrolamiento 
ADD COLUMN IF NOT EXISTS id_profesion INTEGER REFERENCES profesion(id_profesion) DEFAULT 1;

-- 4. Asignar 'NO ESPECIFICADO' (id=1) a los registros históricos que estén en NULL
UPDATE registro_enrolamiento 
SET id_profesion = 1 
WHERE id_profesion IS NULL;

-- 5. Índice para consultas analíticas rápidas
CREATE INDEX IF NOT EXISTS idx_registro_profesion ON registro_enrolamiento (id_profesion);
