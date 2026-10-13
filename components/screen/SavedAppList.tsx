'use client';

import React from 'react';
import { Globe, Play, Square, Trash2, AppWindow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppsStore, type SavedApp } from '@/lib/store/apps-store';
import { getScreenSize } from '@/lib/screen-sizes';
import { launchSavedApp, stopSavedApp } from './app-runner';

export default function SavedAppList() {
  const savedApps = useAppsStore((s) => s.savedApps);
  const runningApps = useAppsStore((s) => s.runningApps);
  const activeAppId = useAppsStore((s) => s.activeAppId);
  const { setActive, removeSavedApp } = useAppsStore.getState();

  const isRunning = (id: string) => runningApps.some((r) => r.savedId === id);

  const handleLaunch = (app: SavedApp) => {
    void launchSavedApp(app);
  };

  const handleStop = (app: SavedApp) => {
    void stopSavedApp(app);
  };

  if (savedApps.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-center text-xs text-slate-500">
        Aún no hay aplicaciones guardadas. Configura una arriba y pulsa
        “Guardar y lanzar”.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {savedApps.map((app) => {
        const running = isRunning(app.id);
        const active = activeAppId === app.id;
        return (
          <li key={app.id}>
            <div
              onClick={() => setActive(app.id)}
              className={cn(
                'w-full text-left rounded-xl border p-4 transition-colors cursor-pointer',
                active
                  ? 'border-indigo-500 bg-slate-900 ring-1 ring-indigo-500/40'
                  : 'border-slate-800 bg-slate-900/50 hover:bg-slate-900',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {app.type === 'web' ? (
                      <Globe className="w-4 h-4 text-sky-400 flex-none" />
                    ) : (
                      <AppWindow className="w-4 h-4 text-purple-400 flex-none" />
                    )}
                    <span className="font-medium text-sm text-slate-200 truncate">{app.name}</span>
                    {running && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 flex-none" title="En ejecución" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 truncate" dir="ltr">
                    {app.type === 'web' ? app.url : app.exePath}
                  </p>
                  {app.type !== 'web' && app.args && (
                    <p className="text-xs text-slate-600 truncate" dir="ltr">
                      args: {app.args}
                    </p>
                  )}
                  {app.lastSizeId && (
                    <p className="mt-1 text-[10px] text-slate-600 font-mono">
                      Último tamaño: {getScreenSize(app.lastSizeId).label}
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5 flex-none">
                  {running ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStop(app);
                      }}
                      title="Detener"
                      className="p-2 rounded-lg bg-rose-600/20 border border-rose-700/40 text-rose-300 hover:bg-rose-600/30"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLaunch(app);
                      }}
                      title={app.type === 'web' ? 'Mostrar' : 'Lanzar'}
                      className="p-2 rounded-lg bg-emerald-600/20 border border-emerald-700/40 text-emerald-300 hover:bg-emerald-600/30"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSavedApp(app.id);
                    }}
                    title="Eliminar"
                    className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-700/40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}