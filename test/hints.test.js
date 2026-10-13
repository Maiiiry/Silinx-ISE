// core/hints.js: plain-language explanation + fix (English and Portuguese) of the common compile /
// elaboration errors and of the design checks; the original ISE-style message is kept unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { designChecks, LINT_CHECKS, RULE_CHECKS } from '../core/lint.js';
import { HINTS, hintFor, hintText, HINT_LABELS } from '../core/hints.js';

/** Every diagnostic (parse, elaboration, design checks) of the sources, with its hint id. */
function diags(files, top) {
  const lib = compile(Object.entries(files).map(([path, text]) => ({ path, text })));
  let design = null;
  try { design = elaborate(lib, top); } catch { /* parse errors only */ }
  const all = [...lib.errors, ...(design?.diags || []), ...(design ? designChecks(lib, design) : [])];
  return all.map(d => ({ ...d, hint: hintFor(d)?.id ?? null }));
}
/** Hint id of the first diagnostic (of a severity) of the sources. */
const first = (files, top, sev = 'error') => {
  const ds = diags(files, top).filter(d => d.severity === sev);
  assert.ok(ds.length, `a ${sev} for ${Object.values(files)[0].slice(0, 200)}`);
  return ds[0];
};

const V = (body, decl = '', ports = 'a, b : in std_logic; y : out std_logic', ctx = 'library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;') =>
  ({ 't.vhd': `${ctx}\nentity t is port (${ports}); end t;\narchitecture rtl of t is\n${decl}\nbegin\n${body}\nend rtl;\n` });
const VL = (body, ports = 'input a, b, output y') => ({ 't.v': `module t(${ports});\n${body}\nendmodule\n` });

test('the hint table is well formed: unique ids, English and Portuguese explanation + fix, a pattern or a check', () => {
  const ids = new Set();
  for (const h of HINTS) {
    assert.ok(h.id && !ids.has(h.id), `unique id ${h.id}`);
    ids.add(h.id);
    assert.ok(h.re instanceof RegExp || h.check, h.id);
    for (const l of ['en', 'pt']) for (const k of ['explain', 'fix']) {
      assert.equal(typeof h[l]?.[k], 'string', `${h.id}.${l}.${k}`);
      assert.ok(h[l][k].length > 20, `${h.id}.${l}.${k} is a sentence`);
    }
    assert.notEqual(h.pt.explain, h.en.explain, `${h.id}: Portuguese text`);
    assert.notEqual(h.pt.fix, h.en.fix, `${h.id}: Portuguese text`);
  }
  assert.deepEqual(Object.keys(HINT_LABELS).sort(), ['en', 'pt']);
  assert.equal(HINT_LABELS.pt.fix, 'Como corrigir');
});

test('every design check and rule has a help text in both languages', () => {
  for (const check of [...LINT_CHECKS, ...RULE_CHECKS]) {
    const h = hintFor({ check, message: 'x' });
    assert.ok(h, `hint for ${check}`);
    assert.ok(h.en.explain && h.pt.explain && h.en.fix && h.pt.fix, check);
  }
  assert.equal(hintFor({ message: 'something nobody wrote' }), null);
  assert.equal(hintFor(null), null);
});

test('syntax errors: missing ";" (VHDL / Verilog), missing "end if", missing "end", missing "then", statement in the wrong place', () => {
  const semi = first(V('y <= a and b\n'), 't');
  assert.equal(semi.message, "expected ';' after 'b'");   // the ISE-style message itself is unchanged
  assert.equal(semi.hint, 'missing-semicolon');
  const h = hintFor(semi);
  assert.match(h.en.fix, /Add ';' after b/);
  assert.match(h.pt.fix, /Acrescente ';' depois de b/);
  assert.equal(first(VL('assign y = a & b\n'), 't').hint, 'missing-semicolon');
  assert.equal(first(V("process (a, b) begin\n  if a = '1' then y <= b; else y <= '0';\nend process;"), 't').hint, 'missing-end-if');
  assert.equal(first(VL('reg r;\nalways @(a) begin\n  r = b;\nassign y = r;'), 't').hint, 'missing-end');
  assert.equal(first(V("process (a, b) begin\n  case a is when '0' => y <= b; when others => y <= '0';\nend process;"), 't').hint, 'missing-end');
  assert.equal(first(V("process (a, b) begin\n  if a = '1' y <= b; end if;\nend process;"), 't').hint, 'missing-then');
  assert.equal(first(V("if a = '1' then y <= b; end if;"), 't').hint, 'statement-outside-process');
  assert.equal(first(V("case a is when '0' => y <= b; when others => y <= '0'; end case;"), 't').hint, 'statement-outside-process');
  assert.equal(first(V('signal z : std_logic;\ny <= a;'), 't').hint, 'declaration-place');
  assert.equal(first(V('y = a;'), 't').hint, 'assignment-operator');
  assert.equal(first(V("process (a, b) begin\n  y <= a;\n  wait on a;\n  if a = '1' then\nend process;"), 't').hint, 'missing-end-if');
});

