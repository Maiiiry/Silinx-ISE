// UI (#1443): a drawing whose file holds markup where a number or a name should be (an imported .asm.json / .fsm.json /
// .sch.json written by hand) draws no element of it: the editors normalize the model when they mount (core/asm.js
// normalizeModel, core/fsm.js normalizeFsm, core/schdoc.js normalizeDoc coerce the coordinates), the renderers escape
// the names. The ASM, FSM and schematic editors mounted alone in the page on such a model.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// a coordinate that closes the attribute and the element it is in, then opens a foreignObject with an element of its own
const X = '0)"><foreignObject x="0" y="0" width="99" height="99"><div id="pwn"></div></foreignObject><g transform="translate(0';
const NAME = '<img id="pwn2" src="x">';

uiTest('#1443 ASM, FSM and schematic editors: a string where a coordinate or a name should be draws nothing of it', E, async (page) => {
  const out = await page.eval(async (X, NAME) => {
    const o = {};
    const host = (id) => { const d = document.createElement('div'); d.id = id; d.style.cssText = 'width:600px;height:400px'; document.body.append(d); return d; };
    const probe = (root) => ({ fo: root.querySelectorAll('foreignObject').length, pwn: document.querySelectorAll('#pwn, #pwn2, img').length });
    // ASM chart: a state at a string x, a connection with a string point, a state named with markup
    const { mountAsmEditor } = await import('/js/asm-editor.js');
    const asm = mountAsmEditor(host('asm'), { model: {
      name: 'ctl', lang: 'vhdl', clock: 'clk', reset: 'rst', encoding: 'binary', inputs: [], outputs: [],
      nodes: [{ id: 's1', type: 'state', name: NAME, x: X, y: 80, actions: [] }, { id: 's2', type: 'state', name: 'B', x: 200, y: X, actions: [NAME] }],
      edges: [{ id: 'e1', from: 's1', to: 's2', port: 'next', points: [{ x: X, y: X }] }, { id: 'e2', from: 's2', to: 's1', port: 'next' }], initial: 's1',
    } });
    const asmSvg = document.querySelector('#asm');
    o.asm = { ...probe(asmSvg), nodes: asmSvg.querySelectorAll('[data-node]').length, tr: asmSvg.querySelector('[data-node=s1]').getAttribute('transform'),
      model: asm.getModel().nodes.map((n) => [n.x, n.y]), names: [...asmSvg.querySelectorAll('[data-node=s1] text')].map((t) => t.textContent) };
    asm.destroy?.();
    // state diagram: a state at a string x and y, named with markup, a transition whose condition is markup
    const { mountFsmEditor } = await import('/js/fsm-editor.js');
    const fsm = mountFsmEditor(host('fsm'), { model: {
      name: 'fsm', lang: 'vhdl', type: 'moore', clock: 'clk', reset: 'rst', encoding: 'binary', inputs: [{ name: 'x', width: 1 }], outputs: [],
      states: [{ id: 's1', name: NAME, x: X, y: X, outputs: {} }, { id: 's2', name: 'S1', x: 320, y: 160, outputs: {} }],
      transitions: [{ id: 't1', from: 's1', to: 's2', cond: NAME, bend: X }, { id: 't2', from: 's2', to: 's1', cond: '!x' }], initial: 's1',
    } });
    const fsmSvg = document.querySelector('#fsm');
    o.fsm = { ...probe(fsmSvg), states: fsmSvg.querySelectorAll('[data-state]').length, model: fsm.getModel().states.map((s) => [s.x, s.y]),
      bend: fsm.getModel().transitions[0].bend, label: [...fsmSvg.querySelectorAll('.fsm-label')].map((t) => t.textContent) };
    fsm.destroy?.();
    // schematic: a gate at a string x, a port and a label named with markup, a wire with a string point
    const { mountSchEditor } = await import('/js/sch-editor.js');
    const sch = mountSchEditor(host('sch'), { doc: {
      version: 3, name: 'top', lang: 'vhdl', sheet: { w: 800, h: 600 },
      symbols: [{ id: 'S1', type: 'and2', x: X, y: X, name: NAME }],
      wires: [{ id: 'W1', points: [{ x: X, y: 100 }, { x: 200, y: 100 }] }],
      labels: [{ id: 'L1', x: X, y: 100, net: NAME }],
      ports: [{ id: 'P1', name: NAME, dir: 'in', width: X, x: X, y: 100 }],
    }, modules: [] });
    const schSvg = document.querySelector('#sch');
    const d = sch.getDoc();
    o.sch = { ...probe(schSvg), symbols: schSvg.querySelectorAll('.sym[data-id], g[data-id=S1]').length, model: [[d.symbols[0].x, d.symbols[0].y], d.wires[0].points[0].x, d.labels[0].x, d.ports[0].x, d.ports[0].width],
      texts: [...schSvg.querySelectorAll('text')].map((t) => t.textContent).filter((t) => t.includes('img')) };
    sch.destroy?.();
    o.page = probe(document);
    return o;
  }, X, NAME);
  // nothing of the markup became an element; the coordinates are numbers; the names are drawn as text
  assert.deepEqual([out.asm.fo, out.asm.pwn, out.fsm.fo, out.fsm.pwn, out.sch.fo, out.sch.pwn, out.page.fo, out.page.pwn], [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(out.asm.nodes, 2);
  assert.equal(out.asm.tr, 'translate(0,80)');
  assert.deepEqual(out.asm.model, [[0, 80], [200, 0]]);
  assert.ok(out.asm.names.includes(NAME), out.asm.names.join(' | '));
  assert.equal(out.fsm.states, 2);
  assert.deepEqual(out.fsm.model, [[0, 0], [320, 160]]);
  assert.equal(out.fsm.bend, undefined, 'a bend that is not a number is dropped');
  assert.ok(out.fsm.label.includes(NAME), out.fsm.label.join(' | '));
  assert.equal(out.sch.symbols, 1);
  assert.deepEqual(out.sch.model, [[0, 0], 0, 0, 0, 1]);
  assert.ok(out.sch.texts.length >= 1, 'the names with markup are drawn as text');
});
