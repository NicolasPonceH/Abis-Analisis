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

-- Cantidad de enrolamientos por dia y unidad (subiendo un nivel en la jerarquia region -> unidad
-- -> cuartel). La seccion 2 del informe de requerimientos pide resumenes por Unidad ademas de
-- por Cuartel, aunque el ejemplo de mensaje de Telegram (seccion 5) solo muestra Cuartel.
CREATE OR REPLACE VIEW vw_resumen_unidad_diario AS
SELECT r.fecha_enrolamiento, u.nombre_unidad AS unidad, count(*) AS total
FROM registro_enrolamiento r
JOIN cuartel c ON c.id_cuartel = r.id_cuartel
JOIN unidad u ON u.id_unidad = c.id_unidad
GROUP BY r.fecha_enrolamiento, u.nombre_unidad;

-- Cantidad de enrolamientos por dia y genero.
CREATE OR REPLACE VIEW vw_resumen_genero_diario AS
SELECT fecha_enrolamiento, genero, count(*) AS total
FROM registro_enrolamiento
GROUP BY fecha_enrolamiento, genero;

-- Cantidad de enrolamientos por dia, separando mayores y menores de edad. edad_exacta (0-17)
-- es especificamente para la distribucion de N.N.A. segun el informe; no se expone edad exacta
-- de adultos en el resumen, solo el conteo mayor/menor.
CREATE OR REPLACE VIEW vw_resumen_edad_diario AS
SELECT fecha_enrolamiento,
       CASE WHEN es_mayor_edad THEN 'MAYOR DE EDAD' ELSE 'MENOR DE EDAD' END AS categoria,
       count(*) AS total
FROM registro_enrolamiento
GROUP BY fecha_enrolamiento, es_mayor_edad;

-- Total de enrolamientos por dia, base para calcular porcentajes.
CREATE OR REPLACE VIEW vw_total_diario AS
SELECT fecha_enrolamiento, count(*) AS total
FROM registro_enrolamiento
GROUP BY fecha_enrolamiento;

-- Cantidad de enrolamientos por dia y profesion/ocupacion.
CREATE OR REPLACE VIEW vw_resumen_profesion_diario AS
SELECT r.fecha_enrolamiento, p.nombre_profesion AS profesion, count(*) AS total
FROM registro_enrolamiento r
JOIN profesion p ON p.id_profesion = r.id_profesion
GROUP BY r.fecha_enrolamiento, p.nombre_profesion;
