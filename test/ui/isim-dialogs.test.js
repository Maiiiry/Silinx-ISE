// UI: ISim's dialogs (web/js/isim-dialogs.js, #405: out of mountISim), mounted alone in the page: Force Constant
// and Force Clock of a signal (their fields, the force added, the isim force add command echoed, the errors), one
// dialog at a time, and the ways to close one.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the dialogs of a window at 2 ns whose forces and echoes are recorded in `calls`
const MOUNT = async () => {
  const { mountDialogs } = await import('/js/isim-dialogs.js');
  const V = await import('/core/values.js');
  const root = document.createElement('div');
  root.className = 'isim';
  document.body.append(root);
  const calls = [];
  const sig = { name: 'q', path: 'top.q', t: { kind: 'logic', w: 4, s: false }, val: V.fromInt(10, 4), wave: [] };
  const state = { name: 'st', path: 'top.st', t: { kind: 'enum', names: ['IDLE', 'RUN'] }, val: { v: 0 }, wave: [] };
  const sim = { now: 2000, valueAt: (s) => s.val };
  const dlg = mountDialogs({ root, sim, addForce: (s, f) => calls.push(['addForce', s.name, { ...f, pattern: f.pattern.map((p) => ({ off: p.off, val: typeof p.val === 'object' ? V.toBin(p.val) : p.val })) }]),
    echo: (s) => calls.push(['echo', s]) });
  const fields = () => Object.fromEntries([...root.querySelectorAll('.isim-dlg [name]')].map((e) => [e.name, e.disabled ? `${e.value} (disabled)` : e.value]));
  const set = (vals) => { for (const [n, v] of Object.entries(vals)) root.querySelector(`.isim-dlg [name="${n}"]`).value = v; };
  const press = (a) => root.querySelector(`.isim-dlg [data-a=${a}]`).click();
  const open = () => root.querySelectorAll('.isim-dlg-overlay').length;
  const title = () => root.querySelector('.isim-dlg-title')?.firstChild.textContent ?? null;
  const err = () => root.querySelector('.isim-dlg-err')?.textContent ?? null;
  window.__dlg = { dlg, calls, root, sig, state, fields, set, press, open, title, err };
  return true;
};

uiTest('#405 ISim dialogs: Force Constant, its fields, the force and its command; Apply keeps it open, OK and Enter close it; the errors', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { dlg, calls, root, sig, state, fields, set, press, open, title, err } = window.__dlg;
    const r = {};
    dlg.forceDialog(sig, 'const');
    r.first = { title: title(), fields: fields(), focus: document.activeElement.name, note: root.querySelector('.isim-dlg-note').textContent };
    set({ value: '0110', start: '5', cancel: '20' });
    press('apply');
    r.applied = { open: open(), err: err() };
    set({ value: '12', start: '' });
    press('ok');
    r.bad = { open: open(), err: err() };
    set({ value: '1', start: 'soon' });
    press('ok');
    r.badTime = err();
    set({ value: 'F', radix: 'hex', start: '', cancel: '' });
    root.querySelector('.isim-dlg [name=value]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    r.entered = open();
    // an enumeration: no radix, the value by name
    dlg.forceDialog(state, 'const');
    r.enumFields = fields();
    set({ value: 'RUN' });
    press('ok');
    r.calls = calls;
    return r;
  });
  assert.deepEqual(out.first, { title: 'Force Selected Signal',
    fields: { sig: '/top/q', radix: 'bin', value: '1010', start: '0', cancel: '' }, focus: 'value',
    note: 'Time offsets are relative to the current simulation time (2 ns); default unit is ns.' });
  assert.deepEqual(out.applied, { open: 1, err: '' });
  assert.equal(out.bad.open, 1);
  assert.match(out.bad.err, /./, 'an invalid value: an error, the dialog open');
  assert.equal(out.badTime, 'invalid time offset');
  assert.equal(out.entered, 0);
  assert.deepEqual(out.enumFields, { sig: '/top/st', radix: 'bin (disabled)', value: 'IDLE', start: '0', cancel: '' });
  assert.deepEqual(out.calls, [
    ['addForce', 'q', { pattern: [{ off: 0, val: '0110' }], start: 7000, cancel: 22000, desc: 'constant 0110' }],
    ['echo', 'ssim force add /top/q 0110 -radix bin -time 5 ns -cancel 20 ns'],
    ['addForce', 'q', { pattern: [{ off: 0, val: '1111' }], start: 2000, cancel: null, desc: 'constant F' }],
    ['echo', 'ssim force add /top/q F -radix hex'],
    ['addForce', 'st', { pattern: [{ off: 0, val: '1' }], start: 2000, cancel: null, desc: 'constant RUN' }],
    ['echo', 'ssim force add /top/st RUN -radix bin'],
  ]);
});

uiTest('#405 ISim dialogs: Force Clock, its pattern, repeat, duty cycle and their errors; one dialog at a time; Cancel, ✕ and a click outside close it', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { dlg, calls, root, sig, fields, set, press, open, title, err } = window.__dlg;
    const r = {};
    dlg.forceDialog(sig, 'clock');
    r.first = { title: title(), fields: fields(), focus: document.activeElement.name };
    set({ lead: '0', trail: '1', start: '3', period: '1 ps' });
    press('ok');
    r.period = err();
    set({ period: '10 ns', duty: '100' });
    press('ok');
    r.duty = err();
    set({ duty: '30', cancel: '100' });
    press('ok');
    r.closed = open();
    // a second dialog replaces the first; Cancel, ✕ and a press outside it close it, adding nothing
    dlg.forceDialog(sig, 'clock');
    dlg.forceDialog(sig, 'const');
    r.one = [open(), title()];
    press('cancel');
    r.cancel = open();
    dlg.forceDialog(sig, 'const');
    root.querySelector('.isim-dlg-x').click();
    r.x = open();
    dlg.forceDialog(sig, 'const');
    root.querySelector('.isim-dlg-overlay').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    r.outside = open();
    // show(): any dialog of the window (the drawn stimuli's), closed by closeDialog
    const other = document.createElement('div');
    other.className = 'isim-dlg-overlay';
    dlg.show(other);
    dlg.forceDialog(sig, 'const');
    r.shown = [other.isConnected, open()];
    dlg.closeDialog();
    dlg.closeDialog();
    r.none = open();
    r.calls = calls;
    return r;
  });
  assert.deepEqual(out.first, { title: 'Define Clock',
    fields: { sig: '/top/q', radix: 'bin', lead: '0', trail: '1', start: '0', cancel: '', period: '10 ns', duty: '50' }, focus: 'lead' });
  assert.equal(out.period, 'period must be at least 2 ps');
  assert.equal(out.duty, 'duty cycle must be between 0 and 100');
  assert.equal(out.closed, 0);
  assert.deepEqual(out.one, [1, 'Force Selected Signal']);
  assert.deepEqual([out.cancel, out.x, out.outside], [0, 0, 0]);
  assert.deepEqual(out.shown, [false, 1]);
  assert.equal(out.none, 0);
  assert.deepEqual(out.calls, [
    ['addForce', 'q', { pattern: [{ off: 0, val: '0000' }, { off: 3000, val: '0001' }], start: 5000, repeat: 10000, cancel: 102000, desc: 'clock 0/1 period 10 ns duty 30%' }],
    ['echo', 'ssim force add /top/q 0 -radix bin -time 3 ns -value 1 -time 6 ns -repeat 10 ns -cancel 100 ns'],
  ]);
});
