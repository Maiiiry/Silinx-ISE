// Silinx - the Spartan-6 primitives in the compiled cycle simulator (#720): synthesizable Verilog models, as
// core/compiled-prims.js's, that compute what core/unisim-s6.js's UNISIM models compute, with two-state values:
//   - CARRY4, SRLC32E, RAM128X1S / D, RAM256X1S, RAM32M, RAM64M;
//   - DSP48A1: its registers (RSTTYPE SYNC or ASYNC), pre-adder, multiplier, X / Z multiplexers, post-adder;
//   - RAMB16BWER and RAMB16BWER's half RAMB8BWER (TDP, and SDP of 36 bits): the memory as words of 32 data bits and
//     words of 4 parity bits (512 or 256 of them; their contents, INIT_xx / INITP_xx, written into the netlist's
//     memories after Yosys: compiled-prims.js bramInit), a port of w bits reading and writing its part of a word, by
//     bytes (WE) on a port of 18 bits or more; WRITE_MODE, the output latch and register, SRVAL, INIT. On one edge
//     the reads of both ports, then the writes, port B's last;
//   - PLL_BASE (#845): a black box, as the DCM, its outputs a schedule of their edges (compiled-prims.js pllWaves);
//   - BUFIO2 (#845): IOCLK the input clock (inverted with I_INVERT), DIVCLK the same or divided by DIVIDE (a counter on
//     the input's rising edges, high for the first half of the DIVIDE periods, rounded up), SERDESSTROBE high for one
//     input period in DIVIDE (0 with DIVIDE_BYPASS).
//
// Isomorphic ES module (browser + Node), no DOM.

import { BWER } from './unisim-s6.js';

const hex2 = (k) => k.toString(16).toUpperCase().padStart(2, '0');

const CARRY4 = `module CARRY4(output [3:0] CO, output [3:0] O, input CI, input CYINIT, input [3:0] DI, input [3:0] S);
  wire [4:0] c;
  assign c[0] = CI | CYINIT;
  assign c[1] = S[0] ? c[0] : DI[0];
  assign c[2] = S[1] ? c[1] : DI[1];
  assign c[3] = S[2] ? c[2] : DI[2];
  assign c[4] = S[3] ? c[3] : DI[3];
  assign CO = c[4:1];
  assign O = S ^ c[3:0];
endmodule`;

const SRLC32E = `module SRLC32E #(parameter [31:0] INIT = 32'h0, parameter [0:0] IS_CLK_INVERTED = 1'b0) (input [4:0] A, input CE, CLK, D, output Q, Q31);
  reg [31:0] r = INIT;
  generate if (IS_CLK_INVERTED) begin
    always @(negedge CLK) if (CE) r <= {r[30:0], D};
  end else begin
    always @(posedge CLK) if (CE) r <= {r[30:0], D};
  end endgenerate
  assign Q = r[A];
  assign Q31 = r[31];
endmodule`;

// distributed RAMs (as unisim-s6.js lutram): rams [[init, din, [[out, addr]…]]] written at wa; scalar: A0 … pins
const lutram = (name, n, { rams = [['INIT', 'D', [['O', 'A']]]], wa = 'A', w = 1, scalar = false } = {}) => {
  const bits = 2 ** n * w;
  const addrs = [...new Set([wa, ...rams.flatMap((r) => r[2].map((x) => x[1]))])];
  const pins = Array.from({ length: n }, (_, i) => `A${i}`);
  const addr = (v) => (scalar ? `{${[...pins].reverse().join(', ')}}` : v);
  const word = (m, v) => (w === 1 ? `${m}[${addr(v)}]` : `${m}[${addr(v)} * ${w} +: ${w}]`);
  const t = w === 1 ? '' : `[${w - 1}:0] `;
  return `module ${name} #(${rams.map((r) => `parameter [${bits - 1}:0] ${r[0]} = ${bits}'h0`).join(', ')}) (
  input ${scalar ? pins.join(', ') : addrs.map((x) => `[${n - 1}:0] ${x}`).join(', input ')}, input ${t}${rams.map((r) => r[1]).join(`, input ${t}`)}, input WCLK, WE,
  output ${t}${rams.flatMap((r) => r[2].map((x) => x[0])).join(`, output ${t}`)});
${rams.map((r, k) => `  reg [${bits - 1}:0] m${k} = ${r[0]};`).join('\n')}
  always @(posedge WCLK) if (WE) begin
