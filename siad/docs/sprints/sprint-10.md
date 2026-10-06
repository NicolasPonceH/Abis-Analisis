# Sprint 10 — Despliegue on-premise y documentación técnica

**Fechas:** 20–23 oct 2026 · **Tag:** `v1.0.0` · **Objetivo del roadmap:** instalación en
producción, entrega de código y cierre. Sprint final: no agrega módulos al pipeline, cierra el
proyecto completo de 10 sprints.

## Qué se hizo

### Servidor de aplicaciones de producción

- Se agregó `waitress` a `requirements.txt` como servidor WSGI de producción. `python app.py`
  usa el servidor de desarrollo de Flask/Werkzeug — de un solo hilo, sin hardening, y la propia
  librería advierte que no es apto para producción; hasta este sprint el proyecto nunca había
  corrido de otra forma.
- Se eligió `waitress` sobre `gunicorn` porque **no soporta Windows de forma nativa** —
  incompatible con el resto del stack de este proyecto, instalado enteramente en Windows vía
  `winget` (Tesseract, PostgreSQL). `waitress` es Python puro, sin dependencias nativas que
  compilar, y corre igual en el servidor de producción Windows.
- Se validó levantando la app real con `waitress-serve --listen=127.0.0.1:5001 app:app` y
  confirmando `200 OK` en `/`, `/estadisticas` y `/historial` antes de documentar el comando —
  no se documentó nada sin probarlo primero.

### Automatización de arranque y respaldo

- `scripts/run_production.bat`: envuelve el comando de `waitress-serve`, fija el directorio de
  trabajo y valida que `FLASK_DEBUG` no quede encendido por accidente. Pensado como acción de
  una tarea programada de Windows (Task Scheduler) con desencadenador "al iniciar el equipo",
  para que el sistema quede arriba después de un reinicio sin intervención manual.
- Se documentó (no se automatizó con código nuevo, `scripts/backup_db.py` ya existía desde
  Sprint 9) cómo programar el respaldo de PostgreSQL como una tarea diaria separada.

### Documentación técnica

- **`docs/DEPLOYMENT.md`** (nuevo): guía de despliegue completa — requisitos, por qué waitress
  y no el servidor de desarrollo, checklist obligatorio de variables de entorno de producción
  (`SECRET_KEY`, `DB_PASSWORD`, `FLASK_DEBUG`, rutas de Tesseract), arranque automático vía Task
  Scheduler, respaldo programado, reglas de firewall/red (solo LAN, sin exposición a internet —
  cumple el NFR "ejecución preferentemente on-premise" del SRS), checklist de **marcha blanca**,
  y notas de entrega/cierre del proyecto.
- `docs/DIAGRAMS.md`: nueva sección "Despliegue on-premise" con el diagrama de arquitectura de
  producción (cliente LAN → waitress → Flask → PostgreSQL, tareas programadas de arranque y
  respaldo); se actualizó también la introducción del diagrama general — ya no dice "estado a
  Sprint 8", ahora refleja que el roadmap completo de 10 sprints está cerrado.
- `README.md`: cabecera de "Estado actual" actualizada a Sprint 10 / `v1.0.0`, nueva sección
  "Producción (despliegue on-premise)" enlazando a `DEPLOYMENT.md`, sección "Próximos sprints"
  reemplazada por "Roadmap" (ya no queda nada pendiente), enlace a `DEPLOYMENT.md` agregado en
  "Documentación" y en la lista de Estructura.
- `CHANGELOG.md`: entrada `v1.0.0` documentando el cierre.

## Por qué se hizo

El roadmap del proyecto define el Sprint 10 en términos explícitos: "instalación en producción,
entrega de código y cierre" — no es un sprint de funcionalidad nueva, es el que convierte un
proyecto que hasta ahora solo corrió con `python app.py` en la máquina de desarrollo en algo
que un tercero (el área de TI de la institución) puede instalar, arrancar automáticamente,
respaldar y mantener sin depender de quien lo construyó.

La documentación técnica se centró en un solo archivo nuevo (`DEPLOYMENT.md`) en vez de
dispersar la información, siguiendo el mismo criterio que el resto del proyecto: cada decisión
de arquitectura vive en un lugar predecible (`docs/sprints/` para el porqué histórico,
`DEPLOYMENT.md` para la operación día a día).

La checklist de "marcha blanca" no es una formalidad — enumera exactamente los mismos pasos que
se ejecutaron para validar este sprint (arrancar con waitress, confirmar debug apagado, correr
el pipeline completo, probar el respaldo), para que quien despliegue en el servidor real de la
institución repita la misma verificación antes de dar el sistema por operativo.

## explicacion

Es el último sprint del proyecto: se dejó el sistema listo para instalarlo en un computador real
dentro de la red de la institución (no expuesto a internet, por seguridad), usando un servidor
apto para producción en vez del servidor simple que se usó durante todo el desarrollo. También
se armó la documentación técnica completa — cómo instalarlo, cómo arrancarlo automáticamente,
cómo respaldar la base de datos — para que cualquier persona del área de TI pueda hacerse cargo
del sistema sin depender de quien lo construyó. Con esto se cierran los 10 sprints planificados.

## Cómo verificar

### Requisitos previos

```bash
pip install -r requirements.txt   # ahora incluye waitress
```

### Pasos

Arrancar en modo producción y confirmar que responde:

```bash
.venv\Scripts\waitress-serve.exe --listen=127.0.0.1:5000 app:app
```

En otra terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5000/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5000/estadisticas
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5000/historial
```

Los tres deben responder `200`.

Confirmar que el modo debug sigue apagado por defecto (no cambia respecto a Sprint 9, pero es
parte de la checklist de marcha blanca): la salida de arranque de waitress no debe mencionar el
debugger interactivo de Werkzeug (eso solo aparece con el servidor de desarrollo y
`FLASK_DEBUG=1`, nunca con waitress).

Revisar `docs/DEPLOYMENT.md` sección 7 para la checklist completa de marcha blanca a ejecutar
en el servidor de producción real (arranque automático vía Task Scheduler, variables de entorno
cambiadas, respaldo restaurado al menos una vez, regla de firewall limitada a la LAN).

## Archivos modificados

`requirements.txt` (`waitress`), `scripts/run_production.bat` (nuevo), `docs/DEPLOYMENT.md`
(nuevo), `docs/DIAGRAMS.md`, `docs/sprints/sprint-10.md` (nuevo), `README.md`, `CHANGELOG.md`.
