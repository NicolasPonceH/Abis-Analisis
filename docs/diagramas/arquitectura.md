# Diagrama de arquitectura — Sistema ABIS

Vista de componentes: lo ya implementado (Sprint 1) versus lo planificado por el roadmap. Se
actualiza a medida que cada pieza planificada pasa a estar implementada.

```mermaid
flowchart LR
    subgraph impl["Implementado (Sprint 1)"]
        direction LR
        API["Express server<br/>src/server.js<br/>(GET /health)"]
        POOL["Pool pg<br/>src/db.js"]
        DB[("PostgreSQL<br/>abis_db")]
        RUNSQL["scripts/run-sql.js<br/>(aplica .sql sueltos)"]
        API --> POOL --> DB
        RUNSQL --> DB
    end

    subgraph plan["Planificado (Sprint 2+)"]
        direction LR
        EXCEL[/"Excel diario de<br/>enrolamiento"/]
        INGEST["Modulo de ingesta<br/>(xlsx, validacion de cabeceras)"]
        MAP["Mapeo texto -> ID de catalogo<br/>(nacionalidad, region/unidad/cuartel, equipo)"]
        STATS["Modulo de estadisticas"]
        TG(["Bot de Telegram"])
    end

    EXCEL -.-> INGEST -.-> MAP -.-> POOL
    DB -.-> STATS -.-> TG

    classDef planned stroke-dasharray: 4 3
    class EXCEL,INGEST,MAP,STATS,TG planned
```

## Lectura del diagrama

- **Implementado**: el servidor Express expone `GET /health`, que usa el pool compartido de
  `src/db.js` para verificar la conexión a PostgreSQL. `scripts/run-sql.js` es el mecanismo
  genérico para aplicar cualquier `.sql` (schema o seed) contra la misma base.
- **Planificado** (líneas punteadas): el módulo de ingesta de Excel (Sprint 2) leerá el archivo
  diario, validará su estructura y mapeará las columnas de texto libre a los IDs de las tablas de
  catálogo antes de insertar en `registro_enrolamiento`. El módulo de estadísticas y la
  notificación por Telegram son posteriores en el roadmap (ver [roadmap.md](roadmap.md)).

## Cómo mantenerlo actualizado

Cuando un componente del subgrafo "Planificado" se implemente:

1. Moverlo al subgrafo `impl` y quitarle la clase `planned` (para que deje de verse punteado).
2. Ajustar las flechas sólidas/punteadas según las nuevas dependencias reales.
3. Actualizar la sección "Lectura del diagrama" con una frase breve sobre qué hace el componente.
