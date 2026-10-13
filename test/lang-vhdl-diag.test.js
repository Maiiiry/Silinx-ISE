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

test('a pure function (a function is pure unless declared impure) that uses a signal, a port, a variable or a shared variable declared outside it, or calls an impure function or a side-effect procedure, is an error, as in ISE (#185)', () => {
  const unit = (decls, body = '  y <= f(a);') => `${H}entity tb is port (a : in std_logic; y : out std_logic); end;\narchitecture r of tb is\n${decls}\nbegin\n${body}\nend;`;
  const fn = (stmts, decls = '', kw = 'function') => `${decls}  ${kw} f(x : std_logic) return std_logic is\n  begin\n${stmts}\n  end function;`;
  // an architecture's signal, read
  assert.deepEqual(errs(unit(fn('    return x and s;', '  signal s : std_logic;\n'), '  s <= a;\n  y <= f(a);')),
    ["7:18 Cannot access signal 's' (line 4) from inside pure function 'f'."]);
  // a port (each line where it is used), an explicit `pure`
  assert.deepEqual(errs(unit(fn('    if a = x then\n      return a;\n    end if;\n    return x;', '', 'pure function'))),
    ["6:8 Cannot access port 'a' (line 2) from inside pure function 'f'.", "7:14 Cannot access port 'a' (line 2) from inside pure function 'f'."]);
  // an alias of a signal; an attribute of a signal
  assert.deepEqual(errs(unit(fn("    return s0 and x and s(s'left);", '  signal s : std_logic_vector(1 downto 0);\n  alias s0 : std_logic is s(0);\n'), '  s <= a & a;\n  y <= f(a);')),
    ["8:12 Cannot access signal 's0' (line 5) from inside pure function 'f'.", "8:25 Cannot access signal 's' (line 4) from inside pure function 'f'."]);
  // a process's variable, written and read
  const proc = (kw, stmts) => unit('', `  process (a)\n    variable v : std_logic := '0';\n    ${kw} f(x : std_logic) return std_logic is\n    begin\n${stmts}\n    end function;\n  begin\n    y <= f(a);\n  end process;`);
  assert.deepEqual(errs(proc('function', '      v := not v;\n      return x xor v;')),
    ["10:7 Cannot access variable 'v' (line 7) from inside pure function 'f'.", "11:20 Cannot access variable 'v' (line 7) from inside pure function 'f'."]);
  // an enclosing function's variable, in a function declared in it
  assert.deepEqual(errs(unit('  function f(x : std_logic) return std_logic is\n    variable t : std_logic;\n    function g return std_logic is\n    begin\n      return t;\n    end function;\n  begin\n    t := x;\n    return g;\n  end function;')),
    ["8:14 Cannot access variable 't' (line 5) from inside pure function 'g'."]);
  // a call of an impure function, of a procedure that uses a signal (declared outside or inside the function)
  assert.deepEqual(errs(unit(fn('    return x and g;', '  signal s : std_logic;\n  impure function g return std_logic is\n  begin\n    return s;\n  end function;\n'), '  s <= a;\n  y <= f(a);')),
    ["11:18 Cannot call impure function 'g' (line 5) from within pure function 'f'."]);
  assert.deepEqual(errs(unit('  signal s : std_logic;\n  procedure p(o : out std_logic) is\n  begin\n    o := s;\n  end procedure;\n  function f(x : std_logic) return std_logic is\n    variable t : std_logic;\n  begin\n    p(t);\n    return t and x;\n  end function;', '  s <= a;\n  y <= f(a);')),
    ["12:5 Cannot call side-effect procedure 'p' (line 5) from within pure function 'f'."]);
  assert.deepEqual(errs(unit('  signal s : std_logic;\n  function f(x : std_logic) return std_logic is\n    variable t : std_logic;\n    procedure p is\n    begin\n      t := s;\n    end procedure;\n  begin\n    p;\n    return t and x;\n  end function;', '  s <= a;\n  y <= f(a);')),
    ["12:5 Cannot call side-effect procedure 'p' (line 7) from within pure function 'f'."]);
  // a package's signal and shared variable, in the package (declaration and body) and in a design unit of another file that uses it
  const pkg = `${H}package p is\n  signal ps : std_logic;\n  shared variable sv : integer := 0;\n  function f(x : std_logic) return std_logic;\n  function n return integer;\nend p;\npackage body p is\n  function f(x : std_logic) return std_logic is\n  begin\n    return x and ps;\n  end function;\n  function n return integer is\n  begin\n    return sv;\n  end function;\nend p;\n`;
  assert.deepEqual(errs({ 'p.vhd': pkg }, null),
    ["11:18 Cannot access signal 'ps' (line 3) from inside pure function 'f'.", "15:12 Cannot access shared variable 'sv' (line 4) from inside pure function 'n'."]);
  const ipkg = pkg.replace(/\n {2}function/g, '\n  impure function');
  assert.deepEqual(errs({ 'p.vhd': ipkg }, null), []);
  assert.deepEqual(errs({ 'p.vhd': ipkg, 't.vhd': `${H}use work.p.all;\nentity tb is port (a : in std_logic; y : out std_logic); end;\narchitecture r of tb is\n  function g(x : std_logic) return std_logic is\n  begin\n    return x and ps and f(x);\n  end function;\nbegin\n  y <= g(a);\nend;` }),
    ["7:18 Cannot access signal 'ps' (line 3 of p.vhd) from inside pure function 'g'.", "7:25 Cannot call impure function 'f' (line 9 of p.vhd) from within pure function 'g'."]);
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
