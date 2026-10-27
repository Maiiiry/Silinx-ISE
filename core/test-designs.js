// The test designs (test-designs/<name>, #1746): designs Silinx itself is tested with, offered as projects to open and
// run, to see what Silinx does with each kind of source: schematics of the schematic corpus (test/schematic-corpus/
// hand/), state diagrams of the diagram corpus's machines (test/diagram-corpus/fsm/*.kiss2) and C / C++ programs for
// Silinx HLS. Each has its test: a self-checking test bench (Simulate: "Simulation finished OK"), or the C's main()
// (C Simulation, C/RTL Co-simulation: it returns 0 when every result is right). They are listed apart from the
// examples (core/examples.js), whose rules they are not held to (every board, ISE with no warnings): none has a board.
// All are Silinx's own (AGPL-3.0-only), never third-party code. Isomorphic.

/** The test designs in the order the interface lists them: [{ name, kind, about }] (kind: schematic, fsm, c). */
export const TEST_DESIGNS = [
  { name: 'bus_taps', kind: 'schematic', about: 'bus taps of one bit and of several, bits reversed through a bus join, a tap into a gate' },
  { name: 'bus_join', kind: 'schematic', about: 'bus joins of parts of several widths, a join of joins, a bus split again' },
  { name: 'gates_inverted', kind: 'schematic', about: 'gates of 2 to 5 inputs, inverted inputs (AND2B1, OR3B2, NAND3B1, AND4B2), NOR, XOR, XNOR, bitwise gates' },
  { name: 'mux_dec', kind: 'schematic', about: 'multiplexers (M2_1 of a width, M4_1, M8_1 with an enable), a decoder, a priority encoder, a demultiplexer' },
  { name: 'arith', kind: 'schematic', about: 'an adder with carry in and out, a subtractor with borrow out, comparators unsigned and signed' },
  { name: 'flipflops', kind: 'schematic', about: 'FD, FDC, FDCE, FDRE, FDPE, FTCE, a register, up and down counters, the clock through a BUFG' },
  { name: 'full_adder', kind: 'schematic', about: 'hierarchy: a full adder of two half adders, each a schematic of its own' },
  { name: 'det1011', kind: 'fsm', about: 'a Mealy sequence detector of 1011 (overlapping), a state diagram' },
  { name: 'vending', kind: 'fsm', about: 'a vending machine (30 cents; coins of 5, 10 and 25), its change given, a state diagram' },
  { name: 'johnson16', kind: 'fsm', about: 'a 16-state Johnson counter with an enable and a direction, a state diagram' },
  { name: 'gcd', kind: 'c', about: 'C: the greatest common divisor, a loop of a count the data decide (a state machine)' },
  { name: 'popcount', kind: 'c', about: 'C: the 1 bits of a word, an unrolled loop (combinational)' },
  { name: 'fir', kind: 'c', about: 'C: a 4-tap FIR filter, its delay line a static array (registers kept from call to call)' },
  { name: 'sort', kind: 'c', about: 'C: a bubble sort of an array in place (a memory port)' },
  { name: 'stream_sum', kind: 'c', about: 'C++: running sums of a stream of samples (hls::stream, FIFO ports)' },
];

export const TEST_DESIGN_ORDER = TEST_DESIGNS.map((d) => d.name);

/** Test design names in the listing order: the known ones first (TEST_DESIGN_ORDER), then any other, by name. */
export function orderTestDesigns(names) {
  const rank = (n) => { const i = TEST_DESIGN_ORDER.indexOf(n); return i < 0 ? TEST_DESIGN_ORDER.length : i; };
  return [...names].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}
