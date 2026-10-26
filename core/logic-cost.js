// Silinx logic - the cost of a form of a table's output as a circuit (#1427): its gates, each symbol one whatever its
// number of inputs, and its delay, the gates on its longest path, every gate the same delay. As the table's schematic
// draws it (core/logic-sch.js): an inverted input one inverter (NOT, or a NAND / NOR of one input), shared by its uses;
// the NOT of a gate its complement gate (NAND, NOR, XNOR), one gate.

/** { gates, delay } of an expression (core/logic.js parseExpr's nodes). */
export function circuitCost(ast) {
  const inverted = new Set();
  let gates = 0;
  const one = e => (e.t === 'not' ? e.a : (e.t === 'nand' || e.t === 'nor') && e.args.length === 1 ? e.args[0] : null);
  const depth = e => {
    if (e.t === 'const' || e.t === 'var') return 0;
    const x = one(e);
    if (x?.t === 'var') { inverted.add(x.name); return 1; }
    gates++;
    const kids = e.t === 'not' ? (e.a.args || [e.a]) : e.args;
    return 1 + Math.max(...kids.map(depth));
  };
  const delay = depth(ast);
  return { gates: gates + inverted.size, delay };
}

/** The order of two costs for a goal ('gates': the fewest gates, then the least delay; 'delay': the other way). */
export function costOrder(goal) {
  const key = c => (goal === 'delay' ? [c.delay, c.gates] : [c.gates, c.delay]);
  return (a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1]; };
}
