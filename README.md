# Sistema ABIS + SIAD

Plataforma unificada para la gestión de enrolamiento biométrico, reportería operacional, ingesta desde Oracle y análisis documental.

El proyecto integra en una sola aplicación:

- **ABIS:** monitoreo de enrolamientos biométricos, métricas, ETL, auditoría, exportaciones y notificaciones.
- **SIAD:** análisis documental, OCR, extracción de entidades, búsqueda, historial y estadísticas.
- **PostgreSQL:** base de datos unificada `Abis_OCR`, con catálogos normalizados, historial de ingestas y persistencia documental.

> Este repositorio contiene código institucional y datos potencialmente sensibles. Nunca se deben subir credenciales, respaldos reales ni archivos de producción.

## Vista general

```mermaid
flowchart LR
    Oracle[(Oracle ABIS)] -->|JSON / consulta aprobada| API[API de integración ABIS]
    Excel[Excel exportado desde Oracle] --> Ingesta[Ingesta ABIS]
    API --> ETL[Validación y normalización ETL]
    Ingesta --> ETL
    ETL --> PG[(PostgreSQL Abis_OCR)]

    PG --> Dashboard[Dashboard ABIS]
    PG --> Reportes[Word / Excel / CSV / JSON]
    PG --> Telegram[Telegram institucional]

    Documentos[PDF e imágenes] --> SIAD[SIAD Flask]
    SIAD --> OCR[OCR y extracción de entidades]
    OCR --> PG
    PG --> Historial[Historial y búsqueda documental]
```

## Capturas de la plataforma

### Inicio de sesión ABIS

El acceso principal de ABIS valida las credenciales institucionales antes de habilitar el dashboard y los módulos operativos.

![Login ABIS](docs/screenshots/2026-10-13/01-abis-login.png)

### Dashboard ejecutivo ABIS

El panel principal permite consultar una fecha específica, los últimos siete días o el histórico acumulado. Muestra el total de enrolamientos, sincronización con PDI, eficacia biométrica, inconsistencias, rendimiento por cuartel y nacionalidades.

![Dashboard ejecutivo ABIS](docs/screenshots/2026-10-13/02-abis-dashboard.png)

### Panel de métricas y exportaciones

Desde el panel se pueden actualizar las métricas y generar documentos Word, Excel, CSV, JSON e impresión. Los reportes pueden consultar una jornada, un rango de fechas o el acumulado.

![Métricas ABIS](docs/screenshots/2026-10-13/04-abis-tendencias.png)

### Módulo de ingesta ABIS

La ingesta acepta archivos `.xlsx` y archivos protegidos `.enc` con AES-256-GCM. El archivo se procesa en memoria, se valida, se normaliza contra los catálogos y se inserta por lotes en PostgreSQL.

![Ingesta ABIS](docs/screenshots/2026-10-13/03-abis-ingesta.png)

### Ajustes del sistema ABIS

El módulo de Ajustes concentra las preferencias generales, programación de reportes, configuración de cuenta y administración de usuarios.

![Ajustes generales ABIS](docs/screenshots/2026-10-13/06-abis-ajustes-general.png)

![Administración de usuarios ABIS](docs/screenshots/2026-10-13/09-abis-ajustes-administracion.png)

### Inicio de sesión del módulo SIAD

SIAD utiliza autenticación de usuarios y roles para controlar el acceso al análisis documental.

![Inicio de sesión SIAD](docs/screenshots/2026-10-13/10-siad-login.png)

### Historial documental SIAD

El módulo documental permite consultar los documentos procesados, sus resúmenes y las entidades detectadas.

![Historial documental SIAD](docs/screenshots/2026-10-13/12-siad-historial.png)

### Estadísticas SIAD

El panel presenta tendencias y distribución de la información extraída desde los documentos.

![Estadísticas SIAD](docs/screenshots/2026-10-13/13-siad-estadisticas.png)

### Galería completa de capturas Playwright

Las siguientes imágenes fueron generadas desde la aplicación ejecutándose localmente con Playwright el `2026-10-13`.

#### ABIS

