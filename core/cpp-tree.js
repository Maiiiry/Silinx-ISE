// Silinx HLS (#1590): the C++ of a .cpp source that Silinx HLS reads, on its tree (after core/cpp-lex.js's tokens): a
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

// (the manipulators of a stream: endl a new line, the others its format from here on; '' those that change nothing)
const MANIP = { endl: '\n', left: 'left', right: 'right', hex: 'x', oct: 'o', dec: 'd', fixed: '', scientific: '', showpoint: '', noshowpoint: '', flush: '' };

export function cppTree(ast, report, streams = new Map()) {
  const funcs = new Map(ast.items.filter((it) => it.kind === 'func').map((f) => [f.name, f]));
  // (a stream passed by reference is the stream: no pointer, hls::stream<T> &s is s)
  for (const f of funcs.values()) for (const p of f.params || []) if (p.type?.ref && p.type.to?.kind === 'stream') p.type = p.type.to;
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
    // a stream's s >> x and s << v: x = s.read(), s.write(v)
    const fifos = new Set((f.params || []).filter((p) => p.type?.kind === 'stream').map((p) => p.name));
    walkExpr(f.body, (x) => { if (x.kind === 'decl') for (const v of x.vars) if (v.type?.kind === 'stream') fifos.add(v.name); return undefined; });
    const member = (s, name, args, L) => ({ kind: 'call', callee: { kind: 'member', e: s, name, arrow: false, loc: L }, args, loc: L });
    if (fifos.size) {
      f.body = walkExpr(f.body, (x) => {
        if (x.kind !== 'expr' || x.e?.kind !== 'binary' || (x.e.op !== '>>' && x.e.op !== '<<')) return undefined;
        const chain = [];
        let e = x.e;
        while (e?.kind === 'binary' && e.op === x.e.op) { chain.unshift(e.r); e = e.l; }
        if (!(e?.kind === 'id' && fifos.has(e.name))) return undefined;
        const items = chain.map((p) => ({ kind: 'expr', e: x.e.op === '>>' ? { kind: 'assign', op: '=', l: p, r: member(e, 'read', [], p.loc), loc: p.loc } : member(e, 'write', [p], p.loc), loc: p.loc }));
        return items.length === 1 ? items[0] : { kind: 'block', items, loc: x.loc };
      });
    }
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
      // (<iomanip>'s manipulators: setw the next item's width, left / right, setfill('0'), hex / oct / dec, setbase;
      // fixed, setprecision and the others of floating point ignored)
      let width = 0, left = false, zero = false, base = 'd';
      const flags = () => `${left ? '-' : ''}${zero && !left ? '0' : ''}${width || ''}`;
      const num = (e) => (e?.kind === 'num' ? Number(e.value) : null);
      for (const p of parts) {
        if (p.kind === 'id' && MANIP[p.name] !== undefined) {
          const m = MANIP[p.name];
          if (m === '\n') fmt += '\n';
          else if (m === 'left' || m === 'right') left = m === 'left';
          else if (m) base = m;
          continue;
        }
        if (p.kind === 'call' && p.callee.kind === 'id' && ['setw', 'setprecision', 'setbase', 'setfill'].includes(p.callee.name)) {
          const v = p.args[0];
          if (p.callee.name === 'setw') { width = num(v); if (width === null) { report(p, 'setw takes a constant'); width = 0; } }
          if (p.callee.name === 'setbase') base = { 16: 'x', 8: 'o' }[num(v)] || 'd';
          if (p.callee.name === 'setfill') zero = v?.kind === 'chr' && Number(v.value) === 48;
          continue;
        }
        const strs = p.kind === 'cond' && p.a.kind === 'str' && p.b.kind === 'str';
        if (p.kind === 'str' && !width) fmt += p.value.replace(/%/g, '%%');
        else if (p.kind === 'chr' && !width) fmt += String.fromCharCode(Number(p.value)).replace(/%/g, '%%');
        else if (p.kind === 'str' || strs) { fmt += `%${left ? '-' : ''}${width || ''}s`; args.push(p); }
        else if (p.kind === 'chr') { fmt += `%${left ? '-' : ''}${width || ''}c`; args.push(p); }
        else { fmt += `%${flags()}ll${base}`; args.push({ kind: 'cast', type: { kind: 'int', name: 'long long', bits: 64, signed: true }, e: p, loc: p.loc }); }
        width = 0;
      }
      const fmtArg = { kind: 'str', value: fmt, loc: x.loc };
      return { kind: 'expr', e: { kind: 'call', callee: { kind: 'id', name: file ? 'fprintf' : 'printf', loc: x.loc }, args: [...(file ? [file] : []), fmtArg, ...args], loc: x.loc }, loc: x.loc };
    });
  }
  // the reference parameters: pointers from here on
  for (const f of ast.items) if (f.kind === 'func') for (const p of f.params || []) if (p.type?.ref) p.type = { kind: 'ptr', to: p.type.to, ref: true };
  return ast;
}
