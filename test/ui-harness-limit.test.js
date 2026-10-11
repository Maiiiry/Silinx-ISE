// The UI harness's time limit on Playwright calls (test/ui/harness.js pwLimit): a call that gets no
// answer fails, naming itself and the page's last action, instead of hanging (CI, WebKit, 12ce296).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pwLimit } from './ui/harness.js';

test('a Playwright call that never answers fails after the limit, naming the call and the last action', async () => {
  const t0 = Date.now();
  await assert.rejects(pwLimit('page eval x', new Promise(() => {}), { lastAction: 'mouse mousePressed at 10,20' }, 50),
    /^Error: page eval x: no answer from \w+ within 50 ms \(the page may be stuck; last action: mouse mousePressed at 10,20\)$/);
  assert.ok(Date.now() - t0 < 1000);
  // an answer in time passes through, and the timer does not keep the process alive
  assert.equal(await pwLimit('quick', Promise.resolve(42), {}, 50), 42);
  await assert.rejects(pwLimit('fails', Promise.reject(new Error('boom')), {}, 50), /^Error: boom$/);
});
