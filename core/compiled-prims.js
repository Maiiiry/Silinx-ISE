// Silinx - the Xilinx primitives in the compiled cycle simulator (core/compiled-sim.js, #429): synthesizable
// Verilog models, flattened into the design by Yosys `prep`, that compute what Silinx's UNISIM models
// (core/unisim.js, the event-driven simulator's) compute, with two-state values; and the DCM and the PLL, kept by
// Yosys as black boxes, as a schedule of their output clocks' edges in the main clock's cycles (dcmSchedule).
//
//   - the buffers are wires (BUFGMUX a multiplexer, BUFGCE an AND / OR with its enable);
//   - RAMB16_Sw / RAMB16_Sm_Sn: the 16 Kbit as 512 words of 32 data bits and 512 of 4 parity bits (their
//     contents, INIT_xx / INITP_xx, written into the netlist's memories after Yosys: bramInit), every port
//     reading and writing its part of a word (a port of w bits: word ADDR >> log2(32 / w)), as the ports
//     share the bits whatever their widths; INIT_xx / INITP_xx, INIT, SRVAL, WRITE_MODE; on one edge the
//     reads of both ports, then the writes, port B's last (its always block written first: Yosys numbers the
//     write ports of different processes from the last one, and the compiled code commits them in that order);
//   - MULT18X18 / MULT18X18S / MULT18X18SIO (AREG, BREG, PREG, B_INPUT), SRL16* (and _1), RAMnX1S / RAMnX1D, IDDR2 / ODDR2 (#96).
//   - a synthesized netlist's logic (the Post-Synthesis Simulation Model, #561): LUT1-6 (_L, _D), the flip-flops
//     FD* and latches LD* (and _1) with their INIT, MUXCY, MUXF5-8, XORCY (_L, _D), MULT_AND. Not the tristate
//     buffers (OBUFT, IOBUF) and pulls, which the compiled simulator cannot run.
//   - the SIMPRIM primitives of the post-translate, post-map and post-place & route models (#627): the ones with a
//     UNISIM twin written as it (simprimCell: block RAMs, MULT18X18SIO, SRL16s, distributed RAMs, DCMs), the
//     others as the models below (X_LUT1-6, X_FF, X_SFF, X_LATCH, X_LATCHE, buffers and gates), as unisim.js's.
//     Not X_OBUFT, X_TRI and the pulls.
//
//   - the Spartan-6 primitives (#720): core/compiled-prims-s6.js (CARRY4, SRLC32E, DSP48A1, RAMB8BWER / RAMB16BWER,
//     BUFIO2…; PLL_BASE's clocks: pllWaves, #845).
//
// Isomorphic ES module (browser + Node), no DOM.

import { PRIMITIVE_MODELS_S6, BWER_MEMORIES, PLL_OUTPUTS } from './compiled-prims-s6.js';

const hex2 = (k) => k.toString(16).toUpperCase().padStart(2, '0');
const BRAM_W = { 1: [1, 0, 14], 2: [2, 0, 13], 4: [4, 0, 12], 9: [8, 1, 11], 18: [16, 2, 10], 36: [32, 4, 9] };   // data, parity, address bits (as unisim.js)
const BW = [1, 2, 4, 9, 18, 36];

