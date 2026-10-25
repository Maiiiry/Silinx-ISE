// The cursor of each source kept in this browser, per project (#1299): the page reloaded, or the source opened again,
// comes back to where it was (web/js/app.js openFile: unless a line is asked for, an error's, Go to Source's).
// Its edition's own key (web/js/prefs.js), at most MAX sources a project (the ones moved in last).
import { prefKey } from './prefs.js';

const MAX = 50;
const CURSOR_KEY = project => prefKey(`silinx.cursor.${project}`);
function read(project) {
  try { const m = JSON.parse(localStorage.getItem(CURSOR_KEY(project)) || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch { return {}; }
}

/** Keeps the cursor `pos` ({ line, ch }, from 0) of source `path` of `project`. */
export function keepCursor(project, path, pos) {
  if (!project || !path || !pos) return;
  const m = read(project);
  delete m[path];
  m[path] = { line: pos.line, ch: pos.ch };
  const paths = Object.keys(m);
  for (const p of paths.slice(0, Math.max(0, paths.length - MAX))) delete m[p];
  try { localStorage.setItem(CURSOR_KEY(project), JSON.stringify(m)); } catch { /* storage unavailable */ }
}

/** The kept cursor of source `path` of `project` ({ line, ch }, from 0), null when none. */
export function keptCursor(project, path) {
  const p = read(project)[path];
  return p && Number.isInteger(p.line) && Number.isInteger(p.ch) && p.line >= 0 && p.ch >= 0 ? p : null;
}
