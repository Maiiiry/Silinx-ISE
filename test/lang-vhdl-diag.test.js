// VHDL diagnostics: syntax errors, elaboration errors and run-time errors for common mistakes,
// with the line / column they are reported at and their message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diags, sim, vhd } from './lang-util.js';

const H = 'library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;\n';
const errs = (src, top = 'tb') => diags(src, top, { lang: 'vhdl' }).filter(d => d.severity === 'error').map(d => `${d.line}:${d.col} ${d.message}`);
const warns = (src, top = 'tb') => diags(src, top, { lang: 'vhdl' }).filter(d => d.severity === 'warning').map(d => `${d.line}:${d.col} ${d.message}`);

test('a missing semicolon at the end of a line is reported there, without follow-on errors', () => {
  assert.deepEqual(errs(H + 'entity tb is end;\narchitecture a of tb is\n  signal s : std_logic\nbegin\nend;'),
    ["4:23 expected ';' after 'std_logic'"]);
  assert.deepEqual(errs(H + 'entity tb is end;\narchitecture a of tb is\nbegin\n  process begin wait; end process\nend;'),
    ["5:34 expected ';' after 'process'"]);
  assert.deepEqual(errs(H + "entity tb is end;\narchitecture a of tb is\n  signal s : std_logic;\nbegin\n  s <= '1'\n  s <= '0';\nend;"),
    ["6:11 expected ';' after '1'"]);
});

test('syntax errors inside a line point at the offending token', () => {
  assert.deepEqual(errs(H + "entity tb is end;\narchitecture a of tb is\n  signal s : std_logic;\nbegin\n  s <= a +* ;\nend;"),
    ["6:11 expected expression but found '*'"]);
  const e = errs(H + 'entity tb is end;\narchitecture a of tb is\nbegin\n  proces begin wait; end process;\nend;');
  assert.equal(e[0], "5:10 expected '<=' but found 'begin'");
  const u = errs(H + 'entity tb is end;\narchitecture a of tb is\nbegin\n  process begin report "abc; wait; end process;\nend;');
  assert.equal(u[0], '5:24 unterminated string literal');
});

test('undeclared names, unknown types, unknown entities, ports and architectures', () => {
  assert.deepEqual(errs(H + "entity tb is end;\narchitecture a of tb is\nbegin\n  process begin\n    x <= '1';\n    wait;\n  end process;\nend;"),
    ["6:5 'x' is not declared"]);
  assert.deepEqual(errs(H + 'entity tb is end;\narchitecture a of tb is\n  signal a : my_type;\nbegin\nend;'),
    ["4:3 unknown type 'my_type'"]);
  assert.deepEqual(errs(H + 'entity tb is end;\narchitecture a of tb is\nbegin\n  u1 : entity work.nothere port map (a => open);\nend;'),
    ["5:3 module/entity 'nothere' not found (instance 'u1')"]);
  assert.deepEqual(errs(H + 'architecture a of nobody is begin end;'), ["2:1 architecture 'a' of unknown entity 'nobody'"]);
  assert.deepEqual(errs(H + 'entity x is end; architecture a of x is begin end;'), ["1:1 top module 'tb' not found"]);
  const sub = H + 'entity sub is port (a : in std_logic); end;\narchitecture r of sub is begin end;\n';
  const src = sub + H + 'entity tb is end;\narchitecture a of tb is signal s : std_logic; begin\n  u1 : entity work.sub port map (b => s);\nend;';
  assert.deepEqual(errs(src), ["7:3 module 'sub' has no port 'b'"]);
  assert.deepEqual(warns(src), ["7:3 input port 'a' of 'u1' is not connected"]);
});

test('width mismatches of vector assignments are warnings', () => {
  assert.deepEqual(warns(H + 'entity tb is end;\narchitecture a of tb is\n  signal a : std_logic_vector(3 downto 0);\n  signal b : std_logic_vector(7 downto 0);\nbegin\n  a <= b;\nend;'),
    ['7:3 width mismatch: target is 4 bits, value is 8 bits']);
});

