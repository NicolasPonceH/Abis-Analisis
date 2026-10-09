# Documentación de Cambios y Actualizaciones - Rama `avances_ashley`

Esta documentación resume todas las modificaciones realizadas en la base de datos, backend, sistema de Inteligencia Artificial y la interfaz de usuario en la rama `avances_ashley` para facilitar la integración por parte del equipo.

---

## 🗄️ 1. Modificaciones en la Base de Datos (`Abis_OCR`)

### 1.1 Nueva Tabla: `resumenes_feedback`
Se creó la tabla `resumenes_feedback` para registrar las ediciones manuales que hacen los usuarios sobre los resúmenes automáticos. Esto alimenta el **Sistema de Aprendizaje Adaptativo**.

- **Ubicaciones del Esquema:**
  - `siad/db/schema.sql`
  - `db/schema_unificado.sql`

```sql
CREATE TABLE IF NOT EXISTS resumenes_feedback (
    id BIGSERIAL PRIMARY KEY,
    usuario_username TEXT NOT NULL,
    documento_id BIGINT,
    resumen_original TEXT NOT NULL,
    resumen_editado TEXT NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT now()
);
```

### 1.2 Actualización de Roles Predeterminados y Funciones de DB (`siad/db.py`)
- **Rol Predeterminado `admin` (Administrador Policial):** Dado que en la plataforma todos los usuarios deben tener acceso total compartido a los documentos subidos por cualquier operador, la columna `rol` en la base de datos y la creación de nuevos usuarios (`create_user`) quedan configuradas con **`admin`** (*Administrador Policial*) como rol por defecto.
- **Nuevas Funciones:**
  - `save_summary_feedback()`: Registra resúmenes editados por usuario.
  - `get_summary_feedback_by_user()`: Consulta el historial de preferencias del usuario.
  - `get_summary_feedback_count()`: Retorna la cantidad de ediciones aprendidas.
  - `get_all_users()`, `create_user()`, `update_user_role()`, `reset_user_password()`: Funciones para el Panel de Administración de usuarios.

---

## 🤖 2. Sistema de Aprendizaje Adaptativo de Resúmenes (IA)

- **Algoritmo (PyTextRank + Re-ponderación Dinámica):**
  - Al procesar un documento en `/analisis/`, el sistema analiza los resúmenes que el usuario ha editado en el pasado.
  - Las palabras clave preferidas reciben un mayor peso en la puntuación del grafo de centralidad de oraciones.
  - **Resultado:** Los resúmenes futuros se adaptan al estilo y foco de cada operador.
- **Badge de Estado en Configuración:** Muestra en tiempo real la cantidad de ediciones aprendidas por la plataforma.

---

## 🎨 3. Ajustes en la Interfaz de Usuario (UI/UX)

- **Vista `configuracion.html` (SIAD):**
  - **Eliminación de Sección Horarios:** Se removió la pestaña y rutas de *Horarios*, dejando únicamente **General**, **Cuenta** y **Administración**.
  - **Ampliación de Diseño:** Tipografías agrandadas (`text-3xl/4xl`), tarjetas con padding extendido (`p-8 lg:p-10`), iconos de `30-42px` y contenedor principal expandido a `max-w-[1700px]`.
  - **Integración del Panel de Administración:**
    - Formulario interactivo para **Añadir Usuarios** (Nombre, Nivel de acceso, Contraseña inicial).
    - Tabla de **Registro Activo** con estado, último acceso y acciones para cambiar rol o clave.
  - **Corrección de Maquetación Grid:** Ajuste de estructura de etiquetas `div` en la cabecera para garantizar la alineación responsive perfecta de 4 columnas (1 columna sidebar, 3 columnas panel).

- **Módulo ABIS (`cuenta.ejs`, `ajustes.ejs`, `index.ejs`, `src/server.js`):**
  - Badge de rol corregido para desplegar **Administrador Policial** cuando el usuario tiene privilegios `admin`.
  - Eliminación de la sección Horarios en las vistas de ajustes de ABIS.

---

## 🚀 Guía para la Integración (Mergear la rama `avances_ashley`)

Si tu compañero/a va a integrar esta rama en su entorno local:

1. **Obtener últimos cambios:**
   ```bash
   git fetch origin
   git checkout avances_ashley
   git pull origin avances_ashley
   ```

2. **Actualizar Esquema de Base de Datos:**
   Si la base de datos local ya existe, ejecutar el archivo SQL o correr en su cliente de PostgreSQL:
   ```sql
   CREATE TABLE IF NOT EXISTS resumenes_feedback (
       id BIGSERIAL PRIMARY KEY,
       usuario_username TEXT NOT NULL,
       documento_id BIGINT,
       resumen_original TEXT NOT NULL,
       resumen_editado TEXT NOT NULL,
       creado_en TIMESTAMPTZ DEFAULT now()
   );
   ```

3. **Iniciar Servidores:**
   ```bash
   npm start
   ```
