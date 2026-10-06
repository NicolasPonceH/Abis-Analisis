import psycopg
import os

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = os.environ.get("DB_PORT", "5434")
DB_NAME = os.environ.get("DB_NAME", "sistema_analisis")
DB_USER = os.environ.get("DB_USER", "sistema_analisis")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "SistemaAnalisisApp2026!")

try:
    with psycopg.connect(host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD) as conn:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_ingreso TIMESTAMPTZ;")
        conn.commit()
    print("Added ultimo_ingreso successfully.")
except Exception as e:
    print(f"Error: {e}")
