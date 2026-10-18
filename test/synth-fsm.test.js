// FSM extraction and re-encoding (#438, research/synth-quality/fsm.mjs): the measurement's parsers of Yosys's
// messages and files (fsm_detect's log, fsm_recode's -encfile, RTLIL's init attributes), XST's report, the new
// power-up state of a re-encoded machine, and a machine extracted with Yosys from the open synthesis's own script,
// equal to the RTL from power-up in each encoding, with its exact warnings; and the tables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { parseDetect, chosen, markWires, parseEncfile, newInit, setInits, fsmRun, detectTable, resultsTable, WAYS } from '../research/synth-quality/fsm.mjs';
import { parseSyrFsms } from '../research/synth-quality/fsm-ise.mjs';
import { compareNetlist } from './diff-synth.js';

test('FSM measurement: fsm_detect\'s messages, the registers each way extracts', () => {
  const lines = [
    '13. Executing FSM_DETECT pass (finding FSMs in design).',
    'Not marking top.u_timer.timed as FSM state register:',
    "    Users of register don't seem to benefit from recoding.",
    'Found FSM state register top.u_fsm.state_reg.',
    'Not marking top.st_id as FSM state register:',
    '    Register is connected to module port.',
    "    Users of register don't seem to benefit from recoding.",
    'Not marking top.cnt as FSM state register:',
    '    Register has an initialization value.',
    'Not marking top.odd as FSM state register:',
    '    Register is connected to module port.',
    '    Circuit seems to be self-resetting.',
    'Found FSM state register top.top.inner.',
  ];
  const det = parseDetect(lines, 'top');
  assert.deepEqual(det.marked, ['u_fsm.state_reg', 'top.inner']);   // (only the module's own prefix is taken off)
  assert.deepEqual(det.refused.map(r => r.wire), ['u_timer.timed', 'st_id', 'cnt', 'odd']);
  assert.deepEqual(det.refused[1].reasons, ['Register is connected to module port.', "Users of register don't seem to benefit from recoding."]);
  assert.deepEqual(chosen('stock', det), []);
  assert.deepEqual(chosen('base', det), []);
  assert.deepEqual(chosen('onehot', det), ['u_fsm.state_reg', 'top.inner']);
  assert.deepEqual(chosen('binary', det), ['u_fsm.state_reg', 'top.inner']);
  // a port's register too, but not one refused for another reason as well (odd: self-resetting)
  assert.deepEqual(chosen('onehot-port', det), ['u_fsm.state_reg', 'top.inner', 'st_id']);
  assert.deepEqual(parseDetect([], 'top'), { marked: [], refused: [] });
  assert.deepEqual(WAYS, ['stock', 'base', 'binary', 'onehot', 'onehot-port']);
});

