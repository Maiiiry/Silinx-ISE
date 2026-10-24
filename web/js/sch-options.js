// The schematic editor's toolbar options (#405, #1145: out of mountSchEditor in sch-editor.js), remembered: Keep
// connections, Names, Hop-overs; their checkboxes and their values. mountSchOptions(ctx) is called by mountSchEditor
// where this code was.
import { h } from './dom.js';

/** { hopsBox, keepBox, keepConn, namesBox, showHops, showNames } of mountSchEditor (keepConn(), showHops(), showNames(): their current values). */
export function mountSchOptions(ctx) {
  const { render } = ctx;
  // moving components keeps their wires connected (re-routed), or detaches them
  let keepConn = true;
  try { keepConn = localStorage.getItem('xl.sch.keepConn') !== '0'; } catch { /* default */ }
  const keepBox = h('input', { type: 'checkbox', checked: keepConn });
  keepBox.addEventListener('change', () => { keepConn = keepBox.checked; try { localStorage.setItem('xl.sch.keepConn', keepConn ? '1' : '0'); } catch { /* ignore */ } });
  // Names: the name of every instance and every net drawn, the automatic ones too
  let showNames = false;
  try { showNames = localStorage.getItem('xl.sch.names') === '1'; } catch { /* default */ }
  const namesBox = h('input', { type: 'checkbox', checked: showNames });
  namesBox.addEventListener('change', () => { showNames = namesBox.checked; try { localStorage.setItem('xl.sch.names', showNames ? '1' : '0'); } catch { /* ignore */ } render(); });
  // Hop-overs (#692): a small arc where two wires cross without connecting (a view only: the nets, the HDL
  // the same)
  // hop-overs on by default (#756), off only when the user turned them off (remembered)
  let showHops = true;
  try { showHops = localStorage.getItem('xl.sch.hops') !== '0'; } catch { /* default */ }
  const hopsBox = h('input', { type: 'checkbox', checked: showHops });
  hopsBox.addEventListener('change', () => { showHops = hopsBox.checked; try { localStorage.setItem('xl.sch.hops', showHops ? '1' : '0'); } catch { /* ignore */ } render(); });

  return { hopsBox, keepBox, keepConn: () => keepConn, namesBox, showHops: () => showHops, showNames: () => showNames };
}
