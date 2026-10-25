// ISim's instance tree (#405: out of mountISim): the design's instances and their processes, the one selected (its
// signals in the Objects panel), dragged into the wave window or added from its menu (recursive: a divider before each
// instance), its source. With `benches` (the project's test benches, #1161): each one a row, the one simulated here
// opened as its instances' tree (openBench: again when shown), another one simulated (onBench, a document of its own) when clicked; the rows of
// the others shown in the Tasks layout only (web/css/tasks.css). mountTree(ctx) is called by mountISim where this
// code was.
import { esc, h } from './dom.js';
import { ICON, pathOf } from './isim.js';

/** { renderTree, addInstance } of an ISim window. */
export function mountTree(ctx) {
  const { st, design, treeEl, benches, onBench, badges, current, onOpenSource, openSource, showMenu, renderObjects, instSignals, newRow, rebuildFlat, updateVScroll, invalidate } = ctx;

  // a module's types after its name, as Design's badges (#1316)
  const badgesHtml = mod => {
    const b = badges?.(mod) || [];
    return b.length ? `<span class="badges">${b.map(x => `<span class="badge${x.base ? ' base' : ''}">${esc(x.text)}</span>`).join('')}</span>` : '';
  };
  function renderTree() {
    treeEl.innerHTML = '';
    const mk = (inst, isTop) => {
      const li = h('li');
      const procs = (inst.procs || []).filter(p => p.kind !== 'glue');
      const hasKids = inst.children.length || procs.length;
      const row = h('div', { class: 'row' + (inst === st.curInst ? ' sel' : ''),
        html: `<span class="twisty">${hasKids ? (inst._isimOpen === false ? '▸' : '▾') : ''}</span><span class="ico">${isTop ? ICON.top : ICON.inst}</span><span class="lbl">${esc(inst.name)}</span>${badgesHtml(inst.module)}<span class="isim-mod">(${esc(inst.module ?? '')})</span>` });
      row.title = pathOf(inst);
      row.draggable = true;
      row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-isim', JSON.stringify({ inst: inst.path })); e.dataTransfer.effectAllowed = 'copy'; });
      row.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('twisty') && hasKids) { inst._isimOpen = inst._isimOpen === false; renderTree(); return; }
        // (the test bench simulated here clicked: its instances shown, #1267)
        if (isTop && benches) inst._isimOpen = true;
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
    // (the other test benches: a row each, collapsed, simulated (its instances shown) when clicked, #1267)
    const bench = name => {
      const li = h('li', { class: 'task-bench' });
      const row = h('div', { class: 'row', title: `Simulate ${name}`, html: `<span class="twisty">▸</span><span class="ico">${ICON.top}</span><span class="lbl">${esc(name)}</span>${badgesHtml(name)}` });
      row.addEventListener('mousedown', () => onBench?.(name));
      li.appendChild(row);
      return li;
    };
    const names = benches?.() || [];
    if (!names.includes(current) && design.top) treeEl.appendChild(mk(design.top, true));
    for (const n of names) treeEl.appendChild(n === current && design.top ? mk(design.top, true) : bench(n));
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

  /** The test bench simulated here shown expanded (its document brought to the front: clicked in another one's tree, #1267). */
  function openBench() {
    if (!benches || !design.top || design.top._isimOpen !== false) return;
    design.top._isimOpen = true;
    renderTree();
  }

  return { renderTree, addInstance, openBench };
}
