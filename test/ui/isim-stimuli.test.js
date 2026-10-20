// UI: ISim's drawn stimuli (web/js/isim-stimuli.js, #405: out of mountISim; #336), mounted alone in the page with a
// window of its own whose actions are recorded: Edit Stimuli on and off, the timing dialog and its errors, a click
// on a cycle of an input, of an output, of a bus (its value dialog), the run of the stimuli and the check of the
// expected outputs, Fill Expected, and the drawing of the expected values.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// a window of a module with the inputs a (1 bit) and b (4 bits) and the output y: rows a, b, y in that order, a
// cycle 100 px wide at 10 ns a step; y's simulated value is 1 from 20 ns. `model`: saved stimuli.
const MOUNT = async (model = null) => {
  const { mountStimuli } = await import('/js/isim-stimuli.js');
  const { normalizeStimuli } = await import('/core/stimuli.js');
  const V = await import('/core/values.js');
  const { ROW_H, RULER_H } = await import('/js/isim.js');
  const root = document.createElement('div');
  root.className = 'isim';
  const stimBar = document.createElement('div');
  stimBar.innerHTML = '<span class="isim-stim-st"></span>';
  stimBar.hidden = true;
  const btn = document.createElement('button');
  root.append(stimBar, btn);
  document.body.append(root);
  const calls = [];
  const ports = [{ name: 'a', dir: 'in', width: 1 }, { name: 'b', dir: 'in', width: 4 }, { name: 'y', dir: 'out', width: 1 }];
  const sigs = Object.fromEntries(ports.map((p) => [p.name, { name: p.name, path: `top.${p.name}` }]));
  const top = { name: 'top', path: 'top', ports: ports.map((p) => ({ name: p.name, sig: sigs[p.name] })) };
  const topSig = new Map(top.ports.map((p) => [p.name, p.sig]));
  const stimPortOf = new Map(ports.map((p) => [sigs[p.name], p]));
  const sim = { now: 0, valueAt: (s, t) => (s === sigs.y ? V.fromInt(t >= 20000 ? 1 : 0, 1, false) : V.fromInt(0, s === sigs.b ? 4 : 1, false)) };
  const st = { stim: { on: false, m: model && normalizeStimuli(model, ports), bad: [] }, t0: 0 };
  const flat = ports.map((p) => ({ row: { kind: 'sig', sig: sigs[p.name] } }));
  let dlg = null;
  const rec = (name) => (...a) => { calls.push([name, ...a]); };
  const stim = mountStimuli({ st, sim, design: { top }, stimOpt: { ports, onChange: (m) => calls.push(['onChange', m]) }, stimInst: top, topSig, stimPortOf,
    stimBar, btns: { stim: btn }, layout: rec('layout'), invalidate: rec('invalidate'),
    rowAtY: (y) => Math.floor((y - RULER_H) / ROW_H), tOf: (x) => x * 100, xOf: (t) => t / 100, selectRow: (i) => calls.push(['selectRow', i]),
    setFont: () => {}, flat: () => flat, width: () => 800, colors: () => ({ grid: '#888' }),
    api: () => ({ restart: (q) => { sim.now = 0; calls.push(['restart', q]); } }), echo: rec('echo'),
    enqueue: (s, fn) => { calls.push(['enqueue', s]); return fn(); }, runTo: (ps, label) => { sim.now = ps; calls.push(['runTo', ps, label]); },
    logLine: rec('logLine'), showDialog: (ov) => { dlg?.remove(); root.append(ov); dlg = ov; }, closeDialog: () => { dlg?.remove(); dlg = null; } });
  const cell = (row, k) => [k * 100 + 50, RULER_H + row * ROW_H + ROW_H / 2];
  const fields = () => Object.fromEntries([...root.querySelectorAll('.isim-dlg [name]')].map((e) => [e.name, e.disabled ? `${e.value} (disabled)` : e.value]));
  const set = (vals) => { for (const [n, v] of Object.entries(vals)) { const e = root.querySelector(`.isim-dlg [name="${n}"]`); e.value = v; e.dispatchEvent(new Event('change')); } };
  const press = (a) => root.querySelector(`.isim-dlg [data-a=${a}]`).click();
  const title = () => root.querySelector('.isim-dlg-title')?.firstChild.textContent ?? null;
  const err = () => root.querySelector('.isim-dlg-err')?.textContent ?? null;
  const status = () => [stimBar.querySelector('.isim-stim-st').textContent, stimBar.querySelector('.isim-stim-st').classList.contains('bad')];
  const settle = () => new Promise((r) => setTimeout(r, 0));
  window.__stim = { stim, st, calls, stimBar, btn, root, cell, fields, set, press, title, err, status, settle };
  return true;
};

