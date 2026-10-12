// The page for users of the comparison of the Silinx toolchain with ISE (docs/QUALITY.md), from the
// results of test/designs-corpus/compare-ise.mjs (ise-comparison.json).
const fmt = (v, d = 0) => (v == null ? '–' : typeof v === 'number' ? v.toFixed(d) : String(v));
const ratio = (a, b) => (a != null && b ? a / b : null);
const geomean = xs => (xs.length ? Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length) : null);
const pct = g => (g == null ? '–' : `${g >= 1 ? '+' : '−'}${Math.abs((g - 1) * 100).toFixed(0)}%`);
const XST_CANNOT = /^ERROR:(HDL|Xst)/;
// a Markdown code span, also of a text with backticks in it
const code = t => (t.includes('`') ? `\`\` ${t} \`\`` : `\`${t}\``);

export function qualityPage(res) {
  const rows = res.designs;
  const both = rows.filter(r => r.silinx?.luts && r.ise?.luts);
  const packed = rows.filter(r => r.silinx?.slices && r.ise?.slices);
  const timed = rows.filter(r => r.silinx?.periodNs && r.ise?.periodNs);
  const gLuts = geomean(both.map(r => r.silinx.luts / r.ise.luts));
  const gFfs = geomean(both.filter(r => r.silinx.ffs && r.ise.ffs).map(r => r.silinx.ffs / r.ise.ffs));
  const gSlices = geomean(packed.map(r => r.silinx.slices / r.ise.slices));
  const gPeriod = geomean(timed.map(r => r.silinx.periodNs / r.ise.periodNs));
  const xstCannot = rows.filter(r => XST_CANNOT.test(r.ise?.error || '')).length;
  const smaller = both.filter(r => r.silinx.luts <= r.ise.luts).length;
  const faster = timed.filter(r => r.silinx.periodNs <= r.ise.periodNs).length;
  const L = [];
  L.push('# Quality of the Silinx toolchain against Xilinx ISE', '');
  L.push('How small and how fast are the circuits the Silinx toolchain generates (Yosys synthesis, Silinx\'s',
    'pack, place and route), against Xilinx ISE 14.7 (XST, map, par) on the same designs? The designs are',
    'the open-source ones of the [design corpus](../test/designs-corpus/README.md) (CPUs, peripherals,',
    'crypto, benchmarks), each built by both flows for the same chip, the XC3S1200E-FG320 (Nexys2-1200),',
    'with the same top (a design with more ports than the package has pins goes through the same I/O',
    'wrapper in both).', '');
  L.push(`Measured ${res.generatedAt.slice(0, 10)} (Silinx ${res.silinxVersion}, ISE 14.7), with`,
    '`test/designs-corpus/compare-ise.mjs`. ISE is given its best chance: its map packs the slices as',
    `tightly as it can (\`-c 1\`, as Silinx's packer always does) and the clock constraint is tightened to`,
    `${res.isePeriodNs ?? 5} ns, so that its place and route works for speed (ISE stops improving once a constraint`,
    'is met; the Silinx toolchain always places and routes for speed).', '');
  L.push('## Summary', '');
  L.push(`- **Size:** ${both.length} designs built by both. Logic LUTs: Silinx ${pct(gLuts)} against ISE; flip-flops`,
    `  ${pct(gFfs)}; slices ${pct(gSlices)} (geometric means of the ratios; below 0: Silinx is smaller). Silinx`,
    `  needs as few LUTs or fewer on ${smaller} of ${both.length}.`);
  L.push(`- **Speed:** ${timed.length} designs timed by both. Critical path: Silinx ${pct(gPeriod)} against ISE`,
    `  (above 0: Silinx is slower); Silinx is as fast or faster on ${faster} of ${timed.length}. Both critical`,
    '  paths are measured by ISE\'s timing analyser (trce) on the routed design.');
  if (xstCannot) L.push(`- **Reading the design:** XST (ISE 14.7's synthesis, from 2013) cannot read ${xstCannot} of the designs (\`$clog2\`, VHDL-2008`,
    '  and other constructs it predates, listed below); Silinx reads them.');
  L.push('- The Silinx toolchain is experimental: these numbers are tracked to improve it (the GitHub',
    '  [issues](https://github.com/pmnmalo/Silinx-ISE/issues) labelled *synthesis* and *place & route*).', '');
  L.push('## Size', '');
  L.push('4-input LUTs used as logic (not the LUTs a route passes through), flip-flops and occupied slices',
    'after packing / map; SRL16 shift registers, block RAMs and multipliers. *S / I*: Silinx / ISE, the',
    'ratio of logic LUTs (below 1: Silinx is smaller).', '');
  L.push('| design | LUTs Silinx | LUTs ISE | S / I | FFs Silinx | FFs ISE | slices Silinx | slices ISE | SRL16 S / I | RAMB16 S / I | MULT S / I |');
  L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    const s = r.silinx || {}, i = r.ise || {};
    L.push(`| ${r.name} | ${fmt(s.luts)} | ${fmt(i.luts)} | ${fmt(ratio(s.luts, i.luts), 2)} | ${fmt(s.ffs)} | ${fmt(i.ffs)} | ${fmt(s.slices)} | ${fmt(i.slices)} | ${fmt(s.srl16)} / ${fmt(i.srl16)} | ${fmt(s.bram)} / ${fmt(i.bram)} | ${fmt(s.mult)} / ${fmt(i.mult)} |`);
  }
  L.push('', '## Speed', '');
  L.push('The critical path of the routed design (the minimum clock period, or the longest path of a',
    'design without a clock; ns, shorter is faster), both by ISE\'s trce. *Silinx estimate*: Silinx\'s own',
    'timing analysis (what its Design Summary shows).', '');
  L.push('| design | Silinx (trce) | ISE (trce) | S / I | Silinx estimate |');
  L.push('|---|---:|---:|---:|---:|');
  for (const r of rows) {
    const s = r.silinx || {}, i = r.ise || {};
    if (!s.periodNs && !i.periodNs && !s.estimateNs) continue;
    L.push(`| ${r.name} | ${fmt(s.periodNs, 2)} | ${fmt(i.periodNs, 2)} | ${fmt(ratio(s.periodNs, i.periodNs), 2)} | ${fmt(s.estimateNs, 2)} |`);
  }
  const notes = rows.filter(r => r.silinx?.error || r.ise?.error);
  if (notes.length || res.notBuilt?.length) {
    L.push('', '## Not built by one of the flows', '');
    for (const r of notes) {
      if (r.silinx?.error) L.push(`- ${r.name}, Silinx: ${code(r.silinx.error)}`);
      if (r.ise?.error) L.push(XST_CANNOT.test(r.ise.error) ? `- ${r.name}: XST cannot read it (${code(r.ise.error)}); Silinx reads it.` : `- ${r.name}, ISE: ${code(r.ise.error)}`);
    }
    if (res.notBuilt?.length) L.push(`- ${res.notBuilt.join(', ')}: Silinx cannot read or synthesize ${res.notBuilt.length > 1 ? 'them' : 'it'} yet (the design corpus's [results](../test/designs-corpus/README.md)), so neither flow was compared.`);
  }
  L.push('', '## How it is measured', '');
  L.push('`node test/designs-corpus/run.mjs --stages frontend,synth,flow --sizes <dir>` writes a Silinx',
    'project per design; `node test/designs-corpus/compare-ise.mjs <dir>` builds each with both flows (ISE',
    'from its Docker image, both flows on the same machine) and writes `test/designs-corpus/ise-comparison.json`',
    'and this page. It runs every week on a self-hosted runner with ISE (`.github/workflows/quality.yml`),',
    'which commits the new results, and by hand (Actions ▸ Quality ▸ Run workflow). The corpus\'s nightly',
    'run checks the Silinx toolchain on every design without ISE.', '');
  return L.join('\n');
}
