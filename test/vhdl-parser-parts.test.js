// The parts of the VHDL parser (#405: out of core/vhdl/parser.js): its shared definitions (parse-defs.js) and
// helpers (parse-helpers.js), its declarations (parse-decls.js), concurrent statements (parse-concurrent.js) and
// sequential statements (parse-seq.js), methods of the parser as its expressions (parse-expr.js) are: an
// architecture using each of them parses with no error into the declarations, items and statements written; a
// broken statement gives its error and the parser goes on to the next unit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../core/vhdl/parser.js';
import { ParseError, block, STD_LIBS } from '../core/vhdl/parse-defs.js';
import { dedupe, isRealRange } from '../core/vhdl/parse-helpers.js';
import { declarationMethods } from '../core/vhdl/parse-decls.js';
import { concurrentMethods } from '../core/vhdl/parse-concurrent.js';
import { sequentialMethods } from '../core/vhdl/parse-seq.js';
import { expressionMethods } from '../core/vhdl/parse-expr.js';

const SRC = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity t is generic (N : integer := 4); port (clk, rst : in std_logic; d : in std_logic_vector(N-1 downto 0); q : out std_logic_vector(N-1 downto 0); y : out std_logic); end;
architecture rtl of t is
  type state_t is (idle, run);
  subtype word is unsigned(N-1 downto 0);
  signal s : state_t;
  signal c : word;
  constant ONE : word := to_unsigned(1, N);
  function inv(x : std_logic) return std_logic is begin return not x; end;
begin
  g : for i in 0 to N-1 generate q(i) <= d(i) xor c(i); end generate;
  y <= '1' when s = run else '0';
  u : entity work.sub port map (a => clk, b => open);
  p : process (clk, rst) begin
    if rst = '1' then c <= (others => '0'); s <= idle;
    elsif rising_edge(clk) then
      case s is when idle => s <= run; when run => c <= c + ONE; end case;
      for k in 0 to 1 loop null; end loop;
      assert c /= 0 report "zero" severity note;
    end if;
  end process;
end;`;

test('#405 VHDL parser parts: the definitions, the helpers and the methods of each part', () => {
  assert.ok(new ParseError('x') instanceof Error && STD_LIBS.has('ieee'));
  assert.deepEqual(block([], null), { kind: 'block', label: null, decls: [], stmts: [], loc: null });
  assert.deepEqual(dedupe([1, 2, 1]), [1, 2]);
  assert.equal(typeof isRealRange, 'function');
  assert.ok(['parseDeclarativePart', 'parseTypeDecl', 'parseSubprogram', 'parseRange'].every(k => typeof declarationMethods[k] === 'function'));
  assert.ok(['parseProcess', 'parseForGenerate', 'parseInstance', 'parseWaveform'].every(k => typeof concurrentMethods[k] === 'function'));
  assert.ok(['parseSeqStmts', 'parseIf', 'parseCase', 'parseLoop', 'parseWait'].every(k => typeof sequentialMethods[k] === 'function'));
  // (no method in two parts)
  const names = [declarationMethods, concurrentMethods, sequentialMethods, expressionMethods].flatMap(Object.keys);
  assert.equal(new Set(names).size, names.length);
});

test('#405 VHDL parser parts: declarations, concurrent and sequential statements parsed with no error', () => {
  const r = parse(SRC, 't.vhd');
  assert.deepEqual(r.errors, []);
  const m = r.units.find(u => u.name === 't');
  assert.deepEqual(m.decls.map(d => d.kind), ['type', 'type', 'signal', 'signal', 'const', 'function']);
  assert.deepEqual(m.items.map(i => i.kind), ['generate_for', 'assign', 'instance', 'process']);
  const proc = JSON.stringify(m.items[3]);
  for (const s of ['"kind":"if"', '"kind":"case"', '"kind":"forrange"', '"kind":"null"', '"kind":"assert"']) assert.ok(proc.includes(s), s);
});

test('#405 VHDL parser parts: a broken statement said, the parser going on to the next unit', () => {
  const r = parse(`entity a is port (x : in bit; y : out bit); end;
architecture r of a is begin process begin y <= x and ; wait; end process; end;
entity b is end;
architecture r of b is signal s : bit; begin s <= not s; end;`, 'd.vhd');
  assert.deepEqual(r.errors.map(e => `${e.line}:${e.col} ${e.message}`), ["2:55 expected expression but found ';'"]);
  assert.deepEqual(r.units.map(u => u.name), ['a', 'b']);
});
