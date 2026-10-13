const { app, BrowserWindow, session, desktopCapturer, ipcMain, Menu, dialog, screen } = require('electron');
  if (!app) {
    console.error('CRÍTICO: electron.app es undefined. Probablemente ELECTRON_RUN_AS_NODE está activo.');
    console.error('ELECTRON_RUN_AS_NODE =', process.env.ELECTRON_RUN_AS_NODE);
    process.exit(1);
  }
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { applyZoomToProject } = require('./zoom-apply');
const { spawn, execFile } = require('child_process');

let mainWindow = null;
let nextServer = null;

// --- Lanzamiento de aplicaciones de escritorio ---

const runningChildren = new Map(); // pid -> ChildProcess
// Historial de lanzamientos por appId, para poder re-armar la captura más
// tarde (Reintentar, refocus...): { name, exePath, pid?, appId }
const launchRecords = new Map();
// Objetivo de captura: { name, appId, pid, exePath, description?. Lo fija
// app:launch (o app:arm-capture) y lo usan las peticiones getDisplayMedia
// hasta su TTL. NO se limpia al primer uso ni al primer fallo: React
// StrictMode en dev monta dos veces y la petición repetida lo re-utiliza.
let autoCaptureTarget = null;
// Generación para que el setTimeout de un lanzamiento anterior no borre el
// objetivo del lanzamiento nuevo (mismo app repetido en pocos segundos).
let autoCaptureGeneration = 0;

