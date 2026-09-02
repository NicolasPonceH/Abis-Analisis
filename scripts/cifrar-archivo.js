require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { cifrarArchivo, generarHashSHA256 } = require("../src/security/crypto");

const archivoOrigen = process.argv[2] || "New_Enrolados Abis.xlsx";
const archivoDestino = process.argv[3] || `${archivoOrigen}.enc`;

if (!fs.existsSync(archivoOrigen)) {
  console.error(`❌ Error: El archivo de origen no existe: ${archivoOrigen}`);
  process.exit(1);
}

try {
  console.log(`================================================================================`);
  console.log(`🔒 CIFRADO DE ARCHIVO CON ALGORITMO INSTITUCIONAL AES-256-GCM`);
  console.log(`================================================================================`);
  console.log(`📂 Archivo Origen  : ${path.resolve(archivoOrigen)}`);
  console.log(`📁 Archivo Destino : ${path.resolve(archivoDestino)}`);

  const stats = fs.statSync(archivoOrigen);
  console.log(`📊 Tamaño Original : ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  const tiempoInicio = Date.now();
  cifrarArchivo(archivoOrigen, archivoDestino);
  const duracion = ((Date.now() - tiempoInicio) / 1000).toFixed(2);

  const hashOriginal = generarHashSHA256(fs.readFileSync(archivoOrigen));
  const hashCifrado = generarHashSHA256(fs.readFileSync(archivoDestino));

  console.log(`\n✅ Archivo cifrado exitosamente en ${duracion}s.`);
  console.log(`🔑 SHA-256 Original : ${hashOriginal}`);
  console.log(`🛡️ SHA-256 Cifrado  : ${hashCifrado}`);
  console.log(`✨ El archivo protegido solo puede ser abierto con la clave ENCRYPTION_KEY del sistema.`);
  console.log(`================================================================================\n`);
} catch (err) {
  console.error(`❌ Error durante el cifrado:`, err.message);
  process.exit(1);
}
