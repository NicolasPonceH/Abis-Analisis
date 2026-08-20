# Roadmap — Sistema ABIS

Línea de tiempo de los 10 sprints semanales (18 ago – 23 oct 2026), tomada del documento
"Planificación y Hoja de Ruta" del informe de requerimientos.

```mermaid
gantt
    title Roadmap Sistema ABIS (18 ago - 23 oct 2026)
    dateFormat YYYY-MM-DD
    axisFormat %d %b

    section Fase 1 - Arquitectura y BD
    Sprint 1: Modelado y config inicial (v0.1.0) :done, s1, 2026-08-18, 2026-08-24
    Sprint 2: Conexion y lectura de Excel (v0.2.0) :done, s2, 2026-08-25, 2026-08-31

    section Fase 2 - ETL y logica de negocio
    Sprint 3: Proceso de ingesta ETL (v0.3.0) :active, s3, 2026-09-01, 2026-09-07
    Sprint 4: Carga historica y pruebas de estres (v0.4.0) :s4, 2026-09-08, 2026-09-14
    Sprint 5: Calculo de metricas y agrupaciones (v0.5.0) :s5, 2026-09-15, 2026-09-21

    section Fase 3 - Integracion y notificaciones
    Sprint 6: Bot de Telegram (v0.6.0) :s6, 2026-09-22, 2026-09-28
    Sprint 7: Automatizacion del flujo completo (v0.7.0) :s7, 2026-09-29, 2026-10-05

    section Fase 4 - Pruebas finales y despliegue
    Sprint 8: Testing integrado y QA (v0.8.0) :s8, 2026-10-06, 2026-10-12
    Sprint 9: Preparacion para produccion (v0.9.0) :s9, 2026-10-13, 2026-10-19
    Sprint 10: Despliegue y marcha blanca (v1.0.0) :s10, 2026-10-20, 2026-10-23
```

## Detalle por sprint

| Sprint | Fechas | Objetivo | Entregables clave |
|--------|--------|----------|--------------------|
| 1 | 18–24 ago | Modelado y configuración inicial | Repo y estructura Node.js, DDL del esquema normalizado, poblamiento de catálogos |
| 2 | 25–31 ago | Conexión y lectura de archivos | Librería de lectura Excel (`xlsx`), validación de cabeceras, mapeo inicial en memoria (texto → IDs) |
| 3 | 01–07 sep | Proceso de ingesta (ETL) | Transformación/limpieza diaria, manejo de inconsistencias de tipeo, inserción transaccional (bulk insert) en PostgreSQL |
| 4 | 08–14 sep | Carga histórica y pruebas de estrés | Procesamiento del acumulado anual (95k+ registros), optimización de índices, validación de integridad histórica |
| 5 | 15–21 sep | Cálculo de métricas y agrupaciones | Consultas SQL de resumen, vistas (views) para reportes, funciones/endpoints internos para la data del reporte diario |
| 6 | 22–28 sep | Configuración del bot de Telegram | Bot en BotFather + token seguro, cliente HTTP para la API de Telegram, template del mensaje en Markdown |
| 7 | 29 sep–05 oct | Automatización del flujo completo | Integración Excel → ETL → BD → cálculos → Telegram, cron jobs, manejo de excepciones (Excel vacío/corrupto) |
| 8 | 06–12 oct | Testing integrado y QA | Simulación de cargas reales, corrección de bugs, validación de métricas Telegram vs. Excel manual |
| 9 | 13–19 oct | Preparación para producción | Documentación técnica y manual de operación, configuración del entorno de producción, hardening de BD y scripts |
| 10 | 20–23 oct | Despliegue y marcha blanca | Pase a producción, monitoreo de envíos reales, entrega final (viernes 23 de octubre) |

## Hitos críticos

- **Hito 1 (31 ago)**: base de datos desplegada, capacidad de leer y mapear el Excel con éxito.
- **Hito 2 (21 sep)**: ETL completamente funcional, datos históricos (95k+ registros) cargados y consistentes.
- **Hito 3 (05 oct)**: primera prueba exitosa end-to-end (Excel → notificación en Telegram).
- **Hito 4 (23 oct)**: sistema en producción operando de forma autónoma.

## Convención de versionado

Cada sprint cerrado se marca con un tag de git `v0.N.0` (Sprint 10 usa `v1.0.0`, versión final):

```bash
git add .
git commit -m "Sprint N: <resumen>"
git tag -a v0.N.0 -m "Sprint N: <resumen>"
git push origin main --tags
```

## Cómo mantenerlo actualizado

Al cerrar cada sprint: marcar su sección como `done` en el diagrama Gantt, y si el alcance real
terminó difiriendo de lo planificado acá, anotar la diferencia en la fila correspondiente de la
tabla de detalle (no solo en el informe de avance del sprint).