${rams.map((r, k) => `    ${word(`m${k}`, wa)} <= ${r[1]};`).join('\n')}
  end
${rams.flatMap((r, k) => r[2].map(([o, a]) => `  assign ${o} = ${word(`m${k}`, a)};`)).join('\n')}
endmodule`;
};
const quad = (w) => 'ABCD'.split('').map((x) => [`INIT_${x}`, `DI${x}`, [[`DO${x}`, `ADDR${x}`]]]);

// a register of the DSP48A1, its reset asynchronous when RSTTYPE is ASYNC
const dspReg = (r, w, d, ce, rst) => `  reg [${w - 1}:0] ${r} = ${w}'d0;
  generate if (RSTTYPE == "ASYNC") begin
    always @(posedge CLK or posedge ${rst}) if (${rst}) ${r} <= ${w}'d0; else if (${ce}) ${r} <= ${d};
  end else begin
    always @(posedge CLK) if (${rst}) ${r} <= ${w}'d0; else if (${ce}) ${r} <= ${d};
  end endgenerate`;
const DSP48A1 = `module DSP48A1 #(parameter integer A0REG = 0, parameter integer A1REG = 1, parameter integer B0REG = 0, parameter integer B1REG = 1,
  parameter integer CARRYINREG = 1, parameter CARRYINSEL = "OPMODE5", parameter integer CARRYOUTREG = 1, parameter integer CREG = 1,
  parameter integer DREG = 1, parameter integer MREG = 1, parameter integer OPMODEREG = 1, parameter integer PREG = 1, parameter RSTTYPE = "SYNC") (
  output [17:0] BCOUT, output CARRYOUT, CARRYOUTF, output [35:0] M, output [47:0] P, PCOUT,
  input [17:0] A, B, D, input [47:0] C, PCIN, input [7:0] OPMODE, input CARRYIN, CLK,
  input CEA, CEB, CEC, CECARRYIN, CED, CEM, CEOPMODE, CEP, RSTA, RSTB, RSTC, RSTCARRYIN, RSTD, RSTM, RSTOPMODE, RSTP);
  wire [17:0] a0, a1, b0, b1, b1_in, d_m;
  wire [7:0] op;
  wire [35:0] prod, m_m;
  wire [47:0] c_m, x, z, post, p_m;
  wire [48:0] sum;
  wire cin, cin_in;
${dspReg('a0_r', 18, 'A', 'CEA', 'RSTA')}
${dspReg('a1_r', 18, 'a0', 'CEA', 'RSTA')}
${dspReg('b0_r', 18, 'B', 'CEB', 'RSTB')}
${dspReg('b1_r', 18, 'b1_in', 'CEB', 'RSTB')}
${dspReg('d_r', 18, 'D', 'CED', 'RSTD')}
${dspReg('c_r', 48, 'C', 'CEC', 'RSTC')}
${dspReg('op_r', 8, 'OPMODE', 'CEOPMODE', 'RSTOPMODE')}
${dspReg('m_r', 36, 'prod', 'CEM', 'RSTM')}
${dspReg('p_r', 48, 'post', 'CEP', 'RSTP')}
${dspReg('cin_r', 1, 'cin_in', 'CECARRYIN', 'RSTCARRYIN')}
${dspReg('cout_r', 1, 'sum[48]', 'CECARRYIN', 'RSTCARRYIN')}
  assign a0 = A0REG == 1 ? a0_r : A;
  assign a1 = A1REG == 1 ? a1_r : a0;
  assign b0 = B0REG == 1 ? b0_r : B;
  assign d_m = DREG == 1 ? d_r : D;
  assign op = OPMODEREG == 1 ? op_r : OPMODE;
  assign b1_in = op[4] ? (op[6] ? d_m - b0 : d_m + b0) : b0;
  assign b1 = B1REG == 1 ? b1_r : b1_in;
  assign BCOUT = b1;
  assign prod = $signed(a1) * $signed(b1);
  assign m_m = MREG == 1 ? m_r : prod;
  assign M = m_m;
  assign c_m = CREG == 1 ? c_r : C;
  assign cin_in = CARRYINSEL == "OPMODE5" ? op[5] : CARRYIN;
  assign cin = CARRYINREG == 1 ? cin_r : cin_in;
  assign x = op[1:0] == 2'd0 ? 48'd0 : op[1:0] == 2'd1 ? {{12{m_m[35]}}, m_m} : op[1:0] == 2'd2 ? p_r : {d_m[11:0], a1, b1};
  assign z = op[3:2] == 2'd0 ? 48'd0 : op[3:2] == 2'd1 ? PCIN : op[3:2] == 2'd2 ? p_r : c_m;
  assign sum = op[7] ? {1'b0, z} - ({1'b0, x} + {48'd0, cin}) : {1'b0, z} + ({1'b0, x} + {48'd0, cin});
  assign post = sum[47:0];
  assign p_m = PREG == 1 ? p_r : post;
  assign P = p_m;
  assign PCOUT = p_m;
  assign CARRYOUT = CARRYOUTREG == 1 ? cout_r : sum[48];
  assign CARRYOUTF = CARRYOUT;
