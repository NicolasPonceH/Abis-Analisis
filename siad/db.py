"""Persistencia del historial en PostgreSQL (Sprint 7).

Solo INSERT: no hay ninguna funcion de update/delete aqui a proposito -- el registro es
historico e inmutable (RF-06 del SRS), reforzado ademas a nivel de base de datos con triggers
(ver db/schema.sql). Conexion nueva por operacion (get_connection) en vez de un pool: el
volumen de uso de esta app (subir/procesar documentos uno por uno desde la UI) no lo justifica.
"""

import os

# pyrefly: ignore [missing-import]
import psycopg

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = os.environ.get("DB_PORT", "5433")
DB_NAME = os.environ.get("DB_NAME", "Abis_OCR")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "abis_dev_pw")
CONNECT_TIMEOUT = 5  # segundos -- sin esto, si Postgres no responde (apagado, firewall) una
                      # peticion HTTP puede quedar colgada varios minutos en vez de fallar rapido


def get_connection():
    return psycopg.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD,
        connect_timeout=CONNECT_TIMEOUT,
    )


def is_connected():
    """Chequeo liviano para el indicador de estado en la interfaz (timeout corto -- se llama
    en cada carga de pagina, no debe demorar la respuesta si Postgres esta caido)."""
    try:
        with psycopg.connect(
            host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD,
            connect_timeout=1,
        ):
            return True
    except Exception:
        return False


def init_schema():
    """Aplica db/schema.sql (CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE -- idempotente,
    seguro de correr en cada arranque de la app)."""
    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db", "schema.sql")
    with open(schema_path, encoding="utf-8") as f:
        sql = f.read()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()



def save_document(filename, texto_original, resumen, entities_data, usuario_username=None):
    """Inserta un registro inmutable del documento procesado y sus entidades. Devuelve el id
    del documento insertado."""
    entities_data = entities_data or {}
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO documentos (nombre_archivo, texto_original, resumen, usuario_username, tsv) "
                "VALUES (%s, %s, %s, %s, setweight(to_tsvector('spanish', coalesce(%s, '')), 'A') || setweight(to_tsvector('spanish', coalesce(%s, '')), 'B')) RETURNING id",
                (filename, texto_original, resumen, usuario_username, texto_original, resumen),
            )
            documento_id = cur.fetchone()[0]

            v_data = entities_data.get("vehiculos", {})
            max_v = max([len(lst) for lst in v_data.values()] + [0])
            for i in range(max_v):
                marca = v_data.get("marcas", [])[i] if i < len(v_data.get("marcas", [])) else None
                modelo = v_data.get("modelos", [])[i] if i < len(v_data.get("modelos", [])) else None
                color = v_data.get("colores", [])[i] if i < len(v_data.get("colores", [])) else None
                anio = v_data.get("anios", [])[i] if i < len(v_data.get("anios", [])) else None
                pat = v_data.get("patentes", [])[i] if i < len(v_data.get("patentes", [])) else None
                cur.execute(
                    "INSERT INTO entidades_vehiculos (documento_id, marca, modelo, color, año, patente) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (documento_id, marca, modelo, color, anio, pat)
                )

            a_data = entities_data.get("armas", {})
            max_a = max([len(lst) for lst in a_data.values()] + [0])
            for i in range(max_a):
                marca = a_data.get("marcas", [])[i] if i < len(a_data.get("marcas", [])) else None
                modelo = a_data.get("modelos", [])[i] if i < len(a_data.get("modelos", [])) else None
                tipo = a_data.get("tipos", [])[i] if i < len(a_data.get("tipos", [])) else None
                cal = a_data.get("calibres", [])[i] if i < len(a_data.get("calibres", [])) else None
                ser = a_data.get("series", [])[i] if i < len(a_data.get("series", [])) else None
                cur.execute(
                    "INSERT INTO entidades_armas (documento_id, marca, modelo, tipo, calibre, serie) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (documento_id, marca, modelo, tipo, cal, ser)
                )

            d_data = entities_data.get("drogas", {})
            max_d = max([len(lst) for lst in d_data.values()] + [0])
            for i in range(max_d):
                sust = d_data.get("sustancias", [])[i] if i < len(d_data.get("sustancias", [])) else None
                med = d_data.get("medidas", [])[i] if i < len(d_data.get("medidas", [])) else None
                cur.execute(
                    "INSERT INTO entidades_drogas (documento_id, sustancia, medida) "
                    "VALUES (%s, %s, %s)",
                    (documento_id, sust, med)
                )

            p_data = entities_data.get("personas", {})
            
            # Unir detenidos y complices en la lista de nombres para la DB, marcando los complices
            detenidos = p_data.get("detenidos", [])
            complices = p_data.get("complices", [])
            nombres_db = detenidos + [f"(Cómplice) {c}" for c in complices]
            
            max_p = max([len(nombres_db), len(p_data.get("ruts", [])), len(p_data.get("telefonos", []))] + [0])
            for i in range(max_p):
                nom = nombres_db[i] if i < len(nombres_db) else None
                rut = p_data.get("ruts", [])[i] if i < len(p_data.get("ruts", [])) else None
                tel = p_data.get("telefonos", [])[i] if i < len(p_data.get("telefonos", [])) else None
                cur.execute(
                    "INSERT INTO entidades_personas (documento_id, nombre, rut, telefono) "
                    "VALUES (%s, %s, %s, %s)",
                    (documento_id, nom, rut, tel)
                )
        conn.commit()
    return documento_id


