// SSim's print view (#1511): the wave window drawn again for paper, on canvases of its own: the names and their values
// at the cursor, every row (not only those scrolled into view), the waves over the time range shown with the time
// ruler, the cursor and the markers; in light colours (the wave window's black background is the screen's). The
// drawing is isim-draw.js's, with the print's sizes and colours; the window itself is not touched.
import { ROW_H, RULER_H, fmtTime } from './isim.js';
import { mountDraw } from './isim-draw.js';
import { esc } from './dom.js';
import { t } from './i18n.js';

// the wave window's colours on paper (the names' and the ruler's: the light theme's, read by the window)
const PAPER = {
  bg: '#ffffff', grid: '#e2e2e2', fg: '#007a1f', x: '#d00000', z: '#0050d0', text: '#000000', cursor: '#e0a800',
  marker: '#0090c8', names: '#ffffff', head1: '#f7f7f7', head2: '#e6e6e6', rulerFg: '#000000', rulerTick: '#555555',
  fgText: '#000000', muted: '#666666', delta: '#333333',
};
const MAX_ROWS = 200;   // (a print of more rows: the first ones)
const SCALE = 2;        // pixels per CSS pixel of the images (sharp on paper)

/**
 * The print view `{ body, css, fit }` of an SSim window: `draw` the arguments of its mountDraw (st, sim, flat, xOf,
 * tOf, itemWave…), `colors` its colours (the theme's), `NW` / `WW` the names' and the waves' widths shown.
 */
export function wavePrintView({ draw, colors, NW, WW }) {
  const { st } = draw;
  const rows = Math.min(draw.flat().length, MAX_ROWS);
  const H = RULER_H + rows * ROW_H + 6;
  const cn = document.createElement('canvas'), cw = document.createElement('canvas');
  cn.width = Math.round(NW * SCALE); cw.width = Math.round(WW * SCALE); cn.height = cw.height = Math.round(H * SCALE);
  const paper = { ...colors, ...PAPER, accent: colors.accent, accentFg: colors.accentFg };
  const { drawNames, drawWaves } = mountDraw({ ...draw, cn, cw, sizes: () => ({ dpr: SCALE, NW, NH: H, WW, WH: H }), colors: () => paper,
    dragRow: () => null });
  // (from the first row, nothing selected: the window's own scroll and selection put back at once)
  const { scrollY, sel } = st;
  st.scrollY = 0; st.sel = new Set();
  try { drawNames(); drawWaves(); } finally { st.scrollY = scrollY; st.sel = sel; }
  const shown = `${fmtTime(st.t0)} – ${fmtTime(draw.tOf(WW))}`;
  const info = [['Cursor', fmtTime(st.cursor)], ['Time shown', shown], ['Simulation time', fmtTime(draw.sim.now)]].map(([k, v]) => `${t(k)}: ${v}`)
    .concat(st.markers.map((m, i) => `${t('Marker')} ${i + 1}: ${fmtTime(m.t)}`));
  if (draw.flat().length > rows) info.push(t(`The first ${rows} of ${draw.flat().length} rows`));
  const img = (c, w, cls) => `<img class="${cls}" src="${c.toDataURL('image/png')}" alt="" style="width:${w}px;height:${H}px">`;
  return {
    fit: { page: true },
    css: `.pv-wave { display: flex; border: 1px solid #999; width: max-content; }
.pv-wave img { display: block; } .pv-wave .pv-names { border-right: 1px solid #999; }
.pv-wave-info { margin: 3mm 0 0; font: 9pt system-ui, -apple-system, "Segoe UI", sans-serif; color: #333; }`,
    body: `<div class="pv-copy" style="width:${Math.ceil(NW + WW + 2)}px"><div class="pv-wave">${img(cn, NW, 'pv-names')}${img(cw, WW, 'pv-waves')}</div>`
      + `<p class="pv-wave-info">${info.map(esc).join('  ·  ')}</p></div>`,
  };
}
