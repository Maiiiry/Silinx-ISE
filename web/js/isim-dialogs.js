// ISim's dialogs (#405: out of mountISim): one at a time over the window (show, closeDialog), and Force Constant /
// Force Clock of the selected signal (forceDialog), which add the force and echo its ssim force add command.
// mountDialogs(ctx) is called by mountISim where this code was.
import { esc, h } from './dom.js';
import { fmtTime, parseTime, formatValue, parseValue, pathOf } from './isim.js';

/** { show, closeDialog, forceDialog } of an ISim window. */
export function mountDialogs(ctx) {
  const { root, sim, addForce, echo } = ctx;

  let dlgEl = null;
  // the dialog open (one at a time: a new one closes it), over the window's root
  function show(ov) { root.appendChild(ov); dlgEl = ov; }
  function closeDialog() { if (dlgEl) { dlgEl.remove(); dlgEl = null; } }
  function forceDialog(sig, kind) {
    closeDialog();
    const t = sig.t;
    const isEnum = t.kind === 'enum';
    const defRadix = t.kind === 'int' ? 'dec' : 'bin';
    const ov = h('div', { class: 'isim-dlg-overlay' });
    const clock = kind === 'clock';
    const one = t.kind === 'enum' ? t.names[1] ?? t.names[0] : t.kind === 'bool' ? 'TRUE' : '1';
    const zero = t.kind === 'enum' ? t.names[0] : t.kind === 'bool' ? 'FALSE' : '0';
    ov.innerHTML = `
      <div class="isim-dlg" role="dialog">
        <div class="isim-dlg-title">${clock ? 'Define Clock' : 'Force Selected Signal'}<button class="isim-dlg-x" title="Close">✕</button></div>
        <div class="isim-dlg-body">
          <div class="isim-dlg-hint">${clock ? 'Specify the properties of the clock to be applied to the selected signal.' : 'Specify the value to force the selected signal to.'}</div>
          <div class="isim-dlg-grid">
            <label>Signal Name:</label><input name="sig" value="${esc(pathOf(sig))}" readonly>
            <label>Value Radix:</label><select name="radix" ${isEnum ? 'disabled' : ''}>
              <option value="bin">Binary</option><option value="hex">Hexadecimal</option><option value="dec">Decimal</option><option value="oct">Octal</option><option value="ascii">ASCII</option>
            </select>
            ${clock ? `
            <label>Leading Edge Value:</label><input name="lead" value="${esc(zero)}">
            <label>Trailing Edge Value:</label><input name="trail" value="${esc(one)}">
            <label>Starting at Time Offset:</label><input name="start" value="0">
            <label>Cancel after Time Offset:</label><input name="cancel" value="" placeholder="(never)">
            <label>Period:</label><input name="period" value="10 ns">
            <label>Duty Cycle (%):</label><input name="duty" value="50">` : `
            <label>Force to Value:</label><input name="value" value="${esc(formatValue(sim.valueAt(sig, sim.now), t, isEnum || t.kind === 'bool' ? 'default' : defRadix === 'dec' ? 'sdec' : 'bin'))}">
            <label>Starting at Time Offset:</label><input name="start" value="0">
            <label>Cancel after Time Offset:</label><input name="cancel" value="" placeholder="(never)">`}
          </div>
          <div class="isim-dlg-note">Time offsets are relative to the current simulation time (${esc(fmtTime(sim.now))}); default unit is ns.</div>
          <div class="isim-dlg-err"></div>
        </div>
        <div class="isim-dlg-btns"><button class="btn primary" data-a="ok">OK</button><button class="btn" data-a="cancel">Cancel</button><button class="btn" data-a="apply">Apply</button></div>
      </div>`;
    show(ov);
    const q = (n) => ov.querySelector(`[name="${n}"]`);
    q('radix').value = defRadix;
    const err = ov.querySelector('.isim-dlg-err');
    const apply = () => {
      try {
        const radix = isEnum ? 'default' : q('radix').value;
        const start = sim.now + (q('start').value.trim() ? parseTime(q('start').value, 'ns') : 0);
        const cancelOff = q('cancel').value.trim() ? parseTime(q('cancel').value, 'ns') : null;
        if (isNaN(start) || (cancelOff !== null && isNaN(cancelOff))) throw new Error('invalid time offset');
        const cancel = cancelOff == null ? null : sim.now + cancelOff;
        if (clock) {
          const lead = parseValue(q('lead').value, t, radix), trail = parseValue(q('trail').value, t, radix);
          const period = parseTime(q('period').value, 'ns');
          const duty = parseFloat(q('duty').value);
          if (!(period >= 2)) throw new Error('period must be at least 2 ps');
          if (!(duty > 0 && duty < 100)) throw new Error('duty cycle must be between 0 and 100');
          const hi = Math.max(1, Math.min(period - 1, Math.round(period * duty / 100)));
          addForce(sig, { pattern: [{ off: 0, val: lead }, { off: hi, val: trail }], start, repeat: period, cancel, desc: `clock ${q('lead').value}/${q('trail').value} period ${fmtTime(period)} duty ${duty}%` });
          echo(`ssim force add ${pathOf(sig)} ${q('lead').value} -radix ${radix === 'default' ? 'bin' : radix}${start > sim.now ? ` -time ${fmtTime(start - sim.now)}` : ''} -value ${q('trail').value} -time ${fmtTime(hi + start - sim.now)} -repeat ${fmtTime(period)}${cancelOff != null ? ` -cancel ${fmtTime(cancelOff)}` : ''}`);
        } else {
          const val = parseValue(q('value').value, t, radix);
          addForce(sig, { pattern: [{ off: 0, val }], start, cancel, desc: `constant ${q('value').value}` });
          echo(`ssim force add ${pathOf(sig)} ${q('value').value} -radix ${radix === 'default' ? 'bin' : radix}${start > sim.now ? ` -time ${fmtTime(start - sim.now)}` : ''}${cancelOff != null ? ` -cancel ${fmtTime(cancelOff)}` : ''}`);
        }
        err.textContent = '';
        return true;
      } catch (e) { err.textContent = e.message; return false; }
    };
    ov.querySelector('.isim-dlg-x').onclick = closeDialog;
    ov.querySelector('[data-a=cancel]').onclick = closeDialog;
    ov.querySelector('[data-a=apply]').onclick = apply;
    ov.querySelector('[data-a=ok]').onclick = () => { if (apply()) closeDialog(); };
    ov.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (apply()) closeDialog(); } });
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeDialog(); });
    const first = ov.querySelector(clock ? '[name=lead]' : '[name=value]');
    first.focus(); first.select();
  }

  return { show, closeDialog, forceDialog };
}
