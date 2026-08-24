# Diagrama de flujo — Normalización y Limpieza

Detalle del requerimiento funcional "Normalización y Limpieza" (sección 2 del
[informe de requerimientos](../informe-requerimientos.md): *"resolver inconsistencias en el
Excel... mapeando los valores en texto a llaves foráneas"*). Muestra cómo se resuelve un valor de
texto libre del Excel contra los catálogos, implementado en
[`src/ingest/catalogMapper.js`](../../src/ingest/catalogMapper.js) y
[`src/etl/catalogResolver.js`](../../src/etl/catalogResolver.js).

```mermaid
flowchart TD
    Start(["Valor de texto libre del Excel<br/>(ej. Nacionalidad, Equipo, Estado)"]) --> Norm["Normalizar: trim + MAYUSCULAS"]
    Norm --> Rama{"Tipo de campo"}

    Rama -- "Nacionalidad / Equipo / Estado<br/>(catalogo plano, un solo campo)" --> Exacto1{"Coincide EXACTO<br/>con el catalogo?"}
    Exacto1 -- Si --> UsarID1["Usar el ID del catalogo<br/>(sin correccion)"]
    Exacto1 -- No --> Fuzzy["Buscar el candidato mas cercano<br/>(distancia de Levenshtein) entre<br/>TODAS las claves del catalogo"]
    Fuzzy --> Distancia{"Hay un candidato<br/>UNICO a distancia <= 2?"}
    Distancia -- Si --> Corregir["Usar el ID de ese candidato<br/>+ registrar en 'correcciones'<br/>(queda auditable en el reporte)"]
    Distancia -- "No<br/>(ninguno, o mas de uno empatado)" --> Error1["Error: '&lt;Campo&gt; desconocido: valor'<br/>la fila se rechaza"]

    Rama -- "Region / Unidad / Cuartel<br/>(jerarquia de 3 niveles)" --> ExactoUnidad{"'REGION|UNIDAD' coincide<br/>EXACTO en el catalogo?"}
    ExactoUnidad -- No --> Error2["Error: Unidad no encontrada<br/>en esa Region — fila rechazada"]
    ExactoUnidad -- Si --> ExactoCuartel{"'UNIDAD|CUARTEL' coincide<br/>EXACTO en el catalogo?"}
    ExactoCuartel -- No --> Error3["Error: Cuartel no encontrado<br/>en esa Unidad — fila rechazada"]
    ExactoCuartel -- Si --> UsarID2["Usar el ID del cuartel<br/>(nunca hay correccion automatica aca)"]

    UsarID1 --> Fin(["ID de catalogo listo para<br/>registro_enrolamiento"])
    Corregir --> Fin
    UsarID2 --> Fin
```

## Lectura del diagrama

- Hay dos caminos completamente distintos según el campo, y es a propósito:
  - **Nacionalidad, Equipo y los tres campos de Estado** son catálogos planos (un solo texto
    identifica una fila) — ahí un error de tipeo es fácil de corregir sin ambigüedad razonable
    (`catalogResolver.js`, distancia de edición ≤ 2, y solo si el candidato más cercano es
    único).
  - **Región, Unidad y Cuartel** son una jerarquía de 3 niveles, y `cuartel.nombre_cuartel` ni
    siquiera es único a nivel global (solo dentro de su unidad) — corregir un tipeo ahí
    automáticamente podría "adivinar" el cuartel equivocado de otra unidad con nombre parecido.
    Por eso esos tres campos exigen coincidencia exacta, sin tolerancia a tipeos.
- Una corrección automática (rama "Distancia <= 2 → Sí") **no es silenciosa**: queda registrada
  en el array `correcciones` de la fila mapeada, y aparece en la consola del ETL
  (`npm run etl`/`npm run flujo-diario`) y en `AVANCE_SPRINT3.md`/`AVANCE_SPRINT6.md` como algo
  a revisar, no una corrección invisible.
- Esto corre **por cada campo de cada fila** del Excel — una fila puede tener, por ejemplo, una
  corrección en `Equipo` y al mismo tiempo un error irrecuperable en `Cuartel`; en ese caso toda
  la fila se rechaza igual (ver [`AVANCE_SPRINT3.md`](../sprints/AVANCE_SPRINT3.md)).

## Cómo mantenerlo actualizado

Si cambia el umbral de distancia (`MAX_DISTANCE` en `catalogResolver.js`) o si algún campo pasa de
un lado del diagrama al otro (por ejemplo, si Región/Unidad/Cuartel alguna vez suman tolerancia a
tipeos), reflejarlo acá.
