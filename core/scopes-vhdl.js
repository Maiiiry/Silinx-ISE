// Silinx - the VHDL scopes' helpers (#405: out of analyzeVhdl in core/scopes.js): a scope opened (named by the
// label waiting for it), a design unit's scope given the packages its use clauses named, a declaration's type as
// written for the names it declares.

/** { open, unitScope, typeOf } of analyzeVhdl (cur(), pendingLabel(), uses(): its current values). */
export function mountVhdlScopes(ctx) {
  const {
    text, tokens, C, Scope, cur, setCur, pendingLabel, setPendingLabel, uses, setUses
  } = ctx;

  const open = (kind, tok, opts = {}) => {
    const s = new Scope(kind, cur(), opts.parent || cur(), tok, opts.closer || kind);
    C.scopes.push(s);
    Object.assign(s, opts.extra || {});
    if (opts.sym !== undefined) { s.sym = opts.sym; if (opts.sym) opts.sym.owner = s; }
    else if (pendingLabel()) { s.sym = pendingLabel(); pendingLabel().owner = s; }
    setPendingLabel(null);
    setCur(s);
    return s;
  };
  const unitScope = () => { const s = cur(); s.imports.push(...uses()); setUses([]); return s; };
  // the type of a declaration as written, for the names it declares (ports: without the mode)
  const typeOf = (ctx, end) => {
    if (ctx.typeStart == null) return;
    const e = ctx.typeEnd ?? end;
    let ty = text.slice(tokens[ctx.typeStart].off, tokens[e].off).trim();
    const m = /^(in|out|inout|buffer|linkage)\b\s*/i.exec(ty);
    if (m) ty = ty.slice(m[0].length);
    for (const s of ctx.syms) { if (s.type == null) s.type = ty; if (m && !s.mode) s.mode = m[1].toLowerCase(); }
    ctx.syms = []; ctx.typeStart = null; ctx.typeEnd = null;
  };

  return { open, unitScope, typeOf };
}
