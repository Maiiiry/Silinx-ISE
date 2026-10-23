// Where a schematic's Try it draws an I/O marker's control (#1124, core/sch-live-place.js): on the marker's body near its
// tip, whichever side of the tip the body is on; the unturned markers' controls where they were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alongMarker, valueBoxAt } from '../core/sch-live-place.js';
import { portBox } from '../core/schdoc.js';

const at = (dir, side) => ({ x: 200, y: 100, dir, name: 'a', ...(side ? { side } : {}) });

test('#1124 an unturned marker\'s control where it was: an input\'s left of its tip, an output\'s right', () => {
  // (before: a switch at x - 27 … x - 11, an LED at x + 15, an input's value box right edge at x - 3, an output's at x + 3)
  assert.deepEqual(alongMarker(at('in'), 19), { x: 181, y: 100 });
  assert.deepEqual(alongMarker(at('out'), 15), { x: 215, y: 100 });
  assert.deepEqual(alongMarker(at('inout'), 15), { x: 215, y: 100 });
  assert.deepEqual(valueBoxAt(at('in'), 40), { x: 157, y: 78 });
  assert.deepEqual(valueBoxAt(at('out'), 40), { x: 203, y: 78 });
});

test('#1124 a turned or mirrored marker\'s control on its body: inside the marker\'s box, near its tip', () => {
  for (const dir of ['in', 'out']) {
    for (const side of ['W', 'E', 'N', 'S']) {
      const p = at(dir, side), b = portBox(p);
      for (const d of [15, 19]) {
        const c = alongMarker(p, d);
        assert.ok(c.x >= b.x && c.x <= b.x + b.w && c.y >= b.y && c.y <= b.y + b.h, `${dir} ${side} ${d}: ${JSON.stringify(c)} in ${JSON.stringify(b)}`);
        assert.equal(Math.hypot(c.x - p.x, c.y - p.y), d);
      }
    }
  }
  // an input mirrored to the right (E): its switch right of its tip, where the unturned one would be left
  assert.deepEqual(alongMarker(at('in', 'E'), 19), { x: 219, y: 100 });
  assert.deepEqual(alongMarker(at('out', 'W'), 15), { x: 185, y: 100 });
  assert.deepEqual(alongMarker(at('in', 'N'), 19), { x: 200, y: 81 });
  assert.deepEqual(alongMarker(at('out', 'S'), 15), { x: 200, y: 115 });
  // the value boxes: above an E / W body, beside an N / S one (never over the marker)
  assert.deepEqual(valueBoxAt(at('in', 'E'), 40), { x: 203, y: 78 });
  assert.deepEqual(valueBoxAt(at('out', 'W'), 40), { x: 157, y: 78 });
  for (const side of ['N', 'S']) {
    const p = at('in', side), v = valueBoxAt(p, 40), b = portBox(p);
    assert.ok(v.x >= b.x + b.w, `${side}: the box right of the marker`);
  }
});
