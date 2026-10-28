// The device primitives in an ISE schematic (core/isesch-prims.js, #1694): each primitive of the palette exported as
// ISE's own library symbol (BUFG, DCM_SP, RAMB16_S9_S18 …, never an xl_… symbol of its own), its parameters as the
// block's attributes, and imported back as the same Silinx symbol with the same parameters and the same HDL; the
// library symbols' pins where ISE 14.7's libraries have them; a RAMB16 with port A wider than B (no library symbol)
// still a Silinx symbol with its files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportIseSch, importIseSch, libPins } from '../core/isesch.js';
import { primFromIse, primIseSymbol, primLibPins, primOfIseName } from '../core/isesch-prims.js';
import { DEVICE_PRIMITIVES, primitiveDefaults, primitiveOf } from '../core/primitives.js';
import { newDoc, normalizeDoc, symbolPins, portSide, generateHdl } from '../core/schdoc.js';

const VEC = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
// a schematic of one symbol, each of its pins a port p_<pin> (a stub wire on each, the pin's named as the port)
function oneSymbol(type, params, lang = 'vhdl', skip = []) {
  const doc = newDoc('top', lang);
  const s = { id: 'S1', type, name: 'U1', x: 400, y: 200, rot: 0, mirror: false, params };
  doc.symbols.push(s);
  const pins = symbolPins(normalizeDoc(doc).symbols[0], {});
  let n = 0;
  pins.filter(p => !skip.includes(p.name)).forEach((p, i) => {
    const [dx, dy] = VEC[p.side];
    const e = { x: p.x + 20 * dx, y: p.y + 20 * dy }, bus = (p.width || 1) > 1 ? { bus: true } : {};
    doc.wires.push({ id: `W${++n}`, points: [{ x: p.x, y: p.y }, e], ...bus });
    doc.labels.push({ id: `L${++n}`, x: e.x, y: e.y, net: `p_${p.name}` });
    const port = { id: `P${i + 1}`, name: `p_${p.name}`, dir: p.dir === 'out' ? 'out' : 'in', width: p.width || 1, x: p.dir === 'out' ? 1600 : 60, y: 60 + 40 * i };
    doc.ports.push(port);
    const [qx, qy] = VEC[portSide(port)];
    const f = { x: port.x - 20 * qx, y: port.y - 20 * qy };
    doc.wires.push({ id: `W${++n}`, points: [{ x: port.x, y: port.y }, f], ...bus });
  });
  return normalizeDoc(doc);
}

// each primitive with some of its attributes away from their defaults (a block RAM with contents)
const CASES = {
  ramb16_s: [{ portWidth: '18', WRITE_MODE: 'READ_FIRST', INIT: '1ABCD', contents: '1 2 3 FFFF' }, { portWidth: '1' }],
  ramb16_s_s: [{ widthA: '9', widthB: '18', SRVAL_B: '3FFFF', contents: 'A5 5A' }, { widthA: '1', widthB: '36', WRITE_MODE_B: 'NO_CHANGE' }],
  mult18x18sio: [{ AREG: 0, PREG: 0 }],
  dcm_sp: [{ CLKFX_MULTIPLY: 5, CLKFX_DIVIDE: 2, CLKIN_PERIOD: '20.0', CLKDV_DIVIDE: '2.5', STARTUP_WAIT: true }],
  bufg: [{}], bufgmux: [{}], ibufg: [{}],
  ramb8bwer: [{ DATA_WIDTH_A: '18', DATA_WIDTH_B: '18', DOA_REG: 1 }], ramb16bwer: [{ DATA_WIDTH_A: '36', DATA_WIDTH_B: '9', contents: '12345678' }],
  dsp48a1: [{ A1REG: 0, CARRYINSEL: 'CARRYIN' }], pll_base: [{ CLKFBOUT_MULT: 8, CLKOUT0_DIVIDE: 4, CLKOUT0_PHASE: '90.0' }], bufio2: [{ DIVIDE: 2, DIVIDE_BYPASS: false }],
};

// (the import's drawing of the large ones, whose pins are not in ISE's order: some net names not on a wire, #1798;
// their nets and HDL the same)
const KNOWN = {
  dcm_sp: { drawing: ["net name 'p_PSDONE' is not attached to a wire"] },
  dsp48a1: { drawing: ["net name 'p_PCOUT(47:0)' is not attached to a wire"] },
  pll_base: { drawing: ["net name 'p_CLKOUT2' is not attached to a wire", "net name 'p_CLKOUT3' is not attached to a wire", "net name 'p_CLKOUT4' is not attached to a wire"] },
  ramb16bwer: { drawing: ["net name 'p_DOPB(3:0)' is not attached to a wire"] },
};

test('#1694 every device primitive of the palette has a case', () => {
  assert.deepEqual(Object.keys(CASES).sort(), Object.keys(DEVICE_PRIMITIVES).sort());
});

