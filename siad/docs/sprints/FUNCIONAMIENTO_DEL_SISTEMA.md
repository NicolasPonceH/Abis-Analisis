# Manual de Funcionamiento y Arquitectura del Sistema SIAD

**Sistema de Análisis Documental y Pericial (SIAD)**
*Módulo de Inteligencia, Procesamiento de Lenguaje Natural (NLP), OCR y Cruce Forense de Evidencia Documental.*

---

## 1. Visión General del Sistema

El **SIAD** es un sistema especializado diseñado para automatizar la ingesta, análisis, extracción de entidades y cruce histórico de información proveniente de documentos policiales, partes de denuncia, actas periciales, resoluciones judiciales y reportes operativos.

### Objetivos Clave:

1. **Ingesta Multiformato:** Recepción de documentos en formato **PDF, Word (.docx, .doc), Excel (.xlsx), PowerPoint (.pptx), imágenes escaneadas (.png, .jpg) y archivos de texto (.txt)**.
2. **Motor OCR Inteligente:** Detección automática de texto vectorial vs. documentos escaneados/fotografiados mediante **Tesseract OCR** con optimización para vocabulario policial en español.
3. **Extracción Forense de Entidades (NER):** Extracción automatizada y categorizada de:
   - **Personas:** Imputados, víctimas, denunciantes y detección automática de menores de edad.
   - **Armas y Munición:** Tipo, calibre, marca, modelo y número de serie.
   - **Vehículos:** Placas patentes chilenas (formatos antiguo y nuevo), marca, modelo y color.
   - **Sustancias Ilícitas:** Tipo de droga (clorhidrato de cocaína, pasta base, cannabis sativa, drogas sintéticas) y pesaje neto incautado.
   - **Dinero y Especies:** Montos en efectivo, divisas y especies de valor.
4. **Motor de Cruces de Inteligencia en Tiempo Real:** Comparación instantánea de las entidades extraídas contra la base histórica de más de **95.000 registros** en PostgreSQL para identificar reincidencias, vehículos con encargo o armamento vinculado a causas anteriores.
5. **Seguridad y Custodia Pericial:** Cifrado reversible AES-256 (Fernet) para datos personales e identificadores sensibles, control de roles (Administrador/Operador) y almacenamiento inmutable.
6. **Generación Automatizada de Actas:** Emisión instantánea de resúmenes ejecutivos y actas policiales oficiales en formato Word (.docx) listas para firma institucional.

---

## 2. Diagrama General de Arquitectura

El sistema está estructurado bajo una arquitectura por capas desacoplada y segura. SIAD opera como un microservicio backend en Python/Waitress coordinado con la plataforma principal ABIS (Node.js/Express).

```mermaid
flowchart TB
    subgraph Capa_Cliente["1. Capa de Cliente / Analista"]
        Browser["Navegador Web (Analista Policial)<br>UI Glassmorphism / Tailwind CSS"]
        Scanner["Módulo Escáner y Carga Rápida<br>(Drag & Drop / Pegado Directo)"]
        Browser --- Scanner
    end

    subgraph Plataforma_ABIS["2. Plataforma Principal ABIS (Node.js)"]
        AbisServer["Servidor Express (Puerto 3000)<br>Orquestador General"]
        SiadService["Servicio de Integración<br>siadService.js"]
        AbisServer --> SiadService
    end

    subgraph Microservicio_SIAD["3. Servidor SIAD (Python / Waitress)"]
        Waitress["Servidor WSGI Waitress (Puerto 5001)<br>Multi-hilo / 127.0.0.1 (Localhost)"]
        AppRoutes["Controlador Flask (app.py)<br>API REST y Renderizado de Vistas"]
      
        subgraph Motores_Procesamiento["Motores de Análisis"]
            Converter["Conversor Universal<br>(converters.py / Office COM)"]
            OCR["Motor OCR Tesseract<br>(PyMuPDF + Tesseract 5)"]
            NLP["Motor IA / NLP<br>(spaCy + PyTextRank)"]
            Rules["Clasificador Forense<br>(entities.py)"]
            Security["Criptografía y Privacidad<br>(security.py / AES-256)"]
            Exporter["Exportador de Actas<br>(docxtpl / export_stats.py)"]
        end

        Waitress --> AppRoutes
        AppRoutes --> Converter
        AppRoutes --> OCR
        AppRoutes --> NLP
        AppRoutes --> Rules
        AppRoutes --> Security
        AppRoutes --> Exporter
    end

    subgraph Capa_Datos["4. Capa de Persistencia (PostgreSQL)"]
        DB[(Base de Datos Unificada<br>Abis_OCR)]
        DocTable[Tabla: documentos]
        EntityTable[Tabla: entidades - EAV]
        PeopleTable[Tabla: entidades_personas]
        RulesTable[Tabla: learned_rules]
        UsersTable[Tabla: usuarios]
      
        DB --- DocTable
        DB --- EntityTable
        DB --- PeopleTable
        DB --- RulesTable
        DB --- UsersTable
    end

    Browser <-->|HTTP / HTML / WebSocket| AbisServer
    SiadService <-->|HTTP Local / JSON (127.0.0.1:5001)| Waitress
    AppRoutes <-->|psycopg (Pool SQL Seguro)| DB
```

