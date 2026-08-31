require("dotenv").config();
const { Pool } = require("pg");

// Simulacion de la BD fuente (PruebDataBase_FAKE): inserta registros "operativos" del dia en
// abis_fuente.enrolamiento_origen, como si el sistema institucional los hubiera capturado hoy.
// Ver docs/PruebDataBase_FAKE.md.
//
// Uso:
//   npm run fuente:generar                          -> hoy, entre --min y --max filas
//   node scripts/fuente-generar.js --fecha 2026-08-25 --min 10 --max 20 --forzar
//
// Ruido inyectado a proposito (para ejercitar el ETL):
//   - ~3% con tipeos corregibles (Levenshtein <= 2) en nacionalidad/equipo/estados
//   - ~1% con nacionalidad desconocida (fila rechazada por el ETL, dispara aviso)
//   - ~1% con jerarquia invalida (cuartel que no pertenece a la unidad, rechazo exacto)
// La jerarquia Region/Unidad/Cuartel valida se limita a las combinaciones existentes en los
// catalogos sembrados: solo PREPOLIN ARICA tiene cuarteles (COLCHANES/ANGAMOS/CHACALLUTA).

const NACIONALIDADES = [
  ["CHILE", 30], ["VENEZUELA", 25], ["BOLIVIA", 12], ["PERU", 12],
  ["COLOMBIA", 10], ["ECUADOR", 6], ["ARGENTINA", 5],
];
const JERARQUIA_VALIDA = [
  { region: "ARICA - PARINACOTA", unidad: "PREPOLIN ARICA", cuarteles: ["COLCHANES", "ANGAMOS", "CHACALLUTA"] },
];
const EQUIPOS = [["PC DE ESCRITORIO", 70], ["TABLET", 30]];
const GENEROS = [["M", 55], ["F", 40], ["X", 5]];
const ESTADO_SINCRONIZACION = [["SINCRONIZADO", 88], ["PENDIENTE", 9], ["ERROR", 3]];
const ESTADO_REGISTRO = [["REGISTRADO", 92], ["PENDIENTE", 8]];

// Valores lejanos a cualquier entrada de catalogo (distancia > 2): el ETL no debe poder
// corregirlos, solo rechazar la fila.
const NACIONALIDADES_DESCONOCIDAS = ["MARCIANO", "ATLANTIDA", "NARNIA"];

function elegirPonderado(opciones) {
  const total = opciones.reduce((suma, [, peso]) => suma + peso, 0);
  let dado = Math.random() * total;
  for (const [valor, peso] of opciones) {
    dado -= peso;
    if (dado < 0) return valor;
  }
  return opciones[opciones.length - 1][0];
}

function enteroAleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function probabilidad(p) {
  return Math.random() < p;
}

// Tipeo simple de 1 caracter (borrar/duplicar una letra): distancia de Levenshtein 1,
// siempre corregible por el ETL y sin riesgo de caer en otro valor del catalogo.
function tipear(valor) {
  const i = Math.floor(Math.random() * valor.length);
  return probabilidad(0.5)
    ? valor.slice(0, i) + valor.slice(i + 1)
    : valor.slice(0, i) + valor[i] + valor.slice(i);
}

function generarFila(fecha) {
  const jerarquia = JERARQUIA_VALIDA[0];
  const cuartel = jerarquia.cuarteles[Math.floor(Math.random() * jerarquia.cuarteles.length)];

  // Edad coherente con mayor_edad: los menores de edad siempre traen edad_exacta (para la
  // distribucion N.N.A. del reporte); los adultos la traen solo a veces.
  const esMenor = probabilidad(0.15);
  const edad = esMenor ? enteroAleatorio(0, 17) : enteroAleatorio(18, 75);

  const sincronizacion = elegirPonderado(ESTADO_SINCRONIZACION);
  // Estado general correlacionado: un error de sincronizacion casi siempre arrastra CON_ERROR.
  const general = sincronizacion === "ERROR" || probabilidad(0.05) ? "CON_ERROR" : "OK";

  return {
    fecha_enrolamiento: fecha,
    nacionalidad: elegirPonderado(NACIONALIDADES),
    region: jerarquia.region,
    unidad: jerarquia.unidad,
    cuartel,
    equipo: elegirPonderado(EQUIPOS),
    genero: elegirPonderado(GENEROS),
    mayor_edad: esMenor ? "NO" : "SI",
    edad_exacta: esMenor || probabilidad(0.6) ? edad : null,
    estado_sincronizacion: sincronizacion,
    estado_registro: elegirPonderado(ESTADO_REGISTRO),
    estado_general: general,
  };
}

