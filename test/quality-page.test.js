// docs/QUALITY.md, the comparison of the Silinx toolchain's circuits with ISE's on the design corpus
// (test/designs-corpus/compare-ise.mjs): the page's summary and tables from the results, and the
// committed page is the one its committed results give.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { qualityPage } from './designs-corpus/quality-page.mjs';
import { lastError, newFailures, parseClocks, constrainedPeriod } from './designs-corpus/compare-lib.mjs';

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
  // (with the EPFL benchmarks against the best-known LUT-6 results, research/epfl-records, #367)
  const epfl = { records: JSON.parse(fs.readFileSync(path.join(ROOT, 'research/epfl-records/records.json'), 'utf8')), results: JSON.parse(fs.readFileSync(path.join(ROOT, 'research/epfl-records/results.json'), 'utf8')) };
  assert.equal(fs.readFileSync(path.join(ROOT, 'docs/QUALITY.md'), 'utf8'), qualityPage(res, { epfl }), 'regenerate it: node test/designs-corpus/compare-ise.mjs --report');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/designs-corpus/manifest.json'), 'utf8'));
  // every design of the corpus is either compared, listed as not built, or added after the comparison (#366)
  assert.deepEqual([...res.designs.map(d => d.name), ...(res.notBuilt || []), ...(res.pending || [])].sort(), manifest.designs.map(d => d.name).sort());
});

test('compare-ise: the error of a failed run says what happened, not only "see the messages above"', () => {
  assert.equal(lastError({ lines: ['=== SILINX STEP par ===', 'ERROR:Silinx - 4 net(s) cannot be routed', 'ERROR: Silinx toolchain failed: see the messages above.'] }), 'ERROR:Silinx - 4 net(s) cannot be routed');
  assert.equal(lastError({ lines: ['=== SILINX STEP map ===', 'Packing 7662 slices', 'RangeError: Array buffer allocation failed', 'ERROR: Silinx toolchain failed: see the messages above.'] }),
    'ERROR: Silinx toolchain failed: see the messages above. (Packing 7662 slices / RangeError: Array buffer allocation failed)');
  assert.equal(lastError({ lines: [], error: 'killed' }), 'killed');
  assert.equal(lastError({ lines: [] }), 'failed');
});

test('compare-ise --guard: a design built before that fails now is not published', () => {
  const before = { designs: [{ name: 'aes', silinx: { slices: 7662 }, ise: { error: 'ERROR:Xst:1468' } }, { name: 't80', silinx: { slices: 1539 }, ise: { slices: 1000 } }] };
  const now = { designs: [{ name: 'aes', silinx: { error: 'out of memory' }, ise: { error: 'ERROR:Xst:1468' } }, { name: 't80', silinx: { slices: 1540 }, ise: { error: 'timeout' } }, { name: 'new', silinx: { error: 'x' } }] };
  assert.deepEqual(newFailures(before, now), ['aes (Silinx): out of memory', 't80 (ISE): timeout']);
  assert.deepEqual(newFailures(before, before), []);
  assert.deepEqual(newFailures(null, now), []);
});

// #53: ISE's flow times only the clocks the UCF constrains; Silinx's routing is timed by trce -a, every
// clock: the period set against ISE's is that of the constrained clock (vtr-stereovision3: its board
// clock tm3_clk_v0, 4.996 ns, against ISE's 4.916; its other clock, tm3_clk_v2, 7.352 ns, is not in ISE's)
test('ISE comparison: the period of the clock the UCF constrains, not of the worst clock (#53)', () => {
  const clocks = parseClocks('$iopadmap$tm3_clk_v2=7.352 $iopadmap$tm3_clk_v0=4.996 ');
  assert.deepEqual(clocks, { '$iopadmap$tm3_clk_v2': 7.352, '$iopadmap$tm3_clk_v0': 4.996 });
  const ucf = `# the clock on the Basys2's oscillator (generated by test/designs-corpus)
NET "tm3_clk_v0" LOC = "B8" ;
NET "tm3_clk_v0" CLOCK_DEDICATED_ROUTE = FALSE ;
NET "tm3_clk_v0" TNM_NET = "tm3_clk_v0" ;
TIMESPEC "TS_tm3_clk_v0" = PERIOD "tm3_clk_v0" 20 ns HIGH 50% ;
`;
  assert.equal(constrainedPeriod(clocks, ucf, 7.352), 4.996);
  // a net named as the port, other names of the time group, case
  assert.equal(constrainedPeriod({ clk: 6.1, other: 9 }, 'NET "CLK" TNM_NET = "sys";\nTIMESPEC "TS_sys" = PERIOD "sys" 20 ns HIGH 50%;', 9), 6.1);
  // no PERIOD, a time group without one, a clock not found: the worst
  assert.equal(constrainedPeriod(clocks, '', 7.352), 7.352);
  assert.equal(constrainedPeriod(clocks, 'NET "tm3_clk_v0" TNM_NET = "g";', 7.352), 7.352);
  assert.equal(constrainedPeriod({ '$iopadmap$a': 3 }, ucf, 7.352), 7.352);
  assert.deepEqual(parseClocks(''), {});
});

// #366: designs added to the corpus after the weekly comparison ran are listed as such, not as not built
test('quality page: the designs added after the comparison (pending) have their own section', () => {
  const page = qualityPage({ generatedAt: '2026-10-17', designs: [], notBuilt: ['x'], pending: ['epfl-sin', 'itc99-b01'] });
  assert.match(page, /^## Added after this comparison\n\nepfl-sin, itc99-b01: added to the design corpus after this comparison was run; the next weekly run compares them too\.$/m);
  assert.match(page, /^- x: Silinx cannot read or synthesize it yet/m);
  assert.doesNotMatch(qualityPage({ generatedAt: '2026-10-17', designs: [] }), /Added after this comparison/);
});
