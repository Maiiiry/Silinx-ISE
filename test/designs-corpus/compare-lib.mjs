// Helpers of compare-ise.mjs (the Silinx toolchain against ISE on the design corpus), without its
// side effects, for the tests (test/quality-page.test.js).

// the first specific error (ERROR:Silinx - …, ERROR:Pack:…), not the run's summary line (ERROR: …);
// without one, the run's last lines before its summary (an exception, a crash: what happened)
export function lastError(job) {
  const lines = job.lines || [];
  const specific = lines.find(l => /^ERROR:\S/.test(l));
  if (specific) return specific.replace(/\s+/g, ' ').slice(0, 160);
  const k = lines.findIndex(l => /^ERROR: /.test(l));
  const before = (k >= 0 ? lines.slice(0, k) : lines).filter(l => l.trim() && !/^(===|INFO:)/.test(l)).slice(-2).join(' / ');
  const summary = (k >= 0 ? lines[k] : job.error) || '';
  return (before ? `${summary} (${before})` : summary || 'failed').replace(/\s+/g, ' ').slice(0, 240);
}

/** The designs built before (no error on a side) that fail now on that side: ['name (Silinx): error', …]. */
export function newFailures(before, now) {
  const old = new Map((before?.designs || []).map(d => [d.name, d]));
  const out = [];
  for (const d of now.designs || []) {
    const o = old.get(d.name);
    if (!o) continue;
    for (const [side, label] of [['silinx', 'Silinx'], ['ise', 'ISE']]) {
      if (o[side] && !o[side].error && d[side]?.error) out.push(`${d.name} (${label}): ${d[side].error}`);
    }
  }
  return out;
}

/** The clocks' periods of ise-open-check.sh's "clocks:" line ('$iopadmap$clk=7.352 …'): { net: ns }. */
export function parseClocks(text) {
  const out = {};
  for (const m of String(text).matchAll(/(\S+)=([\d.]+)/g)) out[m[1]] = +m[2];
  return out;
}

/**
 * The period of Silinx's routing to set against ISE's (#53): ISE's flow times the clocks the UCF's
 * PERIOD constrains (only them: an unconstrained clock is not analysed), so the period of such a clock
 * in trce -a's analysis of Silinx's routing (its net named after the port: '$iopadmap$<port>' or
 * '<port>'), else `worst` (trce's 'Minimum period': the worst clock). ucf: the project's UCF text.
 */
export function constrainedPeriod(clocks, ucf, worst) {
  const text = String(ucf || '');
  const periods = new Set([...text.matchAll(/PERIOD\s+"?([^"\s;]+)"?/gi)].map(m => m[1].toLowerCase()));
  const nets = [...text.matchAll(/^\s*NET\s+"([^"]+)"\s+TNM_NET\s*=\s*"?([^";\s]+)"?\s*;/gim)]
    .filter(m => periods.has(m[2].toLowerCase())).map(m => m[1].toLowerCase());
  const found = Object.entries(clocks || {}).filter(([net]) => nets.includes(net.replace(/^\$iopadmap\$/, '').toLowerCase())).map(([, ns]) => ns);
  return found.length ? Math.max(...found) : worst;
}