| Módulo | Captura |
|---|---|
| Login ABIS | [01-abis-login.png](docs/screenshots/2026-10-13/01-abis-login.png) |
| Dashboard | [02-abis-dashboard.png](docs/screenshots/2026-10-13/02-abis-dashboard.png) |
| Ingesta e historial de lotes | [03-abis-ingesta.png](docs/screenshots/2026-10-13/03-abis-ingesta.png) |
| Evolución y tendencias | [04-abis-tendencias.png](docs/screenshots/2026-10-13/04-abis-tendencias.png) |
| Bitácora y auditoría | [05-abis-auditoria.png](docs/screenshots/2026-10-13/05-abis-auditoria.png) |
| Ajustes generales | [06-abis-ajustes-general.png](docs/screenshots/2026-10-13/06-abis-ajustes-general.png) |
| Ajustes de horarios | [07-abis-ajustes-horarios.png](docs/screenshots/2026-10-13/07-abis-ajustes-horarios.png) |
| Cuenta | [08-abis-ajustes-cuenta.png](docs/screenshots/2026-10-13/08-abis-ajustes-cuenta.png) |
| Administración de usuarios | [09-abis-ajustes-administracion.png](docs/screenshots/2026-10-13/09-abis-ajustes-administracion.png) |

#### SIAD

| Módulo | Captura |
|---|---|
| Login SIAD | [10-siad-login.png](docs/screenshots/2026-10-13/10-siad-login.png) |
| Procesamiento OCR | [11-siad-procesamiento.png](docs/screenshots/2026-10-13/11-siad-procesamiento.png) |
| Historial documental | [12-siad-historial.png](docs/screenshots/2026-10-13/12-siad-historial.png) |
| Estadísticas operativas | [13-siad-estadisticas.png](docs/screenshots/2026-10-13/13-siad-estadisticas.png) |
| Configuración general | [14-siad-configuracion-general.png](docs/screenshots/2026-10-13/14-siad-configuracion-general.png) |
| Administración SIAD | [15-siad-administracion.png](docs/screenshots/2026-10-13/15-siad-administracion.png) |

## Módulos del sistema

### 1. ABIS: panel ejecutivo

El dashboard ABIS trabaja sobre `registro_enrolamiento` y sus catálogos relacionados. Sus funciones principales son:

- Filtro por fecha operativa.
- Vista de última jornada, últimos siete días e histórico acumulado.
- Total de enrolamientos procesados.
- Registros sincronizados, pendientes y con error.
- Estado del registro biométrico.
- Inconsistencias y errores.
- Rendimiento por región, unidad y cuartel.
- Distribución por nacionalidad, género, mayoría de edad, profesión y equipo.
- Comparación de períodos y tendencias históricas.
- Reportes oficiales en Word, Excel, CSV y JSON.
- Envío manual y programado de reportes a Telegram.

### 2. ABIS: ingesta de datos

La ingesta admite dos modalidades:

1. **Archivo Excel:** carga de `.xlsx` o `.xlsm`.
2. **Hoja de cálculo:** copiar y pegar filas desde Oracle, Excel u otra fuente autorizada.

El flujo es:

1. Se solicita la credencial de autorización.
2. Se recibe el archivo o las filas pegadas.
3. Se validan encabezados y formatos.
4. Se normalizan nombres de nacionalidades, unidades, cuarteles, profesiones y estados.
5. Se validan fechas con formato `YYYY-MM-DD`.
6. Se convierten los valores de texto a los identificadores de los catálogos PostgreSQL.
7. Se insertan los registros en lotes transaccionales.
8. Se calcula la huella SHA-256 del archivo cuando corresponde.
9. Se registra el lote en el historial de ingestas.

El historial permite consultar quién cargó cada lote, cuándo se procesó, cuántas filas fueron recibidas, válidas, insertadas o rechazadas. Un administrador puede eliminar un lote desde la interfaz, previa validación de contraseña, sin utilizar la terminal.

### 3. Integración Oracle → ABIS

El endpoint de integración previsto es:

```http
POST /api/oracle/populate
```

La integración está diseñada para que Oracle entregue los datos mediante una vista o consulta aprobada, sin exponer las consultas internas al equipo que mantiene ABIS. Las credenciales de Oracle deben existir únicamente en variables de entorno del servidor y nunca en Git.

El contrato lógico de los registros contiene estos campos:

| Campo | Descripción |
|---|---|
| `fecha_enrolamiento` | Fecha en formato `YYYY-MM-DD`. |
| `nacionalidad` | País o nacionalidad del enrolado. |
| `unidad` | Unidad policial. |
| `cuartel` | Cuartel asociado a la unidad. |
| `equipo` | `PC DE ESCRITORIO` o `TABLET`. |
| `genero` | `M`, `F` o `X`. |
| `mayor_edad` | Booleano que indica si tiene 18 años o más. |
| `edad_exacta` | Edad numérica, cuando esté disponible. |
| `profesion` | Profesión u oficio. |
| `estado_sincronizacion` | `SINCRONIZADO`, `PENDIENTE` o `ERROR`. |
| `estado_registro` | `REGISTRADO`, `PENDIENTE` o `ERROR`. |
| `estado_general` | `OK`, `CON_ERROR`, `REGISTRADO` o `ERROR`. |

