const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const rootPath = process.cwd();
const pocketBasePath = path.join(rootPath, 'pocket-base');
const executableName = process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase';
const executablePath = path.join(pocketBasePath, executableName);
const schemaPath = path.join(rootPath, 'API', 'pb_schema.json');

// Cargar variables de .env manualmente
const envPath = path.join(rootPath, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx > 0 && !line.startsWith('#')) {
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key && value && !process.env[key]) process.env[key] = value;
    }
  }
}

const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'francisco@gmail.com';
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || '1234512345';

if (!fs.existsSync(executablePath)) {
  console.log('ℹ️ PocketBase no encontrado. Omitiendo configuración de schema.');
  process.exit(0);
}

if (!fs.existsSync(schemaPath)) {
  console.log('ℹ️ API/pb_schema.json no encontrado. Omitiendo configuración de schema.');
  process.exit(0);
}

function findFreePort(start = 18091) {
  const net = require('net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(start, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => resolve(findFreePort(start + 1)));
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForPocketBase(port, retries = 30) {
  const url = 'http://127.0.0.1:' + port + '/api/health';
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

async function tryLogin(port) {
  const endpoints = [
    '/api/admins/auth-with-password', // PocketBase <= 0.22
    '/api/collections/_superusers/auth-with-password' // PocketBase >= 0.23
  ];
  
  for (const endpoint of endpoints) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      });
      if (res.ok) {
        const data = await res.json();
        return data.token || null;
      }
    } catch (e) {
      // Continuar al siguiente endpoint
    }
  }
  return null;
}

function makeHeaders(token) {
  return { 'Content-Type': 'application/json', 'Authorization': token };
}

