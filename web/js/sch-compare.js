// A COMP's comparisons in the schematic editor's Properties panel (#1555): a tick box each, EQ NE LT LE GT GE, each one
// ticked an output pin of the symbol (one ticked: its output O). Ticking re-pins it (core/schdoc-repin.js): the wires
// follow the pins that stay; a connected output unticked drops its wires, after asking; the last one cannot be unticked.
// mountCompareTicks(ctx) is called by mountProps (sch-props.js).
import { COMPARE_OPS, COMPARE_SYM, compareOps, comparePin, repinSymbol } from '/core/schdoc.js';
import { dialog } from './ui.js';
import { h } from './dom.js';

/** compareTicks(s) of the Properties panel: the tick boxes of the COMP s (doc(), nl(), modules(): the editor's current ones). */
export function mountCompareTicks({ container, doc, nl, modules, edit, flash }) {
  // the pin's net has more than the pin itself (a wire, a net name, another pin, an I/O marker)
  function connected(s, pin) {
    const n = nl()?.pinNet?.get(`${s.id}/${pin}`);
    return !!n && n.endpoints.length + n.wires.length + n.labels.length > 1;
  }
  async function toggle(s, op, el) {
    const old = compareOps(s.params);
    const ops = COMPARE_OPS.filter(o => (o === op ? el.checked : old.includes(o)));
    if (!ops.length) { el.checked = true; flash('At least one comparison stays ticked', 3000); return; }
    const next = { ...s.params, op: ops.join(',') };
    const rename = Object.fromEntries(old.filter(o => ops.includes(o)).map(o => [comparePin(s.params, o), comparePin(next, o)]));
    if (!el.checked && connected(s, comparePin(s.params, op))) {
      const ok = await dialog({
        title: 'Remove connected outputs', width: 460,
        body: h('div', { text: `Unticking ${op.toUpperCase()} removes the output ${op.toUpperCase()} of ${s.name} and the wires connected to it.` }),
        buttons: [{ label: 'Remove the outputs and their wires', value: true, primary: true }, { label: 'Cancel', value: null }],
      });
      container.focus({ preventScroll: true });
      if (!ok) { el.checked = true; return; }
    }
    edit(() => {
      const sym = doc().symbols.find(x => x.id === s.id);
      if (sym) repinSymbol(doc(), sym, x => { x.params.op = ops.join(','); }, { modules: modules(), rename });
    });
  }
  return function compareTicks(s) {
    const on = compareOps(s.params);
    const box = h('div', { class: 'se-ticks' });
    for (const op of COMPARE_OPS) {
      const el = h('input', { type: 'checkbox', checked: on.includes(op) });
      el.dataset.op = op;
      el.addEventListener('change', () => toggle(s, op, el));
      box.append(h('label', { class: 'se-tick', 'data-no-i18n': '', title: `A ${COMPARE_SYM[op]} B` }, el, ` ${op.toUpperCase()} (A ${COMPARE_SYM[op]} B)`));
    }
    return box;
  };
}
