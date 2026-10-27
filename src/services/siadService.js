const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let siadProcess = null;

function liberarPuerto(port) {
  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      const lines = output.trim().split(/\r?\n/);
      for (const line of lines) {
        if (line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && pid !== String(process.pid)) {
            console.log(`[SIAD] Liberando puerto ${port} ocupado por PID ${pid}...`);
            try {
              execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
            } catch (_) {}
          }
        }
      }
    } catch (_) {
      // Puerto libre o findstr no encontró coincidencias
    }
  }
}

function iniciarSIAD(envVars = {}) {
  const siadDir = path.join(__dirname, '..', '..', 'siad');
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  
  // Usar el entorno virtual si existe
  const venvPython = process.platform === 'win32' 
    ? path.join(siadDir, '.venv', 'Scripts', 'python.exe')
    : path.join(siadDir, '.venv', 'bin', 'python');
    
  const pythonToUse = fs.existsSync(venvPython) ? venvPython : pythonCmd;
  
  const siadPort = envVars.SIAD_PORT || process.env.SIAD_PORT || '5001';

  // Asegurar que no haya procesos zombies en el puerto antes de iniciar
  liberarPuerto(siadPort);

  const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL,
    APPLICATION_ROOT: '/analisis'
  };
  
  console.log(`🚀 Iniciando módulo de Análisis Documental (SIAD) con Waitress en 127.0.0.1:${siadPort}...`);
  
  siadProcess = spawn(pythonToUse, ['-m', 'waitress', '--listen=127.0.0.1:' + siadPort, 'app:app'], { cwd: siadDir, env, stdio: 'pipe' });
  
  siadProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[SIAD] ${msg}`);
  });
  
  siadProcess.stderr.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    for (const rawLine of lines) {
      const msg = rawLine.trim();
      if (!msg || msg.includes('WARNING: This is a development server')) continue;

      // Werkzeug/Waitress logs HTTP
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
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /F /T /PID ${siadProcess.pid}`, { stdio: 'ignore' });
      } catch (_) {}
    } else {
      siadProcess.kill('SIGTERM');
    }
    siadProcess = null;
  }
}

process.on('exit', () => detenerSIAD());

module.exports = { iniciarSIAD, detenerSIAD };