def count_saves(filename):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM documentos WHERE nombre_archivo = %s", (filename,))
            return cur.fetchone()[0]


def list_history(fecha_desde=None, fecha_hasta=None, categoria=None, palabra_clave=None, page=1, per_page=10):
    """Historial de documentos procesados."""
    
    joins = []
    conditions = []
    params = []

    if categoria:
        if categoria == 'vehiculo':
            joins.append("JOIN entidades_vehiculos e ON e.documento_id = d.id")
        elif categoria == 'arma':
            joins.append("JOIN entidades_armas e ON e.documento_id = d.id")
        elif categoria == 'droga':
            joins.append("JOIN entidades_drogas e ON e.documento_id = d.id")
    if fecha_desde:
        conditions.append("d.fecha_procesamiento >= %s")
        params.append(fecha_desde)
    if fecha_hasta:
        conditions.append("d.fecha_procesamiento < (%s::date + interval '1 day')")
        params.append(fecha_hasta)
    if palabra_clave:
        like = f"%{palabra_clave}%"
        sub_cond = "(d.tsv @@ websearch_to_tsquery('spanish', %s) "
        sub_cond += "OR EXISTS (SELECT 1 FROM entidades_vehiculos ev WHERE ev.documento_id = d.id AND (ev.marca ILIKE %s OR ev.patente ILIKE %s)) "
        sub_cond += "OR EXISTS (SELECT 1 FROM entidades_armas ea WHERE ea.documento_id = d.id AND (ea.marca ILIKE %s OR ea.serie ILIKE %s)) "
        sub_cond += "OR EXISTS (SELECT 1 FROM entidades_drogas ed WHERE ed.documento_id = d.id AND (ed.sustancia ILIKE %s)))"
        conditions.append(sub_cond)
        params.extend([palabra_clave, like, like, like, like, like])

    join_str = " " + " ".join(joins) if joins else ""
    where_str = " WHERE " + " AND ".join(conditions) if conditions else ""

    count_query = f"SELECT COUNT(DISTINCT d.id) FROM documentos d{join_str}{where_str}"
    
    data_query = (
        f"SELECT DISTINCT d.id, d.nombre_archivo, d.fecha_procesamiento, d.resumen, d.usuario_username "
        f"FROM documentos d{join_str}{where_str} "
        f"ORDER BY d.fecha_procesamiento DESC LIMIT %s OFFSET %s"
    )
    
    data_params = params.copy()
    data_params.extend([per_page, (page - 1) * per_page])

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(count_query, params)
            total_count = cur.fetchone()[0]

            cur.execute(data_query, data_params)
            columns = [desc.name for desc in cur.description]
            registros = [dict(zip(columns, row)) for row in cur.fetchall()]

        if not registros:
            return registros, total_count

        with conn.cursor() as cur:
            ids = [r["id"] for r in registros]
            cur.execute("""
                SELECT documento_id, 'vehiculo' as cat, patente as val FROM entidades_vehiculos WHERE documento_id = ANY(%s) AND patente IS NOT NULL
                UNION ALL SELECT documento_id, 'vehiculo', marca FROM entidades_vehiculos WHERE documento_id = ANY(%s) AND marca IS NOT NULL
                UNION ALL SELECT documento_id, 'arma', serie FROM entidades_armas WHERE documento_id = ANY(%s) AND serie IS NOT NULL
                UNION ALL SELECT documento_id, 'arma', marca FROM entidades_armas WHERE documento_id = ANY(%s) AND marca IS NOT NULL
                UNION ALL SELECT documento_id, 'droga', sustancia FROM entidades_drogas WHERE documento_id = ANY(%s) AND sustancia IS NOT NULL
                UNION ALL SELECT documento_id, 'rut', rut FROM entidades_personas WHERE documento_id = ANY(%s) AND rut IS NOT NULL
                UNION ALL SELECT documento_id, 'persona', nombre FROM entidades_personas WHERE documento_id = ANY(%s) AND nombre IS NOT NULL
            """, (ids, ids, ids, ids, ids, ids, ids))
            
            entidades_dict = {}
            for documento_id, cat, valor in cur.fetchall():
                entidades_dict.setdefault(documento_id, []).append({"categoria": cat, "valor": valor})

    for r in registros:
        ents = entidades_dict.get(r["id"], [])
        seen = set()
        preview_ents = []
        for e in ents:
            if e["valor"] not in seen:
                seen.add(e["valor"])
                preview_ents.append(e)
                if len(preview_ents) >= 4:
                    break
        r["entidades_preview"] = preview_ents
        
    return registros, total_count

