// The app's clipboard (#677, web/js/clipboard.js): Edit ▸ Paste reads the system clipboard where the browser
// lets it, else the app's own copy: a read the browser holds is waited for a moment only, and none is made where
// the browser has no clipboard-read permission (Firefox, Safari: their Paste prompt stays open in the way, #888).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readClip, writeClip, READ_WAIT_MS } from '../web/js/clipboard.js';

// a browser's clipboard: readText answering with `read` (a function giving its promise); its clipboard-read
// permission's state (Chromium), or `perm` 'none': no such permission (Firefox, Safari: the query throws)
function browser(read, perm = 'prompt') {
  const permissions = { query: async ({ name }) => { if (perm === 'none' || name !== 'clipboard-read') throw new TypeError(`'${name}' is not a valid permission name`); return { state: perm }; } };
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { readText: read, writeText: async () => {} }, permissions }, configurable: true });
  globalThis.document ??= { addEventListener() {}, removeEventListener() {}, execCommand() { return false; } };
}

test('#888 a read of the system clipboard the browser holds: the app\'s own copy, after a moment', async () => {
  browser(() => new Promise(() => {}));   // (Firefox: pending until its Paste prompt is clicked)
  writeClip('text', 'copied here');
  const t0 = Date.now();
  assert.equal(await readClip('text'), 'copied here');
  const ms = Date.now() - t0;
  assert.ok(ms >= READ_WAIT_MS - 20 && ms < READ_WAIT_MS + 500, `waited ${ms} ms`);
  assert.equal(await readClip('text', 20), 'copied here', 'the wait is a parameter');
});

test('the system clipboard read: its text (a copy from another application), else the app\'s own copy', async () => {
  writeClip('text', 'copied here');
  browser(async () => 'from elsewhere');
  assert.equal(await readClip('text'), 'from elsewhere');
  browser(async () => { throw Object.assign(new Error('refused'), { name: 'NotAllowedError' }); });   // (WebKit)
  assert.equal(await readClip('text'), 'copied here');
  browser(async () => '');
  assert.equal(await readClip('text'), 'copied here', 'an empty system clipboard');
  browser(undefined);   // (no API)
  assert.equal(await readClip('text'), 'copied here');
  // a drawing: the app's copy when the system clipboard holds the same text, nothing for another kind
  writeClip('fsm', { nodes: [{ id: 's0' }] });
  browser(() => new Promise(() => {}));
  assert.deepEqual(await readClip('fsm', 20), { nodes: [{ id: 's0' }] });
  assert.equal(await readClip('asm', 20), null);
});

test('#888 no clipboard-read permission (Firefox, Safari) or refused: the system clipboard is not read, the app\'s copy pasted at once', async () => {
  writeClip('text', 'copied here');
  for (const perm of ['none', 'denied']) {
    let asked = 0;
    browser(() => { asked++; return new Promise(() => {}); }, perm);
    const t0 = Date.now();
    assert.equal(await readClip('text'), 'copied here', perm);
    assert.equal(asked, 0, `${perm}: no read, no prompt`);
    assert.ok(Date.now() - t0 < 100, `${perm}: no wait`);
  }
  // granted (Chromium after the viewer allowed it): read
  browser(async () => 'from elsewhere', 'granted');
  assert.equal(await readClip('text'), 'from elsewhere');
});