function bram(ws) {
  const dual = ws.length === 2;
  const name = `RAMB16_${ws.map((w) => `S${w}`).join('_')}`;
  const parity = ws.some((w) => BRAM_W[w][1]);
  const params = [], ports = [], body = [], writes = [];
  ws.forEach((w, k) => {
    const [dw, pw, aw] = BRAM_W[w];
    const x = dual ? 'AB'[k] : '', g = dual ? `_${x}` : '';
    const iw = 4 * Math.ceil((dw + pw) / 4);
    const s = Math.log2(32 / dw);   // the address bits within a word
    params.push(`parameter [${iw - 1}:0] INIT${g} = ${iw}'h0`, `parameter [${iw - 1}:0] SRVAL${g} = ${iw}'h0`, `parameter WRITE_MODE${g} = "WRITE_FIRST"`);
    ports.push(`output [${dw - 1}:0] DO${x}`, ...(pw ? [`output [${pw - 1}:0] DOP${x}`] : []), `input [${aw - 1}:0] ADDR${x}`, `input CLK${x}`,
      `input [${dw - 1}:0] DI${x}`, ...(pw ? [`input [${pw - 1}:0] DIP${x}`] : []), `input EN${x}`, `input SSR${x}`, `input WE${x}`);
    const wa = s ? `ADDR${x}[${aw - 1}:${s}]` : `ADDR${x}`;
    // (the offset in the word: the low address bits times the width)
    const times = (w) => (!s ? '0' : w === 1 ? `ADDR${x}[${s - 1}:0]` : `{ADDR${x}[${s - 1}:0], ${Math.log2(w)}'d0}`);
    const off = times(dw), poff = times(pw);
    body.push(`  reg [${dw - 1}:0] do${x} = INIT${g}[${dw - 1}:0];`, `  assign DO${x} = do${x};`,
      ...(pw ? [`  reg [${pw - 1}:0] dop${x} = INIT${g}[${dw + pw - 1}:${dw}];`, `  assign DOP${x} = dop${x};`] : []),
      `  wire [8:0] wa${x} = ${wa};`, `  wire [4:0] off${x} = ${off};`, ...(pw ? [`  wire [1:0] poff${x} = ${poff};`] : []),
      `  always @(posedge CLK${x}) if (EN${x}) begin
    if (SSR${x}) begin do${x} <= SRVAL${g}[${dw - 1}:0];${pw ? ` dop${x} <= SRVAL${g}[${dw + pw - 1}:${dw}];` : ''} end
    else if (!WE${x} || WRITE_MODE${g} == "READ_FIRST") begin do${x} <= mem[wa${x}] >> off${x};${pw ? ` dop${x} <= par[wa${x}] >> poff${x};` : ''} end
    else if (WRITE_MODE${g} == "WRITE_FIRST") begin do${x} <= DI${x};${pw ? ` dop${x} <= DIP${x};` : ''} end
  end`);
    writes.push(`  always @(posedge CLK${x}) if (EN${x} && WE${x}) begin mem[wa${x}][off${x} +: ${dw}] <= DI${x};${pw ? ` par[wa${x}][poff${x} +: ${pw}] <= DIP${x};` : ''} end`);
  });
  params.push('parameter SIM_COLLISION_CHECK = "ALL"', ...Array.from({ length: 64 }, (_, k) => `parameter [255:0] INIT_${hex2(k)} = 256'h0`),
    ...(parity ? Array.from({ length: 8 }, (_, k) => `parameter [255:0] INITP_${hex2(k)} = 256'h0`) : []));
  return `module ${name} #(
  ${params.join(',\n  ')}
) (
  ${ports.join(',\n  ')}
);
  // (two words of opposite bits, so that Yosys keeps every bit of a memory with no write port, a ROM, as it
  // keeps the bits that change; the contents are bramInit's)
  reg [31:0] mem [0:511];${parity ? '\n  reg [3:0] par [0:511];' : ''}
  initial begin mem[0] = 32'h0; mem[1] = ~32'h0;${parity ? " par[0] = 4'h0; par[1] = 4'hF;" : ''} end
${body.join('\n')}
${writes.reverse().join('\n')}
endmodule`;
}

const MULTS = [
  'module MULT18X18(input signed [17:0] A, input signed [17:0] B, output signed [35:0] P); assign P = A * B; endmodule',
  `module MULT18X18S(input signed [17:0] A, input signed [17:0] B, input C, CE, R, output reg signed [35:0] P = 36'd0);
  always @(posedge C) if (R) P <= 36'd0; else if (CE) P <= A * B;
endmodule`,
  `module MULT18X18SIO #(parameter integer AREG = 1, parameter integer BREG = 1, parameter integer PREG = 1, parameter B_INPUT = "DIRECT") (
  input signed [17:0] A, input signed [17:0] B, input [17:0] BCIN, input CEA, CEB, CEP, CLK, RSTA, RSTB, RSTP,
  output [17:0] BCOUT, output [35:0] P);
  reg signed [17:0] a_r = 18'd0, b_r = 18'd0;
  reg [35:0] p_r = 36'd0;
  wire signed [17:0] b_in = B_INPUT == "CASCADE" ? BCIN : B;
  wire signed [17:0] a_m = AREG == 1 ? a_r : A, b_m = BREG == 1 ? b_r : b_in;
  wire signed [35:0] prod = a_m * b_m;
  assign BCOUT = b_m;
  assign P = PREG == 1 ? p_r : prod;
  always @(posedge CLK) begin
    if (RSTA) a_r <= 18'd0; else if (CEA) a_r <= A;
    if (RSTB) b_r <= 18'd0; else if (CEB) b_r <= b_in;
    if (RSTP) p_r <= 36'd0; else if (CEP) p_r <= prod;
  end
endmodule`,
];

/**
 * The block RAMs' contents (their INIT_xx / INITP_xx) as the INIT of their memories in the netlist (Yosys's
 * JSON, changed in place), from toVerilog's instances: Yosys derives a module with 512 initial assignments
 * slowly (about 0.2 s a block RAM), these are the same bits.
 */
