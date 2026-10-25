// #3, the measured description: observation designs for the pins the measured graph still lacks, implemented by ISE from
// HDL (impl-remote.sh). Each is a pin on a dedicated connection the earlier designs never took, or took with another sink
// of its net in the same tile (observe.mjs reads a sink pin only when it is its net's one sink there):
//   srlcasc:  a 64-bit shift register in every CLB (AREA_GROUP: its four slices): map cascades the SLICEMs' SRL16s
//             through SHIFTOUT -> SHIFTIN
//   f8-0/1:   a 32:1 multiplexer in every pair of CLBs one above the other (MUXF8: FXINA / FXINB from the two F7s), the
//             pairs from row 0 or 1
//   ramclkb:  every block RAM (LOC'd) a RAMB16_S1_S1 with port B on a clock of its own (CLKB its net's one sink there)
//   bufg-l/r/t/b: every BUFGMUX of one clock tile (LOC'd), its I0, I1 and S on signals of their own, its O a clock
//   node gen-obspins2.mjs outdir      (folders srlcasc, f8-0, f8-1, ramclkb, bufg-l, bufg-r, bufg-t, bufg-b)
import fs from 'node:fs';
import { loadDeviceCache } from '../../core/fpga/device-node.js';
import { wrap } from './gen-obspins.mjs';

