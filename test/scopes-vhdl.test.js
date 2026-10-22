// The VHDL scopes' helpers (#405: core/scopes-vhdl.js out of analyzeVhdl in core/scopes.js), mounted alone: a scope
// opened takes the label waiting for it (or the symbol given) and becomes the current one; a design unit's scope
// takes the packages of the use clauses before it; a declaration's type as written, a port's without its mode.
// Through analyze: an entity's ports with their types and modes, the architecture's signal, a labelled process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../core/scopes.js';
import { mountVhdlScopes } from '../core/scopes-vhdl.js';

class Scope {
  constructor(kind, outer, parent, start, closer) { Object.assign(this, { kind, outer, parent, start, closer, imports: [] }); }
}

function mounted(text = '', tokens = []) {
  const st = { cur: new Scope('file', null, null, 0, 'file'), pendingLabel: null, uses: [] };
  const C = { scopes: [] };
  const m = mountVhdlScopes({
    text, tokens, C, Scope, cur: () => st.cur, setCur: (v) => { st.cur = v; }, pendingLabel: () => st.pendingLabel,
    setPendingLabel: (v) => { st.pendingLabel = v; }, uses: () => st.uses, setUses: (v) => { st.uses = v; },
  });
  return { st, C, ...m };
}

test('#405 VHDL scopes: a scope opened takes the label waiting for it, or the symbol given', () => {
  const { st, C, open } = mounted();
  const file = st.cur, label = { name: 'p' };
  st.pendingLabel = label;
  const s = open('process', 7);
  assert.equal(st.cur, s);
  assert.deepEqual([s.kind, s.outer, s.parent, s.start, s.closer], ['process', file, file, 7, 'process']);
  assert.equal(s.sym, label);
  assert.equal(label.owner, s);
  assert.equal(st.pendingLabel, null);
  const sym = { name: 'f' };
  const f = open('subprogram', 9, { sym, closer: 'function', extra: { specOnly: true } });
  assert.deepEqual([f.sym, sym.owner, f.closer, f.specOnly, f.outer], [sym, f, 'function', true, s]);
  assert.deepEqual(C.scopes, [s, f]);
});

test('#405 VHDL scopes: a design unit\'s scope takes the packages of the use clauses before it', () => {
  const { st, unitScope } = mounted();
  const pkg = { kind: 'package' };
  st.uses = [pkg];
  assert.equal(unitScope(), st.cur);
  assert.deepEqual(st.cur.imports, [pkg]);
  assert.deepEqual(st.uses, []);
});

test('#405 VHDL scopes: a declaration\'s type as written, a port\'s without its mode', () => {
  const text = 'a, b : in std_logic_vector(3 downto 0) := x"0"';
  const offs = [0, 1, 3, 5, 7, 39, 42, 46];   // a , b : in std_logic_vector(3 downto 0) := x"0" (end)
  const { typeOf } = mounted(text, offs.map(off => ({ off })));
  const syms = [{}, {}];
  const ctx = { typeStart: 4, typeEnd: 5, syms };
  typeOf(ctx, 7);
  assert.deepEqual(syms, [{ type: 'std_logic_vector(3 downto 0)', mode: 'in' }, { type: 'std_logic_vector(3 downto 0)', mode: 'in' }]);
  assert.deepEqual([ctx.syms, ctx.typeStart, ctx.typeEnd], [[], null, null]);
  typeOf(ctx, 7);   // (none started: nothing)
  assert.deepEqual(ctx.syms, []);
});

test('#405 VHDL scopes, through analyze: ports with types and modes, a signal, a labelled process', () => {
  const a = analyze(`library ieee; use ieee.std_logic_1164.all;
entity e is port (a : in std_logic; y : out std_logic); end;
architecture r of e is signal s : std_logic; begin p : process (a) begin s <= a; end process; y <= s; end;`, 'vhdl');
  assert.deepEqual(a.scopes.map(s => s.kind), ['entity', 'architecture', 'process']);
  const syms = a.scopes.flatMap(s => [...s.syms.values()]).map(s => `${s.name}:${s.kind}:${s.type || ''}:${s.mode || ''}`);
  assert.deepEqual(syms, ['a:port:std_logic:in', 'y:port:std_logic:out', 's:signal:std_logic:', 'p:label::']);
});
