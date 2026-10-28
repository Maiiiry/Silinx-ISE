// Names in an ISE schematic's export (#1763): ISE's names are identifiers ([A-Za-z_][A-Za-z0-9_]*), which an escaped
// Verilog name (\opcode[0] , a schematic made from an EPFL netlist, #1697) cannot be: it is written as the identifier
// the import reads back (opcode_0: not _opcode_0_, which sch2hdl wrote as a VHDL port), I/O markers, nets and an HDL
// block's pins (its module's ports named so too) alike, and the export says so in one warning; the schematic read back
// behaves as the module with those names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertModuleToSchematic } from '../core/hdl-to-sch.js';
import { exportIseSch, importIseSch } from '../core/isesch.js';
import { iseIdent } from '../core/isesch-export.js';
import { compile, elaborate } from '../core/compile.js';
import { generateHdl, normalizeDoc, modulesFromLibrary } from '../core/schdoc.js';
import { compareBehaviour } from './schematic-corpus/lib.mjs';

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
const layout = g => elk.layout(g);

// (the module with escaped names, and the same with the names ISE gives them: the reference of the round trip)
const module = n => `module esc (clk, ${n('opcode[0]')}, ${n('opcode[1]')}, ${n('res[0]')}, ${n('acc[0]')});
  input clk, ${n('opcode[0]')}, ${n('opcode[1]')};
  output ${n('res[0]')}, ${n('acc[0]')};
  reg ${n('acc[0]')};
  wire t;
  assign t = ${n('opcode[0]')} & ~${n('opcode[1]')};
  assign ${n('res[0]')} = t | ${n('opcode[1]')};
  always @(posedge clk) ${n('acc[0]')} <= ${n('acc[0]')} ^ t;
endmodule
`;
const ESC = module(n => `\\${n} `), LEGAL = module(n => n.replace(/\[(\d+)\]/, '_$1'));

test('#1763 iseIdent: an identifier as it is; another name with its other characters as \'_\', none first nor last', () => {
  for (const n of ['a', 'clk_2', '_x', 'A__b']) assert.equal(iseIdent(n), n);
  assert.equal(iseIdent('\\opcode[0]'), 'opcode_0');
  assert.equal(iseIdent('\\a.b[12]'), 'a_b_12');
  assert.equal(iseIdent('\\3state'), 'n3state');
  assert.equal(iseIdent('\\[]'), 'n');
});

test('#1763 escaped markers, nets and HDL block pins written as identifiers, said in one warning; read back the same behaviour', async () => {
  const sources = [{ path: 'esc.v', text: ESC, role: 'design' }];
  const c = await convertModuleToSchematic({ sources, module: 'esc', layout });
  assert.ok(c.doc.ports.some(p => p.name === '\\opcode[0]'), 'the schematic keeps the escaped names');
  assert.ok(c.doc.symbols.some(s => s.type === 'hdlblock'), 'an HDL block (the always block)');
  const ex = exportIseSch(c.doc, { lang: 'verilog', timestamp: 'T' });
  // every name of the ISE schematic and of its symbols an identifier (a bus with its range)
  const names = [...ex.xml.matchAll(/<(?:signal|port|iomarker|branch) [^>]*name="([^"]+)"/g), ...ex.xml.matchAll(/<blockpin [^>]*name="([^"]+)"/g),
    ...ex.files.filter(f => f.kind === 'sym').flatMap(f => [...f.text.matchAll(/<pin [^>]*name="([^"]+)"/g)])].map(m => m[1]);
  assert.ok(names.length > 8);
  for (const n of names) assert.match(n, /^[A-Za-z_][A-Za-z0-9_]*(\(\d+(:\d+)?\))?$/, n);
  assert.deepEqual(c.doc.ports.map(p => p.name).sort(), ['\\acc[0]', '\\opcode[0]', '\\opcode[1]', '\\res[0]', 'clk']);
  const blk = ex.files.filter(f => f.kind === 'hdl').map(f => f.path.replace(/\.v$/, ''));
  assert.deepEqual(ex.warnings, [
    `ISE symbols not in the Xilinx library: ${blk.join(', ')} — add the returned HDL (.v) and .sym files to the ISE project`,
    `names written as identifiers, as ISE's names are ([A-Za-z_][A-Za-z0-9_]*; an escaped name cannot be one): '\\opcode[1]' as 'opcode_1', '\\opcode[0]' as 'opcode_0', '\\res[0]' as 'res_0', '\\acc[0]' as 'acc_0', xl_hdl_always's pin '\\acc[0]' as 'acc_0'`,
  ]);
  // the HDL block's file: its ports the identifiers, compiled and elaborated
  const hdl = ex.files.filter(f => f.kind === 'hdl');
  for (const f of hdl) {
    const lib = compile([f]);
    assert.deepEqual(lib.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], f.path);
    assert.deepEqual((elaborate(lib, f.path.replace(/\.v$/, '')).diags || []).filter(e => e.severity === 'error').map(e => e.message), [], f.path);
    assert.match(f.text, /output reg acc_0\n/);
  }
  // read back: the same names, no renaming said, the module's behaviour under them
  const modules = modulesFromLibrary(compile(hdl), { sources: Object.fromEntries(hdl.map(f => [f.path, f.text])) });
  const symbols = Object.fromEntries(ex.files.filter(f => f.kind === 'sym').map(f => [f.path, f.text]));
  const back = importIseSch(ex.xml, { name: 'esc', lang: 'verilog', modules, symbols });
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.doc.ports.map(p => p.name).sort(), ['acc_0', 'clk', 'opcode_0', 'opcode_1', 'res_0']);
  const g = generateHdl(normalizeDoc(back.doc, { modules }), { lang: 'verilog', modules });
  assert.deepEqual(g.diagnostics, []);
  assert.equal(compareBehaviour({ sources: [{ path: 'esc.v', text: LEGAL }], top: 'esc' }, { sources: [...hdl, { path: 'esc.gen.v', text: g.code }], top: 'esc' }, 'esc'), null);
  // exported again: the same ISE schematic, with no renaming
  const again = exportIseSch(back.doc, { lang: 'verilog', timestamp: 'T', modules });
  assert.ok(!again.warnings.some(w => /names written as identifiers/.test(w)), again.warnings.join('\n'));
});
