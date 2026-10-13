const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Copiar entorno y eliminar variables que rompen Electron cuando se lanza
// desde otro proceso Electron (como tu app contenedora)
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;
delete env.ELECTRON_NO_ASAR;
delete env.NODE_OPTIONS; // por si hereda --inspect del padre

// Forzar las variables de tu app
env.NODE_ENV = 'development';
env.ELECTRON_TARGET = env.ELECTRON_TARGET || 'desktop';
env.ELECTRON_DEV_PORT = env.ELECTRON_DEV_PORT || '3002';

// Ruta directa al ejecutable de Electron (evita conflictos con PATH)
const electronBin = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron'
);

// Electron >= 44 ya no descarga el binario en el postinstall de npm: hay que
// ejecutar instalarlo explícitamente. Si falta, lo descargamos ahora mismo.
const projectRoot = path.resolve(__dirname, '..');
const electronDir = path.join(projectRoot, 'node_modules', 'electron');
if (fs.existsSync(path.join(electronDir, 'install.js')) && !fs.existsSync(electronBin)) {
  try {
    console.log('[run-electron-dev] Binario de Electron no encontrado. Descargando (node node_modules/electron/install.js)...');
    execSync(`node "${path.join(electronDir, 'install.js')}"`, { cwd: projectRoot, stdio: 'inherit', env });
  } catch (err) {
    console.error('[run-electron-dev] No se pudo descargar el binario de Electron. Ejecuta manualmente: npx install-electron', err.message);
  }
}

const child = spawn(electronBin, ['.'], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
