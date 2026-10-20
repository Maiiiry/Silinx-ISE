// Copy and paste of the ASM chart, FSM state diagram and Petri net editors' selection (#677, core/drawclip.js):
// what is copied, the fresh ids and names, the edges kept between copied nodes only, the initial state; a
// drawing pasted whole into an empty one generates HDL (VHDL and Verilog) that compiles, elaborates and
// simulates as the original's, cycle by cycle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { copyDrawing, pasteDrawing, drawingClipEmpty } from '../core/drawclip.js';
import { newModel, normalizeModel, validate, generate } from '../core/asm.js';
import { newFsm, normalizeFsm, validateFsm, generateFsm } from '../core/fsm.js';
import { newPetri, normalizePetri, validatePetri, generatePetri } from '../core/petri.js';

const ids = arr => arr.map(o => o.id);
const names = arr => arr.map(o => o.name).filter(Boolean).sort();
const issues = list => (list || []).map(d => `${d.severity}: ${d.message}`);

test('ASM: the boxes selected and the connections between them; pasted offset, renamed, the connections remapped', () => {
  const m = newModel('ctl', 'vhdl');
  const clip = copyDrawing('asm', m, ['s1', 'd1', 'o1']);
  assert.deepEqual(ids(clip.nodes), ['s1', 'd1', 'o1']);
  assert.ok(clip.edges.every(e => ['s1', 'd1', 'o1'].includes(e.from) && ['s1', 'd1', 'o1'].includes(e.to)), 'only the connections between copied boxes');
  assert.ok(clip.edges.length >= 2 && clip.edges.length < m.edges.length);
  assert.equal(clip.initial, 's1');
  assert.equal(clip.kind, 'asm');
  const before = m.nodes.length, edges = m.edges.length;
  const r = pasteDrawing('asm', m, clip, { dx: 40, dy: 40 });
  assert.equal(m.nodes.length, before + 3);
  assert.equal(m.edges.length, edges + clip.edges.length);
  assert.equal(new Set(ids(m.nodes)).size, m.nodes.length, 'ids unique');
  assert.equal(new Set(ids(m.edges)).size, m.edges.length);
  assert.deepEqual(Object.fromEntries(r.renamed), { IDLE: 'IDLE_1' });
  const s = m.nodes.find(n => n.id === r.ids[0]);
  assert.deepEqual([s.name, s.x, s.y], ['IDLE_1', 240, 120]);
  for (const id of r.edges) { const e = m.edges.find(x => x.id === id); assert.ok(r.ids.includes(e.from) && r.ids.includes(e.to)); }
  assert.equal(m.initial, 's1', 'the drawing keeps its initial state');
  // pasted again: IDLE_2
  pasteDrawing('asm', m, clip, { dx: 80, dy: 80 });
  assert.deepEqual(names(m.nodes).filter(n => /^IDLE/.test(n)), ['IDLE', 'IDLE_1', 'IDLE_2']);
});

test('FSM: a state with its self-loop; a name used in any case made new; an edge to a state left behind not copied', () => {
  const m = newFsm('f', 'vhdl');
  const clip = copyDrawing('fsm', m, ['s1']);
  assert.deepEqual(ids(clip.states), ['s1']);
  assert.deepEqual(clip.transitions.map(t => [t.from, t.to]), [['s1', 's1']], 'its self-loop only');
  m.states.push({ id: 's9', name: 's0_1', x: 0, y: 0, outputs: {} });   // (VHDL: S0_1 is that name)
  const r = pasteDrawing('fsm', m, clip, { dx: 0, dy: 100 });
  assert.deepEqual(Object.fromEntries(r.renamed), { S0: 'S0_2' });
  const t = m.transitions.find(x => x.id === r.edges[0]);
  assert.deepEqual([t.from, t.to, t.cond], [r.ids[0], r.ids[0], '!x']);
  assert.equal(normalizeFsm(m).states.length, 5);
});

