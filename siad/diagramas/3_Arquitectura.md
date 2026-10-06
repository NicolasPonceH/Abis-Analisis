# 3. Diagrama de Arquitectura de Componentes

Muestra cómo están separadas las tecnologías en tres capas principales: Frontend (Vistas), Backend (Cerebro) y Base de Datos (Persistencia Inmutable).

```mermaid
flowchart LR
    subgraph Frontend
        UI[Navegador Web / Interfaz Glassmorphism]
    end

    subgraph Backend - Servidor Flask
        API[Rutas Web / API]
        OCR[Módulo Tesseract OCR]
        NLP[Módulo IA / NLP spaCy]
    end

    subgraph Capa de Datos
        DB[(PostgreSQL)]
    end

    UI <-->|HTTP / JSON| API
    API --> OCR
    API --> NLP
    API <-->|Consultas SQL + Triggers| DB
```
