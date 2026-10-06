"""Respaldo de la base de datos PostgreSQL del proyecto (Sprint 9: validar los mecanismos de
respaldo -- NFR del SRS: "la base de datos PostgreSQL debe contar con esquemas de respaldo
(backups) automaticos").

    python scripts/backup_db.py

Genera backups/<base_de_datos>_<timestamp>.dump en formato custom de pg_dump (comprimido,
permite restaurar con pg_restore de forma selectiva por tabla si hace falta). La carpeta
backups/ no se versiona en git -- contiene datos reales del historial.

Para restaurar en una base de datos nueva (ver docs/sprints/sprint-09.md para el detalle):

    createdb -h 127.0.0.1 -p 5434 -U sistema_analisis nombre_destino
    pg_restore -h 127.0.0.1 -p 5434 -U sistema_analisis -d nombre_destino backups/archivo.dump
"""

import os
import subprocess
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP_DIR = os.path.join(PROJECT_ROOT, "backups")


def get_server_major_version():
    """pg_dump/pg_restore deben ser de la MISMA version mayor que el servidor -- en una
    maquina con varias instancias de PostgreSQL instaladas (como la de este proyecto: 13, 16,
    17, 18 conviven), tomar "la mas nueva que este instalada" a ciegas puede generar un dump
    en un formato mas nuevo del que el pg_restore correspondiente sabe leer."""
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SHOW server_version_num")
            return str(int(cur.fetchone()[0]) // 10000)


def find_pg_tool(name):
    env_bin = os.environ.get("PG_BIN_DIR")
    exe = f"{name}.exe" if os.name == "nt" else name
    if env_bin:
        candidate = os.path.join(env_bin, exe)
        if os.path.isfile(candidate):
            return candidate
    if os.name == "nt":
        base = r"C:\Program Files\PostgreSQL"
        try:
            candidate = os.path.join(base, get_server_major_version(), "bin", exe)
            if os.path.isfile(candidate):
                return candidate
        except Exception:
            pass
        if os.path.isdir(base):
            for version in sorted(os.listdir(base), reverse=True):
                candidate = os.path.join(base, version, "bin", exe)
                if os.path.isfile(candidate):
                    return candidate
    return name  # asume que esta en el PATH


def backup():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(BACKUP_DIR, f"{db.DB_NAME}_{timestamp}.dump")

    env = os.environ.copy()
    env["PGPASSWORD"] = db.DB_PASSWORD

    cmd = [
        find_pg_tool("pg_dump"),
        "-h", db.DB_HOST,
        "-p", str(db.DB_PORT),
        "-U", db.DB_USER,
        "-F", "c",
        "-f", out_path,
        db.DB_NAME,
    ]
    subprocess.run(cmd, check=True, env=env)
    size_kb = os.path.getsize(out_path) / 1024
    print(f"OK: {out_path} ({size_kb:.1f} KB)")
    return out_path


if __name__ == "__main__":
    backup()
