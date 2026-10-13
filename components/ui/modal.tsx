'use client';

'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, 
  Play, 
  X, 
  Monitor, 
  Smartphone, 
  Tablet, 
  Settings, 
  Plus, 
  Trash2, 
  Edit3, 
  ChevronDown, 
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- UTILS ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- TYPES ---
type ScreenSize = 'iphone-se' | 'iphone-14' | 'ipad-pro' | '4k-monitor';

interface AppConfig {
  id: string;
  name: string;
  command: string;
  port: number;
  status: 'idle' | 'running' | 'stopped';
}

interface AppState {
  apps: AppConfig[];
  activeAppId: string | null;
  screenSize: ScreenSize;
  addApp: (app: Omit<AppConfig, 'id' | 'status'>) => void;
  updateApp: (id: string, data: Partial<AppConfig>) => void;
  deleteApp: (id: string) => void;
  setActiveApp: (id: string | null) => void;
  setScreenSize: (size: ScreenSize) => void;
  toggleAppStatus: (id: string) => void;
}

// --- ZUSTAND STORE ---
const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      apps: [],
      activeAppId: null,
      screenSize: 'iphone-se',
      
      addApp: (app) => set((state) => ({
        apps: [...state.apps, { ...app, id: crypto.randomUUID(), status: 'idle' }]
      })),

      updateApp: (id, data) => set((state) => ({
        apps: state.apps.map((app) => (app.id === id ? { ...app, ...data } : app))
      })),

      deleteApp: (id) => set((state) => ({
        apps: state.apps.filter((app) => app.id !== id)
      })),

      setActiveApp: (id) => set({ activeAppId: id }),

      setScreenSize: (size) => set({ screenSize: size }),

      toggleAppStatus: (id) => set((state) => ({
        apps: state.apps.map((app) => 
          app.id === id ? { ...app, status: app.status === 'running' ? 'stopped' : 'running' } : app
        )
      })),
    }),
    { name: 'visualizer-storage' }
  )
);

// --- SCREEN SIZES CONFIG ---
const SCREEN_SIZES: { id: ScreenSize; label: string; width: number; height: number; aspectRatio: string }[] = [
  { id: 'iphone-se', label: 'iPhone SE (4.7")', width: 375, height: 667, aspectRatio: '4/7' },
  { id: 'iphone-14', label: 'iPhone 14 (6.1")', width: 390, height: 844, aspectRatio: '9/19.6' },
  { id: 'ipad-pro', label: 'iPad Pro (12.9")', width: 834, height: 1194, aspectRatio: '3/4' },
  { id: '4k-monitor', label: '4K Monitor (21:9)', width: 1920, height: 1080, aspectRatio: '16/9' },
];

// --- COMPONENTS ---

const Button = ({
  children,
  variant = 'primary',
  className,
  onClick,
  disabled,
  type = 'button',
  icon: Icon
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  icon?: React.ElementType;
}) => {
  const baseStyle = "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    primary: "bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/20",
    secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700",
    danger: "bg-red-900/30 text-red-200 hover:bg-red-900/50 border border-red-900/50",
    ghost: "bg-transparent text-slate-400 hover:text-white hover:bg-slate-800/50",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(baseStyle, variants[variant], className)}
    >
      {Icon && <Icon className="mr-2 h-4 w-4" />}
      {children}
    </button>
  );
};

const Input = ({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) => (
  <div className="space-y-1">
    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</label>
    <input 
      className={cn(
        "flex h-10 w-full rounded-md border bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50",
        error ? "border-red-500 focus-visible:ring-red-500" : "border-slate-800"
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
);

const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (val: string) => void; options: { value: string; label: string }[] }) => (
  <div className="space-y-1">
    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full appearance-none rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
    </div>
  </div>
);

// --- MAIN COMPONENT ---

const appFormSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  command: z.string().min(1, 'Comando requerido'),
  port: z.number().int().positive('Puerto inválido'),
});

