'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Monitor,
  ChevronDown,
  ChevronUp,
  Globe,
  AppWindow,
  FolderOpen,
  FolderPlus,
  Link as LinkIcon,
  Save,
  Download,
  Upload,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import clsx from 'clsx';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAppsStore, type SavedAppType } from '@/lib/store/apps-store';
import {
  screenSizes,
  sizeGroups,
  getScreenSize,
  defaultSizeIds,
  type ScreenSizeGroup,
} from '@/lib/screen-sizes';
import ScreenViewport from '@/components/screen/ScreenViewport';
import SavedAppList from '@/components/screen/SavedAppList';
import { launchSavedApp, stopSavedApp } from '@/components/screen/app-runner';
import { useZoomController } from '@/components/screen/use-zoom-controller';

// --- FORMULARIO: campos condicionales según el tipo ---

const formSchema = z
  .object({
    name: z.string().min(1, 'El nombre es obligatorio'),
    type: z.enum(['web', 'desktop']),
    url: z.string().optional(),
    exePath: z.string().optional(),
    args: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'web') {
      if (!val.url || !val.url.trim()) {
        ctx.addIssue({ path: ['url'], code: 'custom', message: 'La URL es obligatoria' });
      } else {
        try {
          const u = new URL(val.url.trim());
          if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocol');
        } catch {
          ctx.addIssue({
            path: ['url'],
            code: 'custom',
            message: 'URL no válida (debe empezar por http:// o https://)',
          });
        }
      }
    } else if (!val.exePath || !val.exePath.trim()) {
      ctx.addIssue({ path: ['exePath'], code: 'custom', message: 'La ruta del .exe es obligatoria' });
    }
  });

type FormData = z.infer<typeof formSchema>;

// --- PÁGINA ---

