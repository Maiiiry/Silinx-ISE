// Silinx C++ (#1590): the C++ of a .cpp source that Silinx C reads, on its tree (after core/cpp-lex.js's tokens): a
// reference parameter (int &x) a pointer whose uses are *x and whose arguments are &a (the same ports as a pointer's,
// as Vitis HLS makes them); `cout << a << " " << b << endl;` (cerr too) printf's output. Isomorphic ES module.
//
//   cppTree(ast, report)   in place

const walkExpr = (x, f) => {
  if (!x || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map((y) => walkExpr(y, f));
  const r = f(x);
  if (r !== undefined) return r;
  for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && v && typeof v === 'object') x[k] = walkExpr(v, f);
  return x;
};

export function cppTree(ast, report, streams = new Map()) {
  const funcs = new Map(ast.items.filter((it) => it.kind === 'func').map((f) => [f.name, f]));
  const refs = (f) => new Set((f?.params || []).filter((p) => p.type?.ref).map((p) => p.name));
  for (const f of ast.items) {
    if (f.kind !== 'func' || !f.body) continue;
    const mine = refs(f);
    // the calls: an argument of a reference parameter passed by its address (a reference passed on: as it is)
    walkExpr(f.body, (x) => {
      if (x.kind !== 'call' || x.callee.kind !== 'id') return undefined;
      const g = funcs.get(x.callee.name);
      const theirs = g ? g.params : [];
      x.args = x.args.map((a, k) => {
        const arg = walkExpr(a, () => undefined);
        if (!theirs[k]?.type?.ref) return arg;
        if (arg.kind === 'id' && mine.has(arg.name)) return { ...arg, refPass: true };
        return { kind: 'unary', op: '&', e: arg, loc: arg.loc };
      });
      return undefined;
    });
    // the uses of a reference parameter: *x
    if (mine.size) {
      f.body = walkExpr(f.body, (x) => {
        if (x.kind === 'id' && mine.has(x.name) && !x.refPass) return { kind: 'unary', op: '*', e: { ...x }, loc: x.loc };
        if (x.kind === 'id' && x.refPass) { delete x.refPass; return x; }
        return undefined;
      });
    }
    // a file stream's open, close, eof, is_open: fopen, fclose, feof, != 0
    f.body = walkExpr(f.body, (x) => {
      if (x.kind !== 'call' || x.callee.kind !== 'member' || x.callee.e.kind !== 'id' || !streams.has(x.callee.e.name)) return undefined;
      const s = x.callee.e, L = x.loc, call = (name, args) => ({ kind: 'call', callee: { kind: 'id', name, loc: L }, args, loc: L });
      switch (x.callee.name) {
        case 'open': return { kind: 'assign', op: '=', l: s, r: call('fopen', [x.args[0], { kind: 'str', value: streams.get(s.name), loc: L }]), loc: L };
        case 'close': return call('fclose', [s]);
        case 'eof': return call('feof', [s]);
        case 'is_open': case 'good': return { kind: 'binary', op: '!=', l: s, r: { kind: 'num', value: 0n, text: '0', loc: L }, loc: L };
        default: report(x, `the stream's '${x.callee.name}' is not supported`); return undefined;
      }
    });
    // cout << … << endl: printf("%…", …); a file stream's: fprintf; f >> a >> b: fscanf
    f.body = walkExpr(f.body, (x) => {
      if (x.kind !== 'expr') return undefined;
      const parts = [];
      let e = x.e;
      if (e?.kind === 'binary' && e.op === '>>') {
        while (e?.kind === 'binary' && e.op === '>>') { parts.unshift(e.r); e = e.l; }
        if (!(e?.kind === 'id' && streams.has(e.name))) return undefined;
        return { kind: 'expr', e: { kind: 'call', callee: { kind: 'id', name: 'fscanf', loc: x.loc }, args: [e, { kind: 'str', value: parts.map(() => '%d').join(' '), loc: x.loc }, ...parts.map((p) => ({ kind: 'unary', op: '&', e: p, loc: p.loc }))], loc: x.loc }, loc: x.loc };
      }
      while (e?.kind === 'binary' && e.op === '<<') { parts.unshift(e.r); e = e.l; }
      const file = e?.kind === 'id' && streams.has(e.name) ? e : null;
      if (!(e?.kind === 'id' && (e.name === 'cout' || e.name === 'cerr' || file)) || !parts.length) return undefined;
      let fmt = '';
      const args = [];
      for (const p of parts) {
        if (p.kind === 'id' && p.name === 'endl') fmt += '\n';
        else if (p.kind === 'str') fmt += p.value.replace(/%/g, '%%');
        else if (p.kind === 'chr') fmt += String.fromCharCode(Number(p.value)).replace(/%/g, '%%');
        else { fmt += '%lld'; args.push({ kind: 'cast', type: { kind: 'int', name: 'long long', bits: 64, signed: true }, e: p, loc: p.loc }); }
      }
      const fmtArg = { kind: 'str', value: fmt, loc: x.loc };
      return { kind: 'expr', e: { kind: 'call', callee: { kind: 'id', name: file ? 'fprintf' : 'printf', loc: x.loc }, args: [...(file ? [file] : []), fmtArg, ...args], loc: x.loc }, loc: x.loc };
    });
  }
  // the reference parameters: pointers from here on
  for (const f of ast.items) if (f.kind === 'func') for (const p of f.params || []) if (p.type?.ref) p.type = { kind: 'ptr', to: p.type.to, ref: true };
  return ast;
}