Ejemplo de cuerpo JSON:

```json
{
  "registros": [
    {
      "fecha_enrolamiento": "2026-10-09",
      "nacionalidad": "CHILENA",
      "unidad": "UNIDAD CENTRAL",
      "cuartel": "CUARTEL 1",
      "equipo": "PC DE ESCRITORIO",
      "genero": "M",
      "mayor_edad": true,
      "edad_exacta": 35,
      "profesion": "INGENIERO",
      "estado_sincronizacion": "SINCRONIZADO",
      "estado_registro": "REGISTRADO",
      "estado_general": "OK"
    }
  ]
}
```

Para cargas de fin de semana, Oracle puede enviar el lunes los registros del viernes, sábado y domingo en una sola carga. La trazabilidad se conserva mediante el lote de ingesta y la fecha de cada registro:

```json
{
  "periodo": {
    "desde": "2026-10-09",
    "hasta": "2026-10-11"
  },
  "registros": []
}
```

La autenticación de los endpoints sensibles utiliza sesión JWT de ABIS y validación de la credencial institucional mediante el servicio SIAD. En un despliegue productivo se recomienda agregar una credencial de integración dedicada para Oracle, con permisos limitados y rotación controlada.

### 4. SIAD: análisis documental

SIAD es el módulo Python/Flask integrado en el mismo sistema. Sus capacidades son:

- Carga y procesamiento de PDF e imágenes.
- OCR con Tesseract y PyMuPDF.
- Extracción de entidades de personas, vehículos, armas y drogas.
- Generación de resúmenes locales.
- Búsqueda por fechas, categorías y palabras clave.
- Historial de documentos procesados.
- Dashboard de estadísticas y tendencias.
- Exportación de reportes documentales.
- Gestión de usuarios y roles.

El servidor Node de ABIS inicia y expone SIAD internamente en el puerto `5001`, mientras que ABIS queda disponible normalmente en el puerto `3000`.

### 5. Seguridad y administración

El sistema contempla:

- Sesiones JWT con cookie HTTP-only.
- Roles `admin` y `operador`.
- Panel de administración para crear usuarios, cambiar roles y restablecer contraseñas.
- Eliminación de usuarios con popup animado y validación de contraseña.
- Protección contra eliminar la propia cuenta.
- Protección contra eliminar al último administrador.
- Contraseñas almacenadas mediante hash en SIAD.
- Cifrado AES-256-GCM para archivos protegidos.
- Huellas SHA-256 para auditoría e integridad.
- Historial de ingestas y trazabilidad por lote.
- Separación entre variables de entorno y código fuente.

## Modelo de datos

La base principal es PostgreSQL y se identifica como `Abis_OCR`. ABIS utiliza un modelo normalizado con catálogos para evitar duplicidad de información:

- `registro_enrolamiento`: hechos de enrolamiento biométrico.
- `nacionalidad`: catálogo de países y códigos ISO.
- `region`: regiones institucionales.
- `unidad`: unidades asociadas a regiones.
- `cuartel`: cuarteles asociados a unidades.
- `equipo`: tipos de equipo de captura.
- `profesion`: profesiones y oficios.
- `estado_proceso`: estados de sincronización, registro y estado general.
- `ingesta_lote`: historial y trazabilidad de cargas.
- `registro_auditoria_cifrada`: eventos auditables.
- `documentos`: documentos procesados por SIAD.
- `entidades_personas`, `entidades_vehiculos`, `entidades_armas` y `entidades_drogas`: entidades extraídas por SIAD.
- `usuarios`: cuentas y roles de acceso.

La relación geográfica principal es:

```text
Región → Unidad → Cuartel → Registro de enrolamiento
```

## Arquitectura técnica

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| Frontend ABIS | EJS, HTML, CSS y JavaScript | Dashboard, ingesta, ajustes y reportes. |
| Backend ABIS | Node.js y Express | API, autenticación, ETL, exportaciones y Telegram. |
| SIAD | Python, Flask y Werkzeug | OCR, NLP, documentos y estadísticas. |
| Base de datos | PostgreSQL | Persistencia unificada y catálogos. |
| Oracle | `node-oracledb` | Lectura controlada desde Oracle mediante integración aprobada. |
| Seguridad | JWT, AES-256-GCM, SHA-256 | Sesiones, cifrado e integridad. |
| Automatización | Node.js scheduler | Reportes programados y notificaciones. |

## Requisitos

- Windows, Linux o macOS.
- Node.js 20 o superior.
- Python 3.9 o superior.
- PostgreSQL 13 o superior.
- Tesseract OCR para el procesamiento documental.
- Acceso de red a Oracle únicamente si se habilita la integración Oracle.

