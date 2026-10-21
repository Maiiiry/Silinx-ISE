// The modules a wizard of New Source writes from its settings (#793, the Clocking Wizard): their settings in a line
// of the header (core/clocking.js, readWizardSpec), so that the Design pane shows the wizard as the module's base
// and opening it reopens the wizard with them.
import { readWizardSpec } from '/core/clocking.js';
import { S } from './app.js';

// the wizards that write such modules: their name (the Design pane's badge) and how they open
const WIZARDS = {
  clock: { label: 'Clocking Wizard', process: 'View/Edit Clocking Wizard', open: async (path, spec) => (await import('./clock-wizard.js')).clockWizard({ path, spec }) },
};

/** The spec of the wizard that made the HDL file `path` (from its text in the project), or null. */
export function wizardSpecOf(path) {
  const text = (S.sources || []).find(s => s.path === path)?.text;
  const spec = text ? readWizardSpec(text) : null;
  return spec && WIZARDS[spec.wizard] ? spec : null;
}

/** The name of the wizard that made `path` (null: none). */
export const wizardLabelOf = path => WIZARDS[wizardSpecOf(path)?.wizard]?.label || null;

/** The process that reopens the wizard that made `path` (null: none). */
export const wizardProcessOf = path => WIZARDS[wizardSpecOf(path)?.wizard]?.process || null;

/** Reopen the wizard that made `path` with its settings. */
export function openWizardModule(path) {
  const spec = wizardSpecOf(path);
  return spec ? WIZARDS[spec.wizard].open(path, spec) : null;
}
