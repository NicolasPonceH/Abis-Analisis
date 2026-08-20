# Documentación — Sistema ABIS

Índice de la documentación del proyecto, mantenida en Markdown dentro del repositorio (versionada
junto con el código, diagramas en Mermaid renderizados nativamente por GitHub).

## Estructura

```
docs/
  sprints/      Informe de avance de cada sprint cerrado (AVANCE_SPRINT{N}.md)
  diagramas/    Diagramas del sistema, mantenidos a mano junto con el código
```

- [`diagramas/er-diagrama.md`](diagramas/er-diagrama.md) — modelo de datos (`db/schema.sql`).
- [`diagramas/arquitectura.md`](diagramas/arquitectura.md) — componentes implementados vs.
  planificados.
- [`diagramas/roadmap.md`](diagramas/roadmap.md) — línea de tiempo de los 10 sprints y convención
  de versionado por tags.
- [`sprints/AVANCE_SPRINT1.md`](sprints/AVANCE_SPRINT1.md) — primer informe de avance (Sprint 1,
  cerrado).

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
