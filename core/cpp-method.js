// Silinx HLS C++ (#1590): a struct's member functions and constructors, as tokens (for core/c-struct.js). A method is a
// function of its struct's, its object a reference parameter added last: `int S::get() const` is
// `int S_get(const S &ap_this)`, its members `ap_this.m`, its calls of the other methods theirs with ap_this;
// `operator()` is S_call. A constructor is a function `void S_ctor<n>(…, S &ap_this)` whose initializer list assigns
// the members first; a default constructor of constants only (S() : a(0), b(1) {}) is the members' initial values.
// A destructor does nothing. Isomorphic ES module.
//
//   parseMethod(decl, sname, report) -> { name, fn, ret, params, isConst, ctor, inits, body } | null (a destructor)
//   methodFunctions(def) -> the tokens of its methods' and constructors' functions
//   foldDefaultCtor(def)   its default constructor of constants made its members' initial values
import { closing, splitTop, constTokens } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const L = (t, v, tt = 'op') => ({ ...t, t: tt, v });

/** A member function, a constructor or a destructor declared in a struct (its body there, or null: defined later). */
export function parseMethod(decl, sname, report) {
  let k = 0;
  while (isId(decl[k]) && ['inline', 'virtual', 'explicit', 'constexpr'].includes(decl[k].v)) {
    if (decl[k].v === 'virtual') report(decl[k], `the struct '${sname}': a virtual function is not possible in hardware (Vitis HLS: no virtual functions)`);
    k++;
  }
  if (op(decl[k], '~')) return null;
  // its name: the id before the first '(' (operator(): its own)
  let n = k;
  while (decl[n] && !op(decl[n], '(')) n++;
  let nameTok = decl[n - 1], name = nameTok?.v, open = n;
  if (isId(decl[n - 1], 'operator')) {
    if (!op(decl[n + 1], ')') || !op(decl[n + 2], '(')) { report(decl[n - 1], `the struct '${sname}': only operator() is supported among its operators`); return null; }
    nameTok = decl[n - 1]; name = 'operator()'; open = n + 2;
  } else if (op(decl[n - 2], '~')) return null;
  else if (isId(decl[n - 2], 'operator')) { report(decl[n - 2], `the struct '${sname}': only operator() is supported among its operators`); return null; }
  const close = closing(decl, open);
  const ctor = name === sname && n - 1 === k;
  const ret = ctor ? [L(nameTok, 'void', 'id')] : decl.slice(k, name === 'operator()' ? n - 1 : n - 1);
  if (ret.some((x) => isId(x, 'static'))) { report(nameTok, `the struct '${sname}': a static member function is supported in a class of static members only`); return null; }
  const params = decl.slice(open + 1, close);
  let j = close + 1;
  let isConst = false;
  if (isId(decl[j], 'const')) { isConst = true; j++; }
  // (a constructor's initializer list: a(x), b{y})
  const inits = [];
  if (ctor && op(decl[j], ':')) {
    j++;
    while (isId(decl[j]) && (op(decl[j + 1], '(') || op(decl[j + 1], '{'))) {
      const e = closing(decl, j + 1);
      inits.push({ name: decl[j], value: decl.slice(j + 2, e) });
      j = e + 1;
      if (op(decl[j], ',')) j++;
    }
  }
  const body = op(decl[j], '{') ? decl.slice(j + 1, closing(decl, j)) : null;
  return { name, fn: `${sname}_${name === 'operator()' ? 'call' : name}`, ret, params, isConst, ctor, inits, body, loc: nameTok };
}

/** A default constructor whose initializer list gives constants and whose body is empty: the members' initial values
 *  (so a static or an array of the struct starts with them). */
export function foldDefaultCtor(def) {
  def.ctors = def.ctors.filter((c) => {
    if (splitTop(c.params).length || (c.body && c.body.length) || !c.inits.every((i) => constTokens(i.value) !== null && def.members.some((m) => m.name === i.name.v && !m.struct && !m.dims.length))) return true;
    for (const i of c.inits) def.members.find((m) => m.name === i.name.v).init = i.value;
    return false;
  });
}

/** The functions of a struct's methods and constructors (defined). */
export function methodFunctions(def, report) {
  const out = [];
  const fields = new Set(def.members.map((m) => m.name));
  const methods = def.methods;
  for (const m of [...methods.values(), ...def.ctors]) {
    const t = m.loc;
    // (said: an empty body from here on, one error)
    if (!m.body) { report(m.loc, `'${m.name}' of '${def.name}' is declared but not defined`); m.body = isId(m.ret[0], 'void') && m.ret.length === 1 ? [] : [L(t, 'return', 'id'), L(t, '0', 'num'), L(t, ';')]; }
    const own = new Set(splitTop(m.params).map((p) => p.filter((x) => isId(x)).at(-1)?.v));
    const self = [...(m.isConst ? [L(t, 'const', 'id')] : []), L(t, def.name, 'id'), L(t, '&'), L(t, 'ap_this', 'id')];
    out.push(...m.ret, L(t, m.fn, 'id'), L(t, '('), ...m.params, ...(m.params.length ? [L(t, ',')] : []), ...self, L(t, ')'), L(t, '{'));
    for (const i of m.inits) {
      if (!fields.has(i.name.v)) { report(i.name, `'${i.name.v}' is not a member of ${def.name}`); continue; }
      out.push(L(i.name, 'ap_this', 'id'), L(i.name, '.'), i.name, L(i.name, '='), L(i.name, '('), ...i.value, L(i.name, ')'), L(i.name, ';'));
    }
    out.push(...body(m.body, fields, methods, own, def), L(t, '}'));
  }
  return out;
}
/** A method's body: its struct's members ap_this's, its calls of the other methods with ap_this. */
function body(ts, fields, methods, own, def) {
  const out = [];
  const locals = new Set(own);
  for (let k = 0; k < ts.length; k++) {
    const t = ts[k];
    const after = op(ts[k - 1], '.') || op(ts[k - 1], '->') || op(ts[k - 1], '::');
    if (isId(t, 'this') && op(ts[k + 1], '->')) { out.push(L(t, 'ap_this', 'id'), L(t, '.')); k++; continue; }
    if (isId(t, 'this')) { out.push(L(t, 'ap_this', 'id')); continue; }
    if (op(t, '*') && isId(ts[k + 1], 'this')) { out.push(L(t, 'ap_this', 'id')); k++; continue; }
    // (a local of the same name hides the member: int a = …;)
    if (isId(t) && !after && fields.has(t.v) && isId(ts[k - 1]) && !['return', 'case', 'else'].includes(ts[k - 1].v) && (op(ts[k + 1], '=') || op(ts[k + 1], ';') || op(ts[k + 1], ',') || op(ts[k + 1], '['))) { locals.add(t.v); out.push(t); continue; }
    if (isId(t) && !after && !locals.has(t.v) && fields.has(t.v)) { out.push(L(t, 'ap_this', 'id'), L(t, '.'), t); continue; }
    if (isId(t) && !after && methods.has(t.v) && op(ts[k + 1], '(')) {
      const e = closing(ts, k + 1);
      const args = body(ts.slice(k + 2, e), fields, methods, locals, def);
      out.push(L(t, methods.get(t.v).fn, 'id'), L(t, '('), ...args, ...(args.length ? [L(t, ',')] : []), L(t, 'ap_this', 'id'), L(t, ')'));
      k = e;
      continue;
    }
    out.push(t);
  }
  return out;
}