test('names and types: undeclared signal, numeric_std / std_logic_1164 missing, std_logic vs std_logic_vector, width, mode in / out', () => {
  const und = first(V('y <= a and c;'), 't');
  assert.equal(und.message, "'c' is not declared");
  assert.equal(und.hint, 'not-declared');
  assert.match(hintFor(und).en.fix, /signal c : std_logic;/);
  assert.match(hintFor(und).pt.explain, /não está declarado/);
  const num = first(V('y <= std_logic(to_unsigned(1, 1)(0));', '', 'a, b : in std_logic; y : out std_logic', 'library ieee; use ieee.std_logic_1164.all;'), 't');
  assert.equal(num.hint, 'numeric-std-not-declared');
  assert.match(hintFor(num).en.fix, /use ieee\.numeric_std\.all;/);
  assert.equal(first(V("y <= '1';", '', 'y : out std_logic', ''), 't').hint, 'std-logic-not-declared');
  const tm = first(V('y <= v;', 'signal v : std_logic_vector(3 downto 0) := "0000";'), 't');
  assert.equal(tm.hint, 'type-mismatch');
  assert.match(hintText(tm, 'en').explain, /the value \(v\) is std_logic_vector but the target needs std_logic/);
  assert.match(hintText(tm, 'pt').explain, /o valor \(v\) é std_logic_vector mas o destino precisa de std_logic/);
  const w = first(V('v <= w; y <= v(0) or w(0);', 'signal v : std_logic_vector(3 downto 0); signal w : std_logic_vector(2 downto 0) := "000";'), 't', 'warning');
  assert.equal(w.hint, 'width-mismatch');
  assert.match(hintText(w).fix, /resize\(unsigned\(x\), 4\)/);
  assert.equal(first(V('a <= b; y <= b;'), 't').hint, 'mode-in');
  const mo = first(V('y <= a; y2 <= not y;', '', 'a : in std_logic; y, y2 : out std_logic'), 't');
  assert.equal(mo.hint, 'mode-out');
  assert.match(hintText(mo).fix, /signal y_reg/);
  assert.equal(first(V('y <= a;', 'signal y : std_logic;'), 't', 'warning').hint, 'redeclared');
  assert.equal(first(V('y <= a;', 'signal s : std_logc;'), 't').hint, 'unknown-type');
  assert.equal(first(V("process (a)\n  variable k : std_logic;\nbegin\n  k <= a; y <= k;\nend process;"), 't', 'warning').hint, 'variable-assign');
});

test('hierarchy: unknown module / entity, unknown port, too many ports, Verilog implicit net, wire / reg', () => {
  const C = 'library ieee; use ieee.std_logic_1164.all;\nentity c is port (x : in std_logic; q : out std_logic); end c;\narchitecture r of c is begin q <= x; end r;\n';
  const unk = first(V('u: entity work.foo port map (a => a, y => y);'), 't');
  assert.equal(unk.message, "module/entity 'foo' not found (instance 'u')");
  assert.equal(unk.hint, 'unknown-module');
  assert.match(hintText(unk, 'pt').explain, /A instância 'u' usa o módulo \/ entidade 'foo'/);
  assert.equal(first({ 'c.vhd': C, ...V('u: entity work.c port map (x => a, z => y);') }, 't').hint, 'unknown-port');
  assert.equal(first({ 'c.vhd': C, ...V('u: entity work.c port map (a, b, y);') }, 't').hint, 'too-many-ports');
  assert.equal(first(VL('assign w = a;\nassign y = w & b;'), 't', 'warning').hint, 'implicit-net');
  assert.equal(first(VL('wire w;\nalways @* w = a & b;\nassign y = w;'), 't').hint, 'wire-procedural');
  assert.equal(first(VL('reg r;\nassign r = a & b;\nassign y = r;'), 't').hint, 'reg-continuous');
  assert.equal(first(VL('foo u(.a(a));\nassign y = b;'), 't').hint, 'unknown-module');
});

