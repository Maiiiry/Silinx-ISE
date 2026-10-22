// The Handwritten Expression dialog (#1056): the user writes a Boolean expression on a drawing pad (ink-pad.js)
// with a pen, a finger or the mouse; Silinx's own recognizer (core/ink/expression.js, offline) reads it after each
// stroke and shows the text, which the user corrects before inserting it. "Teach Silinx my handwriting" keeps the
// user's samples of a symbol in the browser (localStorage), used as templates of their own.
//
//   await handwrittenExpression({ vars, title }) -> { text, name, expr } | null
//     vars: the inputs' names when they are known (the truth table's), else the expression's own are used
// Styles: web/css/ink.css.
import { h, dialog } from './ui.js';
import { mountInkPad } from './ink-pad.js';
import { recognizeExpression, splitEquation, expressionInputs, InkError } from '/core/ink/expression.js';
import { builtinTemplates, userTemplates, encodeSample, validSamples } from '/core/ink/templates.js';
import { boxOf } from '/core/ink/segment.js';
import { SYMBOLS } from '/core/ink/font.js';
import { parseExpr } from '/core/logic.js';

export const SAMPLES_KEY = 'silinx.ink.samples';
const MAX_SAMPLES = 400;

export function loadSamples() {
  try { return validSamples(JSON.parse(localStorage.getItem(SAMPLES_KEY) || '[]')); } catch { return []; }
}
function saveSamples(list) {
  try { localStorage.setItem(SAMPLES_KEY, JSON.stringify(list.slice(-MAX_SAMPLES))); return true; } catch { return false; }
}

/** The error of a text as an expression (null: it parses). */
export function expressionError(text, vars) {
  const { expr } = splitEquation(text);
  try {
    if (!expr) return "Write an expression, e.g. F = A·B' + C.";
    if (vars) parseExpr(expr, { vars }); else expressionInputs(expr);
    return null;
  } catch (e) { return e.message; }
}

export function handwrittenExpression({ vars = null, title = 'Handwritten Expression' } = {}) {
  let samples = loadSamples();
  let templates = [...builtinTemplates(), ...userTemplates(samples)];
  let timer = null;
  const text = h('input', { type: 'text', class: 'ink-text', spellcheck: 'false', placeholder: 'The recognized text appears here' });
  const msg = h('div', { class: 'ink-msg' });
  const padHost = h('div', { class: 'ink-pad' });
  // read after each stroke, a moment later (the next stroke may follow at once); at once before Insert
  const pad = mountInkPad(padHost, { onStroke: () => { clearTimeout(timer); timer = setTimeout(recognize, 250); } });
  const flush = () => { if (timer) { clearTimeout(timer); recognize(); } };
  const showMsg = (lines, kind = 'warn') => { msg.className = `ink-msg ink-${kind}`; msg.replaceChildren(...lines.map(l => h('div', {}, l))); };
  function recognize() {
    timer = null;
    const strokes = pad.strokes();
    if (!strokes.length) { text.value = ''; pad.setLabels([]); showMsg([]); return; }
    try {
      const r = recognizeExpression(strokes, { templates, vars });
      text.value = r.text;
      pad.setLabels(r.chars.map(c => ({ ch: c.ch, box: boxOf(c.ink.map(k => strokes[k])) })));
      showMsg([...r.warnings, ...(r.error ? [r.error] : [])], r.error || r.warnings.length ? 'warn' : 'ok');
    } catch (e) {
      if (!(e instanceof InkError)) throw e;
      showMsg([e.message]);
    }
  }
  text.addEventListener('input', () => { const e = expressionError(text.value, vars); showMsg(e ? [e] : [], e ? 'warn' : 'ok'); });

  // ---- teach Silinx my handwriting
  const sym = h('input', { type: 'text', class: 'ink-sym', maxlength: 1, spellcheck: 'false', title: 'The symbol written on the pad' });
  const count = h('span', { class: 'ink-count' });
  const showCount = () => { count.textContent = `Samples of your handwriting: ${samples.length}`; };
  const teachMsg = h('div', { class: 'ink-msg' });
  const saveSample = () => {
    const c = sym.value.trim();
    const strokes = pad.strokes();
    if (!SYMBOLS.includes(c)) { teachMsg.textContent = `Type one symbol of the set: ${SYMBOLS.join(' ')}`; return; }
    if (!strokes.length) { teachMsg.textContent = 'Write the symbol on the pad first.'; return; }
    samples = [...samples, encodeSample(c, strokes)].slice(-MAX_SAMPLES);
    teachMsg.textContent = saveSamples(samples) ? `Sample of '${c}' saved.` : 'The browser did not keep the sample (storage unavailable).';
    templates = [...builtinTemplates(), ...userTemplates(samples)];
    showCount();
    pad.clear();
  };
  const forget = () => {
    samples = [];
    saveSamples(samples);
    templates = builtinTemplates();
    teachMsg.textContent = 'Your samples were forgotten.';
    showCount();
  };
  showCount();
  const teach = h('details', { class: 'ink-teach' },
    h('summary', {}, 'Teach Silinx my handwriting'),
    h('div', { class: 'hint' }, 'Write one symbol on the pad, type it here and save it: Silinx then reads your way of writing it too. The samples are kept by this browser only.'),
    h('div', { class: 'ink-row' }, h('label', {}, 'Symbol:'), sym,
      h('button', { type: 'button', class: 'btn ink-save', onclick: saveSample }, 'Save Sample'),
      h('button', { type: 'button', class: 'btn ink-forget', onclick: forget }, 'Forget My Samples'), count),
    teachMsg);

  const body = h('div', { class: 'ink-dialog' },
    h('div', { class: 'hint' }, "Write the expression with a pen, a finger or the mouse, e.g. F = A·B' + C. A bar over letters is NOT; a dot or a * is AND."),
    padHost,
    h('div', { class: 'ink-row' },
      h('button', { type: 'button', class: 'btn ink-undo', onclick: () => pad.undo() }, 'Undo Stroke'),
      h('button', { type: 'button', class: 'btn ink-clear', onclick: () => pad.clear() }, 'Clear')),
    h('div', { class: 'ink-row' }, h('label', {}, 'Recognized:'), text),
    msg,
    teach);
  return dialog({
    title, width: 'min(760px, 96vw)', body, className: 'ink-dlg',
    // no text field in focus: on a pen display or a tablet it would open the on-screen keyboard over the pad
    onOpen: () => setTimeout(() => { if (body.contains(document.activeElement)) document.activeElement.blur(); }, 0),
    buttons: [
      { label: 'Insert', primary: true, validate: () => { flush(); const e = expressionError(text.value, vars); if (e) showMsg([e]); return !e; }, value: () => ({ text: text.value.trim(), ...splitEquation(text.value) }) },
      { label: 'Cancel', value: null },
    ],
  }).finally(() => { clearTimeout(timer); pad.destroy(); });
}
