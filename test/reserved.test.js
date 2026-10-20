// core/reserved.js (#679): the reserved words of VHDL and Verilog, one list for every name the app gives,
// and the drawings' checks of an existing name (an error when the generated HDL would not compile, else a
// warning), with their exact messages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VHDL93_WORDS, VHDL_WORDS, VERILOG_WORDS, SV_WORDS, reservedIn, isReservedWord, breaksHdl, reservedError,
  reservedModuleDiags } from '../core/reserved.js';
import { KEYWORDS as VHDL_LEXER } from '../core/vhdl/lexer.js';
import { KEYWORDS as VLOG_LEXER } from '../core/verilog/lexer.js';
import { identError } from '../core/modgen.js';
import { badName } from '../core/rename.js';
import { newDoc, generateHdl, netlist } from '../core/schdoc.js';
import { newFsm, validateFsm } from '../core/fsm.js';
import { newModel, validate as validateAsm } from '../core/asm.js';
import { newPetri, validatePetri } from '../core/petri.js';
import { newTable, validateTable, generateTableHdl } from '../core/logic.js';
import { compile, elaborate } from '../core/compile.js';

test('the lists: every word the lexers read as a keyword, and the words of each standard', () => {
  // an independent reference: the parsers' own keywords (the VHDL lexer reads VHDL-93's and two of 2008's)
  for (const w of VHDL_LEXER) assert.ok(VHDL_WORDS.has(w), `VHDL lexer keyword '${w}'`);
  for (const w of VLOG_LEXER) assert.ok(VERILOG_WORDS.has(w) || SV_WORDS.has(w), `Verilog lexer keyword '${w}'`);
  assert.equal(VHDL93_WORDS.size, 97);
  assert.equal(VHDL_WORDS.size, 97 + 18);
  for (const w of ['and', 'or', 'not', 'xor', 'begin', 'end', 'signal', 'process', 'entity', 'architecture', 'downto', 'others', 'context', 'force']) assert.ok(VHDL_WORDS.has(w), w);
  for (const w of ['and', 'or', 'not', 'xor', 'begin', 'end', 'module', 'wire', 'reg', 'assign', 'always', 'posedge', 'uwire']) assert.ok(VERILOG_WORDS.has(w), w);
  for (const w of ['logic', 'bit', 'int', 'always_ff', 'always_comb', 'interface', 'typedef', 'enum', 'string', 'unique0']) assert.ok(SV_WORDS.has(w), w);
  for (const s of [VHDL_WORDS, VERILOG_WORDS, SV_WORDS]) for (const w of s) assert.match(w, /^[a-z][a-z0-9_]*$/);
});

test('reservedIn / reservedError: any letter case, both languages; near misses stay allowed', () => {
  assert.deepEqual(reservedIn('AND'), ['VHDL', 'Verilog']);
  assert.deepEqual(reservedIn('and'), ['VHDL', 'Verilog']);
  assert.deepEqual(reservedIn('Or'), ['VHDL', 'Verilog']);
  assert.deepEqual(reservedIn('BEGIN'), ['VHDL', 'Verilog']);
  assert.deepEqual(reservedIn('Signal'), ['VHDL']);
  assert.deepEqual(reservedIn('PROCESS'), ['VHDL']);
  assert.deepEqual(reservedIn('MODULE'), ['Verilog']);
  assert.deepEqual(reservedIn('Wire'), ['Verilog']);
  assert.deepEqual(reservedIn('Logic'), ['SystemVerilog']);
  assert.deepEqual(reservedIn('package'), ['VHDL', 'SystemVerilog']);
  for (const n of ['and1', 'orr', 'my_and', 'AND_gate', 'begin2', 'nott', 'wires', 'modules', 'xor_out', 'Signals', 'top', 'clk', 'rst', 'U1', '', null, undefined]) {
    assert.deepEqual(reservedIn(n), [], String(n));
    assert.equal(isReservedWord(n), false);
    assert.equal(reservedError(n), null);
  }
  assert.equal(reservedError('AND'), "'AND' is a reserved word of VHDL and Verilog");
  assert.equal(reservedError('Signal'), "'Signal' is a reserved word of VHDL");
  assert.equal(reservedError('wire'), "'wire' is a reserved word of Verilog");
  assert.equal(reservedError('typedef'), "'typedef' is a reserved word of SystemVerilog");
  assert.equal(isReservedWord('nOt'), true);
  // sv: false (an existing name): SystemVerilog's own words left out
  assert.deepEqual(reservedIn('cross', { sv: false }), []);
  assert.deepEqual(reservedIn('package', { sv: false }), ['VHDL']);
  assert.equal(reservedError('typedef', { sv: false }), null);
});

