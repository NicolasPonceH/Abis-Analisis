# Sprint 8 — Tablero de control y estadísticas operativas

**Fechas:** 6–12 oct 2026 · **Tag:** `v0.8.0` · **Objetivo del roadmap:** interfaz visual con gráficos y conteos (incautaciones acumuladas, estadísticas de vehículos, armas, drogas) consultando directamente el historial de la base de datos PostgreSQL.

## Qué se hizo

- `db.get_stats()` en `db.py`: una función que corre varias consultas `GROUP BY`/`COUNT` contra
  `documentos` y `entidades` y devuelve todo lo que necesita el tablero:
  - `total_documentos`: total de documentos guardados en el historial.
  - `por_categoria`: conteo de entidades por categoría (vehículo/arma/droga) — las
    "incautaciones acumuladas" que pide el roadmap.
  - `top_marcas_vehiculos`, `top_marcas_armas`, `top_sustancias`: los 5 valores más frecuentes
    de cada campo, vía `GROUP BY valor ORDER BY COUNT(*) DESC LIMIT 5`.
  - `documentos_por_dia`: conteo de documentos agrupado por fecha, para el gráfico de tendencia.
- `db.get_entidades_resumen()`: una fila por combinación categoría/campo/valor con su conteo —
  la base del reporte exportable.
- Ruta `GET /estadisticas` (`templates/estadisticas.html`): tarjetas KPI (documentos
  procesados, vehículos/armas/drogas detectados), un gráfico de línea (documentos por día) y uno
  de dona (distribución por categoría) con **Chart.js** vía CDN, y tres listas de "top 5" por
  campo.
- Ruta `GET /estadisticas/exportar.csv`: descarga el reporte de `get_entidades_resumen()` como
  CSV (`categoria,campo,valor,conteo`).
- El ítem "Estadísticas" del sidebar (`templates/base.html`), deshabilitado desde el rediseño de
  interfaz con la etiqueta "Próximamente", ahora enlaza a `/estadisticas`.

## Por qué se hizo

El RF-07 del SRS pide "conexión directa a PostgreSQL para la actualización automática de
tablas y dashboards estadísticos" y "conteos acumulativos y reportes estadísticos históricos
exportables" — eso es exactamente lo que hacen `get_stats()` (dashboard, consulta directa, sin
cache) y `get_entidades_resumen()` + el CSV (reporte exportable).

**Por qué sin tabla de agregados ni cache**: el volumen de esta app (procesar documentos uno por
uno desde una interfaz web, no un flujo masivo) no justifica la complejidad de mantener
contadores pre-calculados sincronizados — una consulta `GROUP BY` directa en cada carga de
página es más simple y suficientemente rápida a esta escala. Mismo criterio ya aplicado en
`list_history` (Sprint 7).

**Por qué Chart.js vía CDN y no matplotlib/gráficos generados en servidor**: el resto del
proyecto ya usa Tailwind vía CDN (Sprint del rediseño de interfaz) — sin paso de build, sin
dependencia nueva de Python. Chart.js sigue el mismo patrón: un `<script>` en el head de la
página, canvas en el HTML, datos inyectados desde Jinja con `|tojson`. Mantiene la stack
"ligera" del proyecto en vez de agregar una librería de gráficos en Python solo para este
sprint.

**Por qué top 5 y no todos los valores**: mostrar decenas de marcas o sustancias distintas sin
ranking no aporta a un "tablero de control" pensado para lectura rápida — el reporte completo
(sin recortar) sigue disponible vía el CSV exportable para quien necesite el detalle.

## explicacion

Se agregó un tablero de estadísticas: gráficos y números que muestran, de un vistazo, cuántos
documentos se han procesado en total, cuántos vehículos, armas y drogas se han detectado, y
cuáles son las marcas o sustancias que más se repiten. Toda esa información se calcula al
momento, consultando directamente la base de datos del sprint anterior — no hay números
guardados aparte que se puedan desactualizar — y se puede exportar como reporte descargable.

## Cómo verificar

### Requisitos previos

Ninguno adicional sobre el Sprint 7 — Chart.js se carga desde CDN, no es una dependencia de
Python.

### Pasos

```bash
python app.py
```

1. Con al menos un documento guardado en el historial (Sprint 7), ir a "Estadísticas" en el
   sidebar (ya no debe decir "Próximamente").
2. Confirmar que las 4 tarjetas KPI muestran números coherentes con lo que hay en `/historial`.
3. Confirmar que el gráfico de dona sí refleja los conteos de vehículos/armas/drogas, y que el
   gráfico de línea tiene un punto por cada fecha distinta con documentos guardados.
4. Revisar las tres listas de "top 5" — deben coincidir con las marcas/sustancias más repetidas
   en los documentos guardados.
5. Pulsar "Exportar CSV" — debe descargar un archivo con columnas
   `categoria,campo,valor,conteo`.
6. Caso límite: con el historial vacío (o con PostgreSQL detenido), la página no debe romperse —
   debe mostrar los mensajes de "sin datos todavía" / error de conexión, según corresponda.

Verificación por línea de comandos:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5000/estadisticas               # 200
curl -s http://127.0.0.1:5000/estadisticas/exportar.csv                                   # CSV
```

Verificación directa contra `db.py`, sin pasar por Flask:

```bash
python -c "
import json
import db
print(json.dumps(db.get_stats(), default=str, indent=2, ensure_ascii=False))
"
```

## Archivos modificados

`db.py`, `app.py`, `templates/base.html`, `templates/estadisticas.html` (nuevo).
