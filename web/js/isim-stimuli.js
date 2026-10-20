// ISim's drawn stimuli (#405: out of mountISim; #336, core/stimuli.js): Edit Stimuli on, a click on a cycle of an
// input changes it there and up to its next change (0 → 1 → Z → X; a bus: a value typed in), on an output its expected
// value (- → 0 → 1); the simulation restarts and runs the stimuli at once, the expected outputs checked (the mismatches
// red); their timing and a bus's value in dialogs. mountStimuli(ctx) is called by mountISim where this code was.
import * as V from '/core/values.js';
import { newStimuli, normalizeStimuli, cyclePs, editInput, editExpected, checkExpected, fillExpected, stimulusPlan, parseCellValue } from '/core/stimuli.js';
import { esc, h } from './dom.js';
import { fmtTime, ROW_H, RULER_H } from './isim.js';

/** { toggleStim, timingDialog, fillStim, stimClick, drawStim, runStim } of an ISim window. */
export function mountStimuli(ctx) {
  const { st, sim, design, stimOpt, stimInst, topSig, stimPortOf, stimBar, btns, layout, invalidate, rowAtY, tOf, xOf, selectRow, setFont,
    flat, width, colors, api, echo, enqueue, runTo, logLine, showDialog, closeDialog } = ctx;

  function toggleStim(on = !st.stim.on) {
    st.stim.on = on;
    stimBar.hidden = !on;
    btns.stim?.classList.toggle('on', on);
    layout();
    if (on && !st.stim.m) timingDialog();
    else invalidate(false);
  }
  const stimPort = (it) => (it && !it.bit && it.row.kind === 'sig' ? stimPortOf.get(it.row.sig) || null : null);
  const portBits = (port, t) => { const sig = topSig.get(port); return sig ? V.toBin(sim.valueAt(sig, t)) : ''; };
  function stimChanged(rerun) {
    stimOpt.onChange?.(JSON.parse(JSON.stringify(st.stim.m)));
    if (rerun) runStim(); else { checkStim(); invalidate(false); }
  }
  async function runStim() {
    const m = st.stim.m;
    if (!m) return;
    const end = stimulusPlan(m).endPs;
    api().restart(true);
    echo(`run ${fmtTime(end)}`);
    await enqueue(`run ${fmtTime(end)}`, () => runTo(end, 'Run'));
    checkStim(true);
  }
  function checkStim(log) {
    const m = st.stim.m;
    if (!m) return;
    st.stim.bad = sim.now >= stimulusPlan(m).endPs - 1 ? checkExpected(m, portBits) : [];
    const nExp = Object.values(m.expected).reduce((n, l) => n + l.filter(b => /[01]/.test(b)).length, 0);
    const timing = m.clock ? `clock ${m.clock}, period ${m.periodNs} ns` : `combinational, step ${m.stepNs} ns`;
    const res = !nExp ? 'no expected outputs' : st.stim.bad.length ? `${st.stim.bad.length} mismatch(es)` : 'expected outputs OK';
    const stEl = stimBar.querySelector('.isim-stim-st');
    if (stEl) { stEl.textContent = `${m.cycles} cycles (${timing}): ${res}`; stEl.classList.toggle('bad', st.stim.bad.length > 0); }
    if (log && nExp) {
      if (!st.stim.bad.length) logLine(`Stimuli: ${m.cycles} cycles, the expected outputs match`, 'info');
      else {
        logLine(`Stimuli: ${st.stim.bad.length} mismatch(es) of the expected outputs`, 'warning');
        for (const b of st.stim.bad.slice(0, 10)) logLine(`  ${b.port} at cycle ${b.k} (${fmtTime(b.k * cyclePs(m))}): expected ${b.expected}, got ${b.got}`, 'warning');
      }
    }
  }
  function fillStim() {
    if (!st.stim.m) return;
    fillExpected(st.stim.m, portBits);
    logLine('Stimuli: the expected outputs filled in from the simulation', 'info');
    stimChanged(false);
  }
  // a click on the waves in Edit Stimuli: true when it was on a cell of a port (edited)
  function stimClick(x, y) {
    const m = st.stim.m;
    const i = rowAtY(y), p = m ? stimPort(flat()[i]) : null;
    if (!p || p.name === m.clock) return false;
    const k = Math.floor(tOf(x) / cyclePs(m));
    if (k < 0 || k >= m.cycles) return false;
    selectRow(i, {});
    const isIn = p.dir === 'in';
    if (p.width === 1) {
      if (isIn ? editInput(m, p.name, k) : editExpected(m, p.name, k)) stimChanged(isIn);
    } else cellDialog(p, k, isIn);
    return true;
  }
  function drawStim(ctx, first, last) {
    const m = st.stim.m, P = cyclePs(m);
    const k0 = Math.max(0, Math.floor(st.t0 / P)), k1 = Math.min(m.cycles - 1, Math.ceil(tOf(width()) / P));
    const bad = new Set(st.stim.bad.map(b => `${b.port}:${b.k}`));
    setFont(ctx, 9); ctx.textBaseline = 'top';
    for (let i = first; i <= last; i++) {
      const it = flat()[i], p = stimPort(it);
      if (!p) continue;
      const y = RULER_H + i * ROW_H - st.scrollY;
      if (st.stim.on && p.name !== m.clock) {
        // the cycles of the grid
        ctx.strokeStyle = colors().grid; ctx.setLineDash([2, 2]); ctx.beginPath();
        for (let k = k0; k <= k1 + 1; k++) { const x = Math.round(xOf(k * P)) + 0.5; ctx.moveTo(x, y + 1); ctx.lineTo(x, y + ROW_H - 1); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      const exp = m.expected[p.name];
      if (!exp) continue;
      for (let k = k0; k <= k1; k++) {
        if (!/[01]/.test(exp[k])) continue;
        const xa = xOf(k * P), xb = xOf((k + 1) * P);
        if (bad.has(`${p.name}:${k}`)) { ctx.fillStyle = 'rgba(230,40,40,0.35)'; ctx.fillRect(xa, y + 1, xb - xa, ROW_H - 2); }
        ctx.fillStyle = bad.has(`${p.name}:${k}`) ? '#ff6b6b' : '#5fbf6a';
        ctx.fillRect(xa + 1, y + ROW_H - 3, Math.max(1, xb - xa - 2), 2);
        if (st.stim.on && xb - xa > 8 + 6 * exp[k].length) ctx.fillText(exp[k], xa + 3, y + 1);
      }
    }
    ctx.textBaseline = 'middle';
  }
  function timingDialog() {
    closeDialog();
    const m = st.stim.m;
    const clocks = stimOpt.ports.filter(p => p.dir === 'in' && p.width === 1);
    const guess = m ? m.clock : (clocks.find(p => /^(clk|clock)/i.test(p.name))?.name || null);
    const ov = h('div', { class: 'isim-dlg-overlay' });
    ov.innerHTML = `
      <div class="isim-dlg isim-stim-dlg" role="dialog">
        <div class="isim-dlg-title">Stimulus Timing<button class="isim-dlg-x" title="Close">✕</button></div>
        <div class="isim-dlg-body">
          <div class="isim-dlg-hint">The inputs of ${esc(stimInst === design.top ? design.top.name : `${stimInst.module || stimInst.name} (${stimInst.path})`)} as a grid of cycles: with a clock, the inputs change at its falling edge and the outputs are checked before the next one; without one, at every time step.</div>
          <div class="isim-dlg-grid">
            <label>Clock:</label><select name="clock"><option value="">None (combinational)</option>${clocks.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}</select>
            <label>Clock Period (ns):</label><input name="period" value="${m?.periodNs ?? 20}">
            <label>Time Step (ns):</label><input name="step" value="${m?.stepNs ?? 10}">
            <label>Cycles:</label><input name="cycles" value="${m?.cycles ?? 16}">
          </div>
          <div class="isim-dlg-err"></div>
        </div>
        <div class="isim-dlg-btns"><button class="btn primary" data-a="ok">OK</button><button class="btn" data-a="cancel">Cancel</button></div>
      </div>`;
    showDialog(ov);
    const q = (n) => ov.querySelector(`[name="${n}"]`);
    q('clock').value = guess || '';
    const sync = () => { q('period').disabled = !q('clock').value; q('step').disabled = !!q('clock').value; };
    q('clock').onchange = sync; sync();
    const ok = () => {
      const num = (n, lo) => { const v = Number(q(n).value); if (!Number.isInteger(v) || v < lo) throw new Error(`${n === 'cycles' ? 'Cycles' : n === 'period' ? 'Clock Period' : 'Time Step'}: a whole number of at least ${lo}`); return v; };
      try {
        const o = { clock: q('clock').value || null, periodNs: num('period', 2), stepNs: num('step', 1), cycles: num('cycles', 1) };
        st.stim.m = st.stim.m ? normalizeStimuli({ ...st.stim.m, ...o }, stimOpt.ports) : newStimuli(stimOpt.ports, o);
        closeDialog();
        stimChanged(true);
      } catch (e) { ov.querySelector('.isim-dlg-err').textContent = e.message; }
    };
    const cancel = () => { closeDialog(); if (!st.stim.m) toggleStim(false); };
    ov.querySelector('.isim-dlg-x').onclick = cancel;
    ov.querySelector('[data-a=cancel]').onclick = cancel;
    ov.querySelector('[data-a=ok]').onclick = ok;
    ov.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') cancel(); });
    q('cycles').focus();
  }
  // the value of a bus from cycle k: an input's (bits 0 1 Z X, h… / d…) or an output's expected one (or -)
  function cellDialog(p, k, isIn) {
    closeDialog();
    const m = st.stim.m, list = isIn ? m.inputs[p.name] : m.expected[p.name];
    const ov = h('div', { class: 'isim-dlg-overlay' });
    ov.innerHTML = `
      <div class="isim-dlg isim-stim-dlg" role="dialog">
        <div class="isim-dlg-title">${isIn ? 'Input Value' : 'Expected Value'}<button class="isim-dlg-x" title="Close">✕</button></div>
        <div class="isim-dlg-body">
          <div class="isim-dlg-grid">
            <label>Signal Name:</label><input name="sig" value="${esc(p.name)}" readonly>
            <label>From Cycle:</label><input name="k" value="${k}" readonly>
            <label>Value:</label><input name="value" value="${esc(list[k])}">
          </div>
          <div class="isim-dlg-note">${isIn ? 'Bits, most significant first (0 1 Z X), h… hexadecimal or d… decimal; it holds up to the next change.' : 'Bits, most significant first (0 1, - not checked), h… hexadecimal or d… decimal; - alone: not checked.'}</div>
          <div class="isim-dlg-err"></div>
        </div>
        <div class="isim-dlg-btns"><button class="btn primary" data-a="ok">OK</button><button class="btn" data-a="cancel">Cancel</button></div>
      </div>`;
    showDialog(ov);
    const inp = ov.querySelector('[name=value]');
    const ok = () => {
      try {
        const bits = parseCellValue(inp.value, p.width, { expected: !isIn });
        closeDialog();
        if (isIn ? editInput(m, p.name, k, bits) : editExpected(m, p.name, k, bits)) stimChanged(isIn);
      } catch (e) { ov.querySelector('.isim-dlg-err').textContent = e.message; }
    };
    ov.querySelector('.isim-dlg-x').onclick = closeDialog;
    ov.querySelector('[data-a=cancel]').onclick = closeDialog;
    ov.querySelector('[data-a=ok]').onclick = ok;
    ov.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') closeDialog(); });
    inp.focus(); inp.select();
  }

  return { toggleStim, timingDialog, fillStim, stimClick, drawStim, runStim };
}
