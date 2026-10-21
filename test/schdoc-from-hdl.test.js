// A schematic made from HDL (#405: core/schdoc-from-hdl.js out of schdoc.js; schematicFromHdl's source text pieces in
// schdoc-source.js, its gate conversion in schdoc-gates.js; the placement in schdoc-place.js): schdoc.js still exports
// schematicFromHdl and modulesFromLibrary; a VHDL module with an expression, a process and an instance becomes gates
// (the expression), an HDL block holding the process as written with its comment, a module symbol, I/O markers, the
// context clause and declarations of its source; its generated HDL compiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as schdoc from '../core/schdoc.js';
import { schematicFromHdl, modulesFromLibrary } from '../core/schdoc-from-hdl.js';
import { mountSourcePieces } from '../core/schdoc-source.js';
import { mountGateConversion } from '../core/schdoc-gates.js';
import { mergeNetWires } from '../core/schdoc-place.js';
import { compile, elaborate } from '../core/compile.js';

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
const layout = (g) => elk.layout(g);

const SUB = `library ieee; use ieee.std_logic_1164.all;
entity inv1 is port (a : in std_logic; y : out std_logic); end;
architecture r of inv1 is begin y <= not a; end;`;
const TOP = `library ieee; use ieee.std_logic_1164.all;
-- the top
entity top is port (clk, a, b, c : in std_logic; y, q, z : out std_logic); end;
architecture rtl of top is
  signal t : std_logic;
begin
  y <= (a and b) or not c;
  -- a register
  process (clk) begin if rising_edge(clk) then q <= a xor b; end if; end process;
  u1 : entity work.inv1 port map (a => c, y => t);
  z <= t;
end;`;

test('#405 HDL to schematic: schdoc.js exports the modules\' functions', () => {
  assert.equal(schdoc.schematicFromHdl, schematicFromHdl);
  assert.equal(schdoc.modulesFromLibrary, modulesFromLibrary);
  assert.equal(schdoc.mergeNetWires, mergeNetWires);
  for (const f of [mountSourcePieces, mountGateConversion]) assert.equal(typeof f, 'function');
});

test('#405 HDL to schematic: gates, an HDL block as written, an instance, the markers, the context; its HDL compiles', async () => {
  const src = [{ path: 'inv1.vhd', lang: 'vhdl', text: SUB }, { path: 'top.vhd', lang: 'vhdl', text: TOP }];
  const lib = compile(src);
  const modules = modulesFromLibrary(lib, {});
  const doc = await schematicFromHdl(elaborate(lib, 'top').top, { sources: Object.fromEntries(src.map((s) => [s.path, s.text])), modules, layout });
  // the expression as gates (a and b, or with an inverted input), the process as an HDL block, the instance, a buffer
  assert.deepEqual(doc.symbols.map((s) => s.type + (s.params.module ? `:${s.params.module}` : '')).sort(), ['and2', 'buf', 'hdlblock', 'module:inv1', 'or2b1']);
  assert.equal(doc.symbols.find((s) => s.type === 'hdlblock').hdl, '-- a register\nprocess (clk) begin if rising_edge(clk) then q <= a xor b; end if; end process;');
  assert.deepEqual(doc.ports.map((p) => `${p.name}:${p.dir}`), ['clk:in', 'a:in', 'b:in', 'c:in', 'y:out', 'q:out', 'z:out']);
  assert.deepEqual(doc.hdl, { lang: 'vhdl', context: 'library ieee;\nuse ieee.std_logic_1164.all;', generics: [], decls: 'signal t : std_logic;', arch: 'rtl' });
  // placed: every symbol on the grid, no two at one place
  assert.ok(doc.symbols.every((s) => s.x % 10 === 0 && s.y % 10 === 0));
  assert.equal(new Set(doc.symbols.map((s) => `${s.x},${s.y}`)).size, doc.symbols.length);
  const g = schdoc.generateHdl(doc, { modules });
  assert.deepEqual(g.diagnostics, []);
  assert.deepEqual(compile([src[0], { path: g.filename, lang: 'vhdl', text: g.code }]).errors.filter((e) => e.severity === 'error'), []);
});
