# Diagrama entidad-relación — Sistema ABIS

Refleja el esquema normalizado (3NF) definido en [`db/schema.sql`](../../db/schema.sql). Se
renderiza automáticamente en GitHub (no requiere herramientas externas).

```mermaid
erDiagram
    REGION ||--o{ UNIDAD : tiene
    UNIDAD ||--o{ CUARTEL : tiene
    NACIONALIDAD ||--o{ REGISTRO_ENROLAMIENTO : clasifica
    CUARTEL ||--o{ REGISTRO_ENROLAMIENTO : ubica
    EQUIPO ||--o{ REGISTRO_ENROLAMIENTO : usa
    ESTADO_PROCESO ||--o{ REGISTRO_ENROLAMIENTO : "estado_sincronizacion"
    ESTADO_PROCESO ||--o{ REGISTRO_ENROLAMIENTO : "estado_registro"
    ESTADO_PROCESO ||--o{ REGISTRO_ENROLAMIENTO : "estado_general"

    NACIONALIDAD {
        int id_nacionalidad PK
        varchar descripcion
        char codigo_iso
    }
    REGION {
        int id_region PK
        varchar nombre_region
    }
    UNIDAD {
        int id_unidad PK
        varchar nombre_unidad
        int id_region FK
    }
    CUARTEL {
        int id_cuartel PK
        varchar nombre_cuartel
        int id_unidad FK
    }
    EQUIPO {
        int id_equipo PK
        varchar tipo_equipo
    }
    ESTADO_PROCESO {
        int id_estado PK
        varchar tipo_estado "dominio: SINCRONIZACION | REGISTRO | GENERAL"
        varchar descripcion
    }
    REGISTRO_ENROLAMIENTO {
        bigint id_registro PK
        date fecha_enrolamiento
        timestamp fecha_carga_sistema
        int id_nacionalidad FK
        int id_cuartel FK
        int id_equipo FK
        char genero
        boolean es_mayor_edad
        smallint edad_exacta
        int id_estado_sincronizacion FK
        int id_estado_registro FK
        int id_estado_general FK
    }
```

## Notas de diseño

- `region` → `unidad` → `cuartel` es una jerarquía estricta (cada nivel referencia al anterior).
- `estado_proceso` es un catálogo genérico reutilizado en tres dominios independientes
  (`tipo_estado`); no crear tablas de estado separadas por dominio.
- `registro_enrolamiento` tiene **tres** llaves foráneas independientes hacia `estado_proceso`
  (sincronización, registro, general), además de las llaves hacia `nacionalidad`, `cuartel` y
  `equipo`.
- Índices (Sprint 1 y 4) sobre `fecha_enrolamiento`, `id_cuartel`, `id_nacionalidad`,
  `id_estado_sincronizacion`, `id_estado_registro` e `id_estado_general` — pensados para las
  agrupaciones del reporte diario y el dashboard de estadísticas, verificados con `EXPLAIN
  ANALYZE` sobre 95k+ registros en [`AVANCE_SPRINT4.md`](../sprints/AVANCE_SPRINT4.md).
- `db/views.sql` (Sprint 5) define 4 vistas de solo lectura sobre `registro_enrolamiento` para
  facilitar reportes (resumen por estado, nacionalidad, cuartel y total diario) — no son parte del
  modelo de datos en sí, no se muestran en el diagrama ER. Ver
  [`AVANCE_SPRINT5.md`](../sprints/AVANCE_SPRINT5.md).

## Cómo mantenerlo actualizado

Este diagrama es manual, no generado. Cada vez que `db/schema.sql` cambie (nueva tabla, columna o
llave foránea):

1. Actualizar el bloque ` ```mermaid ` de arriba para reflejar el cambio.
2. Si agregás una tabla nueva, sumarla tanto a las relaciones (arriba) como a la definición de
   atributos (abajo).
3. Confirmar que el diagrama renderiza bien previsualizando el `.md` en GitHub (o en el editor)
   antes de commitear.
