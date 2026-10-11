// The packer (core/fpga/pack.js) on distributed RAMs and shift registers (SLICEM), block RAMs and
// multipliers, the placer (core/fpga/place.js) on their sites, their timing arcs
// (core/fpga/timing.js): small synthetic Yosys netlists, the XDL settings as ISE's map writes them
// (research/s3e-bitstream/README.md, stage D), and - the main check - the packed design simulated
// from its own XDL settings behaves like the netlist (test/fpga-sim.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readYosysJson } from '../core/fpga/netlist.js';
import { pack, PackError, BRAM_WIDTH } from '../core/fpga/pack.js';
import { instArcs } from '../core/fpga/timing.js';
import { compareSims, netlistSim } from './fpga-sim.js';

// A Yosys JSON netlist: ports { name: ['input' | 'output', width] } (bits name[i]); cells
// [{ name, type, params, conns: { PIN: net name | [net names] | '0' / '1' / 'x' }, outs: [PIN] }]
function yjson(ports, cells) {
  const ids = new Map();
  let next = 2;
  const bit = n => (/^[01xz]$/.test(n) ? n : (ids.has(n) || ids.set(n, next++), ids.get(n)));
  const mod = { attributes: { top: '00000000000000000000000000000001' }, ports: {}, cells: {}, netnames: {} };
  for (const [name, [dir, w]] of Object.entries(ports)) {
    const bits = Array.from({ length: w }, (_, i) => bit(w > 1 ? `${name}[${i}]` : name));
    mod.ports[name] = { direction: dir, bits };
    mod.netnames[name] = { bits };
  }
  for (const c of cells) {
    const connections = {}, port_directions = {};
    for (const [p, v] of Object.entries(c.conns)) {
      connections[p] = (Array.isArray(v) ? v : [v]).map(bit);
      port_directions[p] = (c.outs || []).includes(p) ? 'output' : 'input';
    }
    mod.cells[c.name] = { type: c.type, parameters: c.params || {}, attributes: {}, port_directions, connections };
  }
  return readYosysJson({ modules: { top: mod } });
}
const bin = (v, n) => v.toString(2).padStart(n, '0');
const bus = (name, w, from = 0) => Array.from({ length: w }, (_, i) => `${name}[${from + i}]`);
const ibuf = (port, w) => Array.from({ length: w }, (_, i) => ({ name: `ib_${port}${i}`, type: 'IBUF', conns: { I: w > 1 ? `${port}[${i}]` : port, O: w > 1 ? `${port}_i[${i}]` : `${port}_i` }, outs: ['O'] }));
const obuf = (port, net) => ({ name: `ob_${port}`, type: 'OBUF', conns: { I: net, O: port }, outs: ['O'] });
const clock = [{ name: 'ib_clk', type: 'IBUF', conns: { I: 'clk', O: 'clk_i' }, outs: ['O'] }, { name: 'bufg', type: 'BUFG', conns: { I: 'clk_i', O: 'clk_g' }, outs: ['O'] }];
const cfgOf = inst => Object.fromEntries(inst.cfg.map(c => [c.attr, c]));
const val = (inst, a) => cfgOf(inst)[a]?.value;
const same = (nl, p, cycles = 400) => {
  const d = compareSims(nl, p, { cycles, seed: 3 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
};

// distributed RAMs of every kind on shared address / data inputs
function drams() {
  return yjson({ clk: ['input', 1], a: ['input', 6], b: ['input', 4], d: ['input', 2], we: ['input', 4], o: ['output', 8] }, [
    ...clock, ...ibuf('a', 6), ...ibuf('b', 4), ...ibuf('d', 2), ...ibuf('we', 4),
    { name: 'r16a', type: 'RAM16X1S', params: { INIT: bin(0xA5C3, 16) }, conns: { A0: 'a_i[0]', A1: 'a_i[1]', A2: 'a_i[2]', A3: 'a_i[3]', D: 'd_i[0]', WE: 'we_i[0]', WCLK: 'clk_g', O: 'o16a' }, outs: ['O'] },
    { name: 'r16b', type: 'RAM16X1S', params: { INIT: bin(0x0F0F, 16) }, conns: { A0: 'a_i[0]', A1: 'a_i[1]', A2: 'a_i[2]', A3: 'a_i[3]', D: 'd_i[1]', WE: 'we_i[0]', WCLK: 'clk_g', O: 'o16b' }, outs: ['O'] },
    { name: 'r16d', type: 'RAM16X1D', params: { INIT: bin(0x1234, 16) }, conns: { A0: 'a_i[0]', A1: 'a_i[1]', A2: 'a_i[2]', A3: 'a_i[3]', DPRA0: 'b_i[0]', DPRA1: 'b_i[1]', DPRA2: 'b_i[2]', DPRA3: 'b_i[3]', D: 'd_i[0]', WE: 'we_i[1]', WCLK: 'clk_g', SPO: 'spo', DPO: 'dpo' }, outs: ['SPO', 'DPO'] },
    { name: 'r32', type: 'RAM32X1S', params: { INIT: bin(0x89ABCDEF, 32) }, conns: { A0: 'a_i[0]', A1: 'a_i[1]', A2: 'a_i[2]', A3: 'a_i[3]', A4: 'a_i[4]', D: 'd_i[1]', WE: 'we_i[2]', WCLK: 'clk_g', O: 'o32' }, outs: ['O'] },
    { name: 'r64', type: 'RAM64X1S', params: { INIT: bin(0x0123456789ABCDEFn, 64) }, conns: { A0: 'a_i[0]', A1: 'a_i[1]', A2: 'a_i[2]', A3: 'a_i[3]', A4: 'a_i[4]', A5: 'a_i[5]', D: 'd_i[0]', WE: 'we_i[3]', WCLK: 'clk_g', O: 'o64' }, outs: ['O'] },
    obuf('o[0]', 'o16a'), obuf('o[1]', 'o16b'), obuf('o[2]', 'spo'), obuf('o[3]', 'dpo'), obuf('o[4]', 'o32'), obuf('o[5]', 'o64'),
    { name: 'ob6', type: 'OBUF', conns: { I: 'a_i[5]', O: 'o[6]' }, outs: ['O'] }, { name: 'ob7', type: 'OBUF', conns: { I: 'b_i[3]', O: 'o[7]' }, outs: ['O'] },
  ]);
}

test('distributed RAMs in SLICEMs (RAM16X1S pair, RAM16X1D, RAM32X1S, RAM64X1S) behave like the netlist', () => {
  const nl = drams();
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  // RAM16X1S pair: 1 slice; RAM16X1D: 1; RAM32X1S: 1; RAM64X1S: 2 RAM32X1S + LUTs (write enables, read multiplexer)
  assert.equal(p.stats.slicem, 5);
  for (const s of p.insts.filter(i => i.type === 'SLICEM')) {
    assert.equal(val(s, 'SRINV'), 'SR');
    assert.ok(cfgOf(s).WSGEN, 'the write strobe generator');
  }
  same(nl, p);
});

test('distributed RAMs: the settings ISE writes (#RAM contents, DUAL_PORT, DIF_MUX / DIG_MUX, SLICEWE0USED, F5)', () => {
  const p = pack(drams());
  const at = name => p.insts.find(i => Object.values(cfgOf(i)).some(c => (c.attr === 'F' || c.attr === 'G') && c.name.startsWith(name)));
  const pair = at('r16a');
  assert.deepEqual([val(pair, 'G'), val(pair, 'F'), val(pair, 'DIG_MUX'), val(pair, 'DIF_MUX')], ['#RAM:D=0xA5C3', '#RAM:D=0x0F0F', 'BY', 'BX']);
  assert.equal(val(pair, 'WG1USED'), '0');
  const d = at('r16d');
  assert.deepEqual([val(d, 'F_ATTR'), val(d, 'G_ATTR'), val(d, 'DIF_MUX'), cfgOf(d).F.name, cfgOf(d).G.name], ['DUAL_PORT', 'DUAL_PORT', 'ALTDIF', 'r16d.SLICEM_F', 'r16d.SLICEM_G']);
  const r32 = at('r32');
  // G: addresses 0-15, F: 16-31 (A4 = BX selects F)
  assert.deepEqual([val(r32, 'G'), val(r32, 'F'), val(r32, 'FXMUX'), val(r32, 'SLICEWE0USED')], ['#RAM:D=0xCDEF', '#RAM:D=0x89AB', 'F5', '0']);
  const lo = at('r64_lo'), hi = at('r64_hi');
  assert.deepEqual([val(lo, 'G'), val(lo, 'F'), val(hi, 'G'), val(hi, 'F')], ['#RAM:D=0xCDEF', '#RAM:D=0x89AB', '#RAM:D=0x4567', '#RAM:D=0x0123']);
  // nothing else in a RAM's slice (SR is its write enable)
  for (const s of p.insts.filter(i => i.type === 'SLICEM')) assert.ok(!cfgOf(s).FFX && !cfgOf(s).FFY && !/#LUT/.test(val(s, 'F') || '') && !/#LUT/.test(val(s, 'G') || ''));
});

// shift registers: with a clock enable, always enabled feeding a flip-flop, falling edge
function srls() {
  return yjson({ clk: ['input', 1], d: ['input', 2], t: ['input', 4], ce: ['input', 1], q: ['output', 4] }, [
    ...clock, ...ibuf('d', 2), ...ibuf('t', 4), ...ibuf('ce', 1),
    { name: 'sv', type: 'SRL16E', params: { INIT: bin(0x8001, 16) }, conns: { A0: 't_i[0]', A1: 't_i[1]', A2: 't_i[2]', A3: 't_i[3]', CE: 'ce_i', CLK: 'clk_g', D: 'd_i[0]', Q: 'qv' }, outs: ['Q'] },
    { name: 'sf', type: 'SRL16E', params: { INIT: bin(0x00F0, 16) }, conns: { A0: '1', A1: '0', A2: '1', A3: '0', CE: '1', CLK: 'clk_g', D: 'd_i[1]', Q: 'qf' }, outs: ['Q'] },
    { name: 'ff', type: 'FDRE', params: { INIT: '1' }, conns: { C: 'clk_g', CE: '1', R: '0', D: 'qf', Q: 'qff' }, outs: ['Q'] },
    { name: 'sn', type: 'SRL16E_1', params: { INIT: bin(0x0003, 16) }, conns: { A0: '1', A1: '1', A2: '0', A3: '0', CE: '1', CLK: 'clk_g', D: 'd_i[0]', Q: 'qn' }, outs: ['Q'] },
    obuf('q[0]', 'qv'), obuf('q[1]', 'qf'), obuf('q[2]', 'qff'), obuf('q[3]', 'qn'),
  ]);
}

test('shift registers (SRL16E, SRL16E_1) in SLICEMs: CE on SR, an always-enabled one feeds the flip-flop of its side', () => {
  const nl = srls();
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  const sl = p.insts.filter(i => i.type === 'SLICEM');
  assert.equal(sl.length, 3);
  for (const s of sl) assert.equal(val(s, cfgOf(s).G ? 'G_ATTR' : 'F_ATTR'), 'SHIFT_REG');
  const sv = sl.find(s => cfgOf(s).G?.name === 'sv');
  assert.deepEqual([val(sv, 'G'), val(sv, 'DIG_MUX'), cfgOf(sv).WSGEN.name], ['#RAM:D=0x8001', 'BY', 'sv.CE']);
  const k = p.insts.indexOf(sv);
  const ce = p.insts.findIndex(i => i.name === 'ce');
  assert.equal(p.nets.find(n => n.inpins.some(x => x.inst === k && x.pin === 'SR')).outpins[0].inst, ce, 'CE on SR');
  // the always-enabled shift register: SR = 1, the flip-flop beside it as ISE's map packs it
  const sf = sl.find(s => cfgOf(s).G?.name === 'sf');
  assert.deepEqual([val(sf, 'FFY'), val(sf, 'DYMUX'), val(sf, 'GYMUX'), val(sf, 'FFY_INIT_ATTR'), val(sf, 'FFY_SR_ATTR')], ['#FF', '1', 'G', 'INIT1', 'SRLOW']);
  const kf = p.insts.indexOf(sf);
  assert.equal(p.nets.find(n => n.inpins.some(x => x.inst === kf && x.pin === 'SR')).type, 'vcc');
  assert.equal(val(sl.find(s => cfgOf(s).G?.name === 'sn'), 'CLKINV'), 'CLK_B');
  same(nl, p);
});

// block RAMs: single port 2048 x 9 with a constant enable and undriven data bits, dual port 18 / 36
function brams() {
  const init = '0'.repeat(192) + bin(0xDEADBEEFCAFEBABEn, 64);
  return yjson({ clk: ['input', 1], a: ['input', 11], d: ['input', 8], we: ['input', 2], en: ['input', 1], q: ['output', 16] }, [
    ...clock, ...ibuf('a', 11), ...ibuf('d', 8), ...ibuf('we', 2), ...ibuf('en', 1),
    { name: 'sp', type: 'RAMB16_S9', params: { WRITE_MODE: 'READ_FIRST', INIT: bin(0x1A5, 9), SRVAL: bin(0x05A, 9), INIT_00: init },
      conns: { ADDR: bus('a_i', 11), DI: [...bus('d_i', 6), 'x', 'x'], DIP: 'x', DO: bus('qs', 8), DOP: 'qsp', CLK: 'clk_g', EN: '1', SSR: '0', WE: 'we_i[0]' }, outs: ['DO', 'DOP'] },
    { name: 'dp', type: 'RAMB16_S18_S36', params: { WRITE_MODE_A: 'WRITE_FIRST', WRITE_MODE_B: 'NO_CHANGE', INIT_A: bin(0x3FFFF, 18), SRVAL_B: bin(0x987654321n, 36), INIT_01: init },
      conns: { ADDRA: bus('a_i', 10), DIA: [...bus('d_i', 8), ...bus('d_i', 8)], DIPA: ['d_i[0]', 'd_i[1]'], DOA: bus('qa', 16), DOPA: bus('qap', 2), CLKA: 'clk_g', ENA: 'en_i', SSRA: '0', WEA: 'we_i[1]',
        ADDRB: bus('a_i', 9, 2), DIB: [...bus('d_i', 8), ...bus('d_i', 8), ...bus('d_i', 8), ...bus('d_i', 8)], DIPB: bus('d_i', 4), DOB: bus('qb', 32), DOPB: bus('qbp', 4), CLKB: 'clk_g', ENB: '1', SSRB: 'we_i[0]', WEB: 'we_i[0]' },
      outs: ['DOA', 'DOPA', 'DOB', 'DOPB'] },
    ...['qs[0]', 'qs[5]', 'qsp', 'qa[3]', 'qa[15]', 'qap[1]', 'qb[0]', 'qb[9]', 'qb[31]', 'qbp[3]', 'qs[7]', 'qa[8]', 'qb[16]', 'qbp[0]', 'qs[1]', 'qa[0]'].map((n, i) => obuf(`q[${i}]`, n)),
  ]);
}

test('block RAMs: RAMB16 sites, address pins by port width, settings as ISE writes them, behaviour', () => {
  const nl = brams();
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  assert.equal(p.stats.brams, 2);
  const sp = p.insts.find(i => i.name === 'sp'), dp = p.insts.find(i => i.name === 'dp');
  assert.deepEqual([sp.type, sp.kind, sp.wide, dp.wide], ['RAMB16', 'bram', false, true]);
  assert.deepEqual([val(sp, 'PORTA_ATTR'), val(sp, 'WRITEMODEA'), val(sp, 'INIT_A'), val(sp, 'SRVAL_A'), val(sp, 'PORTB_ATTR')], ['2048X9', 'READ_FIRST', '1A5', '05A', undefined]);
  assert.equal(val(sp, 'INIT_00'), `${'0'.repeat(48)}DEADBEEFCAFEBABE`);
  assert.equal(val(dp, 'INIT_01'), `${'0'.repeat(48)}DEADBEEFCAFEBABE`);
  assert.deepEqual([val(dp, 'PORTA_ATTR'), val(dp, 'PORTB_ATTR'), val(dp, 'INIT_A'), val(dp, 'SRVAL_B'), val(dp, 'WRITEMODEB')], ['1024X18', '512X36', '3FFFF', '987654321', 'NO_CHANGE']);
  assert.ok(cfgOf(dp).RAMB16A && cfgOf(dp).RAMB16B && cfgOf(sp).RAMB16A && !cfgOf(sp).RAMB16B);
  const pins = k => p.nets.flatMap(n => n.inpins.filter(x => x.inst === p.insts.indexOf(k)).map(x => [x.pin, n.type === 'wire' ? n.name : n.type]));
  const spPins = new Map(pins(sp));
  // a 9-bit port: 11 address bits on ADDRA3 … ADDRA13; a 36-bit port: 9 on ADDRB5 … ADDRB13
  assert.ok(spPins.has('ADDRA3') && spPins.has('ADDRA13') && !spPins.has('ADDRA2'));
  assert.ok(new Map(pins(dp)).has('ADDRB5') && !new Map(pins(dp)).has('ADDRB4'));
  // an enable tied to 1: the constant 0 through the pin's inverter (ENA_B); undriven data inputs
  // left out, the undriven parity input kept (tied to 0)
  assert.deepEqual([val(sp, 'ENAINV'), spPins.get('ENA'), val(sp, 'WEAINV')], ['ENA_B', 'gnd', 'WEA']);
  assert.ok(!spPins.has('DIA6') && !spPins.has('DIA7') && spPins.has('DIA5'));
  assert.equal(spPins.get('DIPA0'), 'gnd');
  assert.equal(val(dp, 'ENBINV'), 'ENB_B');
  same(nl, p, 300);
});

test('block RAMs: the RAMB16 port widths', () => {
  assert.deepEqual(Object.entries(BRAM_WIDTH).map(([w, x]) => [+w, x.attr, x.data + x.par, 2 ** x.addr * (x.data + x.par)]),
    [[1, '16384X1', 1, 16384], [2, '8192X2', 2, 16384], [4, '4096X4', 4, 16384], [9, '2048X9', 9, 18432], [18, '1024X18', 18, 18432], [36, '512X36', 36, 18432]]);
});

// multipliers: combinational, registered output (MULT18X18S), input / output registers (SIO)
function mults() {
  return yjson({ clk: ['input', 1], a: ['input', 6], b: ['input', 6], c: ['input', 2], p: ['output', 12] }, [
    ...clock, ...ibuf('a', 6), ...ibuf('b', 6), ...ibuf('c', 2),
    { name: 'm0', type: 'MULT18X18', conns: { A: [...bus('a_i', 6), ...Array(12).fill('a_i[5]')], B: [...bus('b_i', 6), ...Array(12).fill('0')], P: bus('p0', 36) }, outs: ['P'] },
    { name: 'm1', type: 'MULT18X18S', conns: { A: [...bus('b_i', 6), ...Array(12).fill('0')], B: [...bus('a_i', 6), ...Array(12).fill('0')], C: 'clk_g', CE: 'c_i[0]', R: 'c_i[1]', P: bus('p1', 36) }, outs: ['P'] },
    { name: 'm2', type: 'MULT18X18SIO', params: { AREG: 1, BREG: 0, PREG: 1, B_INPUT: 'DIRECT' },
      conns: { A: [...bus('a_i', 6), ...Array(12).fill('0')], B: [...bus('b_i', 6), ...Array(12).fill('b_i[5]')], BCIN: Array(18).fill('0'), CEA: 'c_i[0]', CEB: '1', CEP: '1', CLK: 'clk_g', RSTA: '0', RSTB: '0', RSTP: 'c_i[1]', P: bus('p2', 36), BCOUT: bus('bc', 18) }, outs: ['P', 'BCOUT'] },
    ...['p0[0]', 'p0[5]', 'p0[11]', 'p0[35]', 'p1[1]', 'p1[6]', 'p1[11]', 'p1[12]', 'p2[0]', 'p2[7]', 'p2[11]', 'p2[35]'].map((n, i) => obuf(`p[${i}]`, n)),
  ]);
}

test('multipliers: MULT18X18SIO sites, registers and inverters as ISE writes them, behaviour', () => {
  const nl = mults();
  const p = pack(nl);
  assert.deepEqual(p.warnings, []);
  assert.equal(p.stats.mults, 3);
  const m = n => p.insts.find(i => i.name === n);
  assert.deepEqual(['AREG', 'BREG', 'PREG', 'B_INPUT'].map(a => val(m('m0'), a)), ['0', '0', '0', 'DIRECT']);
  assert.ok(!cfgOf(m('m0')).CLKINV && !cfgOf(m('m0')).CEAINV, 'no register: no clock, no enables');
  assert.deepEqual(['AREG', 'BREG', 'PREG', 'CLKINV', 'CEPINV', 'RSTPINV'].map(a => val(m('m1'), a)), ['0', '0', '1', 'CLK', 'CEP', 'RSTP']);
  // CEB / CEP tied to 1: the constant 0 inverted
  assert.deepEqual(['AREG', 'BREG', 'PREG', 'CEAINV', 'CEBINV', 'CEPINV', 'RSTPINV'].map(a => val(m('m2'), a)), ['1', '0', '1', 'CEA', 'CEB_B', 'CEP_B', 'RSTP']);
  assert.equal(cfgOf(m('m2')).MULT18X18SIO.name, 'm2');
  same(nl, p, 300);
});

test('cells the open toolchain cannot implement yet are reported clearly', () => {
  const one = (type, conns, outs) => yjson({ clk: ['input', 1], o: ['output', 1] }, [...clock, { name: 'u', type, conns, outs }, obuf('o', 'y')]);
  const dcm = params => yjson({ clk: ['input', 1], o: ['output', 1] }, [...clock, { name: 'u', type: 'DCM_SP', params, conns: { CLKIN: 'clk_i', CLK0: 'y' }, outs: ['CLK0'] }, obuf('o', 'y')]);
  // STARTUP_WAIT is written (its bit and the COR register: bitgen.js, measured in stage F)
  const sw = pack(dcm({ STARTUP_WAIT: 'TRUE' })).insts.find(i => i.type === 'DCM');
  assert.equal(val(sw, 'STARTUP_WAIT'), 'STARTUP_WAIT');
  assert.equal(val(pack(dcm({ STARTUP_WAIT: 'FALSE' })).insts.find(i => i.type === 'DCM'), 'STARTUP_WAIT'), undefined);
  assert.throws(() => pack(dcm({ CLKIN_DIVIDE_BY_2: 'TRUE' })), /DCM_SP u: CLKIN_DIVIDE_BY_2 = TRUE is not in the bit database yet/);
  assert.throws(() => pack(dcm({ DESKEW_ADJUST: 'SOURCE_SYNCHRONOUS' })), /DESKEW_ADJUST = SOURCE_SYNCHRONOUS is not in the bit database yet/);
  assert.throws(() => pack(one('BUFGMUX', { I0: 'clk_i', I1: 'clk_i', S: 'clk_i', O: 'y' }, ['O'])), /BUFGMUX u: the open toolchain cannot switch clocks with a BUFGMUX yet/);
  const cascade = yjson({ clk: ['input', 1], o: ['output', 2] }, [...clock,
    { name: 'u', type: 'SRLC16E', conns: { A0: '0', A1: '0', A2: '0', A3: '0', CE: '1', CLK: 'clk_g', D: 'clk_i', Q: 'y', Q15: 'y15' }, outs: ['Q', 'Q15'] }, obuf('o[0]', 'y'), obuf('o[1]', 'y15')]);
  assert.throws(() => pack(cascade), /SRLC16E u: the cascade output Q15 is not supported yet/);
  assert.throws(() => pack(one('RAM32X1D', { A0: 'clk_i', O: 'y' }, ['O'])), PackError);
});

test('timing arcs: SLICEM RAM / shift register, block RAM, multiplier', () => {
  const p = pack(srls());
  const sv = p.insts.find(i => i.type === 'SLICEM' && cfgOf(i).G?.name === 'sv');
  const a = instArcs({ type: 'SLICEM', site: 'SLICE_X0Y0', cfg: sv.cfg });
  assert.ok(a.clock);
  assert.ok(a.clkToOut.some(([o]) => o === 'Y'), 'the shift register output changes after the clock');
  assert.ok(a.setup.some(([i]) => i === 'SR') && a.setup.some(([i]) => i === 'BY'));
  assert.ok(a.comb.some(([i, o]) => i === 'G1' && o === 'Y'), 'the tap address reads through the LUT');
  const b = pack(brams()).insts.find(i => i.name === 'dp');
  const ab = instArcs({ type: 'RAMB16', site: 'RAMB16_X0Y0', cfg: b.cfg });
  assert.ok(ab.clock && ab.clkToOut.some(([o]) => o === 'DOB31') && ab.setup.some(([i]) => i === 'ADDRA13'));
  const mp = pack(mults());
  const am = instArcs({ type: 'MULT18X18SIO', cfg: mp.insts.find(i => i.name === 'm0').cfg });
  assert.ok(!am.clock && am.comb.some(([i, o, d]) => i === 'A0' && o === 'P35' && d > 3));
  const ar = instArcs({ type: 'MULT18X18SIO', cfg: mp.insts.find(i => i.name === 'm2').cfg });
  assert.ok(ar.clock && ar.clkToOut.some(([o]) => o === 'P0') && ar.setup.some(([i]) => i === 'A0') && !ar.comb.length);
});

test('netlistSim: SRL16E shifts on its clock when enabled, Q is the stage at the address', () => {
  const nl = srls();
  const s = netlistSim(nl);
  // sv: INIT 0x8001, address 0 -> stage 0 (1), address 15 -> 1
  s.step({ clk: 0, 'd<0>': 0, 'd<1>': 0, ce: 0, 't<0>': 0, 't<1>': 0, 't<2>': 0, 't<3>': 0 });
  assert.equal(s.out()['q<0>'], 1);
  s.step({ clk: 1, 'd<0>': 0, ce: 0 });
  assert.equal(s.out()['q<0>'], 1, 'no shift without CE');
  s.step({ clk: 0, 'd<0>': 0, ce: 1 });
  s.step({ clk: 1, 'd<0>': 0, ce: 1 });
  assert.equal(s.out()['q<0>'], 0, 'shifted: stage 0 is the new 0');
  s.step({ clk: 1, 't<0>': 1, ce: 1 });
  assert.equal(s.out()['q<0>'], 1, 'stage 1 is the old stage 0');
});

// placement on the XC3S250E's own sites (the device description that ships with Silinx)
const { loadDeviceCache } = await import('../core/fpga/device-node.js');
const { deviceSites, place, PlaceError } = await import('../core/fpga/place.js');
let dev = null;
const device = () => (dev ||= deviceSites(loadDeviceCache('xc3s250ecp132-4')));

// n multipliers and a block RAM with a 36-bit port
function multsAndBram(n) {
  const cells = [...clock, ...ibuf('a', 9)];
  for (let k = 0; k < n; k++) {
    cells.push({ name: `m${k}`, type: 'MULT18X18', conns: { A: [...bus('a_i', 9), ...Array(9).fill('0')], B: [...bus('a_i', 9).reverse(), ...Array(9).fill('0')], P: bus(`p${k}`, 36) }, outs: ['P'] });
    cells.push(obuf(`p[${k}]`, `p${k}[${k + 3}]`));
  }
  cells.push({ name: 'r', type: 'RAMB16_S36', conns: { ADDR: bus('a_i', 9), DI: [...bus('a_i', 9), ...Array(23).fill('0')], DIP: bus('a_i', 4), DO: bus('q', 32), DOP: bus('qp', 4), CLK: 'clk_g', EN: '1', SSR: '0', WE: 'a_i[0]' }, outs: ['DO', 'DOP'] });
  cells.push(obuf('q', 'q[7]'));
  return yjson({ clk: ['input', 1], a: ['input', 9], p: ['output', n], q: ['output', 1] }, cells);
}

test('placement: block RAMs and multipliers on their sites, never a multiplier beside a block RAM with 36-bit ports', () => {
  const d = device();
  assert.deepEqual([d.brams.length, d.mults.length], [12, 12]);
  const p = pack(multsAndBram(11));
  const r = place(p, d, { seed: 2, effort: 0.2 });
  const tiles = new Map();
  p.insts.forEach((inst, k) => {
    if (inst.kind === 'bram') assert.match(r.sites[k].site, /^RAMB16_X\dY\d$/);
    if (inst.kind === 'mult') assert.match(r.sites[k].site, /^MULT18X18_X\dY\d$/);
    if (inst.kind === 'bram' || inst.kind === 'mult') { assert.ok(!tiles.get(r.sites[k].tile)?.includes(inst.kind)); tiles.set(r.sites[k].tile, [...(tiles.get(r.sites[k].tile) || []), inst.kind]); }
  });
  const bramTile = r.sites[p.insts.findIndex(i => i.kind === 'bram')].tile;
  assert.deepEqual(tiles.get(bramTile), ['bram'], 'the 36-bit block RAM has its tile to itself');
  assert.equal(new Set(r.sites.map(s => s.site)).size, r.sites.length, 'one instance per site');
  // 12 multipliers leave no tile for it
  assert.throws(() => place(pack(multsAndBram(12)), d, { seed: 1, effort: 0.1 }), err => err instanceof PlaceError && /no free block RAM site/.test(err.message));
});

test('placement: RAMs and shift registers (SLICEM instances) only on SLICEM sites', () => {
  const d = device();
  const p = pack(drams());
  const r = place(p, d, { seed: 5, effort: 0.3 });
  p.insts.forEach((inst, k) => {
    if (inst.type !== 'SLICEM') return;
    const [, x] = /^SLICE_X(\d+)Y/.exec(r.sites[k].site);
    assert.equal(+x % 2, 0, `${inst.name} on ${r.sites[k].site}`);
  });
});

test('DCM: the top-left DCM site, the settings as ISE\'s map writes them, constant inputs', () => {
  const nl = yjson({ clk: ['input', 1], o: ['output', 2] }, [
    { name: 'ib', type: 'IBUFG', conns: { I: 'clk', O: 'clk_i' }, outs: ['O'] },
    { name: 'u', type: 'DCM_SP', params: { CLKDV_DIVIDE: '2.500000', CLKFX_DIVIDE: bin(2, 32), CLKFX_MULTIPLY: bin(3, 32), CLKIN_PERIOD: '20.000000', CLK_FEEDBACK: '1X', DFS_FREQUENCY_MODE: 'LOW', DLL_FREQUENCY_MODE: 'LOW', STARTUP_WAIT: 'FALSE' },
      conns: { CLKIN: 'clk_i', CLKFB: 'c0b', RST: '0', DSSEN: '0', PSCLK: '0', PSEN: '0', PSINCDEC: '0', CLK0: 'c0', CLKFX: 'cfx', LOCKED: 'lk' }, outs: ['CLK0', 'CLKFX', 'LOCKED'] },
    { name: 'b0', type: 'BUFG', conns: { I: 'c0', O: 'c0b' }, outs: ['O'] },
    { name: 'bfx', type: 'BUFG', conns: { I: 'cfx', O: 'cfxb' }, outs: ['O'] },
    { name: 'ff', type: 'FDRE', params: { INIT: '0' }, conns: { C: 'cfxb', CE: '1', R: '0', D: 'lk', Q: 'q' }, outs: ['Q'] },
    obuf('o[0]', 'lk'), obuf('o[1]', 'q'),
  ]);
  const p = pack(nl);
  const u = p.insts.find(i => i.kind === 'dcm');
  assert.deepEqual([u.type, u.loc, p.stats.dcms], ['DCM', 'DCM_X0Y1', 1]);
  assert.deepEqual(['CLKDV_DIVIDE', 'CLKFX_MULTIPLY', 'CLKFX_DIVIDE', 'CLK_FEEDBACK', 'DESKEW_ADJUST', 'DUTY_CYCLE_CORRECTION', 'PHASE_SHIFT', 'RSTINV', 'X_CLKIN_PERIOD'].map(a => val(u, a)),
    ['2_5', '3', '2', '1X', '7', 'TRUE', '0', 'RST', '20.0000000000000000']);
  assert.equal(cfgOf(u).DCM.name, 'u');
  // the unused inputs tied to 0 as ISE's map ties them (DSSEN left open)
  const k = p.insts.indexOf(u);
  const gnd = p.nets.filter(n => n.type === 'gnd').flatMap(n => n.inpins.filter(x => x.inst === k).map(x => x.pin)).sort();
  assert.deepEqual(gnd, ['PSCLK', 'PSEN', 'PSINCDEC', 'RST']);
  // placed on the top-left DCM, its clock outputs on the global buffers their paths reach
  const r = place(p, device(), { seed: 1, effort: 0.1, bufgSites: (site, pin) => (pin === 'CLK0' ? ['BUFGMUX_X2Y10'] : pin === 'CLKFX' ? ['BUFGMUX_X1Y10'] : []) });
  assert.equal(r.sites[k].site, 'DCM_X0Y1');
  assert.equal(r.sites[p.insts.findIndex(i => i.name === 'b0')].site, 'BUFGMUX_X2Y10');
  assert.equal(r.sites[p.insts.findIndex(i => i.name === 'bfx')].site, 'BUFGMUX_X1Y10');
  assert.throws(() => place(p, device(), { seed: 1, effort: 0.1, bufgSites: () => [] }), /no free global clock buffer reachable from u\.CLK0 through switches of known bits/);
  // the output that reaches fewer buffers chooses first: CLKFX takes X1Y10, CLK0 the other one it reaches
  const r2 = place(p, device(), { seed: 1, effort: 0.1, bufgSites: (site, pin) => (pin === 'CLK0' ? ['BUFGMUX_X1Y10', 'BUFGMUX_X2Y10'] : pin === 'CLKFX' ? ['BUFGMUX_X1Y10'] : []) });
  assert.equal(r2.sites[p.insts.findIndex(i => i.name === 'bfx')].site, 'BUFGMUX_X1Y10');
  assert.equal(r2.sites[p.insts.findIndex(i => i.name === 'b0')].site, 'BUFGMUX_X2Y10');
});

test('bufgReach: each output of the top-left DCM reaches its global buffer through switches of known bits (CLK0, CLK2X, CLKDV, CLKFX)', async () => {
  const { bufgReach } = await import('../core/fpga/route.js');
  const { knownRouting } = await import('../core/fpga/bitgen.js');
  const { loadDb } = await import('../research/s3e-bitstream/db.mjs');
  const known = knownRouting(loadDb());
  const g = loadDeviceCache('xc3s250ecp132-4');
  const got = Object.fromEntries(['CLK0', 'CLK2X', 'CLKDV', 'CLKFX', 'CLK90', 'CLKFX180'].map(p => [p, bufgReach(g, 'DCM_X0Y1', p, known.allowPip)]));
  // (the DCM pins' switches measured in stage F of research/s3e-bitstream add CLK0 -> X2Y11 and CLKFX -> X1Y11)
  assert.deepEqual(got, { CLK0: ['BUFGMUX_X2Y11', 'BUFGMUX_X2Y10'], CLK2X: ['BUFGMUX_X1Y11'], CLKDV: ['BUFGMUX_X2Y11'], CLKFX: ['BUFGMUX_X1Y11', 'BUFGMUX_X1Y10'], CLK90: [], CLKFX180: [] });
  // without the restriction: the four buffers of the top edge
  assert.deepEqual(bufgReach(g, 'DCM_X0Y1', 'CLK90').sort(), ['BUFGMUX_X1Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X2Y10', 'BUFGMUX_X2Y11']);
});
