// UI: ISim's Console and command line (web/js/isim-console.js, #405: out of mountISim), mounted alone in the
// page with a simulator window of its own: what each command does, its output and errors, the history keys.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the console of a window whose actions are recorded in `calls`; returns what the test reads back
const MOUNT = async () => {
  const { mountConsole } = await import('/js/isim-console.js');
  const V = await import('/core/values.js');
  const host = document.createElement('div');
  host.innerHTML = '<div class="isim-console"></div><input class="cmd"><button class="isim-clear"></button>';
  document.body.append(host);
  const calls = [];
  const sig = { name: 'q', path: 'top.q', t: { kind: 'logic', w: 4, s: false }, val: V.fromInt(10, 4), wave: [] };
  const inst = { name: 'top', path: 'top' };
  const st = { rows: [], history: [], histPos: 0, cursor: 5000 };
  const sim = { now: 2000, onLog: null };
  const named = (x) => (x === sig ? 'sig' : x === inst ? 'inst' : Array.isArray(x) ? x.map(named) : x);
  const rec = (name) => (...a) => { calls.push([name, ...a.map(named)]); };
  const con = mountConsole({
    st, sim, design: { top: inst }, cons: host.querySelector('.isim-console'), cmdInput: host.querySelector('.cmd'),
    $: (s) => host.querySelector(s), cleanups: [], onOpenSource: null,
    rfVal: { value: '100' }, rfUnit: { value: 'ns' },
    api: () => ({ runFor: async (ps) => calls.push(['runFor', ps]), runAll: async () => calls.push(['runAll']), restart: (q) => calls.push(['restart', q]) }),
    enqueue: (s, fn) => fn(), findSignal: (p) => (/^\/?(top[./])?q$/.test(p) ? sig : null), findInst: (p) => (p === 'top' ? inst : null),
    addSignals: rec('addSignals'), addInstance: rec('addInstance'), addForce: (s, f) => calls.push(['addForce', s === sig ? 'sig' : s, f]),
    removeForces: rec('removeForces'), addMarker: rec('addMarker'), zoomFit: rec('zoomFit'), zoomAt: rec('zoomAt'),
  });
  window.__con = { con, calls, host, sim, st };
  return true;
};

uiTest('#405 ISim console: run, restart, show, wave add, zoom, marker, help, and the errors', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(async () => {
    const { con, calls, host } = window.__con;
    const lines = () => [...host.querySelectorAll('.isim-ln')].map(d => `${d.className.replace('isim-ln ', '')}|${d.textContent}`);
    for (const c of ['run', 'run 20 ns', 'run 1.5us', 'run all', 'restart', 'show time', 'show value top/q', 'show value q -radix bin',
      'wave add /top/q top', 'zoom fit', 'zoom in', 'zoom out', 'marker add', 'marker add 30 ns', 'run -5', 'show value nope', 'frobnicate', '   '])
      await con.execCommand(c);
    con.logLine('plain'); con.logLine('careful', 'warning');
    return { calls, lines: lines() };
  });
  assert.deepEqual(out.calls, [
    ['runFor', 100000], ['runFor', 20000], ['runFor', 1500000], ['runAll'], ['restart', true],
    ['addSignals', ['sig']], ['addInstance', 'inst', false], ['zoomFit'], ['zoomAt', 0.5], ['zoomAt', 2], ['addMarker', 5000], ['addMarker', 30000],
  ]);
  assert.deepEqual(out.lines, [
    'k-cmd|SSim> run', 'k-cmd|SSim> run 20 ns', 'k-cmd|SSim> run 1.5us', 'k-cmd|SSim> run all', 'k-cmd|SSim> restart',
    'k-cmd|SSim> show time', 'k-info|Simulation time: 2 ns',
    'k-cmd|SSim> show value top/q', 'k-info|A', 'k-cmd|SSim> show value q -radix bin', 'k-info|1010',
    'k-cmd|SSim> wave add /top/q top', 'k-cmd|SSim> zoom fit', 'k-cmd|SSim> zoom in', 'k-cmd|SSim> zoom out',
    'k-cmd|SSim> marker add', 'k-cmd|SSim> marker add 30 ns',
    "k-cmd|SSim> run -5", "k-error|ERROR: invalid time '-5'",
    'k-cmd|SSim> show value nope', "k-error|ERROR: signal 'nope' not found",
    'k-cmd|SSim> frobnicate', "k-error|ERROR: unknown command 'frobnicate' (type help)",
    'k-info|plain', 'k-warning|careful',
  ]);
  // help: its text, as many lines as written
  const help = await page.eval(async () => { const { con, host } = window.__con; host.querySelector('.isim-clear').click(); await con.execCommand('help'); return [...host.querySelectorAll('.isim-ln')].map(d => d.textContent); });
  assert.equal(help[0], 'SSim> help');
  assert.equal(help[1], 'Available commands:');
  assert.ok(help.some(l => l.startsWith('  ssim force add <path> <value>')));
});

uiTest('#405 ISim console: ssim force add / remove (isim force, its old name, still accepted, #920), its pattern, repeat and cancel; the simulator\'s messages; the history keys', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(async () => {
    const { con, calls, sim, host } = window.__con;
    await con.execCommand('ssim force add q 1010 -radix bin -value 0011 -time 10 ns -repeat 20 ns -cancel 100 ns');
    await con.execCommand('isim force add q 5 -radix dec');   // (its old name, ISim's: still a command, #920)
    await con.execCommand('ssim force remove q');
    await con.execCommand('ssim force add q 1 -value 0 -time 30 -repeat 20');
    await con.execCommand('ssim force add q');
    const forces = calls.filter(c => c[0] !== 'addSignals').map(([n, s, f]) => (n === 'addForce'
      ? [n, s, f.pattern.map(p => [p.off, Number(p.val.v)]), f.start, f.repeat, f.cancel, f.desc] : [n, s]));
    // the simulator's messages: a report with its process and place, a print as it is
    sim.onLog({ kind: 'warning', text: 'too fast', proc: 'p', file: 'src/tb.vhd', line: 12, time: 15000 });
    sim.onLog({ kind: 'print', text: 'hello' });
    sim.onLog({ kind: 'error', text: 'no process' });
    const msgs = [...host.querySelectorAll('.isim-ln')].slice(-3).map(d => d.textContent);
    // Up / Down through the commands typed
    const input = host.querySelector('.cmd'), key = (k) => input.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    key('ArrowUp'); const up1 = input.value; key('ArrowUp'); const up2 = input.value; key('ArrowDown'); const down = input.value;
    return { forces, msgs, up1, up2, down, errors: [...host.querySelectorAll('.k-error')].map(d => d.textContent) };
  });
  assert.deepEqual(out.forces, [
    ['addForce', 'sig', [[0, 10], [10000, 3]], 2000, 20000, 102000, 'ssim force add q 1010 -radix bin -value 0011 -time 10 ns -repeat 20 ns -cancel 100 ns'],
    ['addForce', 'sig', [[0, 5]], 2000, 0, null, 'isim force add q 5 -radix dec'],
    ['removeForces', 'sig'],
  ]);
  // (the simulator's error report is one too)
  assert.deepEqual(out.errors, ['ERROR: -repeat period must exceed the last -time offset', 'ERROR: missing value', 'ERROR: no process']);
  assert.deepEqual(out.msgs, ['at 15 ns: Warning: too fast (tb.vhd:12)', 'hello', 'ERROR: no process']);
  assert.deepEqual([out.up1, out.up2, out.down], ['ssim force add q', 'ssim force add q 1 -value 0 -time 30 -repeat 20', 'ssim force add q']);
});