test('Petri net: places and transitions share one name space; an arc to a node left behind is not copied', () => {
  const m = newPetri('pn', 'vhdl');
  const clip = copyDrawing('petri', m, ['p1', 't1']);
  assert.deepEqual([ids(clip.places), ids(clip.transitions), clip.arcs.map(a => a.id)], [['p1'], ['t1'], ['a1']]);
  m.places.push({ id: 'p7', name: 'start_1', x: 0, y: 0, tokens: 0, capacity: 1, outputs: {} });
  const r = pasteDrawing('petri', m, clip, { dx: 40, dy: 0 });
  assert.deepEqual(Object.fromEntries(r.renamed), { idle: 'idle_1', start: 'start_2' });
  const n = normalizePetri(m);
  assert.equal(new Set([...n.places, ...n.transitions, ...n.arcs].map(o => o.id)).size, n.places.length + n.transitions.length + n.arcs.length);
  const a = n.arcs.find(x => x.id === r.edges[0]);
  assert.deepEqual([a.from, a.to], r.ids);
  assert.equal(n.places.find(p => p.id === r.ids[0]).tokens, 1, 'the place keeps its tokens');
});

test('nothing selected, garbage from the outside: nothing pasted, the drawing unchanged', () => {
  for (const kind of ['asm', 'fsm', 'petri']) {
    const m = kind === 'asm' ? newModel('x') : kind === 'fsm' ? newFsm('x') : newPetri('x');
    assert.ok(drawingClipEmpty(kind, copyDrawing(kind, m, [])));
    const before = JSON.stringify(m);
    for (const junk of [null, {}, { nodes: 'x', states: 3 }, { nodes: [null, { x: 1 }], states: [{}], places: [{ name: 'p' }], edges: [{ from: 'a', to: 'b' }] }]) {
      assert.deepEqual(pasteDrawing(kind, m, junk), { ids: [], edges: [], renamed: new Map() });
    }
    assert.equal(JSON.stringify(m), before, kind);
  }
  assert.ok(!drawingClipEmpty('fsm', copyDrawing('fsm', newFsm('x'), ['s2'])));
});

