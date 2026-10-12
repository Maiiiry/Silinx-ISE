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
