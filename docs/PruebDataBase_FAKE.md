---
title: "Prueba de Base de Datos Ficticia (PruebDataBase_FAKE)"
subtitle: "Simulación de la BD fuente que genera el Excel diario — Sistema ABIS"
---

**Proyecto:** Sistema ABIS
**Fecha de implementación:** 25 de agosto de 2026
**Estado:** Implementado y verificado end-to-end

## 1. Propósito

El informe de requerimientos define que el sistema consume *"un archivo Excel generado desde otra
base de datos"*. Esa base de datos origen **no existe todavía** (es el prerrequisito 2 del
[`PLAN_DESPLIEGUE.md`](PLAN_DESPLIEGUE.md)), así que hasta ahora el flujo diario se probaba con
Excels estáticos de `fixtures/`.

Este módulo simula esa pieza faltante localmente, para cerrar el ciclo completo de forma
automática:

```
[abis_fuente (ficticia)] --07:30--> Excel con fecha --> [flujo ABIS 08:00] --> abis_db --> Telegram
     (lo nuevo, este doc)          carpeta de llegada      (ya existía)
```

Con esto la tarea de las 08:00 deja de depender de un archivo de prueba fijo: cada día procesa un
Excel nuevo con datos nuevos, generados por la simulación.

**No reemplaza nada**: ni el esquema de `abis_db`, ni los fixtures de QA (siguen siendo la base de
las pruebas reproducibles de los sprints), ni la versión paralela desplegada en Supabase.

## 2. Componentes

| Componente | Qué hace |
|---|---|
| `scripts/fuente-setup.js` (`npm run fuente:setup`) | Crea la BD **`abis_fuente`** en la misma instancia del puerto 5433 (si no existe) y aplica su esquema. Idempotente. |
| `scripts/fuente-generar.js` (`npm run fuente:generar`) | Inserta entre `--min` (40) y `--max` (150) registros aleatorios fechados hoy en `enrolamiento_origen`, con ruido inyectado. Se niega a duplicar una fecha ya poblada salvo `--forzar`. |
| `scripts/fuente-exportar.js` (`npm run fuente:exportar`) | Exporta los registros de una fecha al Excel de la carpeta de llegada. Acepta `--fecha YYYY-MM-DD`. |
| `scripts/tarea-fuente.ps1` | Wrapper de la tarea programada de las 07:30: garantiza PostgreSQL arriba (igual que `tarea-diaria.ps1`) → genera → exporta. Log en `logs/fuente-diario.log`. |
| Tarea programada **`ABIS-FuenteDiaria`** | Diaria a las **07:30**, corre `tarea-fuente.ps1`. |
| Carpeta de llegada | `%USERPROFILE%\Documents\ABIS_excel_diario\` — archivos `enrolamiento_AAAA-MM-DD.xlsx`. Simula la carpeta del sistema origen. |

### Cambio en la tarea existente

`tarea-diaria.ps1` (tarea de las 08:00) ya no apunta a un archivo fijo: **busca el
`enrolamiento_*.xlsx` más reciente** en la carpeta de llegada (ordenar por nombre = ordenar por
fecha). Si no hay ninguno, pasa una ruta inexistente a propósito para que el flujo dispare su
alerta de Telegram en vez de fallar en silencio. Si la carpeta de llegada no existe o se quiere
volver al comportamiento anterior, el placeholder original era
`fixtures\enrolamiento_etl_prueba.xlsx`.

## 3. Diseño de los datos generados

### Distribuciones base (ponderadas, realistas)

| Campo | Valores |
|---|---|
| Nacionalidad | CHILE 30%, VENEZUELA 25%, BOLIVIA 12%, PERU 12%, COLOMBIA 10%, ECUADOR 6%, ARGENTINA 5% |
| Jerarquía | Solo combinaciones válidas de los catálogos sembrados (PREPOLIN ARICA → COLCHANES/ANGAMOS/CHACALLUTA) |
| Equipo | PC DE ESCRITORIO 70%, TABLET 30% |
| Género | M 55%, F 40%, X 5% |
| Edad | 15% menores (0–17, siempre con `edad_exacta` y `mayor_edad=NO`); adultos 18–75 (con edad solo el 60% de las veces) |
| Sincronización | SINCRONIZADO 88%, PENDIENTE 9%, ERROR 3% |
| Estado general | Correlacionado: si sincronización es ERROR → casi siempre CON_ERROR |

### Ruido inyectado a propósito (para ejercitar el ETL)

| Ruido | Frecuencia | Efecto esperado en el flujo |
|---|---|---|
| Tipeo de 1 caracter en nacionalidad/equipo/estados | ~3% por fila | El ETL lo **corrige** automáticamente (Levenshtein ≤ 2, Sprint 3) y registra la corrección |
| Nacionalidad desconocida (MARCIANO/ATLANTIDA/NARNIA) | ~1% | Fila **rechazada**; el reporte avisa "N fila(s) no se pudieron procesar" |
| Cuartel válido bajo unidad equivocada (JENATID) | ~1% | Rechazo exacto de jerarquía (el mapeador no corrige jerarquías, por diseño) |

La fuente es deliberadamente "sucia" (texto libre, sin llaves foráneas): normalizar es trabajo del
ETL, no de la simulación.

## 4. Detalles técnicos relevantes

1. **`abis_fuente` es otra base, mismo servidor**: `fuente-setup.js` toma `DATABASE_URL` y le
   cambia solo el nombre de la base. No hay variables nuevas en `.env`.
   `CREATE DATABASE` no puede correr dentro de una transacción/multi-statement, por eso el setup
   la crea con una consulta propia contra la BD `postgres` antes de aplicar el DDL.
2. **Bug encontrado y corregido durante la verificación**: node-pg parsea las columnas `DATE` como
   objetos `Date` de JavaScript; serializarlos produce `"Tue Aug 25 2026 ..."` en vez de
   `"YYYY-MM-DD"` y el mapeador rechazó las 61 filas (se detectó como `alerta_vacio`). Fix:
   el exportador selecciona todas las columnas con `::text` — misma trampa de zona horaria ya
   documentada en `src/ingest/catalogMapper.js`.
3. **Exportar una fecha sin filas igual escribe el Excel** (solo cabeceras): así la tarea de las
   08:00 procesa un Excel vacío y dispara su alerta diseñada ("archivo sin datos"), en vez de
   reprocesar el Excel del día anterior duplicando registros.
4. **Log UTF-8 vs PS 5.1**: los wrappers redirigen la salida de node vía `cmd.exe /c "... >> log"`
   porque el `>>` nativo de PowerShell 5.1 escribe UTF-16 y mezcla ilegible en el log (mismo
   criterio ya aplicado en `tarea-diaria.ps1`).
5. Al leer `logs/fuente-diario.log` con `Get-Content` en PS 5.1 los acentos pueden verse raros
   (`Nicolǭs`) — es solo el visor interpretando UTF-8 como ANSI; el contenido del log es correcto.

## 5. Verificación realizada (25/08/2026)

1. `npm run fuente:setup` → BD creada + esquema aplicado.
2. `npm run fuente:generar` → **61 filas** (rango 40–150): 2 tipeos corregibles, 1 nacionalidad
   desconocida, 0 jerarquías inválidas.
3. `npm run fuente:exportar` → `Documents\ABIS_excel_diario\enrolamiento_2026-08-25.xlsx`.
4. Re-corrida del wrapper de las 07:30 → la generación se negó a duplicar la fecha (exit 0) y
   re-exportó sin problema: idempotencia OK.
5. Flujo completo (`tarea-diaria.ps1`) → **60 insertadas, 1 rechazada**, reporte enviado por
   Telegram (`Resultado: reporte`, exit 0).
6. Validación en BD: distribución de nacionalidades según ponderaciones; géneros M 32 / F 26 /
   X 2; 44 adultos / 16 menores (edades 0–16).

## 6. Operación manual

```powershell
# Simular un dia completo a mano (generar + exportar + procesar + notificar):
npm run fuente:generar
npm run fuente:exportar
npm run flujo-diario -- "$env:USERPROFILE\Documents\ABIS_excel_diario\enrolamiento_2026-08-25.xlsx"

