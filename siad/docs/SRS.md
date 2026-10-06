# Documento de Especificación de Requerimientos (SRS)

**Sistema de Análisis Documental, OCR y Estadísticas** (actualización con PostgreSQL)

## 1. Introducción y propósito del sistema

El sistema procesa documentos digitales y escaneados (PDF) aplicando Reconocimiento Óptico de
Caracteres (OCR). Debe extraer la información, generar resúmenes estructurados de los relatos o
hechos documentados, e identificar, clasificar y cuantificar entidades operativas críticas:
**vehículos, armas y drogas**. La información consolidada se exporta a un documento Word (.docx)
ajustado a plantillas preestablecidas, y alimenta obligatoriamente una base de datos PostgreSQL
para mantener un historial auditable y generar estadísticas operativas.

## 2. Arquitectura tecnológica sugerida

| Área | Herramientas |
|---|---|
| Backend y lógica central | Python (Flask) |
| Extracción y OCR | Tesseract OCR, PyMuPDF |
| Procesamiento de lenguaje natural (NLP) | spaCy u otro modelo de lenguaje |
| Exportación a plantillas Word | python-docx, docxtpl |
| Historial y estadísticas (obligatorio) | PostgreSQL + pandas + visualización |

## 3. Requerimientos funcionales

### RF-01 — Módulo de carga y preprocesamiento
Interfaz gráfica que permita la carga masiva o individual de archivos PDF.
*(Implementado en Sprint 1: carga individual + visualización embebida.)*

### RF-02 — Motor OCR y extracción de texto
Reconocimiento y digitalización de texto incrustado en imágenes dentro de los PDF. *(Sprint 2)*

### RF-03 — Módulo de resumen e inteligencia artificial
Generación de una síntesis clara del relato, aislando la información sustancial. *(Sprint 3)*

### RF-04 — Extracción y clasificación de entidades
- **Vehículos:** marcas, modelos, años de fabricación, colores y PPU.
- **Armas:** fuego, fogueo, blancas, calibres, marcas, modelos y series.
- **Drogas:** sustancias y aislamiento de medidas y pesos.

*(Sprints 4-5)*

### RF-05 — Módulo de exportación a formato Word (.docx)
Poblado dinámico de documentos Word pre-formateados editables. *(Sprint 6)*

### RF-06 — Persistencia e historial en PostgreSQL
- Todo documento procesado genera un registro **inmutable** con metadatos del archivo, texto
  original, resumen generado y entidades extraídas.
- Consulta del historial completo mediante filtros por fecha, tipo de entidad o palabra clave
  en el relato.

*(Sprint 7)*

### RF-07 — Tablero de estadísticas y control
- Conexión directa a PostgreSQL para actualización automática de tablas y dashboards tras cada
  procesamiento.
- Conteos acumulativos y reportes estadísticos históricos exportables.

*(Sprint 8)*

## 4. Requerimientos no funcionales

- **Seguridad e integridad:** ejecución preferentemente on-premise. PostgreSQL debe contar con
  esquemas de respaldo (backups) automáticos y control de acceso.
- **Usabilidad y escalabilidad:** el esquema de base de datos debe diseñarse normalizado,
  permitiendo escalabilidad para futuras entidades.

---
*Fuente: Documento técnico v2 (SRS), provisto por el usuario el 2026-08-20. Ver también
[ROADMAP.md](ROADMAP.md) para el cronograma de sprints.*
