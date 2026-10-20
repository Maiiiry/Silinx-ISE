// ISim's Objects panel (#405: out of mountISim): the signals of the instance selected in the tree, their values at
// the cursor, their selection, the drag into the wave window and their menu (add to the waves, the forces, the source,
// the path). mountObjects(ctx) is called by mountISim where this code was.
import { esc, h } from './dom.js';
import { formatValue, pathOf, typeName, ICON } from './isim.js';

/** { renderObjects, updateObjectValues } of an ISim window. */
export function mountObjects(ctx) {
  const { st, sim, $, objBody, instSignals, addSignals, rebuildFlat, updateVScroll, invalidate, showMenu, forceDialog, isForced, removeForces,
    onOpenSource, openSource } = ctx;

  let objRows = [];
  function renderObjects() {
    const inst = st.curInst;
    $('.isim-obj-scope').textContent = inst ? pathOf(inst) : '';
    objBody.innerHTML = '';
    objRows = [];
    if (!inst) return;
    const inWave = new Set(st.rows.filter(r => r.kind === 'sig').map(r => r.sig));
    for (const o of instSignals(inst)) {
      const sig = o.sig;
      const tr = h('tr');
      const dir = o.port?.dir;
      const ico = !sig.wave ? ICON.sigArr : dir === 'in' ? ICON.sigIn : dir === 'out' ? ICON.sigOut : dir === 'inout' ? ICON.sigIo : (sig.t.w === 1 && sig.t.kind === 'logic' ? ICON.sigBit : ICON.sigBus);
      tr.innerHTML = `<td class="c-chk"><input type="checkbox" ${inWave.has(sig) ? 'checked' : ''} title="Show in wave window"></td><td class="c-name"><span class="ico">${ico}</span>${esc(o.port ? o.port.name : sig.name)}</td><td class="c-val"></td><td class="c-type">${esc(typeName(sig))}</td>`;
      tr.draggable = true;
      if (st.selObj.has(sig)) tr.classList.add('sel');
      tr.addEventListener('dragstart', (e) => {
        if (!st.selObj.has(sig)) { st.selObj = new Set([sig]); }
        e.dataTransfer.setData('text/x-isim', JSON.stringify({ sigs: [...st.selObj].map(s => s.path) }));
        e.dataTransfer.effectAllowed = 'copy';
      });
      tr.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.ctrlKey || e.metaKey) { if (st.selObj.has(sig)) st.selObj.delete(sig); else st.selObj.add(sig); }
        else if (e.shiftKey && objRows.length) {
          const idx = objRows.findIndex(r => r.sig === sig);
          const a = objRows.findIndex(r => st.selObj.has(r.sig));
          if (a >= 0) { const [lo, hi] = [Math.min(a, idx), Math.max(a, idx)]; st.selObj = new Set(objRows.slice(lo, hi + 1).map(r => r.sig)); }
        } else if (!(e.button === 2 && st.selObj.has(sig))) st.selObj = new Set([sig]);
        for (const r of objRows) r.tr.classList.toggle('sel', st.selObj.has(r.sig));
      });
      tr.addEventListener('dblclick', () => { if (!inWave.has(sig)) addSignals([sig]); });
      tr.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) addSignals([sig]);
        else { st.rows = st.rows.filter(r => r.sig !== sig); rebuildFlat(); updateVScroll(); invalidate(); renderObjects(); }
      });
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // (selected, as by the right button's mousedown: a touch's long press has none)
        if (!st.selObj.has(sig)) { st.selObj = new Set([sig]); for (const r of objRows) r.tr.classList.toggle('sel', st.selObj.has(r.sig)); }
        const sel = [...st.selObj];
        const one = sel.length === 1 ? sel[0] : null;
        showMenu(e.clientX, e.clientY, [
          { label: 'Add to Wave Window', action: () => addSignals(sel.filter(s => true)) },
          { sep: true },
          { label: 'Force Constant...', disabled: !one || !one.wave, action: () => forceDialog(one, 'const') },
          { label: 'Force Clock...', disabled: !one || !one.wave, action: () => forceDialog(one, 'clock') },
          { label: 'Remove Force', disabled: !sel.some(s => isForced(s)), action: () => sel.forEach(removeForces) },
          { sep: true },
          { label: 'Go To Source Code', disabled: !one || !onOpenSource, action: () => openSource(one) },
          { label: 'Copy Path', disabled: !one, action: () => navigator.clipboard?.writeText(pathOf(one)) },
        ]);
      });
      objBody.appendChild(tr);
      objRows.push({ sig, tr, val: tr.querySelector('.c-val') });
    }
    updateObjectValues();
  }
  function updateObjectValues() {
    for (const r of objRows) {
      const sig = r.sig;
      const v = sig.wave ? sim.valueAt(sig, st.cursor) : sig.val;
      const s = Array.isArray(v) ? '(array)' : formatValue(v, sig.t, sig.t.kind === 'logic' && sig.t.w > 1 ? 'bin' : 'default');
      if (r.val.textContent !== s) r.val.textContent = s;
      r.val.classList.toggle('x', !!(v && !Array.isArray(v) && v.x));
    }
  }

  return { renderObjects, updateObjectValues };
}
