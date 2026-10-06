# Hoja de ruta del proyecto

18 de agosto – 23 de octubre de 2026, 10 sprints semanales (martes a lunes). Revisión de avance
cada martes por la mañana: se valida el software funcionando y se planifica el siguiente bloque.
Cada iteración cierra con un módulo independiente, evaluable y funcional.

## Cronograma

| Sprint | Fechas | Objetivo del ciclo | Entregable | Tag |
|---|---|---|---|---|
| 1 | 18–24 ago | Arquitectura base e interfaz de carga | Subir y visualizar un PDF en el navegador | `v0.1.0` |
| 2 | 25–31 ago | Motor OCR y preprocesamiento de imágenes | Extracción de texto crudo de PDFs escaneados o digitales | `v0.2.0` |
| 3 | 1–7 sep | Integración de NLP para resúmenes | Módulo que redacta una síntesis coherente del relato | `v0.3.0` |
| 4 | 8–14 sep | Extracción de entidades: vehículos y armas | Identifica marcas, modelos, patentes, calibres, números de serie | `v0.4.0` |
| 5 | 15–21 sep | Extracción de entidades: drogas | Identifica sustancias, pesajes y medidas (carga ajustada por Fiestas Patrias) | `v0.5.0` |
| 6 | 22–28 sep | Inyección en plantillas Word | Genera y descarga un .docx con los datos en la plantilla institucional | `v0.6.0` |
| 7 | 29 sep–5 oct | Modelado PostgreSQL y persistencia histórica | Conexión operativa con registro histórico inmutable | `v0.7.0` |
| 8 | 6–12 oct | Tablero de control y estadísticas | Interfaz con gráficos y conteos consultando PostgreSQL | `v0.8.0` |
| 9 | 13–19 oct | Pruebas de integración, excepciones y seguridad | Sistema estable frente a PDFs corruptos, respaldo de BD validado | `v0.9.0` |
| 10 | 20–23 oct | Despliegue on-premise y documentación técnica | Instalación en producción, entrega de código y cierre | `v1.0.0` |

## Riesgos y puntos críticos

- **Calidad del material inicial (Sprint 2):** la eficacia del OCR depende de la legibilidad de
  las actas escaneadas. Prioridad: filtros robustos de nivelado de contraste antes del OCR.
- **Precisión de reconocimiento de entidades (Sprints 4–5):** el NER necesita iteración para
  entender terminología operativa/legal específica sin generar falsos positivos.
- **Integridad de plantillas oficiales (Sprint 6):** resúmenes extensos pueden romper el diseño
  del Word. Aplicar reglas de anclaje para no alterar márgenes ni logos institucionales.
- **Historial y concurrencia (Sprints 7–8):** el esquema de PostgreSQL debe soportar consultas
  complejas futuras y garantizar inmutabilidad de los registros históricos.

Ver también [SRS.md](SRS.md) para los requerimientos funcionales/no funcionales y
[VERSIONING.md](VERSIONING.md) para cómo se etiqueta cada entrega.
