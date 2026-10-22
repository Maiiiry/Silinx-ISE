// The Test Bench Wizard's vectors page (#405: out of testBenchWizard in tbwizard.js): the table of the test vectors,
// one row per vector (the inputs, the drive of each bidirectional port, the expected values), Fill Expected from
// Current Design (a simulation of the design), and the vectors as bits for the generator.
import { MAX_VECTORS, expectedFromTrace, generateTestbench, parseDrive, parseValue, showValue } from '/core/testbench.js';
import { alertDlg, h } from './ui.js';
import { primitiveSources } from '/core/unisim.js';
import { simulate } from '/core/compile.js';
import { designSources } from './tbwizard.js';

const SHOWN_ROWS = 512;   // rows of the vector table shown at once (the rest is kept, not displayed)

/** { p4, tbOpts, vectorsBits } of testBenchWizard (ins(), ios(), outs(), ports(), rows(), uut(): its current values). */
export function mountVectorsPage(ctx) {
  const {
    chk, ins, ios, lang, outs, ports, rows, st, tbName, uut
  } = ctx;

  // ---------------------------------------------------------------- page 4: vectors and expected values
  const tblHost = h('div', { class: 'tbw-table', style: { maxHeight: '330px', overflow: 'auto', border: '1px solid var(--frame)', marginTop: '6px' } });
  const vecNote = h('div', { class: 'hint' });
  const busy = h('span', { class: 'hint', style: { marginLeft: '8px' } });
  const isZ = t => !String(t ?? '').trim() || /^z+$/i.test(String(t).trim());
  const cell = (row, side, p) => {
    row[side] ||= {};
    const inp = h('input', { type: 'text', class: `tbw-cell tbw-${side}`, 'data-port': p.name, value: row[side][p.name] ?? '', placeholder: side === 'exp' ? '–' : side === 'drv' ? 'Z' : '0'.repeat(Math.min(p.width, 8)), style: { width: `${Math.max(3, Math.min(p.width, 16)) + 2}ch`, fontFamily: 'var(--mono, monospace)' } });
    // a released bidirectional port (Z / empty): the design drives the bus in this vector
    const tint = () => { if (side === 'drv') inp.style.background = isZ(inp.value) ? 'var(--release-bg)' : 'var(--drive-bg)'; };
    tint();
    inp.addEventListener('input', () => { row[side][p.name] = inp.value; inp.classList.remove('bad'); tint(); });
    return inp;
  };
  const renderTable = () => {
    tblHost.innerHTML = '';
    const t = h('table', { class: 'grid' });
    t.append(h('tr', {}, h('th', {}, '#'), ...ins().map(p => h('th', { title: 'input' }, p.name)),
      ...ios().map(p => h('th', { title: 'bidirectional: the value the bench drives on the bus; Z or empty = released (the design drives it)', class: 'th-drive' }, `${p.name} (drive)`)),
      ...outs().map(p => h('th', { title: 'expected output', class: 'th-expected' }, `${p.name} (expected)`)),
      ...ios().map(p => h('th', { title: 'bidirectional: the value expected on the bus', class: 'th-expected' }, `${p.name} (expected)`)), h('th', {}, '')));
    rows().slice(0, SHOWN_ROWS).forEach((row, k) => {
      const del = h('button', { class: 'tb-btn', title: 'Delete this vector', onclick: () => { rows().splice(k, 1); renderTable(); } }, '×');
      t.append(h('tr', {}, h('td', {}, String(k)), ...ins().map(p => h('td', {}, cell(row, 'in', p))), ...ios().map(p => h('td', {}, cell(row, 'drv', p))),
        ...chk().map(p => h('td', {}, cell(row, 'exp', p))), h('td', {}, del)));
    });
    tblHost.append(t);
    const nexp = rows().filter(r => chk().some(p => String(r.exp[p.name] ?? '').trim())).length;
    vecNote.textContent = `${rows().length} vector(s)${rows().length > SHOWN_ROWS ? ` (the first ${SHOWN_ROWS} shown)` : ''}, ${nexp} with expected values. Values: binary 0101, hex 0x1F, decimal d12 (or 12: only 0s and 1s read as binary); - or x = bit not checked; an empty expected value is not checked.`;
    ioHint.textContent = ios().length ? 'Bidirectional ports: the drive column is the value the bench puts on the bus (it drives it like an input); Z or empty releases the bus, so that the design can drive it. The expected column is the value read on the bus, checked like an output.' : '';
    ioHint.style.display = ios().length ? '' : 'none';
  };
  const ioHint = h('div', { class: 'hint tbw-iohint' });
  // the vectors as bits; throws with the first bad cell
  const vectorsBits = ({ withExp = true } = {}) => rows().map((r, k) => {
    const v = { in: {}, exp: {} };
    for (const p of ins()) {
      let b;
      try { b = parseValue(r.in[p.name], p.width); } catch (e) { throw new Error(`vector ${k}, input ${p.name}: ${e.message}`); }
      if (b != null && /-/.test(b)) throw new Error(`vector ${k}, input ${p.name}: an input cannot be '-'`);
      v.in[p.name] = b ?? '0'.repeat(p.width);
    }
    v.drv = {};
    for (const p of ios()) {
      try { v.drv[p.name] = parseDrive(r.drv?.[p.name], p.width); } catch (e) { throw new Error(`vector ${k}, ${p.name} (drive): ${e.message}`); }
    }
    if (withExp) {
      for (const p of chk()) {
        try { v.exp[p.name] = parseValue(r.exp[p.name], p.width); } catch (e) { throw new Error(`vector ${k}, expected ${p.name}: ${e.message}`); }
      }
    }
    return v;
  });
  const tbOpts = (vectors, extra = {}) => ({
    name: tbName.value.trim(), lang: lang.value, uut: { name: uut().name, params: [] }, ports: ports(), vectors,
    clock: st.clock ? { port: st.clock, periodNs: st.period } : null,
    reset: st.reset ? { port: st.reset, active: st.active, cycles: st.cycles } : null,
    settleNs: st.settle, ...extra,
  });
  // expected values = what the current design does (a regression test)
  const fillFromDesign = async () => {
    let vectors;
    try { vectors = vectorsBits({ withExp: false }); } catch (e) { return alertDlg('Test Bench Wizard', e.message, 'error'); }
    busy.textContent = 'Simulating the current design…';
    await new Promise(r => setTimeout(r, 20));
    try {
      const name = `${tbName.value.trim()}_trace`;
      const text = generateTestbench(tbOpts(vectors, { name, trace: true }));
      const tb = { path: `${name}.${lang.value === 'vhdl' ? 'vhd' : 'v'}`, lang: lang.value, text };
      const r = simulate([...primitiveSources([...designSources(), tb]), ...designSources(), tb], name, { until: 1e15 });
      if (r.errors.length) throw new Error(r.errors.slice(0, 3).map(e => `${e.file}:${e.line} ${e.message}`).join('\n'));
      const exp = expectedFromTrace(r.sim.log.map(l => l.text), chk(), rows().length);
      if (exp.some(e => !e)) throw new Error('the simulation did not reach every vector');
      rows().forEach((row, k) => { for (const p of chk()) row.exp[p.name] = showValue(exp[k][p.name], p.width); });
      busy.textContent = 'Expected values filled in from the current design: check them!';
      renderTable();
    } catch (e) {
      busy.textContent = '';
      alertDlg('Test Bench Wizard', `Cannot simulate the design: ${e.message}`, 'error');
    }
  };
  const p4 = {
    title: 'Vectors and Expected Outputs',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'One row per test vector: the inputs to apply and the outputs expected. Fill the expected values in by hand (what the design should do), or take them from a simulation of the current design (it then becomes a regression test: check them).'),
      h('div', { style: { marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
        h('button', { class: 'btn', onclick: () => fillFromDesign() }, 'Fill Expected from Current Design'),
        h('button', { class: 'btn', onclick: () => { rows().forEach(r => { r.exp = {}; }); busy.textContent = ''; renderTable(); } }, 'Clear Expected'),
        h('button', { class: 'btn', onclick: () => { if (rows().length < MAX_VECTORS) { rows().push({ in: {}, drv: {}, exp: {} }); renderTable(); tblHost.scrollTop = tblHost.scrollHeight; } } }, 'Add Vector'),
        busy),
      tblHost, vecNote, ioHint),
    onShow: () => renderTable(),
    validate: () => {
      if (!rows().length) return 'Add at least one vector.';
      try { vectorsBits(); } catch (e) { return e.message; }
      return null;
    },
  };

  return { p4, tbOpts, vectorsBits };
}
