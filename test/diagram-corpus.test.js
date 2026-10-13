// The diagram corpus (#205): state machines written for it in KISS2, the format of the FSM benchmarks
// (test/diagram-corpus/fsm/, Silinx's own, AGPL-3.0-only), each one through every way Silinx makes
// hardware of it:
//   - read (core/kiss2.js), written back the same, its exact warnings (expected.json);
//   - the generated HDL, VHDL and Verilog, every encoding and style, simulated against the model with
//     random inputs; the same machine as an ASM chart (fsmToAsm), its HDL simulated too;
// SILINX_UPDATE_CORPUS=1 records the warnings found as the expectations.
// npm run test:diagrams (test/diagram-corpus/*.test.js, not in npm test: minutes, and the network):
// the same machines synthesized by Yosys, and the Petri nets of the Model Checking Contest.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromKiss2, toKiss2 } from '../core/kiss2.js';
import { validateFsm, generateFsm, fsmToAsm, FSM_ENCODINGS, FSM_STYLES } from '../core/fsm.js';
import { validate as validateAsm, generate as generateAsm } from '../core/asm.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'diagram-corpus');
const EXPECTED = path.join(DIR, 'expected.json');
const UPDATE = process.env.SILINX_UPDATE_CORPUS === '1';
const expected = JSON.parse(fs.readFileSync(EXPECTED, 'utf8'));
const found = { fsm: {} };
const machines = fs.readdirSync(path.join(DIR, 'fsm')).filter(f => f.endsWith('.kiss2')).sort();
const kiss = f => fs.readFileSync(path.join(DIR, 'fsm', f), 'utf8');
const nameOf = f => f.replace(/\.kiss2$/, '');
const diag = list => list.map(d => `${d.severity}: ${d.message}`);

test('the corpus: every machine has its expectations, and only those', () => {
  if (UPDATE) return;
  assert.deepEqual(Object.keys(expected.fsm).sort(), machines.map(nameOf));
});

for (const f of machines) {
  const name = nameOf(f);
  test(`FSM ${name}: KISS2 read and written back, its warnings, the HDL (every encoding, style, language) and the ASM chart simulate like it`, () => {
    const m = fromKiss2(kiss(f), { name });
    assert.deepEqual(fromKiss2(toKiss2(m), { name }), m, 'KISS2 written back');
    const warnings = diag(validateFsm(m));
    const asm = fsmToAsm(m);
    const asmDiag = diag(validateAsm(asm));
    found.fsm[name] = { ...found.fsm[name], states: m.states.length, transitions: m.transitions.length, warnings, asm: asmDiag };
    if (!UPDATE) {
      assert.deepEqual(warnings, expected.fsm[name].warnings, 'the warnings of the machine');
      assert.deepEqual(asmDiag, expected.fsm[name].asm, 'the diagnostics of its ASM chart');
    }
    const vectors = randomVectors(m, 160, name.length * 7919);
    const want = runModel(m, vectors);
    for (const encoding of FSM_ENCODINGS) for (const style of FSM_STYLES) for (const lang of ['vhdl', 'verilog']) {
      const mm = { ...m, encoding, style };
      assert.deepEqual(runHdl(generateFsm(mm, lang).code, lang, mm, vectors), want, `${name} ${encoding} ${style} ${lang}`);
    }
    for (const lang of ['vhdl', 'verilog']) assert.deepEqual(runHdl(generateAsm(asm, lang).code, lang, m, vectors), want, `${name}: its ASM chart in ${lang}`);
  });
}

test.after(() => {
  if (!UPDATE) return;
  const order = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  const fsm = order(Object.fromEntries(Object.entries(found.fsm).map(([k, v]) => [k, { states: v.states, transitions: v.transitions, warnings: v.warnings, asm: v.asm }])));
  fs.writeFileSync(EXPECTED, `${JSON.stringify({ ...expected, fsm }, null, 2)}\n`);
});
