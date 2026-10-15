// The page's Yosys client (web/js/yosys-client.js) with several workers (#276): two runs at once in two
// workers, a third queued until one ends, the workers kept for the next runs; one worker on a device with
// few cores or little memory; after a crash one Yosys at a time.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// a fake Web Worker: its run ends when the test says so (done(i, reply)), in the order the runs came
const workers = [], runs = [];
globalThis.Worker = class {
  constructor(url) { this.url = url; this.terminated = false; workers.push(this); }
  postMessage({ id, args }) { runs.push({ worker: this, id, args, ended: false }); }
  terminate() { this.terminated = true; }
};
const done = (i, reply = { files: { out: runs[i].args.join(' ') } }) => {
  const r = runs[i];
  r.ended = true;
  r.worker.onmessage({ data: { id: r.id, ...reply } });
};
const tick = () => new Promise(r => setTimeout(r, 0));
const withNavigator = async (nav, f) => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
  try { return await f(); } finally { if (old) Object.defineProperty(globalThis, 'navigator', old); else delete globalThis.navigator; }
};
let n = 0;
const load = nav => withNavigator(nav, () => import(`../web/js/yosys-client.js?${++n}`));

test('#276 Yosys client: as many workers as the device allows', async () => {
  assert.equal((await load({ hardwareConcurrency: 8, deviceMemory: 8 })).WORKERS, 2);
  assert.equal((await load({ hardwareConcurrency: 8 })).WORKERS, 2, 'no deviceMemory (Firefox, Safari): 2');
  assert.equal((await load({ hardwareConcurrency: 8, deviceMemory: 4 })).WORKERS, 1, 'little memory');
  assert.equal((await load({ hardwareConcurrency: 2, deviceMemory: 8 })).WORKERS, 1, 'few cores');
  assert.equal((await load({})).WORKERS, 1, 'nothing known');
});

test('#276 Yosys client: two runs at once in two workers, a third queued, the workers kept', async () => {
  const { yosysBrowser } = await load({ hardwareConcurrency: 8, deviceMemory: 8 });
  workers.length = runs.length = 0;
  assert.equal(yosysBrowser.parallel, 2);
  const lines = [];
  const p = ['a', 'b', 'c'].map(x => yosysBrowser([x], {}, l => lines.push(l)));
  await tick();
  assert.deepEqual(runs.map(r => r.args[0]), ['a', 'b'], 'the third waits');
  assert.equal(workers.length, 2);
  assert.notEqual(runs[0].worker, runs[1].worker);
  done(1);
  await tick();
  assert.deepEqual(runs.map(r => r.args[0]), ['a', 'b', 'c']);
  assert.equal(runs[2].worker, runs[1].worker, 'in the worker that ended');
  // a line reaches its own run
  runs[2].worker.onmessage({ data: { id: runs[2].id, line: 'from c' } });
  done(0);
  done(2);
  assert.deepEqual(await Promise.all(p), [{ out: 'a' }, { out: 'b' }, { out: 'c' }]);
  assert.deepEqual(lines, ['from c']);
  // the next ones in the same two workers
  const q = [yosysBrowser(['d'], {}), yosysBrowser(['e'], {})];
  await tick();
  assert.equal(workers.length, 2);
  done(3); done(4);
  assert.deepEqual(await Promise.all(q), [{ out: 'd' }, { out: 'e' }]);
  // an error of the design: that run fails, the other not
  const r = [yosysBrowser(['f'], {}), yosysBrowser(['g'], {})];
  await tick();
  done(5, { error: 'Yosys failed (exit code 1)', code: 1, crash: false });
  done(6);
  await assert.rejects(r[0], e => e.code === 1);
  assert.deepEqual(await r[1], { out: 'g' });
});

test('#276 Yosys client: after a crash, the run once more in a new worker and one Yosys at a time', async () => {
  const { yosysBrowser } = await load({ hardwareConcurrency: 8, deviceMemory: 8 });
  workers.length = runs.length = 0;
  const lines = [];
  const p = [yosysBrowser(['a'], {}, l => lines.push(l)), yosysBrowser(['b'], {})];
  await tick();
  done(0, { error: 'Yosys failed: RangeError', crash: true });
  await tick();
  assert.ok(runs[0].worker.terminated);
  assert.equal(yosysBrowser.parallel, 1);
  assert.deepEqual(lines, ['Yosys failed: RangeError: Yosys is started again (a new worker) and the synthesis run once more']);
  // b still running: a's second try waits for it, then runs in b's worker (one at a time)
  assert.equal(runs.length, 2);
  done(1);
  await tick();
  assert.deepEqual(runs.map(r => r.args[0]), ['a', 'b', 'a']);
  assert.equal(runs[2].worker, runs[1].worker);
  done(2);
  assert.deepEqual(await Promise.all(p), [{ out: 'a' }, { out: 'b' }]);
  assert.equal(workers.filter(w => !w.terminated).length, 1);
});
