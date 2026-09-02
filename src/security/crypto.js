const fs = require("fs");
const crypto = require("crypto");
require("dotenv").config();

const ALGORITMO = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits recomendado por NIST para GCM
const AUTH_TAG_BYTES = 16; // 128 bits
const MAGIC_HEADER = Buffer.from("ABIS_ENC_V1", "utf8"); // 11 bytes

/**
 * Obtiene la clave criptográfica de 32 bytes (256 bits).
 * @param {string|Buffer} [keyOverride] Clave personalizada opcional
 * @returns {Buffer} Clave de 32 bytes
 */
function obtenerClave(keyOverride) {
  const clave = keyOverride || process.env.ENCRYPTION_KEY;
  if (!clave) {
    throw new Error("No se ha definido ENCRYPTION_KEY en las variables de entorno ni se proveyó una clave.");
  }

  if (Buffer.isBuffer(clave)) {
    if (clave.length === 32) return clave;
    return crypto.createHash("sha256").update(clave).digest();
  }

  const claveStr = String(clave).trim();
  // Si es un string hexadecimal de 64 caracteres (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(claveStr)) {
    return Buffer.from(claveStr, "hex");
  }

  // Si es un passphrase de texto arbitrario, derivar 32 bytes con scrypt
  return crypto.scryptSync(claveStr, "abis_security_salt_2026", 32);
}

/**
 * Cifra un texto plano usando AES-256-GCM.
 * Retorna string en formato Base64: iv:authTag:ciphertext
 * @param {string} textoPlano
 * @param {string|Buffer} [keyOverride]
 * @returns {string}
 */
function cifrarTexto(textoPlano, keyOverride) {
  const key = obtenerClave(keyOverride);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITMO, key, iv);

  let encrypted = cipher.update(textoPlano, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Descifra un payload de texto cifrado con AES-256-GCM.
 * @param {string} payloadCifrado Formato iv:authTag:ciphertext (Base64)
 * @param {string|Buffer} [keyOverride]
 * @returns {string} Texto plano original
 */
function descifrarTexto(payloadCifrado, keyOverride) {
  const key = obtenerClave(keyOverride);
  const partes = payloadCifrado.split(":");
  if (partes.length !== 3) {
    throw new Error("Formato de payload cifrado inválido. Se esperaba 'iv:authTag:ciphertext'.");
  }

  const [ivB64, authTagB64, dataB64] = partes;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITMO, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(dataB64, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Cifra un buffer binario (ej: un archivo Excel .xlsx).
 * Estructura del buffer resultante:
 * [MAGIC_HEADER (11B)][IV (12B)][AUTH_TAG (16B)][DATOS_CIFRADOS (NB)]
 * @param {Buffer} buffer
 * @param {string|Buffer} [keyOverride]
 * @returns {Buffer}
 */
function cifrarBuffer(buffer, keyOverride) {
  const key = obtenerClave(keyOverride);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITMO, key, iv);

  const encryptedData = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([MAGIC_HEADER, iv, authTag, encryptedData]);
}

/**
 * Determina si un buffer binario corresponde a un archivo cifrado por el Sistema ABIS.
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function esBufferCifrado(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < MAGIC_HEADER.length + IV_BYTES + AUTH_TAG_BYTES) {
    return false;
  }
  return buffer.subarray(0, MAGIC_HEADER.length).equals(MAGIC_HEADER);
}

/**
 * Descifra un buffer binario cifrado con cifrarBuffer.
 * @param {Buffer} bufferCifrado
 * @param {string|Buffer} [keyOverride]
 * @returns {Buffer} Buffer original descifrado
 */
function descifrarBuffer(bufferCifrado, keyOverride) {
  const key = obtenerClave(keyOverride);

  if (!esBufferCifrado(bufferCifrado)) {
    throw new Error("El archivo o buffer no posee la cabecera mágica de cifrado ABIS (ABIS_ENC_V1).");
  }

  let offset = MAGIC_HEADER.length;
  const iv = bufferCifrado.subarray(offset, offset + IV_BYTES);
  offset += IV_BYTES;

  const authTag = bufferCifrado.subarray(offset, offset + AUTH_TAG_BYTES);
  offset += AUTH_TAG_BYTES;

  const ciphertext = bufferCifrado.subarray(offset);

  const decipher = crypto.createDecipheriv(ALGORITMO, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Cifra un archivo de disco a otro archivo destino.
 * @param {string} rutaOrigen
 * @param {string} rutaDestino
 * @param {string|Buffer} [keyOverride]
 */
function cifrarArchivo(rutaOrigen, rutaDestino, keyOverride) {
  const data = fs.readFileSync(rutaOrigen);
  const dataCifrada = cifrarBuffer(data, keyOverride);
  fs.writeFileSync(rutaDestino, dataCifrada);
}

/**
 * Descifra un archivo cifrado de disco y lo guarda en la ruta destino.
 * @param {string} rutaCifrada
 * @param {string} rutaDestino
 * @param {string|Buffer} [keyOverride]
 */
function descifrarArchivo(rutaCifrada, rutaDestino, keyOverride) {
  const dataCifrada = fs.readFileSync(rutaCifrada);
  const dataDescifrada = descifrarBuffer(dataCifrada, keyOverride);
  fs.writeFileSync(rutaDestino, dataDescifrada);
}

/**
 * Genera el hash SHA-256 de un dato (string o buffer) para auditoría e integridad.
 * @param {string|Buffer} dato
 * @returns {string} Hash SHA-256 en formato Hexadecimal
 */
function generarHashSHA256(dato) {
  return crypto.createHash("sha256").update(dato).digest("hex");
}

module.exports = {
  ALGORITMO,
  obtenerClave,
  cifrarTexto,
  descifrarTexto,
  cifrarBuffer,
  descifrarBuffer,
  cifrarArchivo,
  descifrarArchivo,
  esBufferCifrado,
  generarHashSHA256,
};
