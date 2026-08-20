-- Vistas de reporte (Sprint 5) para el resumen diario descrito en el informe de requerimientos,
-- seccion 5 (Proceso de Integracion con Telegram). Todas usan CREATE OR REPLACE VIEW: son
-- idempotentes, se pueden re-aplicar con "npm run db:views" cada vez que cambien.

-- Un registro por (fecha, dominio de estado, descripcion), contando cuantos registros cayeron
-- ahi ese dia. Junta los tres dominios independientes (SINCRONIZACION, REGISTRO, GENERAL) que
-- viven en las tres FK separadas de registro_enrolamiento hacia el mismo catalogo estado_proceso.
CREATE OR REPLACE VIEW vw_resumen_estado_diario AS
SELECT r.fecha_enrolamiento, 'SINCRONIZACION' AS tipo_estado, ep.descripcion, count(*) AS total
FROM registro_enrolamiento r
JOIN estado_proceso ep ON ep.id_estado = r.id_estado_sincronizacion
GROUP BY r.fecha_enrolamiento, ep.descripcion
UNION ALL
SELECT r.fecha_enrolamiento, 'REGISTRO', ep.descripcion, count(*)
FROM registro_enrolamiento r
JOIN estado_proceso ep ON ep.id_estado = r.id_estado_registro
GROUP BY r.fecha_enrolamiento, ep.descripcion
UNION ALL
SELECT r.fecha_enrolamiento, 'GENERAL', ep.descripcion, count(*)
FROM registro_enrolamiento r
JOIN estado_proceso ep ON ep.id_estado = r.id_estado_general
GROUP BY r.fecha_enrolamiento, ep.descripcion;

-- Cantidad de enrolamientos por dia y nacionalidad.
CREATE OR REPLACE VIEW vw_resumen_nacionalidad_diario AS
SELECT r.fecha_enrolamiento, n.descripcion AS nacionalidad, count(*) AS total
FROM registro_enrolamiento r
JOIN nacionalidad n ON n.id_nacionalidad = r.id_nacionalidad
GROUP BY r.fecha_enrolamiento, n.descripcion;

-- Cantidad de enrolamientos por dia y cuartel (los "cuarteles activos" del mensaje de Telegram).
CREATE OR REPLACE VIEW vw_resumen_cuartel_diario AS
SELECT r.fecha_enrolamiento, c.nombre_cuartel AS cuartel, count(*) AS total
FROM registro_enrolamiento r
JOIN cuartel c ON c.id_cuartel = r.id_cuartel
GROUP BY r.fecha_enrolamiento, c.nombre_cuartel;

-- Total de enrolamientos por dia, base para calcular porcentajes.
CREATE OR REPLACE VIEW vw_total_diario AS
SELECT fecha_enrolamiento, count(*) AS total
FROM registro_enrolamiento
GROUP BY fecha_enrolamiento;
