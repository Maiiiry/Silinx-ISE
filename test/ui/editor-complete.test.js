// UI: the HDL editor's completion (#405: web/js/editor-complete.js out of createEditor in editor.js), mounted alone in
// the page on CodeMirror states of its own: the words offered at a cursor (the file's symbols first, then the
// project's modules with their instantiation template, the language's words, its templates; filtered by what is
// typed, ranked), none while typing a single letter, VHDL's libraries after `use`, Verilog's system tasks; the kind
// letters; a template inserted indented as its line with its first placeholder selected. In the editor: test/ui/editing.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#405 HDL editor completion: the words offered, ranked and filtered; kind letters; a template inserted', E, async (page) => {
  const out = await page.eval(async () => {
    const { mountCompletion } = await import('/js/editor-complete.js');
    const { EditorState } = await import('@codemirror/state');
    const syms = new Map([['count', { name: 'count', kind: 'signal', detail: 'unsigned(3 downto 0)' }], ['clk', { name: 'clk', kind: 'port', detail: 'in std_logic' }]]);
    const project = () => ({ modules: [{ name: 'counter', lang: 'vhdl', kind: 'entity', file: 'src/counter.vhd', portList: [{ name: 'clk', dir: 'in', type: 'std_logic' }], paramList: [] }] });
    const mount = (lang, doc) => {
      let state = EditorState.create({ doc });
      const view = { get state() { return state; }, dispatch: (tr) => { state = state.update(tr).state; } };
      return { c: mountCompletion({ lang, path: 'src/top.vhd', project, syms: () => syms, view: () => view }), view, at: (pos, explicit) => ({ state, pos, explicit }) };
    };
    const labels = (r) => r && r.options.map((o) => `${o.type}:${o.label}`);
    const r = {};
    // VHDL: "  co" at the end of a line
    let m = mount('vhdl', 'architecture a of top is\nbegin\n  co\nend;');
    const pos = 'architecture a of top is\nbegin\n  co'.length;
    const co = m.c.completions(m.at(pos, false));
    r.co = labels(co).slice(0, 6); r.coPrefix = labels(co).filter((l) => /:co/i.test(l)).at(-1); r.coOther = labels(co).filter((l) => !/:co/i.test(l)); r.coRange = [co.from, co.to, pos - 2];
    r.oneLetter = m.c.completions(m.at(pos - 1, false));
    r.oneLetterExplicit = labels(m.c.completions(m.at(pos - 1, true))).slice(0, 3);
    // VHDL libraries after use
    m = mount('vhdl', 'use ieee.nu');
    r.use = labels(m.c.completions(m.at(11, false)));
    // Verilog: system tasks
    m = mount('verilog', 'module m; initial $disp');
    r.sys = labels(m.c.completions(m.at(23, false)));
    // the kind letters
    r.kinds = ['port', 'signal', 'keyword', 'snippet', 'system', 'other'].map((type) => m.c.renderKind({ type }).textContent);
    r.kindClass = m.c.renderKind({ type: 'port' }).className;
    // a template with placeholders, inserted on an indented line: the text indented as the line, ${1:…} selected
    m = mount('vhdl', 'begin\n    x\nend;');
    m.c.insertSnippet('if ${1:cond} then\n  $0\nend if;', 10, 11);
    r.inserted = m.view.state.doc.toString();
    const sel = m.view.state.selection.main;
    r.selected = m.view.state.sliceDoc(sel.from, sel.to);
    // ${name}: the file's name
    m = mount('vhdl', '');
    m.c.insertSnippet('entity ${name} is$0', 0, 0);
    r.named = [m.view.state.doc.toString(), m.view.state.selection.main.head];
    return r;
  });
  // (the symbols first, then the functions and modules by name, the keywords; the templates last)
  assert.deepEqual(out.co, ['signal:count', 'function:conv_integer', 'function:conv_std_logic_vector', 'module:counter', 'keyword:component', 'keyword:configuration']);
  // the template last of the words starting with what is typed; then the words containing it
  assert.equal(out.coPrefix, 'snippet:counter — instantiate');
  assert.ok(out.coOther.length && out.coOther.every((l) => /co/i.test(l)), out.coOther.join());
  assert.deepEqual(out.coRange, [out.coRange[2], out.coRange[2] + 2, out.coRange[2]]);
  assert.equal(out.oneLetter, null);
  assert.deepEqual(out.oneLetterExplicit, ['port:clk', 'signal:count', 'type:character']);
  assert.deepEqual(out.use, ['library:ieee.numeric_std.all']);
  assert.deepEqual(out.sys, ['system:$display']);
  assert.deepEqual(out.kinds, ['P', 'S', 'k', '❏', '$', '·']);
  assert.equal(out.kindClass, 'xl-hint-kind k-port');
  assert.equal(out.inserted, 'begin\n    if cond then\n      \n    end if;\nend;');
  assert.equal(out.selected, 'cond');
  assert.deepEqual(out.named, ['entity top is', 13]);
});