export function bramInit(json, top, instances) {
  const cells = json.modules[top]?.cells || {};
  const bits = (lit, w) => {
    const m = /^(\d+)'([hbd])([0-9a-fA-F_xz]+)$/.exec(String(lit ?? '0').replace(/\s/g, ''));
    const v = m ? BigInt(m[2] === 'h' ? `0x${m[3].replace(/[_xz]/gi, '0')}` : m[2] === 'b' ? `0b${m[3].replace(/[_xz]/gi, '0')}` : m[3]) : 0n;
    return BigInt.asUintN(w, v).toString(2).padStart(w, '0');
  };
  for (const { cell, name, params } of instances) {
    // (the Spartan-6 block RAMs: core/compiled-prims-s6.js, their INIT_xx / INITP_xx counts)
    const s6 = BWER_MEMORIES[cell];
    if (!s6 && !/^RAMB16_S\d+(_S\d+)?$/.test(cell)) continue;
    for (const [mem, prefix, n] of [['mem', 'INIT', s6?.inits ?? 64], ['par', 'INITP', s6?.initps ?? 8]]) {
      const c = cells[`${name}.${mem}`];
      if (!c || c.type !== '$mem_v2') continue;
      // (the most significant word first: INIT_3F … INIT_00)
      c.parameters.INIT = Array.from({ length: n }, (_, k) => bits(params[`${prefix}_${hex2(n - 1 - k)}`], 256)).join('');
    }
  }
  return json;
}

// shift-register LUTs: SRL16 (E: clock enable, C: cascade output Q15, _1: falling edge)
const srl = (name, { ce, q15, falling }) => `module ${name} #(parameter [15:0] INIT = 16'h0000) (input A0, A1, A2, A3,${ce ? ' CE,' : ''} CLK, D, output Q${q15 ? ', output Q15' : ''});
  reg [15:0] r = INIT;
  always @(${falling ? 'negedge' : 'posedge'} CLK)${ce ? ' if (CE)' : ''} r <= {r[14:0], D};
  assign Q = r[{A3, A2, A1, A0}];${q15 ? '\n  assign Q15 = r[15];' : ''}
endmodule`;

// distributed RAM, 1 bit wide, 2^n words: single port (A, D, WCLK, WE, O) or dual port (+ DPRA, SPO / DPO)
const dram = (name, n, { dual = false, falling = false } = {}) => {
  const A = (p) => Array.from({ length: n }, (_, i) => `${p}${i}`);
  const addr = (p) => `{${A(p).reverse().join(', ')}}`;
  return `module ${name} #(parameter [${2 ** n - 1}:0] INIT = ${2 ** n}'h0) (input ${[...A('A'), ...(dual ? A('DPRA') : [])].join(', ')}, D, WCLK, WE, output ${dual ? 'SPO, output DPO' : 'O'});
  reg [${2 ** n - 1}:0] m = INIT;
  always @(${falling ? 'negedge' : 'posedge'} WCLK) if (WE) m[${addr('A')}] <= D;
  ${dual ? `assign SPO = m[${addr('A')}];\n  assign DPO = m[${addr('DPRA')}];` : `assign O = m[${addr('A')}];`}
endmodule`;
};

const wire = (name) => `module ${name}(output O, input I); assign O = I; endmodule`;