test('calls with a wrong parameter, a missing argument, a procedure used as a function', () => {
  const pre = H + 'entity tb is end;\narchitecture a of tb is\n  function f(x : integer) return integer is begin return x; end function;\n  procedure p(x : integer) is begin end procedure;\nbegin\n  process\n    variable v : integer;\n  begin\n';
  assert.deepEqual(errs(pre + '    v := f(y => 1);\n    wait;\n  end process;\nend;'), ["10:5 'f' has no parameter 'y'"]);
  assert.deepEqual(errs(pre + '    v := f;\n    wait;\n  end process;\nend;'), ["10:5 missing argument 'x' in call to 'f'"]);
  assert.deepEqual(errs(pre + '    v := p(1);\n    wait;\n  end process;\nend;'), ["10:5 'p' is a procedure/task, not a function"]);
  assert.deepEqual(errs(pre + '    q(1);\n    wait;\n  end process;\nend;'), ["10:5 task/procedure 'q' is not declared"]);
});

test('run-time errors: a process without a wait, a combinational loop, a function without return', () => {
  let r = sim(vhd(`process begin n <= n + 1; end process;`, 'signal n : integer := 0;'), 'tb', { allowErrors: true });
  assert.match(r.log.find(l => l.kind === 'error').text, /loops forever without waiting/);
  r = sim(vhd(`a <= not a;`, "signal a : std_logic := '0';"), 'tb', { allowErrors: true });
  assert.match(r.log.find(l => l.kind === 'error').text, /^delta cycle limit \(10000\) exceeded at 0 ns: combinational loop\?/);
  r = sim(vhd(`process begin report integer'image(f(1)); wait; end process;`,
    'function f(x : integer) return integer is begin if x > 5 then return 1; end if; end function;'), 'tb', { allowErrors: true });
  assert.match(r.log.find(l => l.kind === 'error').text, /function f ended without return/);
});

test('run-time errors: integer division by zero, an index out of range, a value outside an integer subtype', () => {
  const err = (body, decls = '') => sim(vhd(body, decls), 'tb', { allowErrors: true }).log.find(l => l.kind === 'error').text;
  assert.match(err(`process variable z : integer := 0; begin report integer'image(10 / z); wait; end process;`), /^division by zero/);
  assert.match(err(`process variable z : integer := 0; begin report integer'image(10 mod z); wait; end process;`), /^division by zero/);
  assert.match(err(`process variable i : integer := 9; variable m : arr; begin m(i) := 1; wait; end process;`, 'type arr is array (0 to 3) of integer;'),
    /^index 9 out of range 0 to 3/);
  assert.match(err(`process variable i : integer := 4; variable m : arr; begin report integer'image(m(i)); wait; end process;`, 'type arr is array (0 to 3) of integer;'),
    /^index 4 out of range 0 to 3/);
  assert.match(err(`process variable i : integer := 8; variable v : std_logic_vector(7 downto 0); begin v(i) := '1'; wait; end process;`),
    /^index 8 out of range 7 downto 0/);
  assert.match(err(`process variable n : natural := 0; begin n := n - 1; wait; end process;`), /^value -1 out of range 0 to 2147483647/);
  assert.match(err(`process begin s <= 11; wait; end process;`, 'signal s : integer range 0 to 10;'), /^value 11 out of range 0 to 10/);
});

test('diagnostics carry the file they come from', () => {
  const d = diags({ 'a.vhd': H + 'entity tb is end;\narchitecture a of tb is begin\n  x <= 1;\nend;' }, 'tb');
  assert.deepEqual(d.map(x => [x.file, x.line]), [['a.vhd', 4]]);
});

