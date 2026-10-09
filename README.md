# Sistema ABIS + SIAD (Análisis Documental)

Este repositorio contiene la integración completa del **Sistema ABIS (Enrolamiento Biométrico)** y el **Sistema de Análisis Documental (SIAD)**, unificados en una sola plataforma y compartiendo una misma base de datos (`Abis_OCR`).

## Estructura del Proyecto

- `src/` y `public/`: Contienen el frontend y backend principal en Node.js (Sistema ABIS).
- `siad/`: Contiene el sub-módulo de Análisis Documental desarrollado en Python (Flask).
- `Abis_OCR_backup.sql`: Backup completo de la base de datos unificada para restaurar el entorno local.
- `CHANGELOG_ACTUALIZACIONES.md`: Documentación detallada de cambios en BD, backend, UI y Aprendizaje Adaptativo en la rama `avances_ashley`.
- `docs/`: Contiene las capturas de pantalla de la plataforma integrada.

---

## 🤖 Prompt de Configuración Automática para Antigravity

> **Nota para la compañera de equipo:** Si estás utilizando Antigravity en tu entorno local, puedes copiar y pegar el siguiente bloque en tu chat con la IA para que monte automáticamente todo el sistema por ti.

***

**[COPIAR DESDE AQUÍ Y PEGAR EN ANTIGRAVITY]**

Hola Antigravity, acabo de clonar este repositorio que contiene la integración unificada de ABIS y SIAD. Necesito que actúes como mi asistente de DevOps y montes este entorno en mi máquina local Windows. Sigue exactamente estos pasos usando tus herramientas:

1. **Configuración de PostgreSQL**:
   - Asume que tengo PostgreSQL instalado en el puerto `5433` o `5432` con usuario `postgres`. Pregúntame la contraseña si no puedes acceder.
   - Crea una nueva base de datos llamada `Abis_OCR`.
   - Restaura el archivo `Abis_OCR_backup.sql` que se encuentra en la raíz del proyecto hacia esa base de datos.

2. **Entorno Node.js (ABIS)**:
   - Ejecuta `npm install` en la raíz del proyecto para instalar las dependencias de Node.
   - Crea un archivo `.env` basado en la estructura que veas en el código, asegurando que `DATABASE_URL` apunte a la base de datos `Abis_OCR` recién creada.

3. **Entorno Python (SIAD)**:
   - Ingresa a la carpeta `siad/`.
   - Crea un entorno virtual ejecutando `python -m venv .venv`.
   - Activa el entorno e instala las dependencias ejecutando `.\.venv\Scripts\pip install -r requirements.txt`.

4. **Ejecución de Prueba**:
   - Vuelve a la raíz del proyecto y ejecuta `npm start`.
   - Verifica en los logs que tanto el servidor de Node (puerto 3000) como el de Flask (puerto 5001) arranquen correctamente y no haya errores críticos.
   - Avísame cuando el sistema esté listo en `http://localhost:3000/`.

**[FIN DE LA COPIA]**
