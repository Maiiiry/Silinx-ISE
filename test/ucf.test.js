import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateUcf, parseUcf, expandPort, normalizePort, periodNs, bitName, ucfPortName, boardAutoAssign } from '../core/ucf.js';

test('bus naming: led[7:0] bit 3 -> led<3>', () => {
  assert.equal(bitName('led', 3), 'led<3>');
  assert.equal(bitName('clk'), 'clk');
  assert.deepEqual(expandPort('led[3:0]'), ['led<0>', 'led<1>', 'led<2>', 'led<3>']);
  assert.deepEqual(expandPort({ name: 'd', width: 2 }), ['d<0>', 'd<1>']);
  assert.deepEqual(expandPort('clk'), ['clk']);
  assert.deepEqual(normalizePort('x[0:3]'), { name: 'x', msb: 0, lsb: 3, width: 4, bus: true });
  assert.deepEqual(expandPort('x[0:3]'), ['x<3>', 'x<2>', 'x<1>', 'x<0>']);
});

test('periodNs units', () => {
  assert.equal(periodNs(20), 20);
  assert.equal(periodNs('20 ns'), 20);
  assert.equal(periodNs('50 MHz'), 20);
  assert.equal(periodNs('1 us'), 1000);
});

test('generateUcf emits LOC/IOSTANDARD/pull/drive/slew and timing', () => {
  const ucf = generateUcf({
    ports: ['clk', 'led[1:0]', 'btn'],
    assignments: {
      clk: { loc: 'c9', iostandard: 'LVCMOS33' },
      'led<0>': { loc: 'F12', iostandard: 'LVTTL', drive: 8, slew: 'slow' },
      'led<1>': { loc: 'E12', iostandard: 'LVTTL', drive: 8, slew: 'slow' },
      sw: { loc: 'L13', pull: 'up' },
    },
    clocks: [{ net: 'clk', period: '50 MHz' }],
  });
  assert.match(ucf, /NET "clk"\s+LOC = "C9" \| IOSTANDARD = LVCMOS33 ;/);
  assert.match(ucf, /NET "led<0>"\s+LOC = "F12" \| IOSTANDARD = LVTTL \| DRIVE = 8 \| SLEW = SLOW ;/);
  assert.match(ucf, /# NET "btn"\s+LOC = "" ;\s+# unassigned/);
  assert.match(ucf, /NET "sw"\s+LOC = "L13" \| PULLUP ;\s+# not a port/);
  assert.match(ucf, /NET "clk" TNM_NET = "clk" ;/);
  assert.match(ucf, /TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;/);
});

test('generateUcf CLOCK_DEDICATED_ROUTE and pulldown', () => {
  const ucf = generateUcf({ assignments: { mclk: { loc: 'B8', clockDedicatedRoute: false }, b: { loc: 'H13', pull: 'down' } } });
  assert.match(ucf, /NET "mclk"\s+CLOCK_DEDICATED_ROUTE = FALSE ;/);
  assert.match(ucf, /NET "b"\s+LOC = "H13" \| PULLDOWN ;/);
});

test('parseUcf round trip', () => {
  const assignments = {
    clk: { loc: 'C9', iostandard: 'LVCMOS33' },
    'led<0>': { loc: 'F12', iostandard: 'LVTTL', drive: 8, slew: 'slow' },
    'sw<0>': { loc: 'L13', iostandard: 'LVTTL', pull: 'up' },
    btn: { loc: 'H13', pull: 'down' },
  };
  const text = generateUcf({ assignments, clocks: [{ net: 'clk', period: 20 }] });
  const r = parseUcf(text);
  assert.deepEqual(r.assignments, assignments);
  assert.deepEqual(r.clocks, [{ net: 'clk', name: 'TS_clk', tnm: 'clk', period: 20, duty: 50 }]);
  assert.deepEqual(r.other, []);
});

test('parseUcf handles vendor style files, comments, multi-line, inline PERIOD', () => {
  const r = parseUcf(`
# Spartan-3E starter kit
NET "CLK_50MHZ" LOC = "C9"  | IOSTANDARD = LVCMOS33 ;
NET "CLK_50MHZ" PERIOD = 20.0ns HIGH 40%;
NET "LED<0>" LOC = "F12" | IOSTANDARD = LVTTL | SLEW = SLOW
   | DRIVE = 8 ; # trailing comment
NET ROT_A LOC = K18 | IOSTANDARD = LVTTL | PULLUP;
NET "mclk" CLOCK_DEDICATED_ROUTE = FALSE;
INST "u0" LOC = "SLICE_X0Y0";
NET "x" TNM_NET = "grp_x";
TIMESPEC "TS_x" = PERIOD "grp_x" 10 ns LOW 30 %;
`);
  assert.deepEqual(r.assignments['CLK_50MHZ'], { loc: 'C9', iostandard: 'LVCMOS33' });
  assert.deepEqual(r.assignments['LED<0>'], { loc: 'F12', iostandard: 'LVTTL', slew: 'slow', drive: 8 });
  assert.deepEqual(r.assignments.ROT_A, { loc: 'K18', iostandard: 'LVTTL', pull: 'up' });
  assert.equal(r.assignments.mclk.clockDedicatedRoute, false);
  assert.deepEqual(r.clocks[0], { net: 'CLK_50MHZ', period: 20, duty: 40 });
  assert.deepEqual(r.clocks[1], { net: 'x', name: 'TS_x', tnm: 'grp_x', period: 10, duty: 70 });
  assert.equal(r.other.length, 1);
  assert.match(r.other[0], /^INST "u0"/);
});

test('boardAutoAssign maps blinky ports to the Basys2 and locsNotOnBoard flags foreign pins', async () => {
  const { boardAutoAssign, locsNotOnBoard, generateUcf, parseUcf } = await import('../core/ucf.js');
  const { resolveBoard } = await import('../server/devices.js');
  const rb = resolveBoard('basys2');
  const board = { ...rb.board, device: rb.device, resources: rb.resources };
  const ports = [{ name: 'clk', dir: 'in', width: 1, msb: null, lsb: null }, { name: 'sw', dir: 'in', width: 4, msb: 3, lsb: 0 }, { name: 'led', dir: 'out', width: 8, msb: 7, lsb: 0 }, { name: 'foo', dir: 'out', width: 1 }];
  const r = boardAutoAssign(ports, board);
  assert.equal(r.assignments.clk.loc, 'B8');
  assert.equal(r.assignments['sw<3>'].loc, 'B4');
  assert.equal(r.assignments['led<7>'].loc, 'G1');
  assert.deepEqual(r.unmatched, ['foo']);
  // the I/O standard is left at the default: no IOSTANDARD written
  assert.ok(Object.values(r.assignments).every(a => a.iostandard === undefined));
  assert.doesNotMatch(generateUcf({ ports, assignments: r.assignments, clocks: r.clocks }), /IOSTANDARD/);
  const ucf = parseUcf(generateUcf({ ports, assignments: r.assignments, clocks: r.clocks }));
  assert.deepEqual(locsNotOnBoard(ucf.assignments, board), []);
  assert.deepEqual(locsNotOnBoard({ 'led<1>': { loc: 'E12' } }, board), [{ net: 'led<1>', loc: 'E12' }]);
});

// ---- checkUcf
import { checkUcf } from '../core/ucf.js';
const PORTS = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'led', dir: 'out', width: 8, msb: 7, lsb: 0 }, { name: 'sw', dir: 'in', width: 4, msb: 3, lsb: 0 }];
const chk = (t, o = {}) => checkUcf(t, { top: 'top', ports: PORTS, iostandards: ['LVCMOS33', 'LVTTL'], package: 'cp132', ...o });