test('a function that is not pure (pure unless declared impure: it uses a signal, a port, a variable, a shared variable or a file declared outside it, or calls an impure function or a side-effect procedure) is a warning at its end, an error when written pure, as XST for the Spartan-3E (#185)', () => {
  const all = (src, top = 'tb') => diags(src, top, { lang: 'vhdl' }).map(d => `${d.severity} ${d.line}:${d.col} ${d.message}`);
  const W = ' VHDL 87 allowed this; VHDL 93 requires the keyword IMPURE.';
  const unit = (decls, body = '  y <= f(a);') => `${H}entity tb is port (a : in std_logic; y : out std_logic); end;\narchitecture r of tb is\n${decls}\nbegin\n${body}\nend;`;
  const fn = (stmts, decls = '', kw = 'function') => `${decls}  ${kw} f(x : std_logic) return std_logic is\n  begin\n${stmts}\n  end function;`;
  // an architecture's signal, read
  assert.deepEqual(all(unit(fn('    return x and s;', '  signal s : std_logic;\n'), '  s <= a;\n  y <= f(a);')),
    [`warning 8:3 Function f is not pure: it uses signal 's' at line 7.${W}`]);
  // a port; written `pure`: an error (the first line where it is used)
  assert.deepEqual(all(unit(fn('    if a = x then\n      return a;\n    end if;\n    return x;', '', 'pure function'))),
    ["error 10:3 Function f is not pure: it uses port 'a' at line 6."]);
  // an attribute of a signal; an alias of a signal
  assert.deepEqual(all(unit(fn("    return s(s'left) and x;", '  signal s : std_logic_vector(1 downto 0);\n'), '  s <= a & a;\n  y <= f(a);')),
    [`warning 8:3 Function f is not pure: it uses signal 's' at line 7.${W}`]);
  assert.deepEqual(all(unit(fn('    return s0 and x;', '  signal s : std_logic_vector(1 downto 0);\n  alias s0 : std_logic is s(0);\n'), '  s <= a & a;\n  y <= f(a);')),
    [`warning 9:3 Function f is not pure: it uses signal 's0' at line 8.${W}`]);
  // a process's variable, written and read
  const proc = (kw, stmts) => unit('', `  process (a)\n    variable v : std_logic := '0';\n    ${kw} f(x : std_logic) return std_logic is\n    begin\n${stmts}\n    end function;\n  begin\n    y <= f(a);\n  end process;`);
  assert.deepEqual(all(proc('function', '      v := not v;\n      return x xor v;')),
    [`warning 12:5 Function f is not pure: it uses variable 'v' at line 10.${W}`]);
  assert.deepEqual(all(proc('pure function', '      v := not v;\n      return x xor v;')),
    ["error 12:5 Function f is not pure: it uses variable 'v' at line 10."]);
  // an enclosing function's variable, in a function declared in it
  assert.deepEqual(all(unit('  function f(x : std_logic) return std_logic is\n    variable t : std_logic;\n    function g return std_logic is\n    begin\n      return t;\n    end function;\n  begin\n    t := x;\n    return g;\n  end function;')),
    [`warning 9:5 Function g is not pure: it uses variable 't' at line 8.${W}`]);
  // a call of an impure function, of a procedure that uses a signal (declared outside or inside the function)
  assert.deepEqual(all(unit(fn('    return x and g;', '  signal s : std_logic;\n  impure function g return std_logic is\n  begin\n    return s;\n  end function;\n'), '  s <= a;\n  y <= f(a);')),
    [`warning 12:3 Function f is not pure: it calls impure function 'g' at line 11.${W}`]);
  assert.deepEqual(all(unit('  signal s : std_logic;\n  procedure p(o : out std_logic) is\n  begin\n    o := s;\n  end procedure;\n  function f(x : std_logic) return std_logic is\n    variable t : std_logic;\n  begin\n    p(t);\n    return t and x;\n  end function;', '  s <= a;\n  y <= f(a);')),
    [`warning 14:3 Function f is not pure: it calls side-effect procedure 'p' at line 12.${W}`]);
  assert.deepEqual(all(unit('  signal s : std_logic;\n  function f(x : std_logic) return std_logic is\n    variable t : std_logic;\n    procedure p is\n    begin\n      t := s;\n    end procedure;\n  begin\n    p;\n    return t and x;\n  end function;', '  s <= a;\n  y <= f(a);')),
    [`warning 14:3 Function f is not pure: it calls side-effect procedure 'p' at line 12.${W}`]);
  // a file
  assert.deepEqual(all(`${H}use std.textio.all;\nentity tb is port (a : in std_logic; y : out std_logic); end;\narchitecture r of tb is\n  file fo : text open write_mode is "out.txt";\n  function f(x : std_logic) return std_logic is\n    variable l : line;\n  begin\n    write(l, string'("x"));\n    writeline(fo, l);\n    return x;\n  end function;\nbegin\n  y <= f(a);\nend;`),
    [`warning 12:3 Function f is not pure: it uses file 'fo' at line 10.${W}`]);
  // a package's signal and shared variable, in the package (declaration and body) and in a design unit of another file that uses it
  const pkg = `${H}package p is\n  signal ps : std_logic;\n  shared variable sv : integer := 0;\n  function f(x : std_logic) return std_logic;\n  function n return integer;\nend p;\npackage body p is\n  function f(x : std_logic) return std_logic is\n  begin\n    return x and ps;\n  end function;\n  function n return integer is\n  begin\n    return sv;\n  end function;\nend p;\n`;
  assert.deepEqual(all({ 'p.vhd': pkg }, null),
    [`warning 12:3 Function f is not pure: it uses signal 'ps' at line 11.${W}`, `warning 16:3 Function n is not pure: it uses shared variable 'sv' at line 15.${W}`]);
  const ipkg = pkg.replace(/\n {2}function/g, '\n  impure function');
  assert.deepEqual(all({ 'p.vhd': ipkg }, null), []);
  assert.deepEqual(all({ 'p.vhd': ipkg, 't.vhd': `${H}use work.p.all;\nentity tb is port (a : in std_logic; y : out std_logic); end;\narchitecture r of tb is\n  function g(x : std_logic) return std_logic is\n  begin\n    return f(x) and x;\n  end function;\nbegin\n  y <= g(a);\nend;` }),
    [`warning 8:3 Function g is not pure: it calls impure function 'f' at line 7.${W}`]);
});

