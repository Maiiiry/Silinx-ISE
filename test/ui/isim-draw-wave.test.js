// UI: ISim's drawing of one wave (#405: web/js/isim-draw-wave.js out of mountDraw in isim-draw.js), mounted alone in the
// page on a canvas of its own, 10 ps a pixel, read back from its pixels: a scalar's 0, 1, X (a red box) and Z (the middle
// line, in the Z colour); a bus's hexagons with their values centred, X in red, and a burst of transitions in one pixel
// drawn as a dense block; a signal with no wave: its value as text.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#405 ISim, one wave drawn: a scalar\'s levels, X and Z; a bus\'s values, X and a dense burst; no wave', E, async (page) => {
  const out = await page.eval(async () => {
    const { mountWaveDraw } = await import('/js/isim-draw-wave.js');
    const V = await import('/core/values.js');
    const c = document.createElement('canvas');
    c.width = 400; c.height = 60;
    document.body.append(c);
    const g = c.getContext('2d');
    g.fillStyle = '#000000'; g.fillRect(0, 0, 400, 60);
    g.textBaseline = 'middle';
    const colors = { fg: '#00ff00', x: '#ff0000', z: '#4080ff', text: '#ffffff', font: 'Arial' };
    const setFont = (ctx, size = 12) => { ctx.font = `${size}px Arial`; };
    const fitText = (ctx, s, maxW) => (ctx.measureText(s).width <= maxW ? s : '');
    const { drawItem } = mountWaveDraw({ WW: () => 400, colors: () => colors, fitText, setFont,
      xOf: (t) => t / 10, tOf: (x) => x * 10, itemWave: (it) => it.row.sig.wave || null,
      itemType: (it) => it.row.sig.t, itemRadix: (it) => it.row.radix });
    const logic = (w) => ({ kind: 'logic', w, s: false });
    const Z = V.mk(1, 1n, 1n);
    // row 0: 0 until 1 ns, 1 until 2 ns, X until 3 ns, Z
    const a = { t: logic(1), wave: { t: [0, 1000, 2000, 3000], v: [V.ZERO, V.ONE, V.X1, Z] } };
    // row 1 (y 20): 3 until 2 ns, X until 3 ns, then a burst of transitions inside one pixel (3000..3008 ps), 12
    const q = { t: { ...logic(4), left: 3, right: 0 }, wave: { t: [0, 2000, 3000, 3002, 3004, 3006, 3008], v: [V.fromInt(3, 4, false), V.mk(4, 0n, 15n),
      V.fromInt(1, 4, false), V.fromInt(2, 4, false), V.fromInt(5, 4, false), V.fromInt(7, 4, false), V.fromInt(12, 4, false)] } };
    // row 2 (y 40): an array signal, not plotted
    const arr = { t: logic(1), val: [V.ZERO, V.ONE], wave: null };
    drawItem(g, { row: { sig: a, radix: 'default' }, bit: null }, 0, 0, 4000);
    drawItem(g, { row: { sig: q, radix: 'hex' }, bit: null }, 20, 0, 4000);
    drawItem(g, { row: { sig: arr, radix: 'default' }, bit: null }, 40, 0, 4000);
    const px = (x, y) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)].join(',');
    // the text pixels of a box: how many are lit
    const lit = (x0, y0, x1, y1) => { const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) n++; return n; };
    return {
      // the scalar: 0 low (y 16), 1 high (y 4), X a red box (its top and bottom lines red, tinted inside), Z the middle line
      low: [px(50, 16), px(50, 4)], high: [px(150, 4), px(150, 16)], x: [px(250, 4), px(250, 16), px(250, 10)], z: [px(350, 10), px(350, 4)],
      // the bus: its top and bottom lines, 3 written in the middle of 0..200, the X segment red (tinted, its X in red: no
      // bright pixel), the burst a block
      bus: [px(50, 24), px(50, 36)], label: lit(90, 24, 112, 36) > 0, nolabel: lit(20, 26, 60, 34),
      busX: [px(250, 24), px(215, 30), lit(240, 26, 260, 34) > 0], dense: [px(300, 26), px(300, 34)], after: px(350, 24),
      // the array: its value as text at the row's start
      arr: lit(4, 44, 120, 56) > 0,
    };
  });
  assert.deepEqual(out, {
    low: ['0,255,0', '0,0,0'], high: ['0,255,0', '0,0,0'], x: ['255,0,0', '255,0,0', '71,0,0'], z: ['64,128,255', '0,0,0'],
    bus: ['0,255,0', '0,255,0'], label: true, nolabel: 0,
    busX: ['255,0,0', '56,0,0', false], dense: ['0,255,0', '0,255,0'], after: '0,255,0',
    arr: true,
  });
});