test('checkUcf: a correct file has no diagnostics', () => {
  const t = 'NET "clk" LOC = "B8" | IOSTANDARD = LVCMOS33;\n' + [0, 1, 2, 3, 4, 5, 6, 7].map(i => `NET "led<${i}>" LOC = M${i + 1} | DRIVE = 8 | SLEW = SLOW;`).join('\n') +
    '\n' + [0, 1, 2, 3].map(i => `NET "sw<${i}>" LOC = P${i + 1};`).join('\n') + '\nNET "clk" TNM_NET = "clk";\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50%;\n';
  assert.deepEqual(chk(t), []);
});

test('checkUcf: unknown nets, bus bits, duplicate pins, values and syntax are reported on their line', () => {
  const t = 'NET "led<9>" LOC = M1;\nNET "foo" LOC = A1;\nNET "sw" LOC = C3;\nNET "clk" LOC = M1 | DRIVE = 7;\nNET "led<1>" IOSTANDARD = LVDS_99;\nTIMESPEC TS = PERIOD "nope" 20 ns;\nLOC x;\nNET "clk<0>" PULLUP;\nNET "led<2>" LOC = M3';
  const d = chk(t);
  const at = (line, re) => assert.ok(d.some(x => x.line === line && x.severity === 'error' && re.test(x.message)), `line ${line}: ${re}\n${JSON.stringify(d, null, 1)}`);
  at(1, /out of range/);
  at(2, /does not exist in the top module/);
  at(3, /4-bit bus/);
  at(4, /already assigned to NET "led<9>"/);
  at(4, /invalid DRIVE/);
  at(5, /IOSTANDARD 'LVDS_99'/);
  at(6, /timing group "nope"/);
  at(7, /not a UCF statement/);
  at(8, /single bit/);
  at(9, /missing ';'/);
});