test('impure functions may use what is declared outside them; pure ones their parameters, constants, generics, their own variables, other pure functions, procedures that only use their parameters, and now (as ISE) (#185)', () => {
  const unit = (decls, body = '  y <= f(a);') => `${H}entity tb is generic (N : integer := 1); port (a : in std_logic; y : out std_logic); end;\narchitecture r of tb is\n${decls}\nbegin\n${body}\nend;`;
  const impure = unit('  signal s : std_logic;\n  impure function g return std_logic is\n  begin\n    return s;\n  end function;\n  impure function f(x : std_logic) return std_logic is\n  begin\n    return x and g and s and a;\n  end function;', '  s <= a;\n  y <= f(a);');
  assert.deepEqual(errs(impure), []);
  assert.deepEqual(warns(impure), []);
  const inProcess = unit('', "  process (a)\n    variable v : std_logic := '0';\n    impure function f(x : std_logic) return std_logic is\n    begin\n      v := not v;\n      return x xor v;\n    end function;\n  begin\n    y <= f(a);\n  end process;");
  assert.deepEqual(errs(inProcess), []);
  assert.deepEqual(warns(inProcess), []);
  const pure = unit('  constant K : integer := 2;\n  function h(x : std_logic) return std_logic is\n  begin\n    return not x;\n  end function;\n  procedure p(i : in std_logic; o : out std_logic) is\n  begin\n    o := h(i);\n  end procedure;\n  pure function f(x : std_logic) return std_logic is\n    variable t : std_logic;\n    variable c : integer := K + N;\n  begin\n    p(x, t);\n    if now > 10 ns and c = 3 then\n      t := h(t);\n    end if;\n    return t;\n  end function;');
  assert.deepEqual(errs(pure), []);
  assert.deepEqual(warns(pure), []);
  // a signal parameter
  const sigParam = unit('  signal s : std_logic;\n  function f(signal x : std_logic) return std_logic is\n  begin\n    return x;\n  end function;', '  s <= a;\n  y <= f(s);');
  assert.deepEqual(errs(sigParam), []);
  assert.deepEqual(warns(sigParam), []);
});

