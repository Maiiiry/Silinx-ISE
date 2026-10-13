// The HDL of a source drawn as a schematic (.sch.json), an ASM chart (.asm.json), a state diagram
// (.fsm.json) or a truth table (.tt.json) that has no HDL file of its own (#177): made in memory when
// the project is compiled, simulated or implemented, so that such a source is a module of the
// project like an HDL one (it can be the top, be instanced, be synthesized) without a file.
// A source kept in sync with an HDL file (its generatedFile) is that file: nothing here.
import { generateHdl } from './schdoc.js';
import { generate as generateAsm, validate as validateAsm } from './asm.js';
import { generateFsm, fsmErrors, normalizeFsm } from './fsm.js';
import { generateTableHdl, validateTable, normalizeTable } from './logic.js';

export const VIEW_RE = /\.(sch|asm|fsm|tt)\.json$/i;
export const isView = path => VIEW_RE.test(String(path || ''));

/**
 * One source's HDL: { path, lang, text, module, errors: [message] } (path: the source's own, so that the
 * messages point at it), or null when it is kept in sync with an HDL file, or not a drawn source.
 * modules: the project's modules (the schematics' module symbols).
 */
export function viewHdl(path, text, { modules = {} } = {}) {
  if (!isView(path)) return null;
  let m;
  try { m = JSON.parse(text); } catch (e) { return { path, lang: 'vhdl', text: '', module: null, errors: [`${path}: ${e.message}`] }; }
  if (m.generatedFile) return null;
  const kind = VIEW_RE.exec(path)[1].toLowerCase();
  const lang = m.lang === 'verilog' ? 'verilog' : 'vhdl';
  const out = (code, errors = []) => {
    const module = /^\s*(?:entity|module)\s+([A-Za-z_][\w$]*)/m.exec(String(code).replace(/^(?:--|\/\/) silinx-symbol[\s\S]*?\n(?=\s*(?:--|\/\/) Generated)/, ''))?.[1] || m.name || null;
    return { path, lang, text: code, module, errors };
  };
  try {
    if (kind === 'sch') {
      const g = generateHdl(m, { lang, modules });
      const top = g.filename.replace(/\.(vhd|v)$/, '');
      return { path, lang, text: g.code, module: top, errors: g.diagnostics.filter(d => d.severity === 'error').map(d => `${path}: ${d.message}`) };
    }
    if (kind === 'asm') {
      const errs = (validateAsm(m) || []).filter(x => x.severity === 'error').map(x => `${path}: ${x.message}`);
      if (errs.length) return { path, lang, text: '', module: m.name || null, errors: errs };
      return out(generateAsm(m, lang).code);
    }
    if (kind === 'fsm') {
      const f = normalizeFsm(m);
      const errs = fsmErrors(f).map(x => `${path}: ${x.message}`);
      if (errs.length) return { path, lang, text: '', module: f.name || null, errors: errs };
      return out(generateFsm({ ...f, lang }, lang, { source: path.split('/').pop() }).code);
    }
    const t = normalizeTable(m);
    const errs = (validateTable(t) || []).filter(x => x.severity !== 'warning').map(x => `${path}: ${x.message}`);
    if (errs.length) return { path, lang, text: '', module: t.name || null, errors: errs };
    return out(generateTableHdl({ ...t, lang }, lang, { source: path.split('/').pop() }).code);
  } catch (e) {
    return { path, lang, text: '', module: m.name || null, errors: [`${path}: ${e.message}`] };
  }
}
