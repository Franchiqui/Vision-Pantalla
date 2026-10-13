'use client';

import React from 'react';
import { Monitor } from 'lucide-react';
import WebAppFrame from './WebAppFrame';
import DesktopPreview from './DesktopPreview';
import { useFitScale } from './use-fit-scale';
import type { SavedApp } from '@/lib/store/apps-store';
import type { ScreenSize } from '@/lib/screen-sizes';

interface ScreenViewportProps {
  activeApp: SavedApp | null;
  isRunning: boolean;
  size: ScreenSize;
  /** Multiplicador sobre el auto-fit (Ctrl +/-; 1 = ajuste automático puro). */
  zoomFactor?: number;
}

/**
 * La "pantalla" del visualizador: una caja con la proporción/resolución
 * elegida, escalada para caber. Dentro se renderiza la app activa real
 * (iframe para web, captura en vivo para escritorio) o un placeholder.
 */
export default function ScreenViewport({ activeApp, isRunning, size, zoomFactor = 1 }: ScreenViewportProps) {
  // La escala (fit) se aplica por DOM (useFitScale no usa estado de React).
  // El zoom del usuario NO multiplica el fit para apps web: ahí actúa como el
  // Ctrl +/- de Chrome dentro del iframe (WebAppFrame, la web reordena su
  // layout). En apps de escritorio (captura fija) el zoom amplía el fit, que
  // es lo único que tiene sentido sobre una imagen.
  const isDesktop = activeApp?.type === 'desktop';
  const fitZoom = isDesktop ? zoomFactor : 1;
  // contentKey: re-medir cuando cambia el contenido (aparece/desaparece el marco)
  const contentKey = `${activeApp?.id ?? 'none'}:${isRunning ? 1 : 0}`;
  const { containerRef, frameRef } = useFitScale<HTMLDivElement, HTMLDivElement>(
    size.w,
    size.h,
    fitZoom,
    contentKey,
  );

  return (
    <div ref={containerRef} className="w-full h-full bg-black flex items-center justify-center">
      {!activeApp ? (
        <div className="flex flex-col items-center justify-center gap-3 text-center p-8">
          <Monitor className="w-14 h-14 text-slate-700" />
          <p className="text-sm text-slate-500 max-w-xs">
            Selecciona o lanza una aplicación para verla aquí, en la resolución
            de pantalla elegida.
          </p>
        </div>
      ) : (
        <div
          ref={frameRef}
          className="overflow-hidden rounded-lg shadow-2xl ring-1 ring-slate-800"
          style={{ width: size.w, height: size.h, transform: 'scale(0.25)' }}
        >
          {activeApp.type === 'web' && activeApp.url ? (
            <WebAppFrame url={activeApp.url} w={size.w} h={size.h} zoomFactor={zoomFactor} />
          ) : activeApp.type === 'desktop' ? (
            isRunning ? (
              <DesktopPreview savedId={activeApp.id} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center p-8 bg-slate-950">
                <Monitor className="w-12 h-12 text-slate-700" />
                <p className="text-sm text-slate-500">
                  “{activeApp.name}” está detenida. Pulsa Lanzar para ejecutarla
                  y ver su ventana aquí.
                </p>
              </div>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}