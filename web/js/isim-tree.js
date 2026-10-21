// ISim's instance tree (#405: out of mountISim): the design's instances and their processes, the one selected (its
// signals in the Objects panel), dragged into the wave window or added from its menu (recursive: a divider before each
// instance), its source. mountTree(ctx) is called by mountISim where this code was.
import { esc, h } from './dom.js';
import { ICON, pathOf } from './isim.js';

/** { renderTree, addInstance } of an ISim window. */
export function mountTree(ctx) {
  const { st, design, treeEl, onOpenSource, openSource, showMenu, renderObjects, instSignals, newRow, rebuildFlat, updateVScroll, invalidate } = ctx;

  function renderTree() {
    treeEl.innerHTML = '';
    const mk = (inst, isTop) => {
      const li = h('li');
      const procs = (inst.procs || []).filter(p => p.kind !== 'glue');
      const hasKids = inst.children.length || procs.length;
      const row = h('div', { class: 'row' + (inst === st.curInst ? ' sel' : ''),
        html: `<span class="twisty">${hasKids ? (inst._isimOpen === false ? '▸' : '▾') : ''}</span><span class="ico">${isTop ? ICON.top : ICON.inst}</span><span class="lbl">${esc(inst.name)}</span><span class="isim-mod">(${esc(inst.module ?? '')})</span>` });
      row.title = pathOf(inst);
      row.draggable = true;
      row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-isim', JSON.stringify({ inst: inst.path })); e.dataTransfer.effectAllowed = 'copy'; });
      row.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('twisty') && hasKids) { inst._isimOpen = inst._isimOpen === false; renderTree(); return; }
        st.curInst = inst; renderTree(); renderObjects();
      });
      row.addEventListener('dblclick', () => openSource(inst));
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); st.curInst = inst; renderTree(); renderObjects();
        showMenu(e.clientX, e.clientY, [
          { label: 'Add to Wave Window', action: () => addInstance(inst, false) },
          { label: 'Add to Wave Window (Recursive)', action: () => addInstance(inst, true) },
          { sep: true },
          { label: 'Go To Source Code', disabled: !onOpenSource, action: () => openSource(inst) },
        ]);
      });
      li.appendChild(row);
      if (hasKids && inst._isimOpen !== false) {
        const ul = h('ul');
        for (const c of inst.children) ul.appendChild(mk(c, false));
        for (const p of procs) {
          const pl = h('li');
          const pr = h('div', { class: 'row', html: `<span class="twisty"></span><span class="ico">${ICON.proc}</span><span class="lbl">${esc(p.name)}</span>` });
          pr.title = `${p.kind}${p.loc?.line ? ` (line ${p.loc.line})` : ''}`;
          pr.addEventListener('dblclick', () => openSource(p));
          pr.addEventListener('mousedown', () => { st.curInst = inst; renderTree(); renderObjects(); });
          pl.appendChild(pr); ul.appendChild(pl);
        }
        li.appendChild(ul);
      }
      return li;
    };
    if (design.top) treeEl.appendChild(mk(design.top, true));
  }
  function addInstance(inst, recursive, at) {
    const sigs = [];
    const walk = (i) => {
      if (recursive) sigs.push({ divider: pathOf(i) });
      for (const o of instSignals(i)) sigs.push(o.sig);
      if (recursive) for (const c of i.children) walk(c);
    };
    walk(inst);
    const rows = [];
    for (const s of sigs) rows.push(s.divider ? { id: st.rowSeq++, kind: 'div', name: s.divider } : newRow(s));
    st.rows.splice(at ?? st.rows.length, 0, ...rows);
    rebuildFlat(); updateVScroll(); invalidate(); renderObjects();
  }

  return { renderTree, addInstance };
}