function parseArgs(argsString) {
  if (!argsString || !argsString.trim()) return [];
  // Split respetando comillas: my-app --port "3002 ok" → ['my-app','--port','3002 ok']
  const matches = argsString.trim().match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  return matches.map((a) => a.replace(/^"|"$/g, ''));
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
// Puerto dev configurable por .env. Sin definir:
// - escritorio (ELECTRON_TARGET=desktop) → 3002
// - web (default) → 3000
const target = (process.env.ELECTRON_TARGET || '').toLowerCase();
const fallbackDevPort = target === 'desktop' ? '3002' : '3000';
const devPort = process.env.ELECTRON_DEV_PORT || fallbackDevPort;
const prodPort = '3000';

function waitForServer(port, maxAttempts) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://localhost:${port}/`, (res) => { resolve(); });
      req.on('error', () => {
        if (attempts >= (maxAttempts || 60)) reject(new Error('Server did not start'));
        else setTimeout(check, 500);
      });
      req.setTimeout(2000, () => { req.destroy(); });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '..', 'public', 'installer-icon.ico'),
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${devPort}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`http://localhost:${prodPort}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Ajustar la ventana al monitor: arranca maximizada para que el
  // visualizador disponga de todo el ancho y el alto disponibles.
  mainWindow.maximize();
}

function startNextServer() {
  return new Promise((resolve, reject) => {
    // Usamos rutas relativas a __dirname para localizar la raíz de la app y node_modules.
    // Esto funciona tanto si asar está activado (resources/app.asar) como si no
    // (resources/app), ya que Electron resuelve __dirname dentro del paquete en ambos casos.
    const baseDir = path.join(__dirname, '..');
    const nextModuleBase = path.join(__dirname, '..');
    try {
      const next = require(path.join(nextModuleBase, 'node_modules', 'next'));
      const nextApp = next({ dev: false, dir: baseDir });
      const handle = nextApp.getRequestHandler();
      nextApp.prepare().then(() => {
        nextServer = http.createServer((req, res) => handle(req, res));
        nextServer.listen(prodPort, () => resolve());
      }).catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

// Electron no muestra un selector de pantalla como el navegador: para que
// getDisplayMedia()/getUserMedia() funcionen hay que autorizar los permisos
// y responder a la petición de pantalla con desktopCapturer.
function setupMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'clipboard-read', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'clipboard-read', 'clipboard-sanitized-write'];
    return allowed.includes(permission);
  });

  // Captura de pantalla: si hay un objetivo de lanzamiento (app:launch),
  // selecciona automáticamente la ventana de esa app; si no, abre un selector
  // (como el de Chrome) con las pantallas y ventanas disponibles.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    console.log('getDisplayMedia recibido | autoCaptureTarget:', autoCaptureTarget ? `${autoCaptureTarget.name} pid=${autoCaptureTarget.pid}` : 'null');
    if (autoCaptureTarget) {
      const target = autoCaptureTarget;
      const source = await findSourceForTarget(target);
      if (source) {
        // Éxito: el objetivo sigue vivo (dentro de su TTL) para que una segunda
        // petición getDisplayMedia (remontaje de StrictMode) lo vuelva a usar.
        try { callback({ video: source, audio: 'loopback' }); } catch (err) { /* ya consumida */ }
      } else {
        // Mantener el objetivo: si hay otra petición (StrictMode/reintento)
        // mientras la app arranca, la captura se recupera sola.
        try { callback({}); } catch (err) { }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:capture-failed', { appId: target.appId });
        }
      }
      return;
    }
    const source = await openCapturePicker();
    if (source) {
      callback({ video: source, audio: 'loopback' });
    } else {
      try { callback({}); } catch (err) { }
    }
  });
}

// Busca la ventana de la app lanzada. Match exacto por PID: obtiene los
// MainWindowHandle del proceso y sus hijos/grandhijos (PowerShell) y los
// compara con el id de desktopCapturer ("window:<hwnd>" en Windows). Si no
// hay pid o no cuadra, hace fallback al matching por título (basename del exe
// o su FileDescription). Reintenta mientras la app arranca.
async function findSourceForTarget(target) {
  const baseNeedle = (target.name || '').toLowerCase();
  const start = Date.now();
  const maxMs = 25000; // apps con splash lento pueden tardar en mostrar su ventana
  let descriptionFetched = false;

  // Si el registro de lanzamiento ya sabe la descripción del exe, úsala
  if (target.appId && launchRecords.get(target.appId)?.description) {
    target.description = launchRecords.get(target.appId).description;
    descriptionFetched = true;
  }

  while (Date.now() - start < maxMs) {
    let hwnds = [];
    if (target.pid) {
      hwnds = await getWindowHandles(target.pid);
      console.log(`  buscador: hwnds de pid ${target.pid}: [${hwnds}]`);
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 1, height: 1 },
        fetchWindowIcons: false,
      });
      const hwndOf = (sourceId) => Number(String(sourceId).split(':')[1]);
      // Prioridad: 1) ventana del proceso lanzado por hwnd exacto,
      // 2) por título — nunca las ventanas propias de Visión Pantalla.
      let match = null;
      if (hwnds.length > 0) {
        match = sources.find((s) => hwnds.includes(hwndOf(s.id)));
      }
      if (!match) {
        match = sources.find((s) => {
          const name = (s.name || '').toLowerCase();
          if (name === 'visión pantalla' || name.includes('¿qué quieres capturar?')) return false;
          const needles = [baseNeedle];
          if (target.description) needles.push(target.description.toLowerCase());
          return baseNeedle ? needles.some((n) => n && name.includes(n)) : false;
        });
      }
      if (match) {
        console.log(`Ventana capturada: "${match.name}" (${match.id})`);
        return match;
      }
    } catch (err) {
      console.error('desktopCapturer error en reintento:', err);
    }
    // La FileDescription se resuelve en segundo plano tras el spawn
    if (!descriptionFetched && target.exePath) {
      descriptionFetched = true;
      fetchExeDescription(target.exePath, target);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log(`  buscador: SIN match tras 25s para "${target.name}" (objetivo se mantiene hasta su TTL)`);
  return null;
}

// hwnds (números decimales) de las ventanas principales del proceso pid,
// de sus hijos y de sus nietos (los launchers dejan la ventana en un hijo).
async function getWindowHandles(pid) {
  return new Promise((resolve) => {
    const script = [
      `$ids = @(${pid})`,
      `$kids = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | Select-Object -ExpandProperty ProcessId)`,
      `$ids += $kids`,
      `$gkids = @(); foreach ($k in $kids) { $gkids += @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$k" | Select-Object -ExpandProperty ProcessId) }`,
      `$ids += $gkids`,
      `Get-Process -Id $ids -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -ExpandProperty MainWindowHandle`,
    ].join('; ');
    execFile('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 4000, encoding: 'utf8' }, (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }
      const hwnds = (stdout || '')
        .split(/\r?\n/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
      resolve(hwnds);
    });
  });
}

