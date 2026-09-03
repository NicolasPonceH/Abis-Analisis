# Sistema ABIS — Policía de Investigaciones de Chile (PDI)

<div align="center">

<img src="public/assets/logo-pdi.png" alt="PDI Chile Logo" width="180"/>

### Centro de Monitoreo, Analítica & Control de Enrolamiento Biométrico Fronterizo
**Jefatura Nacional de Migraciones y Policía Internacional (JENA)**

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B%203NF-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![AES-256-GCM](https://img.shields.io/badge/Criptograf%C3%ADa-AES--256--GCM-002B49?style=for-the-badge&logo=security&logoColor=white)]()
[![Playwright](https://img.shields.io/badge/Pruebas-15%2F15%20Aprobadas-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Status](https://img.shields.io/badge/Estado-Producci%C3%B3n%20Ready-blue?style=for-the-badge)]()

<br>

<img src="public/assets/screenshots/desktop-metricas.png" alt="Dashboard Ejecutivo ABIS PDI" width="900" style="border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,0.15);"/>

</div>

---

## 📑 Tabla de Contenidos

1. [Descripción General](#-descripción-general)
2. [Arquitectura y Flujo de Datos](#-arquitectura-y-flujo-de-datos)
3. [Características Principales](#-características-principales)
   - [Panel Ejecutivo y Métricas en Tiempo Real](#1-panel-ejecutivo-y-métricas-en-tiempo-real)
   - [Filtros Reactivos Instantáneos](#2-filtros-reactivos-instantáneos)
   - [Centro de Exportación Oficial & Disparo a Telegram](#3-centro-de-exportación-oficial--disparo-a-telegram)
   - [Suite Criptográfica Web y Terminal](#4-suite-criptográfica-web-y-auditoría)
   - [Autorización Policial para Ingesta](#5-autorización-policial-para-ingesta-de-archivos)
   - [Bot Interactivo de Telegram](#6-bot-interactivo-de-telegram)
4. [Estructura del Proyecto](#-estructura-del-proyecto)
5. [Instalación y Puesta en Marcha](#-instalación-y-puesta-en-marcha)
6. [Variables de Entorno](#-variables-de-entorno)
7. [Endpoints de la API](#-endpoints-de-la-api)
8. [Herramientas Criptográficas (Web y CLI)](#-herramientas-criptográficas-web-y-cli)
9. [Batería de Pruebas Automatizadas](#-batería-de-pruebas-automatizadas)
10. [Marco Legal y Confidencialidad](#-marco-legal-y-confidencialidad)

---

## 🛡️ Descripción General

El **Sistema ABIS** (*Automated Biometric Identification System*) de la Policía de Investigaciones de Chile es una plataforma integral diseñada para procesar, auditar y analizar los enrolamientos biométricos y biográficos capturados en los puestos fronterizos y cuarteles policiales del país.

El sistema resuelve el ciclo completo de vida del dato:
1. **Extracción**: Recibe planillas generadas desde la base de datos central Oracle ABIS.
2. **Blindaje Criptográfico**: Permite cifrar y descifrar archivos confidenciales bajo el estándar **AES-256-GCM** (directamente desde el navegador web o vía terminal).
3. **Ingesta Segura (ETL)**: Procesa archivos en memoria volátil RAM con validación estricta, tolerancia a errores tipográficos y control de acceso mediante credencial institucional.
4. **Base de Datos Relacional**: Pobla un modelo relacional en **PostgreSQL (Tercera Forma Normal - 3NF)** con vistas optimizadas.
5. **Analítica Ejecutiva**: Dashboard web institucional interactivo, responsivo y sin emojis, con reportes descargables en Microsoft Word (`.docx`) y Microsoft Excel (`.xlsx`) completamente estilizados, y despacho manual a Telegram.

---

## 🏛️ Arquitectura y Flujo de Datos

```
[ Base Central Oracle ABIS ]
              │
              ▼ (Extracción de datos operativos)
    Planilla Excel (.xlsx)
              │
              ▼ (Cifrador Web o Herramienta CLI)
   Archivo Protegido (.enc) ──► Cifrado AES-256-GCM (Auth Tag 128-bit)
              │
              ▼ (Carga en Dashboard Web)
  [ Modal de Autorización Policial ] ──► Exige INGESTA_PASSWORD (pdi2026)
              │
              ▼ (Validación exitosa)
   [ Servidor Node.js / Express ]
   ├── Descifrado transparente en memoria RAM (Zero Disk Footprint)
   ├── Normalización de catálogos y tipografías (ETL Pipeline)
   └── Generación de huella inmutable SHA-256
              │
              ▼
   [ PostgreSQL 3NF (abis_db) ] ◄───► [ Bitácora de Auditoría Inmutable ]
              │
              ├───────────────────────────────┬───────────────────────────────┐
              ▼                               ▼                               ▼
    [ Dashboard Web PDI ]            [ Exportaciones Formales ]      [ Bot de Telegram ]
   - Scorecard Ejecutivo            - Word (.docx) Formateado        - Alertas automáticas
   - Gráficos Chart.js              - Excel (.xlsx) con Fórmulas     - Consultas operativas
   - Matriz de Cuarteles            - CSV Oficial / JSON / Print     - Envío manual web
```

---

## 🚀 Características Principales

### 1. Panel Ejecutivo y Métricas en Tiempo Real
* **Scorecard Superior**: Cumplimiento de SLA PDI, Eficacia Biometría, Puesto con Mayor Carga y Flujo Migratorio Principal.
* **Tarjetas KPI Cromáticas Diferenciadas**:
  * **Total de Enrolamientos:** Fondo suave blanco azulado (`#f0f5fa`) con acento azul marino.
  * **Sincronizados con PDI:** Fondo suave blanco menta (`#edfdf5`) con acento verde esmeralda.
  * **Registro Biométrico ABIS:** Fondo suave blanco celeste (`#f0f9ff`) con acento azul cielo.
  * **Inconsistencias / Errores:** Fondo suave blanco rosáceo (`#fef2f2`) con acento rojo carmesí.
* **5 Gráficos Analíticos Dinámicos**:
  1. Rendimiento por Cuartel Fronterizo (Exitosos vs Errores).
  2. Top Nacionalidades de Enrolados.
  3. Proporción de Sincronización PDI (Doughnut).
  4. Pirámide Demográfica Cruzada (Género vs Mayoría de Edad).
  5. Distribución por Rangos Etarios.
* **Matriz Operativa Detallada**: Tabla institucional paginada con buscador en vivo de cuarteles y unidades policiales.

### 2. Filtros Reactivos Instantáneos
* **Cero Clics Innecesarios**: Al modificar el selector de fecha única, la fecha desde/hasta o cambiar de modalidad, la interfaz actualiza las métricas y gráficos inmediatamente.
* **Botones de Acceso Rápido (Presets)**:
  * `Última Jornada`: Carga el último día operativo registrado en la base de datos.
  * `Últimos 7 Días`: Calcula el rango acumulado de la última semana.
  * `Histórico Acumulado`: Consolida el universo histórico total de enrolamientos.
* **Banner de Período con Pulso Visual**: Notifica en negrita la fecha o rango en pantalla con una sutil animación de actualización.

### 3. Centro de Exportación Oficial & Disparo a Telegram
Los botones de la barra de acciones cuentan con identidad cromática institucional:

| Botón | Color | Formato | Contenido |
| :--- | :--- | :--- | :--- |
| **Word (.docx)** | **Azul** (`#185abd`) | `.docx` nativo | Informe formal con membrete PDI, tablas con bordes, resumen ejecutivo y firma institucional. |
| **Excel (.xlsx)** | **Verde** (`#107c41`) | `.xlsx` nativo | Libro de cálculo con 2 hojas, banner azul marino/oro, KPIs coloreados, fórmulas `=SUM()` y paneles inmovilizados. |
| **CSV Oficial** | **Verde** (`#107c41`) | `.csv` con BOM | Texto delimitado con Byte Order Mark (BOM UTF-8) para compatibilidad con planillas externas. |
| **JSON** | **Amarillo** (`#f59e0b`) | `.json` | Estructura jerárquica con metadatos completos para consumo en APIs o interoperabilidad. |
| **Telegram** | **Celeste** (`#229ed9`) | Disparo manual API | Notificación instantánea formateada del período consultado al canal oficial de Telegram. |
| **Imprimir** | **Negro** (`#0f172a`) | `@media print` | Estilo optimizado para impresoras o guardado en PDF limpio sin elementos de navegación. |

### 4. Suite Criptográfica Web y Auditoría
* **Herramientas Web Integradas (Sin Terminal)**: En la pestaña *"Criptografía & Auditoría"*, cualquier funcionario u operador puede:
  * **Blindar Archivos (.xlsx &rarr; .enc)**: Cifrado inmediato con descarga automática del archivo blindado.
  * **Descifrar y Validar (.enc &rarr; .xlsx)**: Verificación de autenticidad del Auth Tag y descarga del Excel original.
* **Algoritmo Militar AES-256-GCM** (*Galois/Counter Mode*), esquema AEAD recomendado por el NIST.
* **Descifrado Exclusivo en Memoria RAM**: El servidor autentica y descifra en la memoria volátil sin escribir copias desprotegidas en disco.
* **Huella Digital SHA-256**: Cada lote genera un hash inmutable de 64 caracteres hexadecimales.
* **Bitácora de Auditoría en Base de Datos**: La tabla `registro_auditoria_cifrada` almacena fecha, tipo de evento, archivo, hash y detalles de cada operación.
* **Consola CLI (Opcional)**: Comandos de terminal disponibles como alternativa avanzada para administradores en servidores headless.

### 5. Autorización Policial para Ingesta de Archivos
* Al arrastrar o examinar una planilla en la pestaña **"Ingesta de Datos (Oracle ABIS)"**, el sistema despliega un **Modal Institucional de Autorización**.
* Requiere la **Clave de Autorización Policial** (`INGESTA_PASSWORD`, por defecto `pdi2026`) para proceder con la inserción en la base de datos.
* Cuenta con animación visual de sacudida (*shake*) y mensaje de alerta si la credencial es incorrecta, protegiendo la base de datos contra alteraciones accidentales o no autorizadas.

### 6. Bot Interactivo de Telegram
* Conectado mediante Long Polling seguro para consultas móviles de la jefatura.
* Comandos disponibles:
  * `/resumen`: Muestra las métricas consolidadas de la última jornada.
  * `/cuarteles`: Ranking de los cuarteles con mayor flujo fronterizo.
  * `/estado`: Chequeo de salud del servidor y conexión con PostgreSQL.
  * `/ayuda`: Listado de comandos operativos.

---

## 📂 Estructura del Proyecto

```
sistema-abis/
├── .env.example                     # Plantilla de variables de entorno
├── .gitignore                       # Reglas de exclusión de Git
├── package.json                     # Dependencias y scripts npm
├── README.md                        # Documentación técnica principal
│
├── db/                              # Scripts SQL de base de datos
│   ├── schema.sql                   # Esquema relacional en 3NF
│   ├── seed_catalogos.sql           # Catálogos base (nacionalidades, cuarteles, unidades)
│   ├── views.sql                    # Vistas analíticas optimizadas
│   └── hardening.sql                # Rol de privilegios mínimos (abis_app)
│
├── public/                          # Dashboard Web Institucional
│   ├── index.html                   # Interfaz de usuario SPA
│   ├── css/
│   │   └── styles.css               # Sistema de diseño, responsive y animaciones
│   ├── js/
│   │   └── app.js                   # Lógica reactiva, Chart.js, modal y exportaciones
│   └── assets/
│       ├── img/                     # Emblema oficial PDI Chile
│       └── screenshots/             # Capturas de verificación automatizada
│
├── src/                             # Código fuente backend Node.js
│   ├── server.js                    # Servidor Express y endpoints API
│   ├── db.js                        # Pool de conexiones a PostgreSQL (pg)
│   ├── etl.js                       # Motor de extracción, transformación y carga
│   ├── ingest/
│   │   └── excelReader.js           # Lector e intérprete de planillas Excel
│   ├── reportes/
│   │   ├── reporteDiario.js         # Consultas de métricas por jornada
│   │   ├── reporteRango.js          # Consultas de métricas por rango y tendencias
│   │   ├── wordReportService.js     # Generador de reportes en Microsoft Word (.docx)
│   │   └── excelReportService.js    # Generador de reportes en Microsoft Excel (.xlsx)
│   ├── security/
│   │   └── crypto.js                # Motor criptográfico AES-256-GCM y SHA-256
│   └── telegram/
│       ├── botService.js            # Lógica interactiva del bot de Telegram
│       └── telegramClient.js        # Cliente HTTP de la API de Telegram
│
├── scripts/                         # Utilidades y pruebas de integración
│   ├── cifrar-archivo.js            # CLI para blindar archivos a .enc
│   ├── descifrar-archivo.js         # CLI para validar y descifrar archivos .enc
│   ├── test-upload-password-modal.js# Test Playwright de autorización de subida
│   ├── test-date-filter-reactivity.js# Test Playwright de reactividad de fechas
│   └── test-tabs-responsiveness.js  # Test Playwright de responsividad DOM
│
└── tests/
    └── api.spec.js                  # Suite oficial de 13 pruebas automatizadas (Playwright)
```

---

## 🛠️ Instalación y Puesta en Marcha

### Prerrequisitos
* **Node.js**: Versión 18.0.0 o superior.
* **PostgreSQL**: Versión 14 o superior en ejecución.

### 1. Clonar el Repositorio
```bash
git clone https://github.com/NicolasPonceH/Sistema_ABIS.git
cd Sistema_ABIS
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Configurar Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto copiando la plantilla:
```bash
cp .env.example .env
```
Edita `.env` con tus credenciales de PostgreSQL y claves de seguridad:
```env
DATABASE_URL=postgresql://postgres:tu_clave@localhost:5432/abis_db
PORT=3000
ENCRYPTION_KEY=4ca912ba6539d028a11e4054d4c2a5c5c3d156b348f241410548ae24a3a2888a
INGESTA_PASSWORD=pdi2026
ENABLE_TELEGRAM_BOT=false
```

### 4. Inicializar la Base de Datos
Ejecuta los scripts SQL en orden para estructurar las tablas, catálogos y vistas:
```bash
npm run db:schema    # Crea las tablas relacionales 3NF
npm run db:seed      # Carga catálogos de regiones, cuarteles y nacionalidades
npm run db:views     # Compila las vistas analíticas de reporte
```

### 5. Iniciar la Aplicación
```bash
npm start
```
Abre tu navegador en: **[http://localhost:3000](http://localhost:3000)**.

---

## 🌐 Endpoints de la API

| Método | Endpoint | Parámetros | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | — | Estado del servicio y total de registros en PostgreSQL. |
| `GET` | `/reporte-diario` | `?fecha=YYYY-MM-DD` | Métricas operativas consolidadas para una jornada específica. |
| `GET` | `/api/fechas` | — | Lista ordenada de todas las fechas con datos registrados. |
| `GET` | `/api/metricas/rango` | `?desde=...&hasta=...` | Métricas agregadas para un rango personalizado de fechas. |
| `GET` | `/api/metricas/tendencia`| `?limite=30` | Serie de tiempo histórica para gráficos de evolución. |
| `POST`| `/api/ingest/upload` | `archivo`, `X-Ingesta-Auth` | Carga e inserción masiva protegida con clave de autorización. |
| `POST`| `/api/telegram/enviar` | `fecha` o `desde`/`hasta` | Envío manual de informe oficial al bot/canal de Telegram institucional. |
| `POST`| `/api/security/cifrar` | `archivo` (.xlsx) | Cifrado web con AES-256-GCM y descarga de archivo blindado `.enc`. |
| `POST`| `/api/security/descifrar`| `archivo` (.enc) | Descifrado web con validación de Auth Tag y descarga de `.xlsx`. |
| `GET` | `/api/export/excel` | `?fecha=...` o `?desde=...&hasta=...` | Descarga de informe oficial formateado en **Microsoft Excel (.xlsx)**. |
| `GET` | `/api/export/word` | `?fecha=...` o `?desde=...&hasta=...` | Descarga de informe oficial en **Microsoft Word (.docx)**. |
| `GET` | `/api/export/csv` | `?fecha=...` o `?desde=...&hasta=...` | Descarga de reporte en **CSV Oficial con BOM UTF-8**. |

---

## 🔐 Herramientas Criptográficas (Web y CLI)

El sistema ofrece doble modalidad para blindar y auditar archivos:

### 1. Vía Navegador Web (Recomendada para Operadores)
Directamente desde la pestaña **"Criptografía & Auditoría"** en la aplicación web, arrastrando el archivo y pulsando un botón sin requerir comandos de consola.

### 2. Vía Consola CLI (Avanzada para Servidores Headless)
```bash
# Cifrar un archivo de enrolamiento a formato protegido .enc:
npm run security:cifrar "New_Enrolados Abis.xlsx"

# Descifrar y validar la integridad criptográfica del archivo:
npm run security:descifrar "New_Enrolados Abis.xlsx.enc"
```

---

## 🧪 Batería de Pruebas Automatizadas

El proyecto cuenta con una cobertura integral de pruebas de integración y E2E mediante **Playwright**:

```bash
npx playwright test
```

### Resultados de la Suite (15/15 Aprobadas):
```
Running 15 tests using 1 worker

  ✓ 1 GET /health returns ok and db connected
  ✓ 2 GET /reporte-diario without fecha returns most recent data
  ✓ 3 GET /reporte-diario with specific fecha returns data for that date
  ✓ 4 GET /reporte-diario with invalid fecha returns 400
  ✓ 5 GET /api/fechas returns array of dates
  ✓ 6 GET /api/metricas/rango returns aggregated metrics
  ✓ 7 GET /api/metricas/tendencia returns time series data
  ✓ 8 GET / serves the Web Dashboard HTML with PDI branding and Word export button
  ✓ 9 GET /api/export/word generates and serves a valid Microsoft Word (.docx) file
  ✓ 10 GET /api/export/word with date range returns valid Word document
  ✓ 11 GET /api/export/excel generates formatted official PDI Excel (.xlsx) document
  ✓ 12 GET /api/export/excel with date range returns formatted Excel document
  ✓ 13 GET /api/export/csv generates formal PDI institutional CSV with UTF-8 BOM
  ✓ 14 POST /api/telegram/enviar sends operational report to Telegram channel
  ✓ 15 POST /api/security/cifrar and /api/security/descifrar roundtrip protects and recovers file

  15 passed (100% éxito)
```

---

## ⚖️ Marco Legal y Confidencialidad

* **Uso Oficial Reservado**: Documentación y código de uso exclusivo para la Policía de Investigaciones de Chile (PDI).
* **Protección de Datos Personales**: Tratamiento de datos regulado bajo la **Ley N° 19.628 sobre Protección de la Vida Privada**. Prohibida su divulgación o comercialización no autorizada.
* **Cadena de Custodia Digital**: Los procesos de inserción y descifrado cumplen con estándares de no repudio mediante firmas hash inmutables SHA-256.

---

<div align="center">
  <sub>Policía de Investigaciones de Chile &bull; Jefatura Nacional de Migraciones y Policía Internacional &bull; 2026</sub>
</div>