uiTest('#405 ISim drawn stimuli: Edit Stimuli on, the timing dialog and its errors, a click on an input, an output and a bus, the run and the check', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(async () => {
    const { stim, st, calls, stimBar, btn, cell, fields, set, press, title, err, status, settle } = window.__stim;
    const r = {};
    // Edit Stimuli on, no model yet: the timing dialog, the clock guessed (none here)
    stim.toggleStim();
    r.on = { on: st.stim.on, bar: stimBar.hidden, btn: btn.classList.contains('on'), title: title(), fields: fields(), focus: document.activeElement.name };
    set({ cycles: '0' });
    press('ok');
    r.cyclesErr = err();
    set({ cycles: '4', step: '2.5' });
    press('ok');
    r.stepErr = err();
    set({ step: '10' });
    press('ok');
    await settle();
    r.model = JSON.parse(JSON.stringify(st.stim.m));
    r.afterOk = calls.splice(0);
    r.status = status();
    // a click on a cycle of input a: 0 → 1 there and after it; the run again
    r.clickA = stim.stimClick(...cell(0, 1));
    await settle();
    r.a = [...st.stim.m.inputs.a];
    r.afterA = calls.splice(0).map((c) => c[0]);
    // on output y: its expected value - → 0, checked at once, no run
    stim.stimClick(...cell(2, 3));
    stim.stimClick(...cell(2, 3));
    r.y = [...st.stim.m.expected.y];
    r.afterY = calls.splice(0).map((c) => c[0]);
    r.statusY = status();
    // on bus b: its value dialog; a bad value, then h5 from cycle 2
    stim.stimClick(...cell(1, 2));
    r.bus = { title: title(), fields: fields() };
    set({ value: 'h1F' });
    press('ok');
    r.busErr = err();
    set({ value: 'h5' });
    press('ok');
    await settle();
    r.b = [...st.stim.m.inputs.b];
    r.afterB = calls.splice(0);
    // outside the cycles, or on no port: not a stimulus click
    r.outside = [stim.stimClick(5 * 100 + 50, cell(0, 0)[1]), stim.stimClick(50, 1000)];
    // Fill Expected from the simulation: y from the run (1 from 20 ns), then the run checks it OK
    stim.fillStim();
    await settle();
    r.filled = [...st.stim.m.expected.y];
    r.statusFilled = status();
    r.afterFill = calls.splice(0);
    // the drawing: the expected values over the waves, a mismatch red
    st.stim.m.expected.y[0] = '1';
    await stim.runStim();
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const fills = [];
    const fillRect = ctx.fillRect.bind(ctx);
    ctx.fillRect = (...a) => { fills.push(ctx.fillStyle); fillRect(...a); };
    stim.drawStim(ctx, 0, 2);
    r.fills = fills;
    r.statusBad = status();
    calls.splice(0);
    // off: the bar hidden, the waves drawn again
    stim.toggleStim(false);
    r.off = { on: st.stim.on, bar: stimBar.hidden, btn: btn.classList.contains('on'), calls: calls.splice(0).map((c) => c[0]) };
    return r;
  });
  assert.deepEqual(out.on, { on: true, bar: false, btn: true, title: 'Stimulus Timing', fields: { clock: '', period: '20 (disabled)', step: '10', cycles: '16' }, focus: 'cycles' });
  assert.equal(out.cyclesErr, 'Cycles: a whole number of at least 1');
  assert.equal(out.stepErr, 'Time Step: a whole number of at least 1');
  assert.deepEqual(out.model, { version: 1, clock: null, periodNs: 20, stepNs: 10, cycles: 4,
    inputs: { a: ['0', '0', '0', '0'], b: ['0000', '0000', '0000', '0000'] }, expected: { y: ['-', '-', '-', '-'] } });
  assert.deepEqual(out.afterOk.map((c) => c[0]), ['layout', 'onChange', 'restart', 'echo', 'enqueue', 'runTo']);
  assert.deepEqual(out.afterOk.slice(2), [['restart', true], ['echo', 'run 40 ns'], ['enqueue', 'run 40 ns'], ['runTo', 40000, 'Run']]);
  assert.deepEqual(out.status, ['4 cycles (combinational, step 10 ns): no expected outputs', false]);
  assert.equal(out.clickA, true);
  assert.deepEqual(out.a, ['0', '1', '1', '1']);
  assert.deepEqual(out.afterA, ['selectRow', 'onChange', 'restart', 'echo', 'enqueue', 'runTo']);
  assert.deepEqual(out.y, ['-', '-', '-', '1']);
  assert.deepEqual(out.afterY, ['selectRow', 'onChange', 'invalidate', 'selectRow', 'onChange', 'invalidate']);
  assert.deepEqual(out.statusY, ['4 cycles (combinational, step 10 ns): expected outputs OK', false]);
  assert.deepEqual(out.bus, { title: 'Input Value', fields: { sig: 'b', k: '2', value: '0000' } });
  assert.match(out.busErr, /./, 'a value too wide for 4 bits: an error, the dialog open');
  assert.deepEqual(out.b, ['0000', '0000', '0101', '0101']);
  assert.deepEqual(out.afterB.map((c) => c[0]), ['selectRow', 'onChange', 'restart', 'echo', 'enqueue', 'runTo', 'logLine']);
  assert.deepEqual(out.afterB.at(-1), ['logLine', 'Stimuli: 4 cycles, the expected outputs match', 'info']);
  assert.deepEqual(out.outside, [false, false]);
  assert.deepEqual(out.filled, ['0', '0', '1', '1']);
  assert.deepEqual(out.statusFilled, ['4 cycles (combinational, step 10 ns): expected outputs OK', false]);
  assert.deepEqual(out.afterFill.map((c) => c[0]), ['logLine', 'onChange', 'invalidate']);
  assert.deepEqual(out.afterFill[0], ['logLine', 'Stimuli: the expected outputs filled in from the simulation', 'info']);
  assert.deepEqual(out.statusBad, ['4 cycles (combinational, step 10 ns): 1 mismatch(es)', true]);
  assert.deepEqual(out.fills, ['rgba(230, 40, 40, 0.35)', '#ff6b6b', '#5fbf6a', '#5fbf6a', '#5fbf6a']);
  assert.deepEqual(out.off, { on: false, bar: true, btn: false, calls: ['layout', 'invalidate'] });
});

