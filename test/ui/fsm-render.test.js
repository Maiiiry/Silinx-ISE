// UI: the FSM editor's drawing of its diagram (web/js/fsm-render.js, #405: out of mountFsmEditor), mounted alone in
// the page on an SVG of its own with the editor's state given (the model of a new diagram): the states (the initial
// one, their codes, their outputs, the selection, the problems, the current one while simulating), the transitions
// (their labels, a self-loop away from the other arrows, the selection, the one taken while simulating); the geometry
// of a transition against its states.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#405 FSM drawing: states, transitions, codes, selection, problems, the simulation; a transition\'s geometry', E, async (page) => {
  const out = await page.eval(async () => {
    const { mountRender } = await import('/js/fsm-render.js');
    const { radiusOf } = await import('/js/fsm-editor.js');
    const { newFsm } = await import('/core/fsm.js');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = '<g class="e"></g><g class="s"></g>';
    document.body.append(svg);
    const M = newFsm('fsm');
    const st = { M, sel: { type: 'trans', id: 't3' }, diags: [{ state: 's2', severity: 'warning' }, { transition: 't4', severity: 'error' }, { state: 's3', severity: 'info' }],
      sim: null, destroyed: false };
    let toolbar = 0;
    const stateById = (id) => M.states.find((s) => s.id === id);
    const r = mountRender({ state: () => st, uid: 'fsm7', gEdges: svg.querySelector('.e'), gStates: svg.querySelector('.s'), stateById,
      updateToolbar: () => toolbar++ });
    r.render();
    const q = (s) => [...svg.querySelectorAll(s)];
    const o = {};
    o.states = q('[data-state]').map((g) => `${g.dataset.state}:${g.getAttribute('class')}`);
    o.codes = q('.fsm-code').map((t) => t.textContent);
    o.outs = q('.fsm-outs').map((t) => t.textContent);
    o.entry = q('.fsm-entry').length;
    o.edges = q('[data-trans]').map((g) => `${g.dataset.trans}:${g.getAttribute('class')}`);
    o.labels = q('.fsm-label').map((t) => t.textContent);
    o.marker = q('[data-trans=t3] .fsm-edge-line')[0].getAttribute('marker-end');
    // a transition's arc from its source's rim to its target's; a self-loop of S0 away from its arrow to S1 (right)
    const near = (p, s) => Math.abs(Math.hypot(p.x - s.x, p.y - s.y) - radiusOf(s));
    const g1 = r.geom(M.transitions[0]);
    const [x0, y0] = g1.d.slice(1).split(' ')[0].split(',').map(Number);
    o.start = near({ x: x0, y: y0 }, stateById('s1')) < 0.01;
    const g2 = r.geom(M.transitions[1]);
    o.loop = [g2.self, g2.apex.x < stateById('s1').x || Math.abs(g2.apex.y - stateById('s1').y) > radiusOf(stateById('s1'))];
    o.missing = r.geom({ from: 's1', to: 'nope' });
    // simulating, in S1 with x = 1: S1 current, t3 taken; one-hot codes; enum: none
    st.sel = null; st.diags = []; st.sim = { state: 's2', inputs: { x: 1n } }; M.encoding = 'onehot';
    r.render();
    o.sim = [q('.current').map((g) => g.dataset.state), q('.hot').map((g) => g.dataset.trans), q('.fsm-code').map((t) => t.textContent)];
    M.encoding = 'enum'; r.render();
    o.enumCodes = q('.fsm-code').length;
    // destroyed: not drawn again
    st.destroyed = true; M.states = []; r.render();
    o.destroyed = q('[data-state]').length;
    o.toolbar = toolbar;
    return o;
  });
  assert.deepEqual(out.states, ['s1:fsm-state initial', 's2:fsm-state warn', 's3:fsm-state']);
  assert.deepEqual(out.codes, ['00', '01', '10']);
  assert.deepEqual(out.outs, ['z=1']);
  assert.equal(out.entry, 1);
  assert.deepEqual(out.edges, ['t1:fsm-edge', 't2:fsm-edge', 't3:fsm-edge sel', 't4:fsm-edge err', 't5:fsm-edge', 't6:fsm-edge']);
  assert.deepEqual(out.labels, ['x', '!x', 'x', '!x', 'x', '!x']);
  assert.equal(out.marker, 'url(#fsm7-arr-sel)');
  assert.equal(out.start, true);
  assert.deepEqual(out.loop, [true, true]);
  assert.equal(out.missing, null);
  assert.deepEqual(out.sim, [['s2'], ['t3'], ['001', '010', '100']]);
  assert.equal(out.enumCodes, 0);
  assert.equal(out.destroyed, 3);
  assert.equal(out.toolbar, 3);
});