// the logic of a synthesized netlist (the Post-Synthesis Simulation Model, #561), as unisim.js's models:
// LUT1-6 (_L: LO, _D: O and LO) reading their INIT at the inputs' value (I0 its least significant bit)
const lut = (n, v) => {
  const outs = v === '_L' ? ['LO'] : v === '_D' ? ['O', 'LO'] : ['O'];
  const ins = Array.from({ length: n }, (_, i) => `I${i}`);
  return `module LUT${n}${v} #(parameter [${2 ** n - 1}:0] INIT = ${2 ** n}'h0) (output ${outs.join(', ')}, input ${ins.join(', ')});
${outs.map((o) => `  assign ${o} = INIT[{${[...ins].reverse().join(', ')}}];`).join('\n')}
endmodule`;
};
// a 2:1 multiplexer or an XOR of the carry chain (_L: LO, _D: O and LO): MUXCY (S ? CI : DI), MUXF5-8 (S ? I1 : I0), XORCY
const cell2 = (name, ins, expr) => ['', '_L', '_D'].map((v) => [`${name}${v}`, `module ${name}${v}(${v === '_L' ? 'output LO' : v === '_D' ? 'output O, LO' : 'output O'}, input ${ins});
${(v === '_L' ? ['LO'] : v === '_D' ? ['O', 'LO'] : ['O']).map((o) => `  assign ${o} = ${expr};`).join('\n')}
endmodule`]);
// flip-flops (as unisim.js FFS): CLR before PRE, asynchronous; R before S, synchronous, before CE; _1: the
// falling edge; INIT the value after configuration (1 for FDP, FDPE, FDS, FDSE)
const FFS = [
  ['FD', ''], ['FDC', 'CLR'], ['FDCE', 'CE CLR'], ['FDE', 'CE'], ['FDP', 'PRE'], ['FDPE', 'CE PRE'],
  ['FDR', 'R'], ['FDRE', 'CE R'], ['FDS', 'S'], ['FDSE', 'CE S'], ['FDRS', 'R S'], ['FDRSE', 'CE R S'],
  ['FDCP', 'CLR PRE'], ['FDCPE', 'CE CLR PRE'],
];
const ff = (base, pins, falling) => {
  const has = (p) => pins.split(' ').includes(p);
  const edge = falling ? 'negedge' : 'posedge';
  // (CLR and PRE: one asynchronous load, of 0 when CLR, which Yosys makes without its "complex async reset" warning)
  const both = has('CLR') && has('PRE');
  const sens = [`${edge} C`, ...(both ? ['posedge l'] : has('CLR') ? ['posedge CLR'] : has('PRE') ? ['posedge PRE'] : [])].join(' or ');
  const steps = [...(both ? ['if (l) q <= !CLR;'] : has('CLR') ? ["if (CLR) q <= 1'b0;"] : has('PRE') ? ["if (PRE) q <= 1'b1;"] : []),
    ...(has('R') ? ["if (R) q <= 1'b0;"] : []), ...(has('S') ? ["if (S) q <= 1'b1;"] : []), has('CE') ? 'if (CE) q <= D;' : 'q <= D;'];
  return `module ${base}${falling ? '_1' : ''} #(parameter [0:0] INIT = 1'b${['FDP', 'FDPE', 'FDS', 'FDSE'].includes(base) ? 1 : 0}) (output Q, input C, ${pins.split(' ').filter(Boolean).map((p) => `${p}, `).join('')}D);
  reg q = INIT;
  assign Q = q;${both ? '\n  wire l = CLR | PRE;' : ''}
  always @(${sens}) ${steps.join(' else ')}
endmodule`;
};
// transparent latches (as unisim.js LATCHES): CLR or PRE, then the gate G (_1: active low) and GE; INIT 1 for LDP, LDPE
const LATCHES = [['LD', ''], ['LDC', 'CLR'], ['LDCE', 'CLR GE'], ['LDE', 'GE'], ['LDP', 'PRE'], ['LDPE', 'PRE GE']];
const latch = (base, pins, inverted) => {
  const has = (p) => pins.split(' ').includes(p);
  const en = `${inverted ? '!G' : 'G'}${has('GE') ? ' && GE' : ''}`;
  const steps = [...(has('CLR') ? ["if (CLR) q = 1'b0;"] : []), ...(has('PRE') ? ["if (PRE) q = 1'b1;"] : []), `if (${en}) q = D;`];
  return `module ${base}${inverted ? '_1' : ''} #(parameter [0:0] INIT = 1'b${base.startsWith('LDP') ? 1 : 0}) (output Q, input G, ${pins.split(' ').filter(Boolean).map((p) => `${p}, `).join('')}D);
  reg q = INIT;
  assign Q = q;
  always @* ${steps.join(' else ')}
endmodule`;
};

// the DDR registers (#96, as unisim.js's): IDDR2 (D into Q0 on C0, into Q1 on C1; DDR_ALIGNMENT C0 / C1: the other
// output retimed to that clock) and ODDR2 (D0 on C0, D1 on C1, Q the first while C0 is high; C0 / C1: both inputs
// captured on that clock first); R before S, asynchronous with SRTYPE ASYNC, before CE
const DDR_PARAMS = 'parameter DDR_ALIGNMENT = "NONE", parameter SRTYPE = "SYNC"';
const ddrReg = (q, clk, d) => `  always @(posedge ${clk} or posedge l) if (l) ${q} <= !R; else if (R) ${q} <= 1'b0; else if (S) ${q} <= 1'b1; else if (CE) ${q} <= ${d};`;
const IDDR2 = `module IDDR2 #(${DDR_PARAMS}, parameter [0:0] INIT_Q0 = 1'b0, parameter [0:0] INIT_Q1 = 1'b0) (output Q0, Q1, input C0, C1, CE, D, R, S);
  reg q0 = INIT_Q0, q1 = INIT_Q1, q0a = INIT_Q0, q1a = INIT_Q1;
  wire l = SRTYPE == "ASYNC" && (R | S);
${ddrReg('q0', 'C0', 'D')}
${ddrReg('q1', 'C1', 'D')}
  always @(posedge C0) q1a <= q1;
  always @(posedge C1) q0a <= q0;
  assign Q0 = DDR_ALIGNMENT == "C1" ? q0a : q0;
  assign Q1 = DDR_ALIGNMENT == "C0" ? q1a : q1;
endmodule`;
const ODDR2 = `module ODDR2 #(${DDR_PARAMS}, parameter [0:0] INIT = 1'b0) (output Q, input C0, C1, CE, D0, D1, R, S);
  reg q0 = INIT, q1 = INIT, d0c = 1'b0, d1c = 1'b0;
  wire l = SRTYPE == "ASYNC" && (R | S);
  always @(posedge C0) d1c <= D1;
  always @(posedge C1) d0c <= D0;
${ddrReg('q0', 'C0', 'DDR_ALIGNMENT == "C1" ? d0c : D0')}
${ddrReg('q1', 'C1', 'DDR_ALIGNMENT == "C0" ? d1c : D1')}
  assign Q = C0 ? q0 : q1;
endmodule`;

