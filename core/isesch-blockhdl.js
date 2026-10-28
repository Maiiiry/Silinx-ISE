// Silinx - the module's declarations an HDL block's own file needs in an ISE schematic's export (#1695): a schematic
// made from HDL keeps the module's context clause, generics / parameters and declarations (constants, types,
// functions, localparams, `define macros …) in doc.hdl; a block exported as an ISE symbol with an HDL file of its own
// takes them all, but of the module's signals (VHDL signal; Verilog reg, wire, logic, integer) only the ones its code
// uses that are not its pins (its own temporaries): the others are its ports, or not its business. Isomorphic.

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// split at the commas outside brackets, braces and parentheses
function topCommas(s) {
  const out = [];
  let d = 0, a = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    else if (c === ',' && d === 0) { out.push(s.slice(a, i)); a = i + 1; }
  }
  out.push(s.slice(a));
  return out;
}

/**
 * The doc.hdl of an HDL block's own module: the module's `hdl` ({ lang, context, generics, decls }) with its signal
 * declarations kept only for the names `code` uses that are not in `ports` (a Set of the block's pin names).
 * @returns {{ lang, context, generics, decls }|null}  null: nothing to keep
 */
export function blockHdlDecls(hdl, code, ports, lang) {
  if (!hdl) return null;
  const vh = (hdl.lang || lang) === 'vhdl';
  const text = String(code || '');
  const pin = n => [...ports].some(p => (vh ? p.toLowerCase() === n.toLowerCase() : p === n));
  const used = n => new RegExp(`(^|[^\\w$])${reEsc(n)}(?![\\w$])`, vh ? 'i' : '').test(text);
  const keep = n => used(n) && !pin(n);
  const dropped = new Set();
  let decls = String(hdl.decls || '');
  if (vh) {
    decls = decls.replace(/(^|\n)([ \t]*)signal\s+([^:;]+?)\s*:([^;]*;)/gi, (m, nl, ind, names, rest) => {
      const all = names.split(',').map(n => n.trim()), k = all.filter(keep);
      all.filter(n => !k.includes(n)).forEach(n => dropped.add(n.toLowerCase()));
      return k.length ? `${nl}${ind}signal ${k.join(', ')} :${rest}` : nl;
    });
    // (an attribute of a signal left out goes with it)
    decls = decls.replace(/(^|\n)[ \t]*attribute\s+\w+\s+of\s+(\w+)\s*:\s*signal\b[^;]*;/gi, (m, nl, n) => (dropped.has(n.toLowerCase()) ? nl : m));
  } else {
    decls = decls.replace(/(^|\n)([ \t]*)(reg|wire|logic|integer|tri)\b([^;]*);/g, (m, nl, ind, kw, rest) => {
      const t = /^(\s*(?:(?:signed|unsigned)\b\s*)?(?:\[[^\]]*\]\s*)*)([\s\S]*)$/.exec(rest);
      const parts = topCommas(t[2]), k = parts.filter(p => { const n = /^\s*([A-Za-z_][\w$]*|\\\S+)/.exec(p)?.[1]; return n && keep(n); });
      parts.filter(p => !k.includes(p)).forEach(p => { const n = /^\s*([A-Za-z_][\w$]*|\\\S+)/.exec(p)?.[1]; if (n) dropped.add(n); });
      return k.length ? `${nl}${ind}${kw}${t[1]}${k.join(',')};` : nl;
    });
    // (an output port's initial value, "initial q = 4'd7;", only for a register kept)
    decls = decls.replace(/(^|\n)[ \t]*initial\s+([A-Za-z_][\w$]*)\s*=[^;]*;/g, (m, nl, n) => (dropped.has(n) || !used(n) || pin(n) ? nl : m));
  }
  decls = decls.replace(/\n{2,}/g, '\n').replace(/^\n+|\n+$/g, '');
  const generics = (hdl.generics || []).map(g => ({ ...g }));
  if (!decls.trim() && !String(hdl.context || '').trim() && !generics.length) return null;
  return { lang: hdl.lang || lang, context: hdl.context || '', generics, decls };
}
