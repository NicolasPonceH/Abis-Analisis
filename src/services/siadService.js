const { spawn } = require('child_process');
const path = require('path');

let siadProcess = null;

function iniciarSIAD(envVars = {}) {
  const siadDir = path.join(__dirname, '..', '..', 'siad');
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  
  // Usar el entorno virtual si existe
  const venvPython = process.platform === 'win32' 
    ? path.join(siadDir, '.venv', 'Scripts', 'python.exe')
    : path.join(siadDir, '.venv', 'bin', 'python');
    
  const fs = require('fs');
  const pythonToUse = fs.existsSync(venvPython) ? venvPython : pythonCmd;
  
  const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL,

    FLASK_RUN_PORT: envVars.SIAD_PORT || process.env.SIAD_PORT || '5001',
    APPLICATION_ROOT: '/analisis'
  };
  
  console.log(`🚀 Iniciando módulo de Análisis Documental (SIAD) en puerto ${env.FLASK_RUN_PORT}...`);
  
  siadProcess = spawn(pythonToUse, ['app.py'], { cwd: siadDir, env, stdio: 'pipe' });
  
  siadProcess.stdout.on('data', (data) => {
    // Filtrar algo de ruido, mostrar lo importante
    const msg = data.toString().trim();
    if (msg) console.log(`[SIAD] ${msg}`);
  });
  
  siadProcess.stderr.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    for (const rawLine of lines) {
      const msg = rawLine.trim();
      if (!msg || msg.includes('WARNING: This is a development server')) continue;

      // Werkzeug envía los logs de peticiones HTTP a stderr por defecto:
      const httpMatch = msg.match(/"\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+.*?\s+HTTP\/\d\.\d"\s+(\d{3})/i);
      if (httpMatch) {
        const statusCode = parseInt(httpMatch[1], 10);
        if (statusCode >= 400) {
          console.error(`[SIAD ERROR] ${msg}`);
        } else {
          console.log(`[SIAD] ${msg}`);
        }
      } else if (/error|exception|traceback|fatal/i.test(msg)) {
        console.error(`[SIAD ERROR] ${msg}`);
      } else {
        console.log(`[SIAD] ${msg}`);
      }
    }
  });
  
  siadProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.warn(`[SIAD] Proceso terminó inesperadamente con código ${code}`);
    } else {
      console.log(`[SIAD] Proceso detenido limpiamente.`);
    }
    siadProcess = null;
  });
}

function detenerSIAD() {
  if (siadProcess) {
    console.log('🛑 Deteniendo módulo de Análisis Documental (SIAD)...');
    siadProcess.kill('SIGTERM');
    siadProcess = null;
  }
}

module.exports = { iniciarSIAD, detenerSIAD };
