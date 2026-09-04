# Guía de Operación: Cómo Levantar y Operar el Sistema ABIS

Guía paso a paso para levantar el **Sistema ABIS** desde cero, poblar la base de datos con el archivo de datos reales (`New_Enrolados Abis.xlsx`), verificar la integridad y operar el sistema tanto por terminal como interactivamente a través del **Bot de Telegram**.

---

## 1. Verificar y Levantar la Base de Datos PostgreSQL

PostgreSQL corre en el puerto dedicado **`5433`** (`abis_db`). Para verificar que el servicio esté recibiendo conexiones:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h localhost -p 5433
```

Si responde `rejecting connections` o no responde, iniciarlo con el script desprendido:

```powershell
powershell -File "C:\Users\Nicolás\pgdata-abis-5433\ensure-running.ps1"
```

---

## 2. Preparar el Esquema y los Catálogos Maestros

Aplica el esquema normalizado (3NF) y los catálogos institucionales reales (68 nacionalidades con códigos ISO, 6 regiones, 23 unidades, 24 cuarteles, equipos y estados de proceso):

```powershell
npm run db:schema      # Crea las tablas e índices si no existen
npm run db:seed        # Carga los catálogos institucionales completos
npm run db:views       # Crea o actualiza las vistas de reporte analítico
npm run db:hardening   # Aplica el rol de seguridad con mínimos privilegios
```

---

## 3. Poblar la Base de Datos con Datos Reales (`New_Enrolados Abis.xlsx`)

Para cargar el dataset histórico completo (**95.474 registros reales**, 100% integrados y validados):

```powershell
npm run db:poblar
```

> **Resultado esperado:**
>
> - Procesa la hoja `ENROLADOS` de `New_Enrolados Abis.xlsx`.
> - Inserta los 95.474 registros en 20 lotes transaccionales (~20 segundos).
> - Rango de fechas cargadas: `2023-06-01` al `2026-08-22`.

### Validar Integridad de la Base de Datos:

```powershell
npm run validar-integridad
```

*Confirma que existan 0 nulos en campos obligatorios, 0 inconsistencias lógicas de edad y verifica el uso óptimo de índices en consultas analíticas (< 1 ms).*

---

## 4. Iniciar el Servidor Web y el Bot de Telegram

Inicia la API Express (`http://localhost:3000`) y el servicio de Long Polling del Bot de Telegram:

```powershell
npm start
```

> **Salida esperada:**
>
> ```text
> Sistema ABIS escuchando en http://localhost:3000
> 🤖 Bot de Telegram interactivo iniciado (Long Polling activo)...
> ```

*Deja esta terminal abierta para mantener los servicios activos.*

---

## 5. Comprobar la Salud y Endpoints HTTP (Opcional)

En tu navegador o desde otra terminal:

- **Salud del Sistema:** [http://localhost:3000/health](http://localhost:3000/health)*Respuesta:* `{"status":"ok","db":"connected"}`
- **Reporte Diario (JSON estructurado del último día):** [http://localhost:3000/reporte-diario](http://localhost:3000/reporte-diario)
- **Reporte de Fecha Específica:** [http://localhost:3000/reporte-diario?fecha=2024-11-15](http://localhost:3000/reporte-diario?fecha=2024-11-15)

---

## 6. Operar Interactivamente mediante Telegram Bot

Abre la aplicación de **Telegram**, entra al chat con tu bot (`@AbisSystemBot`) y utiliza los siguientes comandos:

| Comando                                  | Descripción                                                                                                                                                                                               | Ejemplo de Uso                                                                                                                                 |
| :--------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| `/reporte` o `/hoy`                  | Genera el reporte consolidado del día más reciente con datos (`22/08/2026`).                                                                                                                           | `/reporte`                                                                                                                                   |
| `/reporte YYYY-MM-DD`                  | Genera el reporte analítico oficial de cualquier fecha histórica.                                                                                                                                        | `/reporte 2024-11-15` *(4.305 enrolamientos)*`/reporte 2023-08-08` *(178 enrolamientos)*`/reporte 2025-01-09` *(52 enrolamientos)* |
| `/errores [YYYY-MM-DD]` o `/detalle` | Diagnóstico técnico detallado: desglose de**Falla Biométrica** (lector Suprema / cámara Canon) vs **Validación General**, dispositivos (Tablet/PC), cuarteles y nacionalidades afectadas. | `/errores 2024-11-15/errores 2025-01-09`                                                                                                     |
| `/estado`                              | Muestra el estado del servidor, conexión a PostgreSQL y el**total histórico acumulado (95.474 registros)**.                                                                                        | `/estado`                                                                                                                                    |
| `/logs`                                | Muestra el informe técnico de la última ingesta del ETL (`New_Enrolados Abis.xlsx`, 95.474 insertadas, 0 rechazadas).                                                                                  | `/logs`                                                                                                                                      |
| `/ayuda`                               | Despliega la guía interactiva de todos los comandos disponibles.                                                                                                                                          | `/ayuda`                                                                                                                                     |

---

## 7. Ejecutar Flujos por Terminal (Comandos CLI)

Todos los comandos están configurados para usar por defecto `New_Enrolados Abis.xlsx`:

- **Previsualizar ingesta sin escribir en BD:**
  ```powershell
  npm run ingest
  ```
- **Procesar e insertar por lotes:**
  ```powershell
  npm run etl
  ```
- **Flujo diario completo (Ingesta → ETL → BD → Telegram):**
  ```powershell
  npm run flujo-diario
  ```
- **Forzar envío de reporte de una fecha por Telegram:**
  ```powershell
  npm run telegram:enviar -- 2024-11-15
  ```

---

## 8. Seguridad, Privacidad y Cifrado

El Sistema ABIS implementa las siguientes capas de seguridad:

1. **Privacidad por Diseño (Privacy by Design):** La base de datos `registro_enrolamiento` almacena exclusivamente datos demográficos y métricas normalizadas referenciadas por ID de catálogo. **No se almacenan nombres ni números de RUT en texto plano**.
2. **Cifrado en Tránsito:** Todas las notificaciones y mensajes con Telegram viajan cifrados mediante **HTTPS / TLS 1.3**. Las conexiones a PostgreSQL soportan SSL/TLS.
3. **Aislamiento de Credenciales:** Variables de entorno sensibles (tokens del bot, credenciales de BD) residen en `.env` protegido y excluido del control de versiones.

---

## 9. Limpieza de Datos y Apagado

- **Limpiar tabla de enrolamientos (dejar catálogos intactos):**
  ```powershell
  npm run db:limpiar
  ```
- **Apagar Servidor y Bot:** Presionar `Ctrl + C` en la terminal de `npm start`.
- **Detener PostgreSQL (opcional):**
  ```powershell
  & "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Users\Nicolás\pgdata-abis-5433" stop
  ```