## Instalación local

### 1. Clonar e instalar dependencias Node

```bash
git clone https://github.com/NicolasPonceH/Abis-Analisis.git
cd Abis-Analisis
npm install
```

### 2. Instalar dependencias SIAD

En Windows:

```powershell
python -m venv siad\.venv
siad\.venv\Scripts\pip install -r siad\requirements.txt
```

En Linux o macOS:

```bash
python3 -m venv siad/.venv
siad/.venv/bin/pip install -r siad/requirements.txt
```

### 3. Configurar variables de entorno

Copiar `.env.example` a `.env` y completar los valores locales:

```env
DATABASE_URL=postgresql://usuario:password@localhost:5432/Abis_OCR
PORT=3000
SECRET_KEY=cambiar-por-una-clave-larga-y-aleatoria
ENCRYPTION_KEY=clave-hexadecimal-de-32-bytes
SIAD_PORT=5001
SIAD_URL=http://127.0.0.1:5001
ENABLE_TELEGRAM_BOT=false
```

Si se habilita la integración Oracle, las variables deben configurarse solo en el servidor:

```env
ORACLE_CONNECTION_STRING=host:puerto/servicio
ORACLE_USER=usuario_de_integracion
ORACLE_PASSWORD=secreto_no_versionado
```

### 4. Crear y preparar la base de datos

```bash
npm run db:crear
npm run db:schema
npm run db:seed
npm run db:views
```

No se deben ejecutar scripts de limpieza o eliminación sobre producción sin respaldo y autorización explícita.

### 5. Iniciar el sistema

```bash
npm start
```

Abrir:

- ABIS: `http://localhost:3000`
- SIAD integrado: `http://localhost:3000/analisis`

El servidor ABIS inicia el módulo SIAD cuando la configuración local lo permite.

## Operación diaria

1. Iniciar PostgreSQL.
2. Ejecutar `npm start`.
3. Ingresar al dashboard ABIS.
4. Revisar la jornada o el rango solicitado.
5. Para datos Oracle, usar la API aprobada o descargar el Excel autorizado.
6. Ingresar a **Ingesta ABIS** y cargar el archivo o pegar la hoja.
7. Revisar el resumen de filas procesadas y el historial del lote.
8. Generar el reporte requerido.
9. Enviar a Telegram solo cuando el destinatario y el horario estén autorizados.
10. Para documentos, entrar a **Análisis Documental**, cargar el archivo y consultar su historial.

## Scripts principales

| Comando | Uso |
|---|---|
| `npm start` | Inicia ABIS y el módulo SIAD integrado. |
| `npm run db:crear` | Crea la base unificada cuando corresponde. |
| `npm run db:schema` | Aplica el esquema principal. |
| `npm run db:seed` | Carga catálogos iniciales. |
| `npm run db:views` | Crea vistas de consulta. |
| `npm run db:limpiar` | Limpieza interactiva y controlada de registros. |
| `npm run validar-integridad` | Revisa consistencia histórica. |
| `npm run security:cifrar` | Cifra un archivo de ingesta. |
| `npm run security:descifrar` | Descifra y valida un archivo protegido. |
| `npm run telegram:enviar` | Envía un reporte autorizado. |
| `node scripts/capturar-screenshots-playwright.js` | Regenera la galería visual de ABIS y SIAD con Playwright. |

## Documentación adicional

- [Documentación general](docs/README.md)
- [Guía rápida](docs/GUIA_RAPIDA.md)
- [Manual de operación](docs/MANUAL_OPERACION.md)
- [Plan de despliegue](docs/PLAN_DESPLIEGUE.md)
- [Diagramas de arquitectura](docs/diagramas/arquitectura.md)
- [Diagramas de base de datos](docs/DIAGRAMAS_BASE_DE_DATOS.md)
- [Documentación específica de SIAD](siad/README.md)

## Seguridad y confidencialidad

Este software está orientado a un entorno institucional. Antes de desplegarlo:

- Cambiar todas las claves de desarrollo.
- No versionar `.env`, contraseñas, tokens, respaldos ni archivos de Oracle.
- Usar un usuario PostgreSQL con privilegios mínimos.
- Restringir el acceso de red a los puertos 3000, 5001 y PostgreSQL.
- Definir una política de rotación de credenciales.
- Respaldar la base antes de ejecutar limpiezas o eliminaciones.
- Revisar la auditoría de ingestas y reportes.

## Licencia y uso

Sistema desarrollado para uso institucional y académico. La distribución, operación y publicación de datos reales debe cumplir las políticas internas y la normativa aplicable sobre protección de datos.