test('breaksHdl: VHDL-93 in any case; Verilog as written', () => {
  assert.equal(breaksHdl('AND', 'vhdl'), true);
  assert.equal(breaksHdl('Signal', 'vhdl'), true);
  assert.equal(breaksHdl('wire', 'vhdl'), false);
  assert.equal(breaksHdl('context', 'vhdl'), false);   // VHDL-2008 only: XST reads VHDL-93
  assert.equal(breaksHdl('wire', 'verilog'), true);
  assert.equal(breaksHdl('Wire', 'verilog'), false);
  assert.equal(breaksHdl('AND', 'verilog'), false);
  assert.equal(breaksHdl('signal', 'verilog'), false);
});

test('a new name: the wizards (identError) and Rename Symbol (badName)', () => {
  assert.equal(identError('AND', 'vhdl'), "'AND' is a reserved word of VHDL and Verilog");
  assert.equal(identError('AND', 'verilog'), "'AND' is a reserved word of VHDL and Verilog");
  assert.equal(identError('process', 'verilog'), "'process' is a reserved word of VHDL");
  assert.equal(identError('Module', 'vhdl'), "'Module' is a reserved word of Verilog");
  assert.equal(identError('and1', 'vhdl'), null);
  assert.equal(identError('orr', 'verilog'), null);
  // VHDL's other naming rules, checked first
  assert.equal(identError('1and', 'vhdl'), "'1and' must start with a letter");
  assert.equal(identError('a__b', 'vhdl'), "'a__b': no double __ and no _ at the end");
  // Rename Symbol in an HDL file: the reserved words of its own language (Verilog: as written)
  assert.equal(badName('Begin', 'vhdl'), "'Begin' is a reserved word of VHDL.");
  assert.equal(badName('context', 'vhdl'), "'context' is a reserved word of VHDL.");
  assert.equal(badName('wire', 'verilog'), "'wire' is a reserved word of Verilog.");
  assert.equal(badName('typedef', 'verilog'), "'typedef' is a reserved word of Verilog.");
  assert.equal(badName('Wire', 'verilog'), null);
  assert.equal(badName('wires', 'verilog'), null);
});

test('an existing module named with a reserved word: the warning when it is opened and at Check Syntax', () => {
  assert.deepEqual(reservedModuleDiags([{ name: 'AND', file: 'src/AND.sch.json' }, { name: 'and', file: 'src/and.vhd', line: 4 }, { name: 'top', file: 'src/top.v' }, { name: 'Wire', file: 'src/w.v', line: 2 }]), [
    { severity: 'warning', file: 'src/AND.sch.json', line: 1, col: 1, tool: 'Silinx', message: "The module name 'AND' is a reserved word of VHDL and Verilog: rename it (Rename in the Design pane), or its HDL may not compile." },
    { severity: 'warning', file: 'src/w.v', line: 2, col: 1, tool: 'Silinx', message: "The module name 'Wire' is a reserved word of Verilog: rename it (Rename in the Design pane), or its HDL may not compile." },
  ]);
  assert.deepEqual(reservedModuleDiags([{ name: 'and1', file: 'a.v' }, { name: 'cross', file: 'c.v' }]), []);
  assert.deepEqual(reservedModuleDiags(), []);
});

const sevMsg = ds => ds.map(d => `${d.severity}: ${d.message}`);
const reservedDiags = ds => sevMsg(ds).filter(m => /reserved word/.test(m));

