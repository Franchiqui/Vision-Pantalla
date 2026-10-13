'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Monitor, MonitorX, Camera, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DesktopPreviewProps {
  savedId: string;
}

/**
 * Vista previa EN VIVO de la ventana de la app de escritorio lanzada:
 * stream de getDisplayMedia cuyo source Electron selecciona automáticamente
 * (ver electron/main.js). Renderizado en <video> escalado al contenedor.
 * La app real corre en su propia ventana; esta vista es de solo lectura.
 */
export default function DesktopPreview({ savedId }: DesktopPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'error' | 'no-electron'>('connecting');
  const [errorText, setErrorText] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const unsubscribeFailed = window.electronAPI?.onCaptureFailed((payload) => {
      if (payload?.appId && savedId && payload.appId !== savedId) return;
      if (cancelled) return;
      setStatus('error');
      setErrorText('No se pudo encontrar la ventana de la app para capturarla.');
    });

    const start = async () => {
      if (!window.electronAPI) {
        setStatus('no-electron');
        return;
      }
      const timeout = setTimeout(() => {
        if (cancelled) return;
        setStatus((s) => (s === 'connecting' ? 'error' : s));
        setErrorText('La ventana de la app no aparece para la captura (¿tarda en abrirse?). Usa el selector manual o reintenta.');
      }, 15000);
      timeoutRef.current = timeout;
      try {
        setStatus('connecting');
        // Armar el objetivo por si la petición llega tras el TTL del lanzamiento
        if (window.electronAPI) {
          await window.electronAPI.armCapture({ appId: savedId });
        }
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        clearTimeout(timeoutRef.current);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          setStatus('error');
          setErrorText('La captura se detuvo (la ventana se cerró o se detuvo la app).');
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => { /* autoplay ya permitido muted */ });
        }
        setStatus('live');
      } catch (err) {
        clearTimeout(timeoutRef.current);
        if (cancelled) return;
        setStatus('error');
        setErrorText(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Permiso de captura denegado.'
            : 'No se pudo iniciar la vista previa: ' + String(err),
        );
      }
    };
    start();

      return () => {
        cancelled = true;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        unsubscribeFailed?.();
        if (stream) stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      };
  }, [savedId, retryKey]);

  const retry = () => {
    // Reintentar: re-ejecuta el efecto y vuelve a pedir getDisplayMedia
    setStatus('connecting');
    setRetryKey((k) => k + 1);
  };

  const manualPicker = () => {
    // Sin objetivo: Electron abre el selector visual integrado
    void window.electronAPI?.disarmCapture().then(() => {
      navigator.mediaDevices
        .getDisplayMedia({ video: true })
        .then((s) => {
          s.getVideoTracks()[0]?.addEventListener('ended', () => setStatus('error'));
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            void videoRef.current.play().catch(() => { });
            setStatus('live');
          }
        })
        .catch(() => setStatus('error'));
    });
  };

  if (status === 'no-electron') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center p-8">
        <HelpCircle className="w-12 h-12 text-slate-500" />
        <p className="text-sm text-slate-400 max-w-xs">
          La vista previa de apps de escritorio solo está disponible dentro de
          Visión Pantalla (Electron). Abre la app de escritorio aparte para usarla.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cn(
          'w-full h-full object-contain bg-black',
          status !== 'live' && 'opacity-0',
        )}
      />

      {status === 'connecting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Monitor className="w-12 h-12 text-slate-500 animate-pulse" />
          <p className="text-sm text-slate-400">Buscando la ventana de la aplicación…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center gap-3 p-6 text-center z-10">
          <MonitorX className="w-10 h-10 text-rose-400" />
          <p className="text-sm text-slate-300 max-w-xs">{errorText}</p>
          <div className="flex gap-2">
            <button
              onClick={manualPicker}
              className="px-3 py-1.5 rounded-md text-xs bg-indigo-600 text-white hover:bg-indigo-500 flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              Selector manual
            </button>
            <button
              onClick={retry}
              className="px-3 py-1.5 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Indicador de captura viva */}
      {status === 'live' && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/70 backdrop-blur px-2 py-1 rounded text-[10px] text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          En vivo
        </div>
      )}
    </div>
  );
}