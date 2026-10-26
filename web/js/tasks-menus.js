// The Tasks interface's menus of a panel's empty space: Design's tree, New Source…, Import Source… (#1501) and Close
// Project, as the buttons around it (#1384).

import { popupMenu } from './ui.js';

/** The menus, `on()` the Tasks interface shown, `task()` the task in front. */
export function initTreeMenus(app, { on, task }) {
  const wizard = f => () => import('./wizards.js').then(w => w[f]());
  document.getElementById('hier').addEventListener('contextmenu', e => {
    if (!on() || task() !== 'edit' || !app.S.project || e.defaultPrevented || e.target.closest('.row')) return;
    e.preventDefault();
    popupMenu([
      { label: 'New Source…', action: wizard('newSourceWizard') },
      { label: 'Import Source…', action: wizard('addSourceDialog') },
      '-',
      { label: 'Close Project', action: () => app.closeProject() },
    ], e.clientX, e.clientY);
  });
}
