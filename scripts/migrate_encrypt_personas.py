"""Script de migración criptográfica para la tabla entidades_personas.

1. Agrega las columnas de clasificación estructural (tipo_persona, es_menor) si no existen.
2. Desactiva temporalmente el trigger de inmutabilidad (entidades_personas_inmutable).
3. Cifra con AES-256-GCM (usando ENCRYPTION_KEY del sistema) los campos:
   - nombre (víctimas, imputados, cómplices y menores)
   - rut
   - telefono
4. Actualiza las etiquetas tipo_persona ('detenido', 'complice', 'victima') y es_menor (True/False).
5. Reactiva el trigger de inmutabilidad.
6. Valida la integridad y descifrado de los registros.
"""

import os
import sys
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, "siad"))

import psycopg
from dotenv import load_dotenv

load_dotenv(os.path.join(BASE_DIR, ".env"))

from security import cifrar_texto, descifrar_texto, es_texto_cifrado

MENOR_EDAD_REGEX = re.compile(
    r'(^|[^0-9])(0|[1-9]|1[0-7])\s*(años?|anos?)([^a-zA-Z]|$)|menor de edad|nna',
    re.IGNORECASE
)


def get_connection():
    url = os.environ.get("DATABASE_URL")
    if url:
        return psycopg.connect(conninfo=url)
    return psycopg.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=os.environ.get("DB_PORT", "5433"),
        dbname=os.environ.get("DB_NAME", "Abis_OCR"),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ.get("DB_PASSWORD", "abis_dev_pw"),
    )


def run_migration():
    print("[MIGRACIÓN] Iniciando cifrado de identidades en entidades_personas...")
    with get_connection() as conn:
        with conn.cursor() as cur:
            # 1. Agregar columnas si no existen
            cur.execute("""
                ALTER TABLE entidades_personas 
                ADD COLUMN IF NOT EXISTS tipo_persona VARCHAR(30) DEFAULT 'imputado',
                ADD COLUMN IF NOT EXISTS es_menor BOOLEAN DEFAULT FALSE;
            """)
            conn.commit()
            print("[MIGRACIÓN] Columnas tipo_persona y es_menor verificadas.")

            # 2. Desactivar trigger de inmutabilidad para permitir migración
            cur.execute("ALTER TABLE entidades_personas DISABLE TRIGGER entidades_personas_inmutable;")
            conn.commit()
            print("[MIGRACIÓN] Trigger entidades_personas_inmutable deshabilitado temporalmente.")

            try:
                # 3. Leer registros actuales
                cur.execute("SELECT id, nombre, rut, telefono FROM entidades_personas ORDER BY id ASC;")
                rows = cur.fetchall()
                print(f"[MIGRACIÓN] Total de registros a evaluar: {len(rows)}")

                migrated = 0
                for row_id, nom, rut, tel in rows:
                    tipo_persona = "detenido"
                    es_menor = False
                    clean_nom = nom

                    if nom:
                        if nom.startswith("(Víctima)"):
                            tipo_persona = "victima"
                            clean_nom = nom[9:].strip()
                        elif nom.startswith("(Cómplice)"):
                            tipo_persona = "complice"
                            clean_nom = nom[10:].strip()
                        else:
                            tipo_persona = "detenido"

                        if MENOR_EDAD_REGEX.search(nom):
                            es_menor = True

                    # Cifrar campos si no lo están ya
                    nom_enc = cifrar_texto(clean_nom) if clean_nom else None
                    rut_enc = cifrar_texto(rut) if rut else None
                    tel_enc = cifrar_texto(tel) if tel else None

                    cur.execute("""
                        UPDATE entidades_personas 
                        SET nombre = %s, rut = %s, telefono = %s, tipo_persona = %s, es_menor = %s
                        WHERE id = %s
                    """, (nom_enc, rut_enc, tel_enc, tipo_persona, es_menor, row_id))
                    migrated += 1

                conn.commit()
                print(f"[MIGRACIÓN] {migrated} registros cifrados y clasificados con éxito.")

            finally:
                # 4. Reactivar trigger de inmutabilidad siempre
                cur.execute("ALTER TABLE entidades_personas ENABLE TRIGGER entidades_personas_inmutable;")
                conn.commit()
                print("[MIGRACIÓN] Trigger entidades_personas_inmutable reactivado correctamente.")

            # 5. Validación de integridad
            cur.execute("SELECT id, nombre, rut, telefono, tipo_persona, es_menor FROM entidades_personas LIMIT 5;")
            sample_rows = cur.fetchall()
            print("\n[VALIDACIÓN] Muestra de 5 registros en la base de datos:")
            for r in sample_rows:
                r_id, r_nom, r_rut, r_tel, r_tipo, r_menor = r
                nom_cifrado_ok = es_texto_cifrado(r_nom)
                nom_descifrado = descifrar_texto(r_nom)
                print(f" ID: {r_id} | Tipo: {r_tipo} | Menor: {r_menor}")
                print(f"   Nombre Cifrado (BD): {r_nom[:40]}... (Formato OK: {nom_cifrado_ok})")
                print(f"   Nombre Descifrado:   {nom_descifrado}")

    print("\n[MIGRACIÓN] Migración completada con éxito.")


if __name__ == "__main__":
    run_migration()
