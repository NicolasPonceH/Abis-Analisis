# Informe de requerimientos — Sistema ABIS

Fuente: "Informe de Requerimientos" (18 de agosto de 2026). Transcrito al repositorio para que
quede versionado junto con el código — antes solo existía como PDF fuera del repo.

## 1. Descripción general

Sistema de Gestión ABIS: procesa, almacena y notifica estadísticamente los registros de
enrolamiento biométrico procesados diariamente. Consume un archivo Excel generado desde otra base
de datos, normaliza la información en un modelo relacional (PostgreSQL) y automatiza el envío de
informes gerenciales por Telegram.

## 2. Requerimientos funcionales

- **Módulo de ingesta de datos (ETL)**: carga automatizada o manual de un Excel diario; extraer
  la data cruda, transformarla según los catálogos definidos y cargarla en la BD relacional.
- **Normalización y limpieza**: resolver inconsistencias en el Excel (cruces entre Unidad,
  Cuartel, Región y Nacionalidad), mapeando texto libre a llaves foráneas.
- **Generación de reportes diarios**: métricas de sincronización (Sincronizado, Pendiente,
  Error), estados de registración y resúmenes por Unidad, Cuartel, Nacionalidad, Edad y Género.
- **Integración con Telegram**: bot que envía un mensaje estructurado (Markdown/HTML) con el
  resumen estadístico diario al finalizar la carga.

## 3. Requerimientos no funcionales

- **Base de datos**: motor relacional robusto (PostgreSQL) para más de 95.000 registros
  históricos acumulados, manteniendo integridad referencial.
- **Arquitectura tecnológica**: backend en Node.js (Express) — también contemplaba C#/.NET o
  Laravel como alternativas — con librería de lectura de Excel (`xlsx` en Node).
- **Seguridad**: token del bot de Telegram y credenciales de BD en variables de entorno.
- **Rendimiento**: la carga del Excel y la inserción masiva (bulk insert) deben ser asíncronas,
  sin bloquear el hilo principal.

## 4. Modelo de datos

Ver [`docs/diagramas/er-diagrama.md`](diagramas/er-diagrama.md) y [`db/schema.sql`](../db/schema.sql)
— implementados en Sprint 1, siguiendo el diseño 3NF de este informe.

## 5. Proceso de integración con Telegram (planificado, Sprint 6-7)

Una vez que el script de carga finaliza la inserción en la base de datos:

1. Se obtiene la fecha de proceso (ej. 13-08-2026).
2. Se consolidan los totales generales, sincronizados, con error y pendientes.
3. Se construye un mensaje formateado, por ejemplo:

   ```
   📊 *Reporte Diario ABIS - 13/08/2026* 📊

   *Sincronización PDI:*
   ✅ Sincronizados: 16 (100%)
   ❌ Errores: 0 (0%)

   *Estado General:*
   ✅ Registrados: 14 (87.5%)
   ⚠️ Con Error: 2 (12.5%)

   *Desglose Principal:*
   - Nacionalidades principales: ...
   - Cuarteles activos: ...
   ```

4. Se envía el payload vía `POST` a `https://api.telegram.org/bot<TOKEN>/sendMessage`,
   especificando el `chat_id` del grupo o canal correspondiente.

## Roadmap

Ver [`docs/diagramas/roadmap.md`](diagramas/roadmap.md) para la planificación completa de los 10
sprints, hitos críticos y convención de versionado.