export default function VisualizerModal() {
  const { 
    apps, 
    activeAppId, 
    screenSize, 
    addApp, 
    updateApp, 
    deleteApp, 
    setActiveApp, 
    setScreenSize, 
    toggleAppStatus 
  } = useAppStore();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const { register, handleSubmit, formState: { errors }, reset, getValues } = useForm<z.infer<typeof appFormSchema>>({
    resolver: zodResolver(appFormSchema),
  });

  const handleAdd = (data: z.infer<typeof appFormSchema>) => {
    addApp({
      name: data.name,
      command: data.command,
      port: data.port,
    });
    setIsFormOpen(false);
    reset();
  };

  const handleEdit = (id: string) => {
    const app = apps.find(a => a.id === id);
    if (!app) return;
    setEditingId(id);
    reset({ name: app.name, command: app.command, port: app.port });
  };

  const handleSaveEdit = () => {
    if (editingId) {
      const values = getValues();
      updateApp(editingId, {
        name: values.name,
        command: values.command,
        port: values.port,
      });
      setEditingId(null);
    }
  };

  const activeApp = apps.find(a => a.id === activeAppId);

  // --- RENDER HELPERS ---

  const renderMockAppContent = (app: AppConfig) => {
    if (!app) return null;
    
    // Simulate terminal output based on command
    const mockOutput = [
      `> Initializing ${app.name}...`,
      `> Connecting to port ${app.port}...`,
      `> Listening on http://localhost:${app.port}`,
      `> Process started successfully.`
    ];

    return (
      <div className="flex flex-col h-full bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
        {/* App Header */}
        <div className="bg-slate-800 px-4 py-2 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <div className="text-xs text-slate-400 font-mono truncate max-w-[150px]">
            {app.command}
          </div>
          <div className="text-xs text-indigo-400 font-mono">
            PORT: {app.port}
          </div>
        </div>

        {/* App Content */}
        <div className="flex-1 p-4 font-mono text-sm overflow-auto">
          {app.status === 'running' ? (
            <div className="space-y-2 animate-pulse">
              {mockOutput.map((line, i) => (
                <div key={i} className="text-slate-300">
                  <span className="text-indigo-500 mr-2">{'>'}</span>
                  {line}
                </div>
              ))}
              <div className="w-2 h-4 bg-slate-500 animate-blink inline-block align-middle" />
            </div>
          ) : (
            <div className="text-slate-500 flex flex-col items-center justify-center h-full space-y-4">
              <Terminal className="w-12 h-12 opacity-20" />
              <p>App not running. Click 'Execute' to start.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderScreenFrame = () => {
    const sizeConfig = SCREEN_SIZES.find(s => s.id === screenSize) || SCREEN_SIZES[0];
    
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "bg-slate-950 rounded-xl border-2 border-slate-800 shadow-2xl overflow-hidden relative flex flex-col",
          // Aspect ratio hack using padding-top
          `aspect-[${sizeConfig.aspectRatio.split('/')[0]}-${sizeConfig.aspectRatio.split('/')[1]}]`
        )}
      >
        {/* Screen Content */}
        <div className="w-full h-full bg-slate-900 relative">
          {activeApp ? renderMockAppContent(activeApp) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4">
              <Monitor className="w-16 h-16 opacity-20" />
              <p>No application selected.</p>
            </div>
          )}
        </div>
        
        {/* Screen Overlay/Status */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg">
              <Monitor className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              Visión Pantalla
            </h1>
          </div>
          
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              onClick={() => setIsFormOpen(true)}
              icon={Plus}
            >
              Nueva App
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Controls & List */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Screen Selector */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 space-y-4">
              <div className="flex items-center space-x-2 text-slate-300 font-medium">
                <Monitor className="w-4 h-4" />
                <span>Seleccionar Tamaño</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SCREEN_SIZES.map((size) => (
                  <button
                    key={size.id}
                    onClick={() => setScreenSize(size.id)}
                    className={cn(
                      "flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                      screenSize === size.id 
                        ? "bg-indigo-600/20 border-indigo-500 text-indigo-300" 
                        : "bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800"
                    )}
                  >
                    <span className="text-[10px] opacity-70">{size.label.split(' ')[0]}</span>
                    <span>{size.width}x{size.height}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* App List */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col h-[600px]">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="font-semibold text-slate-200">Mis Aplicaciones</h2>
                <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">{apps.length}</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {apps.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                    <Terminal className="w-10 h-10 opacity-20" />
                    <p className="text-sm">No hay aplicaciones configuradas.</p>
                  </div>
                ) : (
                  apps.map((app) => (
                    <motion.div
                      key={app.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "group flex items-center justify-between p-3 rounded-lg border transition-all",
                        activeAppId === app.id 
                          ? "bg-indigo-900/20 border-indigo-500/50" 
                          : "bg-slate-800/30 border-slate-800 hover:bg-slate-800/50"
                      )}
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className={cn(
                          "w-2 h-2 rounded-full flex-shrink-0",
                          app.status === 'running' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-slate-600"
                        )} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-slate-200 truncate">{app.name}</span>
                          <span className="text-xs text-slate-500 font-mono truncate">{app.command}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {activeAppId === app.id && app.status === 'running' ? (
                          <Button 
                            variant="danger" 
                            className="!px-2 !py-1 !text-xs"
                            onClick={() => toggleAppStatus(app.id)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        ) : (
                          <Button 
                            variant="primary" 
                            className="!px-2 !py-1 !text-xs"
                            onClick={() => toggleAppStatus(app.id)}
                          >
                            <Play className="w-3 h-3 fill-current" />
                          </Button>
                        )}
                        <button 
                          onClick={() => handleEdit(app.id)}
                          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-md transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => deleteApp(app.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-md transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Visualization */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 flex flex-col items-center justify-center min-h-[600px] relative">
              
              <div className="absolute top-4 right-4 flex space-x-2">
                <Button 
                  variant="ghost" 
                  className="!p-2"
                  onClick={() => setActiveApp(null)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="w-full max-w-[600px]">
                {renderScreenFrame()}
                
                {/* Controls Overlay */}
                <div className="mt-4 flex justify-center space-x-4">
                  {activeApp ? (
                    <div className="flex items-center space-x-4 bg-slate-950/80 px-6 py-3 rounded-full border border-slate-800 backdrop-blur-sm">
                      <div className="text-center">
                        <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Estado</div>
                        <div className={cn(
                          "text-sm font-bold",
                          activeApp.status === 'running' ? "text-green-400" : "text-slate-300"
                        )}>
                          {activeApp.status === 'running' ? 'Ejecutando' : 'Detenido'}
                        </div>
                      </div>
                      <div className="w-px h-8 bg-slate-800" />
                      <div className="text-center">
                        <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Puerto</div>
                        <div className="text-sm font-mono text-indigo-400">{activeApp.port}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 text-sm">
                      Selecciona una aplicación de la lista para visualizarla.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">
                  {editingId ? 'Editar Aplicación' : 'Nueva Aplicación'}
                </h3>
                <button 
                  onClick={() => setIsFormOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit(handleAdd || handleSaveEdit)} className="p-6 space-y-4">
                <Input 
                  label="Nombre de la App" 
                  placeholder="Ej: Dashboard Admin"
                  {...register('name')}
                  error={errors.name?.message}
                />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Comando</label>
                  <div className="relative">
                    <Terminal className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <input 
                      className="flex h-10 w-full rounded-md border border-slate-800 bg-slate-950 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      {...register('command')}
                      placeholder="npm start"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Puerto</label>
                  <div className="relative">
                    <div className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 flex items-center justify-center">
                      <span className="text-xs font-mono">:8080</span>
                    </div>
                    <input 
                      type="number"
                      className="flex h-10 w-full rounded-md border border-slate-800 bg-slate-950 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      {...register('port')}
                      placeholder="3000"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end space-x-3">
                  <Button 
                    variant="ghost" 
                    onClick={() => setIsFormOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingId ? 'Guardar Cambios' : 'Crear Aplicación'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}