---

## 3. Pipeline de Procesamiento Documental

Flujo paso a paso desde que el analista ingresa un archivo hasta la obtención de los resultados periciales y cruces de inteligencia:

```mermaid
graph TD
    IN[1. Entrada de Documento<br>PDF, Word, Excel, PPT, Imagen o Texto] --> CHECK_FMT{¿Es PDF Nativo?}
  
    CHECK_FMT -->|No: Office o Imagen| CONV[2. Conversión a PDF Unificado<br>converters.py via COM/PIL/FPDF]
    CHECK_FMT -->|Sí| READ[3. Inspección del Archivo PDF<br>PyMuPDF - fitz]
    CONV --> READ
  
    READ --> CHECK_TEXT{¿Contiene texto<br>vectorial legible?}
    CHECK_TEXT -->|Sí| EXT_VEC[Extracción de Texto Directa<br>PyMuPDF]
    CHECK_TEXT -->|No: Es Escaneo/Foto| OCR_PROC[Ejecución de OCR Tesseract<br>Pre-procesamiento con Pillow]
  
    EXT_VEC --> MERGE_TXT[4. Texto Unificado Normalizado]
    OCR_PROC --> MERGE_TXT
  
    MERGE_TXT --> RESUMEN[5. Algoritmo de Resumen Ejecutivo<br>spaCy + PyTextRank]
    MERGE_TXT --> NER[6. Extracción de Entidades Forenses<br>entities.py: Personas, Armas, Drogas, Autos]
  
    NER --> ANONYMIZE[7. Cifrado de Datos Sensibles<br>RUTs e Identificadores con AES-256]
  
    ANONYMIZE --> CROSS_CHECK[8. Verificación de Cruces Históricos<br>Cotejo en PostgreSQL contra +95.000 registros]
  
    CROSS_CHECK --> IS_MATCH{¿Hay coincidencia<br>histórica previa?}
    IS_MATCH -->|Sí| ALERT[Generar Alerta Roja de Inteligencia<br>y Vinculación de Causa]
    IS_MATCH -->|No| SAVE_DB[9. Persistencia Transaccional en Base de Datos]
    ALERT --> SAVE_DB
  
    SAVE_DB --> OUT_DOCX[10. Generación de Acta Oficial Word<br>docxtpl con plantilla institucional]
    SAVE_DB --> OUT_UI[Visualización en Pantalla con Badges y Grafos]
```

---

## 4. Diagrama de Secuencia del Análisis Pericial

Interacción temporal detallada entre componentes durante el análisis de un expediente:

```mermaid
sequenceDiagram
    autonumber
    actor Analista as Analista Policial
    participant UI as Interfaz Web SIAD
    participant Flask as Servidor Flask / Waitress
    participant Conv as Módulo Conversores
    participant OCR as Tesseract OCR
    participant NLP as Motor spaCy / TextRank
    participant Sec as Módulo Seguridad (AES)
    participant DB as Base de Datos PostgreSQL
    participant Docx as Generador Word (docxtpl)

    Analista->>UI: Sube documento (.pdf, .docx, imagen)
    UI->>Flask: POST /upload (archivo multipart)
  
    alt Si es archivo Office/Imagen
        Flask->>Conv: convert_to_pdf(input_path)
        Conv-->>Flask: Retorna archivo PDF temporal
    end

    Flask->>Flask: Intenta extraer texto con PyMuPDF
    opt Si el documento es una imagen o escaneo sin texto
        Flask->>OCR: image_to_string(páginas)
        OCR-->>Flask: Texto extraído por OCR
    end

    Flask->>NLP: extract_summary(texto)
    NLP-->>Flask: Resumen ejecutivo y palabras clave

    Flask->>NLP: extract_all_entities(texto)
    NLP-->>Flask: Lista de armas, drogas, vehículos, personas

    Flask->>Sec: cifrar_texto(rut / datos_sensibles)
    Sec-->>Flask: Identificadores cifrados

    Flask->>DB: SELECT coincidencias FROM entidades WHERE valor IN (...)
    DB-->>Flask: Retorna historial previo de causas coincidentes

    Flask->>DB: INSERT INTO documentos / entidades / entidades_personas
    DB-->>Flask: Confirmación de guardado inmutable (ID documento)

    opt Si el analista solicita Acta Oficial
        Flask->>Docx: render_acta(datos_documento, entidades)
        Docx-->>Flask: Documento .docx generado
        Flask-->>Analista: Descarga Acta Pericial Oficial
    end

    Flask-->>UI: Renderiza vista de resultados con alertas de inteligencia
    UI-->>Analista: Despliegue de entidades, cruces históricos y resumen
```

