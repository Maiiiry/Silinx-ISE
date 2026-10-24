// web/js/sch-options.js (#405, #1145): the schematic editor's remembered toolbar options, mounted alone with a minimal
// stand-in for the page: Keep connections on and Names off by default, Hop-overs on (#756); a change remembered and
// drawn again (Names, Hop-overs); no storage (private browsing) the defaults. sch-editor.js still mounts it.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let store, storage;
// a checkbox: its attributes, its change listeners
function el(tag) {
  const on = [];
  return { tag, checked: false, toggleAttribute() {}, setAttribute() {}, addEventListener: (ev, fn) => on.push([ev, fn]), change(v) { this.checked = v; for (const [ev, fn] of on) if (ev === 'change') fn(); } };
}
beforeEach(() => {
  store = {}; storage = true;
  globalThis.document = { createElement: el };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { if (!storage) throw new Error('SecurityError'); return { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } }; },
  });
});
const { mountSchOptions } = await import('../web/js/sch-options.js');

test('the defaults: Keep connections, Hop-overs on; Names off; nothing stored', () => {
  let renders = 0;
  const o = mountSchOptions({ render: () => renders++ });
  assert.deepEqual([o.keepConn(), o.showNames(), o.showHops()], [true, false, true]);
  assert.deepEqual([o.keepBox.checked, o.namesBox.checked, o.hopsBox.checked], [true, false, true]);
  assert.deepEqual(store, {});
  assert.equal(renders, 0);
});

test('a change: its value, remembered, the drawing made again (Names, Hop-overs; not Keep connections)', () => {
  let renders = 0;
  const o = mountSchOptions({ render: () => renders++ });
  o.keepBox.change(false);
  assert.equal(o.keepConn(), false); assert.equal(renders, 0);
  o.namesBox.change(true);
  assert.equal(o.showNames(), true); assert.equal(renders, 1);
  o.hopsBox.change(false);
  assert.equal(o.showHops(), false); assert.equal(renders, 2);
  assert.deepEqual(store, { 'xl.sch.keepConn': '0', 'xl.sch.names': '1', 'xl.sch.hops': '0' });
  // (another editor: as remembered)
  const p = mountSchOptions({ render() {} });
  assert.deepEqual([p.keepConn(), p.showNames(), p.showHops()], [false, true, false]);
});

test('no storage: the defaults, a change kept for the editor only', () => {
  storage = false;
  const o = mountSchOptions({ render() {} });
  assert.deepEqual([o.keepConn(), o.showNames(), o.showHops()], [true, false, true]);
  o.namesBox.change(true);
  assert.equal(o.showNames(), true);
});

test('the editor mounts it (sch-editor.js), its options read through the getters', () => {
  const src = fs.readFileSync(new URL('../web/js/sch-editor.js', import.meta.url), 'utf8');
  assert.match(src, /mountSchOptions\(\{ render: \(\.\.\.a\) => render\(\.\.\.a\) \}\)/);
  assert.doesNotMatch(src, /let (keepConn|showNames|showHops)\b/);
});
