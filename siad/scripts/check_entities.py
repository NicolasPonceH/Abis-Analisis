import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db

with db.get_connection() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM entidades_personas")
        print("Total personas:", cur.fetchone()[0])
        cur.execute("SELECT nombre FROM entidades_personas WHERE nombre IS NOT NULL")
        rows = [r[0] for r in cur.fetchall()]
        print(f"Total con nombre: {len(rows)}")
        victimas = [r for r in rows if "(Víctima)" in r or "(victima)" in r.lower()]
        imputados = [r for r in rows if "(Víctima)" not in r and "(victima)" not in r.lower()]
        print("Víctimas encontradas:", len(victimas), victimas[:5])
        print("Imputados encontrados:", len(imputados), imputados[:5])
