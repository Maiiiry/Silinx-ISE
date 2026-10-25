// Simulate's side panel with nothing simulated yet (#1376): under a Simulation tab, as SSim's own, the module to simulate
// and the model (a choice simulates at once, #1018), then Simulate and the Test Bench Wizard as rows in the style of
// Implement's processes; shown whatever the side panel's state, the page beside it (web/css/tasks.css). A simulation
// open, the side panel is SSim's tree.

import { h } from './ui.js';
import { icon } from './icons.js';
import { benchSelect, modelSelect, newBench, simChoices } from './tasks-sim.js';

/** The panel, appended to the work area: `simulate` runs the choice, `enabled()` says whether it can. */
export function mountSimPanel(app, { simulate, enabled }) {
  const row = (cls, ico, ...kids) => h('li', {}, h('div', { class: `row ${cls}` }, h('span', { class: 'twisty' }), icon(ico), ...kids));
  const action = (act, ico, label, run) => {
    const li = row('task-sim-act', ico, h('span', { class: 'lbl' }, label));
    const r = li.firstChild;
    Object.assign(r.dataset, { act });
    r.tabIndex = 0;
    r.setAttribute('role', 'button');
    const go = () => { if (!r.classList.contains('disabled')) run(); };
    r.addEventListener('click', go);
    r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return li;
  };
  const panel = h('div', { id: 'task-sim-panel', hidden: true },
    h('div', { class: 'task-sim-tabs', role: 'tablist' }, h('span', { class: 'tab active', role: 'tab' }, h('span', { class: 'tab-lbl' }, 'Simulation'))),
    h('ul', { class: 'tree' },
      row('task-sim-choice', 'moduleTop', benchSelect(app)),
      row('task-sim-choice', 'wave', modelSelect(app)),
      action('simulate', 'process', 'Simulate', simulate),
      action('wizard', 'add', 'Create a test bench (Wizard)…', () => newBench(app))));
  document.getElementById('workspace').append(panel);
  return {
    /** Its rows as the project is now: Simulate when there is something to simulate, the wizard when a design module. */
    refresh() {
      const S = app.S;
      panel.querySelector('[data-act=simulate]').classList.toggle('disabled', !enabled());
      panel.querySelector('[data-act=wizard]').closest('li').hidden = !(S.project && simChoices(S.project, S.modules).design.length);
    },
  };
}
