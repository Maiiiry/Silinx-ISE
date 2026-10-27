// The handwriting dialogs' Copy Drawing and Paste Drawing (#1749): the pad's drawing as text (core/ink/corpus.js),
// to paste into an issue — a drawing read wrong becomes a case of the corpus of real drawings (test/fixtures/ink/) —
// and a drawing copied pasted back on the pad (one step of Undo), read again.
//
//   drawingButtons(pad, { kind, read, vars }) -> [Copy Drawing, Paste Drawing]
//     kind: expression | table | schematic; read(): what the dialog read; vars: the inputs it read with
import { h, dialog, toast } from './ui.js';
import { encodeDrawing, decodeDrawing } from '/core/ink/corpus.js';

const KIND = { expression: 'an expression', table: 'a truth table', schematic: 'a schematic' };

// the drawing's text in a window, selected, for a browser that does not let the page copy it
function showText(text) {
  const area = h('textarea', { class: 'ink-drawing-text', rows: 10, readonly: true, spellcheck: 'false' }, text);
  return dialog({ title: 'Copy Drawing', width: 'min(640px, 96vw)', body: h('div', {}, h('div', { class: 'hint' }, 'Copy this text, then paste it into an issue on GitHub, with what the drawing should read as.'), area),
    onOpen: () => setTimeout(() => area.select(), 0), buttons: [{ label: 'Close', value: null, primary: true }] });
}

async function copy(pad, { kind, read, vars }) {
  const text = JSON.stringify(encodeDrawing({ kind, strokes: pad.strokes(), devices: pad.devices(), read: read(), vars }));
  try {
    await navigator.clipboard.writeText(text);
    toast('Drawing copied: paste it into an issue on GitHub, with what it should read as.', 'ok', 5000);
  } catch { await showText(text); }
}

async function paste(pad, kind) {
  const area = h('textarea', { class: 'ink-drawing-text', rows: 10, spellcheck: 'false', placeholder: 'Paste a drawing copied with Copy Drawing here' });
  const err = h('div', { class: 'ink-msg ink-warn' });
  // (what the clipboard has, when the browser lets the page read it)
  try { area.value = await navigator.clipboard.readText(); } catch { /* the user pastes it */ }
  const check = () => {
    try {
      const d = decodeDrawing(area.value);
      if (d.kind !== kind) throw new Error(`This is a drawing of ${KIND[d.kind]}, not of ${KIND[kind]}.`);
      err.textContent = '';
      return d;
    } catch (e) { err.textContent = e.message; return null; }
  };
  const d = await dialog({ title: 'Paste Drawing', width: 'min(640px, 96vw)', body: h('div', {}, area, err),
    buttons: [{ label: 'Load', primary: true, validate: () => !!check(), value: () => check() }, { label: 'Cancel', value: null }] });
  if (d) pad.load(d.strokes.map(s => Object.assign(s, { device: d.devices.length === 1 ? d.devices[0] : undefined })));
}

export function drawingButtons(pad, opts) {
  const b = (cls, label, title, fn) => h('button', { type: 'button', class: `btn ${cls}`, title, onclick: fn }, label);
  const copyBtn = b('ink-copy', 'Copy Drawing', 'Copy the drawing as text, to paste into an issue', () => copy(pad, opts));
  const pasteBtn = b('ink-paste', 'Paste Drawing', 'Load a drawing copied with Copy Drawing', () => paste(pad, opts.kind));
  const sync = () => { copyBtn.disabled = !pad.strokes().length; };
  pad.onChange(sync);
  sync();
  return [copyBtn, pasteBtn];
}
