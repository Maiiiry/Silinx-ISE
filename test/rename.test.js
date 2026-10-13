// Renaming a module/entity: only the references to the design unit change. Rename Symbol (F2):
// every place that means the same object, through the scopes of the language (#178).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { renameModuleInSource, renameModuleInSchematic, renameSymbol, renameInterfaceInSource, symbolAt, interfaceUnit } from '../core/rename.js';
import { analyze } from '../core/scopes.js';
import { compile, elaborate } from '../core/compile.js';

test('VHDL: entity, end, architecture-of, component, instances and entity work.X are renamed', () => {
  const src = `entity Knight is port (a : in bit); end Knight;
architecture rtl of knight is begin end architecture rtl;
entity top is end entity top;
architecture s of top is
  component knight port (a : in bit); end component knight;
  signal knight_en : bit;
begin
  u1 : knight port map (a => knight_en);
  u2 : entity work.KNIGHT port map (a => knight_en);
  knight : process begin wait; end process knight;
end s;`;
  const out = renameModuleInSource(src, 'vhdl', 'knight', 'light');
  assert.match(out, /entity light is port/);
  assert.match(out, /end light;/);
  assert.match(out, /architecture rtl of light is/);
  assert.match(out, /component light port/);
  assert.match(out, /end component light;/);
  assert.match(out, /u1 : light port map/);
  assert.match(out, /u2 : entity work\.light port map/);
  // not the design unit: kept
  assert.match(out, /signal knight_en/);
  assert.match(out, /knight : process begin wait; end process knight;/);
  assert.match(out, /entity top is end entity top;/);
});

