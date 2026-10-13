// Tamaños de pantalla para el visualizador: resolución exacta del
// dispositivo/monitor y su grupo (para el dropdown).

export type ScreenSizeGroup =
  | 'Escritorio 16:9'
  | 'Escritorio 16:10'
  | 'Escritorio 4:3 / 5:4'
  | 'Ultrawide 21:9'
  | 'Móvil'
  | 'Tablet';

export interface ScreenSize {
  id: string;
  label: string;
  w: number;
  h: number;
  group: ScreenSizeGroup;
}

function make(
  id: string,
  w: number,
  h: number,
  group: ScreenSizeGroup,
  label?: string,
): ScreenSize {
  return { id, label: label ?? `${w}x${h}`, w, h, group };
}

export const screenSizes: ScreenSize[] = [
  // --- Escritorio 16:9 (monitores y portátiles modernos) ---
  make('d-640x360', 640, 360, 'Escritorio 16:9', '640x360 · HD bajo'),
  make('d-1280x720', 1280, 720, 'Escritorio 16:9', '1280x720 · HD'),
  make('d-1366x768', 1366, 768, 'Escritorio 16:9', '1366x768 · Portátil HD'),
  make('d-1600x900', 1600, 900, 'Escritorio 16:9', '1600x900 · HD+'),
  make('d-1920x1080', 1920, 1080, 'Escritorio 16:9', '1920x1080 · Full HD'),
  make('d-2560x1440', 2560, 1440, 'Escritorio 16:9', '2560x1440 · 2K QHD'),
  make('d-3840x2160', 3840, 2160, 'Escritorio 16:9', '3840x2160 · 4K UHD'),
  // --- Escritorio 16:10 ---
  make('d-1280x800', 1280, 800, 'Escritorio 16:10', '1280x800 · WXGA'),
  make('d-1440x900', 1440, 900, 'Escritorio 16:10', '1440x900 · WXGA+'),
  make('d-1680x1050', 1680, 1050, 'Escritorio 16:10', '1680x1050 · WSXGA+'),
  make('d-1920x1200', 1920, 1200, 'Escritorio 16:10', '1920x1200 · WUXGA'),
  // --- Escritorio 4:3 / 5:4 (más antiguos) ---
  make('d-1024x768', 1024, 768, 'Escritorio 4:3 / 5:4', '1024x768 · XGA'),
  make('d-1280x1024', 1280, 1024, 'Escritorio 4:3 / 5:4', '1280x1024 · SXGA'),
  make('d-1600x1200', 1600, 1200, 'Escritorio 4:3 / 5:4', '1600x1200 · UXGA'),
  // --- Ultrawide 21:9 ---
  make('uw-2560x1080', 2560, 1080, 'Ultrawide 21:9', '2560x1080 · UW-FHD'),
  make('uw-3440x1440', 3440, 1440, 'Ultrawide 21:9', '3440x1440 · UW-QHD'),
  // --- Móvil ---
  make('m-360x800', 360, 800, 'Móvil', '360x800 · Móvil pequeño'),
  make('m-390x844', 390, 844, 'Móvil', '390x844 · iPhone 12/13/14'),
  make('m-390x780', 390, 780, 'Móvil', '390x780 · iPhone'),
  make('m-412x915', 412, 915, 'Móvil', '412x915 · Android'),
  make('m-430x932', 430, 932, 'Móvil', '430x932 · iPhone Pro Max'),
  // --- Tablet ---
  make('t-601x962', 601, 962, 'Tablet', '601x962 · Galaxy Tab'),
  make('t-768x1024', 768, 1024, 'Tablet', '768x1024 · iPad vertical'),
  make('t-820x1180', 820, 1180, 'Tablet', '820x1180 · iPad Air'),
  make('t-1024x768', 1024, 768, 'Tablet', '1024x768 · iPad horizontal'),
];

// Índices destacados para botones rápidos (móvil y Full HD)
export const defaultSizeIds = { mobile: 'm-390x844', desktop: 'd-1920x1080' };

export const sizeGroups: ScreenSizeGroup[] = [
  'Escritorio 16:9',
  'Escritorio 16:10',
  'Escritorio 4:3 / 5:4',
  'Ultrawide 21:9',
  'Móvil',
  'Tablet',
];

export function getScreenSize(id: string | null | undefined): ScreenSize {
  return screenSizes.find((s) => s.id === id) ?? screenSizes[4]; // 1920x1080 por defecto
}

export function ratioOf(size: ScreenSize): string {
  return `${size.w}/${size.h}`;
}