// The schematic viewer's hover, selection and tooltip (#405: out of mountSchematic in schematic-view.js): the node or
// net under the pointer, its drawn elements marked (hover, sel), the selection reported to onSelect, and the tooltip
// of a node (its kind, parameters, the pin pointed at or the connections, its source) or of a net (its width, loads,
// driver).
import { esc } from './dom.js';
import { BOXES } from './schematic-view.js';

/** { hideTip, keyOfTarget, select, setHover, showTip } of mountSchematic (hoverKey(), netEls(), netInfo(), nodeEls(), prep(), selKey(): its current values). */
export function mountSchHover(ctx) {
  const {
    container, hoverKey, netEls, netInfo, nodeEls, onSelect, prep, selKey, tip, vp, setHoverKey, setSelKey
  } = ctx;

  // ---------------- hover / selection
  const keyOfTarget = t => {
    if (!(t instanceof Element)) return null;
    const ne = t.closest('[data-node]');
    if (ne && vp.contains(ne)) return 'N:' + ne.dataset.node;
    const ee = t.closest('[data-net]');
    if (ee && vp.contains(ee)) return 'E:' + ee.dataset.net;
    return null;
  };
  function elsOf(key) {
    if (!key) return [];
    if (key.startsWith('N:')) { const el = nodeEls().get(key.slice(2)); return el ? [el] : []; }
    return netEls().get(key.slice(2)) || [];
  }
  function mark(key, cls, on) { for (const el of elsOf(key)) el.classList.toggle(cls, on); }
  function setHover(key) {
    if (key === hoverKey()) return;
    mark(hoverKey(), 'hover', false);
    setHoverKey(key);
    mark(hoverKey(), 'hover', true);
    // a hovered node also lights its attached wires faintly
  }
  function select(key) {
    mark(selKey(), 'sel', false);
    setSelKey(key);
    mark(selKey(), 'sel', true);
    if (!key) { onSelect?.(null); return; }
    if (key.startsWith('N:')) {
      const n = prep().byId.get(key.slice(2));
      onSelect?.({ kind: 'node', id: n.id, node: n, ref: n.ref || null });
    } else {
      const ni = netInfo().get(key.slice(2));
      if (ni) onSelect?.({ kind: 'net', net: ni.net, name: ni.name, w: ni.w, edges: ni.edges.map(e => e.id ?? e._eid), from: ni.from, to: ni.sinks });
    }
  }

  // ---------------- tooltip
  function hideTip() { tip.hidden = true; }
  function tipHtml(key, target) {
    if (key.startsWith('N:')) {
      const n = prep().byId.get(key.slice(2)); if (!n) return '';
      const pinEl = target.closest?.('[data-pin]');
      const pin = pinEl ? (n.ports || []).find(p => String(p.id) === pinEl.dataset.pin) : null;
      const rows = [];
      const kindName = { in: 'Input port', out: 'Output port', inout: 'Bidirectional port', inst: 'Instance', blackbox: 'Black box (module not found)', reg: 'Clocked process', comb: 'Combinational logic', tb: 'Testbench process', const: 'Constant', netlabel: 'Net (driven elsewhere)' }[n.kind];
      if (n.kind === 'inst' || n.kind === 'blackbox') rows.push(`<b>${esc(n.label)}</b> : ${esc(n.sub)}`);
      else if (n.kind === 'gate') rows.push(`<b>${esc(n.gate)}</b>${n.label && n.label !== n.gate ? ` <span class="m">${esc(n.label)}</span>` : ''}${n.w > 1 ? ` <span class="m">[${esc(n.w)}]</span>` : ''}`);
      else rows.push(`<b>${esc(n.label)}</b>${n.sub && n.sub !== n.label ? ` <span class="m">${esc(n.sub)}</span>` : ''}`);
      if (kindName) rows.push(`<span class="m">${esc(kindName)}</span>`);
      if (Array.isArray(n.params) && n.params.length) rows.push(`<span class="m">generics:</span> ${n.params.map(esc).join(', ')}`);
      if (pin) rows.push(`<hr>pin <b>${esc(pin.label || pin.id)}</b>${pin.w > 1 ? ` [${pin.w}]` : ''}${pin.clock ? ' (clock)' : ''}${pin.reset ? ' (reset)' : ''}${pin.conn ? ` ⇐ <code>${esc(pin.conn)}</code>` : ''}`);
      else if (BOXES.has(n.kind) && (n.ports || []).some(p => p.conn)) {
        const list = n.ports.slice(0, 16).map(p => `${esc(p.label)} ${p.side === 'E' ? '⇒' : '⇐'} <code>${esc(p.conn ?? '')}</code>`);
        if (n.ports.length > 16) list.push(`… ${n.ports.length - 16} more`);
        rows.push('<hr>' + list.join('<br>'));
      }
      if (n.ref?.sig) rows.push(`<span class="m">net:</span> ${esc(n.ref.sig)}`);
      if (n.ref?.file) rows.push(`<span class="m">${esc(n.ref.file)}${esc(n.ref.line ? ':' + n.ref.line : '')}</span>`);
      if (n.kind === 'inst' && n.ref?.inst) rows.push('<i>Double-click to push into this instance</i>');
      else if (n.ref?.file && n.kind !== 'in' && n.kind !== 'out') rows.push('<i>Double-click to open source</i>');
      return rows.join('<br>').replace(/<br><hr>/g, '<hr>');
    }
    const ni = netInfo().get(key.slice(2)); if (!ni) return '';
    const drv = prep().byId.get(ni.from.node);
    const rows = [`net <b>${esc(ni.name || '(unnamed)')}</b>${ni.w > 1 ? ` [${ni.w - 1}:0]` : ''}`];
    rows.push(`<span class="m">width ${esc(ni.w)} bit${ni.w > 1 ? 's' : ''}, ${ni.sinks.length} load${ni.sinks.length > 1 ? 's' : ''}</span>`);
    if (ni.net) rows.push(`<span class="m">${esc(ni.net)}</span>`);
    if (drv) rows.push(`<span class="m">driver:</span> ${esc(drv.kind === 'gate' ? drv.gate : drv.label)}`);
    return rows.join('<br>');
  }
  function showTip(key, target, cx, cy) {
    const html = tipHtml(key, target);
    if (!html) { hideTip(); return; }
    if (tip.innerHTML !== html) tip.innerHTML = html;
    tip.hidden = false;
    const r = container.getBoundingClientRect();
    let x = cx - r.left + 14, y = cy - r.top + 16;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (x + tw > r.width - 4) x = Math.max(4, cx - r.left - tw - 10);
    if (y + th > r.height - 4) y = Math.max(4, cy - r.top - th - 10);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }

  return { hideTip, keyOfTarget, select, setHover, showTip };
}
