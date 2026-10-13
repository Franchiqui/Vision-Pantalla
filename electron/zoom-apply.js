/* Instala el zoom automático de Visión Pantalla en un proyecto Next.js:
 *  1) copia el snippet VisionPantalla-zooms.js a <proyecto>/public/
 *  2) añade el <Script strategy="beforeInteractive"> al layout raíz
 *     (dentro de <body>: un <script> colgando de <html> da error de
 *     hidratación en Next.js) y el import de next/script si falta.
 * Idempotente: si la app ya lo tiene, no duplica nada; siempre refresca el
 * snippet con el último mapa de zooms exportado.
 *
 * Módulo aislado (sin Electron) para poder probarlo con Node directamente.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const fsp = fs.promises;

const MARKER = 'VisionPantalla-zooms.js';

/** Busca el layout raíz: app/ o src/, con .tsx/.jsx/.ts/.js */
async function findRootLayout(folder) {
  for (const dir of ['app', 'src/app']) {
    for (const name of ['layout.tsx', 'layout.jsx', 'layout.ts', 'layout.js']) {
      const p = path.join(folder, dir, name);
      try {
        const st = await fsp.stat(p);
        if (st.isFile()) return p;
      } catch {
        /* siguiente candidato */
      }
    }
  }
  return null;
}

/** Bloque JSX a insertar, con la sangría de la línea de cierre </body>. */
function scriptBlock(indent) {
  return (
    '{/* Zoom automático por pantalla calibrado en Visión Pantalla:\n' +
    indent +
    '  detecta la resolución del visitante y aplica su zoom guardado.\n' +
    indent +
    '  beforeInteractive = se aplica antes del primer pintado del HTML.\n' +
    indent +
    '  (Dentro de <body>: un <script> colgando de <html> da error de\n' +
    indent +
    '  hidratación en Next.js.) */}\n' +
    indent +
    '<Script src="/' +
    MARKER +
    '" strategy="beforeInteractive" />\n' +
    indent
  );
}

/**
 * @param {string} folderPath  Carpeta del proyecto del usuario
 * @param {string} snippetJs   Contenido del VisionPantalla-zooms.js a instalar
 */
async function applyZoomToProject(folderPath, snippetJs) {
  const layoutPath = await findRootLayout(folderPath);
  if (!layoutPath) {
    return {
      ok: false,
      error:
        'No encontré el layout raíz (app/layout.tsx|.jsx|.ts|.js, o en src/app). ¿Es esa la carpeta del proyecto?',
    };
  }

  // 1) Snippet siempre actualizado en public/
  const publicDir = path.join(folderPath, 'public');
  await fsp.mkdir(publicDir, { recursive: true });
  const snippetPath = path.join(publicDir, MARKER);
  await fsp.writeFile(snippetPath, snippetJs, 'utf8');

  // 2) Layout: import + <Script>
  let src = await fsp.readFile(layoutPath, 'utf8');
  const result = { ok: true, layoutPath, snippetPath, importAdded: false, tagAdded: false };

  const hasScriptImport = /from\s+['"]next\/script['"]/.test(src);
  if (!hasScriptImport) {
    src = "import Script from 'next/script';\n" + src;
    result.importAdded = true;
  }

  if (!src.includes(MARKER)) {
    const idx = src.lastIndexOf('</body>');
    if (idx === -1) {
      return { ok: false, error: 'No encontré </body> en ' + layoutPath };
    }
    const lineStart = src.lastIndexOf('\n', idx) + 1;
    const linePrefix = src.slice(lineStart, idx);
    const indent = /^[ \t]*/.exec(linePrefix)[0];
    src = src.slice(0, idx) + scriptBlock(indent) + src.slice(idx);
    result.tagAdded = true;
    await fsp.writeFile(layoutPath, src, 'utf8');
  }

  return result;
}

module.exports = { applyZoomToProject, findRootLayout };