---
title: "Informe de Avance — Sprint 5"
subtitle: "Sistema de Gestión Automatizada de Identificación Biométrica (ABIS)"
---

**Proyecto:** Sistema ABIS
**Periodo del ciclo:** 15 de septiembre de 2026 – 21 de septiembre de 2026
**Fecha de presentación:** 20 de agosto de 2026

## 1. Objetivo del ciclo

Según la hoja de ruta del proyecto, el Sprint 5 tiene como objetivo el **cálculo de métricas y
agrupaciones**, con el siguiente entregable comprometido:

- Consultas SQL para resúmenes (sincronizado, errores, estados).
- Creación de vistas (views) en la base de datos para facilitar reportes.
- Endpoints o funciones internas que generen la data del reporte diario.

## 2. Trabajo realizado

### 2.1. Vistas SQL (`db/views.sql`)

| Vista | Qué agrupa |
|---|---|
| `vw_resumen_estado_diario` | Por fecha + dominio de estado (`SINCRONIZACION`/`REGISTRO`/`GENERAL`) + descripción — un `UNION ALL` de las tres FK independientes de `registro_enrolamiento` hacia `estado_proceso` |
| `vw_resumen_nacionalidad_diario` | Por fecha + nacionalidad |
| `vw_resumen_cuartel_diario` | Por fecha + cuartel ("cuarteles activos" del mensaje de Telegram) |
| `vw_total_diario` | Total de enrolamientos por fecha, base para calcular porcentajes |

Todas usan `CREATE OR REPLACE VIEW` (idempotentes) y se aplican con `npm run db:views`, siguiendo
el mismo patrón que `db:schema`/`db:seed`. Se apoyan directamente en los índices agregados en
Sprint 4 (`idx_registro_estado_*`), así que agrupan sin escanear toda la tabla histórica.

### 2.2. Módulo de reporte diario (`src/reportes/reporteDiario.js`)

`obtenerReporteDiario(pool, fecha)` consulta las vistas para una fecha dada y arma un objeto
estructurado con conteos **y porcentajes ya calculados** (redondeados a 1 decimal): estado de
sincronización, estado de registro, estado general, nacionalidades principales (top 5), cuarteles
activos, unidades activas, género y edad (mayor/menor) — los cinco desgloses que pide la sección 2
del informe de requerimientos ("resúmenes por Unidad, Cuartel, Nacionalidad, Edad y Género") más
los tres dominios de estado de la sección 5. Ver el addendum al final de este informe: las vistas
de Unidad/Género/Edad se agregaron después del cierre inicial del sprint, al auditar el proyecto
completo contra el informe.

**Decisión de alcance**: esta función devuelve JSON estructurado, no el mensaje de Telegram ya
formateado en Markdown — eso es explícitamente Sprint 6-7 ("Diseño del template del mensaje"),
que va a consumir esta misma función en vez de reimplementar las consultas.

### 2.3. Endpoint `GET /reporte-diario`

Agregado a `src/server.js`, junto a `/health`:

- `GET /reporte-diario?fecha=2026-09-15` — reporte de esa fecha.
- `GET /reporte-diario` (sin `fecha`) — usa automáticamente la fecha de enrolamiento más reciente
  que haya en la base.
- Fecha con formato inválido → `400` con mensaje de error.
- Fecha válida pero sin registros ese día → `200` con todos los desgloses vacíos y `total: 0` (no
  es un error, simplemente no hubo carga ese día).

### 2.4. Verificación con datos determinísticos

A diferencia de Sprint 4 (carga aleatoria para probar volumen), acá se necesitaba un dataset con
porcentajes **exactos y conocidos de antemano** para poder verificar el cálculo a mano. Se creó
`scripts/generar-datos-reporte-prueba.js`: 10 filas fijas en la fecha `2026-09-15`, con una
distribución armada para dar porcentajes redondos — ver el detalle completo en la sección de
verificación más abajo.

## 3. Estado del entregable

**Completo.** Los tres puntos comprometidos están implementados y verificados: las consultas
existen como vistas reutilizables, y el endpoint devuelve exactamente los porcentajes esperados
contra un dataset de control. Ver el addendum (sección 5) sobre las tres vistas agregadas después
del cierre inicial para cubrir Unidad/Edad/Género.

## 4. Cómo reproducir esta verificación