// SIMPRIM's logic (#627), as unisim.js's models: X_LUT1-6 reading INIT at ADR0.. (ADR0 its least significant bit);
// the flip-flops' asynchronous RST before SET, then (X_SFF) the synchronous SRST before SSET, before CE; the latches'
// RST before SET, then the gate CLK (and GE)
const xlut = (n) => {
  const ins = Array.from({ length: n }, (_, i) => `ADR${i}`);
  return `module X_LUT${n} #(parameter [${2 ** n - 1}:0] INIT = ${2 ** n}'h0) (output O, input ${ins.join(', ')});
  assign O = INIT[{${[...ins].reverse().join(', ')}}];
endmodule`;
};
const xff = (name, sync) => `module ${name} #(parameter [0:0] INIT = 1'b0) (output O, input I, CE, CLK, SET, RST${sync ? ', SSET, SRST' : ''});
  reg q = INIT;
  assign O = q;
  wire l = RST | SET;
  always @(posedge CLK or posedge l) if (l) q <= !RST; else ${sync ? "if (SRST) q <= 1'b0; else if (SSET) q <= 1'b1; else " : ''}if (CE) q <= I;
endmodule`;
const xlatch = (name, ge) => `module ${name} #(parameter [0:0] INIT = 1'b0) (output O, input I,${ge ? ' GE,' : ''} CLK, SET, RST);
  reg q = INIT;
  assign O = q;
  always @* if (RST) q = 1'b0; else if (SET) q = 1'b1; else if (CLK${ge ? ' && GE' : ''}) q = I;
endmodule`;
const SIMPRIM_MODELS = {
  ...Object.fromEntries(['X_BUF', 'X_CKBUF', 'X_IPAD', 'X_OPAD', 'X_BUFGP', 'X_OBUF'].map((b) => [b, wire(b)])),
  X_INV: 'module X_INV(output O, input I); assign O = ~I; endmodule',
  X_ZERO: "module X_ZERO(output O); assign O = 1'b0; endmodule",
  X_ONE: "module X_ONE(output O); assign O = 1'b1; endmodule",
  X_ROC: "module X_ROC(output O); assign O = 1'b0; endmodule",
  X_TOC: "module X_TOC(output O); assign O = 1'b0; endmodule",
  X_AND2: 'module X_AND2(output O, input I0, I1); assign O = I0 & I1; endmodule',
  X_OR2: 'module X_OR2(output O, input I0, I1); assign O = I0 | I1; endmodule',
  X_XOR2: 'module X_XOR2(output O, input I0, I1); assign O = I0 ^ I1; endmodule',
  X_MUX2: 'module X_MUX2(output O, input IA, IB, SEL); assign O = SEL ? IB : IA; endmodule',
  X_BUFGMUX: 'module X_BUFGMUX #(parameter CLK_SEL_TYPE = "SYNC") (output O, input I0, I1, S); assign O = S ? I1 : I0; endmodule',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`X_LUT${n}`, xlut(n)])),
  X_FF: xff('X_FF', false), X_SFF: xff('X_SFF', true),
  X_LATCH: xlatch('X_LATCH', false), X_LATCHE: xlatch('X_LATCHE', true),
};
// the generics of every SIMPRIM primitive that place it or time it, which change nothing here
const SIMPRIM_ONLY = new Set(['LOC', 'PATHPULSE', 'SETUP_ALL', 'SETUP_READ_FIRST', 'INIT_FILE', 'IOSTANDARD', 'CAPACITANCE', 'DRIVE', 'SLEW']);
/**
 * The cell a SIMPRIM primitive is compiled as (#627): { name, ports: { SIMPRIM pin: the cell's }, param(NAME): kept }
 * (upper case names), null when it has no model here. Those with a UNISIM twin are written as it (its model above, a
 * block RAM's contents, a DCM's schedule): X_RAMB16_S*, X_MULT18X18SIO, X_SRL16E, X_SRLC16E, X_RAMSn / X_RAMDn
 * (RAMnX1S / RAMnX1D), X_DCM_SP, X_DCM.
 */
export function simprimCell(name) {
  const keep = (p) => !SIMPRIM_ONLY.has(p);
  let m;
  if ((m = /^X_(RAMB16_S\d+(_S\d+)?|MULT18X18SIO|SRLC?16E|DCM_SP|DCM)$/.exec(name)) && PRIMITIVE_MODELS[m[1]]) return { name: m[1], ports: {}, param: keep };
  if ((m = /^X_RAM([SD])(16|32|64)$/.exec(name))) {
    const n = Math.log2(+m[2]), ports = { I: 'D', CLK: 'WCLK' };
    for (let i = 0; i < n; i++) {
      if (m[1] === 'S') ports[`ADR${i}`] = `A${i}`;
      else { ports[`WADR${i}`] = `A${i}`; ports[`RADR${i}`] = `DPRA${i}`; }
    }
    if (m[1] === 'D') ports.O = 'DPO';
    return { name: `RAM${m[2]}X1${m[1]}`, ports, param: keep };
  }
  return SIMPRIM_MODELS[name] ? { name, ports: {}, param: keep } : null;
}