export default function Page() {
  const zoom = useZoomController();
  const activeApp = useAppsStore((s) => s.savedApps.find((a) => a.id === s.activeAppId) ?? null);
  const isRunning = useAppsStore((s) =>
    s.activeAppId ? s.runningApps.some((r) => r.savedId === s.activeAppId) : false,
  );
  const setSize = useAppsStore((s) => s.setSize);

  const [currentSizeId, setCurrentSizeId] = useState<string>(defaultSizeIds.desktop as string);
  const size = getScreenSize(currentSizeId);

  const [showSizeSelector, setShowSizeSelector] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [launching, setLaunching] = useState(false);
  // Modo "todo el espacio": oculta panel lateral, stats y navbar para que la
  // pantalla ocupe el ancho y el alto completos de la ventana.
  const [immersive, setImmersive] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', type: 'web', url: '', exePath: '', args: '' },
  });
  const watchType = form.watch('type');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Al cambiar de app activa, recuperar su último tamaño de pantalla.
  // IMPORTANTE: dependes solo del id de la app; leer aquí lastSizeId y
  // escribirlo en el store desde otro efecto provoca un ping-pong
  // ("Maximum update depth exceeded") justo al arrancar cuando difieren.
  useEffect(() => {
    if (activeApp?.lastSizeId) setCurrentSizeId(activeApp.lastSizeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeApp?.id]);

  const handleSizeChange = (id: string) => {
    setCurrentSizeId(id);
    // Recordar el tamaño elegido en la app activa (se guarda aquí, al
    // cambiarlo el usuario, no en un efecto, para no reentrar con el store)
    if (activeApp) setSize(activeApp.id, id);
    setShowSizeSelector(false);
  };

  const onSubmit = async (data: FormData) => {
    const type: SavedAppType = data.type;
    const fields = {
      name: data.name.trim(),
      type,
      url: type === 'web' ? data.url?.trim() : undefined,
      exePath: type === 'desktop' ? data.exePath?.trim() : undefined,
      args: type === 'desktop' ? (data.args?.trim() || '') : undefined,
      lastSizeId: currentSizeId,
    };
    setLaunching(true);
    if (activeApp) {
      // Editar la app activa y relanzarla con los nuevos datos
      useAppsStore.getState().updateSavedApp(activeApp.id, fields);
      await launchSavedApp({ ...activeApp, ...fields });
    } else {
      // Guardar como nueva app (addSavedApp la deja activa)
      const newId = useAppsStore.getState().addSavedApp(fields);
      await launchSavedApp({ ...fields, id: newId, createdAt: Date.now() });
      form.reset({ name: '', type, url: '', exePath: '', args: '' });
      toast({
        title: `${fields.name} guardada`,
        description: type === 'desktop' ? 'Lanzada. Buscando su ventana para la vista previa…' : 'Mostrada en el visualizador.',
      });
    }
    setLaunching(false);
  };

  // Evitar desajuste de hidratación con next-themes
  if (!mounted) return null;

  const sizeGrouped = sizeGroups.map((g) => ({
    group: g,
    items: screenSizes.filter((s) => s.group === g),
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Navbar (oculto en modo pantalla completa para ganar espacio) */}
      {!immersive && (
        <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Monitor className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight text-white">Visión Pantalla</span>
            </div>
            <div className="text-xs text-slate-500 hidden sm:block">
              Lanzador con vista previa en pantallas reales
            </div>
          </div>
        </nav>
      )}

      <main
        className={cn(
          immersive
            ? 'h-[calc(100vh-1rem)] px-3 py-2 pb-2'
            : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-24',
        )}
      >
        <div className={cn('grid grid-cols-1 gap-8', !immersive && 'lg:grid-cols-12', immersive && 'h-full')}>
          {/* Columna izquierda: configuración y apps guardadas (oculta en pantalla completa) */}
          {!immersive && (
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
                <Play className="w-5 h-5 mr-2 text-indigo-400" />
                Lanzar aplicación
              </h2>

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Nombre */}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Nombre</label>
                  <input
                    type="text"
                    {...form.register('name')}
                    placeholder="Ej: Mi servidor local"
                    className={cn(
                      'w-full px-4 py-2.5 rounded-lg bg-slate-950 border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-slate-200',
                      form.formState.errors.name ? 'border-red-500' : 'border-slate-800',
                    )}
                  />
                  {form.formState.errors.name && (
                    <p className="text-xs text-red-400 mt-1">{form.formState.errors.name.message}</p>
                  )}
                </div>

                {/* Tipo */}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Tipo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: 'web', icon: Globe, label: 'Web (URL)' },
                        { key: 'desktop', icon: AppWindow, label: 'Escritorio (.exe)' },
                      ] as const
                    ).map(({ key, icon: Icon, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => form.setValue('type', key)}
                        className={cn(
                          'px-3 py-2 rounded-md text-sm font-medium transition-colors border flex items-center justify-center gap-1.5',
                          watchType === key
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700',
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Web: URL */}
                {watchType === 'web' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      <span className="inline-flex items-center gap-1.5">
                        <LinkIcon className="w-4 h-4" />
                        URL de la aplicación
                      </span>
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      {...form.register('url')}
                      placeholder="Ej: http://localhost:3000"
                      className={cn(
                        'w-full px-4 py-2.5 rounded-lg bg-slate-950 border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-slate-200 font-mono text-sm',
                        form.formState.errors.url ? 'border-red-500' : 'border-slate-800',
                      )}
                    />
                    {form.formState.errors.url && (
                      <p className="text-xs text-red-400 mt-1">{form.formState.errors.url.message}</p>
                    )}
                  </motion.div>
                )}

                {/* Desktop: ruta + args */}
                {watchType === 'desktop' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">
                        <span className="inline-flex items-center gap-1.5">
                          <FolderOpen className="w-4 h-4" />
                          Ruta del ejecutable
                        </span>
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        {...form.register('exePath')}
                        placeholder="Ej: C:\\Windows\\System32\\notepad.exe"
                        className={cn(
                          'w-full px-4 py-2.5 rounded-lg bg-slate-950 border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-slate-200 font-mono text-sm',
                          form.formState.errors.exePath ? 'border-red-500' : 'border-slate-800',
                        )}
                      />
                      {form.formState.errors.exePath && (
                        <p className="text-xs text-red-400 mt-1">
                          {form.formState.errors.exePath.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">
                        Argumentos <span className="text-slate-600">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        {...form.register('args')}
                        placeholder="Ej: --windowed --lang es"
                        className="w-full px-4 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-slate-200 font-mono text-sm"
                      />
                    </div>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={launching}
                  className={cn(
                    'w-full mt-2 py-3 rounded-lg font-semibold text-white shadow-lg transition-all flex items-center justify-center gap-2',
                    launching
                      ? 'bg-slate-700 cursor-not-allowed opacity-60'
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/25',
                  )}
                >
                  {launching ? (
                    <span className="text-sm">Lanzando…</span>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{activeApp ? 'Lanzar de nuevo' : 'Guardar y lanzar'}</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Apps guardadas */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Aplicaciones guardadas
              </h3>
              <SavedAppList />
            </div>
          </div>
          )}

          {/* Columna derecha: visualizador */}
          <div className={cn(immersive ? 'h-full flex flex-col' : 'lg:col-span-8 space-y-6')}>
            <div
              className={cn(
                'bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col',
                immersive ? 'flex-1 p-4' : 'p-6 min-h-[600px]',
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className={cn('font-semibold text-white flex items-center', immersive ? 'text-lg' : 'text-xl')}>
                  <Monitor className="w-5 h-5 mr-2 text-purple-400" />
                  Visualizador de Pantalla
                </h2>

                {/* Zoom + selector de tamaño agrupado */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setImmersive(!immersive)}
                    title={immersive ? 'Salir de pantalla completa (recuperar el panel lateral)' : 'Ocupar todo el ancho y alto de la ventana'}
                    className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                  >
                    {immersive ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                  <span
                    title="100% = cómo se ve en la resolución elegida (Ctrl + / Ctrl − / Ctrl 0)"
                    className="text-xs font-mono bg-slate-800 border border-slate-700 text-indigo-300 px-2 py-1.5 rounded-md min-w-[3.5rem] text-center"
                  >
                    {zoom.percent}%
                  </span>
                  {/* Botones de zoom: siempre funcionan, incluso cuando el
                      teclado no llega (el foco quedó dentro de la web del visor) */}
                  <span className="flex items-center">
                    <button
                      onClick={zoom.zoomOut}
                      title="Reducir el zoom de la vista (Ctrl −)"
                      className="px-2 py-1.5 rounded-l-md bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <button
                      onClick={zoom.reset}
                      title="Volver al ajuste real de la pantalla (Ctrl 0)"
                      className="px-2 py-1.5 bg-slate-800 border-y border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                      <span className="text-[10px] font-mono">100%</span>
                    </button>
                    <button
                      onClick={zoom.zoomIn}
                      title="Aumentar el zoom de la vista (Ctrl +)"
                      className="px-2 py-1.5 rounded-r-md bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </span>
                  {window.electronAPI && (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={zoom.exportZooms}
                        title="Exportar fichero portable de zooms (VisionPantalla-zooms.json)"
                        className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={zoom.importZooms}
                        title="Importar fichero portable de zooms: la app se ajusta al tamaño de pantalla de este PC"
                        className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                      </button>
                      <button
                        onClick={zoom.applyToApp}
                        title="Instalar el zoom automático en la carpeta de una app (copia VisionPantalla-zooms.js a su public/ y añade el <Script> a su layout)"
                        className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                      >
                        <FolderPlus className="w-4 h-4" />
                      </button>
                    </span>
                  )}

                  <div className="relative">
                  <button
                    onClick={() => setShowSizeSelector(!showSizeSelector)}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-md text-sm transition-colors border border-slate-700"
                  >
                    <span className="text-xs font-mono">{size.label}</span>
                    {showSizeSelector ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  <AnimatePresence>
                    {showSizeSelector && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full right-0 mt-2 w-64 max-h-96 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20"
                      >
                        {sizeGrouped.map(({ group, items }) => (
                          <div key={group}>
                            <div className="sticky top-0 bg-slate-900/95 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-300 border-b border-slate-800">
                              {group}
                            </div>
                            {items.map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => handleSizeChange(opt.id)}
                                className={cn(
                                  'w-full text-left px-4 py-2.5 text-sm hover:bg-slate-700 flex justify-between items-center transition-colors',
                                  opt.id === currentSizeId
                                    ? 'text-indigo-300 bg-slate-700/40'
                                    : 'text-slate-300',
                                )}
                              >
                                <span>{opt.label}</span>
                                <span className="text-[10px] font-mono text-slate-500">
                                  {(opt.w / opt.h).toFixed(2)}
                                </span>
                              </button>
                            ))}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* La pantalla */}
              <div className="flex-1 bg-black rounded-xl overflow-hidden shadow-inner border border-slate-800 relative min-h-[500px]">
                <ScreenViewport activeApp={activeApp} isRunning={isRunning} size={size} zoomFactor={zoom.zoomFactor} />
              </div>
            </div>

            {/* Stats (ocultas en pantalla completa) */}
            {!immersive && (
              <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <h4 className="text-sm font-medium text-slate-400 mb-1">Resolución</h4>
                <p className="text-lg font-mono text-indigo-400">
                  {size.w}×{size.h}
                </p>
              </div>
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <h4 className="text-sm font-medium text-slate-400 mb-1">Proporción</h4>
                <p className="text-lg font-mono text-purple-400">{(size.w / size.h).toFixed(2)}</p>
              </div>
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <h4 className="text-sm font-medium text-slate-400 mb-1">App activa</h4>
                <p className="text-sm text-slate-200 truncate" title={activeApp?.name}>
                  {activeApp?.name ?? '— ninguna —'}
                </p>
              </div>
            </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}