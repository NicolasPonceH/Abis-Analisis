# Auditoría y estabilización de ABIS

Fecha: 22 de octubre de 2026.  
Alcance: aplicación ABIS; se conservaron las fuentes de SIAD sin cambios.  
Trabajo realizado en la rama de trabajo actual; no hubo commit ni push.

## Veredicto

Se encontraron y corrigieron duplicaciones y defectos que afectaban el manejo de estados, autenticación de operaciones, reportes, ingestión, horarios, destinatarios de Telegram y comandos operativos. Las rutas HTTP existentes se conservaron y se separaron en módulos para reducir el tamaño y acoplamiento de `src/server.js`.

La aplicación ABIS y PostgreSQL quedaron verificadas localmente. No se puede certificar la integración Oracle real porque no hay conexión Oracle configurada; tampoco se hizo un recorrido manual exhaustivo de todas las pantallas ni se probaron envíos reales de Telegram. Por eso el estado es operativo para las rutas verificadas, no una garantía absoluta de ausencia de defectos.

## Cambios

### Reportes, estados e inconsistencias

- Se centralizaron porcentajes y transformación compartida para reportes diario y de rango.
- Se eliminaron coincidencias parciales que confundían `NO_REGISTRADO` con `REGISTRADO` y `NO SINCRONIZADO` con `SINCRONIZADO`; los predicados identifican el dominio/estado, no IDs de catálogo rígidos.
- Las filas rechazadas por ingesta permanecen en el recuento de errores, pero no se mezclan artificialmente con la distribución de sincronización.
- Un día sin enrolamientos conserva los rechazos y el contrato completo del reporte. Solo se tolera la ausencia histórica de la tabla de lotes; otros errores de base de datos se propagan.
- Reportes de fin de semana ya no inventan éxitos cuando faltan filas de estados.
- Selección y validación de fechas/rangos de exportación se comparte. CSV escapa valores que podrían interpretarse como fórmulas.
- Se corrigió el porcentaje de Excel para que cero no se convierta en 100 %.

### Autenticación y navegación

- Se quitaron comprobaciones de segunda contraseña simuladas (`authRes` fabricado); las operaciones requieren la sesión JWT existente.
- La redirección de login valida `next` y rechaza URL externa o malformada.
- Las rutas protegidas y las recargas con cookie se cubren mediante prueba HTTP. Se conserva el flujo normal del formulario.

### Ingesta y cifrado

- Excel, portapapeles y archivos `.enc` pasan por el mismo procesamiento/mapeo; la validación no escribe catálogos.
- Se corrigió la aceptación de `.enc` en el endpoint de descifrado.
- Los lotes de inserción son transaccionales y el borrado no responde éxito si falla su auditoría.
- El adaptador Oracle legacy quedó separado. Rechaza catálogos y datos inválidos en vez de asignar valores por defecto inventados; Oracle es solo lectura y PostgreSQL recibe las inserciones. Conexión cerrada una vez también ante error.

### Horarios, destinatarios y servidor

- La configuración de horarios se valida y combina en un módulo puro; guardar requiere persistencia PostgreSQL exitosa antes de reportar éxito. Se conserva el archivo como respaldo, no como sustituto silencioso de la DB.
- Se corrigieron campos y enmascaramiento de destinatarios; respuestas no exponen ID completo, hash ni texto cifrado.
- Rutas de cuenta, métricas, exportaciones, ingesta, Telegram, seguridad, horarios y previsualizaciones se extraen a `src/routes/`; middleware de sesión/subida y utilidades de reportes quedan reutilizables.
- `src/server.js` queda como punto de entrada de 25 líneas; `src/app.js` compone dependencias y middleware. Login/registro, páginas, salud de DB y middleware JWT/Oracle, proxy y errores viven en módulos específicos.
- `src/services/serverRuntime.js` centraliza el ciclo de vida del listener y servicios (bot, scheduler, historial y proceso SIAD), separándolo de la composición HTTP.
- El servidor puede importarse en pruebas sin iniciar listeners ni servicios en segundo plano; solo arranca al ejecutarse directamente.
- Imports frontend usan URL canónica por módulo para evitar instancias duplicadas por query strings de versión.

### Comandos y operación

- Se agregó `scripts/abis-cli.js` para validación, ingesta, reportes, integridad, cifrado/descifrado y preparación del esquema ABIS.
- Las operaciones destructivas/modificadoras requieren `--apply`; el envío real exige `--send`. Cifrado/descifrado no sobrescriben el archivo de destino.
- `npm run check:abis` verifica PostgreSQL en solo lectura, coherencia de reportes, horarios y generación de Word/Excel en memoria.
- `npm run bench:abis` mide endpoints reales ABIS con PostgreSQL en solo lectura, sin iniciar servicios auxiliares.
- `npm run test:abis` agrupa pruebas de lógica, rutas, UI de login y comandos.

## Verificación ejecutada

- `npm run test:abis`: 39 pruebas aprobadas, 0 fallidas (incluye auth, navegación, composición HTTP y ciclo de vida del servidor).
- `npm run check:abis`: PostgreSQL conectado en modo `READ ONLY`; 96.248 registros; 2.402 registros inconsistentes; última jornada 8. Diario, rango, tendencia y comparación coinciden.
- `npm run bench:abis` (10 muestras por endpoint, concurrencia máxima 5): las seis rutas respondieron HTTP 200 sobre 96.248 registros. Mediana / p95: fechas 10/47 ms; diario 13/162 ms; rango 30 días 8/9 ms; tendencia 47/55 ms; comparación semanal 4/6 ms; profesiones 6/17 ms. Todas las conexiones del benchmark usan `default_transaction_read_only=on`.
- La medición es un perfil inicial de un proceso local y una muestra pequeña; el p95 con 10 observaciones se aproxima al máximo de esa muestra, no a un percentil de carga de producción.
- Word y Excel generados y validados en memoria (DOCX válido, 35.439 bytes; XLSX válido, 110.744 bytes).
- Todos los archivos `.js`/`.cjs` en `src`, `scripts` y `tests` pasaron `node --check`; `git diff --check` sin errores.
- Las pruebas no enviaron Telegram ni escribieron en la base real. El verificador real solo ejecutó lecturas y generó documentos en memoria.

## Límites conocidos

1. Oracle no está configurado en este entorno. El adaptador se probó con dobles, pero hay que validar `ENROLAMIENTOS_VIEW` y equivalencia de catálogos con la instancia Oracle real.
2. No se ejecutó `npm start` porque inicia servicios adicionales (bot, scheduler y proxy SIAD). La aplicación HTTP y rutas relevantes se probaron con servidor de prueba y dependencias simuladas.
3. No se mandó un mensaje real a Telegram ni se realizó ingestión real de archivos; ambas acciones tienen efectos externos y requieren datos/entorno de operación.
4. El benchmark no es una prueba de carga sostenida ni una comparación antes/después; no se probaron múltiples procesos, muchas más de cinco solicitudes concurrentes ni tiempos de renderizado en navegadores lentos.
5. Los comandos `db:limpiar`, `db:schema`, `db:seed` y `db:hardening` existentes siguen siendo operaciones de DB directas; ejecutar únicamente en el entorno y con el respaldo adecuados. Los scripts históricos asociados a documentación eliminada por el usuario no se restauraron.
6. Las eliminaciones previas del usuario en documentación, capturas y recursos se conservaron; no se restauró ningún archivo.
