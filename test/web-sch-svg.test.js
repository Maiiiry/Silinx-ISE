// The schematic's drawing in SVG (web/js/sch-svg.js, #405: out of sch-editor.js): a symbol placed and turned where
// the document's geometry (core/schdoc.js: symbolPins, symbolBox) has its pins and box, a pin's lead ending at the
// pin, an I/O marker on each side, the hops of a wire over its crossings, the runs of wires in line, the datasheet
// drawing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import { SYMBOLS, defaultParams, symbolDef, symbolPins, symbolBox, portBox } from '../core/schdoc.js';

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
    // (by its stem, 10 px in from the pin's end, turned: inside its box, #1139)
    assert.deepEqual([+at.x, +at.y, at.transform], [pin.x + 9, pin.y + (type === 'vcc' ? -10 : 10), `rotate(-90 ${pin.x + 9} ${pin.y + (type === 'vcc' ? -10 : 10)})`], type);
    assert.doesNotMatch(draw({ width: 1 }), /class="pwidth"/);
    assert.doesNotMatch(draw({}), /class="pwidth"/);
    assert.match(draw({ width: 8 }), new RegExp(`>${type.toUpperCase()}</text>`));
  }
});

test('#1122 schematic drawing: a VCC / GND wider than a bit has its stem a bus, as every symbol\'s pin; one bit, a thin one', () => {
  // (the stem, in the symbol's own frame: VCC's from its bar down to its pin, GND's from its pin down to its bars)
  const stem = { vcc: { x1: '10', y1: '10', x2: '10', y2: '30' }, gnd: { x1: '10', y1: '0', x2: '10', y2: '20' } };
  for (const type of ['vcc', 'gnd']) {
    const body = (params) => { const sym = { id: 'S1', type, x: 0, y: 0, rot: 0, mirror: false, name: 'U1', params }; return bodySvg(sym, symbolDef(sym)); };
    const leads = (svg) => [...svg.matchAll(/<line class="(pin(?: bus)?)"[^>]*>/g)].map((m) => ({ cls: m[1], ...Object.fromEntries(['x1', 'y1', 'x2', 'y2'].map((k) => [k, attrs(m[0])[k]])) }));
    assert.deepEqual(leads(body({ width: 8 })), [{ cls: 'pin bus', ...stem[type] }], type);
    assert.deepEqual(leads(body({ width: 1 })), [{ cls: 'pin', ...stem[type] }], type);
    assert.deepEqual(leads(body({})), [{ cls: 'pin', ...stem[type] }], type);
    // the bar(s) still the shape's
    assert.match(body({ width: 8 }), type === 'vcc' ? /<path class="gate nofill" d="M2,10 H18"\/>/ : /<path class="gate nofill" d="M1,20 H19 M4,24 H16 M7,28 H13"\/>/);
  }
});

// #1137: every symbol in its 8 orientations (turned 0 / 90 / 180 / 270, mirrored or not): its pin names inside its
// body, none on a pin's lead (#1134: ADD / SUB / COMP / MUX turned 90° / 270°), the names hidden on purpose (the
// multiplexer's output, COMP's and SUB's results) hidden turned too, a clock pin's triangle at it (#1135: the device
// primitives), a bus pin's width inside the symbol's box and off the leads too (#1139). A text's box from its 9 px font (a letter 5.5 px wide at most, 7 px above its baseline, 2 below).
const ORIENTS = [0, 90, 180, 270].flatMap((rot) => [false, true].map((mirror) => ({ rot, mirror })));
const ALL = [...Object.keys(SYMBOLS).filter((t) => !['module', 'hdlblock'].includes(t)).map((t) => [t]),
  ['mux2', { en: true }], ['mux8', { en: true }], ['mux4', { selBus: true }], ['demux', { sel: 3, en: true }],
  ['add', { width: 4, bits: true, cin: true, cout: true }], ['add', { cin: true, cout: true }], ['sub', { bin: true, bout: true }],
  ['decoder', { n: 3, bus: true }], ['module', { module: 'sub' }],
  // (buses: their widths)
  ['mux4', { width: 8 }], ['mux2', { width: 16, en: true }], ['demux', { sel: 2, width: 8 }], ['compare', { width: 16 }],
  ['register', { width: 16 }], ['counter', { width: 8, bits: false }], ['constant', { value: '5', width: 8 }], ['vcc', { width: 8 }],
  ['gnd', { width: 4 }], ['busjoin', { widths: '4,4' }], ['slice', { msb: 7, lsb: 4 }]];