test('a statement label with the name of a declaration of its region (the architecture with its entity, a block, a generate) is an error, at the line XST reports it: where the statement ends, a block at its label, a second label at the label (#192)', () => {
  const all = (src, top = 'tb') => diags(src, top, { lang: 'vhdl' }).map(d => `${d.severity} ${d.line}:${d.col} ${d.message}`);
  const unit = (decls, body, generic = '') => `${H}entity tb is ${generic}port (clk : in std_logic; d : in std_logic_vector(3 downto 0); q : out std_logic_vector(3 downto 0)); end;\narchitecture r of tb is\n${decls}begin\n${body}end;\n`;
  const sub = `${H}entity sub is port (a : in std_logic; y : out std_logic); end;\narchitecture r of sub is begin y <= a; end;\n`;
  const R = (name, what, line, decl, at, label = name) => `Redeclaration of symbol ${label}: the label of the ${what} (line ${line}) is also the name of ${decl} '${name}' (line ${at}).`;
  const comp = '  component sub is port (a : in std_logic; y : out std_logic); end component;\n';
  // an instance (on one line: at its label; on more lines: at the first token of its last line), as in the issue
  assert.deepEqual(all({ 's.vhd': sub, 't.vhd': unit(`  signal b1 : std_logic;\n${comp}`, '  b1 : sub port map (a => d(0), y => b1);\n  q <= "000" & b1;\n') }),
    [`error 7:3 ${R('b1', 'instance', 7, 'signal', 4)}`]);
  // (any case: the label as written, as XST)
  assert.deepEqual(all({ 's.vhd': sub, 't.vhd': unit(`  signal b1 : std_logic;\n${comp}`, '  B1 : sub\n    port map (a => d(0),\n      y => b1);\n  q <= "000" & b1;\n') }),
    [`error 9:7 ${R('b1', 'instance', 7, 'signal', 4, 'B1')}`]);
  // a process: at its end (with or without the label after `end process`)
  assert.deepEqual(all(unit('  signal p : std_logic;\n', '  p : process (clk)\n  begin\n    if rising_edge(clk) then p <= d(0); end if;\n  end process p;\n  q <= "000" & p;\n')),
    [`error 9:3 ${R('p', 'process', 6, 'signal', 4)}`]);
  assert.deepEqual(all(unit('  signal p : std_logic;\n', '  p : postponed process (clk)\n  begin\n    if rising_edge(clk) then\n      p <= d(0);\n    end if;\n  end process;\n  q <= "000" & p;\n')),
    [`error 11:3 ${R('p', 'process', 6, 'signal', 4)}`]);
  // concurrent assignments, a selected one, an assertion, a procedure call: at the line of their ';'
  assert.deepEqual(all(unit('  signal s : std_logic;\n', '  s : s <= d(0);\n  q <= "000" & s;\n')), [`error 6:3 ${R('s', 'assignment', 6, 'signal', 4)}`]);
  assert.deepEqual(all(unit('  signal s : std_logic;\n', "  s : s <= d(0) when d(1) = '1'\n    else d(2);\n  q <= \"000\" & s;\n")), [`error 7:5 ${R('s', 'assignment', 6, 'signal', 4)}`]);
  assert.deepEqual(all(unit('  signal s : std_logic;\n', "  s : with d(1) select\n    s <= d(0) when '1',\n         d(2) when others;\n  q <= \"000\" & s;\n")), [`error 8:10 ${R('s', 'assignment', 6, 'signal', 4)}`]);
  assert.deepEqual(all(unit('  signal s : std_logic;\n', "  s <= d(0);\n  s : assert d(0) = '0'\n    report \"x\" severity note;\n  q <= d;\n")), [`error 8:5 ${R('s', 'assertion', 7, 'signal', 4)}`]);
  assert.deepEqual(all(unit('  signal s : std_logic;\n  procedure p(signal a : in std_logic; signal y : out std_logic) is begin y <= a; end p;\n', '  s <= d(0);\n  s : p(d(0),\n    q(0));\n  q(3 downto 1) <= d(3 downto 1);\n')),
    [`error 9:5 ${R('s', 'procedure call', 8, 'signal', 4)}`]);
  // a block: at its label; generates: at their end
  assert.deepEqual(all(unit('  signal bk : std_logic;\n', '  bk : block\n  begin\n    q <= d;\n  end block bk;\n  bk <= d(0);\n')), [`error 6:3 ${R('bk', 'block', 6, 'signal', 4)}`]);
  assert.deepEqual(all(unit('  signal g : std_logic;\n', '  g : for i in 0 to 3 generate\n    q(i) <= d(i);\n  end generate g;\n  g <= d(0);\n')), [`error 8:3 ${R('g', 'generate', 6, 'signal', 4)}`]);
  assert.deepEqual(all(unit('  signal g : std_logic;\n', '  g : if true generate\n    q <= d;\n  end generate;\n  g <= d(0);\n')), [`error 8:3 ${R('g', 'generate', 6, 'signal', 4)}`]);
  // the name of a constant, a type, an enumeration literal, a function, an alias, a component, a port, a generic
  const proc = name => `  ${name} : process (d)\n  begin\n    q <= d;\n  end process ${name};\n`;
  assert.deepEqual(all(unit("  constant k : std_logic := '0';\n", proc('k'))), [`error 9:3 ${R('k', 'process', 6, 'constant', 4)}`]);
  assert.deepEqual(all(unit('  type st_t is (idle, run);\n  signal st : st_t;\n', `${proc('st_t')}  st <= idle;\n`)), [`error 10:3 ${R('st_t', 'process', 7, 'type', 4)}`]);
  assert.deepEqual(all(unit('  type st_t is (idle, run);\n  signal st : st_t;\n', `${proc('idle')}  st <= run;\n`)), [`error 10:3 ${R('idle', 'process', 7, 'enumeration literal', 4)}`]);
  assert.deepEqual(all(unit('  function f(x : std_logic) return std_logic is begin return not x; end f;\n', proc('f'))), [`error 9:3 ${R('f', 'process', 6, 'function', 4)}`]);
  assert.deepEqual(all(unit('  alias dd : std_logic_vector(3 downto 0) is d;\n', proc('dd'))), [`error 9:3 ${R('dd', 'process', 6, 'alias', 4)}`]);
  assert.deepEqual(all({ 's.vhd': sub, 't.vhd': unit(comp, '  sub : sub port map (a => d(0), y => q(0));\n  q(3 downto 1) <= d(3 downto 1);\n') }), [`error 6:3 ${R('sub', 'instance', 6, 'component', 4)}`]);
  assert.deepEqual(all(unit('', proc('clk'))), [`error 8:3 ${R('clk', 'process', 5, 'port', 2)}`]);
  assert.deepEqual(all(unit('', proc('n'), 'generic (n : integer := 4); ')), [`error 8:3 ${R('n', 'process', 5, 'generic', 2)}`]);
  // the region of a generate (its declarations, its parameter) and of a block
  assert.deepEqual(all(unit('', '  g : for i in 0 to 3 generate\n    signal t : std_logic;\n  begin\n    t : process (d)\n    begin\n      q(i) <= d(i);\n    end process t;\n    t <= d(i);\n  end generate g;\n')),
    [`error 11:5 ${R('t', 'process', 8, 'signal', 6)}`]);
  assert.deepEqual(all(unit('', '  g : for i in 0 to 3 generate\n    i : q(i) <= d(i);\n  end generate g;\n')), [`error 6:5 ${R('i', 'assignment', 6, 'generate parameter', 5)}`]);
  assert.deepEqual(all(unit('', "  g : if true generate\n    constant c : std_logic := '0';\n  begin\n    c : q <= d;\n  end generate g;\n")), [`error 8:5 ${R('c', 'assignment', 8, 'constant', 6)}`]);
  assert.deepEqual(all(unit('', '  bk : block\n    signal t : std_logic;\n  begin\n    t : t <= d(0);\n    q <= d;\n  end block bk;\n')), [`error 8:5 ${R('t', 'assignment', 8, 'signal', 6)}`]);
  // two statements with one label: at the second label; two errors
  assert.deepEqual(all(unit('', '  p : process (d)\n  begin\n    q(0) <= d(0);\n  end process p;\n  p : process (d)\n  begin\n    q(1) <= d(1);\n  end process p;\n  q(3 downto 2) <= d(3 downto 2);\n')),
    [`error 9:3 ${R('p', 'process', 9, 'label', 5)}`]);
  assert.deepEqual(all(unit('', '  g : for i in 0 to 1 generate\n    q(i) <= d(i);\n  end generate g;\n  g : for i in 2 to 3 generate\n    q(i) <= d(i);\n  end generate g;\n')),
    [`error 8:3 ${R('g', 'generate', 8, 'label', 5)}`]);
  assert.deepEqual(all(unit('  signal a1, a2 : std_logic;\n', '  a1 : a1 <= d(0);\n  a2 : process (d)\n  begin\n    a2 <= d(1);\n  end process;\n  q <= "00" & a1 & a2;\n')),
    [`error 6:3 ${R('a1', 'assignment', 6, 'signal', 4)}`, `error 10:3 ${R('a2', 'process', 7, 'signal', 4)}`]);
  // an architecture of an entity of another file: its ports and generics
  assert.deepEqual(all({ 'e.vhd': `${H}entity tb is port (clk : in std_logic; q : out std_logic); end;\n`, 'a.vhd': `${H}architecture r of tb is\nbegin\n  clk : q <= clk;\nend;\n` }),
    ["error 4:3 Redeclaration of symbol clk: the label of the assignment (line 4) is also the name of port 'clk' (line 2 of e.vhd)."]);
});