test('design-check warnings carry their hint: latch, sensitivity (VHDL / Verilog), case without others, blocking', () => {
  const latch = first(V("process (a, b) begin\n  if a = '1' then y <= b; end if;\nend process;"), 't', 'warning');
  assert.equal(latch.check, 'latch');
  assert.equal(latch.hint, 'latch');
  assert.match(hintText(latch, 'en').explain, /A latch is inferred for 'y'/);
  assert.match(hintText(latch, 'pt').explain, /É inferido um latch \(trinco\) para 'y'/);
  assert.match(hintText(latch, 'en').fix, /add an 'else' branch/);
  assert.equal(first(V('process (a) begin\n  y <= a and b;\nend process;'), 't', 'warning').hint, 'sensitivity-vhdl');
  const vs = first(VL('always @(a) y = a & b;', 'input a, b, output reg y'), 't', 'warning');
  assert.equal(vs.hint, 'sensitivity-verilog');
  assert.match(hintText(vs).fix, /always @\*/);
  assert.equal(first(VL('always @(posedge a) y = b;', 'input a, b, output reg y'), 't', 'warning').hint, 'blocking');
  const cs = diags(V("process (a, b) begin\n  y <= '0';\n  case std_logic_vector'(a & b) is when \"11\" => y <= '1'; end case;\nend process;"), 't').find(d => d.check === 'case-default');
  assert.equal(cs.hint, 'case-default');
  assert.match(hintText(cs).fix, /when others =>/);
  // no placeholder is left in any text
  for (const d of [latch, vs, cs]) for (const l of ['en', 'pt']) assert.doesNotMatch(JSON.stringify(hintText(d, l)), /\$\d/);
});

test('hintText: the language falls back to English; messages from the console (implementation tools) without a hint', () => {
  const d = { message: "expected ';' after 'x'" };
  assert.deepEqual(hintText(d, 'xx'), hintText(d, 'en'));
  assert.equal(hintText({ message: 'Xst:2677 - Node <x> of sequential type is unconnected', tool: 'Xst' }, 'en'), null);
});

test('Verilog: a missing end / endfunction is reported (the parser used to loop forever on it)', () => {
  const ds = diags(VL('reg r;\nalways @(a) begin\n  r = b;\n'), 't');
  assert.deepEqual(ds.map(d => [d.severity, d.message, d.hint]), [['error', "expected 'end' but found 'endmodule'", 'missing-end']]);
  const f = diags(VL('function f; input x; begin f = x;\nassign y = a;'), 't');
  assert.deepEqual(f.map(d => [d.severity, d.message, d.hint]), [
    ['error', "expected 'end' but found 'assign'", 'missing-end'],
    ['error', "expected 'endfunction' but found 'endmodule'", 'missing-end'],
  ]);
});

test('Silinx\'s own checks say which XST message they correspond to (Silinx:NNN is Xst:NNN)', () => {
  const d = { message: 'Found 1-bit latch for signal <q>. Latches may be generated from incomplete case or if statements.', tool: 'Silinx:737', check: 'latch' };
  assert.match(hintText(d, 'en').explain, / \(Xilinx ISE's XST reports this as Xst:737\.\)$/);
  assert.match(hintText(d, 'pt').explain, / \(O XST do Xilinx ISE reporta isto como Xst:737\.\)$/);
  // a message of XST itself (ISE modes), or of another tool: no such note
  assert.doesNotMatch(hintText({ ...d, tool: 'Xst' }, 'en').explain, /reports this as/);
  assert.doesNotMatch(hintText({ ...d, tool: 'Lint' }, 'en').explain, /reports this as/);
  // a check without an XST number: labelled Silinx (#16), no such note either
  assert.doesNotMatch(hintText({ message: "Case statement without 'default' in a combinational always block", tool: 'Silinx', check: 'case-default' }, 'en').explain, /reports this as/);
});

test('help for the unused bits of an input bus and for names that differ only in case (#38)', () => {
  const bits = hintFor({ message: 'Input <btn<2:1>> is never used.', tool: 'Silinx:647', check: 'unused-input' });
  assert.equal(bits.id, 'unused-input-bits');
  assert.match(bits.en.explain, /^Only some bits of the input bus 'btn' are read: bits 2:1 are never used/);
  assert.match(bits.en.explain, /XST reports this as Xst:647\.\)$/);
  assert.match(bits.pt.explain, /^Só alguns bits do barramento de entrada 'btn' são lidos: os bits 2:1 nunca são usados/);
  assert.equal(hintFor({ message: 'Input <c> is never used.', check: 'unused-input' }).id, 'unused-input');
  const nc = hintFor({ message: 'Name conflict (<scorer> and <scoreR>, renaming scorer as scorer_rnm0)', tool: 'Silinx:863', check: 'name-case' });
  assert.equal(nc.id, 'name-case');
  assert.match(nc.en.explain, /^'scorer' and 'scoreR' differ only in upper \/ lower case\./);
  assert.match(nc.en.explain, /XST reports this as Xst:863\.\)$/);
  assert.match(nc.pt.fix, /nome claramente diferente/);
});