test('a schematic: its module, I/O markers, nets and instances named with a reserved word', () => {
  // its module: an error when its HDL would not compile (entity AND), a warning when it would
  assert.deepEqual(reservedDiags(generateHdl(newDoc('AND', 'vhdl')).diagnostics), ["error: 'AND' is a reserved word of VHDL and Verilog: rename it"]);
  const w = generateHdl(newDoc('Wire', 'verilog'));
  assert.deepEqual(reservedDiags(w.diagnostics), ["warning: 'Wire' is a reserved word of Verilog: rename it"]);
  const lib = compile([{ path: 'src/Wire.v', lang: 'verilog', text: w.code, role: 'design' }]);
  assert.deepEqual(lib.errors.filter(e => e.severity === 'error'), [], 'module Wire compiles in Verilog');
  assert.ok(elaborate(lib, 'Wire').top);
  // the VHDL compiler refuses entity AND: the error is warranted
  const bad = compile([{ path: 'src/AND.vhd', lang: 'vhdl', text: generateHdl(newDoc('AND', 'vhdl')).code, role: 'design' }]);
  assert.ok(bad.errors.some(e => e.severity === 'error'));
  assert.deepEqual(reservedDiags(generateHdl(newDoc('and1', 'vhdl')).diagnostics), []);
  // an I/O marker, a net, an instance
  const d = newDoc('m', 'verilog');
  d.ports.push({ id: 'P1', name: 'Begin', dir: 'in', width: 1, x: 0, y: 0 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 200, y: 0 });
  d.wires.push({ id: 'W1', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] });
  d.symbols.push({ id: 'S1', type: 'inv', name: 'signal', x: 400, y: 400, rot: 0, params: {} });
  const ds = generateHdl(d).diagnostics;
  assert.ok(reservedDiags(ds).includes("warning: 'Begin' is a reserved word of VHDL and Verilog: rename it"), sevMsg(ds).join('\n'));
  assert.ok(reservedDiags(ds).includes("warning: 'signal' is a reserved word of VHDL: rename it"));
  assert.ok(reservedDiags(netlist(d).diagnostics).includes("warning: 'signal' is a reserved word of VHDL: rename it"));
  const n = newDoc('m', 'vhdl');
  n.wires.push({ id: 'W1', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] });
  n.labels.push({ id: 'L1', x: 100, y: 0, net: 'Wire' });
  assert.deepEqual(reservedDiags(generateHdl(n).diagnostics), ["warning: 'Wire' is a reserved word of Verilog: rename it"]);
});

test('an FSM, an ASM chart, a Petri net, a truth table: an error when the HDL would not compile, else a warning', () => {
  const f = newFsm('fsm1', 'vhdl');
  f.inputs = [{ name: 'Wire', width: 1 }];
  assert.deepEqual(reservedDiags(validateFsm(f)), ["warning: 'Wire' is a reserved word of Verilog: rename it"]);
  f.inputs = [{ name: 'wire', width: 1 }];
  assert.deepEqual(reservedDiags(validateFsm(f)), ['error: Input \'wire\' is a reserved word in Verilog']);
  f.inputs = [{ name: 'Context', width: 1 }];
  assert.deepEqual(reservedDiags(validateFsm(f)), ["warning: 'Context' is a reserved word of VHDL: rename it"]);
  // a word of SystemVerilog only: a good name for XST and Yosys (Verilog-2005), refused only as a new name
  f.inputs = [{ name: 'cross', width: 1 }];
  assert.deepEqual(reservedDiags(validateFsm(f)), []);
  assert.deepEqual(reservedDiags(validateFsm(newFsm('OR', 'verilog'))), ["error: The module name 'OR' is a reserved word in VHDL"]);

  const a = newModel('Reg', 'vhdl');
  assert.deepEqual(reservedDiags(validateAsm(a)), ["warning: 'Reg' is a reserved word of Verilog: rename it"]);
  assert.deepEqual(reservedDiags(validateAsm(newModel('Begin', 'verilog'))), ["error: Module/entity name 'Begin' is a reserved word in VHDL"]);

  assert.deepEqual(reservedDiags(validatePetri(newPetri('Module', 'vhdl'))), ["warning: 'Module' is a reserved word of Verilog: rename it"]);
  assert.deepEqual(sevMsg(validatePetri(newPetri('and', 'verilog'))).filter(m => /'and'/.test(m)), ["error: 'and' is not a valid module name"]);

  // (a truth table refuses the words of both languages in any case, as before)
  assert.deepEqual(sevMsg(validateTable(newTable('tt', ['a', 'Wire'], ['f']))), ["error: 'Wire' is not a valid name (a letter, then letters, digits and single _; not a VHDL/Verilog keyword)"]);
  const t = newTable('tt', ['a', 'context'], ['f']);
  assert.deepEqual(sevMsg(validateTable(t)), ["warning: 'context' is a reserved word of VHDL: rename it"]);
  assert.match(generateTableHdl(t, 'vhdl').code, /entity tt is/);   // a warning does not stop the generation
  assert.deepEqual(sevMsg(validateTable(newTable('AND', ['a'], ['f']))), ["error: 'AND' is not a valid module name"]);
  assert.deepEqual(sevMsg(validateTable(newTable('and1', ['orr'], ['f']))), []);
  assert.deepEqual(sevMsg(validateTable(newTable('tt', ['context', 'b'], ['CONTEXT']))), ["warning: 'context' is a reserved word of VHDL: rename it", "error: the name 'CONTEXT' is used twice"]);
  assert.deepEqual(sevMsg(validateTable(newTable('tt', ['typedef'], ['f']))), []);
});
