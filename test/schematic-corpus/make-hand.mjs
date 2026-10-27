#!/usr/bin/env node
// The schematic corpus's hand-made schematics (#1687): drawn here, symbol by symbol, and written to hand/<name>.sch.json.
// Each pin gets a short wire and a net name at its end (the nets joined by name, as in ISE); a schematic marked
// `beautify` is then laid out again by Beautify Sheet (core/schbeautify-sheet.js: the same nets, the wires drawn
// between the pins), the others stay as drawn (their turned symbols, their markers' sides, their own wires). Run it
// again only to change them: the corpus tests the files as they are.
//
//   node test/schematic-corpus/make-hand.mjs [name]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDoc, normalizeDoc, symbolPins, portSide, generateHdl, modulesFromLibrary } from '../../core/schdoc.js';
import { beautifySheet } from '../../core/schbeautify-sheet.js';
import { compile } from '../../core/compile.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, 'hand');
const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
const VEC = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };

/** A schematic drawn by net names: port() and sym() add an I/O marker or a symbol with a net name on each pin. */
function draw(name, { lang = 'vhdl', buses = {}, description } = {}) {
  const doc = newDoc(name, lang);
  if (description) doc.description = description;
  let n = 0, col = 0, row = 0;
  const bus = net => (buses[net.replace(/\(.*$/, '')] || /\(\d+:\d+\)$/.test(net) ? { bus: true } : {});
  const stub = (x, y, side, net) => {
    const [dx, dy] = VEC[side];
    const e = { x: x + 20 * dx, y: y + 20 * dy };
    doc.wires.push({ id: `W${++n}`, points: [{ x, y }, e], ...bus(net) });
    doc.labels.push({ id: `L${++n}`, x: e.x, y: e.y, net });
  };
  const d = {
    doc,
    port(pname, dir, width = 1, { side, net = pname } = {}) {
      const p = { id: `P${++n}`, name: pname, dir, width, x: dir === 'in' ? 120 : 1560, y: 80 + 60 * (dir === 'in' ? row++ : col++) };
      if (side) p.side = side;
      doc.ports.push(p);
      const [dx, dy] = VEC[portSide(p)];
      if (width > 1) buses[pname] = true;
      const e = { x: p.x - 20 * dx, y: p.y - 20 * dy };
      doc.wires.push({ id: `W${++n}`, points: [{ x: p.x, y: p.y }, e], ...(width > 1 ? { bus: true } : {}) });
      if (net !== pname) doc.labels.push({ id: `L${++n}`, x: e.x, y: e.y, net });
      return d;
    },
    sym(type, params, conn, { rot = 0, mirror = false, name: sname } = {}) {
      const k = doc.symbols.length;
      const s = { id: `S${k + 1}`, type, x: 360 + 260 * (k % 4), y: 80 + 200 * Math.floor(k / 4), rot, mirror, name: sname || `XLXI_${k + 1}`, params };
      doc.symbols.push(s);
      const pins = symbolPins(normalizeDoc({ ...doc, symbols: [s] }, { modules: d.modules }).symbols[0], d.modules || {});
      for (const [pin, net] of Object.entries(conn)) {
        const p = pins.find(q => q.name === pin);
        if (!p) throw new Error(`${name}: ${type} has no pin ${pin} (${pins.map(q => q.name).join(' ')})`);
        stub(p.x, p.y, p.side, net);
      }
      return d;
    },
    wire(points, extra = {}) { doc.wires.push({ id: `W${++n}`, points, ...extra }); return d; },
    label(x, y, net) { doc.labels.push({ id: `L${++n}`, x, y, net }); return d; },
  };
  return d;
}

const SCHEMATICS = {
  // ---- buses and bus taps
  bus_taps: { beautify: true, description: 'Bus taps: one bit, several bits, bits in the other order through a bus join, a tap of an internal bus, taps into a gate.',
    make: d => d.port('a', 'in', 8).port('msb', 'out').port('mid', 'out', 4).port('rev', 'out', 4).port('nb4', 'out').port('ends', 'out')
      .sym('slice', { msb: 7, lsb: 7 }, { I: 'a', O: 'msb' })
      .sym('slice', { msb: 5, lsb: 2 }, { I: 'a', O: 'mid' })
      .sym('slice', { msb: 0, lsb: 0 }, { I: 'a', O: 'a0' }).sym('slice', { msb: 1, lsb: 1 }, { I: 'a', O: 'a1' })
      .sym('slice', { msb: 2, lsb: 2 }, { I: 'a', O: 'a2' }).sym('slice', { msb: 3, lsb: 3 }, { I: 'a', O: 'a3' })
      .sym('busjoin', { widths: '1,1,1,1' }, { I0: 'a0', I1: 'a1', I2: 'a2', I3: 'a3', O: 'rev' })
      .sym('inv', { width: 8 }, { I: 'a', O: 'na(7:0)' })
      .sym('slice', { msb: 4, lsb: 4 }, { I: 'na', O: 'nb4' })
      .sym('and2', { width: 1 }, { I0: 'msb', I1: 'a0', O: 'ends' }) },
  bus_taps_turned: { description: 'Bus taps turned (90, 180, 270), mirrored, the markers on their four sides: y is a, bit by bit.',
    make: d => d.port('a', 'in', 5, { side: 'N' }).port('y', 'out', 5, { side: 'S' })
      .sym('slice', { msb: 0, lsb: 0 }, { I: 'a', O: 't0' }, { rot: 90 })
      .sym('slice', { msb: 1, lsb: 1 }, { I: 'a', O: 't1' }, { rot: 180 })
      .sym('slice', { msb: 2, lsb: 2 }, { I: 'a', O: 't2' }, { rot: 270 })
      .sym('slice', { msb: 3, lsb: 3 }, { I: 'a', O: 't3' }, { mirror: true })
      .sym('slice', { msb: 4, lsb: 4 }, { I: 'a', O: 't4' }, { rot: 90, mirror: true })
      .sym('busjoin', { widths: '1,1,1,1,1' }, { I0: 't4', I1: 't3', I2: 't2', I3: 't1', I4: 't0', O: 'y' }, { rot: 180 }) },
  bus_join: { beautify: true, description: 'Bus joins of parts of several widths, a join of joins, a bus split again by taps.',
    make: d => d.port('a', 'in', 2).port('b', 'in').port('c', 'in', 3).port('y', 'out', 6).port('z', 'out', 7).port('w', 'out', 3)
      .sym('busjoin', { widths: '2,1,3' }, { I0: 'a', I1: 'b', I2: 'c', O: 'y' })
      .sym('busjoin', { widths: '6,1' }, { I0: 'y', I1: 'b', O: 'z' })
      .sym('slice', { msb: 5, lsb: 3 }, { I: 'z', O: 'w' }) },
  net_names: { description: 'Nets joined by name only: a bus named d(3:0), names used in several places, a marker\'s net named after it.',
    make: d => d.port('a', 'in', 4).port('b', 'in', 4).port('c', 'in', 4).port('y', 'out', 4).port('q', 'out')
      .sym('xor2', { width: 4 }, { I0: 'a', I1: 'b', O: 'd(3:0)' })
      .sym('and2', { width: 4 }, { I0: 'd', I1: 'c', O: 'y' })
      .sym('slice', { msb: 0, lsb: 0 }, { I: 'd', O: 'd0' })
      .sym('slice', { msb: 3, lsb: 3 }, { I: 'y', O: 'y3' })
      .sym('or2', { width: 1 }, { I0: 'd0', I1: 'y3', O: 'q' }) },
  // ---- the library
  gates_inverted: { beautify: true, description: 'Gates of 2 to 5 inputs, with inverted inputs (AND2B1, OR3B2, NAND3B1, AND4B2), NOR, XOR, XNOR, and bitwise gates of a width.',
    make: d => d.port('a', 'in').port('b', 'in').port('c', 'in').port('e', 'in').port('v', 'in', 3).port('w', 'in', 3)
      .port('y0', 'out').port('y1', 'out').port('y2', 'out').port('y3', 'out').port('y4', 'out').port('y5', 'out').port('y6', 'out').port('y7', 'out').port('y8', 'out').port('vw', 'out', 3)
      .sym('and2b1', { width: 1 }, { I0: 'a', I1: 'b', O: 'y0' })
      .sym('or3b2', { width: 1 }, { I0: 'a', I1: 'b', I2: 'c', O: 'y1' })
      .sym('nand3b1', { width: 1 }, { I0: 'a', I1: 'b', I2: 'c', O: 'y2' })
      .sym('nor2', { width: 1 }, { I0: 'a', I1: 'e', O: 'y3' })
      .sym('xor3', { width: 1 }, { I0: 'a', I1: 'b', I2: 'c', O: 'y4' })
      .sym('xnor2', { width: 1 }, { I0: 'c', I1: 'e', O: 'y5' })
      .sym('and4b2', { width: 1 }, { I0: 'a', I1: 'b', I2: 'c', I3: 'e', O: 'y6' })
      .sym('or5', { width: 1 }, { I0: 'a', I1: 'b', I2: 'c', I3: 'e', I4: 'y0', O: 'y7' })
      .sym('buf', { width: 1 }, { I: 'y3', O: 'y8' })
      .sym('nand2', { width: 3 }, { I0: 'v', I1: 'w', O: 'vw' }) },
  vcc_gnd: { beautify: true, description: 'VCC and GND, of one bit and of a width, constants, a constant into an adder.',
    make: d => d.port('a', 'in', 4).port('one', 'out').port('zero', 'out').port('ones', 'out', 4).port('k', 'out', 4).port('s', 'out', 4).port('y', 'out', 4)
      .sym('vcc', { width: 1 }, { P: 'one' })
      .sym('gnd', { width: 1 }, { G: 'zero' })
      .sym('vcc', { width: 4 }, { P: 'ones' })
      .sym('constant', { value: '10', width: 4 }, { O: 'k' })
      .sym('constant', { value: '3', width: 4 }, { O: 'three' })
      .sym('add', { width: 4, cin: false, cout: false, bits: false }, { A: 'a', B: 'three', S: 's' })
      .sym('gnd', { width: 2 }, { G: 'g2' })
      .sym('slice', { msb: 3, lsb: 2 }, { I: 'a', O: 'ahi' })
      .sym('busjoin', { widths: '2,2' }, { I0: 'ahi', I1: 'g2', O: 'y' }) },
  arith: { beautify: true, description: 'An adder with carry in and out, a subtractor with borrow out, comparators (unsigned and signed).',
    make: d => d.port('a', 'in', 4).port('b', 'in', 4).port('ci', 'in').port('s', 'out', 4).port('co', 'out').port('df', 'out', 4).port('bo', 'out')
      .port('eq', 'out').port('lt', 'out').port('ges', 'out')
      .sym('add', { width: 4, cin: true, cout: true, bits: false }, { A: 'a', B: 'b', CI: 'ci', S: 's', CO: 'co' })
      .sym('sub', { width: 4, bin: false, bout: true, bits: false }, { A: 'a', B: 'b', D: 'df', BO: 'bo' })
      .sym('compare', { width: 4, op: 'eq', signed: false, bits: false }, { A: 'a', B: 'b', O: 'eq' })
      .sym('compare', { width: 4, op: 'lt', signed: false, bits: false }, { A: 'a', B: 'b', O: 'lt' })
      .sym('compare', { width: 4, op: 'ge', signed: true, bits: false }, { A: 'a', B: 'b', O: 'ges' }) },
  mux_dec: { beautify: true, description: 'Multiplexers (M2_1 of a width, M4_1, M8_1 with its select as a bus), a decoder with enable, a priority encoder, a demultiplexer.',
    make: d => d.port('dd', 'in', 8).port('s', 'in', 3).port('en', 'in').port('m2', 'out', 2).port('m4', 'out').port('m8', 'out').port('dec', 'out', 4)
      .port('enc', 'out', 2).port('v', 'out').port('dm', 'out', 2)
      .sym('slice', { msb: 0, lsb: 0 }, { I: 's', O: 's0' }).sym('slice', { msb: 1, lsb: 1 }, { I: 's', O: 's1' })
      .sym('slice', { msb: 1, lsb: 0 }, { I: 'dd', O: 'd10' }).sym('slice', { msb: 3, lsb: 2 }, { I: 'dd', O: 'd32' })
      .sym('mux2', { width: 2, en: false }, { D0: 'd10', D1: 'd32', S0: 's0', O: 'm2' })
      .sym('slice', { msb: 4, lsb: 4 }, { I: 'dd', O: 'd4' }).sym('slice', { msb: 5, lsb: 5 }, { I: 'dd', O: 'd5' })
      .sym('slice', { msb: 6, lsb: 6 }, { I: 'dd', O: 'd6' }).sym('slice', { msb: 7, lsb: 7 }, { I: 'dd', O: 'd7' })
      .sym('mux4', { width: 1, en: false, selBus: false }, { D0: 'd4', D1: 'd5', D2: 'd6', D3: 'd7', S1: 's1', S0: 's0', O: 'm4' })
      .sym('slice', { msb: 0, lsb: 0 }, { I: 'dd', O: 'd0' }).sym('slice', { msb: 1, lsb: 1 }, { I: 'dd', O: 'd1' })
      .sym('slice', { msb: 2, lsb: 2 }, { I: 'dd', O: 'd2' }).sym('slice', { msb: 3, lsb: 3 }, { I: 'dd', O: 'd3' })
      .sym('mux8', { width: 1, en: true, selBus: true }, { D0: 'd0', D1: 'd1', D2: 'd2', D3: 'd3', D4: 'd4', D5: 'd5', D6: 'd6', D7: 'd7', S: 's', E: 'en', O: 'm8' })
      .sym('decoder', { n: 2, en: true, bus: false }, { A0: 's0', A1: 's1', E: 'en', D0: 'q0', D1: 'q1', D2: 'q2', D3: 'q3' })
      .sym('busjoin', { widths: '1,1,1,1' }, { I0: 'q3', I1: 'q2', I2: 'q1', I3: 'q0', O: 'dec' })
      .sym('encoder', { n: 2, mode: 'priority', bus: false }, { I0: 'd4', I1: 'd5', I2: 'd6', I3: 'd7', A0: 'e0', A1: 'e1', V: 'v' })
      .sym('busjoin', { widths: '1,1' }, { I0: 'e1', I1: 'e0', O: 'enc' })
      .sym('demux', { width: 1, sel: 1, en: false, selBus: false }, { D: 'en', S0: 's0', O0: 'o0', O1: 'o1' })
      .sym('busjoin', { widths: '1,1' }, { I0: 'o1', I1: 'o0', O: 'dm' }) },
  flipflops: { beautify: true, sequential: true, description: 'Flip-flops (FD, FDC, FDCE, FDRE, FDPE, FTCE), a register and up / down counters, the clock through a BUFG.',
    make: d => d.port('clk', 'in').port('d', 'in').port('ce', 'in').port('clr', 'in').port('dd', 'in', 4)
      .port('q', 'out', 6).port('rq', 'out', 4).port('up', 'out', 4).port('dn', 'out', 3)
      .sym('bufg', {}, { I: 'clk', O: 'gclk' })
      .sym('fd', { init: '0', width: 1 }, { D: 'd', C: 'gclk', Q: 'q0' })
      .sym('fdc', { init: '0', width: 1 }, { D: 'd', C: 'gclk', CLR: 'clr', Q: 'q1' })
      .sym('fdce', { init: '0', width: 1 }, { D: 'd', CE: 'ce', C: 'gclk', CLR: 'clr', Q: 'q2' })
      .sym('fdre', { init: '0', width: 1 }, { D: 'd', CE: 'ce', C: 'gclk', R: 'clr', Q: 'q3' })
      .sym('fdpe', { init: '1', width: 1 }, { PRE: 'clr', D: 'd', CE: 'ce', C: 'gclk', Q: 'q4' })
      .sym('ftce', { init: '0', width: 1 }, { T: 'd', CE: 'ce', C: 'gclk', CLR: 'clr', Q: 'q5' })
      .sym('busjoin', { widths: '1,1,1,1,1,1' }, { I0: 'q5', I1: 'q4', I2: 'q3', I3: 'q2', I4: 'q1', I5: 'q0', O: 'q' })
      .sym('register', { width: 4, en: true, reset: 'async', init: '0' }, { D: 'dd', CE: 'ce', C: 'gclk', CLR: 'clr', Q: 'rq' })
      .sym('counter', { width: 4, en: true, reset: 'async', dir: 'up', bits: false }, { CE: 'ce', C: 'gclk', CLR: 'clr', Q: 'up' })
      .sym('counter', { width: 3, en: false, reset: 'sync', dir: 'down', bits: false }, { C: 'gclk', R: 'clr', Q: 'dn' }) },
  tristate: { beautify: true, description: 'Tri-state buffers (BUFE, BUFT) sharing one net, a bus of them.',
    make: d => d.port('a', 'in').port('b', 'in').port('ea', 'in').port('tb', 'in').port('y', 'out').port('u', 'in', 2).port('z', 'out', 2)
      .sym('tbuf', { width: 1, enable: 'E', bits: false }, { E: 'ea', I: 'a', O: 'y' })
      .sym('tbuf', { width: 1, enable: 'T', bits: false }, { T: 'tb', I: 'b', O: 'y' })
      .sym('tbuf', { width: 2, enable: 'E', bits: false }, { E: 'ea', I: 'u', O: 'z' }) },
  // ---- hierarchy: a half adder, and a full adder of two of its instances
  half_adder: { beautify: true, description: 'A half adder (the module the full adder instantiates).',
    make: d => d.port('a', 'in').port('b', 'in').port('s', 'out').port('c', 'out')
      .sym('xor2', { width: 1 }, { I0: 'a', I1: 'b', O: 's' })
      .sym('and2', { width: 1 }, { I0: 'a', I1: 'b', O: 'c' }) },
  full_adder: { beautify: true, uses: ['half_adder'], description: 'A full adder of two half adders: module symbols of another schematic of the project.',
    make: d => d.port('a', 'in').port('b', 'in').port('ci', 'in').port('s', 'out').port('co', 'out')
      .sym('module', { module: 'half_adder', generics: {} }, { a: 'a', b: 'b', s: 's1', c: 'c1' }, { name: 'HA1' })
      .sym('module', { module: 'half_adder', generics: {} }, { a: 's1', b: 'ci', s: 's', c: 'c2' }, { name: 'HA2' })
      .sym('or2', { width: 1 }, { I0: 'c1', I1: 'c2', O: 'co' }) },
  // ---- the drawing: curves and hops
  curved_hops: { description: 'Wires drawn as curves, crossing without connecting (hops), a wire with a bend on another\'s segment.',
    make: d => {
      d.doc.wireStyle = 'curved';
      d.port('a', 'in').port('b', 'in').port('y1', 'out').port('y2', 'out')
        .sym('inv', { width: 1 }, { I: 'a', O: 'y1' })
        .sym('inv', { width: 1 }, { I: 'b', O: 'y2' });
      // a's wire goes right, then down across b's (at 1000,140); b's goes right, then down across a's (at 1100,500)
      const [pa, pb] = d.doc.ports;
      d.wire([{ x: pa.x + 20, y: pa.y }, { x: 1000, y: pa.y }, { x: 1000, y: 500 }, { x: 1200, y: 500 }]).label(1200, 500, 'a');
      d.wire([{ x: pb.x + 20, y: pb.y }, { x: 1100, y: pb.y }, { x: 1100, y: 600 }], { curve: [{ u: 0.5, v: 0.2 }] }).label(1100, 600, 'b');
      return d;
    } },
  // ---- what Silinx gets wrong today (#1688-#1691): kept so that the corpus shows when they are fixed
  bus_bitnames: { description: 'ISE\'s way of tapping a bus: the tap\'s wire named a(0), the bit it takes (#1688).',
    make: d => d.port('a', 'in', 4).port('y', 'out').port('z', 'out')
      .sym('slice', { msb: 0, lsb: 0 }, { I: 'a', O: 'a(0)' })
      .sym('buf', { width: 1 }, { I: 'a(0)', O: 'y' })
      .sym('slice', { msb: 3, lsb: 3 }, { I: 'a', O: 'a(3)' })
      .sym('inv', { width: 1 }, { I: 'a(3)', O: 'z' }) },
  bus_offset: { description: 'A bus named d(7:4) and a tap of its bit 7 (#1689).',
    make: d => d.port('a', 'in', 4).port('y', 'out')
      .sym('buf', { width: 4 }, { I: 'a', O: 'd(7:4)' })
      .sym('slice', { msb: 7, lsb: 7 }, { I: 'd', O: 'y' }) },
  tap_range: { description: 'A tap of bit 5 of a 4-bit bus (#1690).',
    make: d => d.port('a', 'in', 4).port('y', 'out')
      .sym('slice', { msb: 5, lsb: 5 }, { I: 'a', O: 'y' }) },
  tap_reversed: { description: 'A tap with its MSB below its LSB, MSB 1 and LSB 2 (#1691).',
    make: d => d.port('a', 'in', 4).port('y', 'out', 2)
      .sym('slice', { msb: 1, lsb: 2 }, { I: 'a', O: 'y' }) },
};

const only = process.argv[2];
const made = {};
for (const [name, S] of Object.entries(SCHEMATICS)) {
  const d = draw(name, { description: S.description });
  if (S.uses) {
    // the modules it instantiates: their HDL generated from their schematics
    const srcs = S.uses.map(u => ({ path: `${u}.vhd`, text: generateHdl(made[u] || JSON.parse(fs.readFileSync(path.join(DIR, `${u}.sch.json`), 'utf8')), { lang: 'vhdl' }).code }));
    d.modules = modulesFromLibrary(compile(srcs), { sources: Object.fromEntries(srcs.map(s => [s.path, s.text])) });
  }
  S.make(d);
  let doc = normalizeDoc(d.doc, { modules: d.modules });
  if (S.beautify) {
    const r = await beautifySheet(doc, { modules: d.modules || {}, layout: g => elk.layout(g) });
    if (!r.sheet) console.log(`${name}: not laid out again (its wires only)`);
  }
  doc = normalizeDoc(doc, { modules: d.modules });
  doc.generatedFile = `${name}.vhd`;
  made[name] = doc;
  if (only && name !== only) continue;
  fs.writeFileSync(path.join(DIR, `${name}.sch.json`), `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`hand/${name}.sch.json: ${doc.symbols.length} symbols, ${doc.wires.length} wires`);
}
