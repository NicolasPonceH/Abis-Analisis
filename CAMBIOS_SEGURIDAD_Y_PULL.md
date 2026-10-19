# ⚠️ AVISO PARA EL EQUIPO: CAMBIOS DE SEGURIDAD Y PRIVACIDAD TRAS GIT PULL

Este documento detalla los cambios implementados en la rama `avances_ashley` relativos a la **eliminación de tarjetas nominales** y al **cifrado en reposo de identidades** (víctimas, detenidos, cómplices y menores de edad).

---

## 1. ¿Qué se eliminó y NO debe volver a agregarse?

### A. En el Tablero de Estadísticas (`siad/templates/estadisticas.html`)
Se eliminaron permanentemente las **4 tarjetas de rankings con nombres personales**:
- ❌ **Sujetos / Imputados** (Top 5 registros nominales)
- ❌ **Víctimas / Afectados** (Top 5 víctimas nominales)
- ❌ **Víctimas Menores (N.N.A.)** (Top 5 N.N.A. nominales)
- ❌ **Detenidos Menores (RPA)** (Top 5 infractores nominales)

> **Regla de interfaz:** El tablero ahora contiene únicamente las **3 tarjetas de evidencia material** (Vehículos, Armamento y Sustancias Ilícitas) en una grilla de 3 columnas (`grid grid-cols-1 md:grid-cols-3`). Si en tu rama local o tras resolver conflictos de merge reaparece alguna de estas 4 tarjetas, **debes eliminarla**.

### B. En la Exportación de Reportes Excel (`siad/export_stats.py`)
- ❌ Se eliminaron las hojas nominales **`Personas`** y **`Víctimas`**.
- ❌ En la hoja **`Datos`** (tabla en bruto para tablas dinámicas) se filtran y omiten expresamente las filas de categorías `persona`, `victima` y `personas`.
- ✅ La hoja **`NNA`** y los gráficos de tendencias solo consolidan **indicadores numéricos agregados** (conteos), nunca identidades ni texto plano de nombres.

### C. En Consultas del Backend (`siad/db.py`)
- ❌ `get_stats()` ya no genera rankings de nombres: `top_nacionalidades`, `top_victimas`, `top_victimas_menores` y `top_detenidos_menores` retornan listas vacías `[]`.
- ❌ `list_history()` ya no incluye personas en `entidades_preview` de la tabla del historial.

---

## 2. ¿Cómo funciona ahora la Base de Datos?

1. **Cifrado AES-256-GCM ([siad/security.py](siad/security.py)):**
   - Los campos **`nombre`**, **`rut`** y **`telefono`** de la tabla `entidades_personas` se almacenan **100% cifrados en reposo** en formato `iv:tag:ciphertext` (Base64).
   - Utiliza la llave maestra `ENCRYPTION_KEY` definida en el archivo `.env` (interoperable con `src/security/crypto.js` en Node.js).
2. **Nuevas Columnas Operativas:**
   - `tipo_persona VARCHAR(30)` (`'detenido'`, `'complice'`, `'victima'`)
   - `es_menor BOOLEAN`
   - Los conteos cuantitativos se realizan sobre estas dos columnas, **sin necesidad de descifrar** datos personales.
3. **Descifrado Transparente en Detalle:**
   - La función `db.get_document_entities(documento_id)` descifra automáticamente en memoria los datos para ser mostrados únicamente a usuarios autenticados dentro de la vista de detalle del expediente (`/historial/<id>`).

---

## 3. Checklist obligatorio al hacer `git pull` en tu entorno local

1. **Actualizar dependencias de Python:**
   ```bash
   pip install -r siad/requirements.txt
   ```
   *(Asegura tener instalada la librería `cryptography>=42.0.0`)*

2. **Verificar variables de entorno en `.env`:**
   Asegúrate de que tu archivo `.env` contenga la clave de cifrado:
   ```env
   ENCRYPTION_KEY=<tu_clave_hex_de_32_bytes>
   ```

3. **Migrar registros locales existentes (si tu BD tiene nombres sin cifrar):**
   Si tu base de datos local tiene registros previos en texto plano, ejecuta el script de migración idempotente:
   ```bash
   python scripts/migrate_encrypt_personas.py
   ```
   *Este script clasifica automáticamente los registros en `tipo_persona` y `es_menor`, cifra los datos con AES-256-GCM y respeta los triggers de inmutabilidad.*
