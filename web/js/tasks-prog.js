// The Tasks interface's Program task (#803, #782): iMPACT (web/js/impact.js) arranged for the task.
// - First the programming file and its state: up to date with the sources, out of date, none yet, or failed, with
//   Implement when it is not up to date (fileState, from Implement's state dot).
// - Then the chain, Initialize Chain, and Program FPGA or Program PROM (as the chip selected in the chain), each with
//   its line; the PROM's other operations (Verify, Erase, Back up, Reload) behind More….
// - The board, programming tool and cable fields folded away when a board is selected (it chooses them), open when
//   none is.
// The parts are impact.js's own (its imp-* classes); this module adds its few elements in the Tasks interface only
// and takes them away in the others (arrangeProgram). fileState has no DOM and is unit tested (test/tasks.test.js).

import { h } from './ui.js';

/** The programming file's state, from Implement's state dot: [state, its text]. */
export function fileState(implDot) {
  if (implDot === 'ok' || implDot === 'warn') return ['ok', 'Up to date with the sources'];
  if (implDot === 'stale') return ['stale', 'Out of date: the sources changed since the last implementation'];
  if (implDot === 'err') return ['err', 'The last implementation failed'];
  if (implDot === 'running') return ['running', 'Being implemented…'];
  return ['none', 'No programming file yet'];
}

const ADDED = ['task-prog-state', 'task-prog-more', 'task-prog-settings'];   // (the classes of the elements added)
/** Arranges each open iMPACT page for the Program task (`on`), or puts it back; `implDot` and `implement` (going to
 *  Implement) come from the Tasks interface. */
export function arrangeProgram(on, { implDot, implement }) {
  for (const page of document.querySelectorAll('#workspace .doc[data-task="prog"] > .page')) {
    if (!page.querySelector('.impact-chain')) continue;
    if (!on) { for (const c of ADDED) page.querySelectorAll(`.${c}`).forEach(e => e.remove()); page.classList.remove('more-open', 'settings-open'); continue; }
    if (!page.querySelector('.task-prog-state')) {
      page.prepend(h('div', { class: 'task-prog-state' }, h('span', { class: 'task-prog-text' }),
        h('button', { class: 'btn primary task-prog-impl', type: 'button', onclick: implement }, 'Implement')));
      page.querySelector('.imp-more')?.before(h('button', { class: 'btn task-prog-more', type: 'button', onclick: () => page.classList.toggle('more-open') }, 'More…'));
      page.querySelector('.imp-settings')?.before(h('button', { class: 'btn task-prog-settings', type: 'button', onclick: () => page.classList.toggle('settings-open') },
        'Board, programming tool and cable…'));
      // (no board selected: the tool and cable are the student's to choose)
      if (!page.querySelector('.imp-settings select')?.value) page.classList.add('settings-open');
    }
    const [st, text] = fileState(implDot());
    const el = page.querySelector('.task-prog-state');
    el.dataset.state = st;
    el.querySelector('.task-prog-text').textContent = text;
  }
}

/** Arranges iMPACT when it opens (its page appears after its document): watched in the Tasks interface only, by one
 *  observer and no timer, so that no closed document is kept (as the emulator's board, #879). */
export function initProgram(arrange) {
  const ws = document.getElementById('workspace');
  const isChain = n => n.nodeType === 1 && (n.matches('.impact-chain') || !!n.querySelector('.impact-chain'));
  const pages = new MutationObserver(ms => { if (ms.some(m => [...m.addedNodes].some(isChain))) arrange(); });
  const watch = () => { if (document.documentElement.dataset.layout === 'tasks') pages.observe(ws, { childList: true, subtree: true }); else pages.disconnect(); };
  new MutationObserver(watch).observe(document.documentElement, { attributes: true, attributeFilter: ['data-layout'] });
  watch();
}