// the DCM: a black box (compileNetlist schedules its outputs), its generics as unisim.js declares them
const DCM_PARAMS = 'parameter real CLKDV_DIVIDE = 2.0, parameter integer CLKFX_DIVIDE = 1, parameter integer CLKFX_MULTIPLY = 4, parameter CLKIN_DIVIDE_BY_2 = "FALSE", '
  + 'parameter real CLKIN_PERIOD = 10.0, parameter CLKOUT_PHASE_SHIFT = "NONE", parameter CLK_FEEDBACK = "1X", parameter DESKEW_ADJUST = "SYSTEM_SYNCHRONOUS", '
  + 'parameter DFS_FREQUENCY_MODE = "LOW", parameter DLL_FREQUENCY_MODE = "LOW", parameter DSS_MODE = "NONE", parameter DUTY_CYCLE_CORRECTION = "TRUE", '
  + 'parameter [15:0] FACTORY_JF = 16\'hC080, parameter integer PHASE_SHIFT = 0, parameter STARTUP_WAIT = "FALSE", parameter SIM_MODE = "SAFE"';
export const DCM_OUTPUTS = ['CLK0', 'CLK90', 'CLK180', 'CLK270', 'CLK2X', 'CLK2X180', 'CLKDV', 'CLKFX', 'CLKFX180', 'LOCKED', 'PSDONE', 'STATUS'];
const dcm = (name) => `(* blackbox *)
module ${name} #(${DCM_PARAMS}) (input CLKIN, CLKFB, RST, DSSEN, PSCLK, PSEN, PSINCDEC,
  output ${DCM_OUTPUTS.slice(0, -1).join(', ')}, output [7:0] STATUS);
endmodule`;

/** The Xilinx primitives the compiled simulator has a model of: name -> Verilog (or a function writing it). */
export const PRIMITIVE_MODELS = {
  ...Object.fromEntries(['BUF', 'BUFG', 'BUFGP', 'IBUF', 'IBUFG', 'OBUF', 'IBUFG_LVCMOS33', 'IBUF_LVCMOS33', 'OBUF_LVCMOS33'].map((b) => [b, wire(b)])),
  INV: 'module INV(output O, input I); assign O = ~I; endmodule',
  GND: 'module GND(output G); assign G = 1\'b0; endmodule',
  VCC: 'module VCC(output P); assign P = 1\'b1; endmodule',
  // (a clock multiplexer: no glitch-free hand-over between the clocks, as unisim.js)
  BUFGMUX: 'module BUFGMUX #(parameter CLK_SEL_TYPE = "SYNC") (output O, input I0, I1, S); assign O = S ? I1 : I0; endmodule',
  BUFGMUX_1: 'module BUFGMUX_1 #(parameter CLK_SEL_TYPE = "SYNC") (output O, input I0, I1, S); assign O = S ? I1 : I0; endmodule',
  BUFGCE: 'module BUFGCE(output O, input I, CE); assign O = I & CE; endmodule',
  BUFGCE_1: 'module BUFGCE_1(output O, input I, CE); assign O = I | ~CE; endmodule',
  // (the block RAMs written when used: 27 modules of 64 parameters each)
  ...Object.fromEntries([...BW.map((w) => [w]), ...BW.flatMap((m, i) => BW.slice(i).map((n) => [m, n]))].map((ws) => [`RAMB16_${ws.map((w) => `S${w}`).join('_')}`, () => bram(ws)])),
  MULT18X18: MULTS[0], MULT18X18S: MULTS[1], MULT18X18SIO: MULTS[2],
  ...Object.fromEntries(['', '_1'].flatMap((f) => [['SRL16', {}], ['SRL16E', { ce: true }], ['SRLC16', { q15: true }], ['SRLC16E', { ce: true, q15: true }]]
    .map(([b, o]) => [`${b}${f}`, srl(`${b}${f}`, { ...o, falling: !!f })]))),
  ...Object.fromEntries([4, 5, 6].flatMap((n) => [[`RAM${2 ** n}X1S`, dram(`RAM${2 ** n}X1S`, n)], [`RAM${2 ** n}X1S_1`, dram(`RAM${2 ** n}X1S_1`, n, { falling: true })],
    [`RAM${2 ** n}X1D`, dram(`RAM${2 ** n}X1D`, n, { dual: true })]])),
  RAM16X1D_1: dram('RAM16X1D_1', 4, { dual: true, falling: true }),
  DCM_SP: dcm('DCM_SP'), DCM: dcm('DCM'),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => ['', '_L', '_D'].map((v) => [`LUT${n}${v}`, lut(n, v)]))),
  ...Object.fromEntries([...cell2('MUXCY', 'CI, DI, S', 'S ? CI : DI'), ...[5, 6, 7, 8].flatMap((n) => cell2(`MUXF${n}`, 'I0, I1, S', 'S ? I1 : I0')),
    ...cell2('XORCY', 'CI, LI', 'CI ^ LI')]),
  MULT_AND: 'module MULT_AND(output LO, input I0, I1); assign LO = I0 & I1; endmodule',
  IDDR2, ODDR2,
  ...Object.fromEntries(FFS.flatMap(([b, p]) => [false, true].map((f) => [`${b}${f ? '_1' : ''}`, ff(b, p, f)]))),
  ...Object.fromEntries(LATCHES.flatMap(([b, p]) => [false, true].map((i) => [`${b}${i ? '_1' : ''}`, latch(b, p, i)]))),
  ...SIMPRIM_MODELS,
  ...PRIMITIVE_MODELS_S6,
};