function textBox(t) {
  const a = attrs(t), n = t.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, 'x').length, w = 5.5 * n, x = +a.x, y = +a.y;
  const at = a['text-anchor'] || 'start', off = at === 'end' ? -w : at === 'middle' ? -w / 2 : 0;
  // (turned to read upwards: rotate(-90) about its point)
  return a.transform ? { x0: x - 7, x1: x + 2, y0: y - off - w, y1: y - off } : { x0: x + off, x1: x + off + w, y0: y - 7, y1: y + 2 };
}
const crosses = (b, [p, q]) => Math.max(p.x, q.x) > b.x0 + 0.5 && Math.min(p.x, q.x) < b.x1 - 0.5 && Math.max(p.y, q.y) > b.y0 + 0.5 && Math.min(p.y, q.y) < b.y1 - 0.5;

test('#1137 schematic drawing: every symbol turned and mirrored, its pin names inside its body and off its leads, its clocks\' triangles', () => {
  const bad = [];
  for (const [type, params] of ALL) {
    for (const { rot, mirror } of ORIENTS) {
      const sym = { id: 'S1', type, x: 200, y: 100, rot, mirror, name: 'U1', params: { ...defaultParams(type), ...(params || {}) } };
      const def = symbolDef(sym, MODULES), what = `${type}${params ? JSON.stringify(params) : ''} rot ${rot}${mirror ? ' mirrored' : ''}`;
      const svg = symbolSvg(sym, def);
      const [a, b, c, d, e, f] = svg.match(/transform="matrix\(([^)]*)\)"/)[1].split(',').map(Number);
      const at = (x, y) => ({ x: a * x + c * y + e, y: b * x + d * y + f });
      const leads = [...bodySvg(sym, def).matchAll(/<line class="pin[^"]*"[^>]*>/g)].map((m) => { const l = attrs(m[0]); return [at(+l.x1, +l.y1), at(+l.x2, +l.y2)]; });
      const p0 = at(def.body.x, def.body.y), p1 = at(def.body.x + def.body.w, def.body.y + def.body.h);
      const body = { x0: Math.min(p0.x, p1.x) - 1, x1: Math.max(p0.x, p1.x) + 1, y0: Math.min(p0.y, p1.y) - 1, y1: Math.max(p0.y, p1.y) + 1 };
      const names = [...svg.matchAll(/<text class="pname"[^>]*>[^<]*<\/text>/g)].map((m) => m[0]);
      const sb = symbolBox(sym, MODULES, def);
      for (const t of [...svg.matchAll(/<text class="pwidth"[^>]*>[^<]*<\/text>/g)].map((m) => m[0])) {
        const box = textBox(t), w = t.replace(/<[^>]*>/g, '');
        if (box.x0 < sb.x - 1 || box.x1 > sb.x + sb.w + 1 || box.y0 < sb.y - 1 || box.y1 > sb.y + sb.h + 1) bad.push(`${what}: width ${w} out of the box`);
        if (leads.some((l) => crosses(box, l))) bad.push(`${what}: width ${w} on a lead`);
      }
      for (const t of names) {
        const box = textBox(t), name = t.replace(/<[^>]*>/g, '');
        if (box.x0 < body.x0 || box.x1 > body.x1 || box.y0 < body.y0 || box.y1 > body.y1) bad.push(`${what}: ${name} out of the body`);
        if (leads.some((l) => crosses(box, l))) bad.push(`${what}: ${name} on a lead`);
      }
      // the names hidden on purpose, whatever the orientation
      const shown = names.map((t) => t.replace(/<[^>]*>/g, ''));
      if (def.shape === 'mux' || ['sub', 'compare'].includes(type)) {
        for (const p of def.pins.filter((q) => q.side === 'E')) if (shown.includes(p.name)) bad.push(`${what}: ${p.name} shown`);
      }
      // a clock's triangle at its pin's lead end, on the body's edge
      const clocks = [...bodySvg(sym, def).matchAll(/<path class="clk" d="M([\d.-]+),([\d.-]+) L([\d.-]+),([\d.-]+)/g)].map((m) => ({ x: +m[3], y: +m[4] }));
      for (const p of def.pins.filter((q) => q.clock)) {
        if (!clocks.some((k) => Math.abs(k.y - p.y) < 0.5)) bad.push(`${what}: no clock triangle at ${p.name}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
