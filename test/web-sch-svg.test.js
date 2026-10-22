// The schematic's drawing in SVG (web/js/sch-svg.js, #405: out of sch-editor.js): a symbol placed and turned where
// the document's geometry (core/schdoc.js: symbolPins, symbolBox) has its pins and box, a pin's lead ending at the
// pin, an I/O marker on each side, the hops of a wire over its crossings, the runs of wires in line, the datasheet
// drawing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import { symbolDef, symbolPins, symbolBox, portBox } from '../core/schdoc.js';

const { symbolSvg, symbolDrawingSvg, portSvg, bodySvg, hopPath, inLineRuns, wireRun, r1 } = await import('../web/js/sch-svg.js');

const MODULES = { sub: { name: 'sub', lang: 'vhdl', ports: [{ name: 'a', dir: 'in', width: 1 }, { name: 'd', dir: 'in', width: 8 }, { name: 'q', dir: 'out', width: 8 }] } };
const TYPES = [['and2'], ['nor4'], ['and3b2'], ['inv'], ['fdce'], ['mux4'], ['module', { module: 'sub' }]];
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

test('#405 schematic drawing: a symbol, turned and mirrored, drawn where the document has its pins and box', () => {
  for (const [type, params] of TYPES) {
    for (const rot of [0, 90, 180, 270]) {
      for (const mirror of [false, true]) {
        const sym = { id: 'S1', type, x: 200, y: 100, rot, mirror, name: 'U1', params: params || {} };
        const def = symbolDef(sym, MODULES), what = `${type} rot ${rot}${mirror ? ' mirrored' : ''}`;
        const svg = symbolSvg(sym, def, ' sel');
        assert.match(svg, /^<g class="sym sel" data-kind="sym" data-id="S1">/, what);
        // the hitbox: the symbol's box
        const box = symbolBox(sym, MODULES, def), hit = attrs(svg.match(/<rect class="hitbox"[^>]*>/)[0]);
        assert.deepEqual([+hit.x, +hit.y, +hit.width, +hit.height], [box.x, box.y, box.w, box.h], what);
        // the body's transform takes each pin, in local coordinates, where the document has it
        const [a, b, c, d, e, f] = svg.match(/transform="matrix\(([^)]*)\)"/)[1].split(',').map(Number);
        for (const p of symbolPins(sym, MODULES, def)) {
          assert.deepEqual([a * p.lx + c * p.ly + e, b * p.lx + d * p.ly + f], [p.x, p.y], `${what}: pin ${p.name}`);
        }
      }
    }
    // in the body, a lead ends at each pin, a bus's drawn as a bus
    const sym = { id: 'S1', type, x: 0, y: 0, rot: 0, mirror: false, name: 'U1', params: params || {} };
    const def = symbolDef(sym, MODULES);
    const leads = [...bodySvg(sym, def).matchAll(/<line class="pin( bus)?"[^>]*>/g)].map((m) => ({ bus: !!m[1], ...attrs(m[0]) }));
    for (const p of def.pins) {
      const l = leads.find((x) => (+x.x1 === r1(p.x) && +x.y1 === r1(p.y)) || (+x.x2 === r1(p.x) && +x.y2 === r1(p.y)));
      assert.ok(l, `${type}: a lead to ${p.name}`);
      assert.equal(l.bus, (p.width || 1) > 1, `${type}: ${p.name}'s lead`);
    }
  }
});