test('Verilog: module declaration and instances are renamed, other identifiers are not', () => {
  const src = `module counter #(parameter N = 4) (input clk, output [N-1:0] q);
  reg [N-1:0] counter_r;
endmodule
module top(input clk);
  wire [3:0] q1, q2;
  counter #(.N(4)) u1 (.clk(clk), .q(q1));
  counter u2 (.clk(clk), .q(q2));
  wire counter;
endmodule`;
  const out = renameModuleInSource(src, 'verilog', 'counter', 'cnt');
  assert.match(out, /^module cnt #\(parameter N = 4\)/);
  assert.match(out, /cnt #\(\.N\(4\)\) u1/);
  assert.match(out, /cnt u2 \(/);
  assert.match(out, /reg \[N-1:0\] counter_r;/);
  assert.match(out, /wire counter;/);
});

test('unrelated sources are returned unchanged; schematic symbols follow the module', () => {
  const src = 'entity a is end a;';
  assert.equal(renameModuleInSource(src, 'vhdl', 'b', 'c'), src);
  const doc = { name: 'knight', symbols: [{ type: 'module', params: { module: 'Knight' } }, { type: 'and2', params: {} }] };
  assert.equal(renameModuleInSchematic(doc, 'knight', 'light', { linked: true }), true);
  assert.equal(doc.symbols[0].params.module, 'light');
  assert.equal(doc.name, 'light');
});

// ---------------------------------------------------------------- Rename Symbol (F2) (#178)

/** 1-based line / column of the k-th (0-based) whole-word occurrence of `word` in `text`. */
function at(text, word, k = 0) {
  const re = new RegExp(`(?<![\\w$])${word}(?![\\w$])`, 'g');
  let m;
  for (let n = 0; (m = re.exec(text)); n++) if (n === k) break;
  const before = text.slice(0, m.index).split('\n');
  return [before.length, before[before.length - 1].length + 1];
}
const ren = (text, lang, word, k, to) => renameSymbol(text, lang, ...at(text, word, k), to);

const VHDL = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- cnt counts the clock ticks
entity counter is
  generic (N : integer := 4);
  port (clk, rst : in std_logic; q : out std_logic_vector(N - 1 downto 0));
end entity counter;

architecture rtl of counter is
  type state_t is (IDLE, RUN);
  signal CNT : unsigned(N - 1 downto 0) := (others => '0');
  signal state : state_t;
  function inc(x : unsigned) return unsigned is
    variable cnt : unsigned(x'range);
  begin
    cnt := x + 1;
    return cnt;
  end function inc;
begin
  q <= std_logic_vector(cnt);
  tick : process (clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then cnt <= (others => '0'); state <= IDLE;
      else Cnt <= inc(cnt); report "cnt is counting"; end if;
    end if;
  end process tick;
end architecture rtl;
`;

test('Rename Symbol, VHDL: a signal in every spelling, not the variable of the same name in the function, the comment or the string', () => {
  const r = ren(VHDL, 'vhdl', 'CNT', 0, 'count');
  assert.equal(r.count, 5);
  assert.equal(r.text, VHDL
    .replace('signal CNT :', 'signal count :').replace('std_logic_vector(cnt)', 'std_logic_vector(count)')
    .replace('then cnt <= (others', 'then count <= (others').replace('else Cnt <= inc(cnt);', 'else count <= inc(count);'));
  // the same from any of its uses (the cursor just after the name counts too)
  const [l, c] = at(VHDL, 'Cnt');
  assert.equal(renameSymbol(VHDL, 'vhdl', l, c + 3, 'count').text, r.text);
  // the variable of the function: only its three places
  const v = ren(VHDL, 'vhdl', 'cnt', 1, 'v');
  assert.equal(v.count, 3);
  assert.equal(v.text, VHDL.replace('variable cnt :', 'variable v :').replace('cnt := x + 1;', 'v := x + 1;').replace('return cnt;', 'return v;'));
});

test('Rename Symbol, VHDL: a port, a generic, an enumeration literal, a process label, a type, a loop variable', () => {
  assert.equal(ren(VHDL, 'vhdl', 'clk', 0, 'clock').text,
    VHDL.replace('port (clk, rst', 'port (clock, rst').replace('process (clk)', 'process (clock)').replace('rising_edge(clk)', 'rising_edge(clock)'));
  assert.equal(ren(VHDL, 'vhdl', 'N', 0, 'WIDTH').text, VHDL.replace(/\bN - 1/g, 'WIDTH - 1').replace('generic (N :', 'generic (WIDTH :'));
  assert.equal(ren(VHDL, 'vhdl', 'IDLE', 1, 'S_IDLE').text, VHDL.replace('(IDLE, RUN)', '(S_IDLE, RUN)').replace('state <= IDLE;', 'state <= S_IDLE;'));
  assert.equal(ren(VHDL, 'vhdl', 'tick', 0, 'reg_p').text, VHDL.replace('tick : process', 'reg_p : process').replace('end process tick;', 'end process reg_p;'));
  assert.equal(ren(VHDL, 'vhdl', 'state_t', 0, 'st_t').text, VHDL.replace('type state_t is', 'type st_t is').replace('signal state : state_t;', 'signal state : st_t;'));
  const loop = "entity e is end;\narchitecture a of e is\n  signal i : integer;\nbegin\n  process begin\n    for i in 0 to 3 loop\n      report integer'image(i);\n    end loop;\n    i <= 2; wait;\n  end process;\nend;\n";
  assert.equal(ren(loop, 'vhdl', 'i', 1, 'k').text, loop.replace('for i in', 'for k in').replace('image(i)', 'image(k)'));
});

test('Rename Symbol, VHDL: invalid names, reserved words and clashes are refused with the reason', () => {
  assert.equal(ren(VHDL, 'vhdl', 'CNT', 0, '2cnt').error, "'2cnt' is not a valid VHDL name: a letter first, then letters, digits and single underscores (not at the end).");
  assert.equal(ren(VHDL, 'vhdl', 'CNT', 0, 'a__b').error, "'a__b' is not a valid VHDL name: a letter first, then letters, digits and single underscores (not at the end).");
  assert.equal(ren(VHDL, 'vhdl', 'CNT', 0, 'Signal').error, "'Signal' is a reserved word of VHDL.");
  assert.equal(ren(VHDL, 'vhdl', 'CNT', 0, 'State').error, "'State' is already declared here (signal 'state'): choose another name.");
  // a port of the entity is visible in the architecture: renaming the signal to it would hide it
  assert.equal(ren(VHDL, 'vhdl', 'CNT', 0, 'Q').error, "'Q' is already used for another object where 'CNT' is visible: choose another name.");
  assert.equal(ren(VHDL, 'vhdl', 'cnt', 1, 'X').error, "'X' is already declared here (argument 'x'): choose another name.");
  assert.equal(ren(VHDL, 'vhdl', 'std_logic', 0, 'sl').error, "'std_logic' is not declared in this file: rename it where it is declared.");
  assert.equal(renameSymbol(VHDL, 'vhdl', 5, 3, 'x').error, 'There is no name to rename here.');
  // the same name in another spelling just changes the spelling
  const r = ren(VHDL, 'vhdl', 'CNT', 0, 'Cnt');
  assert.equal(r.count, 5);
  assert.equal(r.text, VHDL.replace('signal CNT', 'signal Cnt').replace('(cnt);\n  tick', '(Cnt);\n  tick').replace('then cnt <=', 'then Cnt <=').replace('inc(cnt); report', 'inc(Cnt); report'));
});

const VLOG = `// cnt counts the clock ticks
module counter #(parameter N = 4) (input clk, input rst, output [N-1:0] q);
  reg [N-1:0] cnt;
  wire Cnt = cnt[0];
  localparam IDLE = 1'b0, RUN = 1'b1;
  reg state;
  assign q = cnt;
  function [N-1:0] inc;
    input [N-1:0] cnt;
    begin
      inc = cnt + 1;
    end
  endfunction
  always @(posedge clk) begin : tick
    if (rst) begin cnt <= 0; state <= IDLE; end
    else begin cnt <= inc(cnt); $display("cnt=%d", cnt); end
  end
endmodule

module top (input clk, output [3:0] q);
  counter #(.N(4)) u1 (.clk(clk), .rst(1'b0), .q(q));
endmodule
`;

test('Rename Symbol, Verilog: case-sensitive, not the function argument of the same name, the comment or the string', () => {
  // (the first cnt is in the comment)
  const r = ren(VLOG, 'verilog', 'cnt', 1, 'count');
  assert.equal(r.count, 7);
  assert.equal(r.text, VLOG.replace('reg [N-1:0] cnt;', 'reg [N-1:0] count;').replace('= cnt[0]', '= count[0]').replace('assign q = cnt;', 'assign q = count;')
    .replace('begin cnt <= 0;', 'begin count <= 0;').replace('begin cnt <= inc(cnt); $display("cnt=%d", cnt);', 'begin count <= inc(count); $display("cnt=%d", count);'));
  // Cnt is another wire
  assert.equal(ren(VLOG, 'verilog', 'Cnt', 0, 'bit0').text, VLOG.replace('wire Cnt =', 'wire bit0 ='));
  // the argument of the function
  assert.equal(ren(VLOG, 'verilog', 'cnt', 4, 'x').text, VLOG.replace('input [N-1:0] cnt;', 'input [N-1:0] x;').replace('inc = cnt + 1;', 'inc = x + 1;'));
});

test('Rename Symbol, Verilog: a parameter and a port follow in the named connections of the instances; a block label; refusals', () => {
  assert.equal(ren(VLOG, 'verilog', 'N', 0, 'W').text, VLOG.replace(/\bN-1/g, 'W-1').replace('parameter N =', 'parameter W =').replace('#(.N(4))', '#(.W(4))'));
  assert.equal(ren(VLOG, 'verilog', 'q', 0, 'value').text, VLOG.replace('output [N-1:0] q);', 'output [N-1:0] value);').replace('assign q = cnt;', 'assign value = cnt;').replace('.q(q)', '.value(q)'));
  assert.equal(ren(VLOG, 'verilog', 'tick', 0, 'seq').text, VLOG.replace('begin : tick', 'begin : seq'));
  assert.equal(ren(VLOG, 'verilog', 'cnt', 1, 'Cnt').error, "'Cnt' is already declared here (signal 'Cnt'): choose another name.");
  assert.equal(ren(VLOG, 'verilog', 'cnt', 1, 'always').error, "'always' is a reserved word of Verilog.");
  assert.equal(ren(VLOG, 'verilog', 'cnt', 1, 'a-b').error, "'a-b' is not a valid Verilog name: a letter or _ first, then letters, digits, _ or $.");
  assert.equal(ren(VLOG, 'verilog', 'cnt', 1, 'inc').error, "'inc' is already declared here (function 'inc'): choose another name.");
});

test('Rename Symbol: a port of a module of another file is renamed in its instances (named connections, port maps, components)', () => {
  const v = "module top(input c, output [3:0] y);\n  counter #(.N(4)) u1 (.clk(c), .rst(1'b0), .q(y));\n  counter u2 (.clk(c), .q());\n  other u3 (.q(y));\nendmodule\n";
  assert.deepEqual(renameInterfaceInSource(v, 'verilog', 'counter', 'q', 'value'), {
    text: v.replace('.q(y));\n  counter', '.value(y));\n  counter').replace('.q());', '.value());'), count: 2,
    edits: [{ line: 2, col: 46, len: 1 }, { line: 3, col: 25, len: 1 }],
  });
  const h = `entity top is port (c : in bit; y : out bit); end;
architecture s of top is
  component Counter port (CLK : in bit; q : out bit); end component;
  signal q : bit;
begin
  u1 : counter port map (clk => c, q => q);
  u2 : entity work.counter port map (Clk => c, Q => y);
end;
`;
  const r = renameInterfaceInSource(h, 'vhdl', 'counter', 'clk', 'clock');
  assert.equal(r.count, 3);
  assert.equal(r.text, h.replace('(CLK : in', '(clock : in').replace('(clk => c, q => q)', '(clock => c, q => q)').replace('(Clk => c', '(clock => c'));
  // the formal of a unit of another file is not renamed from here
  assert.equal(symbolAt(h, 'vhdl', ...at(h, 'Clk')).error, "'Clk' is a port of 'counter', declared in another file: rename it there.");
});

test('Rename Symbol on the examples: every name of every source renamed, the design elaborates to the same signals, renamed', () => {
  const dir = new URL('../examples/', import.meta.url);
  let renames = 0;
  for (const ex of readdirSync(dir)) {
    const files = ['src', 'sim'].flatMap(d => { try { return readdirSync(new URL(`${ex}/${d}/`, dir)).map(f => `${d}/${f}`); } catch { return []; } })
      .filter(f => /\.(vhd|v)$/.test(f)).map(f => ({ path: f, text: readFileSync(new URL(`${ex}/${f}`, dir), 'utf8') }));
    const signals = srcs => {
      const lib = compile(srcs);
      assert.deepEqual(lib.errors.filter(e => e.severity === 'error'), [], ex);
      return [...lib.modules.keys()].sort().map(m => elaborate(lib, m).signals.map(s => s.name).sort().join(' '));
    };
    const before = signals(files);
    for (const f of files) {
      const lang = f.path.endsWith('.v') ? 'verilog' : 'vhdl';
      for (const sym of analyze(f.text, lang).symbols) {
        if (['entity', 'module', 'architecture', 'package', 'component', 'field'].includes(sym.kind) || !sym.occs.length) continue;
        const o = sym.occs[0];
        const r = renameSymbol(f.text, lang, o.line, o.col, `zq_${sym.name}`);
        assert.equal(r.error, undefined, `${ex}/${f.path}: ${sym.name}`);
        // (a port / generic: also in the instances of the module in the other files, as the editor does)
        const unit = interfaceUnit(sym);
        const after = signals(files.map(x => (x === f ? { ...x, text: r.text }
          : unit ? { ...x, text: renameInterfaceInSource(x.text, x.path.endsWith('.v') ? 'verilog' : 'vhdl', unit.name, sym.name, `zq_${sym.name}`).text } : x)));
        // the same signals; the renamed one (and its copies in the hierarchy) with the new name
        // (a port connected to a signal of the same name is one net: compared as sets of names)
        const names = s => [...new Set(s.split(' '))].sort().join(' ');
        assert.deepEqual(after.map(s => names(s.replace(/(^|[ .])zq_/g, '$1'))), before.map(names), `${ex}/${f.path}: ${sym.kind} ${sym.name}`);
        renames++;
      }
    }
  }
  assert.ok(renames > 150, `${renames} renames`);
});
