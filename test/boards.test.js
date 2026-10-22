// The boards (#405: server/boards.js out of server/devices.js, the family they share in server/family.js):
// devices.js still exports BOARDS and FAMILY; every board is found by its id, its FPGA (and each variant's) is a
// known part of its family, its resources' names are unique, their pins are not shared, and each is marked as
// transcribed from the board's UCF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as devices from '../server/devices.js';
import { BOARDS } from '../server/boards.js';
import { FAMILY } from '../server/family.js';

test('#405 boards: devices.js exports the modules\' BOARDS and FAMILY', () => {
  assert.equal(devices.BOARDS, BOARDS);
  assert.equal(devices.FAMILY, FAMILY);
  assert.equal(FAMILY, 'spartan3e');
});

test('#405 boards: each found by its id, its FPGA a known part, its resources\' names and pins unique, verified', () => {
  assert.equal(new Set(BOARDS.map(b => b.id)).size, BOARDS.length);
  for (const b of BOARDS) {
    assert.equal(devices.findBoard(b.id), b);
    for (const d of [b.device, ...(b.variants || []).map(v => v.device)]) {
      assert.ok(devices.findPart(d.part), `${b.id}: ${d.part}`);
      assert.equal(devices.familyOf(d.part), d.family, `${b.id}: ${d.part}`);
    }
    assert.equal(new Set(b.resources.map(r => r.name)).size, b.resources.length, `${b.id}: resource names`);
    const pins = b.resources.flatMap(r => r.pins || []);
    assert.equal(new Set(pins).size, pins.length, `${b.id}: a pin on two resources`);
    assert.ok(b.resources.every(r => r.verified === true || r.verified === false), b.id);
  }
});
