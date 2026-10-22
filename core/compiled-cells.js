// Silinx - the compiled simulator's netlist read (#405: out of compileNetlist in core/compiled-sim.js): the ports,
// the wires' initial values, the cells' outputs as variables (combinational cells, flip-flops, memories, DCMs), the
// memories' read and write ports.
import { CLOCK_CELLS } from './compiled-prims.js';
import { CompileError, COMB, FF, IGNORED, bigOf, int, pbits } from './compiled-helpers.js';

/** { comb, dcms, elems, inputs, mems, ports } of compileNetlist. */
export function mountCells(ctx) {
  const {
    wide, cellName, drive, mod, names, newVar, vars
  } = ctx;

  // ---- ports
  const inputs = [], ports = [];
  for (const [name, p] of Object.entries(mod.ports || {})) {
    if (p.direction === 'inout') throw new CompileError(`the inout port '${name}' (a tristate) cannot be compiled`);
    ports.push({ name, dir: p.direction, bits: p.bits });
    if (p.direction === 'input') {
      const v = newVar(p.bits.length);
      drive(p.bits, v);
      inputs.push({ name, v, w: p.bits.length, kind: vars[v].kind, bits: p.bits });
    }
  }
  // ---- initial values (the init attributes of the wires)
  const init = new Map();
  for (const n of Object.values(mod.netnames || {})) {
    const iv = n.attributes?.init;
    if (iv == null) continue;
    const b = pbits(iv);
    n.bits.forEach((bit, i) => { if (typeof bit === 'number' && b[i]) init.set(bit, 1); });
  }

  // ---- cells: outputs as variables
  const comb = [], elems = [], mems = [], dcms = [];
  for (const [cname, c] of Object.entries(mod.cells || {})) {
    const t = c.type, P = c.parameters || {}, C = c.connections || {};
    if (IGNORED.has(t)) continue;
    names.push(cname);
    if (COMB.has(t)) {
      const v = newVar(C.Y.length);
      drive(C.Y, v);
      comb.push({ name: cname, type: t, P, C, y: v });
    } else if (FF.has(t)) {
      const v = newVar(C.Q.length);
      drive(C.Q, v);
      elems.push({ name: cname, type: t, P, C, q: v, init: bigOf(C.Q.map(b => init.get(b) || 0)) });
    } else if (t === '$mem_v2') {
      mems.push({ name: cname, P, C });
    } else if (CLOCK_CELLS.has(t)) {
      // a DCM (or a PLL, as one): its outputs are variables the clock schedule sets (below)
      const { kind, outputs, waves } = CLOCK_CELLS.get(t), outs = {};
      for (const port of outputs) {
        if (!C[port]?.length) continue;
        outs[port] = newVar(C[port].length);
        drive(C[port], outs[port]);
      }
      dcms.push({ name: cname, P, C, outs, kind, waves });
    } else if (t === '$tribuf' || t === '$_TBUF_') {
      throw new CompileError(`the tristate buffer '${cellName(cname)}' cannot be compiled`);
    } else {
      throw new CompileError(`the cell '${cellName(cname)}' (${t}) has no compiled model`);
    }
  }
  // memories: the read ports' data (asynchronous ports: combinational; synchronous: registers)
  for (const [k, m] of mems.entries()) {
    const P = m.P, C = m.C;
    const width = int(P.WIDTH), size = int(P.SIZE), abits = int(P.ABITS), offset = int(P.OFFSET);
    const nr = int(P.RD_PORTS), nw = int(P.WR_PORTS);
    if (pbits(P.RD_WIDE_CONTINUATION).some(Boolean) || pbits(P.WR_WIDE_CONTINUATION).some(Boolean))
      throw new CompileError(`the memory '${cellName(m.name)}' has wide ports: not compiled yet`);
    const wrClk = pbits(P.WR_CLK_ENABLE);
    for (let j = 0; j < nw; j++) if (!wrClk[j]) throw new CompileError(`the memory '${cellName(m.name)}' has an asynchronous write port: not compiled`);
    Object.assign(m, { k, width, size, abits, offset, nr, nw, kind: wide || width > 32 ? 'b' : 'n' });
    const rdClk = pbits(P.RD_CLK_ENABLE), rdPol = pbits(P.RD_CLK_POLARITY);
    const ce = pbits(P.RD_CE_OVER_SRST), tm = pbits(P.RD_TRANSPARENCY_MASK);
    const rinit = pbits(P.RD_INIT_VALUE), rarst = pbits(P.RD_ARST_VALUE), rsrst = pbits(P.RD_SRST_VALUE);
    for (let i = 0; i < nr; i++) {
      const data = C.RD_DATA.slice(i * width, (i + 1) * width), addr = C.RD_ADDR.slice(i * abits, (i + 1) * abits);
      const v = newVar(width);
      drive(data, v);
      const word = bits => bigOf(bits.slice(i * width, (i + 1) * width));
      if (!rdClk[i]) comb.push({ name: m.name, type: '$memrd', mem: m, addr, y: v });
      else {
        elems.push({ name: m.name, type: '$memrd', mem: m, port: i, addr, q: v, init: word(rinit),
          C: { CLK: [C.RD_CLK[i]], EN: [C.RD_EN[i]], ARST: [C.RD_ARST[i]], SRST: [C.RD_SRST[i]] },
          P: { CLK_POLARITY: String(rdPol[i]) }, arst: word(rarst), srst: word(rsrst), ceOverSrst: !!ce[i],
          transparent: Array.from({ length: nw }, (_, j) => !!tm[i * nw + j]) });
      }
    }
    const wrPol = pbits(P.WR_CLK_POLARITY);
    m.writes = [];
    for (let j = 0; j < nw; j++) {
      const w = { name: m.name, type: '$memwr', mem: m, port: j, C: { CLK: [C.WR_CLK[j]] }, P: { CLK_POLARITY: String(wrPol[j]) },
        addr: C.WR_ADDR.slice(j * abits, (j + 1) * abits), data: C.WR_DATA.slice(j * width, (j + 1) * width), en: C.WR_EN.slice(j * width, (j + 1) * width) };
      m.writes.push(w);
      elems.push(w);
    }
  }
  elems.forEach((e, i) => { e.id = i; });

  return { comb, dcms, elems, inputs, mems, ports };
}
