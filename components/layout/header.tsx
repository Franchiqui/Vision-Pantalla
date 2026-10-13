"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { create } from "zustand";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Monitor, 
  Smartphone, 
  Monitor as Desktop, 
  Tablet, 
  Play, 
  X, 
  Settings, 
  Terminal, 
  Eye,
  Maximize2,
  Minimize2
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// --- UTILS ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- TYPES ---
interface ScreenConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  aspectRatio: string;
  icon: React.ReactNode;
}

interface AppState {
  isRunning: boolean;
  command: string;
  port: string;
  windowHandle: string | null;
  currentScreenId: string;
  screens: ScreenConfig[];
  toggleRunning: () => void;
  updateCommand: (cmd: string) => void;
  updatePort: (port: string) => void;
  closeWindow: () => void;
  switchScreen: (id: string) => void;
}

// --- STORE ---
const useAppStore = create<AppState>((set, get) => ({
  isRunning: false,
  command: "",
  port: "8080",
  windowHandle: null,
  currentScreenId: "mobile",
  screens: [
    { id: "mobile", name: "Mobile (iPhone 14)", width: 375, height: 812, aspectRatio: "9/19.5", icon: <Smartphone size={16} /> },
    { id: "tablet", name: "Tablet (iPad)", width: 768, height: 1024, aspectRatio: "3/4", icon: <Tablet size={16} /> },
    { id: "desktop", name: "Desktop (1366x768)", width: 1366, height: 768, aspectRatio: "16:9", icon: <Desktop size={16} /> },
    { id: "ultrawide", name: "Ultrawide (3840x2160)", width: 3840, height: 2160, aspectRatio: "16:9", icon: <Monitor size={16} /> },
  ],
  toggleRunning: () => {
    set((state) => {
      if (state.isRunning) {
        // Close logic
        if (state.windowHandle) {
          window.close(); // Standard browser close
        }
        return { ...state, isRunning: false, windowHandle: null };
      } else {
        // Open logic
        const cmd = state.command.trim();
        const port = state.port.trim();
        
        // Security check: prevent executing arbitrary code in the command string
        if (!cmd || !port) return state;

        // Attempt to open a new window to simulate the "execution"
        // In a real Electron app, this would spawn a native window.
        // Here we open a new tab/window to represent the launched app.
        const win = window.open("", "_blank");
        if (win) {
          // Simulate loading the app
          win.document.write(`<html><body><div style='padding:20px;'><h1>App Running: ${cmd}</h1><p>Port: ${port}</p><button onclick="window.close()">Close App</button></div></body></html>`);
        }
        return { ...state, isRunning: true, windowHandle: win ? win.name : null };
      }
    });
  },
  updateCommand: (cmd) => set({ command: cmd }),
  updatePort: (port) => set({ port: port }),
  closeWindow: () => set({ isRunning: false, windowHandle: null }),
  switchScreen: (id) => set({ currentScreenId: id }),
}));

// --- SCHEMA ---
const formSchema = z.object({
  command: z.string().min(1, "El comando es obligatorio"),
  port: z.string().min(1, "El puerto es obligatorio").regex(/^\d+$/, "El puerto debe ser numérico"),
});

// --- COMPONENTS ---