uiTest('#405 ISim drawn stimuli: saved stimuli run and their mismatches logged; the timing dialog with a clock; Cancel with no model turns editing off', E, async (page) => {
  await page.eval(MOUNT, { version: 1, clock: 'a', periodNs: 20, stepNs: 10, cycles: 2, inputs: { a: ['0', '0'], b: ['0001', '0010'] }, expected: { y: ['1', '1'] } });
  const out = await page.eval(async () => {
    const { stim, st, calls, press, fields, title, set, status } = window.__stim;
    const r = {};
    await stim.runStim();
    r.run = calls.splice(0);
    r.status = status();
    // the timing dialog of saved stimuli: their values; a clock: the period, not the step
    stim.timingDialog();
    r.fields = fields();
    set({ clock: '' });
    r.noClock = fields();
    press('cancel');
    r.closed = title();
    // editing on with no model, then Cancel: editing off again
    st.stim.m = null;
    stim.toggleStim(true);
    r.opened = title();
    press('cancel');
    r.cancelled = { on: st.stim.on, dialog: title() };
    return r;
  });
  assert.deepEqual(out.run.filter((c) => c[0] !== 'logLine'), [['restart', true], ['echo', 'run 40 ns'], ['enqueue', 'run 40 ns'], ['runTo', 40000, 'Run']]);
  assert.deepEqual(out.run.filter((c) => c[0] === 'logLine'), [
    ['logLine', 'Stimuli: 1 mismatch(es) of the expected outputs', 'warning'],
    ['logLine', '  y at cycle 0 (0 ns): expected 1, got 0', 'warning']]);
  assert.deepEqual(out.status, ['2 cycles (clock a, period 20 ns): 1 mismatch(es)', true]);
  assert.deepEqual(out.fields, { clock: 'a', period: '20', step: '10 (disabled)', cycles: '2' });
  assert.deepEqual(out.noClock, { clock: '', period: '20 (disabled)', step: '10', cycles: '2' });
  assert.equal(out.closed, null);
  assert.equal(out.opened, 'Stimulus Timing');
  assert.deepEqual(out.cancelled, { on: false, dialog: null });
});
