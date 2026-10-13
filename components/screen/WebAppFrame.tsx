'use client';

import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface WebAppFrameProps {
  url: string;
  w: number;
  h: number;
  /** Zoom de la web (1 = 100%). Actúa como el Ctrl +/- de Chrome: la web se
   * reordena con el nuevo tamaño ("ventana lógica" w/z × h/z) y se pinta más
   * grande Ocupando el mismo marco w×h. */
  zoomFactor?: number;
}

/**
 * Renderiza una web real en un <iframe> al tamaño exacto de la resolución
 * elegida (para ver su layout responsive como en ese dispositivo). El escalado
 * para caber en el contenedor lo hace ScreenViewport; aquí no se re-escala
 * (el contenedor ya llega al tamaño w×h exacto).
 *
 * El zoom del usuario se aplica al IFRAME con la propiedad CSS zoom: igual
 * que el Ctrl +/− del navegador, la web recibe un viewport lógico de (w/z)×(h/z)
 * y rehace su layout, en lugar de estirar la miniatura. Escalar con transform
 * en el marco NO cambia el viewport que la web percibe; zoom sí.
 *
 * Si la web se muestra en blanco (bloqueo por X-Frame-Options), el usuario
 * puede abrirla en una ventana nativa de Electron con esa misma resolución.
 */
export default function WebAppFrame({ url, w, h, zoomFactor = 1 }: WebAppFrameProps) {
  const [nativeMsg, setNativeMsg] = useState<string | null>(null);
  const z = zoomFactor > 0 ? zoomFactor : 1;

  const openNative = async () => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.openWindow({ url, width: w, height: h });
    setNativeMsg(
      res.ok
        ? `Abierta en ventana nativa de ${w}×${h}`
        : res.error || 'No se pudo abrir la ventana',
    );
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div
        className="rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10 bg-white"
        style={{ width: w, height: h }}
      >
        <iframe
          src={url}
          title={`Vista de ${url}`}
          /* scrolling="no": en el visualizador las scrollbars las pone la web
             si su contenido no cabe (p. ej. por redondeo del zoom fraccional);
             aquí simulant una pantalla fija no deben aparecer nunca. */
          scrolling="no"
          className="border-0 bg-white"
          style={{ zoom: z, width: w / z, height: h / z }}
          allow="accelerometer; camera; microphone; fullscreen"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Resolución real + abrir en ventana nativa */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
        <span className="bg-black/70 backdrop-blur px-2 py-1 rounded text-[10px] font-mono text-slate-300">
          Visualizador: {w}×{h}
        </span>
        {window.electronAPI && (
          <button
            onClick={openNative}
            title="Si la web se ve en blanco, ábrela en una ventana nativa con esta misma resolución"
            className="flex items-center gap-1.5 bg-black/70 backdrop-blur px-2 py-1 rounded text-[10px] text-slate-300 hover:text-white border border-slate-700/50"
          >
            <ExternalLink className="w-3 h-3" />
            Ventana nativa
          </button>
        )}
      </div>

      {nativeMsg && (
        <div className="absolute bottom-2 left-2 z-10 bg-black/70 backdrop-blur px-2 py-1 rounded text-[10px] text-slate-300">
          {nativeMsg}
        </div>
      )}
    </div>
  );
}