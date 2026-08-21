-- Hardening de base de datos (Sprint 9): un rol de aplicacion con privilegios minimos, en vez
-- de que la app corra con el superusuario `postgres` (asi esta hoy en el entorno de desarrollo).
--
-- El rol `abis_app` puede leer y escribir la tabla transaccional y leer los catalogos/vistas,
-- pero no puede crear ni borrar tablas, ni tocar otras bases de datos. Los scripts de
-- schema/seed/views (db:schema, db:seed, db:views) siguen necesitando un rol con permisos de
-- DDL (el superusuario, o un rol dueño del esquema) — ese rol NO deberia usarse para la
-- aplicacion en produccion dia a dia.
--
-- No es idempotente al 100% (CREATE ROLE falla si ya existe) — usa DO/EXCEPTION para poder
-- re-aplicarse sin error si ya se corrio antes.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'abis_app') THEN
        CREATE ROLE abis_app WITH LOGIN PASSWORD 'CAMBIAR_ESTA_PASSWORD_EN_PRODUCCION';
    END IF;
END
$$;

-- Catalogos: solo lectura (la app nunca deberia modificar catalogos en el flujo normal).
GRANT SELECT ON nacionalidad, region, unidad, cuartel, equipo, estado_proceso TO abis_app;

-- Tabla transaccional: lectura + insercion. Sin UPDATE/DELETE — el flujo diario solo inserta,
-- nunca deberia modificar ni borrar enrolamientos ya cargados.
GRANT SELECT, INSERT ON registro_enrolamiento TO abis_app;
GRANT USAGE, SELECT ON SEQUENCE registro_enrolamiento_id_registro_seq TO abis_app;

-- Vistas de reporte: solo lectura.
GRANT SELECT ON
    vw_resumen_estado_diario, vw_resumen_nacionalidad_diario, vw_resumen_cuartel_diario,
    vw_resumen_unidad_diario, vw_resumen_genero_diario, vw_resumen_edad_diario, vw_total_diario
TO abis_app;