---

## 5. Modelo de Datos y Esquema Entidad-Relación

La base de datos combina tablas relacionales estructuradas con un modelo **EAV (Entidad-Atributo-Valor)** para garantizar máxima flexibilidad y escalabilidad ante nuevas categorías forenses sin alterar la estructura física de la base de datos.

```mermaid
erDiagram
    USUARIOS ||--o{ DOCUMENTOS : "registra_o_analiza"
    DOCUMENTOS ||--o{ ENTIDADES : "posee_atributos"
    DOCUMENTOS ||--o{ ENTIDADES_PERSONAS : "identifica_personas"
    USUARIOS ||--o{ AUDITORIA_LOGS : "genera_evento"

    USUARIOS {
        BIGINT id PK
        VARCHAR username "UK - Nombre de usuario"
        VARCHAR password_hash "Hash seguro scrypt/pbkdf2"
        VARCHAR rol "admin / operador"
        TIMESTAMP creado_en "Fecha de creación"
    }

    DOCUMENTOS {
        BIGINT id PK
        VARCHAR nombre_archivo "Nombre original del archivo"
        TIMESTAMP fecha_procesamiento "Marca temporal pericial"
        TEXT texto_original "Texto íntegro extraído"
        TEXT resumen "Resumen ejecutivo extraído por NLP"
        VARCHAR usuario_username FK "Analista responsable"
    }

    ENTIDADES {
        BIGINT id PK
        BIGINT documento_id FK "Vínculo con documento"
        VARCHAR categoria "arma, vehiculo, droga, dinero"
        VARCHAR campo "calibre, patente, sustancia, monto"
        TEXT valor "Valor normalizado de la entidad"
    }

    ENTIDADES_PERSONAS {
        BIGINT id PK
        BIGINT documento_id FK "Vínculo con documento"
        VARCHAR nombre "Nombre del sujeto"
        VARCHAR rut_cifrado "RUT protegido con AES-256"
        VARCHAR tipo_persona "imputado / victima / denunciante"
        BOOLEAN es_menor "Flag indicador de minoría de edad"
    }

    LEARNED_RULES {
        BIGINT id PK
        VARCHAR entidad_tipo "Categoría de la regla"
        VARCHAR patron "Expresión regular o token clave"
        VARCHAR usuario FK "Usuario que aprobó el aprendizaje"
        TIMESTAMP creado_en "Fecha de incorporación"
    }

    AUDITORIA_LOGS {
        BIGINT id PK
        VARCHAR usuario "Usuario actuante"
        VARCHAR accion "LOGIN, UPLOAD, EXPORT, DELETE"
        TEXT detalles "Detalles técnicos y forenses"
        TIMESTAMP fecha "Fecha y hora exacta del evento"
    }
```

---

## 6. Diagrama de Estados del Documento

Describe el ciclo de vida inmutable que experimenta cada documento ingresado al sistema:

```mermaid
stateDiagram-v2
    [*] --> Subido: Archivo recibido en interfaz
  
    Subido --> Validando: Verificación de extensión y firma MIME
    Validando --> Rechazado: Archivo dañado o formato no soportado
    Rechazado --> [*]: Notificación de error al usuario
  
    Validando --> Estandarizado: Conversión exitosa a PDF
    Estandarizado --> ExtrayendoTexto: Evaluación de capas de texto
  
    ExtrayendoTexto --> TextoVectorial: Texto nativo detectado
    ExtrayendoTexto --> EscaneoOCR: Imagen pura / Escaneado
  
    TextoVectorial --> ProcesandoNLP: Texto listo
    EscaneoOCR --> ProcesandoNLP: OCR completado exitosamente
  
    ProcesandoNLP --> AnalisisEntidades: Detección de armas, drogas, vehículos
    AnalisisEntidades --> CotejoCruces: Búsqueda de coincidencias en BD (+95k)
  
    CotejoCruces --> Persistido: Guardado inmutable en PostgreSQL
    Persistido --> GenerandoActa: Exportación opcional a Word (.docx)
    GenerandoActa --> Finalizado: Documento disponible en Historial
    Persistido --> Finalizado
  
    Finalizado --> [*]
```

---

## 7. Arquitectura de Seguridad y Privacidad (Zero-Trust Local)