// #34: XST's names of escaped Verilog identifiers, measured with ISE 14.7 (the netlist's port names
// and the UCF names ngdbuild finds)
test('ucfPortName / bitName: XST\'s netlist names of escaped ports (measured with ISE)', () => {
  const xst = {
    'opcode[0]': '_opcode[0]_', 'res[0]': '_res[0]_', '1abc': '_1abc_', 'a[1:0]': '_a[1:0]_', 'm(2)': '_m(2)_', 'n<4>': '_n<4>_', 'A[0]': '_A[0]_',
    'a+b': '_a_b_', 'foo.bar': '_foo_bar_', 'x/y': '_x_y_', 'p~z': '_p_z_', 'p^z': '_p_z_', 'p*z': '_p_z_', 'p=z': '_p_z_', 'p%z': '_p_z_', 'p&z': '_p_z_', 'p\\z': '_p_z_', 'w[0]$x': '_w[0]_x_', '9$': '_9__',
    'p-z': '_p-z_', 'p{z': '_p{z_', 'p}z': '_p}z_', 'p:z': '_p:z_', 'p;z': '_p;z_', 'p#z': '_p#z_', 'p|z': '_p|z_', 'p@z': '_p@z_', 'p?z': '_p?z_', 'p!z': '_p!z_', "p'z": "_p'z_", 'p`z': '_p`z_', 'p,z': '_p,z_',
    plain: 'plain', _q_: '_q_', 'b$c': 'b_c', 'q$': 'q_', clk: 'clk',
  };
  for (const [hdl, net] of Object.entries(xst)) assert.equal(ucfPortName(hdl), net, hdl);
  assert.equal(bitName('opcode[0]'), '_opcode[0]_');
  assert.equal(bitName('v.x', 1), '_v_x_<1>');
  assert.deepEqual(expandPort({ name: 'v.x', msb: 1, lsb: 0 }), ['_v_x_<0>', '_v_x_<1>']);
  assert.deepEqual(expandPort({ name: 'opcode[0]' }), ['_opcode[0]_']);
  // a UCF written for such ports, and the board's automatic pins
  const ports = [{ name: 'opcode[0]', dir: 'in' }, { name: 'v.x', dir: 'in', msb: 1, lsb: 0 }];
  assert.match(generateUcf({ ports, assignments: { '_opcode[0]_': { loc: 'A1' }, '_v_x_<1>': { loc: 'B2' } } }),
    /^NET "_opcode\[0\]_" LOC = "A1" ;\n# NET "_v_x_<0>" +LOC = "" ; {2}# unassigned\nNET "_v_x_<1>" +LOC = "B2" ;$/m);
  const board = { name: 'B', resources: [{ name: 'clk$', group: 'Clock', pins: ['B8'], extra: { period: '20 ns' } }] };
  const auto = boardAutoAssign([{ name: 'clk$', width: 1 }], board);
  assert.deepEqual(auto.assignments, { clk_: { loc: 'B8' } });
  assert.deepEqual(auto.clocks, [{ net: 'clk_', period: 20, duty: 50 }]);
});

test('checkUcf: escaped ports by XST\'s names are accepted; by their HDL names, an error as in ngdbuild (#34)', () => {
  const ports = [{ name: 'opcode[0]', dir: 'in' }, { name: 'opcode[1]', dir: 'in' }, { name: 'v.x', dir: 'in', msb: 1, lsb: 0 }, { name: 'b$c', dir: 'in' }, { name: 'clk', dir: 'in' }];
  const c = t => checkUcf(t, { top: 'top', ports, lang: 'verilog', package: 'cp132' }).map(d => `${d.line}:${d.col} ${d.severity}: ${d.message}`);
  assert.deepEqual(c('NET "_opcode[0]_" LOC = "A1" ;\nNET "_opcode[1]_" LOC = "A2" ;\nNET "_v_x_<0>" LOC = "A3" ;\nNET "_v_x_<1>" LOC = "B3" ;\nNET "b_c" LOC = "B1";\nNET "clk" LOC = "C8";\n'), []);
  assert.deepEqual(c('NET "opcode[0]" LOC = "A1" ;\nNET "\\opcode[1]" LOC = "A2" ;\nNET "v.x<0>" LOC = "A3" ;\nNET "_v_x_" LOC = "B3" ;\nNET "b$c" LOC = "B1";\nNET "_OPCODE[1]_" LOC = "B2";\n'), [
    '1:6 error: NET "opcode[0]" is not found by ISE: XST names the port \'opcode[0]\' _opcode[0]_ in its netlist (use NET "_opcode[0]_")',
    '2:6 error: NET "\\opcode[1]" is not found by ISE: XST names the port \'opcode[1]\' _opcode[1]_ in its netlist (use NET "_opcode[1]_")',
    '3:6 error: NET "v.x<0>" is not found by ISE: XST names the port \'v.x\' _v_x_ in its netlist (use NET "_v_x_<0>")',
    '4:6 error: \'_v_x_\' is a 2-bit bus: constrain each bit (NET "_v_x_<0>" …)',
    '5:6 error: NET "b$c" is not found by ISE: XST names the port \'b$c\' b_c in its netlist (use NET "b_c")',
    '6:1 warning: 5 port bit(s) of \'top\' have no LOC: _opcode[0]_, _v_x_<0>, _v_x_<1>, b_c, clk',
    '6:6 error: NET "_OPCODE[1]_": the port is called \'_opcode[1]_\' (UCF names are case-sensitive for Verilog designs)',
  ]);
});

test('checkUcf: timing constraints on internal nets are warnings; QFP pins and board pins are checked', () => {
  assert.equal(chk('NET "cnt_en" TNM_NET = "x";\nTIMEGRP "x" = FFS;').filter(d => d.severity === 'error').length, 0);
  assert.ok(chk('NET "clk" LOC = P200;', { package: 'vq100' }).some(d => d.severity === 'error' && /P1…P100/.test(d.message)));
  const board = { name: 'B', resources: [{ name: 'clk', pins: ['B8'] }] };
  assert.match(checkUcf('NET "clk" LOC = C9;', { top: 'top', ports: [PORTS[0]], board })[0].message, /not connected to any resource/);
});

test('parseUcf: bus bits written as a(0) or a[0] map to a<0>', () => {
  const a = parseUcf('NET "sw(0)" LOC = "P11";\nNET sw[1] LOC = L3;\nNET "led<2>" LOC = "P7";').assignments;
  assert.equal(a['sw<0>'].loc, 'P11');
  assert.equal(a['sw<1>'].loc, 'L3');
  assert.equal(a['led<2>'].loc, 'P7');
});

test('parseUcf -> generateUcf keeps INST/OFFSET/TIMEGRP, derived TIMESPECs and their TNM_NETs', () => {
  const src = `NET "clk" LOC = "C9" | IOSTANDARD = LVCMOS33;
NET "clk" TNM_NET = "clk";
TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50%;
NET "clk2" TNM_NET = "clk2";
TIMESPEC "TS_clk2" = PERIOD "clk2" TS_clk / 2;
TIMESPEC "TS_clk4" = PERIOD "clk4" "TS_clk" * 4 PHASE 1 ns;
INST "u_ram" LOC = RAMB16_X0Y0;
NET "din<*>" OFFSET = IN 5 ns BEFORE "clk";
TIMEGRP "fast" = FFS(u_core/*);
NET "a" LOC = "P11" | IOB = TRUE;
`;
  const u = parseUcf(src);
  assert.deepEqual(u.clocks, [{ net: 'clk', name: 'TS_clk', tnm: 'clk', period: 20, duty: 50 }]);   // not 2 ns, not 4 ns
  assert.deepEqual(u.other, [
    'NET "clk2" TNM_NET = "clk2"',
    'TIMESPEC "TS_clk2" = PERIOD "clk2" TS_clk / 2',
    'TIMESPEC "TS_clk4" = PERIOD "clk4" "TS_clk" * 4 PHASE 1 ns',
    'INST "u_ram" LOC = RAMB16_X0Y0',
    'NET "din<*>" OFFSET = IN 5 ns BEFORE "clk"',
    'TIMEGRP "fast" = FFS(u_core/*)',
    'NET "a" IOB = TRUE',
  ]);
  const out = generateUcf({ assignments: u.assignments, clocks: u.clocks, other: u.other });
  for (const o of u.other) assert.ok(out.includes(`${o} ;`), o);
  const again = parseUcf(out);
  assert.deepEqual(again.assignments, u.assignments);
  assert.deepEqual(again.clocks, u.clocks);
  assert.deepEqual(again.other, u.other);
  assert.deepEqual(checkUcf(out).filter(d => d.severity === 'error' && !/clk4/.test(d.message)), []);
});

test('parseUcf does not throw on attributes without a value (kept verbatim)', () => {
  const u = parseUcf('NET "a" LOC;\nNET "b" SLEW;\nNET "c" IOSTANDARD | LOC = P3;\nNET "d" DRIVE = x;\nNET "e" LOC = "";');
  assert.deepEqual(u.assignments, { c: { loc: 'P3' } });
  assert.deepEqual(u.other, ['NET "a" LOC', 'NET "b" SLEW', 'NET "c" IOSTANDARD', 'NET "d" DRIVE = x', 'NET "e" LOC = ""']);
  assert.ok(checkUcf('NET "a" LOC;').some(d => /LOC needs a value/.test(d.message)));
});

test('checkUcf positions are right after comments with emoji (astral characters)', () => {
  const d = checkUcf('# pins \u{1F389}\u{1F389} for the board\nNET "a" LOC = A1 | DRIVE = 7;\n');
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].line, d[0].col], [2, 28]);
  assert.match(d[0].message, /invalid DRIVE/);
});