for (const [type, list] of Object.entries(CASES)) {
  for (const params of list) {
    const skip = type === 'dsp48a1' ? ['M'] : [];   // (its M and P not both used)
    const known = KNOWN[type] || {};
    for (const lang of ['vhdl', 'verilog']) {
      test(`#1694 ${type} ${JSON.stringify(params)} (${lang}): ISE's library symbol with its attributes, read back the same`, () => {
        const doc = oneSymbol(type, params, lang, skip);
        const r = exportIseSch(doc, { timestamp: 'T', lang });
        const want = primIseSymbol(doc.symbols[0]);
        assert.ok(want, 'a library symbol');
        assert.deepEqual([...r.xml.matchAll(/<block symbolname="([^"]+)"/g)].map(m => m[1]), [want.name]);
        assert.doesNotMatch(want.name, /^xl_/);
        assert.deepEqual(r.files, []);
        assert.deepEqual(r.warnings, []);
        // the attributes on the block, as ISE writes them
        const blk = r.xml.slice(r.xml.indexOf(`<block symbolname="${want.name}"`), r.xml.indexOf('</block>'));
        for (const [k, v] of want.attrs) assert.match(blk, new RegExp(`<attr value="${v}" name="${k}">\\s*<trait verilog="all:0 dp:1nosynth wsynop:1 wsynth:1" />\\s*<trait vhdl="all:0 gm:1nosynth wa:1 wd:1" />`));
        // read back: the same symbol, its parameters, its HDL
        const back = importIseSch(r.xml, { name: 'top', lang });
        assert.deepEqual(back.warnings, known.import || []);
        assert.equal(back.doc.symbols.length, 1);
        const b = back.doc.symbols[0];
        assert.equal(b.type, type);
        const gens = primitiveOf(type, params).generics;
        const norm = p => { const o = { ...primitiveDefaults(type), ...p }; delete o.contents; for (const g of gens) if (g.kind === 'hex') o[g.name] = BigInt(`0x${o[g.name]}`); return JSON.stringify(Object.entries(o).map(([k, v]) => [k, String(v)]).sort()); };
        assert.equal(norm(b.params), norm(params));
        const inst = (d, want) => { const g = generateHdl(d, { lang }); assert.deepEqual(g.diagnostics.map(x => x.message), want); return g.code.slice(g.code.search(/U1 : |\n[A-Z0-9_]+ (#\(|U1 \()/)); };
        assert.equal(inst(back.doc, known.drawing || []), inst(doc, []));
      });
    }
  }
}

test('#1694 the library symbols\' pins where ISE 14.7 has them; names of the library', () => {
  assert.deepEqual(libPins('bufg'), { I: ['in', 0, -32], O: ['out', 224, -32] });
  assert.deepEqual(libPins('BUFGMUX'), { I0: ['in', 0, -160], I1: ['in', 0, -96], S: ['in', 0, -32], O: ['out', 320, -128] });
  // (a single port without parity bits: every pin 48 lower than with them)
  assert.deepEqual(primLibPins('ramb16_s1'), { 'ADDR(13:0)': ['in', 0, -192], 'DI(0:0)': ['in', 0, -128], WE: ['in', 0, -448], EN: ['in', 0, -384], SSR: ['in', 0, -320], CLK: ['in', 0, -256], 'DO(0:0)': ['out', 480, -288] });
  assert.deepEqual(primLibPins('ramb16_s9')['DIP(0:0)'], ['in', 0, -112]);
  assert.deepEqual(primLibPins('ramb16_s9_s36')['DIPA(0:0)'], ['in', 0, -1088]);
  assert.deepEqual(primLibPins('ramb16_s1_s36').DIPA, undefined);
  assert.deepEqual(primLibPins('dcm_sp')['STATUS(7:0)'], ['out', 384, -320]);
  assert.deepEqual(primLibPins('mult18x18sio')['P(35:0)'], ['out', 384, -320]);
  assert.deepEqual(primOfIseName('RAMB16_S9_S18'), { type: 'ramb16_s_s', params: { widthA: '9', widthB: '18' } });
  for (const n of ['ramb16_s36_s9', 'ramb16_s3', 'ramb16_s', 'ramb16_s_s', 'fdc', 'xl_bufg']) assert.equal(primOfIseName(n), null, n);
  assert.equal(primLibPins('fdc'), null);
});

test('#1694 an ISE block of a primitive with no attributes: its defaults; contents from its INIT_xx', () => {
  assert.deepEqual(primFromIse('BUFG', {}), { type: 'bufg', params: {} });
  const d = primFromIse('dcm_sp', {});
  assert.deepEqual(d, { type: 'dcm_sp', params: {} });
  const r = primFromIse('ramb16_s18', { INIT_00: `${'0'.repeat(52)}0003000200010000`.slice(-64), WRITE_MODE: 'NO_CHANGE', AREG: '5' });
  assert.deepEqual(r, { type: 'ramb16_s', params: { portWidth: '18', WRITE_MODE: 'NO_CHANGE', contents: '0 1 2 3' } });
});

test('#1694 a RAMB16 with port A wider than port B: no library symbol, a Silinx symbol of its own', () => {
  const doc = oneSymbol('ramb16_s_s', { widthA: '18', widthB: '9' });
  assert.equal(primIseSymbol(doc.symbols[0]), null);
  const r = exportIseSch(doc, { timestamp: 'T' });
  assert.deepEqual([...r.xml.matchAll(/<block symbolname="([^"]+)"/g)].map(m => m[1]), ['xl_ramb16_s_s']);
  assert.deepEqual(r.warnings, ['xl_ramb16_s_s: HDL module has errors: U1: no RAMB16_S18_S9: port A must not be wider than port B (RAMB16_S9_S18 with the ports swapped)',
    'ISE symbols not in the Xilinx library: xl_ramb16_s_s — add the returned HDL (.vhd) and .sym files to the ISE project']);
});
