'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  useZoomStore,
  useActiveZoom,
  ZOOM_STEP,
  type ZoomMap,
} from '@/lib/store/zoom-store';
import { toast } from '@/hooks/use-toast';

/**
 * Zoom del visualizador con Ctrl + / Ctrl - / Ctrl 0 (como un navegador):
 * ajusta el factor del monitor REAL detectado, lo persiste por resolución
 * y ofrece exportar/importar el fichero portable VisionPantalla-zooms.json.
 *
 * En Electron las teclas funcionan porque main.js elimina el menú por defecto
 * (Menu.setApplicationMenu(null)); si no, el acelerador nativo de zoom escalaría
 * toda la UI antes de llegar aquí. En navegador preventDefault frena el zoom
 * de Chrome y el resultado es el mismo.
 */
export function useZoomController() {
  const zoomFactor = useActiveZoom();

  const detectMonitor = useCallback(async () => {
    if (window.electronAPI) {
      const info = await window.electronAPI.getScreenInfo();
      useZoomStore.getState().setMonitorKey(info.ok ? info.primaryKey : null);
      return;
    }
    // Navegador (app desplegada en Vercel o similar): no hay IPC, pero el
    // navegador sí conoce la pantalla del visitante (CSS px). Esa medida
    // hace de clave de monitor, así cada persona guarda su zoom en SU
    // navegador y se aplicará solo al volver a entrar desde ese PC.
    const w = window.screen?.width ?? 0;
    const h = window.screen?.height ?? 0;
    useZoomStore.getState().setMonitorKey(w > 0 && h > 0 ? `${w}x${h}` : null);
  }, []);

  useEffect(() => {
    void detectMonitor();
    const unsubscribe = window.electronAPI?.onMonitorChanged(() => {
      void detectMonitor();
    });
    return () => unsubscribe?.();
  }, [detectMonitor]);

  useEffect(() => {
    const isZoomKey = (e: KeyboardEvent): 'in' | 'out' | 'reset' | null => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return null;
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd' || e.code === 'Equal') {
        return 'in';
      }
      if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract' || e.code === 'Minus') {
        return 'out';
      }
      if (e.key === '0' || e.code === 'Numpad0' || e.code === 'Digit0') return 'reset';
      return null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const action = isZoomKey(e);
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      const { zooms, monitorKey, setZoom, resetZoom } = useZoomStore.getState();
      const current = monitorKey ? zooms[monitorKey] ?? 1 : 1;
      if (action === 'in') setZoom(monitorKey, current * ZOOM_STEP);
      else if (action === 'out') setZoom(monitorKey, current / ZOOM_STEP);
      else resetZoom(monitorKey);
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const exportZooms = useCallback(async () => {
    const zooms = useZoomStore.getState().zooms;
    if (window.electronAPI) {
      const res = await window.electronAPI.exportZoomProfile({ zooms });
      if (res.canceled) return;
      if (res.ok) {
        // Recordar la ruta: los próximos cambios de zoom reescriben el fichero
        // solos (guardado silencioso), sin volver a pedir el diálogo.
        useZoomStore.getState().setExportPath(res.filePath ?? null);
        toast({ title: 'Fichero de zooms exportado', description: `${res.filePath} — se actualizará solo al cambiar el zoom` });
      } else {
        toast({ title: 'No se pudo exportar', description: res.error, variant: 'destructive' });
      }
      return;
    }
    // Fallback navegador: descargar el JSON
    const doc = { app: 'Vision Pantalla', version: 1, exportedAt: new Date().toISOString(), zooms };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'VisionPantalla-zooms.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Auto-actualización del fichero portable: después de cada cambio de zoom
  // (teclado o botones) reescribe, con un pequeño retardo, el fichero que se
  // exportó la última vez. Sin diálogos y sin notificaciones; si la ruta
  // dejó de existir, avisa como mucho una vez por minuto.
  useEffect(() => {
    if (!window.electronAPI?.saveZoomProfile) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastWarnAt = 0;
    const unsub = useZoomStore.subscribe((state, prev) => {
      if (state.zooms === prev.zooms || !state.lastExportPath) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const { lastExportPath, zooms } = useZoomStore.getState();
        if (!lastExportPath) return;
        const res = await window.electronAPI!.saveZoomProfile({ zooms, filePath: lastExportPath });
        if (!res.ok) {
          const now = Date.now();
          if (now - lastWarnAt > 60000) {
            lastWarnAt = now;
            toast({ title: 'No se pudo actualizar el fichero de zooms', description: res.error, variant: 'destructive' });
          }
        }
      }, 800);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  // Instala el zoom automático en la carpeta de una app del usuario (Next.js):
  // diálogo nativo para elegir el proyecto, copia el snippet a su public/ y
  // añade el <Script strategy="beforeInteractive"> al layout raíz.
  const applyToApp = useCallback(async () => {
    if (!window.electronAPI?.applyZoomToApp) return;
    const res = await window.electronAPI.applyZoomToApp({ zooms: useZoomStore.getState().zooms });
    if (res.canceled) return;
    if (!res.ok) {
      toast({ title: 'No se pudo aplicar el zoom a la app', description: res.error, variant: 'destructive' });
      return;
    }
    if (res.tagAdded) {
      toast({
        title: 'Zoom automático instalado en la app',
        description: `${res.folder} — <Script> añadido a ${res.layoutPath?.split(/[\\/]/).slice(-2).join('/')}${res.importAdded ? ' e import añadido' : ''}`,
      });
    } else {
      // Ya tenía el <Script>: el snippet (el detalle del zoom) siempre se refresca
      toast({ title: 'Zoom de la app actualizado', description: `${res.snippetPath} — con el último mapa de zooms` });
    }
  }, []);

  const applyImport = useCallback((zooms: ZoomMap) => {
    if (Object.keys(zooms).length === 0) {
      toast({ title: 'El fichero no contiene perfiles de zoom', variant: 'destructive' });
      return;
    }
    const count = useZoomStore.getState().importZooms(zooms);
    toast({ title: `${count} perfil${count === 1 ? '' : 'es'} de zoom importado${count === 1 ? '' : 's'}` });
  }, []);

  const importZooms = useCallback(async () => {
    if (window.electronAPI) {
      const res = await window.electronAPI.importZoomProfile();
      if (res.canceled) return;
      if (!res.ok) {
        toast({ title: 'Fichero de zooms no válido', description: res.error, variant: 'destructive' });
        return;
      }
      applyImport(res.zooms!);
      return;
    }
    // Fallback navegador: <input type="file"> oculto + FileReader
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const raw = await file.text();
        const doc = JSON.parse(raw);
        if (!doc || typeof doc.zooms !== 'object') {
          toast({ title: 'Fichero de zooms no válido', variant: 'destructive' });
          return;
        }
        applyImport(doc.zooms as ZoomMap);
      } catch {
        toast({ title: 'No se pudo leer el fichero', variant: 'destructive' });
      }
    };
    input.click();
  }, [applyImport]);

  return useMemo(
    () => ({
      zoomFactor,
      percent: Math.round(zoomFactor * 100),
      zoomIn: () => {
        const { zooms, monitorKey, setZoom } = useZoomStore.getState();
        setZoom(monitorKey, (monitorKey ? zooms[monitorKey] ?? 1 : 1) * ZOOM_STEP);
      },
      zoomOut: () => {
        const { zooms, monitorKey, setZoom } = useZoomStore.getState();
        setZoom(monitorKey, (monitorKey ? zooms[monitorKey] ?? 1 : 1) / ZOOM_STEP);
      },
      reset: () => useZoomStore.getState().resetZoom(useZoomStore.getState().monitorKey),
      exportZooms: () => void exportZooms(),
      importZooms: () => void importZooms(),
      applyToApp: () => void applyToApp(),
    }),
    [zoomFactor, exportZooms, importZooms, applyToApp],
  );
}