// FileDescription del exe (ej. notepad.exe → "Bloc de notas"), asíncrono:
// entra en el objetivo si la ventana ya existe para cuando acabe la consulta.
function fetchExeDescription(exePath, target) {
  execFile(
    'powershell.exe',
    ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${exePath.replace(/'/g, "''")}').VersionInfo.FileDescription`],
    { timeout: 3000, encoding: 'utf8' },
    (err, stdout) => {
      if (err) return;
      const description = (stdout || '').trim();
      if (!description) return;
      if (autoCaptureTarget === target) {
        target.description = description;
      }
      if (target.appId) {
        const record = launchRecords.get(String(target.appId));
        if (record) record.description = description;
      }
    },
  );
}

// --- Selector de captura (pantallas + ventanas, con miniaturas) ---

let capturePickerWindow = null;
let capturePickerResolve = null;
let captureSourcesList = [];

function finishCapturePicker(result) {
  const resolve = capturePickerResolve;
  const win = capturePickerWindow;
  capturePickerResolve = null;
  capturePickerWindow = null;
  try {
    if (win && !win.isDestroyed()) win.destroy();
  } catch (err) { /* ignore */ }
  if (resolve) resolve(result);
}

function openCapturePicker() {
  return new Promise(async (resolve) => {
    // Solo un picker abierto a la vez: si ya hay uno, cancelar esta petición
    if (capturePickerWindow || capturePickerResolve) {
      resolve(null);
      return;
    }
    capturePickerResolve = resolve;

    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 360, height: 203 },
        fetchWindowIcons: true,
      });
      captureSourcesList = sources;
      if (sources.length === 0) {
        finishCapturePicker(null);
        return;
      }

      const items = sources.map((s) => ({
        id: s.id,
        name: s.name || (s.id.indexOf('screen:') === 0 ? 'Pantalla' : 'Ventana'),
        isScreen: s.id.indexOf('screen:') === 0,
        thumb: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '',
        icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : '',
      }));

      capturePickerWindow = new BrowserWindow({
        width: 880,
        height: 660,
        modal: true,
        parent: mainWindow || null,
        title: '¿Qué quieres capturar?',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });
      // Guard: si la ventana se cierra de forma natural (sin destruir), resolver cancelado
      const win = capturePickerWindow;
      win.on('closed', () => {
        if (capturePickerWindow === win) finishCapturePicker(null);
      });
      capturePickerWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildCapturePickerHtml(items)));
    } catch (err) {
      console.error('Error abriendo selector de captura:', err);
      finishCapturePicker(null);
    }
  });
}

function buildCapturePickerHtml(items) {
  const payload = JSON.stringify(items).replace(/</g, String.fromCharCode(92) + 'u003c');
  return [
    '<!doctype html><html><head><meta charset="utf-8"><title>¿Qué quieres capturar?</title><style>',
    'body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,Segoe UI,sans-serif;display:flex;flex-direction:column;height:100vh}',
    'h1{font-size:15px;font-weight:600;margin:14px 18px 10px}',
    '#grid{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;padding:6px 18px 12px;align-content:start}',
    '.card{background:#1e293b;border:1px solid #334155;border-radius:10px;cursor:pointer;overflow:hidden;transition:border-color .15s,transform .15s}',
    '.card:hover{border-color:#38bdf8;transform:translateY(-2px)}',
    '.card img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover;background:#0b1220}',
    '.nothumb{width:100%;height:140px;background:#0b1220}',
    '.label{display:flex;align-items:center;gap:6px;padding:8px 10px;font-size:12.5px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.label img{width:14px;height:14px;flex:none}',
    '.badge{display:inline-block;background:#0ea5e9;color:#04283a;font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;flex:none}',
    '.bar{border-top:1px solid #1e293b;padding:10px 18px;display:flex;justify-content:flex-end;gap:10px}',
    'button{background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer}',
    'button:hover{border-color:#64748b}',
    '</style></head><body>',
    '<h1>Elige la pantalla o ventana que quieres capturar</h1>',
    '<div id="grid"></div>',
    '<div class="bar"><button id="cancel">Cancelar (Esc)</button></div>',
    '<script>',
    'var SOURCES = ' + payload + ';',
    'var grid = document.getElementById("grid");',
    'SOURCES.forEach(function (s) {',
    '  var card = document.createElement("div");',
    '  card.className = "card";',
    '  if (s.thumb) { var img = document.createElement("img"); img.src = s.thumb; card.appendChild(img); }',
    '  else { var ph = document.createElement("div"); ph.className = "nothumb"; card.appendChild(ph); }',
    '  var label = document.createElement("div"); label.className = "label";',
    '  if (s.icon) { var ic = document.createElement("img"); ic.src = s.icon; label.appendChild(ic); }',
    '  if (s.isScreen) { var b = document.createElement("span"); b.className = "badge"; b.textContent = "PANTALLA"; label.appendChild(b); }',
    '  var name = document.createElement("span"); name.textContent = s.name; name.style.overflow = "hidden"; name.style.textOverflow = "ellipsis"; label.appendChild(name);',
    '  card.appendChild(label);',
    '  card.onclick = function () { require("electron").ipcRenderer.send("capture-picker:select", s.id); };',
    '  grid.appendChild(card);',
    '});',
    'document.getElementById("cancel").onclick = function () { require("electron").ipcRenderer.send("capture-picker:cancel"); };',
    'document.addEventListener("keydown", function (e) { if (e.key === "Escape") require("electron").ipcRenderer.send("capture-picker:cancel"); });',
    '</script></body></html>',
  ].join('');
}

function registerCapturePickerIpc() {
  ipcMain.on('capture-picker:select', (_e, sourceId) => {
    const source = (captureSourcesList || []).find((s) => s.id === sourceId);
    finishCapturePicker(source || null);
  });
  ipcMain.on('capture-picker:cancel', () => finishCapturePicker(null));
}

// --- IPC: resolución de monitores y fichero portable de zooms ---

// Clave de un monitor: resolución FÍSICA (los bounds de Electron están en DIP;
// con escala de Windows 125%/150% el DIP no coincide con lo que dice Windows).
function monitorKeyOf(display) {
  return `${Math.round(display.bounds.width * display.scaleFactor)}x${Math.round(
    display.bounds.height * display.scaleFactor,
  )}`;
}

function monitorInfoOf(display) {
  return {
    id: String(display.id),
    label: display.label || '',
    primary: !!display.primary,
    dipW: display.bounds.width,
    dipH: display.bounds.height,
    physW: Math.round(display.bounds.width * display.scaleFactor),
    physH: Math.round(display.bounds.height * display.scaleFactor),
    scaleFactor: display.scaleFactor,
  };
}

function registerZoomIpc() {
  ipcMain.handle('screen:get-info', () => {
    try {
      const displays = screen.getAllDisplays();
      const primary = screen.getPrimaryDisplay();
      const primaryKey = monitorKeyOf(primary);
      const monitors = displays.map((d) => ({ ...monitorInfoOf(d), key: monitorKeyOf(d) }));
      return { ok: true, primaryKey, monitors };
    } catch (err) {
      return { ok: false, primaryKey: null, monitors: [], error: err.message };
    }
  });

  // Exportar: el renderer envía su mapa actual; main arma el JSON completo
  // y lo escribe donde el usuario elija en el diálogo nativo.
  ipcMain.handle('zoom-profile:export', async (_event, payload) => {
    const zooms = payload && payload.zooms ? payload.zooms : {};
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar fichero de zooms',
        defaultPath: 'VisionPantalla-zooms.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      await writeZoomDoc(filePath, zooms);
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Guardado silencioso (sin diálogo): reescribe el fichero que el usuario
  // exportó la última vez con el mapa actual. Lo usa el renderer tras cada
  // cambio de zoom para mantener el fichero portable siempre al día.
  ipcMain.handle('zoom-profile:save', async (_event, payload) => {
    const zooms = payload && payload.zooms ? payload.zooms : {};
    const filePath = payload && typeof payload.filePath === 'string' ? payload.filePath : '';
    // Solo rutas absolutas con .json; nunca una ruta inventada por la web
    if (!filePath || !path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== '.json') {
      return { ok: false, error: 'Ruta de guardado no válida' };
    }
    try {
      await writeZoomDoc(filePath, zooms);
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Aplicar el zoom portable a la carpeta de un proyecto Next.js del
  // usuario: copia VisionPantalla-zooms.js a su public/ y añade el <Script>
  // al layout raíz. Elige la carpeta con diálogo nativo; nunca rutas de la web.
  ipcMain.handle('zoom-inject:apply', async (_event, payload) => {
    const zooms = payload && payload.zooms ? payload.zooms : {};
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Elige la carpeta de la app donde instalar el zoom automático',
      properties: ['openDirectory'],
    });
    if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };
    try {
      // con la clave lógica del monitor (como en la exportación), para que el
      // snippet generado coincida en cualquier navegador
      const res = await applyZoomToProject(
        filePaths[0],
        buildZoomSnippetJs(enrichZoomsForBrowser(zooms)),
      );
      if (res.ok) res.folder = filePaths[0];
      return res;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Importar: leer y validar aquí; el store del renderer se actualiza aparte.
  ipcMain.handle('zoom-profile:import', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Importar fichero de zooms',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePaths || filePaths.length === 0) {
        return { ok: false, canceled: true };
      }
      const raw = await fs.promises.readFile(filePaths[0], 'utf8');
      return validateZoomDoc(raw);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

  // El navegador del visitante reporta PÍXELES LÓGICOS (el escalado de Windows
  // encoge la pantalla: una TV 4K al 225% se ve como 1821x960), no físicos.
  // Añadimos la clave lógica del monitor primario con el mismo zoom para que
  // el snippet desplegado coincida, aunque devicePixelRatio no cuadre.
  function enrichZoomsForBrowser(zooms) {
    const out = { ...zooms };
    try {
      const d = screen.getPrimaryDisplay();
      const phys = Math.round(d.bounds.width * d.scaleFactor) + 'x' + Math.round(d.bounds.height * d.scaleFactor);
      const dip = d.bounds.width + 'x' + d.bounds.height;
      if (phys !== dip && /^\d+x\d+$/.test(dip)) {
        if (out[phys] != null && out[dip] == null) out[dip] = out[phys];
        else if (out[dip] != null && out[phys] == null) out[phys] = out[dip];
      }
    } catch { /* sin screen disponible: mapa tal cual */ }
    return out;
  }

  // Arma el documento portable y lo escribe (compartido por exportar y el
  // guardado silencioso).
  async function writeZoomDoc(filePath, zooms) {
    const zoomsEnriquecido = enrichZoomsForBrowser(zooms);
    const doc = {
      app: 'Vision Pantalla',
      version: 1,
      exportedAt: new Date().toISOString(),
      zooms: zoomsEnriquecido,
    };
    await fs.promises.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf8');
    // Junto al JSON, el mismo mapa como script listo para desplegar dentro
    // de las apps del usuario (Vercel, hosting propio...): detecta la pantalla
    // del visitante y aplica el zoom calibrado para ella. El visitante no
    // guarda ni importa nada.
    try {
      const jsPath = filePath.replace(/\.json$/i, '.js');
      await fs.promises.writeFile(jsPath, buildZoomSnippetJs(zoomsEnriquecido), 'utf8');
    } catch {
      // El JSON ya está guardado; el .js es best-effort
    }
  }

  // Genera VisionPantalla-zooms.js: script autónomo, sin dependencias. Match
  // exacto por "ANCHORxALTO" y, si la pantalla no está en el mapa, por ancho
  // cercano (±10%). Nunca lanza errores a la web anfitriona.
  function buildZoomSnippetJs(zooms) {
    const entries = Object.entries(zooms)
      .filter(([k, v]) => /^\d+x\d+$/.test(k) && Number.isFinite(v) && v > 0)
      .map(([k, v]) => `${JSON.stringify(k)}:${v}`)
      .join(',');
    return [
      '/* Zoom automático por pantalla — generado por Visión Pantalla */',
      '(function () {',
      '  "use strict";',
      `  var ZOOMS = {${entries}};`,
      '  try {',
      '    /* Dentro de un marco (iframe) el zoom lo pone quien incrusta la web',
      '       (el visualizador de Visión Pantalla ya aplica el suyo): aquí sería',
      '       zoom doble y provocaría scrollbars. Solo actúa en la página completa. */',
      '    if (window.self !== window.top) return;',
      '    var w = (window.screen && window.screen.width) || 0;',
      '    var h = (window.screen && window.screen.height) || 0;',
      '    if (!w || !h) return;',
      '    /* Visión Pantalla calibra con la resolución FÍSICA del monitor, pero el',
      '       navegador da píxeles lógicos (el escalado de Windows los encoge:',
      '       una TV 4K al 225% se reporta como 1821x960). Con devicePixelRatio',
      '       reconstruimos la física; probamos ambas claves por si acaso. */',
      '    var dpr = window.devicePixelRatio || 1;',
      '    var wFisica = Math.round(w * dpr), hFisica = Math.round(h * dpr);',
      '    var z = null;',
      '    var claveFisica = wFisica + "x" + hFisica, claveCss = w + "x" + h;',
      '    if (ZOOMS[claveFisica]) z = ZOOMS[claveFisica];',
      '    else if (ZOOMS[claveCss]) z = ZOOMS[claveCss];',
      '    if (!z) {',
      '      var widths = Object.keys(ZOOMS).map(function (k) {',
      '        var m = k.split("x");',
      '        return { w: parseInt(m[0], 10), z: ZOOMS[k] };',
      '      });',
      '      var anchos = [wFisica, w];',
      '      var cand = [];',
      '      for (var j = 0; j < anchos.length; j++) {',
      '        for (var i = 0; i < widths.length; i++) {',
      '          var dif = Math.abs(widths[i].w - anchos[j]);',
      '          if (dif / anchos[j] <= 0.1) cand.push({ d: dif, z: widths[i].z });',
      '        }',
      '      }',
      '      if (cand.length) {',
      '        cand.sort(function (a, b) { return a.d - b.d; });',
      '        z = cand[0].z;',
      '      }',
      '    }',
      '    if (z && z !== 1) {',
      '      var st = document.documentElement.style;',
      '      var apply = function () {',
      '        st.zoom = String(z);',
      '        st.setProperty("--vp-zoom", String(z));',
      '        document.documentElement.setAttribute("data-vp-zoom", String(z));',
      '        /* El zoom CSS rehace anchos en % pero NO las alturas en 100vh:',
      '           sin esto la web se queda encogida en una franja y no llena la',
      '           pantalla. Con body alto exacto (viewport/z) y margen 0, las',
      '           apps que encadenan alturas en % llenan todo, como el zoom',
      '           nativo del navegador (Ctrl -). */',
      '        var css = document.getElementById("vp-zoom-style");',
      '        if (!css) {',
      '          css = document.createElement("style");',
      '          css.id = "vp-zoom-style";',
      '          document.head.appendChild(css);',
      '        }',
      '        css.textContent = "html[data-vp-zoom]>body{height:calc(100vh/var(--vp-zoom,1))!important;margin:0!important;}";',
      '      };',
      '      apply();',
      '      window.addEventListener("DOMContentLoaded", apply);',
      '    }',
      '  } catch (e) { /* nunca romper la web anfitriona */ }',
      '})();',
      '',
    ].join('\n');
  }

function validateZoomDoc(raw) {
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: 'No es un JSON válido' };
  }
  if (!doc || typeof doc !== 'object' || !doc.zooms || typeof doc.zooms !== 'object') {
    return { ok: false, error: 'El fichero no tiene un mapa de "zooms"' };
  }
  const zooms = {};
  for (const [key, value] of Object.entries(doc.zooms)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.1 || value > 5) {
      return { ok: false, error: `Valor de zoom no válido para "${key}"` };
    }
    zooms[key] = value;
  }
  return { ok: true, zooms };
}

// --- IPC: lanzar / detener / comprobar apps reales ---

function registerAppIpc() {
  ipcMain.handle('app:launch', (_event, payload) => {
    const { exePath, args = '', appId = null } = payload || {};
    console.log('app:launch →', exePath, '| args:', args || '(ninguno)');
    if (!exePath || !String(exePath).trim()) {
      return { ok: false, error: 'Ruta no especificada' };
    }
    let resolved;
    try {
      resolved = path.resolve(String(exePath).trim());
    } catch (err) {
      return { ok: false, error: 'Ruta no válida' };
    }
    if (!fs.existsSync(resolved)) {
      return { ok: false, error: 'El archivo no existe: ' + resolved };
    }
    if (!fs.statSync(resolved).isFile()) {
      return { ok: false, error: 'La ruta no es un archivo: ' + resolved };
    }
    if (process.platform === 'win32' && path.extname(resolved).toLowerCase() !== '.exe') {
      return { ok: false, error: 'La ruta no es un .exe: ' + resolved };
    }

    autoCaptureTarget = { name: path.basename(resolved).replace(/\.exe$/i, ''), appId: appId || null, pid: null, exePath: resolved };
    const generation = ++autoCaptureGeneration;
    if (appId) {
      const record = launchRecords.get(String(appId));
      if (record?.description) autoCaptureTarget.description = record.description;
      launchRecords.set(String(appId), { name: autoCaptureTarget.name, exePath: resolved });
    }
    // Descripción amigable (ej. notepad.exe → "Bloc de notas") en segundo plano
    fetchExeDescription(resolved, autoCaptureTarget);
    // Red de seguridad: si el renderer nunca llama a getDisplayMedia, limpiar.
    // (El guard por generación evita limpiar un objetivo MÁS nuevo.)
    setTimeout(() => {
      if (autoCaptureGeneration === generation) autoCaptureTarget = null;
    }, 90000);

    try {
      const child = spawn(resolved, parseArgs(String(args || '')), {
        detached: false,
        windowsHide: false,
        stdio: 'ignore',
      });
      const pid = child.pid;
      autoCaptureTarget.pid = pid;
      const record = launchRecords.get(String(appId));
      if (record) record.pid = pid;
      runningChildren.set(pid, child);
      child.on('exit', () => runningChildren.delete(pid));
      child.on('error', (err) => {
        runningChildren.delete(pid);
        console.error('Error lanzando', resolved, err);
      });
      return { ok: true, pid };
    } catch (err) {
      autoCaptureTarget = null;
      return { ok: false, error: 'No se pudo lanzar: ' + err.message };
    }
  });

  ipcMain.handle('app:stop', (_event, payload) => {
    const { pid } = payload || {};
    if (!pid) return { ok: false, error: 'pid requerido' };
    try {
      if (process.platform === 'win32') {
        // /T mata el árbol de procesos (imprescindible para launchers)
        execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => { });
      } else {
        const child = runningChildren.get(pid);
        if (child) child.kill();
      }
      runningChildren.delete(pid);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Re-armar la captura automática para una app ya lanzada (Reintentar /
  // remontajes de StrictMode / preview tras refocus)
  ipcMain.handle('app:arm-capture', (_event, payload) => {
    const { appId } = payload || {};
    const record = appId ? launchRecords.get(String(appId)) : null;
    if (!record) return { ok: false };
    autoCaptureTarget = {
      name: record.name,
      exePath: record.exePath,
      pid: record.pid || null,
      appId: String(appId),
      description: record.description,
    };
    const generation = ++autoCaptureGeneration;
    if (!record.description && record.exePath) {
      fetchExeDescription(record.exePath, autoCaptureTarget);
    }
    setTimeout(() => {
      if (autoCaptureGeneration === generation) autoCaptureTarget = null;
    }, 90000);
    return { ok: true };
  });

  // Desarmar para usar el selector manual (botón "Selector manual")
  ipcMain.handle('app:disarm-capture', () => {
    autoCaptureGeneration++;
    autoCaptureTarget = null;
    return { ok: true };
  });

  ipcMain.handle('app:check-path', (_event, payload) => {
    const { path: targetPath } = payload || {};
    try {
      const st = fs.statSync(path.resolve(String(targetPath || '')));
      return { exists: true, isFile: st.isFile() };
    } catch (err) {
      return { exists: false, isFile: false };
    }
  });

  ipcMain.handle('app:probe-url', (_event, payload) => {
    const { url, timeoutMs = 5000 } = payload || {};
    let parsed;
    try {
      parsed = new URL(String(url));
    } catch (err) {
      return { ok: false, error: 'URL no válida' };
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, error: 'Solo http/https' };
    }
    return new Promise((resolve) => {
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.get(parsed.toString(), (res) => {
        // Cualquier respuesta (incluso 4xx/5xx) demuestra que el servidor está vivo
        resolve({ ok: true, status: res.statusCode });
        res.resume();
      });
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve({ ok: false, error: 'No responde (timeout)' });
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
    });
  });

  // Fallback para webs que bloquean el <iframe> (X-Frame-Options):
  // abre la web en una ventana nativa a la resolución elegida.
  ipcMain.handle('app:open-window', (_event, payload) => {
    const { url, width = 1280, height = 720 } = payload || {};
    try {
      const win = new BrowserWindow({
        // useContentSize: width/height son del CONTENIDO, no de la ventana con
        // sus bordes; así la web ocupa exactamente la resolución elegida y
        // coincide 1:1 con el visualizador (a zoom 100%).
        useContentSize: true,
        width: Math.round(width),
        height: Math.round(height),
        autoHideMenuBar: true,
        title: String(url),
      });
      // Zoom estilo Chrome (Ctrl +/-/0) en la ventana nativa: el nivel de zoom
      // reescala el contenido y la web reordena su layout (no mueve la ventana).
      win.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return;
        const k = String(input.key || '').toLowerCase();
        const isZoomKey = ['=', '+', 'add', '-', '_', 'subtract', '0', 'numpad0'].includes(k);
        if (!isZoomKey) return;
        event.preventDefault();
        const wc = win.webContents;
        if (k === '=' || k === '+' || k === 'add') {
          wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 5));
        } else if (k === '-' || k === '_' || k === 'subtract') {
          wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -5));
        } else {
          // 0 / numpad0 → restablecer (zoom 100%, nivel 0)
          wc.setZoomLevel(0);
        }
      });
      // HUD de diagnóstico: muestra la resolución real del contenido de la
      // ventana (lo que la web "percibe"), para poder compararla con el
      // visualizador. Es puramente informativo, no afecta a la web.
      const HUD_JS = `(function(){
        function draw(){
          var b=document.body; if(!b) return;
          var el=document.getElementById('__vp_hud');
          if(!el){ el=document.createElement('div'); el.id='__vp_hud';
            el.style.cssText='position:fixed;bottom:8px;right:8px;z-index:2147483647;background:rgba(0,0,0,.75);color:#7dd3fc;font:12px monospace;padding:4px 8px;border-radius:6px;pointer-events:none';
            b.appendChild(el); }
          el.textContent='Ventana nativa (real): '+window.innerWidth+'\\u00d7'+window.innerHeight;
        }
        draw(); window.addEventListener('resize', draw);
      })();`;
      win.webContents.on('did-finish-load', () => {
        win.webContents.executeJavaScript(HUD_JS).catch(() => {});
      });
      win.loadURL(String(url));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

app.whenReady().then(async () => {
  try {
    // Sin menú: el menú por defecto de Electron registra Ctrl+= / Ctrl+- / Ctrl+0
    // como zoom nativo y escalaría TODA la UI antes de que el renderer
    // intercepte las teclas para el zoom del visualizador.
    Menu.setApplicationMenu(null);
    registerCapturePickerIpc();
    registerAppIpc();
    registerZoomIpc();
    setupMediaPermissions();
    // La resolución del monitor puede cambiar con la app abierta: avisar al
    // renderer para re-detectar y aplicar el zoom de la nueva resolución.
    screen.on('display-metrics-changed', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('screen:monitor-changed');
      }
    });
    if (!isDev) {
      await startNextServer();
    } else {
      await waitForServer(parseInt(devPort), 30).catch(() => { });
    }
    createWindow();
  } catch (err) {
    console.error('Electron startup error:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (nextServer) {
    nextServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