const PART = process.env.PART || 'xc3s250ecp132-4';
const xy = s => s.match(/X(\d+)Y(\d+)$/).slice(1).map(Number);
const sitesOf = (dev, type) => dev.sites(type).map(s => s.name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

/** The CLBs as their lower-left slice's x, y (the SLICEM's: x even, y even), with all four slices present. */
function clbs(dev) {
  const have = new Set([...dev.sites('SLICEL'), ...dev.sites('SLICEM')].map(s => s.name));
  const out = [];
  for (const s of have) {
    const [x, y] = xy(s);
    if (x % 2 || y % 2) continue;
    if ([[1, 0], [0, 1], [1, 1]].every(([a, b]) => have.has(`SLICE_X${x + a}Y${y + b}`))) out.push([x, y]);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** A 64-bit shift register in every CLB, each its own input and output: { v, ucf, n }. */
export function srlCascade(dev, part = PART) {
  const cs = clbs(dev);
  const body = cs.map((c, i) => `  wire r${i};\n  srl64 u${i} (.clk(clk), .d(s[${i}]), .q(r${i}));`).join('\n');
  const v = `(* KEEP_HIERARCHY = "TRUE" *)
module srl64(input clk, input d, output q);
  reg [63:0] r = 0;
  always @(posedge clk) r <= {r[62:0], d};
  assign q = r[63];
endmodule

` + wrap(part, 'a 64-bit shift register in every CLB (SHIFTOUT -> SHIFTIN)', cs.length + 8, '', body, cs.map((c, i) => `r${i}`));
  const ucf = cs.map(([x, y], i) => `INST "u${i}" AREA_GROUP = "ag${i}" ;\nAREA_GROUP "ag${i}" RANGE = SLICE_X${x}Y${y}:SLICE_X${x + 1}Y${y + 1} ;`).join('\n') + '\n';
  return { v, ucf, n: cs.length };
}

/** A 32:1 multiplexer in every pair of CLBs one above the other from row `off` (0 or 1), each with its data and selects
 *  permuted (or XST merges them): { v, ucf, n }. */
export function f8Muxes(dev, off, part = PART) {
  const have = new Set(clbs(dev).map(c => c.join(',')));
  const pairs = clbs(dev).filter(([x, y]) => (y / 2) % 2 === off && have.has(`${x},${y + 2}`));
  // (data d[0..31] and selects d[32..36] of s, rotated by i and by i / 32)
  const body = pairs.map((p, i) => {
    const data = Array.from({ length: 32 }, (_, k) => `s[${(k + i) % 32}]`).reverse().join(', ');
    const sel = Array.from({ length: 5 }, (_, k) => `s[${32 + (k + (i >> 5)) % 5}]`).reverse().join(', ');
    return `  wire m${i};\n  mux32 u${i} (.d({${data}}), .s({${sel}}), .o(m${i}));`;
  }).join('\n');
  const v = `(* KEEP_HIERARCHY = "TRUE" *)
module mux32(input [31:0] d, input [4:0] s, output o);
  assign o = d[s];
endmodule

` + wrap(part, `a 32:1 multiplexer (MUXF8) in every pair of CLBs from row ${off}`, 40, '', body, pairs.map((p, i) => `m${i}`));
  const ucf = pairs.map(([x, y], i) => `INST "u${i}" AREA_GROUP = "ag${i}" ;\nAREA_GROUP "ag${i}" RANGE = SLICE_X${x}Y${y}:SLICE_X${x + 1}Y${y + 3} ;`).join('\n') + '\n';
  return { v, ucf, n: pairs.length };
}

/** Every block RAM a RAMB16_S1_S1, port A on clk, port B on clk2 (a second global clock): { v, ucf, n }. */
export function ramClkB(dev, part = PART) {
  const rams = sitesOf(dev, 'RAMB16');
  let k = 0;
  const sig = w => { const a = k; k += w; return w === 1 ? `s[${a}]` : `s[${a + w - 1}:${a}]`; };
  const body = rams.map((s, i) => {
    const port = (p, c) => `.CLK${p}(${c}), .ADDR${p}(${sig(14)}), .DI${p}(${sig(1)}), .WE${p}(${sig(1)}), .EN${p}(${sig(1)}), .SSR${p}(${sig(1)}), .DO${p}(o${i}${p})`;
    return `  wire o${i}A, o${i}B;\n  RAMB16_S1_S1 u${i} (${port('A', 'clk')},\n    ${port('B', 'ck2')});`;
  }).join('\n');
  const v = wrap(part, 'every block RAM a RAMB16_S1_S1, port B on a clock of its own', rams.length * 36 + 8, ', input clk2', body,
    rams.flatMap((s, i) => [`o${i}A`, `o${i}B`]), '  wire ck2;\n  BUFG u_c2 (.I(clk2), .O(ck2));\n');
  return { v, ucf: rams.map((s, i) => `INST "u${i}" LOC = "${s}" ;`).join('\n') + '\n', n: rams.length };
}

/** Every BUFGMUX of the clock tile with prefix `prefix` (CLKL, CLKR, CLKT, CLKB), LOC'd, its inputs and select on signals
 *  of their own, its output the clock of a register: { v, ucf, n }. */
export function bufgs(dev, prefix, part = PART) {
  const sites = sitesOf(dev, 'BUFGMUX').filter(s => dev.tileNames[dev.site(s).tile].startsWith(`${prefix}_`));
  const body = sites.map((s, i) => `  wire g${i}; reg r${i} = 0;
  BUFGMUX u${i} (.I0(s[${3 * i}]), .I1(s[${3 * i + 1}]), .S(s[${3 * i + 2}]), .O(g${i}));
  always @(posedge g${i}) r${i} <= s[${3 * i + 3}];`).join('\n');
  const v = wrap(part, `every BUFGMUX of the ${prefix} tile, every pin used`, 3 * sites.length + 9, '', body, sites.map((s, i) => `r${i}`));
  return { v, ucf: sites.map((s, i) => `INST "u${i}" LOC = "${s}" ;`).join('\n') + '\n', n: sites.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [out] = process.argv.slice(2);
  const dev = loadDeviceCache(PART);
  const designs = [['srlcasc', () => srlCascade(dev)], ['f8-0', () => f8Muxes(dev, 0)], ['f8-1', () => f8Muxes(dev, 1)], ['ramclkb', () => ramClkB(dev)],
    ...['CLKL', 'CLKR', 'CLKT', 'CLKB'].map(p => [`bufg-${p.slice(3).toLowerCase()}`, () => bufgs(dev, p)])];
  for (const [name, f] of designs) {
    const { v, ucf, n } = f();
    fs.mkdirSync(`${out}/${name}`, { recursive: true });
    fs.writeFileSync(`${out}/${name}/top.v`, v);
    fs.writeFileSync(`${out}/${name}/top.ucf`, ucf);
    console.log(`${name}: ${n}`);
  }
}
