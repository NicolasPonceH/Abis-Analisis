# 2. Diagrama de Flujo del Proceso (Pipeline de Inteligencia)

Explica paso a paso el viaje de la información: desde que el usuario sube el PDF hasta que la IA extrae los datos, busca cruces históricos y guarda la evidencia inmutable.

```mermaid
graph TD
    A[Usuario PDI] -->|Sube Documento PDF| B(Interfaz Web / SIAD)
    B --> C{¿Es PDF Válido?}
    C -->|No| D[Alerta de Archivo Corrupto]
    C -->|Sí| E[Motor OCR Tesseract]
    E -->|Extrae Texto| F[Motor de IA - Extracción de Entidades spaCy]
    F -->|Encuentra Armas, Autos, etc.| G[Verificación de Cruces Históricos DB]
    G --> H{¿Hay Coincidencia?}
    H -->|Sí| I[Alerta Roja: Entidad Repetida]
    H -->|No| J[Guarda Seguro en PostgreSQL]
    I --> J
    J --> K[Genera Resumen PDF/Word]
```
