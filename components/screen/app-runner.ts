'use client';

import { toast } from '@/hooks/use-toast';
import {
  useAppsStore,
  type SavedApp,
} from '@/lib/store/apps-store';

/**
 * Lanza una app guardada:
 * - web: comprueba que la URL responde (si es localhost, aviso si está caída)
 * - desktop: comprueba la ruta, la lanza por IPC y memoriza el pid
 */
export async function launchSavedApp(app: SavedApp): Promise<boolean> {
  const { markRunning, setActive } = useAppsStore.getState();
  setActive(app.id);

  if (!window.electronAPI) {
    // En navegador solo se puede mostrar una web embebida
    if (app.type === 'web' && app.url) return true;
    toast({
      title: 'Solo en Electron',
      description: 'Abre Visión Pantalla desde su app de escritorio para lanzar ejecutables.',
      variant: 'destructive',
    });
    return false;
  }

  if (app.type === 'web' && app.url) {
    const probe = await window.electronAPI.probeUrl({ url: app.url });
    if (!probe.ok) {
      toast({
        title: 'La web no responde',
        description: `${app.url} — ${probe.error ?? 'comprueba que el servidor esté en marcha'}`,
        variant: 'destructive',
      });
      return false;
    }
    return true;
  }

  if (app.type === 'desktop' && app.exePath) {
    const check = await window.electronAPI.checkPath({ path: app.exePath });
    if (!check.exists || !check.isFile) {
      toast({
        title: 'Archivo no encontrado',
        description: app.exePath,
        variant: 'destructive',
      });
      return false;
    }
    const res = await window.electronAPI.launchApp({
      exePath: app.exePath,
      args: app.args ?? '',
      appId: app.id,
    });
    if (!res.ok || res.pid === undefined) {
      toast({
        title: 'No se pudo lanzar',
        description: res.error,
        variant: 'destructive',
      });
      return false;
    }
    markRunning(app.id, res.pid);
    toast({
      title: `Lanzada ${app.name}`,
      description: `PID ${res.pid} — buscando su ventana para la vista previa…`,
    });
    return true;
  }

  return false;
}

/** Detiene la app de escritorio lanzada (taskkill /T /F en Windows). */
export async function stopSavedApp(app: SavedApp): Promise<void> {
  const { markStopped } = useAppsStore.getState();
  const running = useAppsStore.getState().runningApps.find((r) => r.savedId === app.id);
  if (!running?.pid || !window.electronAPI) return;
  const res = await window.electronAPI.stopApp({ pid: running.pid });
  if (res.ok) {
    markStopped(app.id);
    toast({ title: `Detenida ${app.name}` });
  } else {
    toast({ title: 'No se pudo detener', description: res.error, variant: 'destructive' });
  }
}