const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: process.versions,
  // Lanzar la app de escritorio y capturar su ventana automaticamente
  launchApp: (payload) => ipcRenderer.invoke('app:launch', payload),
  // Detener por pid (taskkill /T /F en Windows)
  stopApp: (payload) => ipcRenderer.invoke('app:stop', payload),
  // Comprobar si una ruta existe y es archivo
  checkPath: (payload) => ipcRenderer.invoke('app:check-path', payload),
  // Comprobar si una URL responde (evita CORS pasando por el main)
  probeUrl: (payload) => ipcRenderer.invoke('app:probe-url', payload),
  // Abrir una URL en ventana nativa a la resolucion elegida (fallback iframe)
  openWindow: (payload) => ipcRenderer.invoke('app:open-window', payload),
  // Re-armar la captura automatica de una app ya lanzada (para Reintentar)
  armCapture: (payload) => ipcRenderer.invoke('app:arm-capture', payload),
  // Desarmar para que getDisplayMedia abra el selector manual
  disarmCapture: () => ipcRenderer.invoke('app:disarm-capture'),
  // Suscripcion a fallos de captura automatica; devuelve funcion de unsubscribe
  onCaptureFailed: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('app:capture-failed', handler);
    return () => ipcRenderer.removeListener('app:capture-failed', handler);
  },
  // Resolucion real de los monitores (fisica y DIP) para el zoom automatico
  getScreenInfo: () => ipcRenderer.invoke('screen:get-info'),
  // Fichero portable de zooms: dialogos nativos de exportar/importar
  exportZoomProfile: (payload) => ipcRenderer.invoke('zoom-profile:export', payload),
  // Guardado silencioso del fichero que ya se exportó una vez (sin diálogo)
  saveZoomProfile: (payload) => ipcRenderer.invoke('zoom-profile:save', payload),
  importZoomProfile: () => ipcRenderer.invoke('zoom-profile:import'),
  // Instalar el zoom automatico en la carpeta de un proyecto Next.js:
  // elige carpeta con dialogo nativo, copia el snippet a public/ y anade
  // el <Script> al layout raiz
  applyZoomToApp: (payload) => ipcRenderer.invoke('zoom-inject:apply', payload),
  // Cambio de resolucion de monitor en caliente; devuelve funcion de unsubscribe
  onMonitorChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('screen:monitor-changed', handler);
    return () => ipcRenderer.removeListener('screen:monitor-changed', handler);
  },
});