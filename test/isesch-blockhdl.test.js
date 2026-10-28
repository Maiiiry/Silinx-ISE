// An HDL block's own file in an ISE schematic's export (core/isesch-blockhdl.js, #1695): a module converted to a
// schematic keeps processes / always blocks as HDL blocks; exported as an ISE schematic, each block's file has the
// module's declarations its code uses (its context, generics / parameters, constants, types, functions, macros) and
// of the module's signals only its own temporaries, declared whole (a declaration of several names over several lines
// too): every file compiles, and the schematic read back from ISE, those files its modules, behaves as the module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertModuleToSchematic } from '../core/hdl-to-sch.js';
import { exportIseSch, importIseSch } from '../core/isesch.js';
import { blockHdlDecls } from '../core/isesch-blockhdl.js';
import { compile, elaborate } from '../core/compile.js';
import { generateHdl, normalizeDoc, modulesFromLibrary } from '../core/schdoc.js';
import { compareBehaviour } from './schematic-corpus/lib.mjs';

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
const layout = g => elk.layout(g);

const VHDL = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity ctl is
  generic (N : integer := 4);
  port (clk, rst, go : in std_logic; q : out std_logic_vector(N - 1 downto 0); busy : out std_logic);
end ctl;

architecture rtl of ctl is
  type state_t is (IDLE, RUN, DONE);
  constant LIMIT : integer := 5;
  function inc(x : unsigned) return unsigned is
  begin
    return x + 1;
  end function;
  signal st : state_t;
  signal cnt,
         nxt : unsigned(N - 1 downto 0);
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then
        st <= IDLE; cnt <= (others => '0');
      else
        case st is
          when IDLE => if go = '1' then st <= RUN; end if;
          when RUN => cnt <= nxt; if to_integer(cnt) = LIMIT then st <= DONE; end if;
          when DONE => st <= IDLE;
        end case;
      end if;
    end if;
  end process;
  nxt <= inc(cnt);
  q <= std_logic_vector(cnt);
  busy <= '1' when st = RUN else '0';
end rtl;
`;

const VERILOG = `\`define START 3'd1
module tx #(parameter STOP_BIT = 3) (input clk, input rst, input go, output reg [2:0] q, output busy);
  localparam IDLE = 1'b0, SEND = 1'b1;
  reg st,
      prev;
  reg [2:0] cnt;
  always @(posedge clk)
    if (rst) begin st <= IDLE; cnt <= \`START; prev <= 1'b0; end
    else begin
      prev <= go;
      if (st == IDLE && go && !prev) st <= SEND;
      else if (st == SEND) begin cnt <= cnt + 1'b1; if (cnt == STOP_BIT) st <= IDLE; end
    end
  always @(posedge clk) q <= cnt;
  assign busy = st;
endmodule
`;