def find_cross_references(entities_data, exclude_filename=None):
    if not entities_data:
        return []
        
    valores_buscar = []
    for categoria, campos in entities_data.items():
        for campo, valores in campos.items():
            if campo in ["patentes", "series", "ruts", "telefonos"]:
                valores_buscar.extend(valores)
                
    if not valores_buscar:
        return []
        
    valores_buscar = list(set(v for v in valores_buscar if v and len(v) > 2))
    if not valores_buscar:
        return []
        
    with get_connection() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT DISTINCT d.id, d.nombre_archivo, d.fecha_procesamiento, e.categoria, e.valor 
                FROM (
                    SELECT documento_id, 'vehiculo' as categoria, patente as valor FROM entidades_vehiculos WHERE patente IS NOT NULL
                    UNION ALL
                    SELECT documento_id, 'arma' as categoria, serie as valor FROM entidades_armas WHERE serie IS NOT NULL
                    UNION ALL
                    SELECT documento_id, 'persona' as categoria, rut as valor FROM entidades_personas WHERE rut IS NOT NULL
                    UNION ALL
                    SELECT documento_id, 'persona' as categoria, telefono as valor FROM entidades_personas WHERE telefono IS NOT NULL
                ) e
                JOIN documentos d ON d.id = e.documento_id
                WHERE e.valor = ANY(%s)
            """
            params = [valores_buscar]
            if exclude_filename:
                query += " AND d.nombre_archivo != %s"
                params.append(exclude_filename)
                
            query += " ORDER BY d.fecha_procesamiento DESC LIMIT 10"
            
            cur.execute(query, tuple(params))
            
            coincidencias = []
            for row in cur.fetchall():
                coincidencias.append({
                    "documento_id": row[0],
                    "nombre_archivo": row[1],
                    "fecha": row[2],
                    "categoria": row[3],
                    "valor": row[4]
                })
            return coincidencias

def get_document(documento_id):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, nombre_archivo, fecha_procesamiento, texto_original, resumen, usuario_username "
                "FROM documentos WHERE id = %s",
                (documento_id,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            columns = [desc.name for desc in cur.description]
            return dict(zip(columns, row))


def get_document_entities(documento_id):
    """Devuelve las entidades estructuradas como lista EAV para que el Frontend siga funcionando igual."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 'vehiculo' as categoria, 'marcas' as campo, marca as valor FROM entidades_vehiculos WHERE documento_id = %s AND marca IS NOT NULL
                UNION ALL SELECT 'vehiculo', 'modelos', modelo FROM entidades_vehiculos WHERE documento_id = %s AND modelo IS NOT NULL
                UNION ALL SELECT 'vehiculo', 'colores', color FROM entidades_vehiculos WHERE documento_id = %s AND color IS NOT NULL
                UNION ALL SELECT 'vehiculo', 'anios', año FROM entidades_vehiculos WHERE documento_id = %s AND año IS NOT NULL
                UNION ALL SELECT 'vehiculo', 'patentes', patente FROM entidades_vehiculos WHERE documento_id = %s AND patente IS NOT NULL
                UNION ALL SELECT 'arma', 'marcas', marca FROM entidades_armas WHERE documento_id = %s AND marca IS NOT NULL
                UNION ALL SELECT 'arma', 'modelos', modelo FROM entidades_armas WHERE documento_id = %s AND modelo IS NOT NULL
                UNION ALL SELECT 'arma', 'tipos', tipo FROM entidades_armas WHERE documento_id = %s AND tipo IS NOT NULL
                UNION ALL SELECT 'arma', 'calibres', calibre FROM entidades_armas WHERE documento_id = %s AND calibre IS NOT NULL
                UNION ALL SELECT 'arma', 'series', serie FROM entidades_armas WHERE documento_id = %s AND serie IS NOT NULL
                UNION ALL SELECT 'droga', 'sustancias', sustancia FROM entidades_drogas WHERE documento_id = %s AND sustancia IS NOT NULL
                UNION ALL SELECT 'droga', 'medidas', medida FROM entidades_drogas WHERE documento_id = %s AND medida IS NOT NULL
                UNION ALL SELECT 'personas', 'detenidos', nombre FROM entidades_personas WHERE documento_id = %s AND nombre IS NOT NULL AND nombre NOT LIKE '(Cómplice)%%'
                UNION ALL SELECT 'personas', 'complices', SUBSTRING(nombre FROM 12) FROM entidades_personas WHERE documento_id = %s AND nombre IS NOT NULL AND nombre LIKE '(Cómplice)%%'
                UNION ALL SELECT 'personas', 'ruts', rut FROM entidades_personas WHERE documento_id = %s AND rut IS NOT NULL
                UNION ALL SELECT 'personas', 'telefonos', telefono FROM entidades_personas WHERE documento_id = %s AND telefono IS NOT NULL
            """, [documento_id] * 16)
            
            return [
                {"categoria": categoria, "campo": campo, "valor": valor}
                for categoria, campo, valor in cur.fetchall()
            ]


def get_stats(dias=None, agrupacion=None):
    if agrupacion is None:
        agrupacion = "dia" if dias else "mes"

    with get_connection() as conn:
        with conn.cursor() as cur:
            date_filter = ""
            params = []
            if dias:
                date_filter = "WHERE fecha_procesamiento >= CURRENT_DATE - INTERVAL '%s days'"
                params = [int(dias)]

            cur.execute(f"SELECT COUNT(*) FROM documentos {date_filter}", params)
            total_documentos = cur.fetchone()[0]

            entidades_filter = ""
            ent_params = []
            if dias:
                entidades_filter = "WHERE documento_id IN (SELECT id FROM documentos WHERE fecha_procesamiento >= CURRENT_DATE - INTERVAL '%s days')"
                ent_params = [int(dias)]

            cur.execute(f"SELECT (SELECT COUNT(*) FROM entidades_vehiculos {entidades_filter}) as v, (SELECT COUNT(*) FROM entidades_armas {entidades_filter}) as a, (SELECT COUNT(*) FROM entidades_drogas {entidades_filter}) as d, (SELECT COUNT(*) FROM entidades_personas {entidades_filter}) as p", ent_params * 4)
            counts = cur.fetchone()
            por_categoria = {"vehiculo": counts[0], "arma": counts[1], "droga": counts[2], "persona": counts[3]}

            def top_valores(tabla, campo, limite=5):
                where_clause = f"WHERE {campo} IS NOT NULL "
                q_params = []
                if dias:
                    where_clause += "AND documento_id IN (SELECT id FROM documentos WHERE fecha_procesamiento >= CURRENT_DATE - INTERVAL '%s days') "
                    q_params.append(int(dias))
                
                q_params.append(limite)
                cur.execute(
                    f"SELECT {campo}, COUNT(*) AS n FROM {tabla} "
                    f"{where_clause}"
                    f"GROUP BY {campo} ORDER BY n DESC, {campo} LIMIT %s",
                    tuple(q_params),
                )
                return [{"nombre": r[0], "count": r[1]} for r in cur.fetchall()]

            top_marcas_vehiculos = top_valores("entidades_vehiculos", "marca")
            top_marcas_armas = top_valores("entidades_armas", "marca")
            top_sustancias = top_valores("entidades_drogas", "sustancia")
            top_nacionalidades = top_valores("entidades_personas", "nombre")

            cur.execute(
                f"SELECT fecha_procesamiento::date AS dia, COUNT(*) FROM documentos "
                f"{date_filter} "
                f"GROUP BY dia ORDER BY dia", params
            )
            documentos_por_dia = [
                {"dia": dia.isoformat(), "n": n} for dia, n in cur.fetchall()
            ]

            # Tendencias historicas
            interval_str = "1 year"
            date_trunc_str = "year"
            if agrupacion == "dia":
                interval_str = "1 day"
                date_trunc_str = "day"
            elif agrupacion == "semana":
                interval_str = "1 week"
                date_trunc_str = "week"
            elif agrupacion == "mes":
                interval_str = "1 month"
                date_trunc_str = "month"

            if dias:
                start_date_str = f"CURRENT_DATE - INTERVAL '{int(dias)} days'"
            else:
                if agrupacion == "dia": start_date_str = "CURRENT_DATE - INTERVAL '30 days'"
                elif agrupacion == "semana": start_date_str = "CURRENT_DATE - INTERVAL '12 weeks'"
                elif agrupacion == "mes": start_date_str = "CURRENT_DATE - INTERVAL '11 months'"
                else: start_date_str = "CURRENT_DATE - INTERVAL '5 years'"

            tendencias_query = f"""
                WITH series AS (
                    SELECT generate_series(
                        date_trunc('{date_trunc_str}', {start_date_str}),
                        date_trunc('{date_trunc_str}', CURRENT_DATE),
                        '{interval_str}'
                    )::date as p_date
                )
                SELECT 
                    p_date as original_date,
                    (SELECT COUNT(*) FROM entidades_vehiculos ev JOIN documentos d ON ev.documento_id = d.id WHERE date_trunc('{date_trunc_str}', d.fecha_procesamiento) = s.p_date) as vehiculos,
                    (SELECT COUNT(*) FROM entidades_armas ea JOIN documentos d ON ea.documento_id = d.id WHERE date_trunc('{date_trunc_str}', d.fecha_procesamiento) = s.p_date) as armas,
                    (SELECT COUNT(*) FROM entidades_drogas ed JOIN documentos d ON ed.documento_id = d.id WHERE date_trunc('{date_trunc_str}', d.fecha_procesamiento) = s.p_date) as drogas,
                    (SELECT COUNT(*) FROM entidades_personas ep JOIN documentos d ON ep.documento_id = d.id WHERE date_trunc('{date_trunc_str}', d.fecha_procesamiento) = s.p_date) as personas
                FROM series s
                ORDER BY s.p_date;
            """
            cur.execute(tendencias_query)
            tendencias_raw = cur.fetchall()
            
            tendencias = []
            meses_es = {"01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr", "05": "May", "06": "Jun", 
                        "07": "Jul", "08": "Ago", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic"}
            
            for orig_date, v, a, d, p in tendencias_raw:
                if agrupacion == "dia":
                    label_final = orig_date.strftime("%d/%m")
                elif agrupacion == "semana":
                    label_final = f"Sem {orig_date.isocalendar()[1]} '{orig_date.strftime('%y')}"
                elif agrupacion == "mes":
                    label_final = f"{meses_es.get(orig_date.strftime('%m'), orig_date.strftime('%m'))} '{orig_date.strftime('%y')}"
                else:
                    label_final = orig_date.strftime("%Y")
                    
                tendencias.append({
                    "label": label_final,
                    "vehiculos": v,
                    "armas": a,
                    "drogas": d,
                    "personas": p
                })

    return {
        "total_documentos": total_documentos,
        "por_categoria": por_categoria,
        "top_marcas_vehiculos": top_marcas_vehiculos,
        "top_marcas_armas": top_marcas_armas,
        "top_sustancias": top_sustancias,
        "top_nacionalidades": top_nacionalidades,
        "documentos_por_dia": documentos_por_dia,
        "tendencias": tendencias,
    }


def get_entidades_resumen():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT categoria, campo, valor, COUNT(*) AS n FROM (
                    SELECT 'vehiculo' as categoria, 'marcas' as campo, marca as valor FROM entidades_vehiculos WHERE marca IS NOT NULL
                    UNION ALL SELECT 'arma', 'marcas', marca FROM entidades_armas WHERE marca IS NOT NULL
                    UNION ALL SELECT 'droga', 'sustancias', sustancia FROM entidades_drogas WHERE sustancia IS NOT NULL
                ) t GROUP BY categoria, campo, valor ORDER BY categoria, campo, n DESC
            """)
            return cur.fetchall()


