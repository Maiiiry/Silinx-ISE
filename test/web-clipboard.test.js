// The app's clipboard (#677, web/js/clipboard.js): Edit ▸ Paste reads the system clipboard where the browser
// lets it, else the app's own copy; a read the browser holds (Firefox, until the viewer clicks its Paste prompt)
// is waited for a moment only, then the app's own copy is pasted (#888).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readClip, writeClip, READ_WAIT_MS } from '../web/js/clipboard.js';

// a browser's clipboard: readText answering with `read` (a function giving its promise)
function browser(read) {
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { readText: read, writeText: async () => {} } }, configurable: true });
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