// Aplica el ruido sobre copias ya generadas. Devuelve contadores para el log.
function aplicarRuido(filas) {
  const conteo = { tipeos: 0, desconocidas: 0, jerarquiaInvalida: 0 };

  for (const fila of filas) {
    if (probabilidad(0.03)) {
      const campo = elegirPonderado([
        ["nacionalidad", 50], ["equipo", 20],
        ["estado_sincronizacion", 15], ["estado_registro", 15],
      ]);
      fila[campo] = tipear(fila[campo]);
      conteo.tipeos += 1;
    }
    if (probabilidad(0.01)) {
      fila.nacionalidad =
        NACIONALIDADES_DESCONOCIDAS[Math.floor(Math.random() * NACIONALIDADES_DESCONOCIDAS.length)];
      conteo.desconocidas += 1;
    }
    if (probabilidad(0.01)) {
      // Cuartel valido bajo una unidad que no lo contiene: rompe la clave compuesta
      // UNIDAD|CUARTEL que el mapeador resuelve por coincidencia exacta.
      fila.unidad = "JENATID";
      conteo.jerarquiaInvalida += 1;
    }
  }
  return conteo;
}

function fechaDeHoy() {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

function parsearArgumentos() {
  const args = process.argv.slice(2);
  const valorDe = (nombre) => {
    const i = args.indexOf(nombre);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const fecha = valorDe("--fecha") || fechaDeHoy();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error(`Fecha invalida: "${fecha}" (formato esperado YYYY-MM-DD)`);
  }
  return {
    fecha,
    min: Number(valorDe("--min") || 40),
    max: Number(valorDe("--max") || 150),
    forzar: args.includes("--forzar"),
  };
}

async function main() {
  const { fecha, min, max, forzar } = parsearArgumentos();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no definida (.env)");
  if (min > max) throw new Error("--min no puede ser mayor que --max");

  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/abis_fuente";
  const pool = new Pool({ connectionString: url.toString() });

  try {
    if (!forzar) {
      const previas = await pool.query(
        "SELECT count(*)::int AS n FROM enrolamiento_origen WHERE fecha_enrolamiento = $1",
        [fecha]
      );
      if (previas.rows[0].n > 0) {
        console.log(
          `La fecha ${fecha} ya tiene ${previas.rows[0].n} fila(s). Usa --forzar para agregar mas.`
        );
        return;
      }
    }

    const cantidad = enteroAleatorio(min, max);
    const filas = Array.from({ length: cantidad }, () => generarFila(fecha));
    const ruido = aplicarRuido(filas);

    const columnas = Object.keys(filas[0]);
    // Una sola insercion multi-values (la simulacion no necesita bulk por lotes: son <= 200 filas).
    const valores = [];
    const placeholders = filas
      .map((fila, i) => {
        const base = i * columnas.length;
        valores.push(...columnas.map((c) => fila[c]));
        return `(${columnas.map((_, j) => `$${base + j + 1}`).join(", ")})`;
      })
      .join(", ");
    const sql = `INSERT INTO enrolamiento_origen (${columnas.join(", ")}) VALUES ${placeholders}`;
    await pool.query(sql, valores);

    console.log(`Fecha: ${fecha}`);
    console.log(`Filas generadas: ${cantidad} (rango ${min}-${max})`);
    console.log(
      `Ruido: ${ruido.tipeos} tipeo(s) corregible(s), ${ruido.desconocidas} nacionalidad(es) ` +
      `desconocida(s), ${ruido.jerarquiaInvalida} jerarquia(s) invalida(s)`
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Error en fuente-generar:", err.message);
  process.exit(1);
});