// ------------------------------------------------------------------ the DCM's and the PLL's clocks
// Time in the main clock's cycles (fractions [n, d]), 0 at the first rising edge of the main clock. A waveform:
// { pre: [[t, v]…] (its first changes), s, q, h }: after pre, a rising edge at s + kq and a falling one at
// s + kq + h (h: q / 2 when not given; s = null: none). unisim.js's DCM (dcm, dcmOut): with its input's rising edges r1, r2…
// (period q), LOCKED at r3; CLK0 = CLKIN from r3 (CLKIN_DIVIDE_BY_2: from r4, at half the frequency); the
// synthesized clocks (CLK2X, CLKDV, CLKFX) from r4, their periods pin * D / M (pin = q, or 2q divided by 2);
// CLK180 / CLK2X180 / CLKFX180 = not the clock, once locked; CLK90 / CLK270 = CLK0 / CLK180 delayed pin / 4.
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const lcm = (a, b) => a / gcd(a, b) * b;
const F = (n, d = 1) => { const g = gcd(n, d) || 1; return [n / g * Math.sign(d), Math.abs(d) / g]; };
const add = (a, b) => F(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const mul = (a, b) => F(a[0] * b[0], a[1] * b[1]);
const lt = (a, b) => a[0] * b[1] < b[0] * a[1];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1];
const half = (a) => mul(a, F(1, 2));

const reg = (s, q, h) => ({ pre: [], s, q, ...(h ? { h } : {}) });
const high = (w) => w.h || half(w.q);
const delay = (w, d) => ({ pre: w.pre.map(([t, v]) => [add(t, d), v]), s: w.s && add(w.s, d), q: w.q });
// not w, from the lock (w starting at or after it)
const invLk = (w, L) => (eq(w.s, L) ? reg(add(L, half(w.q)), w.q) : { pre: [[L, 1], [w.s, 0]], s: add(w.s, half(w.q)), q: w.q });

/** The waveforms of a DCM's outputs (name -> waveform): P its parameters (Yosys's), input its CLKIN's waveform. */
export function dcmWaves(P, input, name) {
  if (input.pre.length || !input.s) throw new Error(`the DCM '${name}' has a clock input that is not a steady clock`);
  // (unisim.js's CLK0 / CLK180 are its input and not the input: of 50 % duty)
  if (input.h && !eq(input.h, half(input.q))) throw new Error(`the DCM '${name}' has a clock input whose duty cycle is not 50 %`);
  const q = input.q, r = (j) => add(input.s, mul(q, F(j - 1)));
  const str = (k, d) => String(P[k] ?? d).replace(/^"|"$/g, '').toUpperCase();
  const int = (k, d) => (P[k] == null ? d : typeof P[k] === 'number' ? P[k] : parseInt(P[k], 2));
  const div2 = str('CLKIN_DIVIDE_BY_2', 'FALSE') === 'TRUE';
  const pin = mul(q, F(div2 ? 2 : 1));
  const dv2 = Math.round(parseFloat(P.CLKDV_DIVIDE ?? '2.0') * 2);
  const dvm = 1 + (dv2 % 2), dvd = dv2 / (2 - (dv2 % 2));
  const M = int('CLKFX_MULTIPLY', 4), D = int('CLKFX_DIVIDE', 1);
  const L = r(3), r4 = r(4);
  const c0 = div2 ? reg(r4, pin) : reg(L, q);
  const c180 = invLk(c0, L);
  const c2x = reg(r4, half(pin)), cdv = reg(r4, mul(pin, F(dvd, dvm))), cfx = reg(r4, mul(pin, F(D, M)));
  const quarter = mul(pin, F(1, 4));
  return {
    CLK0: c0, CLK180: c180, CLK90: delay(c0, quarter), CLK270: delay(c180, quarter),
    CLK2X: c2x, CLK2X180: invLk(c2x, L), CLKDV: cdv, CLKFX: cfx, CLKFX180: invLk(cfx, L),
    LOCKED: { pre: [[L, 1]], s: null, q: null },
  };
}