endmodule`;

// a port of the block RAM: its width's data / parity bits and the address bits below the word
const dims = (w) => `${w} == 36 ? 32 : ${w} == 18 ? 16 : ${w} == 9 ? 8 : ${w} == 4 ? 4 : ${w} == 2 ? 2 : ${w} == 1 ? 1 : 0`;
const bwer = (name) => {
  const k = BWER[name];
  const A = k.pins('A'), B = k.pins('B');
  const words = k.mem / 32, ab = Math.log2(words);
  const sdp = k.sdp ? 'RAM_MODE == "SDP"' : '0';
  const params = [...['A', 'B'].flatMap((x) => [`parameter integer DATA_WIDTH_${x} = 0`, `parameter integer DO${x}_REG = 0`, `parameter EN_RSTRAM_${x} = "TRUE"`,
    `parameter [${k.iw - 1}:0] INIT_${x} = ${k.iw}'h0`, `parameter [${k.iw - 1}:0] SRVAL_${x} = ${k.iw}'h0`, `parameter RST_PRIORITY_${x} = "CE"`, `parameter WRITE_MODE_${x} = "WRITE_FIRST"`]),
  ...(k.sdp ? ['parameter RAM_MODE = "TDP"'] : []), 'parameter RSTTYPE = "SYNC"', 'parameter SIM_COLLISION_CHECK = "ALL"', 'parameter SIM_DEVICE = "SPARTAN6"', 'parameter INIT_FILE = "NONE"',
  ...Array.from({ length: k.inits }, (_, j) => `parameter [255:0] INIT_${hex2(j)} = 256'h0`), ...Array.from({ length: k.initps }, (_, j) => `parameter [255:0] INITP_${hex2(j)} = 256'h0`)];
  const ports = [A, B].flatMap((p) => [`output [${k.dw - 1}:0] ${p.dout}`, `output [${k.pw - 1}:0] ${p.dop}`, `input [${k.aw - 1}:0] ${p.addr}`, `input ${p.clk}`,
    `input [${k.dw - 1}:0] ${p.di}`, `input [${k.pw - 1}:0] ${p.dip}`, `input ${p.en}`, `input ${p.regce}`, `input ${p.rst}`, `input [${k.ww - 1}:0] ${p.we}`]);
  // the 36-bit INIT / SRVAL of a port (data from bit 0, then the parity bits); SDP: the read port's, A low, B high
  const v36 = (g, x) => (k.iw === 36 ? `${g}_${x}` : x === 'A' ? `{18'd0, ${g}_A}`
    : `(${sdp} ? {${g}_B[17:16], ${g}_A[17:16], ${g}_B[15:0], ${g}_A[15:0]} : {18'd0, ${g}_B})`);
  const port = (x, p) => {
    // (SDP: port A writes both halves, port B only reads)
    const di = k.sdp ? (x === 'A' ? `(${sdp} ? {${B.di}, ${A.di}} : {16'd0, ${A.di}})` : `(${sdp} ? 32'd0 : {16'd0, ${B.di}})`) : p.di;
    const dp = k.sdp ? (x === 'A' ? `(${sdp} ? {${B.dip}, ${A.dip}} : {2'd0, ${A.dip}})` : `(${sdp} ? 4'd0 : {2'd0, ${B.dip}})`) : p.dip;
    const we = k.sdp ? (x === 'A' ? `(${sdp} ? {${B.we}, ${A.we}} : {2'd0, ${A.we}})` : `(${sdp} ? 4'd0 : {2'd0, ${B.we}})`) : p.we;
    const reads = k.sdp && x === 'A' ? `!(${sdp})` : '1';
    return `  localparam integer W${x} = ${k.sdp ? `${sdp} ? 36 : ` : ''}DATA_WIDTH_${x};
  localparam integer D${x} = ${dims(`W${x}`)};
  localparam integer P${x} = W${x} == 36 ? 4 : W${x} == 18 ? 2 : W${x} == 9 ? 1 : 0;
  localparam integer S${x} = W${x} == 36 ? 5 : W${x} == 18 ? 4 : W${x} == 9 ? 3 : W${x} == 4 ? 2 : W${x} == 2 ? 1 : 0;
  wire [31:0] di${x} = ${di};
  wire [3:0] dp${x} = ${dp}, we${x} = ${we};
  wire [3:0] wb${x} = D${x} >= 16 ? we${x} : {4{we${x}[0]}};
  wire [31:0] wm${x} = {{8{wb${x}[3]}}, {8{wb${x}[2]}}, {8{wb${x}[1]}}, {8{wb${x}[0]}}};
  wire [${ab - 1}:0] wa${x} = ${p.addr}[${k.aw - 1}:5];
  wire [4:0] off${x} = (${p.addr}[4:0] >> S${x}) * D${x};
  wire [1:0] poff${x} = (${p.addr}[4:0] >> S${x}) * P${x};
  wire [31:0] old${x} = mem[wa${x}] >> off${x};
  wire [3:0] oldp${x} = par[wa${x}] >> poff${x};
  wire [31:0] rd${x} = WRITE_MODE_${x} == "WRITE_FIRST" ? (di${x} & wm${x}) | (old${x} & ~wm${x}) : old${x};
  wire [3:0] rdp${x} = WRITE_MODE_${x} == "WRITE_FIRST" ? (dp${x} & wb${x}) | (oldp${x} & ~wb${x}) : oldp${x};
  wire [35:0] srv${x} = ${v36('SRVAL', x)};
  reg [35:0] l${x} = ${v36('INIT', x)}, r${x} = ${v36('INIT', x)};
  wire rst${x} = ${p.rst} && EN_RSTRAM_${x} == "TRUE";
  always @(posedge ${p.clk}) begin
    if (DO${x}_REG == 1 && RSTTYPE == "SYNC" && rst${x} && (RST_PRIORITY_${x} == "SR" || ${p.regce})) r${x} <= srv${x};
    else if (DO${x}_REG == 1 && ${p.regce}) r${x} <= l${x};
    if (${reads} && ${p.en} && D${x} > 0) begin
      if (RSTTYPE == "SYNC" && rst${x} && DO${x}_REG == 0) l${x} <= srv${x};
      else if (!(|we${x} && WRITE_MODE_${x} == "NO_CHANGE")) begin
        l${x} <= ({4'd0, rd${x}} & ((36'd1 << D${x}) - 1)) | (({32'd0, rdp${x}} & ((36'd1 << P${x}) - 1)) << D${x});
      end
    end
  end`;
  };
  const write = (x, p) => `  always @(posedge ${p.clk}) if (${p.en} && |we${x} && D${x} > 0) begin
    mem[wa${x}] <= (mem[wa${x}] & ~((wm${x} & ((33'd1 << D${x}) - 1)) << off${x})) | ((di${x} & wm${x} & ((33'd1 << D${x}) - 1)) << off${x});
    if (P${x} > 0) par[wa${x}] <= (par[wa${x}] & ~((wb${x} & ((5'd1 << P${x}) - 1)) << poff${x})) | ((dp${x} & wb${x} & ((5'd1 << P${x}) - 1)) << poff${x});
  end`;
  const out = (x) => `(DO${x}_REG == 1 ? r${x} : l${x})`;
  return `module ${name} #(
  ${params.join(',\n  ')}
) (
  ${ports.join(',\n  ')}
);
  // (two words of opposite bits, so that Yosys keeps every bit of a memory with no write port, a ROM, as it keeps
  // the bits that change; the contents are bramInit's)
  reg [31:0] mem [0:${words - 1}];
  reg [3:0] par [0:${words - 1}];
  initial begin mem[0] = 32'h0; mem[1] = ~32'h0; par[0] = 4'h0; par[1] = 4'hF; end
${port('A', A)}
${port('B', B)}
${k.sdp ? `  generate if (!(${sdp})) begin
${write('B', B)}
  end endgenerate` : write('B', B)}
${write('A', A)}
  // (the asynchronous reset of RSTTYPE ASYNC: the port's output SRVAL while its reset is high)
  wire [35:0] oA = RSTTYPE == "ASYNC" && rstA ? srvA : ${out('A')}, oB = RSTTYPE == "ASYNC" && rstB ? srvB : ${out('B')};
  wire [31:0] maskA = (33'd1 << DA) - 1, maskB = (33'd1 << DB) - 1;
  wire [31:0] dataA = oA[31:0] & maskA, dataB = oB[31:0] & maskB;
  wire [3:0] parA = (oA >> DA) & ((5'd1 << PA) - 1), parB = (oB >> DB) & ((5'd1 << PB) - 1);
${k.sdp ? `  assign ${A.dout} = ${sdp} ? dataB[15:0] : dataA[15:0];
  assign ${B.dout} = ${sdp} ? dataB[31:16] : dataB[15:0];
  assign ${A.dop} = ${sdp} ? parB[1:0] : parA[1:0];
  assign ${B.dop} = ${sdp} ? parB[3:2] : parB[1:0];`
    : `  assign ${A.dout} = dataA;
  assign ${B.dout} = dataB;
  assign ${A.dop} = parA;
  assign ${B.dop} = parB;`}
endmodule`;
};

