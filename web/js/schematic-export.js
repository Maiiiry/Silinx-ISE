// The schematic viewer's export (#405: out of mountSchematic in schematic-view.js): the drawing as a standalone SVG
// file, with the viewer's style rules (the theme's variables resolved) and its background.
import { esc } from './dom.js';
import { SVGNS, r1 } from './schematic-view.js';

/** { exportSvg } of mountSchematic (bounds(), content(), graph(), meta(): its current values). */
export function mountSchExport(ctx) {
  const {
    container, bounds, content, graph, meta
  } = ctx;

  // ---------------- export
  function exportSvg() {
    const pad = 20;
    const b = bounds().w ? bounds() : { x: 0, y: 0, w: 200, h: 100 };
    const cs = getComputedStyle(container);
    const resolve = txt => txt.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_, v, fb) => (cs.getPropertyValue(v).trim() || fb || 'black'));
    let css = '';
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules || []) {
        if (r.selectorText && r.selectorText.includes('.sch-svg ') && !/:hover|\.hover|\.sel\b|\.panning|\.sch-lod/.test(r.selectorText)) {
          css += resolve(r.cssText.replace(/\.sch-view\s+/g, '')) + '\n';
        }
      }
    }
    const bg = cs.getPropertyValue('--sch-bg').trim() || '#fff';
    const W = Math.ceil(b.w + 2 * pad), H = Math.ceil(b.h + 2 * pad);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="${SVGNS}" class="sch-svg" width="${W}" height="${H}" viewBox="${r1(b.x - pad)} ${r1(b.y - pad)} ${W} ${H}">`
      + `<title>${esc(meta().title || graph()?.title || 'schematic')}</title><style>${css}</style>`
      + `<rect x="${r1(b.x - pad)}" y="${r1(b.y - pad)}" width="${W}" height="${H}" fill="${bg}"/>`
      + `<g class="sch-vp">${content()}</g></svg>`;
  }

  return { exportSvg };
}
