const { enviarMensaje } = require("./telegramClient");
const { cifrarTexto, descifrarTexto, generarHashSHA256 } = require("../security/crypto");

// Descifra de forma segura si viene en formato cifrado AES-256-GCM (iv:authTag:ciphertext)
function descifrarSeguro(valor) {
  if (!valor) return "";
  const str = String(valor).trim();
  if (str.split(":").length === 3) {
    try {
      return descifrarTexto(str);
    } catch {
      return str;
    }
  }
  return str;
}

// Inicializa la tabla en PostgreSQL con cifrado AES-256 y migra datos existentes
async function inicializarDestinatarios(pool) {
  if (!pool) return;

  // 1. Crear tabla con columnas necesarias
  await pool.query(`
    CREATE TABLE IF NOT EXISTS destinatarios_telegram (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(120) NOT NULL,
      chat_id TEXT NOT NULL,
      chat_id_hash VARCHAR(64),
      rol_unidad VARCHAR(120) DEFAULT 'General',
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // 2. Migraciones automáticas de estructura para compatibilidad previa
  try {
    await pool.query(`ALTER TABLE destinatarios_telegram ALTER COLUMN chat_id TYPE TEXT;`);
  } catch {}
  try {
    await pool.query(`ALTER TABLE destinatarios_telegram ADD COLUMN IF NOT EXISTS chat_id_hash VARCHAR(64);`);
  } catch {}
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_destinatarios_activo ON destinatarios_telegram (activo);`);
  } catch {}
  try {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_destinatarios_hash ON destinatarios_telegram (chat_id_hash);`);
  } catch {}

  // 3. Cifrado y cálculo de hash de registros que estaban en texto plano
  try {
    const { rows } = await pool.query("SELECT id, chat_id, chat_id_hash FROM destinatarios_telegram");
    for (const r of rows) {
      const cid = String(r.chat_id || "").trim();
      const esCifrado = cid.split(":").length === 3;
      if (!esCifrado) {
        const hash = generarHashSHA256(cid);
        const cifrado = cifrarTexto(cid);
        await pool.query(
          "UPDATE destinatarios_telegram SET chat_id = $1, chat_id_hash = $2 WHERE id = $3",
          [cifrado, hash, r.id]
        );
      } else if (!r.chat_id_hash) {
        const plano = descifrarSeguro(cid);
        const hash = generarHashSHA256(plano);
        await pool.query(
          "UPDATE destinatarios_telegram SET chat_id_hash = $1 WHERE id = $2",
          [hash, r.id]
        );
      }
    }
  } catch (migrErr) {
    console.warn("[DESTINATARIOS] Advertencia migrando registros a cifrado:", migrErr.message);
  }

  // 4. Si la tabla está vacía y .env tiene IDs, sembrar cifrados
  try {
    const { rows } = await pool.query("SELECT COUNT(*) AS total FROM destinatarios_telegram");
    const count = parseInt(rows[0]?.total || "0", 10);

    if (count === 0 && process.env.TELEGRAM_CHAT_ID) {
      const ids = String(process.env.TELEGRAM_CHAT_ID)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      for (const cid of ids) {
        let nombre = "Oficial Destinatario";
        let rol = "Operativo";

        if (cid.startsWith("-100")) {
          nombre = "Canal Central PDI / Jefatura";
          rol = "Canal Oficial";
        } else if (cid === "1466879122") {
          nombre = "Oficial Administrador";
          rol = "Operaciones Centrales";
        } else if (cid === "7961617813") {
          nombre = "Oficial Operativo";
          rol = "Jefatura / Enrolamiento";
        }

        const cifrado = cifrarTexto(cid);
        const hash = generarHashSHA256(cid);

        await pool.query(
          `INSERT INTO destinatarios_telegram (nombre, chat_id, chat_id_hash, rol_unidad, activo)
           VALUES ($1, $2, $3, $4, TRUE)
           ON CONFLICT (chat_id_hash) DO NOTHING`,
          [nombre, cifrado, hash, rol]
        );
      }
      console.log(`[DESTINATARIOS] Cifrados y migrados ${ids.length} destinatarios iniciales desde .env a PostgreSQL (AES-256).`);
    }
  } catch (err) {
    console.warn("[DESTINATARIOS] Advertencia en inicialización:", err.message);
  }
}

// Lista todos los destinatarios registrados en PostgreSQL (descifrando en memoria RAM)
async function listarDestinatarios(pool) {
  const { rows } = await pool.query(`
    SELECT id, nombre, chat_id, chat_id_hash, rol_unidad, activo,
           to_char(creado_en, 'YYYY-MM-DD HH24:MI') AS fecha_registro
    FROM destinatarios_telegram
    ORDER BY id ASC
  `);
  return rows.map((r) => ({
    ...r,
    chat_id: descifrarSeguro(r.chat_id),
    chat_id_cifrado: r.chat_id,
  }));
}

// Obtiene únicamente los chat_id en texto plano en RAM de los destinatarios activos
async function obtenerChatIdsActivos(pool) {
  if (!pool) return [];
  try {
    const { rows } = await pool.query(`
      SELECT chat_id FROM destinatarios_telegram WHERE activo = TRUE ORDER BY id ASC
    `);
    return rows.map((r) => descifrarSeguro(r.chat_id)).filter(Boolean);
  } catch (err) {
    console.warn("[DESTINATARIOS] Error al consultar chat_ids activos:", err.message);
    return [];
  }
}

// Registra o actualiza un destinatario cifrando su chat_id con AES-256-GCM
async function agregarDestinatario(pool, { nombre, chatId, rolUnidad, activo = true }) {
  const cleanNombre = String(nombre || "").trim();
  const cleanChatId = String(chatId || "").trim();
  const cleanRol = String(rolUnidad || "General").trim() || "General";

  if (!cleanNombre) {
    throw new Error("El nombre o alias del destinatario es obligatorio.");
  }
  if (!cleanChatId || !/^-?\d+$/.test(cleanChatId)) {
    throw new Error("El Chat ID debe ser un valor numérico válido de Telegram (ej: 7961617813 o -1004420809456).");
  }

  const cifrado = cifrarTexto(cleanChatId);
  const hash = generarHashSHA256(cleanChatId);

  // Verificamos si ya existe por hash SHA-256
  const { rows: existing } = await pool.query(
    "SELECT id FROM destinatarios_telegram WHERE chat_id_hash = $1",
    [hash]
  );

  let resultRow;
  if (existing.length > 0) {
    const { rows } = await pool.query(
      `UPDATE destinatarios_telegram
       SET nombre = $1, chat_id = $2, rol_unidad = $3, activo = $4, actualizado_en = NOW()
       WHERE id = $5
       RETURNING id, nombre, chat_id, rol_unidad, activo,
                 to_char(creado_en, 'YYYY-MM-DD HH24:MI') AS fecha_registro`,
      [cleanNombre, cifrado, cleanRol, Boolean(activo), existing[0].id]
    );
    resultRow = rows[0];
  } else {
    const { rows } = await pool.query(
      `INSERT INTO destinatarios_telegram (nombre, chat_id, chat_id_hash, rol_unidad, activo, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, nombre, chat_id, rol_unidad, activo,
                 to_char(creado_en, 'YYYY-MM-DD HH24:MI') AS fecha_registro`,
      [cleanNombre, cifrado, hash, cleanRol, Boolean(activo)]
    );
    resultRow = rows[0];
  }

  return {
    ...resultRow,
    chat_id: cleanChatId,
  };
}

// Alterna el estado activo/pausado de un destinatario
async function toggleEstadoDestinatario(pool, id, activo) {
  let query;
  let params;
  if (activo !== undefined) {
    query = `UPDATE destinatarios_telegram
             SET activo = $2, actualizado_en = NOW()
             WHERE id = $1
             RETURNING id, nombre, chat_id, rol_unidad, activo,
                       to_char(creado_en, 'YYYY-MM-DD HH24:MI') AS fecha_registro`;
    params = [id, Boolean(activo)];
  } else {
    query = `UPDATE destinatarios_telegram
             SET activo = NOT activo, actualizado_en = NOW()
             WHERE id = $1
             RETURNING id, nombre, chat_id, rol_unidad, activo,
                       to_char(creado_en, 'YYYY-MM-DD HH24:MI') AS fecha_registro`;
    params = [id];
  }
  const { rows } = await pool.query(query, params);
  if (rows.length === 0) {
    throw new Error("Destinatario no encontrado.");
  }
  return {
    ...rows[0],
    chat_id: descifrarSeguro(rows[0].chat_id),
  };
}

// Elimina un destinatario de la base de datos
async function eliminarDestinatario(pool, id) {
  const { rows } = await pool.query(
    `DELETE FROM destinatarios_telegram WHERE id = $1 RETURNING id, nombre, chat_id`,
    [id]
  );
  if (rows.length === 0) {
    throw new Error("Destinatario no encontrado.");
  }
  return {
    ...rows[0],
    chat_id: descifrarSeguro(rows[0].chat_id),
  };
}

// Envía una prueba individual a un destinatario específico para verificar conexión
async function enviarPruebaIndividual(pool, id) {
  const { rows } = await pool.query(
    `SELECT id, nombre, chat_id, rol_unidad, activo FROM destinatarios_telegram WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) {
    throw new Error("Destinatario no encontrado en la base de datos.");
  }

  const dest = {
    ...rows[0],
    chat_id: descifrarSeguro(rows[0].chat_id),
  };

  if (!dest.activo) {
    throw new Error(`No es posible enviar prueba: el destinatario '${dest.nombre}' se encuentra pausado. Debe activarlo primero.`);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("No hay TELEGRAM_BOT_TOKEN configurado en el servidor.");
  }

  const nowChile = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const texto = [
    `👮‍♂️ <b>SISTEMA ABIS - VERIFICACIÓN DE DESTINATARIO</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Estimado(a) <b>${dest.nombre}</b> (${dest.rol_unidad || "Oficial"}):`,
    ``,
    `Su ID de Telegram (<code>${dest.chat_id}</code>) ha sido verificada y asignada exitosamente en el Centro de Monitoreo y Analítica ABIS (PDI).`,
    ``,
    `✅ <b>Estado:</b> Conexión Confirmada e Integrada (AES-256 Encrypted)`,
    `📡 <b>Canal:</b> Notificaciones Oficiales PDI`,
    `🕒 <b>Fecha y Hora:</b> ${nowChile} hrs`,
    ``,
    `<i>Usted recibirá los despachos analíticos según la programación institucional activa.</i>`,
  ].join("\n");

  try {
    const resTelegram = await enviarMensaje({ token, chatId: dest.chat_id, texto });
    return { ok: true, destinatario: dest, messageId: resTelegram.message_id };
  } catch (tgErr) {
    let errorAmigable = tgErr.message;
    if (errorAmigable.includes("chat not found") || errorAmigable.includes("blocked by the user")) {
      errorAmigable = "El usuario aún no ha iniciado el bot en Telegram. Debe hacer clic en el enlace del bot y presionar 'Iniciar' (/start) al menos una vez.";
    }
    throw new Error(errorAmigable);
  }
}

module.exports = {
  inicializarDestinatarios,
  listarDestinatarios,
  obtenerChatIdsActivos,
  agregarDestinatario,
  toggleEstadoDestinatario,
  eliminarDestinatario,
  enviarPruebaIndividual,
};
