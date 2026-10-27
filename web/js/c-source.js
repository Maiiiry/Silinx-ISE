// Silinx C in the app (#1531): a C source is a module of the project whose HDL is made in memory from its top function
// (core/view-hdl.js); its Design row has the C as its base and its HDL, generated from it, shown read-only here.
import { h } from './dom.js';
import { S, findDoc, closeDoc, openDoc, openFile } from './app.js';
import { createEditor } from './editor.js';
import { icons } from './icons.js';
import { log, showConsolePage } from './console.js';

export const isC = (p) => /\.c$/i.test(p || '');

/** The HDL made from a C source, read-only, in a document of its own (made again when it is opened again). */
export function openCHdl(path) {
  const src = S.sources.find((s) => s.view && s.path === path);
  const id = `chdl:${path}`;
  const old = findDoc(id);
  if (old) closeDoc(old);
  const lang = src?.lang === 'verilog' ? 'verilog' : 'vhdl';
  const name = `${src?.module || path.split('/').pop().replace(/\.c$/i, '')}.${lang === 'verilog' ? 'v' : 'vhd'}`;
  return openDoc({
    id, title: name, tooltip: `${name}, generated from ${path}`, icon: lang,
    create(el, d) {
      const link = h('a', { onclick: () => openFile(path) }, path.split('/').pop());
      const bar = h('div', { class: 'editor-bar' }, h('span', { class: 'path' }, name), h('span', { class: 'gen-banner read-only' }, 'Read-only, generated from ', link));
      const host = h('div', { class: 'editor-host' });
      el.append(bar, host);
      d.editor = createEditor(host, { text: src?.text || '', lang, path: name, readOnly: true });
      return { lang, destroy: () => d.editor.destroy() };
    },
  });
}

/** A C module's badges on its Design row: the C (its base, opened) and its HDL (generated from it, read-only). */
export function cBadges(file, lang, context) {
  return [
    { text: 'C', base: true, title: 'Open', open: () => openFile(file), context },
    { text: lang === 'verilog' ? 'Verilog' : 'VHDL', base: false, title: 'Generated from the C', open: () => openCHdl(file), context },
  ];
}

// ------------------------------------------------------------------ C simulation and C/RTL co-simulation (#1528)
const text = async (path) => { const d = findDoc(`file:${path}`); if (d?.editor) return d.editor.getValue(); return (await import('./api.js')).api.readFile(S.project.name, path); };
const hdlLang = () => (S.project?.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');

/** C Simulation: the C source's main() run (core/c-interp.js), its output in the Console. */
export async function runCSimulation(path) {
  const { simulateC } = await import('/core/c-interp.js');
  log(`\nStarted : "C Simulation" of ${path}.\n`, 'hdr');
  showConsolePage('console');
  const r = simulateC(await text(path), { file: path });
  if (r.output) for (const l of r.output.replace(/\n$/, '').split('\n')) log(l);
  if (!r.ok) {
    const why = r.error ? `line ${r.error.line}: ${r.error.message}` : r.diagnostics.filter((d) => d.severity === 'error').map((d) => `line ${d.line}: ${d.message}`).join('; ');
    log(`ERROR:SilinxC - "${path}" ${why}`, 'err');
    log('\nProcess "C Simulation" failed', 'err', { diag: false });
    return false;
  }
  log(`main() returned ${r.exitCode}; ${r.calls.length} call(s) of '${r.top || '?'}'.`);
  log('\nProcess "C Simulation" completed successfully', 'ok');
  return true;
}

/** C/RTL Co-simulation: the test bench's calls of the top function replayed on its HDL (core/c-cosim.js), compared. */
export async function runCosimulation(path) {
  const { cosimulate } = await import('/core/c-cosim.js');
  const lang = hdlLang();
  log(`\nStarted : "C/RTL Co-simulation" of ${path} (${lang === 'vhdl' ? 'VHDL' : 'Verilog'}).\n`, 'hdr');
  showConsolePage('console');
  const r = cosimulate(await text(path), { file: path, lang });
  for (const e of r.errors) log(`ERROR:SilinxC - "${path}" ${e}`, 'err');
  if (!r.ok || r.errors.length) { log('\nProcess "C/RTL Co-simulation" failed', 'err', { diag: false }); return false; }
  log(`C simulation: ${r.calls} call(s) of '${r.gen.top}' replayed on its ${lang === 'vhdl' ? 'VHDL' : 'Verilog'}.`);
  if (r.latency) log(`Latency: ${r.latency.min} to ${r.latency.max} cycles (average ${r.latency.avg.toFixed(1)}).`);
  for (const m of r.mismatches.slice(0, 20)) log(`ERROR:SilinxC - call ${m.call ?? '-'}, ${m.port}: the C gives ${m.expected}, the HDL ${m.got ?? 'X'}`, 'err');
  if (r.mismatches.length > 20) log(`… ${r.mismatches.length - 20} more mismatch(es)`, 'err');
  if (!r.pass) { log(`\nC/RTL co-simulation FAIL: ${r.mismatches.length} mismatch(es)`, 'err'); log('\nProcess "C/RTL Co-simulation" failed', 'err', { diag: false }); return false; }
  log(`\nC/RTL co-simulation PASS: ${r.calls} call(s), the same results`, 'ok');
  log('\nProcess "C/RTL Co-simulation" completed successfully', 'ok');
  return true;
}

/** The C editor's buttons: C Simulation, C/RTL Co-simulation. */
export function cRunButtons(path) {
  const b = (label, title, fn) => h('button', { class: 'btn', style: { minWidth: '0' }, title, onclick: () => fn(path) }, h('span', { class: 'ico-inline', html: icons.wave }), ` ${label}`);
  return [b('C Simulation', "Run the test bench, main()", runCSimulation), b('C/RTL Co-simulation', "Replay main()'s calls of the top function on its HDL and compare", runCosimulation)];
}
