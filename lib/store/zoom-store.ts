import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Zoom del visualizador, guardado por resolución FÍSICA real del monitor
// ("1920x1080" → factor). Se aplica sobre el auto-fit:
// escala efectiva = usoFitScale × zoomFactor del monitor actual.
// El fichero portable VisionPantalla-zooms.json es exactamente este mapa:
// en otro PC basta importarlo y la app se ajusta a la pantalla de esa máquina.

export type ZoomMap = Record<string, number>;

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 5;
export const ZOOM_STEP = 1.1;

/**
 * Calibración de fábrica del zoom portable (TV 4K del usuario al 70%):
 * clave física real del monitor y clave lógica que reporta el navegador
 * (escalado de Windows al 225%). Con el mismo valor en ambas, el fichero
 * VisionPantalla-zooms.js coincide en cualquier navegador.
 * Se restaura en la migración v1→v2 si el mapa quedó vacío.
 */
export const ZOOM_DEFAULTS: ZoomMap = {
  '4097x2160': 0.7,
  '1821x960': 0.7,
};

export function clampZoom(n: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
}

interface ZoomState {
  zooms: ZoomMap; // persistido
  // Última ruta donde el usuario exportó el fichero portable (persistido):
  // tras cambios de zoom la app reescribe ese fichero silenciosamente.
  lastExportPath: string | null;
  monitorKey: string | null; // transitorio: detectado por IPC tras el mount
  setMonitorKey: (key: string | null) => void;
  setExportPath: (path: string | null) => void;
  setZoom: (key: string | null, factor: number) => void;
  resetZoom: (key: string | null) => void;
  importZooms: (map: ZoomMap) => number; // merge con overwrite; devuelve N importado
}

export const useZoomStore = create<ZoomState>()(
  persist(
    (set) => ({
      zooms: { ...ZOOM_DEFAULTS },
      lastExportPath: null,
      monitorKey: null,
      setMonitorKey: (key) => set({ monitorKey: key }),
      setExportPath: (path) => set({ lastExportPath: path }),
      // Sin monitor detectado aún la clave sería "null": al detectarse cambiaría,
      // así que guardar ahí no tiene sentido (no-op).
      setZoom: (key, factor) => {
        if (!key) return;
        set((state) => ({ zooms: { ...state.zooms, [key]: clampZoom(factor) } }));
      },
      resetZoom: (key) => {
        if (!key) return;
        set((state) => ({ zooms: { ...state.zooms, [key]: 1 } }));
      },
      importZooms: (map) => {
        const count = Object.keys(map).length;
        set((state) => ({ zooms: { ...state.zooms, ...map } }));
        return count;
      },
    }),
    {
      name: 'zoom-store',
      version: 2,
      // monitorKey queda fuera: se detecta en cada arranque, no se persiste
      partialize: (s) => ({ zooms: s.zooms, lastExportPath: s.lastExportPath }) as ZoomState,
      // v1→v2: si el mapa quedó vacío (se borró con reset tras la calibración),
      // restaurar la calibración de fábrica; si tiene datos, respetarlos.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<ZoomState>;
        const zooms = p.zooms && Object.keys(p.zooms).length > 0 ? p.zooms : { ...ZOOM_DEFAULTS };
        return { ...p, zooms } as ZoomState;
      },
    },
  ),
);

// Factor activo del monitor detectado (1 = auto-fit puro si no hay nada).
export function useActiveZoom(): number {
  return useZoomStore((s) => (s.monitorKey ? s.zooms[s.monitorKey] ?? 1 : 1));
}