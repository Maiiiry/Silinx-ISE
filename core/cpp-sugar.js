// Silinx HLS C++ (#1590): auto and the range for, as tokens (after core/cpp-template.js's templates, before
// core/cpp-lex.js's other passes). `auto x = e;` takes the type e's first name is declared with (a function's: its
// return type; a literal: int). `for (T x : a) body` over an array a[N] is `for (int i = 0; i < N; i++) { T x = a[i];
// body }`, and with a reference (T &x) its uses in the body are a[i]. Isomorphic ES module.
//
//   cppSugar(tokens, report) -> tokens
import { closing, declType } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const QUALS = new Set(['const', 'static', 'volatile', 'register', 'inline', 'constexpr']);

/** The return type of the function name declared in toks, or null. */
function returnType(toks, name) {
  for (let i = 1; i < toks.length; i++) {
    if (!isId(toks[i], name) || !op(toks[i + 1], '(') || !(toks[i - 1].t === 'id' || op(toks[i - 1], '>') || op(toks[i - 1], '*'))) continue;
    if (['return', 'case', 'else', 'sizeof'].includes(toks[i - 1].v)) continue;
    const ty = [];
    for (let j = i - 1; j >= 0 && !(op(toks[j], ';') || op(toks[j], '}') || op(toks[j], '{') || toks[j].t === 'pragma'); j--) ty.unshift(toks[j]);
    const kept = ty.filter((t) => !(t.t === 'id' && QUALS.has(t.v)));
    if (kept.length) return kept;
  }
  return null;
}
/** The type of an initializer: a call's return type, its first name's declared type, a literal's int. */
function initType(init, before) {
  if (init.length === 1 && init[0].t === 'num') return [{ ...init[0], t: 'id', v: /[lL]{2}$/.test(init[0].v) ? 'long long' : /[uU]/.test(init[0].v) ? 'unsigned' : 'int' }];
  for (let k = 0; k < init.length; k++) {
    if (init[k].t !== 'id') continue;
    if (op(init[k + 1], '(')) { const r = returnType(before, init[k].v); if (r) return r; continue; }
    const ty = declType(before, init[k].v);
    if (ty) return ty;
  }
  return null;
}

export function cppSugar(input, report) {
  const toks = input.slice();
  let loops = 0;
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    // auto x = e;
    if (isId(t, 'auto') && isId(toks[k + 1]) && op(toks[k + 2], '=')) {
      let e = k + 3;
      while (toks[e] && !op(toks[e], ';') && !op(toks[e], ',')) e = op(toks[e], '(') || op(toks[e], '[') || op(toks[e], '{') ? closing(toks, e) + 1 : e + 1;
      const ty = initType(toks.slice(k + 3, e), toks.slice(0, k));
      if (!ty) { report(t, `'auto ${toks[k + 1].v}': its type is not known from its value (write the type)`); continue; }
      toks.splice(k, 1, ...ty.map((x) => ({ ...x, line: t.line, col: t.col, file: t.file })));
      k += ty.length - 1;
      continue;
    }
    if (isId(t, 'auto') && !(op(toks[k - 1], '(') && isId(toks[k - 2], 'for'))) { report(t, "'auto' only for a variable given a value (auto x = e;) or in a range for"); continue; }
    // for (T x : a) body
    if (!(isId(t, 'for') && op(toks[k + 1], '('))) continue;
    const close = closing(toks, k + 1);
    const colon = toks.findIndex((x, i) => i > k + 1 && i < close && op(x, ':'));
    if (colon < 0 || toks.slice(k + 2, colon).some((x) => op(x, ';'))) continue;
    const decl = toks.slice(k + 2, colon), range = toks.slice(colon + 1, close);
    // (said: the loop dropped, its body too, one error)
    const drop = () => {
      let e = close + 1;
      if (op(toks[e], '{')) e = closing(toks, e);
      else while (toks[e] && !op(toks[e], ';')) e = op(toks[e], '(') || op(toks[e], '{') ? closing(toks, e) + 1 : e + 1;
      toks.splice(k, e + 1 - k, { ...t, t: 'op', v: ';' });
    };
    const name = decl.at(-1), ref = op(decl.at(-2), '&');
    if (!isId(name) || range.length !== 1 || !isId(range[0])) { report(t, 'a range for over an array: for (T x : a)'); drop(); continue; }
    const a = range[0];
    const size = arraySize(toks.slice(0, k), a.v);
    if (size === 'param') { report(a, `the range for: '${a.v}' is a parameter, a pointer in C++ (index it: for (int i = 0; i < N; i++))`); drop(); continue; }
    if (!size) { report(a, `the range for: '${a.v}' is not an array of a known size`); drop(); continue; }
    let ty = decl.slice(0, ref ? -2 : -1).filter((x) => !(x.t === 'id' && QUALS.has(x.v)));
    if (ty.length === 1 && isId(ty[0], 'auto')) ty = declType(toks.slice(0, k), a.v);
    if (!ty) { report(t, `the range for: the type of '${a.v}''s elements is not known`); drop(); continue; }
    // its body: a block or one statement
    const b0 = close + 1;
    let b1;
    if (op(toks[b0], '{')) b1 = closing(toks, b0);
    else if (toks[b0] && !['if', 'for', 'while', 'do', 'switch'].includes(toks[b0].v)) { b1 = b0; while (toks[b1] && !op(toks[b1], ';')) b1++; }
    else { report(toks[b0] || t, "the range for's body: write it in braces { … }"); drop(); continue; }
    const i = { ...a, t: 'id', v: `ap_range_${loops++}` };
    const L = (v, tt = 'op') => ({ ...t, t: tt, v });
    const elem = () => [{ ...a }, L('['), { ...i }, L(']')];
    let body = toks.slice(b0, b1 + 1);
    if (ref) body = body.flatMap((x, j) => (isId(x, name.v) && !op(body[j - 1], '.') && !op(body[j - 1], '->') ? elem() : [x]));
    const head = [t, L('('), L('int', 'id'), { ...i }, L('='), L('0', 'num'), L(';'), { ...i }, L('<'), L('('), ...size, L(')'), L(';'), { ...i }, L('++'), L(')')];
    const inner = ref ? body : [L('{'), ...ty.map((x) => ({ ...x })), { ...name }, L('='), ...elem(), L(';'), ...body, L('}')];
    toks.splice(k, b1 + 1 - k, ...head, ...inner);
    k += head.length - 1;
  }
  return toks;
}
/** The size (its tokens) of the array name declared last in toks: a[N] (its first dimension); 'param' for a
 *  parameter; or null. */
function arraySize(toks, name) {
  for (let i = toks.length - 1; i > 0; i--) {
    if (!isId(toks[i], name) || !op(toks[i + 1], '[') || !(toks[i - 1].t === 'id' || op(toks[i - 1], '>'))) continue;
    if (['return', 'case', 'else', 'sizeof'].includes(toks[i - 1].v)) continue;
    const e = closing(toks, i + 1);
    // (a parameter: in C++ a pointer, no range for over it)
    let d = 0, j = i - 1;
    for (; j >= 0 && !op(toks[j], ';') && !op(toks[j], '{') && !op(toks[j], '}'); j--) { if (op(toks[j], ')')) d++; if (op(toks[j], '(')) { if (!d) break; d--; } }
    if (op(toks[j], '(')) return 'param';
    if (e > i + 2) return toks.slice(i + 2, e);
  }
  return null;
}
