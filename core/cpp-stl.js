// Silinx HLS C++ (#1734): what AMD's test benches use of the C++ library, as C tokens for the C simulation (before
// core/cpp-lex.js's other passes; the synthesized code still has fixed sizes, core/c-check.js):
//   std::vector<T> v(n); / v(n, x);   T v[n]; (each element x)   (v[i], v.data(), v.size(): an array's)
//   std::vector<T> &v (a parameter)   T v[]
//   std::generate(begin(v), end(v), f); std::fill(v.begin(), v.end(), x);   a loop over v's elements
//   std::default_random_engine e;     unsigned long long e = 1;   (libstdc++'s minstd_rand0, from 1)
//   std::uniform_int_distribution<T> d(a, b); d(e)   T d[2] = {a, b}; ap_uniform_int(d, &e)   (core/c-interp-lib.js)
// Isomorphic ES module.
//
//   cppStl(tokens, report) -> tokens
import { closing, splitTop } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const L = (t, v, tt = 'op') => ({ ...t, t: tt, v });

export function cppStl(toks, report) {
  const out = [], dists = new Set();
  let fresh = 0;
  // (std::name: its name, the qualifier dropped here)
  const at = (k, name) => (isId(toks[k], 'std') && op(toks[k + 1], '::') && isId(toks[k + 2], name) ? k + 2 : isId(toks[k], name) ? k : -1);
  const loop = (t, x, body) => {
    const i = L(t, `ap_v${fresh++}`, 'id');
    return [L(t, 'for', 'id'), L(t, '('), L(t, 'int', 'id'), i, L(t, '='), L(t, '0', 'num'), L(t, ';'), { ...i }, L(t, '<'), L(t, '('), L(t, 'int', 'id'), L(t, ')'), L(t, '('), ...x, L(t, ')'), L(t, ';'), { ...i }, L(t, '++'), L(t, ')'),
      ...body(i), L(t, ';')];
  };
  /** begin(v) / v.begin() (or end): v's tokens, else null. */
  const ends = (a, which) => {
    const k = isId(a[0], 'std') && op(a[1], '::') && isId(a[2], which) ? 2 : isId(a[0], which) ? 0 : -1;
    if (k >= 0 && op(a[k + 1], '(') && closing(a, k + 1) === a.length - 1) return a.slice(k + 2, -1);
    if (a.length >= 4 && op(a.at(-4), '.') && isId(a.at(-3), which) && op(a.at(-2), '(') && op(a.at(-1), ')')) return a.slice(0, -4);
    return null;
  };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    let j;
    // std::vector<T> …
    if ((j = at(k, 'vector')) >= 0 && op(toks[j + 1], '<')) {
      const e = closing(toks, j + 1);
      const ty = toks.slice(j + 2, e);
      if (op(toks[e + 1], '&') && isId(toks[e + 2])) { out.push(...ty, toks[e + 2], L(t, '['), L(t, ']')); k = e + 2; continue; }
      if (isId(toks[e + 1]) && op(toks[e + 2], '(')) {
        // (each declarator v(n), w(n, x): an array, its elements x)
        let d = e + 1;
        for (;;) {
          const name = toks[d], c = closing(toks, d + 1);
          const args = splitTop(toks.slice(d + 2, c));
          out.push(...ty.map((x) => ({ ...x })), name, L(t, '['), ...args[0], L(t, ']'), L(t, ';'));
          if (args[1]) out.push(...loop(t, args[0], (i) => [{ ...name }, L(t, '['), { ...i }, L(t, ']'), L(t, '='), ...args[1]]));
          if (op(toks[c + 1], ',') && isId(toks[c + 2]) && op(toks[c + 3], '(')) { d = c + 2; continue; }
          if (!op(toks[c + 1], ';')) report(name, `std::vector '${name.v}': declared with its size (std::vector<T> v(n);)`);
          k = op(toks[c + 1], ';') ? c + 1 : c;
          break;
        }
        continue;
      }
      if (isId(toks[e + 1])) report(toks[e + 1], `std::vector '${toks[e + 1].v}' with no size: not supported (declare it with its size, std::vector<T> v(n);)`);
      out.push(...ty);
      k = e;
      continue;
    }
    // std::generate / std::fill over a vector's elements
    const g = at(k, 'generate') >= 0 ? at(k, 'generate') : at(k, 'fill');
    if (g >= 0 && op(toks[g + 1], '(') && !op(toks[k - 1], '.')) {
      const c = closing(toks, g + 1);
      const args = splitTop(toks.slice(g + 2, c));
      const v = args.length === 3 ? ends(args[0], 'begin') : null;
      const v2 = v ? ends(args[1], 'end') : null;
      if (v && v2 && v.map((x) => x.v).join(' ') === v2.map((x) => x.v).join(' ')) {
        const size = [...v.map((x) => ({ ...x })), L(t, '.'), L(t, 'size', 'id'), L(t, '('), L(t, ')')];
        const value = toks[g].v === 'generate' ? [...args[2], L(t, '('), L(t, ')')] : args[2];
        out.push(...loop(t, size, (i) => [...v.map((x) => ({ ...x })), L(t, '['), { ...i }, L(t, ']'), L(t, '='), ...value]).slice(0, -1));
        k = c;
        continue;
      }
    }
    // <random>: its engine and its integer distribution
    if ((j = at(k, 'default_random_engine')) >= 0 && isId(toks[j + 1]) && op(toks[j + 2], ';')) {
      out.push(L(t, 'unsigned', 'id'), L(t, 'long', 'id'), L(t, 'long', 'id'), toks[j + 1], L(t, '='), L(t, '1', 'num'));
      k = j + 1;
      continue;
    }
    if ((j = at(k, 'uniform_int_distribution')) >= 0 && op(toks[j + 1], '<')) {
      const e = closing(toks, j + 1);
      const name = toks[e + 1];
      if (isId(name) && op(toks[e + 2], '(')) {
        const c = closing(toks, e + 2);
        dists.add(name.v);
        out.push(...toks.slice(j + 2, e), name, L(t, '['), L(t, '2', 'num'), L(t, ']'), L(t, '='), L(t, '{'), ...toks.slice(e + 3, c), L(t, '}'));
        k = c;
        continue;
      }
    }
    if (isId(t) && dists.has(t.v) && op(toks[k + 1], '(') && !op(toks[k - 1], '.')) {
      const c = closing(toks, k + 1);
      out.push(L(t, 'ap_uniform_int', 'id'), L(t, '('), t, L(t, ','), L(t, '&'), ...toks.slice(k + 2, c), L(t, ')'));
      k = c;
      continue;
    }
    out.push(t);
  }
  return out;
}