Con la base de datos arriba (ver
[Solución de problemas comunes](../../README.md#solución-de-problemas-comunes) si no lo está),
desde la raíz del proyecto:

**1. Aplicar las vistas nuevas:**

```powershell
npm run db:views
```

**2. Confirmar que la tabla está vacía e insertar el dataset de prueba determinístico:**

```powershell
$env:PGPASSWORD = "abis_dev_pw"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "SELECT count(*) FROM registro_enrolamiento;"
npm run datos-reporte-prueba
```

Salida esperada: `Insertadas 10 filas de prueba en la fecha 2026-09-15.`

*Por qué 10 filas y no más*: están armadas a mano para dar porcentajes exactos y fáciles de
verificar — 7 sincronizados/2 pendientes/1 error (70%/20%/10%), 8 registrados/2 pendientes
(80%/20%), 9 general OK/1 con error (90%/10%), y una mezcla de nacionalidades y cuarteles con
proporciones igual de redondas (ver la tabla de arrays en el script).

**3. Levantar el servidor y consultar el reporte de esa fecha:**

```powershell
npm start
```

En otra terminal:

```powershell
(Invoke-WebRequest "http://localhost:3000/reporte-diario?fecha=2026-09-15").Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**Ojo**: en PowerShell, `curl` es un alias de `Invoke-WebRequest` cuya salida por defecto trunca
el campo `Content` (se ve como `...`) — no muestra el JSON completo, aunque la respuesta sí lo
tenga entero (`Content-Length` en la respuesta cruda lo confirma). El comando de arriba extrae
`.Content` y lo formatea completo. Alternativa más simple si tenés el `curl.exe` real instalado
(no el alias): `curl.exe "http://localhost:3000/reporte-diario?fecha=2026-09-15"`.

Salida esperada (resumida):

```json
{
  "fecha": "2026-09-15",
  "total": 10,
  "sincronizacion": [
    { "descripcion": "SINCRONIZADO", "total": 7, "porcentaje": 70 },
    { "descripcion": "PENDIENTE", "total": 2, "porcentaje": 20 },
    { "descripcion": "ERROR", "total": 1, "porcentaje": 10 }
  ],
  "registro": [
    { "descripcion": "REGISTRADO", "total": 8, "porcentaje": 80 },
    { "descripcion": "PENDIENTE", "total": 2, "porcentaje": 20 }
  ],
  "general": [
    { "descripcion": "OK", "total": 9, "porcentaje": 90 },
    { "descripcion": "CON_ERROR", "total": 1, "porcentaje": 10 }
  ],
  "nacionalidadesPrincipales": [
    { "nacionalidad": "VENEZUELA", "total": 4, "porcentaje": 40 },
    { "nacionalidad": "CHILE", "total": 3, "porcentaje": 30 },
    { "nacionalidad": "PERU", "total": 2, "porcentaje": 20 },
    { "nacionalidad": "BOLIVIA", "total": 1, "porcentaje": 10 }
  ],
  "cuartelesActivos": [
    { "cuartel": "COLCHANES", "total": 4, "porcentaje": 40 },
    { "cuartel": "ANGAMOS", "total": 3, "porcentaje": 30 },
    { "cuartel": "CHACALLUTA", "total": 3, "porcentaje": 30 }
  ],
  "unidadesActivas": [
    { "unidad": "PREPOLIN ARICA", "total": 10, "porcentaje": 100 }
  ],
  "genero": [
    { "genero": "F", "total": 5, "porcentaje": 50 },
    { "genero": "M", "total": 5, "porcentaje": 50 }
  ],
  "edad": [
    { "categoria": "MAYOR DE EDAD", "total": 9, "porcentaje": 90 },
    { "categoria": "MENOR DE EDAD", "total": 1, "porcentaje": 10 }
  ]
}
```

*Nota sobre `unidadesActivas`*: da 100% para `PREPOLIN ARICA` porque el seed de catálogos
(`db/seed_catalogos.sql`) solo tiene cuarteles bajo esa unidad — no es un error, simplemente no
hay otra unidad con cuarteles cargados para comparar. El resultado sigue siendo exacto y
verificable.

*Por qué*: si estos números coinciden exactamente con el dataset insertado en el paso 2, confirma
que las siete vistas y el cálculo de porcentajes funcionan bien — no hay margen para "más o menos
correcto" con un dataset armado a mano.

**4. Probar los casos límite:**

```powershell
curl "http://localhost:3000/reporte-diario"                      # sin fecha -> usa la mas reciente (2026-09-15)
curl "http://localhost:3000/reporte-diario?fecha=no-es-fecha"    # fecha invalida -> 400
curl "http://localhost:3000/reporte-diario?fecha=2020-01-01"     # fecha sin datos -> total: 0, listas vacias
```

*Por qué*: confirma que el endpoint no asume que siempre hay una fecha explícita ni que siempre
hay datos — ambos son casos reales una vez que este endpoint se use en producción.

**5. Limpiar los datos de prueba:**

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -d abis_db -c "TRUNCATE registro_enrolamiento RESTART IDENTITY;"
```

## 5. Addendum: resúmenes por Unidad, Edad y Género

Al auditar el proyecto completo contra el informe de requerimientos (no solo contra la fila del
roadmap de este sprint), se detectó que la sección 2 ("Generación de Reportes Diarios") pide
explícitamente "resúmenes por **Unidad, Cuartel, Nacionalidad, Edad y Género**", y el cierre
inicial de este sprint solo cubría Cuartel y Nacionalidad. El ejemplo de mensaje de Telegram de la
sección 5 tampoco los muestra explícitamente, pero el requerimiento funcional sí los pide, así que
se cerró el gap en vez de dejarlo pendiente para un sprint posterior.

**Agregado**: tres vistas más en `db/views.sql` (`vw_resumen_unidad_diario`,
`vw_resumen_genero_diario`, `vw_resumen_edad_diario`), sumadas a `obtenerReporteDiario()` como
`unidadesActivas`, `genero` y `edad`. `vw_resumen_edad_diario` agrupa por mayor/menor de edad
(`es_mayor_edad`), no por edad exacta — el informe aclara que `edad_exacta` es "opcional, para la
distribución de N.N.A. (0 a 17)", no para exponer la edad puntual de adultos en un reporte.

Este addendum no reabre el tag `v0.5.0` — el commit queda en el historial normal, no se creó un
tag nuevo para esto (no es un sprint distinto, es una corrección al mismo sprint).

## 6. Próximos pasos (Sprint 6, 22–28 sep)

Según la hoja de ruta, el siguiente ciclo corresponde a la **configuración del bot de Telegram**:

- Creación del bot en BotFather y obtención de un token seguro.
- Configuración del cliente HTTP para la API de Telegram.
- Diseño del template del mensaje en formato Markdown — que va a tomar la data de
  `obtenerReporteDiario()` (ya lista desde este sprint) y formatearla como el mensaje de ejemplo
  de la sección 5 del [informe de requerimientos](../informe-requerimientos.md).
