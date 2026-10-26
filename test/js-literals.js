// Test helper (#1405): the string and template literals of a JavaScript source: { strings: [text], templates: [[text, text, …]] } (a template's
// static parts, around its ${…}); comments and regular expression literals skipped. Enough for this
// repository's sources (not a full parser: a '/' is a regular expression after an operator, a bracket or a keyword).
// templatesOf (#1443) gives the templates with what they interpolate: [{ parts, exprs: [source of each ${…}], line }],
// a template inside a ${…} listed on its own too.
export function templatesOf(src) {
  const strings = [], templates = [];
  let i = 0, prev = '';   // prev: the last significant character of code (a '/' after it starts a regular expression?)
  const regexAfter = c => !c || /[(,=:[!&|?{};+\-*%<>~^]/.test(c);
  const unescape = s => s.replace(/\\(.)/g, (m, c) => ({ n: '\n', t: '\t' }[c] ?? c));
  let line = 1, lineAt = 0;   // the line of position i, counted from the last position asked
  const lineOf = k => { line += src.slice(lineAt, k).split('\n').length - 1; lineAt = k; return line; };
  function template() {   // at the char after the opening backtick; returns at the char after the closing one
    const parts = [], exprs = [], at = lineOf(i); let cur = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { cur += src.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { i++; parts.push(unescape(cur)); templates.push({ parts, exprs, line: at }); return; }
      if (c === '$' && src[i + 1] === '{') { parts.push(unescape(cur)); cur = ''; i += 2; const s = i; code(1); exprs.push(src.slice(s, i - 1).trim()); continue; }
      cur += c; i++;
    }
  }
  function code(depth) {   // depth: inside ${…} (returns at its closing brace), 0: the file
    while (i < src.length) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { i = src.indexOf('\n', i); if (i < 0) i = src.length; continue; }
      if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue; }
      if (c === "'" || c === '"') {
        let j = i + 1, s = '';
        while (j < src.length && src[j] !== c) { if (src[j] === '\\') { s += src.slice(j, j + 2); j += 2; } else s += src[j++]; }
        strings.push(unescape(s)); i = j + 1; prev = 'a'; continue;
      }
      if (c === '`') { i++; template(); prev = 'a'; continue; }
      if (c === '/' && regexAfter(prev)) {
        let j = i + 1, cls = false;
        while (j < src.length && (cls || src[j] !== '/') && src[j] !== '\n') { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
        i = j + 1; prev = 'a'; continue;
      }
      if (depth) { if (c === '{') depth++; else if (c === '}' && --depth === 0) { i++; return; } }
      if (!/\s/.test(c)) prev = /[\w$)\]]/.test(c) ? 'a' : c;
      // a keyword before a regular expression (return /x/)
      if (/\w/.test(c)) { const w = /^\w+/.exec(src.slice(i))[0]; if (w === 'return' || w === 'typeof' || w === 'case') prev = '('; i += w.length; continue; }
      i++;
    }
  }
  code(0);
  return { strings, templates };
}

export function literalsOf(src) {
  const { strings, templates } = templatesOf(src);
  return { strings, templates: templates.map(t => t.parts) };
}