test('help for a function that is not pure: it uses what is declared outside it, or calls an impure function / a side-effect procedure; a warning, an error when written pure (#185)', () => {
  const acc = first(V('y <= f(a);', 'function f(x : std_logic) return std_logic is\nbegin\n  return x and b;\nend function;'), 't', 'warning');
  assert.equal(acc.message, "Function f is not pure: it uses port 'b' at line 6. VHDL 87 allowed this; VHDL 93 requires the keyword IMPURE.");
  assert.equal(acc.hint, 'pure-function');
  assert.equal(hintText(acc, 'en').explain, "'f' is a pure function (a VHDL function is pure unless it is declared impure): its result may depend only on its parameters, like a formula. It must not read or change a signal, a port, a variable or a file declared outside it, but it uses the port 'b' (line 6). Written 'function' (pure by default) this is a warning: ISE's synthesis for the Spartan-3E still accepts it, as VHDL-87 did, but VHDL-93 and ISim do not; written 'pure function' it is an error.");
  assert.equal(hintText(acc, 'en').fix, "Pass 'b' to the function as a parameter (f(x, b)), or, if it must use it, declare the function impure: 'impure function f …' (in the package declaration too, if it has one).");
  assert.match(hintText(acc, 'pt').explain, /^'f' é uma função pura .* mas usa o port 'b' \(linha 6\)\. Escrita 'function' \(pura por omissão\) é um aviso: .* escrita 'pure function' é um erro\.$/);
  assert.match(hintText(acc, 'pt').fix, /declare a função impura: 'impure function f …'/);
  const err = first(V('y <= f(a);', 'pure function f(x : std_logic) return std_logic is\nbegin\n  return x and b;\nend function;'), 't');
  assert.equal(err.message, "Function f is not pure: it uses port 'b' at line 6.");
  assert.equal(err.hint, 'pure-function');
  const call = first(V('y <= f(a);', 'impure function g return std_logic is\nbegin\n  return b;\nend function;\nfunction f(x : std_logic) return std_logic is\nbegin\n  return x and g;\nend function;'), 't', 'warning');
  assert.equal(call.message, "Function f is not pure: it calls impure function 'g' at line 10. VHDL 87 allowed this; VHDL 93 requires the keyword IMPURE.");
  assert.equal(call.hint, 'pure-function-call');
  assert.match(hintText(call, 'en').explain, /It calls the impure function 'g' \(line 10\), which uses signals or variables declared outside it, so 'f' would use them too\. Written 'function' \(pure by default\) this is a warning/);
  assert.match(hintText(call, 'en').fix, /^Declare 'f' impure as well: 'impure function f …'/);
  assert.match(hintText(call, 'pt').fix, /^Declare também 'f' impura/);
  assert.equal(hintFor({ message: "Function f is not pure: it calls side-effect procedure 'p' at line 3.", check: 'pure-function' }).id, 'pure-function-call');
});

test('help for a statement label with the name of another declaration of its region (#192)', () => {
  const e = first(V('  y <= s;\n  S : process (a)\n  begin\n    s <= a;\n  end process S;', '  signal s : std_logic;'), 't');
  assert.equal(e.message, "Redeclaration of symbol S: the label of the process (line 7) is also the name of signal 's' (line 4).");
  assert.equal(e.line, 10);
  assert.equal(e.tool, 'HDLParsers:1202');
  assert.equal(e.hint, 'label-name');
  assert.equal(hintText(e, 'en').explain, "The label 'S' of the process at line 7 has the name of the signal 's' (line 4). A label is declared where its statement is (in the architecture, or in the block / generate around it), like a signal, and two things declared in the same place cannot have the same name (VHDL does not tell upper from lower case). ISE stops with this error.");
  assert.equal(hintText(e, 'en').fix, "Rename the label, also where it is repeated after 'end process' / 'end generate' / 'end block': it only names the statement, so any free name will do, e.g. 'u_S' or 'S_proc'. Keep the name of the signal 's' as it is.");
  assert.match(hintText(e, 'pt').explain, /^A etiqueta \(label\) 'S' do process da linha 7 tem o nome do signal 's' \(linha 4\)\. .* O ISE para com este erro\.$/);
  assert.match(hintText(e, 'pt').fix, /^Mude o nome da etiqueta, .* p\. ex\. 'u_S' ou 'S_proc'\. Mantenha o nome do signal 's'\.$/);
  // two statements with one label; a port of the entity of another file
  assert.equal(hintFor({ message: "Redeclaration of symbol p: the label of the process (line 9) is also the name of label 'p' (line 5).", check: 'label-name' }).id, 'label-name');
  assert.match(hintText({ message: "Redeclaration of symbol clk: the label of the assignment (line 4) is also the name of port 'clk' (line 2 of e.vhd).", check: 'label-name' }, 'en').explain,
    /^The label 'clk' of the assignment at line 4 has the name of the port 'clk' \(line 2\)\./);
});
