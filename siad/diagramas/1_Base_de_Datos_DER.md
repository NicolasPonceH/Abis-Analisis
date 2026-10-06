# 1. Diagrama Entidad-Relación (Base de Datos)

Muestra el modelo EAV (Entidad-Atributo-Valor) utilizado en PostgreSQL para guardar los documentos y las piezas de inteligencia sin columnas rígidas, permitiendo escalabilidad total.

```mermaid
erDiagram
    DOCUMENTOS ||--o{ ENTIDADES : "contiene"
    USUARIOS ||--o{ DOCUMENTOS : "registra (opcional)"

    USUARIOS {
        BIGINT id PK
        TEXT username "UNIQUE"
        TEXT password_hash
        TEXT rol
        TIMESTAMPTZ creado_en
    }

    DOCUMENTOS {
        BIGINT id PK
        TEXT nombre_archivo
        TIMESTAMPTZ fecha_procesamiento
        TEXT texto_original
        TEXT resumen
        TEXT usuario_username FK
    }

    ENTIDADES {
        BIGINT id PK
        BIGINT documento_id FK
        TEXT categoria "vehiculo, arma, droga"
        TEXT campo "Ej: marca, calibre"
        TEXT valor "Ej: Toyota, 9mm"
    }
```
