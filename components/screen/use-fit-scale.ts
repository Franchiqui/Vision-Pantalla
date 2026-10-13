'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Escala "fit to contain": dado un tamaño virtual (w x h) y su contenedor,
 * aplica sobre frameRef la transform para que el contenido quepa entero y
 * centrado.
 *
 * IMPORTANTE: la escala se escribe directamente en el DOM (style.transform del
 * marco), NO en estado de React. Antes se usaba useState + ResizeObserver y,
 * durante el arranque (maximizar ventana, asentamiento del layout), el RO
 * disparaba setScale en ráfaga hasta agotar "Maximum update depth exceeded".
 * Sin setState ese bucle es imposible; el zoom del usuario (zoomFactor) se
 * combina en la misma transform.
 */
export function useFitScale<T extends HTMLElement, S extends HTMLElement>(
  w: number,
  h: number,
  zoomFactor: number = 1,
  contentKey: string = '',
) {
  const containerRef = useRef<T | null>(null);
  const frameRef = useRef<S | null>(null);
  const rafRef = useRef(0);
  const lastScaleRef = useRef(-1);
  // Valor por render sin provocar medida: measure lo lee del ref
  const zoomRef = useRef(zoomFactor);
  zoomRef.current = zoomFactor;

  const measure = useCallback(() => {
    const container = containerRef.current;
    const frame = frameRef.current;
    if (!container || !frame) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw <= 0 || ch <= 0 || w <= 0 || h <= 0) return;
    const scale = Math.min(cw / w, ch / h) * zoomRef.current;
    if (Math.abs(lastScaleRef.current - scale) < 0.0001) return;
    lastScaleRef.current = scale;
    frame.style.transform = `scale(${scale})`;
  }, [w, h]);

  // Medir antes del primer paint (evita ver el marco gigante sin escalar)
  useLayoutEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      // Coalescer ráfagas: una medida por frame
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [measure]);

  // El zoom o el contenido cambian sin redimensionar el contenedor:
  // reaplicar transform sobre el marco recién montado. Se resetea lastScaleRef
  // porque el elemento puede ser nuevo (empieza sin transform aplicado).
  useEffect(() => {
    lastScaleRef.current = -1;
    measure();
  }, [measure, zoomFactor, contentKey]);

  return { containerRef, frameRef };
}