async function readBodyText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function createCollection(port, token, collection) {
  try {
    const res = await fetch('http://127.0.0.1:' + port + '/api/collections', {
      method: 'POST',
      headers: makeHeaders(token),
      body: JSON.stringify(collection)
    });
    if (res.ok) return { ok: true, created: true };
    const text = await readBodyText(res);
    if (res.status === 400) {
      try {
        const data = JSON.parse(text);
        if (data?.data?.name?.code === 'validation_not_unique_value') {
          return { ok: true, created: false, exists: true };
        }
      } catch {}
    }
    return { ok: false, status: res.status, text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function updateCollection(port, token, collection) {
  try {
    const listRes = await fetch('http://127.0.0.1:' + port + '/api/collections?page=1&perPage=500', {
      headers: makeHeaders(token)
    });
    const listText = await readBodyText(listRes);
    let listData;
    try { listData = JSON.parse(listText); } catch { listData = {}; }
    const existing = listData?.items?.find(c => c.name === collection.name);
    if (!existing) return { ok: false, text: 'Collection not found for update' };
    const res = await fetch('http://127.0.0.1:' + port + '/api/collections/' + existing.id, {
      method: 'PATCH',
      headers: makeHeaders(token),
      body: JSON.stringify(collection)
    });
    if (res.ok) return { ok: true, updated: true };
    const text = await readBodyText(res);
    return { ok: false, status: res.status, text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function importCollectionsFallback(port, token, schema) {
  console.log('📦 Importando colecciones una por una (fallback)...');
  let created = 0, updated = 0, failed = 0;
  for (const col of schema) {
    const result = await createCollection(port, token, col);
    if (result.ok && result.created) {
      console.log('✅ Colección creada:', col.name);
      created++;
    } else if (result.ok && result.exists) {
      console.log('📝 Colección ya existe, actualizando:', col.name);
      const upResult = await updateCollection(port, token, col);
      if (upResult.ok) updated++;
      else { console.error('❌ Error actualizando', col.name + ':', upResult.text || upResult.error); failed++; }
    } else {
      console.error('❌ Error creando', col.name + ':', result.text || result.error);
      failed++;
    }
  }
  console.log('📊 Resultado fallback: ' + created + ' creadas, ' + updated + ' actualizadas, ' + failed + ' fallidas.');
  return failed === 0;
}

async function safeExit(pbProcess, code = 0) {
  if (pbProcess && !pbProcess.killed) {
    try { pbProcess.stdin?.end?.(); pbProcess.kill(); await sleep(1000); } catch (e) {}
  }
  await sleep(500);
  process.exit(code);
}

async function importSchema() {
  const port = await findFreePort();
  console.log('🚀 Iniciando PocketBase temporalmente en puerto ' + port + '...');

  const pbProcess = spawn(executablePath, ['serve', '--http=127.0.0.1:' + port, '--dir=' + path.join(pocketBasePath, 'pb_data')], {
    cwd: pocketBasePath,
    stdio: 'pipe',
    detached: false
  });

  pbProcess.on('error', async (err) => {
    console.error('❌ Error iniciando PocketBase:', err.message);
    await safeExit(pbProcess, 1);
  });

  const ready = await waitForPocketBase(port);
  if (!ready) {
    console.error('❌ PocketBase no respondió a tiempo.');
    await safeExit(pbProcess, 1);
  }

  console.log('✅ PocketBase listo. Intentando login...');

  let token = await tryLogin(port);

  // Si falla login, intentar crear superuser y reintentar
  if (!token) {
    console.log('ℹ️ Login falló. Intentando crear superuser...');
    try {
      const quote = process.platform === 'win32' ? '"' : '"';
      execSync(quote + executablePath + quote + ' superuser create ' + quote + ADMIN_EMAIL + quote + ' ' + quote + ADMIN_PASSWORD + quote, {
        cwd: pocketBasePath,
        stdio: 'pipe',
        timeout: 10000,
        windowsHide: true
      });
      console.log('✅ Superuser creado. Reintentando login...');
      token = await tryLogin(port);
    } catch {
      console.log('ℹ️ No se pudo crear superuser (probablemente ya existe).');
    }
  }

  if (!token) {
    console.error('❌ No se pudo autenticar como admin.');
    console.error('💡 Verifica PB_ADMIN_EMAIL y PB_ADMIN_PASSWORD en tu archivo .env');
    await safeExit(pbProcess, 1);
  }

  console.log('🔑 Autenticado. Importando schema...');

  // Leer schema
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  // Asegurar que ninguna colección tenga schema vacío (PocketBase lo rechaza)
  const rndId = (length = 15) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < length; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };
  
  if (!Array.isArray(schema)) {
    console.error('❌ El esquema no es un array válido.');
    await safeExit(pbProcess, 1);
  }

  for (const col of schema) {
    // PocketBase < 0.23 usa .schema, >= 0.23 usa .fields
    const hasSchema = Array.isArray(col.schema) && col.schema.length > 0;
    const hasFields = Array.isArray(col.fields) && col.fields.length > 0;

    if (!hasSchema && !hasFields) {
      console.log('⚠️ Colección "' + col.name + '" tiene schema/fields vacío. Añadiendo campo title de respaldo.');
      const titleField = {
        system: false,
        id: rndId(8),
        name: 'title',
        type: 'text',
        required: false,
        presentable: false,
        unique: false,
        options: { min: null, max: null, pattern: '' }
      };
      col.schema = [titleField];
      col.fields = [titleField];
    } else {
      // Sincronizar ambos campos por si acaso
      if (hasSchema && !hasFields) col.fields = col.schema;
      if (hasFields && !hasSchema) col.schema = col.fields;
    }
  }

  console.log('📦 Preparadas ' + schema.length + ' colecciones para importar.');

  // Importar collections
  // Nota: En PocketBase <= 0.22, el token de admin suele ir sin el prefijo "Bearer "
  const tryImport = async (authToken) => {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/api/collections/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken
        },
        body: JSON.stringify({ collections: schema, deleteMissing: true })
      });
      return res;
    } catch (e) {
      return { ok: false, status: 0, text: () => Promise.resolve(e.message) };
    }
  };

  let importRes = await tryImport(token);
  
  // Si falla con 401, 403 o 404, intentar con Bearer
  // A veces 404 puede ser devuelto si el endpoint requiere Bearer y no lo tiene (dependiendo de la versión/config)
  if (!importRes.ok && (importRes.status === 401 || importRes.status === 403 || importRes.status === 404)) {
    console.log('ℹ️ Reintentando importación con prefijo Bearer (Status anterior: ' + importRes.status + ')...');
    importRes = await tryImport('Bearer ' + token);
  }

  if (!importRes.ok) {
    const errText = await (typeof importRes.text === 'function' ? importRes.text() : Promise.resolve('Unknown error'));
    console.error('❌ Error importando schema bulk (Status ' + importRes.status + '):', errText);

    // Fallback: si es 404, crear colecciones una por una
    if (importRes.status === 404) {
      console.log('ℹ️ El endpoint /api/collections/import no está disponible. Usando fallback...');
      const fallbackOk = await importCollectionsFallback(port, token, schema);
      if (fallbackOk) {
        console.log('✅ Schema importado correctamente via fallback.');
        await safeExit(pbProcess, 0);
      }
    }

    // Intentar listar colecciones para diagnóstico
    try {
      const listRes = await fetch('http://127.0.0.1:' + port + '/api/collections?limit=1', {
        headers: makeHeaders(token)
      });
      console.log('🔍 Diagnóstico: GET /api/collections status:', listRes.status);
    } catch (diagErr) {
      console.log('🔍 Diagnóstico: Error consultando colecciones:', diagErr.message);
    }

    await safeExit(pbProcess, 1);
  }

  console.log('✅ Schema importado correctamente en PocketBase.');
  await safeExit(pbProcess, 0);
}

importSchema().catch(err => {
  console.error('❌ Error en setup-pocketbase-schema:', err);
  process.exit(1);
});