const Header = () => {
  const { toggleRunning, isRunning } = useAppStore();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <Eye size={18} />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">
            Visión<span className="text-indigo-400">Pantalla</span>
          </span>
        </div>

        <nav className="flex items-center gap-4">
          {isRunning ? (
            <button
              onClick={toggleRunning}
              className="flex items-center gap-2 rounded-full bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <X size={16} />
              <span>Detener Aplicación</span>
            </button>
          ) : (
            <button
              onClick={toggleRunning}
              disabled={!useAppStore.getState().command}
              className="flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play size={16} fill="currentColor" />
              <span>Ejecutar</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};

const ScreenVision = () => {
  const { 
    isRunning, 
    command, 
    port, 
    toggleRunning, 
    currentScreenId, 
    screens, 
    switchScreen,
    closeWindow 
  } = useAppStore();

  const [loading, setLoading] = useState(false);

  // Handle launch
  const handleLaunch = () => {
    setLoading(true);
    setTimeout(() => {
      toggleRunning();
      setLoading(false);
    }, 800); // Fake delay for realism
  };

  // Get current screen config
  const currentScreen = screens.find(s => s.id === currentScreenId) || screens[0];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] p-4 text-white">
      
      {/* Main Content Area */}
      <div className="w-full max-w-6xl space-y-8">
        
        {/* 1. Configuration Panel (Only visible when not running) */}
        {!isRunning && (
          <div className="rounded-2xl border border-white/10 bg-[#111] p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Terminal size={20} className="text-indigo-400" />
                Configuración de Ejecución
              </h2>
              <span className="text-xs text-gray-500">Modo: Configuración</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Comando / Script</label>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => useAppStore.getState().updateCommand(e.target.value)}
                  placeholder="Ej: java -jar app.jar --port 8080"
                  className="w-full rounded-lg border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Puerto</label>
                <input
                  type="text"
                  value={port}
                  onChange={(e) => useAppStore.getState().updatePort(e.target.value)}
                  placeholder="8080"
                  className="w-full rounded-lg border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleLaunch}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02] hover:shadow-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white"></span>
                      <span>Iniciando...</span>
                    </>
                  ) : (
                    <>
                      <Play size={16} fill="currentColor" />
                      <span>INICIAR APLICACIÓN</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Running Application View */}
        {isRunning && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Monitor size={20} className="text-green-400" />
                Aplicación en Ejecución
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={closeWindow}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10"
                >
                  Detener
                </button>
              </div>
            </div>

            {/* The "Window" Container */}
            <div className="relative mx-auto overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl shadow-black/50">
              
              {/* Window Header (Fake OS Window) */}
              <div className="flex items-center justify-between border-b border-white/10 bg-[#111] px-4 py-2">
                <div className="flex gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500/80" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                  <div className="h-3 w-3 rounded-full bg-green-500/80" />
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  {command} : {port}
                </div>
                <div className="flex gap-1.5">
                  <button className="rounded bg-white/5 p-1 text-gray-400 hover:bg-white/10 hover:text-white" title="Minimizar">
                    <Minimize2 size={14} />
                  </button>
                  <button className="rounded bg-white/5 p-1 text-gray-400 hover:bg-white/10 hover:text-white" title="Maximizar">
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>

              {/* Screen Vision Simulator */}
              <div className="relative bg-black">
                {/* Aspect Ratio Container */}
                <div 
                  className="relative flex items-center justify-center overflow-hidden bg-[#050505]"
                  style={{
                    width: `${currentScreen.width}px`,
                    height: `${currentScreen.height}px`,
                  }}
                >
                  {/* The Content (Simulated App) */}
                  <div className="relative h-full w-full overflow-hidden">
                    {/* Simulated App UI */}
                    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-gray-900 to-black">
                      {/* App Header */}
                      <div className="border-b border-white/10 bg-white/5 backdrop-blur-sm p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded bg-indigo-500 flex items-center justify-center text-white font-bold">A</div>
                            <span className="font-semibold text-white">App Dashboard</span>
                          </div>
                          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        </div>
                      </div>
                      
                      {/* App Body */}
                      <div className="flex-1 p-6">
                        <h1 className="mb-6 text-2xl font-bold text-white">Bienvenido</h1>
                        <div className="grid grid-cols-2 gap-4">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-4">
                              <div className="mb-2 h-2 w-full rounded bg-white/10" />
                              <div className="h-2 w-3/4 rounded bg-white/5" />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* App Footer */}
                      <div className="border-t border-white/10 bg-white/5 p-4 text-center text-xs text-gray-500">
                        Visión Pantalla Simulator v1.0
                      </div>
                    </div>
                  </div>
                </div>

                {/* Controls Overlay */}
                <div className="absolute bottom-4 right-4 z-10 flex gap-2">
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => switchScreen(currentScreen.id === 'mobile' ? 'tablet' : 'mobile')}
                      className="flex items-center gap-1 rounded bg-black/80 px-3 py-1.5 text-xs text-white backdrop-blur-md hover:bg-black/90 transition-colors"
                    >
                      {currentScreen.id === 'mobile' ? <Smartphone size={12}/> : <Tablet size={12}/>}
                      <span className="hidden sm:inline">{currentScreen.id === 'mobile' ? 'Mobile' : 'Tablet'}</span>
                    </button>
                    <button 
                      onClick={() => switchScreen(currentScreen.id === 'tablet' ? 'desktop' : 'tablet')}
                      className="flex items-center gap-1 rounded bg-black/80 px-3 py-1.5 text-xs text-white backdrop-blur-md hover:bg-black/90 transition-colors"
                    >
                      {currentScreen.id === 'tablet' ? <Tablet size={12}/> : <Desktop size={12}/>}
                      <span className="hidden sm:inline">{currentScreen.id === 'tablet' ? 'Tablet' : 'Desktop'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. Empty State / Instructions */}
        {!isRunning && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-gray-400">
              <Settings size={24} />
            </div>
            <h3 className="text-lg font-medium text-white">Configura tu Aplicación</h3>
            <p className="mt-2 text-sm text-gray-400 max-w-md mx-auto">
              Ingresa el comando y el puerto para iniciar la simulación. Una vez ejecutada, podrás cambiar las dimensiones de la pantalla para visualizar la respuesta.
            </p>
          </div>
        )}

      </div>
    </main>
  );
};

// --- MAIN APP COMPONENT ---
export default function App() {
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-indigo-500/30">
      <Header />
      <ScreenVision />
    </div>
  );
}