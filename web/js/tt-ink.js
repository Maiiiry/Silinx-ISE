// The truth table editor's handwritten input (#1056, #1066; out of truthtable.js's mount function, #405): an
// expression written by hand fills the column of its output; a whole table drawn by hand replaces the table.
//
//   handwrittenColumn(ed), handwrittenWholeTable(ed); ed: the editor's { model(), alive(), select(output),
//     fill(expression), replace(table) }
import { normalizeTable, validateTable } from '/core/logic.js';
import { reservedError } from '/core/reserved.js';

/** "F = …" written by hand: the output F selected (when the table has it), then the expression fills its column. */
export async function handwrittenColumn(ed) {
  const { handwrittenExpression } = await import('./ink-dialog.js');
  const M = ed.model();
  const r = await handwrittenExpression({ vars: M.inputs });
  if (!r || !ed.alive()) return;
  const named = M.outputs.find(o => o.toLowerCase() === r.name.toLowerCase());
  if (named) ed.select(named);
  ed.fill(r.expr);
}

/** A table drawn by hand: its inputs, outputs and columns replace the table's (one step of Undo). */
export async function handwrittenWholeTable(ed) {
  const { handwrittenTable } = await import('./ink-table-dialog.js');
  const tableOf = r => normalizeTable({ ...ed.model(), inputs: r.inputs, outputs: r.outputs, table: r.table, exprs: {} });
  // the editor's own rules: no name the HDL reserves, a table it can edit
  const check = r => [...r.inputs, ...r.outputs].map(reservedError).find(Boolean) || validateTable(tableOf(r)).find(x => x.severity === 'error')?.message || null;
  const r = await handwrittenTable({ check });
  if (r && ed.alive()) ed.replace(tableOf(r));
}
