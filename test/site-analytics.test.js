// The published site's usage counts (scripts/site-analytics.mjs, web/js/analytics.js): GoatCounter's
// loader added once to the site's pages (the root and dev/), never to the downloaded file, counting
// only on the published host; the events counted once a page load, nothing without the counter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addAnalytics, addAnalyticsToSite } from '../scripts/site-analytics.mjs';
import { countEvent, EVENTS } from '../web/js/analytics.js';

const PAGE = '<!doctype html><html><head></head><body><div id="app"></div><script>/* </body> in a string */</script></body></html>';

test('addAnalytics: GoatCounter\'s loader before the last </body>, once; only on *.github.io; a code is checked', () => {
  const out = addAnalytics(PAGE, 'silinx');
  assert.match(out, /<script id="silinx-site-analytics">[\s\S]*https:\/\/silinx\.goatcounter\.com\/count[\s\S]*<\/script>\n<\/body><\/html>$/);
  assert.match(out, /if \(\/\\\.github\\\.io\$\/\.test\(location\.hostname\)\)/);
  assert.equal(addAnalytics(out, 'silinx'), out, 'once');
  for (const bad of ['', 'Silinx', 'a.b', 'x"><script>', '-x']) assert.throws(() => addAnalytics(PAGE, bad), /not a GoatCounter code/);
  assert.throws(() => addAnalytics('<html></html>', 'silinx'), /no <\/body>/);
});

test('addAnalyticsToSite: index.html of the root and of dev/, not the downloaded Silinx-ISE.html nor the assets', () => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-site-'));
  try {
    for (const f of ['index.html', 'Silinx-ISE.html', 'dev/index.html', 'dev/Silinx-ISE.html', 'assets/x/index.html']) {
      fs.mkdirSync(path.dirname(path.join(site, f)), { recursive: true });
      fs.writeFileSync(path.join(site, f), PAGE);
    }
    assert.deepEqual(addAnalyticsToSite(site, 'silinx').sort(), ['dev/index.html', 'index.html']);
    const has = f => fs.readFileSync(path.join(site, f), 'utf8').includes('goatcounter');
    assert.deepEqual(['index.html', 'dev/index.html', 'Silinx-ISE.html', 'dev/Silinx-ISE.html', 'assets/x/index.html'].map(has), [true, true, false, false, false]);
  } finally { fs.rmSync(site, { recursive: true, force: true }); }
});

test('countEvent: nothing without the counter; a known event once a page load, with its title; never an unknown one', () => {
  delete globalThis.goatcounter;
  assert.doesNotThrow(() => countEvent('simulate'));
  const sent = [];
  globalThis.goatcounter = { count: e => sent.push(e) };
  try {
    countEvent('simulate'); countEvent('simulate'); countEvent('bitstream'); countEvent('src/top.vhd');
    assert.deepEqual(sent, [
      { path: 'event/simulate', title: EVENTS.simulate, event: true },
      { path: 'event/bitstream', title: 'Bitstream generated', event: true },
    ]);
    globalThis.goatcounter = { count: () => { throw new Error('blocked'); } };
    assert.doesNotThrow(() => countEvent('program'));
  } finally { delete globalThis.goatcounter; }
});
