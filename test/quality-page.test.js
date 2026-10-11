// docs/QUALITY.md, the comparison of the Silinx toolchain's circuits with ISE's on the design corpus
// (test/designs-corpus/compare-ise.mjs): the page's summary and tables from the results, and the
// committed page is the one its committed results give.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { qualityPage } from './designs-corpus/quality-page.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('quality page: summary (geometric means, counts), size and speed tables, designs not built', () => {
  const page = qualityPage({
    generatedAt: '2026-10-11T12:00:00Z', silinxVersion: '9.9.9', isePeriodNs: 5, notBuilt: ['neorv32'],
    designs: [
      { name: 'a', silinx: { slices: 50, luts: 80, ffs: 10, srl16: 1, bram: 0, mult: 0, periodNs: 10, estimateNs: 10.2 }, ise: { slices: 100, luts: 100, ffs: 12, srl16: 2, bram: 0, mult: 0, periodNs: 8 } },
      { name: 'b', silinx: { slices: 200, luts: 125, ffs: 20, srl16: 0, bram: 1, mult: 2, periodNs: 8, estimateNs: 8.1 }, ise: { slices: 100, luts: 100, ffs: 20, srl16: 0, bram: 1, mult: 2, periodNs: 8 } },
      { name: 'c', silinx: { error: 'ERROR:Silinx - no room' }, ise: { slices: 10, luts: 12, ffs: 3, srl16: 0, bram: 0, mult: 0, periodNs: 5 } },
      { name: 'd', silinx: { slices: 5 }, ise: { error: 'ERROR:HDLCompilers:26 - "x.v" line 1 unexpected token: \'$clog2\'' } },
    ],
  });
  assert.match(page, /^# Quality of the Silinx toolchain against Xilinx ISE$/m);
  assert.match(page, /Measured 2026-10-11 \(Silinx 9\.9\.9, ISE 14\.7\)/);
  // LUTs 0.8 and 1.25: geometric mean 1 (+0%); FFs 10/12 and 1; slices 0.5 and 2; periods 1.25 and 1: +12%
  assert.match(page, /tightened to\n5 ns/);
  assert.match(page, /- \*\*Size:\*\* 2 designs built by both\. Logic LUTs: Silinx \+0% against ISE; flip-flops\n  −9%; slices \+0%/);
  assert.match(page, /needs as few LUTs or fewer on 1 of 2\./);
  assert.match(page, /- \*\*Speed:\*\* 2 designs timed by both\. Critical path: Silinx \+12% against ISE/);
  assert.match(page, /Silinx is as fast or faster on 1 of 2\./);
  assert.ok(page.includes('| a | 80 | 100 | 0.80 | 10 | 12 | 50 | 100 | 1 / 2 | 0 / 0 | 0 / 0 |'), page);
  assert.ok(page.includes('| b | 125 | 100 | 1.25 | 20 | 20 | 200 | 100 | 0 / 0 | 1 / 1 | 2 / 2 |'));
  assert.ok(page.includes('| c | – | 12 | – |'));
  assert.ok(page.includes('| a | 10.00 | 8.00 | 1.25 | 10.20 |'));
  assert.ok(page.includes('- c, Silinx: `ERROR:Silinx - no room`'));
  assert.match(page, /- neorv32: Silinx cannot read or synthesize it yet/);
  // a message with a backtick in it: a code span with double backticks
  assert.ok(qualityPage({ generatedAt: '2026-10-11', designs: [{ name: 'e', silinx: {}, ise: { error: 'ERROR:HDLCompilers:26 - Macro reference `assert is not defined' } }] })
    .includes('- e: XST cannot read it (`` ERROR:HDLCompilers:26 - Macro reference `assert is not defined ``); Silinx reads it.'));
  assert.match(page, /- \*\*Reading the design:\*\* XST \(ISE 14\.7's synthesis, from 2013\) cannot read 1 of the designs/);
  assert.ok(page.includes("- d: XST cannot read it (`ERROR:HDLCompilers:26 - \"x.v\" line 1 unexpected token: '$clog2'`); Silinx reads it."));
});

test('quality page: docs/QUALITY.md is the page of test/designs-corpus/ise-comparison.json', () => {
  const res = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/designs-corpus/ise-comparison.json'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(ROOT, 'docs/QUALITY.md'), 'utf8'), qualityPage(res), 'regenerate it: node test/designs-corpus/compare-ise.mjs --report');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/designs-corpus/manifest.json'), 'utf8'));
  // every design of the corpus is either compared or listed as not built
  assert.deepEqual([...res.designs.map(d => d.name), ...(res.notBuilt || [])].sort(), manifest.designs.map(d => d.name).sort());
});
