// UI: the parts of the RTL schematic viewer (#405: out of mountSchematic in web/js/schematic-view.js), the viewer
// mounted alone in the page on a design of its own: the rendering (schematic-render.js: the ports, the gate, the
// register, their nets), the hover and the selection (schematic-hover.js: the element under the pointer marked, a
// click reported to onSelect, the tooltip of a node and of a net) and the export (schematic-export.js: a standalone
// SVG of the same drawing).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const VHDL = `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk, a, b : in std_logic; y, q : out std_logic); end top;
architecture rtl of top is
begin
  y <= a and b;
  process (clk) begin if rising_edge(clk) then q <= a; end if; end process;
end rtl;
`;

uiTest('#405 RTL schematic viewer parts: the rendering, the hover and its tooltip, the selection, the export', E, async (page) => {
  const out = await page.eval(async (text) => {
    const { compile, elaborate } = await import('/core/compile.js');
    const { buildSchematic } = await import('/core/schematic.js');
    const { mountSchematic } = await import('/js/schematic-view.js');
    const host = document.createElement('div');
    host.style.cssText = 'position: fixed; left: 0; top: 0; width: 700px; height: 450px; z-index: 9999; background: white';
    document.body.append(host);
    const selected = [];
    const view = mountSchematic(host, { onSelect: (item) => selected.push(item && (item.kind === 'node' ? `node ${item.node.kind} ${item.node.label || item.node.gate}` : `net ${item.name} [${item.w}]`)) });
    const design = elaborate(compile([{ path: 'top.vhd', lang: 'vhdl', text }]), 'top');
    await view.show(buildSchematic(design.top), { title: 'top' });
    const r = {};
    const nodes = [...host.querySelectorAll('.sch-vp .node')];
    r.kinds = nodes.map((n) => [...n.classList].find((c) => c.startsWith('k-'))).sort();
    r.nets = [...new Set([...host.querySelectorAll('.sch-vp [data-net]')].map((e) => e.dataset.net))].sort();
    // the hover: the AND gate under the pointer, marked; its tooltip after a moment
    const gate = host.querySelector('.sch-vp .node.k-gate');
    const at = (el) => { const b = el.getBoundingClientRect(); return { clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, bubbles: true, button: 0, pointerId: 1 }; };
    gate.querySelector('.nodehit').dispatchEvent(new PointerEvent('pointermove', at(gate)));
    r.hover = gate.classList.contains('hover');
    await new Promise((res) => setTimeout(res, 500));
    const tip = host.querySelector('.sch-tip');
    r.tip = [tip.hidden, tip.textContent];
    // a click: selected, reported
    gate.querySelector('.nodehit').dispatchEvent(new PointerEvent('pointerdown', at(gate)));
    gate.querySelector('.nodehit').dispatchEvent(new PointerEvent('pointerup', at(gate)));
    r.sel = [gate.classList.contains('sel'), view.selection];
    // a net: its tooltip and its selection
    const wire = host.querySelector('.sch-vp [data-net="n:top.y"]');
    wire.dispatchEvent(new PointerEvent('pointermove', at(wire)));
    // (the click hid the tooltip: the next one comes after a moment again)
    await new Promise((res) => setTimeout(res, 500));
    r.netTip = [tip.hidden, tip.textContent];
    wire.dispatchEvent(new PointerEvent('pointerdown', at(wire)));
    wire.dispatchEvent(new PointerEvent('pointerup', at(wire)));
    r.selected = selected;
    // the pointer leaves: no hover, no tooltip
    host.querySelector('.sch-svg').dispatchEvent(new PointerEvent('pointerleave', {}));
    r.left = [host.querySelectorAll('.sch-vp .hover').length, tip.hidden];
    // the export: the same nodes, a standalone SVG with its title and size
    const svg = view.exportSvg();
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    r.export = [doc.documentElement.nodeName, doc.querySelector('title').textContent, doc.querySelectorAll('.node').length === nodes.length,
      +doc.documentElement.getAttribute('width') > 100, +doc.documentElement.getAttribute('height') > 50, /\.sch-svg/.test(doc.querySelector('style').textContent)];
    view.destroy(); host.remove();
    return r;
  }, VHDL);
  assert.deepEqual(out.kinds, ['k-gate', 'k-in', 'k-in', 'k-in', 'k-out', 'k-out', 'k-reg']);
  assert.deepEqual(out.nets, ['n:top.a', 'n:top.b', 'n:top.clk', 'n:top.q', 'n:top.y']);
  assert.equal(out.hover, true);
  assert.deepEqual(out.tip, [false, 'and &top.vhd:5Double-click to open source']);
  assert.deepEqual(out.sel, [true, 'N:g5']);
  assert.deepEqual(out.netTip, [false, 'net ywidth 1 bit, 1 loadtop.ydriver: and']);
  assert.deepEqual(out.selected, ['node gate &', 'net y [1]']);
  assert.deepEqual(out.left, [0, true]);
  assert.deepEqual(out.export, ['svg', 'top', true, true, true, true]);
});
