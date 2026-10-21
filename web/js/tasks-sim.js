// The Tasks interface's Simulate task (#800, #782): the waves get the screen.
// - ISim's own Instances and Objects are the task's side panel, folded at first (the Design pane is not shown in
//   Simulate); ISim's title bar is the task's bar's (the module and the model, #854); its run controls stay its
//   toolbar, right under the task's bar (web/css/tasks.css).
// - Simulate runs the project's test bench whatever module is selected (simTarget), with the model chosen in the
//   task's bar: Behavioral, or a netlist (Post-Synthesis … Post-Place & Route; web/js/viewers.js runSimulation).
// simTarget has no DOM and is unit tested (test/tasks.test.js).

import { h } from './ui.js';

export const SIM_MODELS = [['', 'Behavioral'], ['postsynth', 'Post-Synthesis'], ['posttrans', 'Post-Translate'], ['postmap', 'Post-Map'], ['postpar', 'Post-Place & Route']];

/** The module Simulate runs: the project's simulation top, else its first test bench, else its top (null: none). */
export function simTarget(project, modules = []) {
  const has = n => !!n && modules.some(m => m.name === n);
  if (has(project?.simTop)) return project.simTop;
  const bench = modules.find(m => m.role === 'sim');
  if (bench) return bench.name;
  return has(project?.top) ? project.top : null;
}

/** The task's bar's choice of the model to simulate (shown in Simulate only). */
export function modelSelect() {
  return h('select', { id: 'task-model', title: 'The model to simulate', 'aria-label': 'The model to simulate' },
    ...SIM_MODELS.map(([v, label]) => h('option', { value: v }, label)));
}

/** Simulate: the test bench, with the model chosen. */
export async function simulate(app) {
  const mod = simTarget(app.S.project, app.S.modules);
  if (!mod) return;
  const model = document.getElementById('task-model')?.value || undefined;
  const { runSimulation } = await import('./viewers.js');   // (not at load: viewers.js loads the app)
  return runSimulation(mod, model);
}
