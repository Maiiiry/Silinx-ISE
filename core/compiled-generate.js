// Silinx - the compiled simulator's code (#405: out of compileNetlist in core/compiled-sim.js): the template of run()
// filled in for the chosen segments, their dirty bits and guards, the quiet flip-flops, the changes an edge commits;
// a run() too long for V8 to optimize split in functions.
import { FF, chunks, conv } from './compiled-helpers.js';

/** { generate } of compileNetlist. */
export function mountGenerate(ctx) {
  const {
    chunk, splitAt, always, cellExpr, inputs, memChars, negMain, posMain, src, templateOf, vars, vk
  } = ctx;

  // ---- the code of the segments (segs: [{ blocks, keys: Set of the values they read, or null: unguarded }]):
  // the template's @@…@@ filled in; prof: the dirty bits counted (H.P), for the segments' choice (segmentsOf)
  const generate = (segs, prof = false, OUT = false) => {
    // the dirty bits: one for the values the same guarded segments read (bit 0: all); one per value in the
    // profile, in the order they are read
    const readers = new Map(), bitOf = new Map(), bits = new Map();
    // (#670: a cell's value read only by its own segment, which runs already, sets no bit)
    const writer = new Map();   // a cell's 'v<var>' -> its segment
    segs.forEach((sg, i) => sg.blocks.forEach(b => b.cells.forEach(n => writer.set(`v${n.y}`, i))));
    segs.forEach((sg, i) => sg.keys?.forEach(k => {
      if (writer.get(k.split('&')[0]) === i) return;
      if (!readers.has(k)) readers.set(k, []);
      readers.get(k).push(i);
    }));
    for (const [k, r] of readers) { const sg = prof ? k : r.join(); if (!bits.has(sg)) bits.set(sg, bits.size + 1); bitOf.set(k, bits.get(sg)); }
    const words = Math.ceil((bits.size + 1) / 32);
    // a value's dirty bits ('v<var>', 'm<memory>'): its keys' bits, each with the mask of the value's bits that set it
    // (null: any bit)
    const byValue = new Map();
    for (const [k, i] of bitOf) {
      const [base, m] = k.split('&'), mask = m == null ? null : Number(m);
      if (!byValue.has(base)) byValue.set(base, new Map());
      const g = byValue.get(base);
      g.set(i, g.has(i) ? (g.get(i) === null || mask === null ? null : g.get(i) | mask) : mask);
    }
    const dirty = (base) => [...(byValue.get(base) || [])].map(([i, mask]) => ({ i, mask, d: `D${i >> 5}`, sh: i & 31, bit: (1 << (i & 31)) | 0, set: `D${i >> 5} |= ${(1 << (i & 31)) | 0};` }));
    // (numbers: the bit set with no branch, from the sign of y | -y)
    const setIf = (f, x) => { const y = f.mask == null ? x : `(${x} & ${f.mask})`; return `{ const y = ${y}; ${f.d} |= ((y | -y) >> 31) & ${f.bit}; }`; };
    const allDirty = Array.from({ length: words }, (_, j) => `D${j} = -1;`).join(' ');
    const clean = Array.from({ length: words }, (_, j) => `D${j} = 0;`).join(' ');
    // (prof: each dirty bit counted in H.P, the evaluations in its last element)
    const profCode = prof ? `{ const P = H.P; P[${words * 32}]++; ${Array.from({ length: words }, (_, j) => `if (D${j}) for (let b = 0; b < 32; b++) P[${j * 32} + b] += (D${j} >>> b) & 1;`).join(' ')} }` : '';
    // the quiet flip-flops: their next value only from cells of guarded segments, the inputs and constants (and
    // their own value, as their kind holds it); with the same values, the next edge gives the value the last one
    // gave, so that one of them changes only after one of those segments ran since the last edge: each segment
    // sets its bit in R<edge><j> (r: the rising edge's flip-flops, f: the falling edge's) when it runs
    const segOf = new Map();   // var -> its segment (guarded) or -1
    segs.forEach((sg, i) => sg.blocks.forEach(b => b.cells.forEach(n => segOf.set(n.y, sg.keys ? i : -1))));
    const inputVars = new Set(inputs.filter(p => !always.has(p.v)).map(p => p.v));
    const quiet = (e) => {
      if (!FF.has(e.type) || !dirty(`v${e.q}`).length) return null;
      const from = new Set();
      for (const [port, bits] of Object.entries(e.C)) {
        if (port === 'CLK' || port === 'Q') continue;
        for (const b of bits) {
          const v = typeof b === 'number' ? src.get(b)?.[0] : null;
          if (v == null || inputVars.has(v)) continue;
          if (!(segOf.get(v) >= 0)) return null;
          from.add(segOf.get(v));
        }
      }
      return from;
    };
    const quietOf = new Map(), ranBit = new Map(), ranBy = { r: new Set(), f: new Set() };
    for (const [edge, els] of [['r', posMain], ['f', negMain]]) {
      for (const e of els) {
        const q = quiet(e);
        if (!q) continue;
        quietOf.set(e, q);
        for (const i of q) { if (!ranBit.has(i)) ranBit.set(i, ranBit.size); ranBy[edge].add(i); }
      }
    }
    const ranWords = Math.ceil(ranBit.size / 32);
    const ranSet = i => ['r', 'f'].filter(edge => ranBy[edge].has(i)).map(edge => `R${edge}${ranBit.get(i) >> 5} |= ${(1 << (ranBit.get(i) & 31)) | 0};`).join(' ');
    const ranDecl = ['r', 'f'].filter(edge => ranBy[edge].size).flatMap(edge => Array.from({ length: ranWords }, (_, j) => `R${edge}${j} = 0`));
    // (each segment's code in pieces of `chunk` characters at most, each piece of a guarded one under its guard: a
    // piece the guard runs needlessly gives the same values)
    const pieces = segs.flatMap((sg, i) => {
      const cells = (ranBit.has(i) ? [ranSet(i)] : []).concat(sg.blocks.flatMap(b => b.cells).map(n => {
        const e = conv(cellExpr(n), n.kind, vars[n.y].kind), fs = dirty(`v${n.y}`);
        if (!fs.length) return `v${n.y} = ${e};`;
        if (vars[n.y].kind === 'b') return `{ const t = ${e}; if (t !== v${n.y}) { ${fs.map(f => f.set).join(' ')} } v${n.y} = t; }`;
        // (a cut's bit with no branch; a 1-bit cell's, the difference shifted)
        if (vars[n.y].w === 1) return `{ const t = ${e}; ${fs.map(f => `${f.d} |= (t ^ v${n.y}) << ${f.sh};`).join(' ')} v${n.y} = t; }`;
        return `{ const t = ${e}, x = t ^ v${n.y}; ${fs.map(f => setIf(f, 'x')).join(' ')} v${n.y} = t; }`;
      }));
      let guard = null;
      if (sg.keys) {
        const mask = new Array(words).fill(0);
        mask[0] = 1;
        for (const k of sg.keys) { const i = bitOf.get(k); if (i != null) mask[i >> 5] |= 1 << (i & 31); }
        guard = mask.map((m, j) => (m ? `(D${j} & ${m})` : '')).filter(Boolean).join(' | ');
      }
      return chunks(cells, chunk).map(c => (guard ? `if (${guard}) {\n${c}\n}` : c));
    });
    // (OUT, a split run(): these pieces in functions inside run(), below)
    const fns = OUT ? chunks(pieces, chunk) : [];
    const combCode = (OUT ? fns.map((_, k) => `CF${k}();`).join(' ') : pieces.join('\n')) + `\n${profCode}\n${clean}`;
    const fnsCode = fns.map((c, k) => `\n  const CF${k} = () => {\n${c}\n  };`).join('');

    // the changes an edge of the main clock commits: one test of the flip-flops of a dirty bit, their bits'
    // differences (the quiet ones when one of their segments ran: R<edge><j>, cleared at the edge)
    const changes = (els, edge) => {
      const by = new Map();
      for (const e of els) {
        if (e.q == null) continue;
        const q = quietOf.get(e), mask = new Array(ranWords).fill(0);
        q?.forEach(i => { const r = ranBit.get(i); mask[r >> 5] |= 1 << (r & 31); });
        for (const f of dirty(`v${e.q}`)) {
          const key = `${f.i} ${q ? mask.join() : ''}`;
          if (!by.has(key)) by.set(key, { f, ran: q ? mask.map((m, j) => (m ? `(R${edge}${j} & ${m})` : '')).filter(Boolean).join(' | ') : null, n: [], b: [] });
          by.get(key)[vk(e)].push([e, f.mask]);
        }
      }
      // (numbers: the bit set with no branch, from the sign of d | -d: a change every other cycle is no
      // mispredicted branch; a flip-flop read in part, the difference of those bits)
      const byRan = new Map();
      for (const { f, ran, n, b } of by.values()) {
        const set = [...(n.length ? [`{ const d = ${n.map(([e, m]) => (m == null ? `(v${e.q} ^ n${e.id})` : `((v${e.q} ^ n${e.id}) & ${m})`)).join(' | ')}; ${f.d} |= ((d | -d) >> 31) & ${f.bit}; }`] : []),
          ...(b.length ? [`if (${b.map(([e]) => `v${e.q} !== n${e.id}`).join(' || ')}) ${f.set}`] : [])].join(' ');
        if (!byRan.has(ran || '')) byRan.set(ran || '', []);
        byRan.get(ran || '').push(set);
      }
      return [...byRan].map(([ran, sets]) => (ran ? `if (${ran}) {\n${sets.join('\n')}\n}` : sets.join('\n'))).join('\n') + (ranBy[edge].size ? `\n${Array.from({ length: ranWords }, (_, j) => `R${edge}${j} = 0;`).join(' ')}` : '');
    };

    const fill = { comb: () => combCode, fns: () => fnsCode, all: () => allDirty, decl: () => `${Array.from({ length: words }, (_, j) => `, D${j} = -1`).join('')}${ranDecl.map(r => `, ${r}`).join('')}`,
      changes: edge => changes(edge === 'r' ? posMain : negMain, edge), set: k => dirty(k).map(f => f.set).join(' ') };
    const code = templateOf(OUT).replace(/@@(\w+)(?: (\w+))?@@/g, (_, what, arg) => fill[what](arg));
    // (#629: a run() of more than splitAt characters, above V8's limit of the bytecode it optimizes (60 KB, about 0.66
    // byte a character), is not optimized: then the values are the code's own, not run()'s, and its combinational
    // cells functions of `chunk` characters at most, inside run(); below it, slower)
    // (#659: the memories' initial values, a table's contents, are no code of run())
    return !OUT && code.length - memChars > splitAt ? generate(segs, prof, true) : code;
  };

  return { generate };
}
