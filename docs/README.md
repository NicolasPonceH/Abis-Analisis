# Documentación — Sistema ABIS

Índice de la documentación del proyecto, mantenida en Markdown dentro del repositorio (versionada
junto con el código, diagramas en Mermaid renderizados nativamente por GitHub).

## Estructura

```
docs/
  sprints/      Informe de avance de cada sprint cerrado (AVANCE_SPRINT{N}.md)
  diagramas/    Diagramas del sistema, mantenidos a mano junto con el código
```

- [`GUIA_RAPIDA.md`](GUIA_RAPIDA.md) — comandos para encender el entorno y probar cada sprint,
  organizados por sprint (índice rápido; el detalle completo está en cada `AVANCE_SPRINT{N}.md`).
- [`informe-requerimientos.md`](informe-requerimientos.md) — informe de requerimientos original
  (funcionales, no funcionales, integración con Telegram), transcrito al repo.
- [`diagramas/casos-de-uso.md`](diagramas/casos-de-uso.md) — actores y casos de uso, vista de
  alto nivel de los 4 requerimientos funcionales.
- [`diagramas/er-diagrama.md`](diagramas/er-diagrama.md) — modelo de datos (`db/schema.sql`).
- [`diagramas/jerarquia-geografica.md`](diagramas/jerarquia-geografica.md) — árbol
  Región → Unidad → Cuartel, separado del ERD.
- [`diagramas/estados-proceso.md`](diagramas/estados-proceso.md) — los tres dominios de
  `estado_proceso` (Sincronización, Registro, General), valores y su emoji en Telegram.
- [`diagramas/arquitectura.md`](diagramas/arquitectura.md) — componentes implementados vs.
  planificados.
- [`diagramas/roadmap.md`](diagramas/roadmap.md) — línea de tiempo completa de los 10 sprints,
  hitos críticos y convención de versionado por tags.
- [`diagramas/secuencia-flujo-diario.md`](diagramas/secuencia-flujo-diario.md) — diagrama de
  secuencia del flujo diario completo (Excel → ETL → BD → Telegram), con las 3 ramas de error.
- [`diagramas/normalizacion-limpieza.md`](diagramas/normalizacion-limpieza.md) — cómo se resuelve
  un valor de texto libre del Excel contra los catálogos (corrección de tipeos vs. jerarquía
  exacta).
- [`sprints/AVANCE_SPRINT1.md`](sprints/AVANCE_SPRINT1.md) — Sprint 1, cerrado (`v0.1.0`).
- [`sprints/AVANCE_SPRINT2.md`](sprints/AVANCE_SPRINT2.md) — Sprint 2, cerrado (`v0.2.0`).
- [`sprints/AVANCE_SPRINT3.md`](sprints/AVANCE_SPRINT3.md) — Sprint 3, cerrado (`v0.3.0`).
- [`sprints/AVANCE_SPRINT4.md`](sprints/AVANCE_SPRINT4.md) — Sprint 4, cerrado (`v0.4.0`).
- [`sprints/AVANCE_SPRINT5.md`](sprints/AVANCE_SPRINT5.md) — Sprint 5, cerrado (`v0.5.0`).
- [`sprints/AVANCE_SPRINT6.md`](sprints/AVANCE_SPRINT6.md) — Sprint 6, cerrado (`v0.6.0`).
- [`sprints/AVANCE_SPRINT7.md`](sprints/AVANCE_SPRINT7.md) — Sprint 7, cerrado (`v0.7.0`).
- [`sprints/AVANCE_SPRINT8.md`](sprints/AVANCE_SPRINT8.md) — Sprint 8, cerrado (`v0.8.0`).
- [`sprints/AVANCE_SPRINT9.md`](sprints/AVANCE_SPRINT9.md) — Sprint 9, cerrado (`v0.9.0`).
- [`sprints/AVANCE_SPRINT10.md`](sprints/AVANCE_SPRINT10.md) — Sprint 10, cerrado (`v1.0.0`,
  **cierre del proyecto**).
- [`MANUAL_OPERACION.md`](MANUAL_OPERACION.md) — cómo operar el sistema día a día (Sprint 9).
- [`PLAN_DESPLIEGUE.md`](PLAN_DESPLIEGUE.md) — runbook de despliegue a producción (Sprint 10).

## Convenciones para nuevos sprints

Al cerrar un sprint:

1. Crear `docs/sprints/AVANCE_SPRINT{N}.md` con el mismo formato que
   [`AVANCE_SPRINT1.md`](sprints/AVANCE_SPRINT1.md) (objetivo del ciclo, trabajo realizado, estado
   del entregable, próximos pasos).
2. Actualizar los diagramas en `docs/diagramas/` que hayan cambiado (ver la sección "Cómo
   mantenerlo actualizado" al final de cada uno).
3. Commitear, taggear (`v0.N.0`) y pushear — ver el detalle exacto en
   [`diagramas/roadmap.md`](diagramas/roadmap.md#convención-de-versionado).

No se genera versión `.docx` salvo que se pida explícitamente para una entrega puntual.