```mermaid
flowchart LR
    subgraph Red_Externa["Red Externa / LAN Institucional"]
        Cliente["Terminal del Operador"]
    end

    subgraph Perimetro_Seguro["Perímetro de Seguridad Localhost (127.0.0.1)"]
        direction TB
        ABIS_NODE["ABIS Web (Puerto 3000)<br>Filtro de Autenticación JWT / Cookies Seguras"]
        SIAD_WAITRESS["SIAD Flask (Puerto 5001)<br>Restringido a conexiones locales 127.0.0.1"]
      
        subgraph Criptografia["Capa Criptográfica"]
            AES["Cifrado AES-256 (Fernet)<br>RUTs y Datos Sensibles"]
            HASH["Hashing scrypt / PBKDF2<br>Contraseñas de Usuarios"]
        end
    end

    subgraph Almacenamiento["Base de Datos PostgreSQL"]
        DB_DATA[("Abis_OCR<br>Datos Cifrados en Reposo")]
    end

    Cliente -->|Acceso HTTP/HTTPS| ABIS_NODE
    ABIS_NODE -->|Petición Interna 127.0.0.1:5001| SIAD_WAITRESS
    SIAD_WAITRESS --> AES
    SIAD_WAITRESS --> HASH
    AES --> DB_DATA
    HASH --> DB_DATA
```

1. **Aislamiento de Red:** SIAD escucha exclusivamente en `127.0.0.1:5001`. Ningún equipo externo de la red puede comunicarse directamente con SIAD; toda petición pasa previamente validada a través de ABIS o de la sesión autenticada.
2. **Cifrado Reversible de PII:** Los RUTs y datos de identidad se cifran mediante `cryptography.fernet` (AES-256 en modo CBC con HMAC SHA-256). Solo el sistema en ejecución con la clave maestra en el `.env` puede descifrarlos para cotejo o visualización autorizada.
3. **Hashing de Credenciales:** Las contraseñas de acceso nunca se almacenan en texto plano; se utiliza derivación robusta con sal aleatoria.
4. **Control de Acceso Basado en Roles (RBAC):** Separación estricta entre **Administrador** (gestión de usuarios, auditoría, configuración avanzada) y **Operador** (carga de documentos, revisión y exportación).

---

## 8. Mapeo de Archivos del Código Fuente

| Archivo                               | Responsabilidad Principal                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.py`                            | Controlador principal de Flask, rutas de la aplicación web, API REST, manejo de sesiones, orquestador del pipeline.                                      |
| `converters.py`                     | Conversores de documentos a PDF: Microsoft Office vía COM Automation (`win32com`), imágenes vía `Pillow` y texto plano vía `FPDF`.              |
| `entities.py`                       | Motor de Inteligencia y Extracción de Entidades: Reglas heurísticas, expresiones regulares forenses y modelo NER de spaCy (`es_core_news_sm`).        |
| `db.py`                             | Conexión a PostgreSQL con pool, creación de tablas (`init_schema`), consultas parametrizadas contra inyección SQL y funciones de cruces históricos. |
| `security.py`                       | Funciones criptográficas: `cifrar_texto`, `descifrar_texto` con AES-256 (Fernet) y utilidades de saneamiento.                                        |
| `export_stats.py`                   | Generación de estadísticas periciales, reportes agregados y exportación masiva a formatos Excel.                                                       |
| `word_templates/acta_template.docx` | Plantilla oficial de informe pericial utilizada por `docxtpl` para la generación de actas.                                                             |
| `scripts/run_production.bat`        | Script de ejecución para servidores de producción usando Waitress WSGI.                                                                                 |
| `scripts/backup_db.py`              | Script automatizado para generación de respaldos periódicos de la base de datos PostgreSQL.                                                             |

---

## 9. Modo Producción: Despliegue con Waitress y Servicios de Windows

Para desplegar SIAD en un servidor institucional en lugar del entorno de desarrollo:

### 1. Ejecución con Waitress WSGI:

```powershell
.venv\Scripts\waitress-serve.exe --listen=127.0.0.1:5001 --threads=8 app:app
```

* **Multi-hilo:** Soporta múltiples peticiones concurrentes sin bloquear la interfaz.
* **Seguridad:** Aislamiento local en `127.0.0.1`, evitando accesos directos desde fuera del servidor.

### 2. Configuración como Servicio de Windows (Task Scheduler o NSSM):

Permite que el sistema inicie automáticamente al encender el servidor, sin requerir que un operador inicie sesión de forma manual en Windows.

* **Acción:** Ejecutar `scripts/run_production.bat`
* **Desencadenador:** Al iniciar el sistema (`AtStartup`)
* **Permisos:** Ejecutar con los privilegios más altos (`NT AUTHORITY\SYSTEM` o cuenta de servicio dedicada).
