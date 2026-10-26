// The Karnaugh map of 5 or 6 variables in 3D (#1407): its 4×4 maps stacked in depth, one layer for each value of the
// map variables in Gray order (neighbouring layers differ in one variable), each group drawn on every layer it covers
// and, between neighbouring layers it covers, as a box through them: a group across maps seen as one solid. Turned
// by dragging (or the arrow keys); Reset view; a cell clicked as in the flat map. The truth table editor
// (web/js/truthtable.js) shows it for 5 or 6 inputs when its 3D box is ticked. Layout and groups: core/logic.js
// kmapLayout, kmapRects. Styles: web/css/truthtable.css (.tt-k3d).

import { h } from './ui.js';
import { kmapRects } from '/core/logic.js';

const C = 40;      // a cell's side (px)
const GAP = 90;    // between layers (px)
let view = { rx: -28, ry: 32 };   // (kept between redraws, as the viewer left it)
let on = false;                   // (the 3D box ticked: every table's map of 5 or 6 inputs in 3D)

/** A cell's value as the map shows it: SOP groups the 1s, its 0s left blank; POS the 0s, its 1s blank (X always, #1494). */
export const cellText = (v, groups) => (v === (groups === 'pos' ? '1' : '0') ? '' : v);
/** Whether the maps are shown in 3D. */
export const k3dOn = () => on;
/** The 3D box of the K-map's options (`changed`: the map drawn again). */
export function k3dBox(changed) {
  const c = h('input', { type: 'checkbox', class: 'tt-k3d-on', checked: on, onchange: () => { on = c.checked; changed(); } });
  return h('label', { class: 'tt-check', title: 'The maps stacked in depth: a group across maps seen as one box' }, c, ' 3D');
}

/**
 * The 3D map in `host`: { layout, col (the output's column), terms (the groups), groups ('sop' | 'pos'), colors, names
 * (the inputs), onCell(mt), title(code) (a layer's label) }.
 */
export function mountKmap3d(host, { layout: L, col, terms, groups, colors, onCell, title }) {
  const rows = L.rowCodes.length, cols = L.colCodes.length, W = cols * C, H = rows * C, depth = (L.maps.length - 1) * GAP;
  const stack = h('div', { class: 'tt-k3d-stack', style: { width: `${W}px`, height: `${H}px` } });
  const apply = () => { stack.style.transform = `translateZ(${-depth / 2}px) rotateX(${view.rx}deg) rotateY(${view.ry}deg) translateZ(${depth / 2}px)`; };
  // the layers: the first in front, each one further back
  L.maps.forEach((m, mi) => {
    const layer = h('div', { class: 'tt-k3d-layer', 'data-map': mi, style: { width: `${W}px`, height: `${H}px`, transform: `translateZ(${-mi * GAP}px)` } },
      h('div', { class: 'tt-k3d-title' }, title(m.code)));
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const mt = L.minterm(mi, i, j), v = col[mt];
      const cell = h('div', { class: `tt-k3d-cell v${v}`, 'data-row': mt, title: `m${mt}`, style: { left: `${j * C}px`, top: `${i * C}px`, width: `${C}px`, height: `${C}px` } },
        h('span', { class: 'tt-k3d-m' }, String(mt)), h('span', { class: 'tt-k3d-v' }, cellText(v, groups)));
      cell.addEventListener('click', () => onCell(mt));
      layer.append(cell);
    }
    stack.append(layer);
  });
  // the groups: a rectangle on each layer, a box between neighbouring layers of the same group (the first and last of
  // four, neighbours too, are said by their rectangles alone)
  terms.forEach((t, ti) => {
    const color = colors[ti % colors.length], ins = 3 + (ti % 4) * 3;
    const rects = kmapRects(L, t);
    for (const rc of rects) {
      const x = rc.c0 * C + ins, y = rc.r0 * C + ins, w = (rc.c1 - rc.c0 + 1) * C - 2 * ins, hh = (rc.r1 - rc.r0 + 1) * C - 2 * ins;
      const z = -rc.map * GAP;
      stack.append(h('div', { class: 'tt-k3d-group', 'data-term': ti, 'data-map': rc.map,
        style: { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hh}px`, borderColor: color, background: `${color}26`, transform: `translateZ(${z + 1}px)` } }));
      const next = rects.find(o => o.map === rc.map + 1 && o.r0 === rc.r0 && o.r1 === rc.r1 && o.c0 === rc.c0 && o.c1 === rc.c1);
      if (!next) continue;
      // the box's four sides from this layer to the next one
      const side = (left, top, width, height, tf) => stack.append(h('div', { class: 'tt-k3d-side', 'data-term': ti,
        style: { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, background: `${color}33`, borderColor: color, transform: tf } }));
      side(x, y, w, GAP, `translateZ(${z}px) rotateX(-90deg)`);                   // top (towards the next layer, back)
      side(x, y + hh, w, GAP, `translateZ(${z}px) rotateX(-90deg)`);              // bottom
      side(x, y, GAP, hh, `translateZ(${z}px) rotateY(90deg)`);                   // left
      side(x + w, y, GAP, hh, `translateZ(${z}px) rotateY(90deg)`);               // right
    }
  });
  apply();
  const scene = h('div', { class: 'tt-k3d', tabindex: '0', title: 'Drag (or the arrow keys) to turn the maps', style: { height: `${H + depth * 0.7 + 90}px` } }, stack);
  // turned by dragging, or by the arrow keys
  let drag = null;
  scene.addEventListener('pointerdown', e => { if (e.target.closest('.tt-k3d-cell')) return; drag = { x: e.clientX, y: e.clientY, ...view }; scene.setPointerCapture?.(e.pointerId); });
  scene.addEventListener('pointermove', e => { if (!drag) return; view = { ry: drag.ry + (e.clientX - drag.x) / 2, rx: Math.max(-85, Math.min(85, drag.rx - (e.clientY - drag.y) / 2)) }; apply(); });
  scene.addEventListener('pointerup', () => { drag = null; });
  scene.addEventListener('keydown', e => {
    const d = { ArrowLeft: [0, -10], ArrowRight: [0, 10], ArrowUp: [10, 0], ArrowDown: [-10, 0] }[e.key];
    if (!d) return;
    e.preventDefault();
    view = { rx: Math.max(-85, Math.min(85, view.rx + d[0])), ry: view.ry + d[1] };
    apply();
  });
  const reset = h('button', { type: 'button', class: 'btn tt-k3d-reset', onclick: () => { view = { rx: -28, ry: 32 }; apply(); } }, 'Reset view');
  host.append(scene, h('div', { class: 'tt-k3d-bar' }, reset, h('span', { class: 'hint' }, L.maps.length > 2 ? 'The layers in Gray order: neighbouring layers differ in one variable, and the last one is a neighbour of the first.' : 'Neighbouring layers differ in one variable.')));
  return { view: () => ({ ...view }) };
}

/** The K-map in `host`: its flat `svg`, or its maps in 3D (5 or 6 inputs, the 3D box ticked: added to `options`). */
export function placeKmap({ host, options, svg, changed, ...map }) {
  if (map.layout.n >= 5) options.append(k3dBox(changed));
  if (map.layout.n >= 5 && on) mountKmap3d(host, map);
  else host.append(svg);
}
