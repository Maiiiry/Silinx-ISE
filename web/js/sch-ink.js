// The schematic editor's handwritten input (#1067): a circuit drawn by hand (ink-schematic-dialog.js) becomes the
// editor's drawing — its symbols, wires, I/O markers and net names replaced, the document's own settings kept — in
// one edit (Undo brings the drawing before back).
//
//   handwrittenSchematicInto(ed); ed: the editor's { doc(), replace(parts), fit() }
export async function handwrittenSchematicInto(ed) {
  const { handwrittenSchematic } = await import('./ink-schematic-dialog.js');
  const d = ed.doc();
  const r = await handwrittenSchematic({ name: d.name, lang: d.lang, replaces: d.symbols.length + d.wires.length + d.ports.length + d.labels.length > 0 });
  if (!r) return;
  const { symbols, wires, ports, labels, sheet } = r.doc;
  ed.replace({ symbols, wires, ports, labels, sheet: { w: Math.max(sheet.w, d.sheet?.w || 0), h: Math.max(sheet.h, d.sheet?.h || 0) } });
  ed.fit();
}