def get_entidades_detalle():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT d.nombre_archivo, d.fecha_procesamiento, e.categoria, e.campo, e.valor 
                FROM (
                    SELECT documento_id, 'vehiculo' as categoria, 'marcas' as campo, marca as valor FROM entidades_vehiculos WHERE marca IS NOT NULL
                    UNION ALL SELECT documento_id, 'vehiculo', 'modelos', modelo FROM entidades_vehiculos WHERE modelo IS NOT NULL
                    UNION ALL SELECT documento_id, 'vehiculo', 'colores', color FROM entidades_vehiculos WHERE color IS NOT NULL
                    UNION ALL SELECT documento_id, 'vehiculo', 'anios', año FROM entidades_vehiculos WHERE año IS NOT NULL
                    UNION ALL SELECT documento_id, 'vehiculo', 'patentes', patente FROM entidades_vehiculos WHERE patente IS NOT NULL
                    UNION ALL SELECT documento_id, 'arma', 'marcas', marca FROM entidades_armas WHERE marca IS NOT NULL
                    UNION ALL SELECT documento_id, 'arma', 'modelos', modelo FROM entidades_armas WHERE modelo IS NOT NULL
                    UNION ALL SELECT documento_id, 'arma', 'tipos', tipo FROM entidades_armas WHERE tipo IS NOT NULL
                    UNION ALL SELECT documento_id, 'arma', 'calibres', calibre FROM entidades_armas WHERE calibre IS NOT NULL
                    UNION ALL SELECT documento_id, 'arma', 'series', serie FROM entidades_armas WHERE serie IS NOT NULL
                    UNION ALL SELECT documento_id, 'droga', 'sustancias', sustancia FROM entidades_drogas WHERE sustancia IS NOT NULL
                    UNION ALL SELECT documento_id, 'droga', 'medidas', medida FROM entidades_drogas WHERE medida IS NOT NULL
                ) e JOIN documentos d ON e.documento_id = d.id 
                ORDER BY d.fecha_procesamiento, e.categoria, e.campo
            """)
            return cur.fetchall()


def get_user_by_username(username):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, password_hash, rol, nombre_completo, creado_en as created_at, ultimo_ingreso as last_login FROM usuarios WHERE username = %s",
                (username,)
            )
            row = cur.fetchone()
            if row is None:
                return None
            columns = [desc.name for desc in cur.description]
            return dict(zip(columns, row))


def get_all_users():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, rol, nombre_completo, creado_en as created_at, ultimo_ingreso as last_login FROM usuarios ORDER BY id ASC"
            )
            columns = [desc.name for desc in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]


def update_user_role(user_id, rol):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE usuarios SET rol = %s WHERE id = %s", (rol, user_id))
        conn.commit()


def update_user_password_by_id(user_id, password_hash):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE usuarios SET password_hash = %s WHERE id = %s", (password_hash, user_id))
        conn.commit()


def create_user(username, password_hash, rol='operador', nombre_completo=None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO usuarios (username, password_hash, rol, nombre_completo) VALUES (%s, %s, %s, %s) RETURNING id",
                (username, password_hash, rol, nombre_completo)
            )
            user_id = cur.fetchone()[0]
        conn.commit()
    return user_id


def count_users():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM usuarios")
            return cur.fetchone()[0]


def update_password(username, password_hash):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE usuarios SET password_hash = %s WHERE username = %s",
                (password_hash, username)
            )
        conn.commit()


def update_last_login(username):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE usuarios SET ultimo_ingreso = now() WHERE username = %s",
                (username,)
            )
        conn.commit()


def get_user_doc_count(username):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM documentos WHERE usuario_username = %s", (username,))
            return cur.fetchone()[0]

def get_recent_docs_by_user(username, limit=5):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, nombre_archivo, fecha_procesamiento FROM documentos "
                "WHERE usuario_username = %s ORDER BY fecha_procesamiento DESC LIMIT %s",
                (username, limit)
            )
            columns = [desc.name for desc in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]

def get_all_docs_by_user(username):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, nombre_archivo, fecha_procesamiento, resumen FROM documentos "
                "WHERE usuario_username = %s ORDER BY fecha_procesamiento DESC",
                (username,)
            )
            columns = [desc.name for desc in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]


def save_summary_feedback(username, documento_id, resumen_original, resumen_editado):
    if not username or not resumen_editado:
        return None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO resumenes_feedback (usuario_username, documento_id, resumen_original, resumen_editado) "
                "VALUES (%s, %s, %s, %s) RETURNING id",
                (username, documento_id, resumen_original, resumen_editado)
            )
            feedback_id = cur.fetchone()[0]
        conn.commit()
    return feedback_id


def get_summary_feedback_by_user(username, limit=10):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, resumen_original, resumen_editado, creado_en FROM resumenes_feedback "
                "WHERE usuario_username = %s ORDER BY creado_en DESC LIMIT %s",
                (username, limit)
            )
            columns = [desc.name for desc in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]


def get_summary_feedback_count(username):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM resumenes_feedback WHERE usuario_username = %s", (username,))
            return cur.fetchone()[0]
