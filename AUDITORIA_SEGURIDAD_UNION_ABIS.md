# Informe de Auditoría de Seguridad - UNION ABIS (ABIS & SIAD)
**Metodología:** Cloudflare Vulnerability Discovery Harness (`security-audit-skill`)  
**Fecha:** 26 de Octubre de 2026  
**Objetivo:** `c:\Users\Nicolás\Desktop\UNION ABIS\sistema-abis`  
**Alcance:** Backend Node.js (ABIS), Backend Python/Flask (SIAD), Scripts de Migración, Mecanismos de Autenticación y Criptografía.

---

## 1. Resumen Ejecutivo

Se completó una auditoría de seguridad exhaustiva y el proceso de remediación integral sobre el repositorio unificado **UNION ABIS**. Siguiendo el estándar de auditoría de Cloudflare en 6 fases (Reconocimiento, Caza guiada por cobertura, Validación adversarial, Verificación de fuentes, Reporte y Remediación), se auditaron y corrigieron las superficies de ataque web, autenticación, control de accesos, inyección, manejo de credenciales y almacenamiento criptográfico.

### Matriz de Hallazgos y Estado de Remediación

| ID | Hallazgo | Severidad | Módulo | CWE | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Toma de control de cuentas por endpoint de contraseña sin autenticación | **CRÍTICA** | SIAD (`siad/app.py`) | CWE-306 | **CORREGIDO** |
| **SEC-02** | Contraseña administrativa por defecto cableada (`admin123`) | **ALTA** | SIAD (`siad/app.py`) | CWE-798 / CWE-259 | **CORREGIDO** |
| **SEC-03** | Contraseñas de base de datos en duro como fallback (`abis_dev_pw`) | **ALTA** | SIAD & Scripts | CWE-798 | **CORREGIDO** (Rama Ashley) |
| **SEC-04** | Forzado del rol `admin` en código fuente (Bypass de base de datos) | **MEDIA** | ABIS (`src/routes`, `src/middleware`) | CWE-285 | **CORREGIDO** |
| **SEC-05** | Exposición de información del servidor en ruta pública `/debug_env` | **MEDIA** | SIAD (`siad/app.py`) | CWE-200 | **CORREGIDO** |
| **SEC-06** | Cookie de sesión JWT sin directiva `Secure` automática fuera de producción | **BAJA** | ABIS (`src/routes/auth.js`) | CWE-614 | **CORREGIDO** |
| **SEC-07** | Fallback de clave secreta de sesión Flask (`dev-only-secret-v2`) | **BAJA** | SIAD (`siad/app.py`) | CWE-326 | **CORREGIDO** |

---

## 2. Detalle Técnico de los Hallazgos y Remediaciones Aplicadas

### SEC-01 [CRÍTICA]: Endpoint de actualización de contraseña sin autenticación (Account Takeover)
* **Archivo afectado:** `siad/app.py`
* **Vulnerabilidad:** La ruta `/api/update_password` actualizaba contraseñas en la base de datos sin requerir contraseña previa ni verificar la identidad del solicitante.
* **Remediación Aplicada:** Se implementó `_validar_acceso_interno_o_sesion()`. La ruta ahora exige una sesión de usuario activa en SIAD o un token de autorización interno compartido (`X-Internal-Token`) validado con `hmac.compare_digest` contra `SECRET_KEY`. ABIS (`src/routes/accounts.js`) ahora adjunta dicho token en cada llamada autorizada.

---

### SEC-02 [ALTA]: Generación de cuenta administradora con clave predecible (`admin123`)
* **Archivo afectado:** `siad/app.py`
* **Remediación Aplicada:** Se eliminó la clave predecible `"admin123"`. Ahora el sistema lee la contraseña inicial de la cuenta `admin` directamente desde la variable de entorno `ABIS_PASSWORD` (o `ADMIN_INITIAL_PASSWORD`) en el `.env`, asegurando que quien instale el sistema conozca su contraseña desde su archivo de configuración sin depender de consolas.

---

### SEC-03 [ALTA]: Credenciales de PostgreSQL en código fuente (`abis_dev_pw`)
* **Archivos afectados:** `siad/db.py` y `scripts/migrate_encrypt_personas.py`
* **Vulnerabilidad:** Existía un valor fallback en texto plano: `password=os.environ.get("DB_PASSWORD", "abis_dev_pw")`.
* **Remediación Aplicada:** Se integró el commit `ad736ab` de la rama de Ashley (`avances_ashley`). El sistema ahora lee `DATABASE_URL` o `DB_PASSWORD` estrictamente desde `.env` y lanza un `RuntimeError` preventivo si no están configuradas.

---

### SEC-04 [MEDIA]: Hardcoding del rol administrativo en el backend de ABIS
* **Archivos afectados:** `src/routes/auth.js`, `src/middleware/auth.js`, `src/routes/pages.js`
* **Vulnerabilidad:** La regla `if (username === "admin") user.rol = "admin"` forzaba privilegios de administrador ignorando la base de datos y creando discrepancias con SIAD.
* **Remediación Aplicada:** Se eliminó todo condicional en duro por nombre de usuario. Ahora todos los usuarios (incluyendo `admin`) obtienen su rol consultando la tabla `usuarios` en PostgreSQL (`SELECT rol FROM usuarios WHERE LOWER(username) = LOWER($1)`). Si un administrador degrada o modifica el rol de un usuario en la BD, el cambio se refleja inmediatamente en ABIS y SIAD.

---

### SEC-05 [MEDIA]: Endpoint de depuración público expuesto (`/debug_env`)
* **Archivo afectado:** `siad/app.py`
* **Vulnerabilidad:** Retornaba variables de entorno WSGI y rutas del servidor sin autenticación.
* **Remediación Aplicada:** Se restringió el endpoint para responder exclusivamente cuando `FLASK_DEBUG=1`. En cualquier otro entorno responde `404 Not Found`.

---

### SEC-06 [BAJA]: Directiva `Secure` en cookies de sesión JWT condicionada
* **Archivo afectado:** `src/routes/auth.js`
* **Vulnerabilidad:** `secure: env.NODE_ENV === "production"` dejaba desprotegidas las conexiones HTTPS detrás de proxies si `NODE_ENV` no estaba seteado.
* **Remediación Aplicada:** Ahora detecta conexiones seguras mediante `req.secure` y el header `x-forwarded-proto === "https"`, activando automáticamente la directiva `Secure` en la cookie `abis_auth`.

---

### SEC-07 [BAJA]: Clave secreta Flask con fallback inseguro (`dev-only-secret-v2`)
* **Archivo afectado:** `siad/app.py`
* **Vulnerabilidad:** Fallback permisivo de `app.secret_key`.
* **Remediación Aplicada:** Se configuró validación de entorno; en producción exige obligatoriamente `SECRET_KEY` o el servidor se detiene de inmediato (*fail-fast*).

---

## 3. Estado de la Integración (Rama de Ashley) y Verificación Operativa

* **Rama integrada:** `abis_analisis/avances_ashley` (commit `ad736ab`).
* **Conflictos:** 0 conflictos (Fast-Forward).
* **Pruebas de Backend:**
  - Python (SIAD): `Conectado a DB: True` (0 errores de sintaxis o importación).
  - Node.js (ABIS): Suites de tests `audit-actors.test.cjs`, `schedule-week.test.cjs` y `abis-operations.test.cjs` ejecutadas y aprobadas al 100%.
* **Estado global:** Todas las vulnerabilidades han sido resueltas y el sistema se encuentra completamente operativo.
