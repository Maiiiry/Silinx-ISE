// The schematic editor's Check (#405: out of mountSchEditor in sch-editor.js): the netlist's problems and the HDL
// generation's, shown or not, the status line updated.
import { generateHdl } from '/core/schdoc.js';

/** { runCheck } of mountSchEditor (doc(), genLang(), lastDiags(), modules(), nl(): its current values). */
export function mountSchCheck(ctx) {
  const {
    doc, genLang, lastDiags, modules, nl, refreshNetlist, showDiags, updateStatus, setLastDiags
  } = ctx;

  // ---------------- check / generate / view
  function runCheck(show) {
    refreshNetlist();
    const extra = [];
    try {
      const g = generateHdl(doc(), { lang: genLang(), modules: modules() });
      for (const d of g.diagnostics) if (!nl().diagnostics.some(x => x.message === d.message)) extra.push(d);
    } catch (err) { extra.push({ severity: 'error', message: `HDL generation failed: ${err.message}` }); }
    setLastDiags([...nl().diagnostics, ...extra]);
    if (show) showDiags();
    updateStatus();
    return lastDiags();
  }

  return { runCheck };
}