test('FSM measurement: the init values taken off and given back in the RTLIL, the new code of the init state', () => {
  const il = [
    'module \\top',
    '  attribute \\src "top_syn.v:12"',
    '  attribute \\init 3\'010',
    '  wire width 3 \\u_fsm.state_reg',
    '  attribute \\init 1\'1',
    '  wire \\keep',
    '  attribute \\init 2\'01',
    '  wire width 2 $auto$x',
    'end',
  ].join('\n');
  const { il: marked, inits } = markWires(il, ['u_fsm.state_reg', '$auto$x']);
  assert.deepEqual(inits, { '\\u_fsm.state_reg': "3'010", '$auto$x': "2'01" });
  assert.equal(marked, [
    'module \\top',
    '  attribute \\src "top_syn.v:12"',
    '  attribute \\fsm_encoding "auto"',
    '  wire width 3 \\u_fsm.state_reg',
    '  attribute \\init 1\'1',
    '  wire \\keep',
    '  attribute \\fsm_encoding "auto"',
    '  wire width 2 $auto$x',
    'end',
  ].join('\n'));
  // fsm_recode's -encfile (one-hot with don't-cares), the init state's new code with the don't-cares 0
  const enc = parseEncfile('.fsm top u_fsm.state_reg\n.map 000 ------1\n.map 010 ----1--\n.map 110 ---1---\n.fsm top other\n.map 01 10\n');
  assert.deepEqual(Object.keys(enc), ['u_fsm.state_reg', 'other']);
  assert.deepEqual(enc['u_fsm.state_reg'][1], ['010', '----1--']);
  assert.equal(newInit("3'010", enc['u_fsm.state_reg']), "7'0000100");
  assert.equal(newInit("3'000", enc['u_fsm.state_reg']), "7'0000001");
  assert.equal(newInit("3'10", enc['u_fsm.state_reg']), "7'0000100");      // (Yosys leaves the leading zeros out)
  assert.equal(newInit("3'111", enc['u_fsm.state_reg']), null);            // not one of the states (fsm_opt dropped it)
  assert.equal(newInit("3'0x0", enc['u_fsm.state_reg']), null);            // unknown bits
  assert.equal(newInit(undefined, enc['u_fsm.state_reg']), null);
  assert.deepEqual(parseEncfile(''), {});
  // the re-encoded register (7 bits now) gets its new init; a width that does not match is an error
  const post = 'module \\top\n  wire width 7 \\u_fsm.state_reg\n  wire \\keep\nend';
  assert.equal(setInits(post, { '\\u_fsm.state_reg': "7'0000100" }), "module \\top\n  attribute \\init 7'0000100\n  wire width 7 \\u_fsm.state_reg\n  wire \\keep\nend");
  assert.equal(setInits(post, { '\\keep': "1'1" }), "module \\top\n  wire width 7 \\u_fsm.state_reg\n  attribute \\init 1'1\n  wire \\keep\nend");
  assert.throws(() => setInits(post, { '\\u_fsm.state_reg': "3'010" }), /u_fsm\.state_reg has 7 bits, its new init 3'010/);
});

test('FSM measurement: XST\'s state machines and the encodings it chose, from its report', () => {
  const syr = [
    'Synthesizing Unit <traffic>.',
    '    Found finite state machine <FSM_0> for signal <state_reg>.',
    '    -----------------------------------------------------------------------',
    '    | States             | 7                                              |',
    '    | Transitions        | 15                                             |',
    '    | Encoding           | automatic                                      |',
    '    -----------------------------------------------------------------------',
    '    Found finite state machine <FSM_1> for signal <rx_state>.',
    '    | States             | 4                                              |',
    'Analyzing FSM <FSM_0> for best encoding.',
    'Optimizing FSM <u_fsm/state_reg/FSM> on signal <state_reg[1:7]> with one-hot encoding.',
    'Optimizing FSM <u_rx/rx_state/FSM> on signal <rx_state[1:2]> with gray encoding.',
  ].join('\n');
  const r = parseSyrFsms(syr);
  assert.deepEqual(r.found, [{ fsm: 'FSM_0', signal: 'state_reg', states: 7 }, { fsm: 'FSM_1', signal: 'rx_state', states: 4 }]);
  assert.deepEqual(r.chose, [
    { fsm: 'u_fsm/state_reg/FSM', signal: 'state_reg[1:7]', encoding: 'one-hot' },
    { fsm: 'u_rx/rx_state/FSM', signal: 'rx_state[1:2]', encoding: 'gray' },
  ]);
  assert.deepEqual(parseSyrFsms('Synthesizing Unit <top>.\n'), { found: [], chose: [] });
});

// a machine of 4 states with no reset: only its declared initial value (S1, not the first: code 01) starts it
const FSM_VHDL = `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk, go, back : in std_logic; y, z : out std_logic); end entity;
architecture rtl of top is
  type st_t is (S0, S1, S2, S3);
  signal st : st_t := S1;
begin
  process (clk) begin
    if rising_edge(clk) then
      case st is
        when S0 => if go = '1' then st <= S1; end if;
        when S1 => if go = '1' then st <= S2; elsif back = '1' then st <= S0; end if;
        when S2 => if back = '1' then st <= S1; else st <= S3; end if;
        when S3 => if go = '0' then st <= S0; end if;
      end case;
    end if;
  end process;
  y <= '1' when st = S1 or st = S3 else '0';
  z <= '1' when st = S2 else '0';
end architecture;
`;

test('FSM measurement with Yosys: a machine with an initial value extracted, re-encoded, equal to the RTL from power-up', { timeout: 300000 }, async () => {
  const { yosysNode } = await import('../core/synth-open-node.js');
  const { synthesizeOpen, utilization } = await import('../core/synth-open.js');
  const design = elaborate(compile([{ path: 'top.vhd', lang: 'vhdl', text: FSM_VHDL }]), 'top');
  const sim = { cycles: 200, clock: 'clk' };
  const got = {};
  for (const way of ['stock', 'base', 'binary', 'onehot']) {
    const rec = [];
    const syn = await synthesizeOpen(design, { run: fsmRun(yosysNode, way, rec), effort: 'normal' });
    got[way] = { ffs: utilization(syn.cells).flipFlops, rec: rec[0] };
    assert.deepEqual(syn.warnings, [], `${way}: no warnings`);
    for (const s of [sim, { ...sim, resetCycles: 0 }]) {
      const r = compareNetlist(design, syn, { name: way, seed: way, sim: s });
      assert.equal(r.status, 'pass', `${way}: ${r.report || r.reason}`);
    }
  }
  // today: the state register is refused for its initial value; without it, fsm_detect marks it
  assert.equal(got.stock.rec, undefined);
  assert.deepEqual(got.base.rec.now, { marked: [], refusedInit: ['st'] });
  assert.deepEqual(got.base.rec.detect, { marked: ['st'], refused: [] });
  assert.deepEqual(got.base.rec.fsms, []);
  assert.equal(got.stock.ffs, 2);
  assert.equal(got.base.ffs, 2);
  // binary: extracted, its codes kept (already packed binary), its init too
  assert.deepEqual(got.binary.rec.fsms, [{ wire: 'st', states: 4, bitsBefore: null, bitsAfter: null, recoded: false, init: "2'01", newInit: "2'01", reset: null }]);
  assert.equal(got.binary.ffs, 2);
  // one-hot: 4 flip-flops, S1's set at power-up (its bit: the order in which fsm_extract found the state codes)
  assert.deepEqual(got.onehot.rec.fsms, [{ wire: 'st', states: 4, bitsBefore: 2, bitsAfter: 4, recoded: true, init: "2'01", newInit: "4'0100", reset: null }]);
  assert.deepEqual(got.onehot.rec.notExtracted, []);
  assert.equal(got.onehot.ffs, 4);
});

test('FSM measurement: the tables, the geometric means against base', () => {
  const det = {
    a: { now: { marked: [], refusedInit: ['st'] }, detect: { marked: ['st'], refused: [{ wire: 'cnt', reasons: ["Users of register don't seem to benefit from recoding."] }] } },
    b: { now: { marked: ['s'], refusedInit: [] }, detect: { marked: ['s'], refused: [{ wire: 'id', reasons: ['Register is connected to module port.'] }] } },
    c: { now: { marked: [], refusedInit: [] }, detect: { marked: [], refused: [] } },
    d: { error: 'front end: x' },
  };
  const t = detectTable(det);
  assert.match(t, /^\| a \| 0 \| 1 \| 1 \(`st`\) \| 0 \| 1 \| 0 \|$/m);
  assert.match(t, /^\| b \| 1 \| 0 \| 1 \(`s`\) \| 1 \| 0 \| 0 \|$/m);
  assert.doesNotMatch(t, /^\| c \|/m);
  assert.match(t, /^\| d \| \(front end: x\) \|/m);
  assert.match(t, /^\| \*\*all 4 designs\*\* \| \*\*1\*\* \| \*\*1\*\* \| \*\*2\*\* \(in 2 designs\) \| 1 \| 1 \| 0 \|$/m);
  const res = {
    a: {
      base: { luts: 100, ffs: 10, slices: 50, period: 10, diff: 'pass', diffPowerUp: 'pass' },
      onehot: { luts: 81, ffs: 14, slices: 40, period: 8, fsms: [{ states: 4, bitsBefore: 2, bitsAfter: 4, recoded: true }], diff: 'pass', diffPowerUp: 'pass' },
      'onehot-port': { same: 'onehot' },
    },
    b: {
      base: { luts: 200, ffs: 20, slices: 100, period: 20 },
      onehot: { luts: 200, ffs: 20, slices: 125, period: 20, fsms: [{ states: 3, recoded: false }] },
      'onehot-port': { error: 'route: 1 nets unrouted' },
    },
  };
  const r = resultsTable(res, ['base', 'onehot', 'onehot-port'], { a: { luts: 90, ffs: 12, slices: 45, periodNs: 7.5 } });
  assert.match(r, /^\| a \| onehot \| 4: 2→4 \| 81 \| 14 \| 40 \| 8\.00 \| −20\.0 % \| −20\.0 % \| pass \/ pass \|$/m);
  assert.match(r, /^\| a \| onehot-port \| as onehot \|/m);
  assert.match(r, /^\| a \| XST \|  \| 90 \| 12 \| 45 \| 7\.50 \|/m);
  assert.match(r, /^\| b \| onehot \| 3: kept \| 200 \| 20 \| 125 \| 20\.00 \| \+25\.0 % \| \+0\.0 % \| – \/ – \|$/m);
  assert.match(r, /^\| b \| onehot-port \| \(route: 1 nets unrouted\) \|/m);
  // a alone is measured every way (onehot-port as onehot); b's onehot-port failed
  assert.match(r, /\(1 designs measured every way\)/);
  assert.match(r, /^- onehot: 0\.810 \/ 1\.400 \/ 0\.800 \/ 0\.800$/m);
});
