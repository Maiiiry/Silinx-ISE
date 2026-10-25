// Simulate's side panel with nothing simulated yet (#1376), under a Simulation tab as SSim's own, the page beside it
// (web/css/tasks.css):
// - the project's test benches, a row each, as SSim's tree: one clicked is simulated (#1378);
// - with none, the module to simulate and the model, each on its prompt, the simulation run once both are chosen
//   (#1378), and the Test Bench Wizard as a row in the style of Implement's processes.
// A simulation open, the side panel is SSim's tree.

import { h } from './ui.js';
import { icon } from './icons.js';
import { benchSelect, modelSelect, newBench, promptChoices, refreshBench, simChoices, simTarget } from './tasks-sim.js';

/** The panel, appended to the work area: `simulate` runs the test bench chosen. */
export function mountSimPanel(app, { simulate }) {
  const row = (cls, ico, ...kids) => h('li', {}, h('div', { class: `row ${cls}` }, h('span', { class: 'twisty' }), icon(ico), ...kids));
  const clickable = (r, run) => {
    r.tabIndex = 0;
    r.setAttribute('role', 'button');
    r.addEventListener('click', run);
    r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); } });
  };
  const wizard = row('task-sim-act', 'add', h('span', { class: 'lbl' }, 'Create a test bench (Wizard)…'));
  wizard.firstChild.dataset.act = 'wizard';
  clickable(wizard.firstChild, () => newBench(app));
  const choices = h('ul', { class: 'tree task-sim-choices' },
    row('task-sim-choice', 'moduleTop', benchSelect(app)), row('task-sim-choice', 'wave', modelSelect(app)), wizard);
  const benches = h('ul', { class: 'tree task-sim-benches' });
  const panel = h('div', { id: 'task-sim-panel', hidden: true },
    h('div', { class: 'task-sim-tabs', role: 'tablist' }, h('span', { class: 'tab active', role: 'tab' }, h('span', { class: 'tab-lbl' }, 'Simulation'))),
    choices, benches);
  document.getElementById('workspace').append(panel);

  const bench = name => {
    const li = h('li', { class: 'task-sim-bench', 'data-bench': name });
    const r = h('div', { class: 'row', title: `Simulate ${name}` }, h('span', { class: 'twisty' }, '▸'), icon('moduleTop'), h('span', { class: 'lbl', 'data-no-i18n': '' }, name));
    clickable(r, () => app.setTop(name, true).then(() => simulate()));
    li.append(r);
    return li;
  };
  return {
    /** Its rows as the project is now (`shown`: the panel shown, else as it is). */
    refresh(shown = !panel.hidden) {
      const S = app.S, { benches: names, design } = S.project ? simChoices(S.project, S.modules) : { benches: [], design: [] };
      promptChoices(shown && !names.length);
      panel.hidden = !shown;
      choices.hidden = !!names.length;
      benches.hidden = !names.length;
      wizard.hidden = !design.length;
      refreshBench(app);
      if (benches.dataset.key !== names.join()) { benches.dataset.key = names.join(); benches.replaceChildren(...names.map(bench)); }
      const cur = S.project ? simTarget(S.project, S.modules) : null;
      for (const li of benches.children) li.firstChild.classList.toggle('sel', li.dataset.bench === cur);
    },
  };
}
