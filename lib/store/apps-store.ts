import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Apps configuradas por el usuario (web o de escritorio) y su estado de
// ejecución en la sesión actual. Se persiste solo la lista de apps guardadas:
// los pids mueren al cerrar Visión Pantalla, así que runningApps no se guarda.

export type SavedAppType = 'web' | 'desktop';

export interface SavedApp {
  id: string;
  name: string;
  type: SavedAppType;
  url?: string; // solo web
  exePath?: string; // solo desktop
  args?: string; // solo desktop
  createdAt: number;
  lastSizeId?: string; // último tamaño de pantalla usado con esta app
}

export interface RunningApp {
  savedId: string;
  pid?: number;
  startedAt: number;
}

interface AppsState {
  savedApps: SavedApp[];
  runningApps: RunningApp[];
  activeAppId: string | null;
  addSavedApp: (app: Omit<SavedApp, 'id' | 'createdAt'>) => string;
  updateSavedApp: (id: string, patch: Partial<SavedApp>) => void;
  removeSavedApp: (id: string) => void;
  markRunning: (savedId: string, pid?: number) => void;
  markStopped: (savedId: string) => void;
  setActive: (id: string | null) => void;
  setSize: (savedId: string, sizeId: string) => void;
}

function newId(): string {
  // crypto.randomUUID existe en todos los navegadores y Electron actuales
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `app-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export const useAppsStore = create<AppsState>()(
  devtools(
    persist(
      (set, get) => ({
        savedApps: [],
        runningApps: [],
        activeAppId: null,
        addSavedApp: (app) => {
          const id = newId();
          set((state) => ({
            savedApps: [{ ...app, id, createdAt: Date.now() }, ...state.savedApps],
            activeAppId: id,
          }));
          return id;
        },
        updateSavedApp: (id, patch) =>
          set((state) => ({
            savedApps: state.savedApps.map((a) => (a.id === id ? { ...a, ...patch } : a)),
          })),
        removeSavedApp: (id) =>
          set((state) => ({
            savedApps: state.savedApps.filter((a) => a.id !== id),
            runningApps: state.runningApps.filter((r) => r.savedId !== id),
            activeAppId: state.activeAppId === id ? null : state.activeAppId,
          })),
        markRunning: (savedId, pid) =>
          set((state) => ({
            runningApps: [
              { savedId, pid, startedAt: Date.now() },
              ...state.runningApps.filter((r) => r.savedId !== savedId),
            ],
          })),
        markStopped: (savedId) =>
          set((state) => ({
            runningApps: state.runningApps.filter((r) => r.savedId !== savedId),
          })),
        setActive: (id) => set({ activeAppId: id }),
        setSize: (savedId, sizeId) =>
          set((state) => ({
            savedApps: state.savedApps.map((a) =>
              a.id === savedId ? { ...a, lastSizeId: sizeId } : a,
            ),
          })),
      }),
      {
        name: 'apps-store',
        partialize: (state) =>
          ({ savedApps: state.savedApps, activeAppId: state.activeAppId } as AppsState),
      },
    ),
  ),
);

// Helpers sin hook para uso en callbacks
export const getSavedApps = () => useAppsStore.getState().savedApps;