// the PLL: a black box (compileNetlist schedules its outputs), its generics as unisim-s6.js declares them
const PLL_N = [0, 1, 2, 3, 4, 5];
export const PLL_OUTPUTS = ['CLKFBOUT', ...PLL_N.map((n) => `CLKOUT${n}`), 'LOCKED'];
const PLL_BASE = `(* blackbox *)
module PLL_BASE #(parameter BANDWIDTH = "OPTIMIZED", parameter integer CLKFBOUT_MULT = 1, parameter real CLKFBOUT_PHASE = 0.0, parameter real CLKIN_PERIOD = 0.0,
  ${PLL_N.map((n) => `parameter integer CLKOUT${n}_DIVIDE = 1, parameter real CLKOUT${n}_DUTY_CYCLE = 0.5, parameter real CLKOUT${n}_PHASE = 0.0,`).join('\n  ')}
  parameter CLK_FEEDBACK = "CLKFBOUT", parameter COMPENSATION = "SYSTEM_SYNCHRONOUS", parameter integer DIVCLK_DIVIDE = 1,
  parameter real REF_JITTER = 0.1, parameter RESET_ON_LOSS_OF_LOCK = "FALSE") (output ${PLL_OUTPUTS.join(', ')}, input CLKFBIN, CLKIN, RST);
endmodule`;

