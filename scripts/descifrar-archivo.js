require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { descifrarArchivo, generarHashSHA256 } = require("../src/security/crypto");

const archivoCifrado = process.argv[2] || "New_Enrolados Abis.xlsx.enc";
const archivoDestino = process.argv[3] || archivoCifrado.replace(/\.enc$/i, "") || "descifrado.xlsx";

if (!fs.existsSync(archivoCifrado)) {
  console.error(`❌ Error: El archivo cifrado no existe: ${archivoCifrado}`);
  process.exit(1);
}

try {
  console.log(`================================================================================`);
  console.log(`🔓 DESCIFRADO DE ARCHIVO CON ALGORITMO INSTITUCIONAL AES-256-GCM`);
  console.log(`================================================================================`);
  console.log(`📂 Archivo Cifrado : ${path.resolve(archivoCifrado)}`);
  console.log(`📁 Archivo Destino : ${path.resolve(archivoDestino)}`);

  const tiempoInicio = Date.now();
  descifrarArchivo(archivoCifrado, archivoDestino);
  const duracion = ((Date.now() - tiempoInicio) / 1000).toFixed(2);

  const hashDescifrado = generarHashSHA256(fs.readFileSync(archivoDestino));

  console.log(`\n✅ Archivo descifrado y autenticado exitosamente en ${duracion}s.`);
  console.log(`🛡️ SHA-256 Descifrado: ${hashDescifrado}`);
  console.log(`================================================================================\n`);
} catch (err) {
  console.error(`❌ Error durante el descifrado (clave incorrecta o archivo manipulado):`, err.message);
  process.exit(1);
}
