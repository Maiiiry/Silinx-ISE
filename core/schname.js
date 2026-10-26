// A name given to an object of a schematic by Rename… (#1546): an instance's, an I/O marker's, a net name's. The
// name is written as is in the HDL generated in VHDL or in Verilog, so it must be an identifier of both (a letter,
// then letters, digits and single _, not at the end), not a reserved word of either in any letter case (#679), and
// not the name of another instance or I/O marker (in any letter case: VHDL ignores it). A net name may be a bus
// (data(7:0)); another net of the same name is not refused here: the editor asks to connect them by name (#689).
//
// Isomorphic module (browser + Node).
import { parseNetName } from './schdoc.js';
import { reservedError } from './reserved.js';

const IDENT = /^[A-Za-z](?:_?[A-Za-z0-9])*$/;
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Why `name` cannot be given to the object `kind` ('sym', 'port' or 'label') `id` of `doc`, or null. The name is
 * taken trimmed; its own name again is no problem.
 * @returns {string|null} the message, with its full stop
 */
export function renameError(doc, kind, id, name) {
  const v = String(name ?? '').trim();
  if (!v) return 'Type a name.';
  const base = kind === 'label' ? parseNetName(v).base : v;
  if (!IDENT.test(base)) return `'${base}' is not a valid name: use a letter, then letters, digits and single _ (not at the end).`;
  const r = reservedError(base);
  if (r) return `${r}: choose another name.`;
  if (kind === 'label') return null;
  const sym = (doc.symbols || []).find(s => s.id !== id && same(s.name, v));
  if (sym) return `'${v}' is already the name of ${kind === 'sym' ? 'another instance' : 'an instance'}: choose another name.`;
  const port = (doc.ports || []).find(p => p.id !== id && same(p.name, v));
  if (port) return `'${v}' is already the name of ${kind === 'port' ? 'another I/O marker' : 'an I/O marker'}: choose another name.`;
  return null;
}