test('#405 schematic drawing: the datasheet drawing (the pin names of a gate), an I/O marker on each side', () => {
  const sym = { id: 'S1', type: 'and2', x: 300, y: 300, rot: 90, mirror: true, name: 'U7', params: {} };
  const def = symbolDef(sym);
  const svg = symbolDrawingSvg(sym, def);
  // (placed at the origin, not turned: its size and the names of its pins)
  const vb = attrs(svg.match(/<svg [^>]*>/)[0]);
  assert.equal(vb.viewBox, `-34 -22 ${def.w + 68} ${def.h + 44}`);
  assert.equal(+vb.width, Math.round((def.w + 68) * 1.6));
  assert.deepEqual([...svg.matchAll(/<text class="pname"[^>]*>([^<]*)</g)].map((m) => m[1]), def.pins.map((p) => p.name));
  assert.doesNotMatch(svg, /U7/);
  // I/O markers: the pin from the connection point, the name with its bus range, the box of the document
  for (const [dir, side] of [['in', undefined], ['out', undefined], ['inout', undefined], ['in', 'N'], ['out', 'S']]) {
    const p = { id: 'P1', name: 'd', dir, width: 8, x: 100, y: 200, ...(side ? { side } : {}) };
    const svg2 = portSvg(p, ' sel');
    assert.match(svg2, /^<g class="port sel" data-kind="port" data-id="P1">/);
    const pin = attrs(svg2.match(/<line class="pin bus"[^>]*>/)[0]);
    assert.deepEqual([+pin.x1, +pin.y1], [100, 200], `${dir} ${side}`);
    assert.equal(Math.abs(+pin.x2 - 100) + Math.abs(+pin.y2 - 200), 3, `${dir} ${side}: 3 along its side`);
    assert.match(svg2, />d\(7:0\)<\/text>/);
    const b = portBox(p), hit = attrs(svg2.match(/<rect class="hitbox"[^>]*>/)[0]);
    assert.deepEqual([+hit.x, +hit.y, +hit.width, +hit.height], [b.x, b.y, b.w, b.h]);
    assert.equal(/rotate\(-90/.test(svg2), side === 'N' || side === 'S', `${dir} ${side}: the name turned on a vertical marker`);
  }
  const one = portSvg({ id: 'P2', name: 'clk', dir: 'in', width: 1, x: 0, y: 0 });
  assert.match(one, /<line class="pin" /);
  assert.match(one, />clk<\/text>/);
});

test('#405 schematic drawing: the hops of a wire over its crossings, the runs of wires in line, a wire\'s longest run', () => {
  // a horizontal segment from 0 to 200 crossed at 50 and 150, one at 197 too close to its end; then a vertical one
  const w = { points: [{ x: 0, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 100 }] };
  assert.equal(hopPath(w, new Map([[0, [150, 50, 197]]])), 'M0,10 L45,10 A5,5 0 0 1 55,10 L145,10 A5,5 0 0 1 155,10 L200,10 L200,100');
  // right to left: the arcs the other way, in order
  const back = { points: [{ x: 200, y: 10 }, { x: 0, y: 10 }] };
  assert.equal(hopPath(back, new Map([[0, [50, 150]]])), 'M200,10 L155,10 A5,5 0 0 0 145,10 L55,10 A5,5 0 0 0 45,10 L0,10');
  assert.equal(hopPath(back, new Map()), 'M200,10 L0,10');
  // runs: W1 and W2 meet end to end in line on net n; W3 meets W2's end at a corner; W4 in line but of another net
  const wires = [
    { id: 'W1', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    { id: 'W2', points: [{ x: 100, y: 0 }, { x: 200, y: 0 }] },
    { id: 'W3', points: [{ x: 200, y: 0 }, { x: 200, y: 50 }] },
    { id: 'W4', points: [{ x: 200, y: 0 }, { x: 300, y: 0 }] },
  ];
  const net = { W1: 'n', W2: 'n', W3: 'n', W4: 'm' };
  const runs = inLineRuns(wires, (x) => net[x.id]);
  assert.equal(runs.get('W1'), runs.get('W2'));
  assert.notEqual(runs.get('W3'), runs.get('W1'));
  assert.notEqual(runs.get('W4'), runs.get('W2'));
  assert.equal(new Set(runs.values()).size, 3);
  // the longest run, a vertical one counted half
  assert.equal(wireRun(w), 200);
  assert.equal(wireRun({ points: [{ x: 0, y: 0 }, { x: 0, y: 300 }, { x: 120, y: 300 }] }), 150);
});

test('#953 schematic drawing: a VCC / GND wider than a bit, its width by its output (none for one bit or one saved without)', () => {
  for (const type of ['vcc', 'gnd']) {
    const draw = (params) => { const sym = { id: 'S1', type, x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params }; return symbolSvg(sym, symbolDef(sym)); };
    const w8 = [...draw({ width: 8 }).matchAll(/<text class="pwidth"[^>]*>([^<]*)</g)];
    assert.deepEqual(w8.map((m) => m[1]), ['8'], type);
    const pin = symbolPins({ id: 'S1', type, x: 200, y: 100, rot: 0, mirror: false, params: { width: 8 } })[0];
    const at = attrs(w8[0][0]);
    assert.deepEqual([+at.x, +at.y], [pin.x + 4, pin.y + (type === 'vcc' ? 8 : -8)], type);
    assert.doesNotMatch(draw({ width: 1 }), /class="pwidth"/);
    assert.doesNotMatch(draw({}), /class="pwidth"/);
    assert.match(draw({ width: 8 }), new RegExp(`>${type.toUpperCase()}</text>`));
  }
});