test('a label may have the name of a declaration of an outer region, of a library unit, of the architecture / entity, of an attribute; a sequential label (loop, if, case…) that of a variable, as XST for the Spartan-3E accepts them (#192)', () => {
  const unit = (decls, body) => `${H}entity tb is port (clk : in std_logic; d : in std_logic_vector(3 downto 0); q : out std_logic_vector(3 downto 0)); end;\narchitecture r of tb is\n${decls}begin\n${body}end;\n`;
  const none = src => assert.deepEqual(diags(src, 'tb', { lang: 'vhdl' }).filter(d => d.severity === 'error' || /Redeclaration/.test(d.message)), []);
  // a signal of the architecture labelling a statement of a generate, of a block
  none(unit('  signal t : std_logic;\n', '  g : for i in 0 to 3 generate\n    t : q(i) <= d(i);\n  end generate g;\n  t <= d(0);\n'));
  none(unit('  signal t : std_logic;\n', '  bk : block\n  begin\n    t : q <= d;\n  end block bk;\n  t <= d(0);\n'));
  // a block's / generate's / process's own declarations, parameter, variable
  none(unit('', '  bk : block\n    signal bk : std_logic;\n  begin\n    bk <= d(0);\n    q <= d;\n  end block bk;\n'));
  none(unit('', '  i : for i in 0 to 3 generate\n    q(i) <= d(i);\n  end generate i;\n'));
  none(unit('', '  v : process (d)\n    variable v : std_logic;\n  begin\n    v := d(0);\n    q <= d;\n  end process v;\n'));
  // the entity, the architecture, a library, a predefined function, an attribute, the entity of an instance
  none(unit('  attribute keep : string;\n', '  tb : q(0) <= d(0);\n  r : q(1) <= d(1);\n  ieee : q(2) <= d(2);\n  rising_edge : q(3) <= d(3);\n  keep : process (clk) begin end process;\n'));
  const sub = `${H}entity sub is port (a : in std_logic; y : out std_logic); end;\narchitecture r of sub is begin y <= a; end;\n`;
  none({ 's.vhd': sub, 't.vhd': unit('', '  sub : entity work.sub port map (a => d(0), y => q(0));\n  q(3 downto 1) <= d(3 downto 1);\n') });
  // sequential labels: a loop / if / case / while with the name of a variable, of a signal, of a port, of its process, of a parameter
  none(unit('', '  process (d)\n    variable lp : integer;\n  begin\n    lp := 0;\n    lp : for i in 0 to 3 loop\n      q(i) <= d(i);\n    end loop lp;\n  end process;\n'));
  none(unit('  signal lp : std_logic;\n', "  process (d)\n  begin\n    lp : for i in 0 to 3 loop\n      q(i) <= d(i);\n      exit lp when d(i) = '1';\n    end loop lp;\n  end process;\n  lp <= d(0);\n"));
  none(unit('', "  process (d)\n    variable v : std_logic;\n  begin\n    v := d(0);\n    v : if v = '1' then q <= d; else q <= not d; end if v;\n  end process;\n"));
  none(unit('', "  process (d)\n    variable v : std_logic;\n  begin\n    v : case d(0) is when '1' => q <= d; when others => q <= not d; end case v;\n  end process;\n"));
  none(unit('', '  process (d)\n    variable w : integer;\n  begin\n    w := 0;\n    w : while w < 4 loop\n      q(w) <= d(w);\n      w := w + 1;\n    end loop w;\n  end process;\n'));
  none(unit('', '  p : process (d)\n  begin\n    p : for i in 0 to 3 loop\n      q(i) <= d(i);\n    end loop p;\n  end process p;\n'));
  none(unit('', '  process (d)\n  begin\n    clk : for i in 0 to 3 loop\n      q(i) <= d(i);\n    end loop clk;\n  end process;\n'));
  none(unit('  function f(x : std_logic_vector(3 downto 0)) return std_logic_vector is\n    variable r : std_logic_vector(3 downto 0);\n  begin\n    x : for i in 0 to 3 loop\n      r(i) := not x(i);\n    end loop x;\n    return r;\n  end f;\n', '  q <= f(d);\n'));
});
