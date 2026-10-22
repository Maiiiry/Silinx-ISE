// The parts of wordLevel (#405: out of core/compiled-words.js): the cells of one bit and the carry chains
// (compiled-words-bits.js) and the registers proposed (compiled-words-regs.js), on the gate-level netlist of an 8-bit
// counter with enable and reset (test/fixtures/compiled-sim/words-up.json, as Yosys reads its LUTs, MUXCY / XORCY
// chain and FDREs): its one chain of seven stages (the eighth folded), each bit's driver, its eight flip-flops of one
// bit; through wordLevel, the chain an addition and the flip-flops one register: 40 cells, 9 after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wordLevel } from '../core/compiled-words.js';
import { mountBitCells } from '../core/compiled-words-bits.js';
import { mountRegisterProposals } from '../core/compiled-words-regs.js';

const UP = JSON.parse(fs.readFileSync(new URL('./fixtures/compiled-sim/words-up.json', import.meta.url), 'utf8'));

test('#405 wordLevel parts: the cells of one bit and the carry chains, mounted alone', () => {
  const json = structuredClone(UP), mod = json.modules.up;
  const b = mountBitCells({ cells: mod.cells, mod });
  assert.deepEqual(b.chains.map(ch => ch.length), [7]);
  assert.deepEqual(Object.keys(b.chains[0][0]), ['name', 'carry', 's', 'inv', 'di', 'out', 'xor']);
  assert.ok(b.chains[0].every(st => st.xor), 'every stage with its XOR');
  assert.equal(b.driver.size, Object.keys(mod.cells).length);
  const ffs = Object.values(mod.cells).filter(b.ff1);
  assert.equal(ffs.length, 8);
  assert.equal(new Set(ffs.map(b.ffKey)).size, 1, 'one kind of flip-flop');
  assert.equal(typeof mountRegisterProposals, 'function');
});

test('#405 wordLevel parts, through wordLevel: the chain an addition, the flip-flops one register', () => {
  const w = wordLevel(structuredClone(UP), 'up');
  assert.deepEqual(w.stats, { chains: 1, registers: 1, cells: [40, 9] });
  const types = Object.values(w.json.modules.up.cells).map(c => c.type + (c.parameters?.WIDTH > 1 || c.parameters?.A_WIDTH > 1 ? ' word' : ''));
  assert.ok(types.includes('$add word') && types.includes('$dff word'), types.join(', '));
  // (the bits keep their numbers: the netlist's nets and ports)
  assert.deepEqual(w.json.modules.up.ports, UP.modules.up.ports);
});
