// The browser edition's flow runner (web/js/open-flow-browser.js) with a fake Web Worker: each run
// hears only its own messages, Stop terminates the worker, a failed worker is terminated and
// replaced (#397, #399).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';

class FakeWorker {
  static all = [];
  constructor(url, opts) { Object.assign(this, { url, opts, posted: [], terminated: false }); FakeWorker.all.push(this); }
  postMessage(m) { this.posted.push(m); }
  terminate() { this.terminated = true; }
  // a message from the worker's side
  send(data) { this.onmessage({ data }); }
}
globalThis.Worker = FakeWorker;
globalThis.SILINX_ASSETS = 'https://example.test/assets/';
const { runBrowserFlow } = await import('../web/js/open-flow-browser.js');

const project = { name: 'p', top: 'top', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: [{ path: 'top.v', lang: 'verilog', role: 'design' }] };
const files = { 'top.v': 'module top(input a, output y); assign y = a; endmodule\n' };
const start = (opts = {}) => {
  const lines = [], writes = [];
  const run = runBrowserFlow({ project, files, steps: ['synth'], onLine: l => lines.push(l), onWrite: (p, d) => writes.push([p, d]), ...opts });
  return { run, lines, writes };
};
// the live worker once it has n runs posted (a run checks the design's pins before it posts)
const live = () => FakeWorker.all.filter(w => !w.terminated).at(-1);
async function posts(n) {
  for (let i = 0; i < 400; i++) { const w = live(); if (w && w.posted.length >= n) return w; await new Promise(r => setTimeout(r, 5)); }
  throw new Error(`no worker with ${n} runs posted`);
}

test('two runs on the one worker: each hears only the messages with its own id', async () => {
  const a = start(), b = start();
  const w = await posts(2);
  const [ma, mb] = w.posted;
  assert.equal(FakeWorker.all.filter(x => !x.terminated).length, 1, 'one worker');
  assert.notEqual(ma.id, mb.id);
  w.send({ id: mb.id, line: 'b says' });
  w.send({ id: ma.id, line: 'a says' });
  w.send({ id: ma.id, write: 'build/open/x.txt', data: 'A' });
  w.send({ id: 999, line: 'nobody' });
  w.send({ id: mb.id, done: { ok: true, report: 'B' } });
  w.send({ id: ma.id, done: { ok: false, error: 'A failed' } });
  assert.deepEqual(await b.run, { ok: true, report: 'B' });
  assert.deepEqual(await a.run, { ok: false, error: 'A failed' });
  assert.ok(a.lines.includes('a says') && !a.lines.includes('b says') && !a.lines.includes('nobody'));
  assert.ok(b.lines.includes('b says') && !b.lines.includes('a says'));
  assert.deepEqual(a.writes, [['build/open/x.txt', 'A']]);
  assert.deepEqual(b.writes, []);
  // a message after a run's end is not heard
  w.send({ id: ma.id, line: 'late' });
  assert.ok(!a.lines.includes('late'));
});

test('Stop (the signal): the worker is terminated, the run rejects as cancelled, the next run gets a new worker', async () => {
  const ctl = new AbortController();
  const r = start({ signal: ctl.signal });
  const w = await posts(1);
  ctl.abort();
  await assert.rejects(r.run, e => e.cancelled === true && e.message === 'cancelled by user');
  assert.equal(w.terminated, true);
  // a stopped signal before the start: nothing posted
  const n = FakeWorker.all.length;
  await assert.rejects(start({ signal: AbortSignal.abort() }).run, e => e.cancelled === true);
  assert.equal(FakeWorker.all.length, n);
  const next = start();
  const w2 = await posts(1);
  assert.notEqual(w2, w);
  const [m] = w2.posted;
  w2.send({ id: m.id, done: { ok: true } });
  assert.deepEqual(await next.run, { ok: true });
});

test('a worker that fails: terminated, every run on it rejects, the next run starts a new one', async () => {
  const a = start(), b = start();
  const w = await posts(2);
  w.onerror({ message: 'boom' });
  for (const r of [a, b]) await assert.rejects(r.run, /^Error: the Silinx toolchain could not start in this browser: boom$/);
  assert.equal(w.terminated, true);
  const c = start();
  const w2 = await posts(1);
  assert.notEqual(w2, w);
  const [m] = w2.posted;
  w2.send({ id: m.id, done: { ok: true } });
  assert.deepEqual(await c.run, { ok: true });
});