// a PLL's generics as numbers: P[k] Yosys's (an integer in binary, a real as a string), d its default
const num = (P, k, d, real) => (P[k] == null ? d : typeof P[k] === 'number' ? P[k] : real ? parseFloat(P[k]) : parseInt(P[k], 2));

/**
 * The waveforms of a PLL_BASE's outputs (name -> waveform), as unisim-s6.js's PLL_BASE: with its input's rising edges
 * r1, r2… (period q), LOCKED at r3; from r4 CLKFBOUT of period q × DIVCLK_DIVIDE, CLKOUTn of period
 * q × DIVCLK_DIVIDE × CLKOUTn_DIVIDE / CLKFBOUT_MULT, high for its duty cycle, delayed by its phase (thousandths of
 * a degree of its own period, 0 … 359999; the duty cycle in thousandths).
 */
export function pllWaves(P, input, name) {
  if (input.pre.length || !input.s) throw new Error(`the PLL '${name}' has a clock input that is not a steady clock`);
  const q = input.q, L = add(input.s, mul(q, F(2))), r4 = add(input.s, mul(q, F(3)));
  const M = num(P, 'CLKFBOUT_MULT', 1), D = num(P, 'DIVCLK_DIVIDE', 1);
  const phase = (k) => ((Math.round(num(P, k, 0, true) * 1000) % 360000) + 360000) % 360000;
  const out = (t, du, ph) => reg(add(r4, mul(t, F(ph, 360000))), t, mul(t, F(du, 1000)));
  const waves = { CLKFBOUT: out(mul(q, F(D)), 500, phase('CLKFBOUT_PHASE')), LOCKED: { pre: [[L, 1]], s: null, q: null } };
  for (const n of [0, 1, 2, 3, 4, 5]) {
    const du = Math.round(num(P, `CLKOUT${n}_DUTY_CYCLE`, 0.5, true) * 1000);
    if (!(du > 0 && du < 1000)) throw new Error(`the PLL '${name}' has its CLKOUT${n}_DUTY_CYCLE out of (0, 1)`);
    waves[`CLKOUT${n}`] = out(mul(q, F(D * num(P, `CLKOUT${n}_DIVIDE`, 1), M)), du, phase(`CLKOUT${n}_PHASE`));
  }
  return waves;
}

/** The black boxes whose outputs are scheduled clocks: cell type -> { kind, outputs, waves(P, input, name) }. */
export const CLOCK_CELLS = new Map([
  ...['DCM_SP', 'DCM'].map((t) => [t, { kind: 'DCM', outputs: DCM_OUTPUTS, waves: dcmWaves }]),
  ['PLL_BASE', { kind: 'PLL', outputs: PLL_OUTPUTS, waves: pllWaves }],
]);

// a waveform's changes before `end` (a number of cycles), as [t, v]
function changes(w, end) {
  const out = w.pre.filter(([t]) => lt(t, F(end)));
  if (w.s) for (let k = 0; ; k++) {
    const t = add(w.s, mul(w.q, F(k)));
    if (!lt(t, F(end))) break;
    out.push([t, 1]);
    const f = add(t, high(w));
    if (lt(f, F(end))) out.push([f, 0]);
  }
  return out;
}

/**
 * The schedule of the DCMs' outputs: chans [{ wave, v: the variable, level: its DCM's depth in a cascade,
 * riseOnly: its rising edges only }].
 * -> { T: ticks per cycle, S: the cycles before the steady part, H: the steady part's period (cycles),
 *      cycles: per cycle (0 … S + H - 1), its steps [{ tick, level, sets: [[v, value]…] }] }
 */
export function dcmSchedule(chans, { limit = 1 << 20 } = {}) {
  let T = 2, S = 0, H = 1;
  for (const { wave: w } of chans) {
    for (const [t] of w.pre) { T = lcm(T, t[1]); S = Math.max(S, Math.ceil(t[0] / t[1])); }
    if (!w.s) continue;
    T = lcm(lcm(T, w.s[1]), high(w)[1]);
    S = Math.max(S, Math.ceil(w.s[0] / w.s[1]));
  }
  for (const { wave: w } of chans) if (w.s) H = lcm(H, lcm(T, w.q[0] * (T / w.q[1])) / T);
  if ((S + H) * chans.length * 4 > limit) throw new Error(`the DCMs' clocks repeat only every ${H} cycles`);
  const cycles = Array.from({ length: S + H }, () => new Map());
  for (const { wave, v, level, riseOnly } of chans) {
    for (const [t, val] of changes(wave, S + H)) {
      if (riseOnly && !val) continue;
      const ticks = t[0] * (T / t[1]), c = Math.floor(ticks / T), tick = ticks - c * T;
      const key = tick * 64 + level;
      const m = cycles[c];
      if (!m.has(key)) m.set(key, { tick, level, sets: [] });
      m.get(key).sets.push([v, val]);
    }
  }
  return { T, S, H, cycles: cycles.map((m) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, st]) => st)) };
}