# Regenerar mas datos para una fecha ya poblada (ej. pruebas de estres):
node scripts/fuente-generar.js --fecha 2026-08-25 --min 500 --max 800 --forzar

# Ver/recrear la estructura de la fuente:
npm run fuente:setup
```

Para limpiar un día cargado por error en `abis_db`:
`TRUNCATE registro_enrolamiento RESTART IDENTITY;` (borra todo el historial — usar con cuidado).

## 7. Limitaciones conocidas

- La jerarquía válida generada es monótona (todo PREPOLIN ARICA) porque los catálogos de ejemplo
  solo tienen cuarteles para esa unidad. Cuando se carguen los catálogos institucionales reales,
  ampliar `JERARQUIA_VALIDA` en `fuente-generar.js`.
- Si el PC estaba apagado a las 07:30, la simulación no corre y a las 08:00 el flujo procesará el
  Excel del último día disponible (o alertará si no hay ninguno). Es la misma limitación de
  sesión/equipo ya documentada en `MANUAL_OPERACION.md` — y la razón de ser de la versión
  paralela en Supabase.
- El volumen generado es ficticio; cuando haya datos reales de referencia diaria, ajustar
  `--min`/`--max` (o los defaults en `parsearArgumentos()`).

## 8. Relación con el despliegue real

Cuando exista la BD origen real y su carpeta de llegada, la migración es trivial: apuntar
`tarea-diaria.ps1` a la carpeta real (ya busca el más reciente por patrón de nombre) y desactivar
`ABIS-FuenteDiaria`
(`Unregister-ScheduledTask -TaskName "ABIS-FuenteDiaria" -Confirm:$false`). Todo el resto del
sistema no cambia.
