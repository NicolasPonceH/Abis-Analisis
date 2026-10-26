# Sistema ABIS + SIAD

Aplicación Node.js/Express (ABIS) y Python/Flask (SIAD), con PostgreSQL.

## Código y recursos conservados

- `src/`, `public/`: servidor, vistas, interfaz y recursos visuales de ABIS.
- `siad/`: aplicación documental, vistas, recursos, documentos cargados, modelos OCR y plantilla Word activa.
- `db/`, `siad/db/`, `config/`: esquemas SQL, reglas y configuración operativa.
- `scripts/`, `tests/`, `siad/scripts/`, `siad/tests/`: mantenimiento y pruebas.
- Dependencias, entornos virtuales, archivos de entorno y registros operativos permanecen en sus rutas originales.

Con el entorno y los servicios ya configurados, el arranque continúa siendo:

```powershell
npm start
```

El arranque activa servicios del proyecto; no es una prueba aislada.

## Prevención de ingestas repetidas (ABIS)

La ingesta identifica eventos usando `ID Registro`, `ID Origen`, fecha y hora. Si no hay ID de registro, puede usar documento, tipo, país emisor, origen, fecha y hora. Conserva estos campos al exportar Oracle o Excel: permiten reconocer filas repetidas aunque cambie el archivo, el orden o se mezclen con filas nuevas.

Se guarda una huella HMAC, no el documento en claro. Un índice único de PostgreSQL evita duplicados incluso con cargas simultáneas. La interfaz e historial separan insertados y duplicados; una carga completamente repetida queda `SIN_NOVEDADES`. Eliminar un lote permite volver a cargar sus registros. Se conserva el primer registro: reingestar no actualiza sus estados.

Las plantillas que solo contienen estadísticas se comparan como lote completo, conservando el número de filas iguales; no permiten detectar solapamientos parciales con certeza. Los registros anteriores a esta protección no contienen los identificadores necesarios y no se fusionan ni eliminan automáticamente. El hash antiguo del portapapeles (cantidad y primeras tres filas) sirve únicamente para bloquear una **posible** repetición y pedir revisar el lote anterior; cambiar el orden o importar parte de un lote antiguo puede no activar ese aviso.

Las columnas e índice se crean automáticamente al iniciar ABIS o ingestar. `ENCRYPTION_KEY` debe conservarse; rotarla exige migrar las huellas. Para verificar con datos sintéticos en un esquema aislado de PostgreSQL, eliminado al terminar:

```powershell
$env:ABIS_TEST_POSTGRES = '1'
npm run test:abis
Remove-Item Env:ABIS_TEST_POSTGRES
```

## Documentación, presentación y material de apoyo

El 22-10-2026 se trasladó el material que no utiliza la aplicación en ejecución a la carpeta local **`../TODO LO QUE SOBRA`**, junto a este proyecto. No se eliminaron sus contenidos.

- [Índice y criterios de organización](../TODO%20LO%20QUE%20SOBRA/LEEME.md).
- [README original completo](../TODO%20LO%20QUE%20SOBRA/sistema-abis/README.md).
- [Documentación ABIS](../TODO%20LO%20QUE%20SOBRA/sistema-abis/docs/README.md).
- [Documentación SIAD](../TODO%20LO%20QUE%20SOBRA/sistema-abis/siad/README.md).
- [Presentación HTML](../TODO%20LO%20QUE%20SOBRA/sistema-abis/presentacion/Union_ABIS_SIAD_v2/index.html).

Las planillas de entrada ahora están en `../TODO LO QUE SOBRA/sistema-abis/data/`. Para una carga manual, seleccionarlas desde esa ubicación. Los documentos procesados por SIAD no se trasladaron.

Este archivo es un índice operativo nuevo; el README anterior permanece íntegro en el archivo. La carpeta de archivo está fuera de Git: estos enlaces son locales y no estarán disponibles en un clon nuevo sin una copia separada. Contiene planillas y respaldos potencialmente sensibles: **no publicarla ni subirla completa a GitHub**.

## Verificación y problemas preexistentes

```powershell
node --test tests/auth-loading.test.cjs
```

Las 10 pruebas aisladas del login pasaron antes y después de la reorganización. No equivalen a una validación integral de PostgreSQL, Oracle, OCR o Telegram.

Ya existían nueve comandos npm cuyos scripts no están presentes (`db:poblar`, `ingest`, `etl`, `flujo-diario`, `validar-integridad`, `telegram:enviar`, `security:cifrar`, `security:descifrar`, `db:crear`) y una referencia relativa incorrecta a `./src/ingest/catalogMapper` en `src/server.js`. No se modificaron en esta reorganización. Consultar el informe de la carpeta de archivo antes de utilizar esos comandos; `setup` también depende de `db:crear`.
