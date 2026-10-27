import type { FontChoice } from '~/engine/types';
import { PDF_FONT } from '~/engine/theme';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';
import serif400 from '@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2?url';
import serif600 from '@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2?url';
import serif700 from '@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff2?url';
import kalam400 from '@fontsource/kalam/files/kalam-latin-400-normal.woff2?url';
import kalam700 from '@fontsource/kalam/files/kalam-latin-700-normal.woff2?url';

export type ExportFormat = 'png' | 'jpeg' | 'svg' | 'pdf';

const FONT_FILES: Record<FontChoice, { family: string; files: [number, string][] }> = {
  sans: {
    family: 'Inter',
    files: [
      [400, inter400],
      [500, inter500],
      [600, inter600],
      [700, inter700],
    ],
  },
  serif: {
    family: 'Source Serif 4',
    files: [
      [400, serif400],
      [600, serif600],
      [700, serif700],
    ],
  },
  hand: {
    family: 'Kalam',
    files: [
      [400, kalam400],
      [700, kalam700],
    ],
  },
};

const fontCache = new Map<FontChoice, Promise<string>>();

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** @font-face rules with the font files inlined, so exports look identical everywhere. */
function fontFaceCSS(font: FontChoice): Promise<string> {
  let p = fontCache.get(font);
  if (!p) {
    const spec = FONT_FILES[font];
    p = Promise.all(
      spec.files.map(async ([weight, url]) => {
        const res = await fetch(url);
        const b64 = toBase64(await res.arrayBuffer());
        return `@font-face{font-family:'${spec.family}';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
      }),
    ).then((rules) => rules.join(''));
    p.catch(() => fontCache.delete(font));
    fontCache.set(font, p);
  }
  return p;
}

/** Copy of the SVG without editor-only UI (handles, hit areas, selection marks). */
function cleanClone(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-ui]').forEach((n) => n.remove());
  clone.querySelectorAll('[style]').forEach((n) => n.removeAttribute('style'));
  clone.removeAttribute('style');
  clone.removeAttribute('class');
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return clone;
}

function size(svg: SVGSVGElement) {
  const vb = svg.viewBox.baseVal;
  return { w: vb.width, h: vb.height };
}

export async function svgMarkup(svg: SVGSVGElement, font: FontChoice, embedFonts = true): Promise<string> {
  const clone = cleanClone(svg);
  if (embedFonts) {
    const css = await fontFaceCSS(font).catch(() => '');
    if (css) {
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = css;
      clone.insertBefore(style, clone.firstChild);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

export async function rasterize(
  svg: SVGSVGElement,
  opts: { scale: number; format: 'png' | 'jpeg'; font: FontChoice },
): Promise<Blob> {
  const { w, h } = size(svg);
  const markup = await svgMarkup(svg, opts.font);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.width = w;
    img.height = h;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render the diagram to an image.'));
      img.src = url;
    });
    // Give embedded fonts a moment to decode inside the SVG image.
    await img.decode?.().catch(() => undefined);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * opts.scale);
    canvas.height = Math.round(h * opts.scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    if (opts.format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const type = opts.format === 'png' ? 'image/png' : 'image/jpeg';
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed.'))), type, 0.95),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function toPdf(svg: SVGSVGElement, font: FontChoice): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const { w, h } = size(svg);
  const clone = cleanClone(svg);
  // The PDF uses the standard PDF fonts; drop the white text halos (not supported).
  clone.setAttribute('font-family', PDF_FONT[font]);
  clone.querySelectorAll('[data-halo]').forEach((n) => {
    n.removeAttribute('stroke');
    n.removeAttribute('stroke-width');
    n.removeAttribute('paint-order');
    n.removeAttribute('stroke-linejoin');
  });
  // jsPDF's standard fonts only come in normal/bold.
  clone.querySelectorAll('[font-weight]').forEach((n) => {
    const w = Number(n.getAttribute('font-weight'));
    if (w >= 600) n.setAttribute('font-weight', 'bold');
    else n.removeAttribute('font-weight');
  });
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden';
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    const doc = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'pt', format: [w, h] });
    await svg2pdf(clone, doc, { x: 0, y: 0, width: w, height: h });
    return doc.output('blob');
  } finally {
    holder.remove();
  }
}

export async function exportBlob(
  svg: SVGSVGElement,
  format: ExportFormat,
  opts: { scale: number; font: FontChoice },
): Promise<Blob> {
  switch (format) {
    case 'svg':
      return new Blob([await svgMarkup(svg, opts.font)], { type: 'image/svg+xml;charset=utf-8' });
    case 'pdf':
      return toPdf(svg, opts.font);
    default:
      return rasterize(svg, { scale: opts.scale, format, font: opts.font });
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const canCopyImage = () =>
  typeof navigator !== 'undefined' && !!navigator.clipboard && typeof ClipboardItem !== 'undefined';

export async function copyImage(svg: SVGSVGElement, scale: number, font: FontChoice) {
  // Pass a promise so Safari keeps the user-gesture context.
  const item = new ClipboardItem({ 'image/png': rasterize(svg, { scale, format: 'png', font }) });
  await navigator.clipboard.write([item]);
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[_^{}]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'diagram'
  );
}
