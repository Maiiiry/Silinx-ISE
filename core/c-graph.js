// Silinx HLS (#1525): the graph of a combinational C function: each node an operation on fixed-width integers, shared
// when the same (constant folded, hash-consed), as core/c-dataflow.js builds it and core/c-hdl.js writes it out.
// Isomorphic ES module: no DOM and no Node APIs.
//
// A node: { id, op, args: [ids], w, s, k? (const: its BigInt value), port? (in: the port), hi?, lo? (slice) }.
// The operations (their operands already of the node's width and signedness unless said):
//   const, in, ext (an operand of another width / signedness: truncated or extended by its own signedness),
//   add, sub, and, or, xor, not, neg, mul (the full product: width the sum of the operands'),
//   shl, shr (by args[1], any width; shr arithmetic when signed), eq, ne, lt, le, gt, ge (w 1), mux (c, a, b),
//   slice (bits hi..lo of args[0], unsigned).
import { wrap } from './c-types.js';

/** A C name as a part of an HDL name (VHDL: no '__', no '_' at its ends; ap_r_<name>, ap_m_<name>): _x is u0_x. */
export function hdlName(name) {
  let n = String(name).replace(/^_/, 'u0_').replace(/_$/, '_u0');
  while (n.includes('__')) n = n.replace('__', '_u0_');
  return n;
}

export class Graph {
  constructor() { this.nodes = []; this.keys = new Map(); }
  get(id) { return this.nodes[id]; }
  isConst(id) { return this.nodes[id].op === 'const'; }
  k(id) { return this.nodes[id].k; }
  add(op, args, t, extra = {}) {
    const fold = this.fold(op, args, t, extra);
    if (fold !== undefined) return fold;
    const key = `${op}|${args.join(',')}|${t.w}|${t.s ? 1 : 0}|${extra.port?.key ?? ''}|${extra.hi ?? ''}|${extra.lo ?? ''}`;
    if (this.keys.has(key)) return this.keys.get(key);
    const id = this.nodes.length;
    this.nodes.push({ id, op, args, w: t.w, s: !!t.s, ...extra });
    this.keys.set(key, id);
    return id;
  }
  const(v, t) {
    const k = wrap(BigInt(v), t);
    const key = `const|${k}|${t.w}|${t.s ? 1 : 0}`;
    if (this.keys.has(key)) return this.keys.get(key);
    const id = this.nodes.length;
    this.nodes.push({ id, op: 'const', args: [], w: t.w, s: !!t.s, k });
    this.keys.set(key, id);
    return id;
  }
  /** The value of an operation on constants, or the simpler node it is (x & 1 = x for a bool, mux of a constant
   *  condition…); undefined when it is an operation to make. */
  fold(op, args, t, extra) {
    const n = args.map((a) => this.nodes[a]);
    const allConst = n.length && n.every((x) => x.op === 'const');
    if (op === 'ext') {
      const a = n[0];
      if (a.w === t.w && a.s === !!t.s) return args[0];
      if (a.op === 'const') return this.const(a.k, t);
      return undefined;
    }
    if (op === 'mux') {
      if (n[0].op === 'const') return n[0].k ? args[1] : args[2];
      if (args[1] === args[2]) return args[1];
      // a bool mux of constants: the condition itself, or its negation
      if (t.w === 1 && n[1].op === 'const' && n[2].op === 'const') {
        if (n[1].k === 1n && n[2].k === 0n) return args[0];
        if (n[1].k === 0n && n[2].k === 1n) return this.add('not', [args[0]], t);
      }
      return undefined;
    }
    if (t.w === 1 && (op === 'and' || op === 'or')) {
      for (const [x, y] of [[0, 1], [1, 0]]) {
        if (n[x].op !== 'const') continue;
        if (op === 'and') return n[x].k ? args[y] : this.const(0, t);
        return n[x].k ? this.const(1, t) : args[y];
      }
    }
    if (!allConst) return undefined;
    const [a, b] = n.map((x) => x.k);
    const big = (v) => this.const(v, t);
    switch (op) {
      case 'add': return big(a + b);
      case 'sub': return big(a - b);
      case 'mul': return big(a * b);
      case 'and': return big(a & b);
      case 'or': return big(a | b);
      case 'xor': return big(a ^ b);
      case 'not': return big(~a);
      case 'neg': return big(-a);
      case 'shl': return b >= BigInt(t.w) ? big(0n) : big(a << b);
      case 'shr': return big(b >= BigInt(t.w) ? (a < 0n ? -1n : 0n) : a >> b);
      case 'eq': return big(a === b ? 1n : 0n);
      case 'ne': return big(a !== b ? 1n : 0n);
      case 'lt': return big(a < b ? 1n : 0n);
      case 'le': return big(a <= b ? 1n : 0n);
      case 'gt': return big(a > b ? 1n : 0n);
      case 'ge': return big(a >= b ? 1n : 0n);
      case 'slice': return big((wrap(a, { w: n[0].w, s: false }) >> BigInt(extra.lo)) & ((1n << BigInt(extra.hi - extra.lo + 1)) - 1n));
      default: return undefined;
    }
  }
  /** The nodes the outputs need, in an order where each comes after its operands. */
  needed(roots) {
    const seen = new Set(), out = [];
    const visit = (id) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const a of this.nodes[id].args) visit(a);
      out.push(this.nodes[id]);
    };
    for (const r of roots) visit(r);
    return out;
  }
}
