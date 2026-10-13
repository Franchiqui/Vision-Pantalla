// Puente seguro exposeInMainWorld ↔ electron/preload.js
export interface LaunchPayload {
  exePath: string;
  args?: string;
  appId?: string | null;
}

export interface LaunchResult {
  ok: boolean;
  pid?: number;
  error?: string;
}

export interface StopPayload {
  pid: number;
}

export interface CaptureFailedPayload {
  appId: string | null;
}

export interface ProbeUrlResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface CheckPathResult {
  exists: boolean;
  isFile: boolean;
}

export interface MonitorInfo {
  id: string;
  label: string;
  primary: boolean;
  dipW: number;
  dipH: number;
  physW: number;
  physH: number;
  scaleFactor: number;
}

export interface ScreenInfoResult {
  ok: boolean;
  primaryKey: string | null;
  monitors: MonitorInfo[];
}

export interface ZoomProfileResult {
  ok: boolean;
  canceled?: boolean;
  filePath?: string;
  zooms?: Record<string, number>;
  error?: string;
}

export interface ZoomProfileExportPayload {
  zooms: Record<string, number>;
}

export interface ZoomProfileSavePayload extends ZoomProfileExportPayload {
  /** Ruta absoluta del fichero que se exportó la última vez (guardado silencioso). */
  filePath: string;
}

export interface ZoomApplyResult {
  ok: boolean;
  canceled?: boolean;
  /** Carpeta del proyecto elegida en el diálogo. */
  folder?: string;
  /** Ruta del layout raíz que se editó (app/layout.tsx etc.). */
  layoutPath?: string;
  /** Ruta del snippet instalado (public/VisionPantalla-zooms.js). */
  snippetPath?: string;
  /** Se añadió el import de next/script porque no existía. */
  importAdded?: boolean;
  /** Se añadió el bloque <Script> al layout (si ya estaba, solo se refresca el .js). */
  tagAdded?: boolean;
  error?: string;
}

export interface ElectronAPI {
  platform: string;
  versions: Record<string, string>;
  launchApp(payload: LaunchPayload): Promise<LaunchResult>;
  stopApp(payload: StopPayload): Promise<{ ok: boolean; error?: string }>;
  checkPath(payload: { path: string }): Promise<CheckPathResult>;
  probeUrl(payload: { url: string; timeoutMs?: number }): Promise<ProbeUrlResult>;
  openWindow(payload: { url: string; width?: number; height?: number }): Promise<{ ok: boolean; error?: string }>;
  armCapture(payload: { appId: string }): Promise<{ ok: boolean }>;
  disarmCapture(): Promise<{ ok: boolean }>;
  onCaptureFailed(callback: (payload: CaptureFailedPayload) => void): () => void;
  getScreenInfo(): Promise<ScreenInfoResult>;
  exportZoomProfile(payload: ZoomProfileExportPayload): Promise<ZoomProfileResult>;
  importZoomProfile(): Promise<ZoomProfileResult>;
  saveZoomProfile(payload: ZoomProfileSavePayload): Promise<ZoomProfileResult>;
  applyZoomToApp(payload: ZoomProfileExportPayload): Promise<ZoomApplyResult>;
  onMonitorChanged(callback: () => void): () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};