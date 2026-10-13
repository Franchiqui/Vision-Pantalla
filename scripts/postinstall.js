const fs = require('fs');
const { execSync } = require('child_process');

let exitCode = 0;

if (fs.existsSync('API/package.json')) {
  console.log('[postinstall] Installing API dependencies...');
  try {
    execSync('npm install --prefix ./API', { stdio: 'inherit' });
    console.log('[postinstall] API dependencies installed.');
  } catch (err) {
    console.error('[postinstall] Failed to install API dependencies:', err.message);
    exitCode = 1;
  }
}

if (fs.existsSync('scripts/install-pocketbase.js')) {
  console.log('[postinstall] Installing PocketBase...');
  try {
    execSync('node scripts/install-pocketbase.js', { stdio: 'inherit' });
    console.log('[postinstall] PocketBase installed.');
  } catch (err) {
    console.error('[postinstall] Failed to install PocketBase:', err.message);
  }
}

if (fs.existsSync('scripts/setup-pocketbase-schema.js')) {
  console.log('[postinstall] Setting up PocketBase schema...');
  try {
    execSync('node scripts/setup-pocketbase-schema.js', { stdio: 'inherit' });
    console.log('[postinstall] PocketBase schema set up.');
  } catch (err) {
    console.error('[postinstall] Failed to set up PocketBase schema:', err.message);
  }
}

process.exit(exitCode);
