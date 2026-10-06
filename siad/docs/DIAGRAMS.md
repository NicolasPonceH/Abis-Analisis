# Diagramas de Arquitectura (Actualizados)

Este documento contiene los diagramas arquitectónicos y de flujo del Sistema de Análisis Documental (SIAD), actualizados para reflejar el estado actual del sistema en producción, incluyendo el nuevo motor de coincidencias cruzadas.

Los gráficos de planificación heredados (Gantt, PERT) de la fase inicial de desarrollo han sido removidos por obsolescencia.

## 1. Diagrama Entidad-Relación (Modelo de Base de Datos)

El sistema utiliza un **Modelo EAV (Entidad-Atributo-Valor)** en PostgreSQL para guardar los documentos y las piezas de inteligencia extraídas sin depender de columnas rígidas, permitiendo escalabilidad total para futuras entidades.

```mermaid
erDiagram
    DOCUMENTOS ||--o{ ENTIDADES : "contiene"
    USUARIOS ||--o{ DOCUMENTOS : "registra (opcional)"

    USUARIOS {
        BIGINT id PK
        TEXT username "UNIQUE"
        TEXT password_hash
        TEXT rol
        TIMESTAMPTZ creado_en
    }

    DOCUMENTOS {
        BIGINT id PK
        TEXT nombre_archivo
        TIMESTAMPTZ fecha_procesamiento
        TEXT texto_original
        TEXT resumen
        TEXT usuario_username FK
    }

    ENTIDADES {
        BIGINT id PK
        BIGINT documento_id FK
        TEXT categoria "vehiculo, arma, droga"
        TEXT campo "Ej: marca, calibre"
        TEXT valor "Ej: Toyota, 9mm"
    }
```

## 2. Diagrama de Flujo del Proceso (Pipeline de Inteligencia)

Explica paso a paso el viaje de la información: desde que el usuario sube el PDF, pasando por la extracción de datos y la **verificación automática de cruces históricos**, hasta el guardado inmutable.

```mermaid
graph TD
    A[Usuario PDI] -->|Sube Documento PDF| B(Interfaz Web / SIAD)
    B --> C{¿Es PDF Válido?}
    C -->|No| D[Alerta de Archivo Corrupto]
    C -->|Sí| E[Motor OCR Tesseract]
    E -->|Extrae Texto| F[Motor de IA - Extracción de Entidades spaCy]
    F -->|Encuentra Armas, Autos, etc.| G[Verificación de Cruces Históricos BD]
    G --> H{¿Hay Coincidencia?}
    H -->|Sí| I[Alerta Roja: Entidad Repetida identificada en BD]
    H -->|No| J[Guarda Seguro en PostgreSQL]
    I --> J
    J --> K[Genera Resumen PDF/Word]
```

## 3. Diagrama de Arquitectura de Componentes

Muestra cómo están separadas las tecnologías en tres capas principales: Frontend (Vistas web), Backend (Procesamiento y Motores) y Base de Datos (Persistencia Inmutable).

```mermaid
flowchart LR
    subgraph Frontend
        UI[Navegador Web / Interfaz Glassmorphism]
    end

    subgraph Backend - Servidor Flask
        API[Rutas Web / API]
        OCR[Módulo Tesseract OCR]
        NLP[Módulo IA / NLP spaCy + NER]
    end

    subgraph Capa de Datos
        DB[(PostgreSQL)]
    end

    UI <-->|HTTP / JSON| API
    API --> OCR
    API --> NLP
    API <-->|Consultas SQL + Triggers| DB
```

## 4. Diagrama de Estados del Documento

Describe las transiciones de estado que experimenta un archivo documental desde su ingreso al sistema hasta su exportación o persistencia en el historial policial.

```mermaid
stateDiagram-v2
    [*] --> Subido: Carga de Archivo (UI)
    
    Subido --> Validado: PDF Válido
    Subido --> Rechazado: Formato inválido o corrupto
    Rechazado --> [*]: Archivo descartado
    
    Validado --> TextoExtraido: OCR Tesseract
    TextoExtraido --> Resumido: NLP spaCy (TextRank)
    TextoExtraido --> EntidadesDetectadas: Clasificador NER
    
    Resumido --> AnalizadoCompleto: Entidades + Cruces Históricos listos
    EntidadesDetectadas --> AnalizadoCompleto: Resumen listo
    
    AnalizadoCompleto --> ExportadoWord: Generación de Acta (.docx)
    AnalizadoCompleto --> PersistidoEnBD: Guardado Transaccional (Inmutable)
    
    ExportadoWord --> PersistidoEnBD
    PersistidoEnBD --> [*]: Disponible en Historial
```