// ------------------------------------------------------------------ pasted whole into an empty drawing: the same machine
// a test bench running the original (orig) and the pasted copy (copy) side by side, their outputs compared every clock
function bench(lang, { clock, reset, inputs, outputs }) {
  const act = reset.active === 'low' ? 0 : 1;
  const ins = inputs.map(p => p.name), outs = outputs.map(p => p.name);
  if (lang === 'vhdl') {
    const sig = (n, s) => `signal ${n}${s} : std_logic;`;
    const map = s => [clock, reset.name, ...ins].map(n => `${n} => ${n}`).concat(outs.map(n => `${n} => ${n}${s}`)).join(', ');
    return `library ieee; use ieee.std_logic_1164.all;
entity tb is end;
architecture s of tb is
  signal ${clock}, ${reset.name} : std_logic := '0'; ${ins.map(n => `signal ${n} : std_logic := '0';`).join(' ')}
  ${outs.map(n => `${sig(n, '_a')} ${sig(n, '_b')}`).join(' ')}
  signal n : integer := 0;
begin
  ua : entity work.orig port map (${map('_a')});
  ub : entity work.copy port map (${map('_b')});
  ${clock} <= not ${clock} after 5 ns when n < 40;
  process begin
    ${reset.name} <= '${act}'; wait for 12 ns; ${reset.name} <= '${1 - act}';
    for i in 0 to 30 loop
      ${ins.map((v, k) => `if (i / ${k + 2}) mod 2 = 1 then ${v} <= '1'; else ${v} <= '0'; end if;`).join(' ')}
      wait until rising_edge(${clock}); wait for 1 ns;
      ${outs.map(o => `assert ${o}_a = ${o}_b report "${o} differs" severity error;`).join(' ')}
      n <= i;
    end loop;
    n <= 99; report "done"; wait;
  end process;
end;`;
  }
  const map = s => [clock, reset.name, ...ins].map(n => `.${n}(${n})`).concat(outs.map(n => `.${n}(${n}${s})`)).join(', ');
  return `module tb;
  reg ${clock} = 0, ${reset.name} = ${act}; ${ins.map(n => `reg ${n} = 0;`).join(' ')}
  ${outs.map(n => `wire ${n}_a, ${n}_b;`).join(' ')}
  integer i, errs = 0;
  orig ua (${map('_a')});
  copy ub (${map('_b')});
  always #5 if (i < 40) ${clock} = ~${clock};
  initial begin
    i = 0; #12 ${reset.name} = ${1 - act};
    for (i = 0; i < 31; i = i + 1) begin
      ${ins.map((v, k) => `${v} = (i / ${k + 2}) % 2;`).join(' ')}
      @(posedge ${clock}); #1;
      ${outs.map(o => `if (${o}_a !== ${o}_b) errs = errs + 1;`).join(' ')}
    end
    i = 99;
    $display("errs=%0d", errs);
  end
endmodule`;
}
const GEN = {
  asm: { make: (n, l) => newModel(n, l), norm: normalizeModel, check: validate, gen: (m, l) => generate(m, l) },
  fsm: { make: (n, l) => newFsm(n, l), norm: normalizeFsm, check: validateFsm, gen: (m, l) => generateFsm(m, l) },
  petri: { make: (n, l) => newPetri(n, l), norm: normalizePetri, check: validatePetri, gen: (m, l) => generatePetri(m, l) },
};
const NODES = { asm: m => m.nodes, fsm: m => m.states, petri: m => [...m.places, ...m.transitions] };
for (const kind of ['asm', 'fsm', 'petri']) {
  for (const lang of ['vhdl', 'verilog']) {
    test(`${kind}: pasted whole into an empty drawing, its ${lang === 'vhdl' ? 'VHDL' : 'Verilog'} simulates as the original's`, () => {
      const G = GEN[kind];
      const orig = G.make('orig', lang);
      const copy = G.make('copy', lang);
      for (const k of ['nodes', 'edges', 'states', 'transitions', 'places', 'arcs']) if (Array.isArray(copy[k])) copy[k] = [];
      if ('initial' in copy) copy.initial = '';
      const r = pasteDrawing(kind, copy, copyDrawing(kind, orig, ids(NODES[kind](orig))), { dx: 20, dy: 20 });
      assert.equal(r.renamed.size, 0, 'nothing renamed in an empty drawing');
      const c = G.norm(copy);
      if ('initial' in c) assert.equal(NODES[kind](c).find(n => n.id === c.initial).name, NODES[kind](orig).find(n => n.id === orig.initial).name, 'the same initial state');
      assert.deepEqual(issues(G.check(c)), issues(G.check(orig)), 'the same diagnostics');
      assert.deepEqual(issues(G.check(c)).filter(d => /^error/.test(d)), []);
      const a = G.gen(orig, lang), b = G.gen(c, lang);
      const ext = lang === 'vhdl' ? 'vhd' : 'v';
      const res = simulate([{ path: `orig.${ext}`, text: a.code }, { path: `copy.${ext}`, text: b.code }, { path: `tb.${ext}`, text: bench(lang, orig) }], 'tb', { until: 1e6 });
      assert.deepEqual(res.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], 'compile / elaboration errors');
      assert.deepEqual([...res.lib.errors, ...res.design.diags].filter(d => d.severity === 'warning').map(d => d.message), [], 'no compile / elaboration warnings');
      assert.deepEqual(res.sim.log.filter(l => ['error', 'failure', 'warning'].includes(l.kind)).map(l => l.text), []);
      const log = res.sim.log.map(l => `${l.kind}:${l.text}`);
      assert.ok(log.includes(lang === 'vhdl' ? 'note:done' : 'print:errs=0'), log.join('\n'));
    });
  }
}
