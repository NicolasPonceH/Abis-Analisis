# Control de versiones

Proyecto de un solo desarrollador con sprints semanales secuenciales, así que el flujo se
mantiene simple: sin branch por sprint ni merges. Complejidad de más solo genera fricción.

## Flujo normal

1. Trabaja directo en `main`.
2. Commitea seguido, con mensajes que describan el cambio (`feat`, `fix`, `docs`, ...):
   ```bash
   git add <archivos>
   git commit -m "feat(sprint-2): extraccion de texto con Tesseract"
   git push origin main
   ```
3. Al cerrar un sprint (checklist del README en verde, revisión del martes hecha), etiqueta esa
   entrega:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
   La convención de tags por sprint está en la tabla de [ROADMAP.md](ROADMAP.md) — Sprint *N*
   corresponde a `v0.N.0`, y `v1.0.0` es la entrega final del Sprint 10.

## Cuándo sí usar una rama aparte

Solo si vas a probar algo que podría dejar `main` roto por un rato (p. ej. una migración de
esquema de PostgreSQL, o cambiar el motor de OCR). En ese caso:

```bash
git checkout -b feature/nombre-descriptivo
# ... trabajo ...
git checkout main
git merge feature/nombre-descriptivo
git branch -d feature/nombre-descriptivo
```

## Volver al estado de un sprint anterior

Cada tag es un punto exacto en la historia — no hace falta "reinstalar" nada:

```bash
git checkout v0.1.0   # ver el proyecto tal como quedó al cerrar Sprint 1
git checkout main     # volver a la punta del desarrollo
```

Para clonar y quedarse fijo en una versión (por ejemplo, para que alguien revise solo el Sprint 1):

```bash
git clone https://github.com/ashley-adaros/Sistema_analisis.git
cd Sistema_analisis
git checkout v0.1.0
```

## Changelog

Cada tag debe tener su entrada correspondiente en [`CHANGELOG.md`](../CHANGELOG.md) (raíz del
repo), con un resumen de qué se agregó/cambió en ese sprint.

## Documentación por sprint

Además del `CHANGELOG.md` (resumen breve), cada sprint cerrado tiene su propio archivo en
[`docs/sprints/`](sprints/) — `sprint-NN.md` — con:

- **Qué se hizo**: cambios concretos, con archivos y funciones/rutas involucradas.
- **Por qué se hizo**: la motivación (requerimiento del SRS, riesgo del roadmap, decisión de
  arquitectura tomada y su alternativa descartada).
- **Cómo verificar**: requisitos previos, pasos manuales en el navegador, y los comandos
  (`curl`, scripts sueltos) para comprobar el avance sin depender de la UI.

Usa [`docs/sprints/sprint-03.md`](sprints/sprint-03.md) como plantilla de referencia al cerrar
el siguiente sprint.
