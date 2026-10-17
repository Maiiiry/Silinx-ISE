// Helper of the theme tests: the visible text whose contrast with its background is too low.

/** Installs window.__lowContrast(root, min, skip): the visible elements whose own text has a WCAG
 *  contrast ratio below `min` with the colour behind it (semi-transparent backgrounds composited over
 *  their ancestors', a gradient taken by its first colour, the page's background when none is
 *  opaque). The text of a field is its value (an empty field too: what is typed in it must be
 *  readable). SVG drawings, the editor's text (syntax colours) and the elements in `skip` (a
 *  selector) are left out. */
export const CONTRAST = `window.__lowContrast = (root = document.body, min = 3, skip = '') => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (e) => {
    const layers = [];
    for (let x = e; x; x = x.parentElement) {
      const cs = getComputedStyle(x);
      const g = cs.backgroundImage.includes('gradient(') ? parse(cs.backgroundImage) : null;
      const b = g && g.a >= 1 ? g : parse(cs.backgroundColor);
      if (b && b.a > 0) { layers.push(b); if (b.a >= 1) break; }
    }
    let out = (layers.length && layers[layers.length - 1].a >= 1) ? layers.pop() : (parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255 });
    for (const l of layers.reverse()) out = { r: l.r * l.a + out.r * (1 - l.a), g: l.g * l.a + out.g * (1 - l.a), b: l.b * l.a + out.b * (1 - l.a) };
    return out;
  };
  const bad = [];
  for (const e of root.querySelectorAll('*')) {
    if (!e.getClientRects().length || ['SCRIPT', 'STYLE', 'OPTION'].includes(e.tagName) || e.closest('svg,.cm-editor') || (skip && e.closest(skip))) continue;
    const field = e.matches('textarea, select, input:not([type]), input[type=text], input[type=number], input[type=search], input[type=email], input[type=password]');
    const own = field ? (e.tagName === 'SELECT' ? e.selectedOptions[0]?.textContent : e.value) || \`(\${e.tagName.toLowerCase()})\`
      : [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!own) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const fg = parse(cs.color), bg = bgOf(e), L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (ratio < min) bad.push({ ratio: +ratio.toFixed(2), tag: e.tagName, cls: String(e.className).slice(0, 40), fg: cs.color, bg: \`rgb(\${bg.r | 0},\${bg.g | 0},\${bg.b | 0})\`, text: own.slice(0, 50) });
  }
  return bad;
};`;