async function roundTrip(path, text, module) {
  const lang = path.endsWith('.vhd') ? 'vhdl' : 'verilog';
  const sources = [{ path, text, role: 'design' }];
  const c = await convertModuleToSchematic({ sources, module, layout });
  assert.ok(c.doc.symbols.some(s => s.type === 'hdlblock'), 'HDL blocks kept');
  const ex = exportIseSch(c.doc, { lang, timestamp: 'T' });
  const hdl = ex.files.filter(f => f.kind === 'hdl');
  // every block's file compiles and elaborates on its own
  for (const f of hdl) {
    const lib = compile([f]);
    assert.deepEqual(lib.errors.filter(e => e.severity === 'error').map(e => `${e.file}:${e.line} ${e.message}`), [], f.path);
    const top = f.path.replace(/\.[^.]*$/, '');
    const d = elaborate(lib, top);
    assert.deepEqual((d.diags || []).filter(e => e.severity === 'error').map(e => e.message), [], f.path);
  }
  // read back from ISE, the blocks' files as the project's modules: the same behaviour as the module
  const modules = modulesFromLibrary(compile(hdl), { sources: Object.fromEntries(hdl.map(f => [f.path, f.text])) });
  const symbols = Object.fromEntries(ex.files.filter(f => f.kind === 'sym').map(f => [f.path, f.text]));
  const back = importIseSch(ex.xml, { name: module, lang, modules, symbols });
  const g = generateHdl(normalizeDoc(back.doc, { modules }), { lang, modules });
  assert.equal(compareBehaviour({ sources, top: module }, { sources: [...hdl, { path: `${module}.gen.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: g.code }], top: module }, module), null);
  return { c, ex, hdl, back };
}

test('#1695 a VHDL module\'s blocks: its generic, type, constant and function in each block\'s file, its signals declared over two lines', async () => {
  const { ex, hdl, back } = await roundTrip('ctl.vhd', VHDL, 'ctl');
  const names = hdl.map(f => f.path);
  assert.deepEqual(ex.warnings, [`ISE symbols not in the Xilinx library: ${names.map(p => p.replace(/\.vhd$/, '')).join(', ')} — add the returned HDL (.vhd) and .sym files to the ISE project`]);
  assert.deepEqual(back.warnings, []);
  const proc = hdl.find(f => /case st is/.test(f.text));
  assert.ok(proc, 'the process\'s file');
  assert.match(proc.text, /generic \(\s*N : integer := 4\s*\)/);
  assert.match(proc.text, /type state_t is \(IDLE, RUN, DONE\);/);
  assert.match(proc.text, /constant LIMIT : integer := 5;/);
  assert.match(proc.text, /function inc\(x : unsigned\) return unsigned is/);
  // (st, cnt and nxt are its pins: not declared again)
  assert.doesNotMatch(proc.text, /signal (st|cnt|nxt)\b/);
});

test('#1695 a Verilog module\'s blocks: its parameter, localparams and macro in each block\'s file, a register of two names over two lines', async () => {
  const { ex, hdl, back } = await roundTrip('tx.v', VERILOG, 'tx');
  assert.deepEqual(ex.warnings, [`ISE symbols not in the Xilinx library: ${hdl.map(f => f.path.replace(/\.v$/, '')).join(', ')} — add the returned HDL (.v) and .sym files to the ISE project`]);
  assert.deepEqual(back.warnings, []);
  const blk = hdl.find(f => /STOP_BIT\)/.test(f.text) && /SEND/.test(f.text));
  assert.ok(blk, 'the always block\'s file');
  assert.match(blk.text, /parameter STOP_BIT = 3/);
  assert.match(blk.text, /localparam IDLE = 1'b0, SEND = 1'b1;/);
  assert.match(blk.text, /`define START 3'd1/);
});

test('#1695 a block with no pins (a generate not taken) read back as a module of no ports: its instance without a port map', () => {
  const src = { path: 'np.vhd', text: 'entity np is\n  generic (G : boolean := true);\nend np;\narchitecture a of np is\nbegin\nend a;\n' };
  const modules = modulesFromLibrary(compile([src]), { sources: { [src.path]: src.text } });
  const doc = normalizeDoc({ name: 'top', lang: 'vhdl', symbols: [{ id: 'S1', type: 'module', name: 'U1', x: 200, y: 200, params: { module: 'np', generics: {} } }], ports: [], wires: [], labels: [] }, { modules });
  const g = generateHdl(doc, { lang: 'vhdl', modules });
  assert.deepEqual(g.diagnostics, []);
  assert.match(g.code, /\n {2}U1 : entity work\.np;\n/);
  const lib = compile([src, { path: 'top.vhd', text: g.code }]);
  assert.deepEqual(lib.errors.map(e => `${e.file}:${e.line} ${e.message}`), []);
  assert.deepEqual((elaborate(lib, 'top').diags || []).map(e => e.message), []);
});

test('#1695 blockHdlDecls: the signals kept are the block\'s own, whole statements; the rest of the declarations as they are', () => {
  const v = { lang: 'vhdl', context: 'library ieee;\nuse ieee.std_logic_1164.all;', generics: [{ name: 'W', type: 'integer', default: '8' }],
    decls: 'constant K : integer := 2;\nsignal a,\n  t : std_logic; -- a pin, t the block\'s own\nsignal u : std_logic;\nattribute keep : string;\nattribute keep of u : signal is "true";\nattribute keep of t : signal is "true";' };
  assert.deepEqual(blockHdlDecls(v, 't <= a; b <= t and K = 2;', new Set(['a', 'b']), 'vhdl'), { lang: 'vhdl', context: v.context, generics: v.generics,
    decls: 'constant K : integer := 2;\nsignal t : std_logic; -- a pin, t the block\'s own\nattribute keep : string;\nattribute keep of t : signal is "true";' });
  const w = { lang: 'verilog', context: '`define Z 0', generics: [], decls: 'localparam P = 1;\nreg [3:0] r = 4\'d0,\n  s;\nwire x;\ninteger i;\ninitial r = 4\'d2;' };
  assert.deepEqual(blockHdlDecls(w, 'for (i = 0; i < 4; i = i + 1) s[i] <= x;', new Set(['s', 'x']), 'verilog').decls, 'localparam P = 1;\ninteger i;');
  assert.deepEqual(blockHdlDecls(w, 'r <= r + P;', new Set(['q']), 'verilog').decls, 'localparam P = 1;\nreg [3:0] r = 4\'d0;\ninitial r = 4\'d2;');
  assert.equal(blockHdlDecls({ lang: 'vhdl', context: '', generics: [], decls: 'signal a : bit;' }, 'a <= b;', new Set(['a', 'b']), 'vhdl'), null);
  assert.equal(blockHdlDecls(undefined, '', new Set(), 'vhdl'), null);
});