const BUFIO2 = `module BUFIO2 #(parameter integer DIVIDE = 1, parameter DIVIDE_BYPASS = "TRUE", parameter I_INVERT = "FALSE", parameter USE_DOUBLER = "FALSE") (
  output DIVCLK, IOCLK, SERDESSTROBE, input I);
  wire ii = I_INVERT == "TRUE" ? ~I : I;
  reg [3:0] k = 4'd0;
  reg dv = 1'b0, sb = 1'b0;
  always @(posedge ii) begin
    dv <= k < (DIVIDE + 1) / 2;
    sb <= k == DIVIDE - 1;
    k <= k >= DIVIDE - 1 ? 4'd0 : k + 4'd1;
  end
  assign IOCLK = ii;
  assign DIVCLK = DIVIDE_BYPASS == "TRUE" || DIVIDE == 1 ? ii : dv;
  assign SERDESSTROBE = DIVIDE_BYPASS == "TRUE" ? 1'b0 : sb;
endmodule`;

/** The Spartan-6 primitives of the compiled simulator: name -> Verilog (or a function writing it). */
export const PRIMITIVE_MODELS_S6 = {
  CARRY4, SRLC32E, DSP48A1, PLL_BASE, BUFIO2,
  RAM128X1S: lutram('RAM128X1S', 7, { scalar: true }),
  RAM128X1D: lutram('RAM128X1D', 7, { rams: [['INIT', 'D', [['SPO', 'A'], ['DPO', 'DPRA']]]] }),
  RAM256X1S: lutram('RAM256X1S', 8),
  RAM32M: lutram('RAM32M', 5, { w: 2, wa: 'ADDRD', rams: quad() }),
  RAM64M: lutram('RAM64M', 6, { wa: 'ADDRD', rams: quad() }),
  RAMB16BWER: () => bwer('RAMB16BWER'),
  RAMB8BWER: () => bwer('RAMB8BWER'),
};
/** The block RAMs' memories: cell type -> { words of the data / parity memories, INIT_xx and INITP_xx counts }. */
export const BWER_MEMORIES = Object.fromEntries(Object.entries(BWER).map(([n, k]) => [n, { words: k.mem / 32, inits: k.inits, initps: k.initps }]));
