// Silinx - open synthesis (browser + Node): Silinx's front end writes the elaborated design as one
// flat SystemVerilog module (core/synth-verilog.js), and Yosys compiled to WebAssembly (YoWASP,
// package @yowasp/yosys, ISC licence) maps it onto the cells of the device family (synth_xilinx)
// and writes the netlist: JSON (as core/fpga/netlist.js reads it) and Verilog, with its statistics.
// No Xilinx tool is involved. The caller says how Yosys runs: in a Web Worker in the browser
// (web/js/yosys-worker.js), directly in Node (core/synth-open-node.js).
//
//   const r = await synthesizeOpen(design, { family: 'spartan3e', run, onLine })
//   r: { top, files: { '<top>_syn.v', '<top>.json', '<top>_yosys.v', '<top>_stat.txt' }, cells, util,
//        warnings, log }
import { toVerilog } from './synth-verilog.js';
import { rewriteCarryChains, gateAssignments, GATE_MIN, ADDER_MIN } from './carry-chain.js';
import { readYosysJson } from './fpga/netlist.js';
import { pack } from './fpga/pack.js';
import { fsmProbeCommands, fsmChosen, fsmExtractCommands, fsmInits, fsmRestCommands, markWires, setInits, FSM_PRE_FILE, FSM_MARKED_FILE, FSM_POST_FILE, FSM_ENC_FILE } from './synth-fsm.js';

// Silinx's device families -> synth_xilinx -family
export const YOSYS_FAMILY = {
  spartan3: 'xc3s', spartan3e: 'xc3se', spartan3a: 'xc3sa', spartan3adsp: 'xc3sda', spartan6: 'xc6s',
  virtex4: 'xc4v', virtex5: 'xc5v', virtex6: 'xc6v', artix7: 'xc7', kintex7: 'xc7', zynq: 'xc7',
};

// families of 4-input LUTs (MUXF5 … MUXF8 combine them)
const LUT4_FAMILIES = new Set(['xc3s', 'xc3se', 'xc3sa', 'xc3sda', 'xc4v']);
// ABC's cost of a LUT of 1 … 6 inputs on those families: a 5-input function is two LUT4s and a
// MUXF5 (one slice), a 6-input one four LUT4s, two MUXF5 and a MUXF6. synth_xilinx's own LUT
// mapping there (LUTs of up to 8 inputs, each split by lut_map.v into LUT4s and MUXF5 … MUXF8)
// makes netlists about 2.5 times larger (research/synth-quality/README.md).
export const LUT4_COSTS = '1,1,1,1,2,4';
// The usual mapping, though, is onto LUT4s alone (#54): with the wider functions ABC, which sees them
// as fast as a LUT4 (#78: it cannot be told otherwise), makes multiplexers and shifters of 5- and
// 6-input functions where LUT4s do as well (the EPFL barrel shifter 1201 LUTs instead of 1707, AES 25 %
// fewer; the design corpus 7 % fewer LUTs, as fast). The mapping on LUT4_COSTS is tried from the same
// netlist (WIDE) and kept when better by DEPTH_RULE (the T80, 7 % smaller with it), as the
// depth-oriented one after it.
export const LUT4_ONLY = '1,1,1,1';

// Wide multiplexers (#511): onto LUT4s alone a 128:1 multiplexer (iwls05-spi's data[bit_pos]) is 6 or 7
// LUTs deep; XST builds it, as a 32:1 one, from LUTs into MUXF5 … MUXF8 (one LUT, then the F-multiplexers
// of the CLB, no general routing between them). The mapping with the wider functions does not either (ABC
// sees a 4:1 multiplexer as one 6-input LUT: 4 LUT4s, 2 MUXF5 and a MUXF6 each). Yosys's muxcover finds
// the trees of 8 and 16 inputs among the 2:1 multiplexers before the LUT mapping; MUXF_MAP makes each one
// 2:1 multiplexers on its first select, left to ABC (a LUT each, with the logic before it), into MUXF5,
// MUXF6 (and MUXF7). Not for every design: a tree whose first select comes late is slower (the T80, 15 %
// by the estimate) than ABC's own mapping, which puts the late select last; and its slices are full
// (their BX / BY select the F-multiplexers: no flip-flop of another net). So the usual run counts the
// trees (MUX_COUNT_FILE) and, with some, the design is mapped again with them (muxfRemapCommands), that
// netlist kept when better by DEPTH_RULE (iwls05-spi: 12.7 ns estimated instead of 14.8, 745 LUTs instead
// of 886). (4:1 trees too, -mux4: serv 29 % slower by the estimate, none faster.) Full trees only (-nopartial,
// #554): muxcover's partial trees (some leaves missing) made a wrong netlist of secworks-sha256's core with -mux16,
// with these F-multiplexers or 2:1 multiplexers in their place alike; -mux8 alone, or -nopartial, kept it right.
export const MUXCOVER = 'muxcover -mux8 -mux16 -nodecode -nopartial';
export const MUXF_MAP_FILE = 'silinx_muxf_map.v';
export const MUXF_MAP = `// Silinx: muxcover's trees of 2:1 multiplexers onto MUXF5 / MUXF6 / MUXF7 (#511)
module \\$_MUX4_ (input A, B, C, D, S, T, output Y);
  wire a, b;
  \\$_MUX_ l0 (.A(A), .B(B), .S(S), .Y(a));
  \\$_MUX_ l1 (.A(C), .B(D), .S(S), .Y(b));
  MUXF5 f5 (.I0(a), .I1(b), .S(T), .O(Y));
endmodule
module \\$_MUX8_ (input A, B, C, D, E, F, G, H, S, T, U, output Y);
  wire a, b;
  \\$_MUX4_ m0 (.A(A), .B(B), .C(C), .D(D), .S(S), .T(T), .Y(a));
  \\$_MUX4_ m1 (.A(E), .B(F), .C(G), .D(H), .S(S), .T(T), .Y(b));
  MUXF6 f6 (.I0(a), .I1(b), .S(U), .O(Y));
endmodule
module \\$_MUX16_ (input A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, S, T, U, V, output Y);
  wire a, b;
  \\$_MUX8_ m0 (.A(A), .B(B), .C(C), .D(D), .E(E), .F(F), .G(G), .H(H), .S(S), .T(T), .U(U), .Y(a));
  \\$_MUX8_ m1 (.A(I), .B(J), .C(K), .D(L), .E(M), .F(N), .G(O), .H(P), .S(S), .T(T), .U(U), .Y(b));
  MUXF7 f7 (.I0(a), .I1(b), .S(V), .O(Y));
endmodule
`;
// A 6-input function of ABC's mapping with the wider functions (LUT4_COSTS) is split by Yosys's lut_map.v on its
// last two inputs, whatever the function: four LUT4s, two MUXF5 and a MUXF6. A 4:1 multiplexer is one (its two
// selects and four data inputs), and on its first select it is two 2:1 multiplexers into a MUXF5: two LUT4s, as
// XST builds it. LUT6_MAP, before lut_map.v, splits a 6-input function on the input whose two cofactors each
// depend on 4 of the other inputs at most, when there is one: two LUT4s into a MUXF5 (one slice, faster than
// through the MUXF6); the others fail it and go on to lut_map.v. The EPFL barrel shifter (128-bit, gates), whose
// wider mapping is 384 such functions: 896 LUTs instead of 1664 (and 1156 onto LUT4s alone; XST 939).
// (Yosys's constant functions, per distinct table, on the 6-input $luts alone: about 1 s more per remap of the T80;
// research/synth-quality/README.md, "4:1 multiplexers in the wider mapping".)
export const LUT6_MAP_FILE = 'silinx_lut6_map.v';
export const LUT6_MAP = `// Silinx: a 6-input $lut as two LUT4s and a MUXF5 when one of its inputs leaves two cofactors of 4 inputs at most (#54)
module \\$lut (A, Y);
  parameter WIDTH = 0;
  parameter LUT = 0;
  (* force_downto *)
  input [WIDTH-1:0] A;
  output Y;
  // the entries of a 64-bit table with input v = 1
  function [63:0] ones(input integer v);
    case (v)
      0: ones = 64'hAAAAAAAAAAAAAAAA;
      1: ones = 64'hCCCCCCCCCCCCCCCC;
      2: ones = 64'hF0F0F0F0F0F0F0F0;
      3: ones = 64'hFF00FF00FF00FF00;
      4: ones = 64'hFFFF0000FFFF0000;
      default: ones = 64'hFFFFFFFF00000000;
    endcase
  endfunction
  // which inputs each cofactor depends on: bit 12 * v + 6 * b + k set when the table t with input v = b
  // depends on input k (on 64-bit words: the entries where t changes with input k, then those of them with v = b)
  function [71:0] deps(input [63:0] t);
    reg [63:0] x;
    integer k, v;
    begin
      deps = 0;
      for (k = 0; k < 6; k = k + 1) begin
        x = (t ^ (t >> (1 << k))) & ~ones(k);
        for (v = 0; v < 6; v = v + 1) if (v != k) begin
          deps[12 * v + k] = |(x & ~ones(v));
          deps[12 * v + 6 + k] = |(x & ones(v));
        end
      end
    end
  endfunction
  // the inputs of the cofactor v = b, but v
  function integer count(input [71:0] d, input integer v, input integer b);
    integer k;
    begin
      count = 0;
      for (k = 0; k < 6; k = k + 1) count = count + d[12 * v + 6 * b + k];
    end
  endfunction
  // the input to split on: both cofactors of 4 inputs at most (6: none); the highest such
  function integer split(input [71:0] d);
    integer v;
    begin
      split = 6;
      for (v = 0; v < 6; v = v + 1) if (count(d, v, 0) <= 4 && count(d, v, 1) <= 4) split = v;
    end
  endfunction
  // the input other than v the cofactor v = b does not depend on (the highest)
  function integer drop(input [71:0] d, input integer v, input integer b);
    integer k;
    begin
      drop = 6;
      for (k = 0; k < 6; k = k + 1) if (k != v && !d[12 * v + 6 * b + k]) drop = k;
    end
  endfunction
  // the 16-bit table of the cofactor v = b on the four inputs other than v and d, in their order
  function [15:0] tt4(input [63:0] t, input integer v, input integer b, input integer d);
    integer i, j, k, n;
    begin
      for (i = 0; i < 16; i = i + 1) begin
        j = b << v;
        n = 0;
        for (k = 0; k < 6; k = k + 1) if (k != v && k != d) begin j = j | (((i >> n) & 1) << k); n = n + 1; end
        tt4[i] = t[j];
      end
    end
  endfunction
  generate
    if (WIDTH == 6) begin
      localparam [71:0] DEP = deps(LUT);
      localparam integer V = split(DEP);
      if (V < 6) begin
        localparam integer D0 = drop(DEP, V, 0), D1 = drop(DEP, V, 1);
        // each LUT4's inputs: the six but V and D0 (D1), in their order
        wire [3:0] B0, B1;
        genvar k;
        for (k = 0; k < 6; k = k + 1) begin : pick
          localparam integer N0 = k - (k > V) - (k > D0), N1 = k - (k > V) - (k > D1);
          if (k != V && k != D0) assign B0[N0] = A[k];
          if (k != V && k != D1) assign B1[N1] = A[k];
        end
        wire f0, f1;
        LUT4 #(.INIT(tt4(LUT, V, 0, D0))) lut0 (.O(f0), .I0(B0[0]), .I1(B0[1]), .I2(B0[2]), .I3(B0[3]));
        LUT4 #(.INIT(tt4(LUT, V, 1, D1))) lut1 (.O(f1), .I0(B1[0]), .I1(B1[1]), .I2(B1[2]), .I3(B1[3]));
        MUXF5 mux5 (.I0(f0), .I1(f1), .S(A[V]), .O(Y));
      end else begin
        wire _TECHMAP_FAIL_ = 1;
      end
    end else begin
      wire _TECHMAP_FAIL_ = 1;
    end
  endgenerate
endmodule
`;
export const MUX_COUNT_FILE = 'silinx_muxes.txt';
// (counted on a copy of the design: muxcover changes it)
const MUX_COUNT = `design -save silinx_premap; ${MUXCOVER}; tee -q -o ${MUX_COUNT_FILE} select -count t:$_MUX8_ t:$_MUX16_; design -load silinx_premap`;
/** The wide multiplexer trees the usual run counted (MUX_COUNT_FILE), 0 when it did not count them. */
export const muxTrees = out => +(/^(\d+) objects/m.exec(asText(out?.[MUX_COUNT_FILE]) || '')?.[1] || 0);

// Shift registers of the 4-input-LUT families as SRL16E (synth_xilinx does not infer them there:
// "Shift register inference not yet supported"). xilinx_srl -fixed turns chains of 3 or more
// flip-flops without a reset (same clock, same enable) into $__XILINX_SHREG_ cells; it must run on
// the bit-level flip-flops before map_ffs (after it they are $_SDFFE_ cells with a reset, which
// xilinx_srl skips). This map file replaces Yosys's own one (cells_map.v), which writes SRLC32E (not
// in these families) for chains of 17 to 32: a chain is SRL16E of 16 stages (address 15) followed
// by the rest; a falling clock is SRL16E_1 (declared in SRL_CELLS: Yosys's cell library does not
// have it, and its IS_CLK_INVERTED would become an inverter on the clock: extractinv of -ise).
// (research/synth-quality/README.md)
export const SRL_MAP_FILE = 'silinx_srl_map.v';
export const SRL_CELLS_FILE = 'silinx_srl_cells.v';
export const SRL_CELLS = `// Silinx: the falling-edge shift register, a black box for Yosys
(* blackbox *)
module SRL16E_1 (output Q, input A0, input A1, input A2, input A3, input CE, (* clkbuf_sink *) input CLK, input D);   // (clkbuf_sink: its clock gets a BUFG, #219)
  parameter [15:0] INIT = 16'h0000;
endmodule
`;
export const SRL_MAP = `// Silinx: $__XILINX_SHREG_ (xilinx_srl) as SRL16E for the 4-input-LUT families
module \\$__XILINX_SHREG_ (input C, input D, input [31:0] L, input E, output Q, output SO);
  parameter DEPTH = 0;
  parameter [DEPTH-1:0] INIT = 0;
  parameter CLKPOL = 1;
  parameter ENPOL = 2;
  // (OUTFF: the last stage of a fixed-length chain in a flip-flop, #502; 0 for the chain before it)
  parameter OUTFF = 1;
  // xilinx_srl's INIT shifts out its least significant bit first; SRL16E's INIT[a] is stage a
  function [DEPTH-1:0] brev;
    input [DEPTH-1:0] din;
    integer i;
    begin
      for (i = 0; i < DEPTH; i = i + 1) brev[i] = din[DEPTH-1-i];
    end
  endfunction
  localparam [DEPTH-1:0] INIT_R = brev(INIT);
  // a constant L: a fixed length (xilinx_srl -fixed); otherwise the tap is read at L (-variable, #5)
  parameter _TECHMAP_CONSTMSK_L_ = 0;
  localparam FIXED = &_TECHMAP_CONSTMSK_L_;
  localparam N = (DEPTH + 15) / 16;
  localparam [16*N-1:0] INIT_P = INIT_R;
  wire CE;
  generate
    if (ENPOL == 0) assign CE = ~E;
    else if (ENPOL == 1) assign CE = E;
    else assign CE = 1'b1;
    if (FIXED && OUTFF && DEPTH > 1) begin
      // a fixed length: its last stage a flip-flop, the stages before it SRL16Es (#502): an SRL16E's output
      // is slow (Treg 3.76 ns against a flip-flop's Tcko 0.59 on the -4), the chain's output then a
      // flip-flop's, as XST does; INIT[0] is the last stage's
      wire T;
      \\$__XILINX_SHREG_ #(.DEPTH(DEPTH-1), .INIT(INIT[DEPTH-1:1]), .CLKPOL(CLKPOL), .ENPOL(ENPOL), .OUTFF(0)) fpga_srl_chain (.C(C), .D(D), .L(DEPTH-2), .E(E), .Q(T));
      if (CLKPOL) FDRE #(.INIT(INIT[0])) fpga_srl_out (.D(T), .Q(Q), .C(C), .CE(CE), .R(1'b0));
      else FDRE_1 #(.INIT(INIT[0])) fpga_srl_out (.D(T), .Q(Q), .C(C), .CE(CE), .R(1'b0));
    end else if (!FIXED && DEPTH > 16) begin
      // a variable tap past 16 stages: per 16 stages, an SRL16E read at the tap and one at stage 15
      // that feeds the next 16 (no SRLC16E: the open flow does not place its cascade, #24); the tap's
      // high bits choose among them
      wire [N:0] ch;
      wire [N-1:0] qs;
      assign ch[0] = D;
      genvar i;
      for (i = 0; i < N; i = i + 1) begin : seg
        if (CLKPOL) SRL16E #(.INIT(INIT_P[16*i +: 16])) tap (.A0(L[0]), .A1(L[1]), .A2(L[2]), .A3(L[3]), .CE(CE), .CLK(C), .D(ch[i]), .Q(qs[i]));
        else SRL16E_1 #(.INIT(INIT_P[16*i +: 16])) tap (.A0(L[0]), .A1(L[1]), .A2(L[2]), .A3(L[3]), .CE(CE), .CLK(C), .D(ch[i]), .Q(qs[i]));
        if (i < N - 1) begin : casc
          if (CLKPOL) SRL16E #(.INIT(INIT_P[16*i +: 16])) last (.A0(1'b1), .A1(1'b1), .A2(1'b1), .A3(1'b1), .CE(CE), .CLK(C), .D(ch[i]), .Q(ch[i+1]));
          else SRL16E_1 #(.INIT(INIT_P[16*i +: 16])) last (.A0(1'b1), .A1(1'b1), .A2(1'b1), .A3(1'b1), .CE(CE), .CLK(C), .D(ch[i]), .Q(ch[i+1]));
        end
      end
      assign Q = qs[L[31:4]];
    end else if (DEPTH == 1) begin
      if (CLKPOL) FDRE #(.INIT(INIT_R)) _TECHMAP_REPLACE_ (.D(D), .Q(Q), .C(C), .CE(CE), .R(1'b0));
      else FDRE_1 #(.INIT(INIT_R)) _TECHMAP_REPLACE_ (.D(D), .Q(Q), .C(C), .CE(CE), .R(1'b0));
    end else if (DEPTH <= 16) begin
      if (CLKPOL) SRL16E #(.INIT(INIT_R)) _TECHMAP_REPLACE_ (.A0(L[0]), .A1(L[1]), .A2(L[2]), .A3(L[3]), .CE(CE), .CLK(C), .D(D), .Q(Q));
      else SRL16E_1 #(.INIT(INIT_R)) _TECHMAP_REPLACE_ (.A0(L[0]), .A1(L[1]), .A2(L[2]), .A3(L[3]), .CE(CE), .CLK(C), .D(D), .Q(Q));
    end else begin
      wire T;
      if (CLKPOL) SRL16E #(.INIT(INIT_R[15:0])) fpga_srl (.A0(1'b1), .A1(1'b1), .A2(1'b1), .A3(1'b1), .CE(CE), .CLK(C), .D(D), .Q(T));
      else SRL16E_1 #(.INIT(INIT_R[15:0])) fpga_srl (.A0(1'b1), .A1(1'b1), .A2(1'b1), .A3(1'b1), .CE(CE), .CLK(C), .D(D), .Q(T));
      \\$__XILINX_SHREG_ #(.DEPTH(DEPTH-16), .INIT(INIT[DEPTH-17:0]), .CLKPOL(CLKPOL), .ENPOL(ENPOL), .OUTFF(0)) fpga_srl_rest (.C(C), .D(T), .L(DEPTH-17), .E(E), .Q(Q));
    end
  endgenerate
endmodule
`;

/**
 * The Yosys commands that map the module `top` onto the cells of the family (synth_xilinx, with
 * the LUT mapping of the 4-input-LUT families replaced: synth_xilinx up to its map_ffs step, the
 * fixed-length shift registers as SRL16E (SRL_MAP: the file `silinx_srl_map.v` given to Yosys), up
 * to its map_luts step, then the steps of map_luts with ABC on LUT4_COSTS, then synth_xilinx from
 * its finalize step). srl: false leaves the shift registers in flip-flops; premap: a file name to
 * write the design to just before the LUT mapping (RTLIL), for remapCommands.
 */
export function synthCommands(top, family, { srl = true, premap = null } = {}) {
  const fam = YOSYS_FAMILY[family];
  if (!fam) throw new Error(`open synthesis: no Yosys mapping for the device family '${family}'`);
  const synth = `synth_xilinx -family ${fam} -ise -flatten -top ${top}`;
  if (!LUT4_FAMILIES.has(fam)) return synth;
 // (the variable taps, #5: xilinx_srl -variable must see the word-level $shiftx, before synth_xilinx's
  // fine step maps it to multiplexers: memory_map (a shift-chain array's words as flip-flops), then
  // xilinx_srl and the map to SRL16E (before map_cells, whose own map writes SRLC32E), then the step;
  // fine's own opt -full run first made t80 7 % larger)
  const shreg = srl ? `${synth} -run :fine; memory_map; xilinx_srl -variable -minlen 3; techmap -map ${SRL_MAP_FILE}; ${synth} -run fine:map_ffs; xilinx_srl -fixed -minlen 3; techmap -map ${SRL_MAP_FILE}; ${synth} -run map_ffs:map_luts` : `${synth} -run :map_luts`;
  return `${shreg}; opt_expr -mux_undef -noclkinv; ${premap ? `write_rtlil ${premap}; ${MUX_COUNT}; ` : ''}abc -luts ${LUT4_ONLY}; ${lutsToCells(synth)}`;
}
// The clock enables on the critical path (#653): Yosys gives a flip-flop whose next state is held under a
// condition that condition as its clock enable (FDRE's CE), its logic apart from the D logic's; a critical path
// that ends there pays the CE's setup (Tceck 0.555 ns on the -4, against the D LUT's 0.13 after it), after the
// enable's own levels of LUTs. XST, for the same logic, often has the enable in the LUT before D (D = CE ? d : Q),
// mapped with the rest of the next state's logic. FOLD_CE_MAP does that for the flip-flops chosen (their names
// read from the file FOLD_CE_FILE): their enable a multiplexer before D, CE tied high, left to ABC with the logic
// around it. For every flip-flop it would cost much (on the slower designs of the corpus 1.1 to 1.9 times the
// LUTs); for those whose enable ends the critical path (criticalEnables) it may save a level and the CE's setup.
export const FOLD_CE_FILE = 'silinx_fold_ce.txt';
export const FOLD_CE_MAP_FILE = 'silinx_fold_ce.v';
const foldModule = (type, clr) => `module ${type} (output Q, input C, CE, D, ${clr});
  parameter [0:0] INIT = 1'b0;
  wire d;
  \\$_MUX_ fold (.A(Q), .B(D), .S(CE), .Y(d));
  ${type} #(.INIT(INIT)) _TECHMAP_REPLACE_ (.Q(Q), .C(C), .CE(1'b1), .D(d), .${clr}(${clr}));
endmodule
`;
export const FOLD_CE_MAP = `// Silinx: a flip-flop's clock enable folded into its D logic (#653)
${[['FDRE', 'R'], ['FDSE', 'S'], ['FDCE', 'CLR'], ['FDPE', 'PRE']].flatMap(([t, c]) => [foldModule(t, c), foldModule(`${t}_1`, c)]).join('')}`;
/** The commands that map the design written by synthCommands(…, { premap: PREMAP_FILE }) again with the clock
 *  enables of the flip-flops listed in the file FOLD_CE_FILE (module/cell, a line each) folded into their D logic
 *  (FOLD_CE_MAP, in the file FOLD_CE_MAP_FILE), onto LUT4s alone as the usual mapping (or with the ABC script given). */
export function foldRemapCommands(top, family, { script = null } = {}) {
  return `read_rtlil ${PREMAP_FILE}; select -set silinx_fold -read ${FOLD_CE_FILE}; techmap -max_iter 1 -map ${FOLD_CE_MAP_FILE} @silinx_fold; select -clear; opt_expr -mux_undef -noclkinv; `
    + `abc -luts ${LUT4_ONLY}${script ? ` -script ${abcPlain(script)}` : ''}; ${lutsToCells(`synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top}`)}`;
}
// The critical path's LUTs mapped again for speed (#652): on a small control path ABC's mapping follows the
// logic as written (spi-fpga-slave's enable, `load | shift`, 3 levels of LUTs where XST has 2). SPEED_ABC is
// the usual mapping's script (Yosys's own for -luts) with ABC's speedup after the first mapping: the LUTs
// on the critical path made gates again with their timing-critical cuts as choices, and mapped once more
// (spi-fpga-slave 5.04 ns estimated -> 3.89, vtr-stereovision3 7.70 -> 6.55, itc99-b09 6.19 -> 5.04). A
// candidate from the netlist before the LUT mapping, kept when better by DEPTH_RULE (slower on others: b05).
export const SPEED_ABC = 'strash; &get -n; &fraig -x; &put; scorr; dc2; dretime; strash; dch -f; if; speedup; if; mfs2; lutpack -S 1';
/** An ABC script for `abc -script` inline (+cmd,arg;cmd…), with the LUT library of `abc -luts`. */
export const abcPlain = script => `+${script.split(';').map(c => c.trim().replace(/\s+/g, ',')).filter(Boolean).join(';')}`;
/** The commands that map the design written by synthCommands(…, { premap: PREMAP_FILE }) again onto LUT4s alone
 *  with the ABC script given (SPEED_ABC). */
export function speedRemapCommands(top, family, script = SPEED_ABC) {
  return `read_rtlil ${PREMAP_FILE}; abc -luts ${LUT4_ONLY} -script ${abcPlain(script)}; ${lutsToCells(`synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top}`)}`;
}
/** The flip-flops whose clock enable ends a critical path of a mapped netlist (pathEnds), `margin` ns from the
 *  worst at most: their cell names. */
export function criticalEnables(json, top, margin = 0) {
  const { worst, ends } = pathEnds(json, top);
  return [...new Set(ends.filter(e => e.port === 'CE' && /^FD/.test(e.type) && e.ns >= worst - margin).map(e => e.cell))];
}
/** The commands that map the design written by synthCommands(…, { premap: PREMAP_FILE }) again with its
 *  wide multiplexers onto MUXF5 … MUXF7 (MUXCOVER, MUXF_MAP in the file MUXF_MAP_FILE), the rest onto LUT4s
 *  alone as the usual mapping (#511). */
export function muxfRemapCommands(top, family) {
  return `read_rtlil ${PREMAP_FILE}; ${MUXCOVER}; techmap -map ${MUXF_MAP_FILE}; abc -luts ${LUT4_ONLY}; ${lutsToCells(`synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top}`)}`;
}
const lutsToCells = (synth, { lut6 = false } = {}) => `clean; techmap -map +/xilinx/ff_map.v; ${lut6 ? `techmap -map ${LUT6_MAP_FILE} t:$lut r:WIDTH=6 %i; ` : ''}techmap -map +/xilinx/lut_map.v -map +/xilinx/cells_map.v -D LUT_WIDTH=4; `
  + `xilinx_dffopt -lut4; opt_lut_ins -tech xilinx; ${synth} -run finalize:`;

// The depth-oriented LUT mapping (the 4-input-LUT families), tried after the usual one: ABC's
// default script for LUTs (strash; …; dch -f; if; mfs2) maps the logic as its structure is: a
// comparator written as a chain of gates stays a chain (the EPFL max benchmark: 45 levels of LUTs,
// 69.9 ns where ISE's XST gets 25.7, #52). This one first balances the logic as sums of products
// (if -g: SOP balancing), then maps it again for area as the default does. The open synthesis
// keeps whichever netlist is faster by its estimate (criticalDelay), when it is not much larger
// (DEPTH_RULE); research/synth-quality/README.md, "Logic depth".
export const DEPTH_ABC = 'strash; dc2; balance; dch -f; if -g; strash; dc2; dch -f; if; mfs2';
// a design whose depth-oriented mapping was kept (its logic depth the limit) is balanced once more and then
// mapped for area again (the EPFL max: 24.8 ns estimated instead of 32.6, for 37 % more LUTs, its slices
// still fewer than ISE's; #52), and that netlist kept when better than the first by DEPTH_RULE, or faster
// than it and, as the first, not larger in proportion than it is faster than the usual mapping (the
// rule against the usual one: the second's LUTs against the first's alone would refuse max's); only for
// these designs, as the second balancing takes long on large ones (EPFL bar: four times as long)
export const DEPTH_ABC2 = 'strash; dc2; balance; dch -f; if -g; strash; dc2; dch -f; if -g; strash; dc2; dch -f; if; mfs2; strash; dch -f; if; mfs2';
// and balanced twice more (#52), with the LUT delays, a third candidate kept as the other two: a priority
// chain or a comparator tree is balanced further each time (the EPFL priority 8.8 ns estimated instead of 16.5,
// max 21.1 instead of 23.0); not in place of DEPTH_ABC2, slower on others (serv 7 %, the EPFL router 8 %).
// DEPTH_ABC2 onto LUT4s alone (LUT4_ONLY, #370) is a fourth candidate: the trees of a round-robin arbiter's ring-shaped
// priority chains in fewer LUTs and slices (the EPFL arbiter in the corpus's I/O wrapper 1224 -> 1010 slices, routed 1.5 %
// faster); on the corpus never kept (slower by the estimate)
export const DEPTH_ABC3 = DEPTH_ABC2.replace('if -g; strash; dc2; dch -f; if;', 'if -g; strash; dc2; dch -f; if -g; strash; dc2; dch -f; if -g; strash; dc2; dch -f; if;');
export const DEPTH_ABC_FILE = 'silinx_depth.abc';
// The GIA's SOP balancing (#654): ABC's &sopb balances the logic as sums of products on its GIA form (the AIG with
// structural choices), then &if -g (the same balancing, delay-oriented, of a mapping onto 6-input cuts) and &synch2
// (choices again), twice, before a mapping onto LUT4s alone. Where if -g on the AIG (DEPTH_ABC…) keeps the
// structure of an arithmetic array written as gates, this restructures it: the EPFL multiplier (a 64 x 64-bit
// multiplier as an AIG, 87 levels of LUTs) 100.5 ns estimated -> 52.2 (45 levels) for 16 % more LUTs and slices, in
// 19 s (its usual run: 6 min); the EPFL max 66.0 -> 16.6 (DEPTH_ABC3: 23.0); the EPFL adder 98.2 -> 9.7, 8 levels of
// LUTs as ISE's (its carry chain: 17.4). A candidate of the designs whose usual netlist is more than `levels` levels
// deep, of `maxLuts` LUTs at most (SOPB_RULE), at both efforts, the multiplier's 7500 LUTs too (above
// DEPTH_RULE.maxLuts: it takes seconds where ABC's if -g takes minutes); research/synth-quality/README.md, "SOP
// balancing of the GIA".
export const DEPTH_SOPB = 'strash; &get -n; &sopb; &if -g -K 6; &synch2; &sopb; &if -g -K 6; &synch2; &if -K 4; &put; mfs2';
export const SOPB_RULE = { levels: 16, maxLuts: 20000 };
// LUT delays (#78): ABC maps for depth with every function as fast as a LUT4 (-luts gives costs, not
// delays); its LUT library (read_lut) tells it what a 5-input function (a LUT4 into the MUXF5) and a
// 6-input one (into the MUXF6 too) cost and take: the -4 delays of core/fpga/timing.js (Tilo, Tif5x,
// Tif5 + Tif6y) and a connection (0.45 ns). YoWASP's ABC crashes on read_lut from a script file
// (codeberg.org/YoWASP/yosys/issues/41), not from a script given inline (abcInline). The balancing of
// DEPTH_ABC2 is made both ways, the better kept (EPFL max 21.4 ns and 1055 LUTs with the delays,
// 22.6 ns and 1410 without; serv 12 % faster; the pedestrian crossing as fast with 16 % more LUTs).
export const LUT_LIB_FILE = 'silinx_lut.lib';
export const LUT_LIB = '1 1 1.21\n2 1 1.21\n3 1 1.21\n4 1 1.21\n5 2 1.60\n6 4 1.89\n';
/** An ABC script for `abc -script` inline (+cmd,arg;cmd…), the LUT library read first. */
export const abcInline = script => `+${[`read_lut ${LUT_LIB_FILE}`, ...script.split(';')].map(c => c.trim().replace(/\s+/g, ',')).filter(Boolean).join(';')}`;
export const PREMAP_FILE = 'silinx_premap.il';
// the depth-oriented netlist is kept when its critical path is at least `gain` shorter and it has
// no more LUTs in proportion than it gains in speed, `luts` (10 %) more at least, or it is no slower
// and no larger, and better in one, or (#54) it has `area` (5 %) fewer LUTs at least and is at most
// `slack` (1 %) slower, within the estimate's error (the pong example: 12 % fewer LUTs, 0.6 % slower);
// tried on designs of up to `maxLuts` LUTs (ABC's SOP balancing of the largest, AES's 10 000 LUTs,
// takes minutes and gigabytes). Slices (#377), the device's own measure (a LUT and a flip-flop share a
// slice half; a MUXF5, a carry stage its LUTs'), when the netlists' are known (sliceCount): the same
// bounds on them too (a faster one's slices no more in proportion than it is faster, #54), and `area` fewer slices as smaller as `area` fewer LUTs (which are smaller only
// with no more slices), with at most `luts` more LUTs (the adder fixture's ABC9 netlist: 9 % fewer slices
// for 27 % more LUTs, refused)
// The mappings for speed (#652, #653): on designs of `maxLuts` LUTs at most; the clock enables folded those of the
// flip-flops whose CE ends a path `margin` ns from the critical one at most
export const SPEED_RULE = { maxLuts: 1500, margin: 0.05 };
export const DEPTH_RULE = { gain: 0.03, luts: 0.1, maxLuts: 5000, area: 0.05, slack: 0.01 };
/** Is the depth-oriented mapping kept? ns, luts (and slices, when known): [usual, depth-oriented]. */
export function keepDepth(ns, luts, rule = DEPTH_RULE, slices = null) {
  const sl = slices && slices.every(Number.isFinite) ? slices : null;
  const grow = Math.max(rule.luts, 1 - ns[1] / ns[0]);
  // (faster with no more slices: `luts` more LUTs again, #54: verilog-uart's ABC9 netlist, 10 % faster, 4 % fewer slices,
  // 14 % more LUTs than the depth-oriented one with LUT6_MAP)
  const lutsOk = luts[1] <= luts[0] * (1 + grow + (sl && sl[1] <= sl[0] ? rule.luts : 0));
  // (its slices, the device's measure, no more in proportion than it is faster, #54: femtorv32-quark's third balancing
  // with LUT6_MAP, 3.7 % faster by the estimate, 8.8 % more slices, slower once routed)
  const faster = ns[1] <= ns[0] * (1 - rule.gain) && lutsOk && (!sl || sl[1] <= sl[0] * (2 - ns[1] / ns[0]));
  const better = ns[1] <= ns[0] && luts[1] <= luts[0] && (!sl || sl[1] <= sl[0])
    && (ns[1] < ns[0] || luts[1] < luts[0] || (sl && sl[1] < sl[0]));
  const fewer = n => n[1] < n[0] && n[1] <= n[0] * (1 - rule.area);
  const smaller = ns[1] <= ns[0] * (1 + rule.slack) && ((fewer(luts) && (!sl || sl[1] <= sl[0])) || (sl && fewer(sl) && luts[1] <= luts[0] * (1 + rule.luts)));
  return !!(faster || better || smaller);
}
/** Is the mapping balanced once more (DEPTH_ABC2) kept? ns, luts (slices): [usual, depth-oriented, balanced
 *  once more], the depth-oriented one kept: better than it (keepDepth), or faster than it (by the rule's
 *  gain) and kept by the rule against the usual mapping. */
export function keepSecond(ns, luts, rule = DEPTH_RULE, slices = null) {
  return keepDepth([ns[1], ns[2]], [luts[1], luts[2]], rule, slices && [slices[1], slices[2]])
    || (ns[2] <= ns[1] * (1 - rule.gain) && keepDepth([ns[0], ns[2]], [luts[0], luts[2]], rule, slices && [slices[0], slices[2]]));
}

/** Is the netlist with the carry chains written as gates (#77) kept? n, c: { ns, luts, slices } of the netlists without
 *  and with them; linesN, linesC: their runs' messages. Both ways (#742): the one without kept only when better than the
 *  one with them by DEPTH_RULE (kept unless the chains were, the EPFL adder's SOP-balanced netlist, 44 % faster by the
 *  estimate, 4 times its chains' LUTs and 74 % more slices, kept; routed 9 % faster). Never a netlist whose chains Yosys
 *  found driven twice, the usual run's not (the EPFL multiplier's rewrite, #746). */
export function keepChains(n, c, { linesN = [], linesC = [] } = {}, rule = DEPTH_RULE) {
  const conflicts = lines => lines.some(l => /^Warning: multiple conflicting drivers/.test(l));
  if (conflicts(linesC) && !conflicts(linesN)) return false;
  return !keepDepth([c.ns, n.ns], [c.luts, n.luts], rule, [c.slices, n.slices]);
}

/** The slices of a mapped netlist of a 4-input-LUT family (Yosys's JSON), as core/fpga/pack.js packs them for
 *  the open flow; null when it does not pack (a cell it does not support yet). */
export function sliceCount(json, top) {
  try { return pack(readYosysJson(asText(json) || json, { top })).stats.slices; } catch { return null; }
}

/** The commands that map the design written by synthCommands(…, { premap: PREMAP_FILE }) again,
 *  with the depth-oriented ABC script (DEPTH_ABC, in the file DEPTH_ABC_FILE given to Yosys), onto LUT4_COSTS, the
 *  6-input functions split by LUT6_MAP (the file LUT6_MAP_FILE) where it can; luts: LUT4_ONLY onto LUT4s alone (#370). */
export function remapCommands(top, family, { script = true, inline = null, luts = LUT4_COSTS } = {}) {
  const synth = `synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top}`;
  const abc = inline ? ` -script ${abcInline(inline)}` : script ? ` -script ${DEPTH_ABC_FILE}` : '';
  return `read_rtlil ${PREMAP_FILE}; abc -luts ${luts}${abc}; ${lutsToCells(synth, { lut6: luts === LUT4_COSTS })}`;
}

/** The commands that map the design written by synthCommands(…, { premap: PREMAP_FILE }) again with ABC9 onto
 *  LUT4s alone: synth_xilinx's own map_luts step with -abc9 -nowidelut (ABC9's &if, Yosys's LUT delays), then the
 *  rest of synth_xilinx. A candidate of the 4-input-LUT families (#377): research/synth-quality/README.md, "ABC9"
 *  (#369: against the mapping onto LUT4s alone, 6 % more LUTs, 2.6 % fewer slices, a 2.7 % shorter period). */
export function abc9RemapCommands(top, family) {
  // (the cells' models first, with their parameters, and Silinx's SRL16E_1: the RTLIL has them as bare black boxes)
  return `read_verilog -lib -specify +/xilinx/cells_sim.v; read_verilog -lib +/xilinx/cells_xtra.v; read_verilog -lib ${SRL_CELLS_FILE}; read_rtlil -nooverwrite ${PREMAP_FILE}; `
    + `${ABC9_KEEP_CLOCKS}; synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top} -abc9 -nowidelut -run map_luts:; ${ABC9_UNKEEP_CLOCKS}`;
}
// The clock nets' names through ABC9 (#496): ABC9 makes every net a non-logic cell reads an output of its
// AIG, reintegrated as an alias ($abc$…$aiger$o…) of the net, and synth_xilinx's clean then keeps the alias's
// name and drops the net's ($iopadmap$clk, the usual mapping's: the timing report said "clock
// $abc$24199$aiger$o11"). The nets on the clock pins of the cells (the flip-flops' and latches' C, the shift
// registers', block RAMs' and multipliers' CLK / CLKA / CLKB, the distributed RAMs' WCLK, the DCMs' CLKIN) are
// marked keep before the mapping, which makes clean keep their names, and unmarked after it (no attribute in
// the netlist). (keep also lists the net among the AIG's outputs: ABC9 maps the same logic, the LUTs of a
// design may differ by a few.)
export const ABC9_KEEP_CLOCKS = 'select -set silinx_clocks t:* %ci1:+[C]:+[CLK]:+[CLKA]:+[CLKB]:+[WCLK]:+[CLKIN] w:* %i; setattr -set keep 1 @silinx_clocks';
export const ABC9_UNKEEP_CLOCKS = 'setattr -unset keep @silinx_clocks';

// $scopeinfo cells (kept hierarchy names) are not cells of the device: deleted before writing. The JSON has the
// top module alone (#86): synth_xilinx reads Yosys's whole Xilinx cell library as black boxes (430 modules of every
// family), which write_json wrote too: 9 MB for blinky instead of 0.3, and about 0.9 s of every run (its LUT
// mapping 0.15 s); every reader of the netlist takes its top module (core/fpga/netlist.js, sim-model.js,
// compiled-sim.js…). (write_verilog leaves the black boxes out by itself.) The top is selected by its attribute,
// not by its name, and is not a black box (#631): a top that ends empty is one (read_verilog marks a module with no
// body so: Yosys's ifdef_1, specify.v), which write_json -selected leaves out, and a name such as \1dff (an escaped
// identifier) is not the one select -module takes. (The library stays in the design: write_json takes the cells'
// port directions from it.)
export const TOP_ONLY = 'setattr -mod -unset blackbox =A:top; select =A:top';
const outputs = top => `delete t:$scopeinfo; ${TOP_ONLY}; write_json -selected ${top}.json; select -clear; write_verilog -noattr ${top}_yosys.v; tee -q -o ${top}_stat.txt stat`;

// the netlist between the two runs of a design with carry chains written as gates (#77)
export const CHAIN_FILE = 'silinx_chains.json';
/** synthCommands in two: up to synth_xilinx's fine step (the coarse netlist), and from it on. */
export function splitCommands(top, family, opts = {}) {
  const cmds = synthCommands(top, family, opts);
  const at = cmds.indexOf(`synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top} -run fine:`);
  return [cmds.slice(0, at).replace(/;\s*$/, ''), cmds.slice(at)];
}

/** The Yosys script: read the flat module, map it, write the netlist and its statistics. */
export function yosysScript(top, family, opts = {}) {
  const cells = LUT4_FAMILIES.has(YOSYS_FAMILY[family]) && opts.srl !== false ? `read_verilog -lib ${SRL_CELLS_FILE}; ` : '';
  return `${cells}read_verilog -sv ${top}_syn.v; ${synthCommands(top, family, opts)}; ${outputs(top)}`;
}

// ------------------------------------------------------------- the critical path of a netlist
// An estimate of the critical path (ns) of a mapped netlist of a 4-input-LUT family, from its cells
// only (before packing, placement and routing): the Spartan-3E -4's logic delays (of
// core/fpga/timing.js) and a fixed delay per connection between slices, none inside a slice (a LUT
// into its MUXF5, carry or flip-flop; the carry chain; MUXF5 into MUXF6…). Paths from flip-flop to
// flip-flop (block RAMs, multipliers, shift registers and distributed RAMs as their sources and
// ends too); a design without them: from its inputs to its outputs. It chooses between two
// mappings of the same design, so relative, not exact.
const NET = 0.45;
const isFF = t => /^(FD|LD)/.test(t);
const isLutCell = t => /^(LUT[1-6]|INV|BUF)$/.test(t);
/** The estimated critical path (ns) of a Yosys JSON netlist (its top module). */
export const criticalDelay = (json, top) => pathEnds(json, top).worst;
/** The estimate of criticalDelay with its ends: worst (ns), and each end { cell (its name), type, port, ns } (the
 *  setup included) of the paths between sequential cells (or, a design without them, from inputs to outputs). */
export function pathEnds(json, top) {
  const nl = typeof json === 'string' ? JSON.parse(json) : json;
  const mod = nl.modules[top] || Object.values(nl.modules).find(m => m.attributes?.top) || Object.values(nl.modules)[0];
  const cells = Object.values(mod?.cells || {});
  const driver = new Map();   // bit -> [cell, port]
  for (const c of cells) for (const [p, bits] of Object.entries(c.connections || {})) if (c.port_directions?.[p] === 'output') for (const b of bits) if (typeof b === 'number') driver.set(b, c);
  const registered = c => c.type === 'MULT18X18SIO' && /1$/.test(String(c.parameters?.PREG ?? ''));
  const ins = c => Object.entries(c.connections || {}).filter(([p]) => c.port_directions?.[p] === 'input');
  let withIO = false;
  const memo = new Map(), busy = new Set();
  // the arrival at a cell's input pin: its driver's output and the connection (none inside a slice)
  const arrIn = (c, p, bit) => {
    const d = typeof bit === 'number' ? driver.get(bit) : null;
    if (!d) return -Infinity;
    const inside = (c.type === 'MUXF5' && /^I[01]$/.test(p) && isLutCell(d.type)) || (/^MUXF[678]$/.test(c.type) && /^I[01]$/.test(p) && /^MUXF/.test(d.type))
      || (/^(MUXCY|XORCY)$/.test(c.type) && p === 'CI' && d.type === 'MUXCY') || (c.type === 'MUXCY' && p === 'S' && isLutCell(d.type))
      || (c.type === 'XORCY' && p === 'LI' && isLutCell(d.type)) || (isFF(c.type) && p === 'D' && (isLutCell(d.type) || /^(MUXF5|MUXF6|XORCY)$/.test(d.type)));
    return arrOut(d, bit) + (inside ? 0 : NET);
  };
  const through = (c, delayOf) => {
    let t = -Infinity;
    for (const [p, bits] of ins(c)) { const d = delayOf(p); if (d !== null) for (const b of bits) t = Math.max(t, arrIn(c, p, b) + d); }
    return t;
  };
  function arrOut(c, bit) {
    if (memo.has(bit)) return memo.get(bit);
    const t = c.type;
    let v;
    if (isFF(t)) v = 0.59;
    else if (/^SRL16/.test(t)) v = 2.0;
    else if (/^RAMB16/.test(t)) v = 2.39;
    else if (/^IBUF/.test(t)) v = withIO ? 0 : -Infinity;
    else if (/^BUFG/.test(t)) v = -Infinity;
    else {
      if (busy.has(bit)) return -Infinity;   // a combinational loop: no path
      busy.add(bit);
      if (isLutCell(t)) v = through(c, () => 0.70);
      else if (t === 'MUXF5') v = through(c, p => (p === 'S' ? 0.74 : 0.32));
      else if (/^MUXF[678]$/.test(t)) v = through(c, p => (p === 'S' ? 0.85 : 0.45));
      else if (t === 'MUXCY') v = through(c, p => (p === 'CI' ? 0.12 : p === 'S' ? 0.25 : 0.95));
      else if (t === 'XORCY') v = through(c, p => (p === 'CI' ? 0.46 : 0.15));
      else if (/^MULT18X18/.test(t)) v = registered(c) ? 1.0 : through(c, p => (/^[AB]$/.test(p) ? 4.9 : null));
      else if (/^RAM\d+X/.test(t)) v = through(c, p => (/^(A\d*|DPRA\d*)$/.test(p) ? 0.75 : null));
      else v = through(c, () => 0.7);
      busy.delete(bit);
    }
    memo.set(bit, v);
    return v;
  }
  // the ends: the setup of flip-flops, shift registers, RAMs and registered multipliers (the outputs withIO)
  const setup = (c, p) => {
    const t = c.type;
    if (isFF(t)) return p === 'D' ? 0.13 : p === 'CE' ? 0.55 : /^(R|S|CLR|PRE|G|GE)$/.test(p) ? 0.91 : null;
    if (/^SRL16/.test(t)) return /^(D|CE)$/.test(p) ? 0.46 : null;
    if (/^RAMB16/.test(t)) return /^(CLK|SSR)/.test(p) ? null : 0.4;
    if (registered(c)) return /^[AB]$/.test(p) ? 5.2 : null;
    if (/^RAM\d+X/.test(t)) return /^(D|WE|A\d*)$/.test(p) ? 0.46 : null;
    if (/^OBUF/.test(t)) return withIO ? 0 : null;
    return null;
  };
  const names = new Map(Object.entries(mod?.cells || {}).map(([n, c]) => [c, n]));
  const worst = () => {
    let w = 0;
    const ends = [];
    for (const c of cells) {
      for (const [p, bits] of ins(c)) {
        const s = setup(c, p);
        if (s === null) continue;
        let t = -Infinity;
        for (const b of bits) t = Math.max(t, arrIn(c, p, b) + s);
        if (t > 0) { w = Math.max(w, t); ends.push({ cell: names.get(c), type: c.type, port: p, ns: t }); }
      }
    }
    return { worst: w, ends };
  };
  const ff = worst();
  if (ff.worst > 0) return ff;
  withIO = true;
  memo.clear();
  return worst();
}

// The logic levels of a mapped netlist: the LUTs (and MUXF5s, a LUT of 5 inputs) on its deepest path
// between sequential cells, inputs and outputs (a carry chain's MUXCY / XORCY count none: its LUTs do)
const LEVEL_CELL = t => /^(LUT[1-6]|INV|MUXF5)$/.test(t);
const COMB_CELL = t => /^(LUT[1-6]|INV|BUF|MUXF[5-8]|MUXCY|XORCY)$/.test(t);
/** The logic levels of the deepest path of a Yosys JSON netlist (its top module). */
export function logicLevels(json, top) {
  const nl = typeof json === 'string' ? JSON.parse(json) : json;
  const mod = nl.modules[top] || Object.values(nl.modules).find(m => m.attributes?.top) || Object.values(nl.modules)[0];
  const cells = Object.values(mod?.cells || {});
  const driver = new Map();
  for (const c of cells) for (const [p, bits] of Object.entries(c.connections || {})) if (c.port_directions?.[p] === 'output') for (const b of bits) if (typeof b === 'number') driver.set(b, c);
  const memo = new Map(), busy = new Set();
  const level = (c) => {
    if (!COMB_CELL(c.type)) return 0;
    if (memo.has(c)) return memo.get(c);
    if (busy.has(c)) return 0;   // (a combinational loop)
    busy.add(c);
    let m = 0;
    for (const [p, bits] of Object.entries(c.connections || {})) if (c.port_directions?.[p] === 'input') for (const b of bits) { const d = typeof b === 'number' ? driver.get(b) : null; if (d) m = Math.max(m, level(d)); }
    busy.delete(c);
    const v = m + (LEVEL_CELL(c.type) ? 1 : 0);
    memo.set(c, v);
    return v;
  };
  return cells.reduce((w, c) => Math.max(w, level(c)), 0);
}
// Optimization Effort Normal (#468): a design limited by its logic depth, its usual mapping more than
// `levels` levels of logic deep and of DEPTH_RULE.maxLuts LUTs at most, gets High's mappings too (the
// depth-oriented ones, the carry chains), each kept by DEPTH_RULE as at High; the others keep the one fast
// run. On the design corpus (research/synth-quality/README.md, "Effort Normal"): the EPFL adder (85 levels)
// 98 ns estimated -> 17, max (57) 66 -> 23, priority (44) 51 -> 17, for 6 to 19 s more; the designs of more
// than 16 levels that High does not make faster (sin, voter, ITC'99 b20-b22) cost 7 to 56 s more; the
// larger ones (log2, multiplier: 10 000 and 7 500 LUTs, 100 and 87 levels), as fast at High (no depth
// mapping above maxLuts), would cost 75 to 86 s more and are left out; the shallower ones gain up to 1.5
// times at High (EPFL router) but are not limited by their depth. Since #611, of `maxLuts` (1500) LUTs at most and
// kept at Normal only when `gain` (25 %) faster than Normal's own netlist (synthesized too): the deep designs of 2000
// to 3300 LUTs (EPFL sin and voter, ITC'99 b20 to b22) gained 0 to 9 % of the estimate for up to 12 % more slices and
// 2 to 5 times the synthesis's time (voter 22 s -> 68), ITC'99 b14 and b05 (1005 and 293 LUTs) 15 and 9 % for 9 and 5 %
// more slices: High's trade, not Normal's; the EPFL adder, max and priority (339, 1046 and 171 LUTs) and a priority
// encoder of 128 bits (20 levels) gain 2.7 to 6 times
export const DEEP_RULE = { levels: 16, maxLuts: 1500, gain: 0.25 };
/** Is a netlist of the usual mapping limited by its depth (DEEP_RULE)? */
export const deepDesign = (json, top, rule = DEEP_RULE) => logicLevels(json, top) > rule.levels && utilization(cellCounts(json, top)).luts <= Math.min(rule.maxLuts ?? Infinity, DEPTH_RULE.maxLuts);

/** The files yosysScript reads: the flat module and Silinx's shift-register map and cells. */
export const yosysFiles = (top, text) => ({ [`${top}_syn.v`]: text, [SRL_MAP_FILE]: SRL_MAP, [SRL_CELLS_FILE]: SRL_CELLS });

/** Cells of a Yosys JSON netlist by type: { LUT4: 286, FDRE: 48, … } (the top module's). */
export function cellCounts(json, top) {
  const nl = typeof json === 'string' ? JSON.parse(json) : json;
  const mod = nl.modules[top] || Object.values(nl.modules).find(m => m.attributes?.top) || Object.values(nl.modules)[0];
  const counts = {};
  for (const c of Object.values(mod?.cells || {})) counts[c.type] = (counts[c.type] || 0) + 1;
  return counts;
}

/** The resources of the cell counts, as the Design Summary lists them. */
export function utilization(counts) {
  const sum = re => Object.entries(counts).reduce((n, [t, k]) => n + (re.test(t) ? k : 0), 0);
  return {
    luts: sum(/^LUT[1-6]$/),
    flipFlops: sum(/^FD/),
    latches: sum(/^LD/),
    muxes: sum(/^MUXF[5-8]$/),
    carry: sum(/^(MUXCY|XORCY|CARRY4)$/),
    shiftRegisters: sum(/^SRL/),
    distributedRam: sum(/^RAM\d+X/),
    blockRam: sum(/^RAMB/),
    multipliers: sum(/^(MULT18X18|DSP48)/),
    clockBuffers: sum(/^BUFG/),
    dcms: sum(/^(DCM|PLL|MMCM)/),
    ios: sum(/^(IBUF|OBUF|IOBUF|OBUFT|IBUFG)/),
    cells: sum(/./),
  };
}

// Yosys messages that say nothing about the design, left out of the log and of the warnings:
// synth_xilinx prints "Shift register inference not yet supported for family xc3se" (and the
// other 4-input-LUT families) on every run, whatever the design (its shift registers become
// flip-flops). (Not -nosrl instead: that option also skips pmux2shiftx, which changes netlists.)
// Its block-RAM mapping (brams_map.v: ports of 64 data and 8 parity bits narrowed to the RAMB16's)
// prints "Resizing cell port <memory>.<i>.<j>.DI from 64 bits to 8 bits" for every block RAM it infers.
export const QUIET = [/^Warning: Shift register inference not yet supported for family \w+\.$/,
  /^Warning: Resizing cell port \S+\.\d+\.\d+\.(DI|DO|DIP|DOP)[AB]? from (64|8) bits to \d+ bits\.$/];

/** The open synthesis's effort from a project's implementation properties (#282): its Optimization Effort,
 *  as XST's: High (optLevel 2) 'high', else (Normal, the default) 'normal'. */
export const synthEffort = impl => (String(impl?.optLevel) === '2' ? 'high' : 'normal');

/**
 * Synthesize an elaborated design (core/elaborate.js). run(args, files, onLine) runs Yosys and
 * resolves with its output files ({ name: text }), or rejects with an error whose `lines` holds
 * Yosys's messages. onLine receives Yosys's output line by line. depth (true): on the
 * 4-input-LUT families the design (mapped onto LUT4s alone) is mapped again with the wider functions
 * (LUT4_COSTS) and for logic depth (DEPTH_ABC), each netlist kept when better (DEPTH_RULE); r.depth says
 * what happened: { tried, kept, wide: { ns, luts, kept } of the mapping with the wider functions,
 * ns: [usual, depth-oriented] (criticalDelay), luts: [usual, depth-oriented] (usual: the mapping kept
 * of the two before), second: { ns, luts, kept } of the mapping balanced once more (DEPTH_ABC2), when
 * the depth-oriented one was kept, delays: { ns, luts, kept } of the same with the LUT delays (#78), third:
 * { ns, luts, kept } of the one balanced twice more with the LUT delays (DEPTH_ABC3, #52), lut4: { ns, luts, kept } of the
 * one balanced once more onto LUT4s alone (DEPTH_ABC2 on LUT4_ONLY, #370), and
 * abc9: { ns, luts, kept } of ABC9's mapping onto LUT4s alone, kept when better than the netlist chosen (#377;
 * abc9: false leaves it out); each with its slices too, when it packs (sliceCount); muxf: { trees, ns, luts, slices,
 * kept } of the mapping with the wide multiplexers onto MUXF5 … MUXF7, when the usual run found some (#511), and sopb: { ns,
 * luts, slices, kept } of the mapping balanced as sums of products (DEPTH_SOPB, #654), made for a design deeper than
 * SOPB_RULE.levels at both efforts (at Normal kept by DEEP_RULE's gain too when the design gets none of High's mappings) }.
 * speed: { ns, luts, slices, kept } of the speedup's mapping (SPEED_ABC, #652), fold: { flipFlops, ns, luts, slices, kept } of
 * the mapping with the clock enables that end the critical path folded into D (#653), both from the netlist before the
 * LUT mapping, measured against the netlist chosen of the others, on both efforts (speed: false leaves them out).
 * effort ('high'): 'normal', the synthesis's Optimization Effort Normal (#282), is one Yosys run, the
 * usual mapping alone (no other mapping tried: as depth false; but the critical path's remaps, #652, and the mapping with the
 * wider functions, r.depth.wide, measured against the netlist chosen of the others, #54; wide: false leaves it out), but for a design limited by its depth (#468:
 * deepDesign, its levels in r.depth.levels; r.depth.auto true), which gets High's mappings too, kept when deepRule.gain
 * (DEEP_RULE's) faster than Normal's own netlist (#611: r.depth.normal { ns, luts, kept: Normal's own kept }, r.depth.high { ns, luts }
 * of High's then), and for a design
 * with wide multiplexers (#511: their mapping onto MUXF5 … MUXF7, r.depth.muxf, at both efforts); a design
 * written as gates also has its adders' carry chains recovered (#77, #377), the faster netlist kept. At High a
 * design whose state machines of FSM_RULE.states states or more the init values keep out of Yosys's fsm is
 * synthesized once more with them one-hot (#539, core/synth-fsm.js), that netlist kept when better by DEPTH_RULE:
 * r.depth.fsm { machines: [{ wire, states }], ns, luts, slices, kept } (fsm: false leaves it out, 'always' keeps it).
 */
export async function synthesizeOpen(design, { family = 'spartan3e', run, onLine = () => {}, depth = true, effort = 'high', abc9: withAbc9 = true, deepRule = DEEP_RULE, fsm: withFsm = true, speed: withSpeed = true, wide = true } = {}) {
  const { text, top, warnings, shiftArrays = [] } = toVerilog(design);
  const lut4 = LUT4_FAMILIES.has(YOSYS_FAMILY[family]);
  const normal = effort === 'normal';
  const speed = withSpeed && depth && lut4;
  let tryDepth = !normal && depth && lut4;
  // (Normal: the design as it is before the LUT mapping written too, for High's mappings if it is deep)
  const opts = (tryDepth || (normal && depth && lut4)) ? { premap: PREMAP_FILE } : {};
  const log = [];
  const quiet = l => QUIET.some(re => re.test(l));
  const line = l => { if (!quiet(l)) { log.push(l); onLine(l); } };
  // the usual mapping's run; at Normal made first, and given (its messages again) to whichever step needs it
  // (at High started beside the search for state machines, #539: a promise, its messages said when it is taken)
  let usual = null;
  const usualRun = (say) => {
    if (usual) {
      const u = usual;
      usual = null;
      return Promise.resolve(u.done).then(out => { for (const l of u.lines) say(l); return out; }, e => { for (const l of u.lines) say(l); throw e; });
    }
    return run(['-q', '-p', yosysScript(top, family, opts)], yosysFiles(top, text), say);
  };
  // a design written as gates (#77): the first of its two runs, up to synth_xilinx's fine step (the coarse
  // netlist, its carry chains found there); at Normal started at once beside the usual run (#377)
  const gates = lut4 && gateAssignments(design) >= GATE_MIN;
  const lines1 = [];
  const coarse = () => run(['-q', '-p', `read_verilog -lib ${SRL_CELLS_FILE}; read_verilog -sv ${top}_syn.v; ${splitCommands(top, family, opts)[0]}; ${TOP_ONLY}; write_json -selected ${CHAIN_FILE}`],
    yosysFiles(top, text), l => { if (!quiet(l)) lines1.push(l); });
  const preRun = normal && gates ? coarse() : null;
  preRun?.catch(() => {});
  // High (#539): the state machines the init values keep out, found by a quiet run up to fsm (core/synth-fsm.js),
  // started at once; its failure leaves the design as it is
  const synth = `synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top}`;
  const linesP = [];
  const probe = !normal && depth && lut4 && withFsm
    ? run(['-q', '-p', fsmProbeCommands(`read_verilog -lib ${SRL_CELLS_FILE}; read_verilog -sv ${top}_syn.v; `, synth)], yosysFiles(top, text), l => { if (!quiet(l)) linesP.push(l); })
      .then(out => ({ out, machines: fsmChosen(asText(out[FSM_PRE_FILE]), asText(out[FSM_ENC_FILE])) }), () => null)
    : null;
  if (probe) {
    const lines = [];
    usual = { lines, done: run(['-q', '-p', yosysScript(top, family, opts)], yosysFiles(top, text), l => lines.push(l)) };
    usual.done.catch(() => {});
  }
  let deep = null;   // Normal: the usual mapping's levels of logic, and whether that is deep (#468)
  if (normal && depth && lut4) {
    const lines = [];
    const out = await run(['-q', '-p', yosysScript(top, family, opts)], yosysFiles(top, text), l => lines.push(l));
    usual = { done: out, lines };
    const json = out[`${top}.json`];
    if (json) deep = { levels: logicLevels(json, top), deep: deepDesign(json, top, deepRule) };
    if (deep?.deep) tryDepth = true;
  }
  const highMappings = !normal || !!deep?.deep;
  // a mapping (its run's output) and, from the design as it was before its LUT mapping, the depth-oriented
  // one: the faster kept (DEPTH_RULE); its messages apart, only a warning of its own joins the log
  async function withDepth(out, say, seen) {
    // (a kept netlist's warnings: those the run before did not print, the netlist being the same before
    // the LUT mapping)
    const sayNew = l => { if (/^Warning:/.test(l) && !seen.includes(l)) { seen.push(l); say(l); } };
    if (!out[`${top}.json`]) throw Object.assign(new Error('Yosys wrote no netlist'), { lines: log });
    // (each netlist's slices, when the rule weighs them: packed once)
    const slicesOf = new Map();
    const slices = j => (slicesOf.has(j) ? slicesOf.get(j) : slicesOf.set(j, sliceCount(j, top)).get(j));
    const info = { tried: false, kept: false, ns: null, luts: null };
    // the wide multiplexers onto MUXF5 … MUXF7 (#511), when the usual run counted some: kept by DEPTH_RULE, then
    // the usual mapping for the rest (the other mappings are made from the same netlist and measured against it)
    const trees = muxTrees(out);
    if (trees && out[PREMAP_FILE]) {
      const linesM = [];
      try {
        const outM = await run(['-q', '-p', `${muxfRemapCommands(top, family)}; ${outputs(top)}`], { [PREMAP_FILE]: asText(out[PREMAP_FILE]), [MUXF_MAP_FILE]: MUXF_MAP },
          l => { if (!quiet(l)) linesM.push(l); });
        const j0 = out[`${top}.json`], jM = outM[`${top}.json`];
        if (jM) {
          const ns = [criticalDelay(j0, top), criticalDelay(jM, top)], luts = [utilization(cellCounts(j0, top)).luts, utilization(cellCounts(jM, top)).luts];
          const sl = [slices(j0), slices(jM)];
          info.muxf = { trees, ns: ns[1], luts: luts[1], slices: sl[1], kept: keepDepth(ns, luts, DEPTH_RULE, sl) };
          if (info.muxf.kept) {
            out = { ...outM, [PREMAP_FILE]: out[PREMAP_FILE] };
            for (const l of linesM) sayNew(l);
          }
        }
      } catch (e) {
        // (an optional mapping that failed: the usual one kept, as the depth-oriented ones, #401)
        info.muxf = { trees, kept: false, failed: e.message };
        sayNew(`Warning: the mapping of the wide multiplexers failed (${e.message}): the usual mapping is kept`);
      }
    }
    const json = out[`${top}.json`];
    let chosen = out, cells = cellCounts(json, top);
    // a mapping of the design as it was before the LUT mapping, by an ABC script (null: ABC's own, onto LUT4_COSTS)
    // (delays: the script inline with the LUT library, #78)
    const remap = (script, lines, delays = false, luts = LUT4_COSTS) => run(['-q', '-p', `${remapCommands(top, family, delays ? { inline: script, luts } : { script: !!script, luts })}; ${outputs(top)}`],
      { [PREMAP_FILE]: asText(out[PREMAP_FILE]), [LUT6_MAP_FILE]: LUT6_MAP, ...(script && !delays && { [DEPTH_ABC_FILE]: script }), ...(delays && { [LUT_LIB_FILE]: LUT_LIB }) },
      l => { if (!quiet(l)) lines.push(l); });
    // Normal, a design that gets none of High's mappings (#54): the mapping with the wider functions too (LUT4_COSTS,
    // ABC's own script, the 6-input functions split by LUT6_MAP), kept when better by DEPTH_RULE, as at High (the EPFL
    // barrel shifter's 4:1 multiplexers: two LUT4s and a MUXF5 each); started at once beside the others (not after the wide
    // multiplexers kept, as the critical path's remaps)
    const linesW = [];
    const wideN = wide && normal && !tryDepth && depth && !info.muxf?.kept && !info.muxf?.failed && out[PREMAP_FILE] && utilization(cells).luts <= DEPTH_RULE.maxLuts ? remap(null, linesW) : null;
    wideN?.catch(() => {});
    // the GIA's SOP balancing (#654): a deep design's candidate (SOPB_RULE), at both efforts and above DEPTH_RULE.maxLuts
    // too, started at once beside the other mappings
    const linesS = [];
    const sopb = depth && out[PREMAP_FILE] && utilization(cells).luts <= SOPB_RULE.maxLuts && logicLevels(json, top) > SOPB_RULE.levels
      ? remap(DEPTH_SOPB, linesS) : null;
    sopb?.catch(() => {});
    if (tryDepth && out[PREMAP_FILE] && utilization(cells).luts <= DEPTH_RULE.maxLuts) {
      // (the kept mappings' warnings: said once the choice is made, none of a mapping a failure drops)
      const kept = [];
      try {
        // the mapping with the wider functions too (LUT4_COSTS, ABC's own script), kept when better than
        // the one onto LUT4s alone by DEPTH_RULE; the depth-oriented one is then measured against it
        // (the two from the same netlist, at once: in parallel when run() has several Yosys, #86)
        let base = json;
        const linesW = [], lines2 = [], lines3 = [], lines4 = [];
        const first = Promise.all([remap(null, linesW), remap(DEPTH_ABC, lines2)]);
        // ABC9 onto LUT4s alone (#377), from the same netlist, measured against the netlist chosen of the others:
        // with 4 Yosys or more at a time started now, before the second balancing (its run, about 2.5 times a
        // remap's, the longest: last in the queue it would make the synthesis longest), else after them (each
        // more Yosys costs memory in the browser)
        const lines9 = [], lines5 = [];
        const abc9 = () => run(['-q', '-p', `${abc9RemapCommands(top, family)}; ${outputs(top)}`], { [PREMAP_FILE]: asText(out[PREMAP_FILE]), [SRL_CELLS_FILE]: SRL_CELLS },
          l => { if (!quiet(l)) lines9.push(l); });
        const early9 = withAbc9 && (run.parallel || 1) >= 4 ? abc9() : null;
        early9?.catch(() => {});
        // the second balancing (below) from the same netlist: with 4 Yosys or more at a time started now,
        // after the first ones, only its choice waiting for them (#277); with fewer, only when it is needed
        const lines6 = [];
        const second = () => Promise.all([remap(DEPTH_ABC2, lines3), remap(DEPTH_ABC2, lines4, true), remap(DEPTH_ABC3, lines5, true), remap(DEPTH_ABC2, lines6, false, LUT4_ONLY)]);
        const early = (run.parallel || 1) >= 4 ? second() : null;
        early?.catch(() => {});
        const [outW, out2] = await first;
        const jsonW = outW[`${top}.json`];
        if (jsonW) {
          const cellsW = cellCounts(jsonW, top);
          const nsW = [criticalDelay(json, top), criticalDelay(jsonW, top)], lutsW = [utilization(cells).luts, utilization(cellsW).luts];
          const slW = [slices(json), slices(jsonW)];
          info.wide = { ns: nsW[1], luts: lutsW[1], slices: slW[1], kept: keepDepth(nsW, lutsW, DEPTH_RULE, slW) };
          if (info.wide.kept) {
            chosen = outW;
            cells = cellsW;
            base = jsonW;
            for (const l of linesW) kept.push(l);
          }
        }
        const json2 = out2[`${top}.json`];
        if (json2) {
          const cells2 = cellCounts(json2, top);
          const ns = [criticalDelay(base, top), criticalDelay(json2, top)], luts = [utilization(cells).luts, utilization(cells2).luts];
          const sl = [slices(base), slices(json2)];
          // (against the mapping onto LUT4s alone; or, faster than it, against the one with the wider
          // functions, as before #54: the LUT4s alone smaller, a design limited by its depth would keep them)
          const kept = info.wide && !info.wide.kept ? keepSecond([info.wide.ns, ...ns], [info.wide.luts, ...luts], DEPTH_RULE, [info.wide.slices, ...sl])
            : keepDepth(ns, luts, DEPTH_RULE, sl);
          Object.assign(info, { tried: true, kept, ns, luts, slices: sl });
          if (info.kept) {
            chosen = out2;
            cells = cells2;
            for (const l of lines2) kept.push(l);
            // balanced once more (DEPTH_ABC2), with and without the LUT delays (#78), twice more with them
            // (DEPTH_ABC3, #52), and once more onto LUT4s alone (#370), at once; each kept by keepSecond, a later one in
            // place of an earlier one when both are and it is better by DEPTH_RULE
            const [out3, out4, out5, out6] = await (early || second());
            const cand = (o, lines) => {
              const j = o[`${top}.json`];
              if (!j) return null;
              const c = cellCounts(j, top), n = criticalDelay(j, top), l = utilization(c).luts, k = slices(j);
              return { out: o, lines, cells: c, ns: n, luts: l, slices: k, kept: keepSecond([...ns, n], [...luts, l], DEPTH_RULE, [...sl, k]) };
            };
            const a = cand(out3, lines3), b = cand(out4, lines4), c = cand(out5, lines5), d = cand(out6, lines6);
            const best = [a, b, c, d].reduce((x, y) => (y?.kept && (!x || keepDepth([x.ns, y.ns], [x.luts, y.luts], DEPTH_RULE, [x.slices, y.slices])) ? y : x), null);
            if (a) info.second = { ns: a.ns, luts: a.luts, slices: a.slices, kept: best === a };
            if (b) info.delays = { ns: b.ns, luts: b.luts, slices: b.slices, kept: best === b };
            if (c) info.third = { ns: c.ns, luts: c.luts, slices: c.slices, kept: best === c };
            if (d) info.lut4 = { ns: d.ns, luts: d.luts, slices: d.slices, kept: best === d };
            if (best) {
              chosen = best.out;
              cells = best.cells;
              for (const l of best.lines) kept.push(l);
            }
          }
        }
        // ABC9's netlist kept when better than the one chosen by DEPTH_RULE (keepDepth, with the slices: #377)
        const out9 = withAbc9 ? await (early9 || abc9()) : {};
        const json9 = out9[`${top}.json`];
        if (json9) {
          const cells9 = cellCounts(json9, top);
          const ns9 = [criticalDelay(chosen[`${top}.json`], top), criticalDelay(json9, top)], luts9 = [utilization(cells).luts, utilization(cells9).luts];
          const sl9 = [slices(chosen[`${top}.json`]), slices(json9)];
          info.abc9 = { ns: ns9[1], luts: luts9[1], slices: sl9[1], kept: keepDepth(ns9, luts9, DEPTH_RULE, sl9) };
          if (info.abc9.kept) {
            chosen = out9;
            cells = cells9;
            kept.length = 0;
            for (const l of lines9) kept.push(l);
          }
        }
        for (const l of kept) sayNew(l);
      } catch (e) {
        // an optional mapping that failed (Yosys crashed; in the browser, out of memory once more): the
        // first mapping's netlist, valid, is kept and said (#401)
        chosen = out;
        cells = cellCounts(json, top);
        for (const k of ['wide', 'second', 'delays', 'third', 'lut4', 'abc9']) delete info[k];
        Object.assign(info, { tried: false, kept: false, ns: null, luts: null, slices: null, failed: e.message });
        sayNew(`Warning: the depth-oriented mapping failed (${e.message}): the usual mapping is kept`);
      }
    }
    // the SOP-balanced netlist kept when better than the one chosen by DEPTH_RULE (at Normal, a design that gets none of
    // High's mappings, too large for them: only when DEEP_RULE.gain faster, as High's mappings at Normal, #611)
    if (sopb) {
      try {
        const outS = await sopb, jS = outS[`${top}.json`];
        if (jS) {
          const j0 = chosen[`${top}.json`], cellsS = cellCounts(jS, top);
          const ns = [criticalDelay(j0, top), criticalDelay(jS, top)], luts = [utilization(cells).luts, utilization(cellsS).luts], sl = [slices(j0), slices(jS)];
          const kept = keepDepth(ns, luts, DEPTH_RULE, sl) && (!normal || tryDepth || ns[1] <= ns[0] * (1 - deepRule.gain));
          info.sopb = { ns: ns[1], luts: luts[1], slices: sl[1], kept };
          if (kept) {
            chosen = outS;
            cells = cellsS;
            for (const l of linesS) sayNew(l);
          }
        }
      } catch (e) {
        info.sopb = { kept: false, failed: e.message };
        sayNew(`Warning: the mapping balanced as sums of products failed (${e.message}): the netlist chosen before is kept`);
      }
    }
    // the critical path mapped again for speed (#652), then the clock enables that end it folded into the D logic
    // (#653): each a candidate from the netlist before the LUT mapping, measured against the netlist chosen of the
    // others and kept by DEPTH_RULE (before them, the depth-oriented ones were measured against it: the EPFL max
    // 18 % slower)
    // (not after an optional mapping that failed: in the browser, out of memory once more, #401)
    if (speed && !info.muxf?.kept && !info.muxf?.failed && !info.failed && !info.sopb?.failed && out[PREMAP_FILE] && utilization(cells).luts <= SPEED_RULE.maxLuts) {
      const lutsOf = j => utilization(cellCounts(j, top)).luts;
      const better = (a, b) => keepDepth([criticalDelay(a, top), criticalDelay(b, top)], [lutsOf(a), lutsOf(b)], DEPTH_RULE, [slices(a), slices(b)]);
      const premap = asText(out[PREMAP_FILE]);
      let script = null, base = chosen;
      try {
        const linesS = [];
        const outS = await run(['-q', '-p', `${speedRemapCommands(top, family)}; ${outputs(top)}`], { [PREMAP_FILE]: premap }, l => { if (!quiet(l)) linesS.push(l); });
        const jS = outS[`${top}.json`];
        if (jS) {
          info.speed = { ns: criticalDelay(jS, top), luts: lutsOf(jS), slices: slices(jS), kept: better(base[`${top}.json`], jS) };
          if (info.speed.kept) {
            base = outS;
            script = SPEED_ABC;
          }
        }
        const ffs = criticalEnables(base[`${top}.json`], top, SPEED_RULE.margin);
        const linesF = [];
        const outF = ffs.length ? await run(['-q', '-p', `${foldRemapCommands(top, family, { script })}; ${outputs(top)}`],
          { [PREMAP_FILE]: premap, [FOLD_CE_MAP_FILE]: FOLD_CE_MAP, [FOLD_CE_FILE]: ffs.map(c => `${top}/${c}\n`).join('') }, l => { if (!quiet(l)) linesF.push(l); }) : {};
        const jF = outF[`${top}.json`];
        if (jF) {
          info.fold = { flipFlops: ffs.length, ns: criticalDelay(jF, top), luts: lutsOf(jF), slices: slices(jF), kept: better(base[`${top}.json`], jF) };
          if (info.fold.kept) base = outF;
        }
        if (base !== chosen) {
          chosen = base;
          cells = cellCounts(chosen[`${top}.json`], top);
          for (const l of [...(info.speed?.kept ? linesS : []), ...(info.fold?.kept ? linesF : [])]) sayNew(l);
        }
      } catch (e) {
        // (optional mappings that failed: the netlist chosen before them kept, as the others, #401)
        for (const k of ['speed', 'fold']) delete info[k];
        info.speedFailed = e.message;
        sayNew(`Warning: the critical path's remapping failed (${e.message}): the netlist chosen before it is kept`);
      }
    }
    // (Normal: the wider mapping measured against the netlist chosen of the others, the critical path's remaps included:
    // measured before them, it kept them out where they were faster, itc99-b08 11 % slower)
    if (wideN) {
      try {
        const outW = await wideN, jW = outW[`${top}.json`];
        if (jW) {
          const cellsW = cellCounts(jW, top);
          const j0 = chosen[`${top}.json`];
          const ns = [criticalDelay(j0, top), criticalDelay(jW, top)], luts = [utilization(cells).luts, utilization(cellsW).luts], sl = [slices(j0), slices(jW)];
          info.wide = { ns: ns[1], luts: luts[1], slices: sl[1], kept: keepDepth(ns, luts, DEPTH_RULE, sl) };
          if (info.wide.kept) {
            chosen = outW;
            cells = cellsW;
            for (const l of linesW) sayNew(l);
          }
        }
      } catch (e) {
        info.wide = { kept: false, failed: e.message };
        sayNew(`Warning: the mapping with the wider functions failed (${e.message}): the netlist chosen before is kept`);
      }
    }
    return { chosen, cells, info, ns: criticalDelay(chosen[`${top}.json`], top), slices: () => slices(chosen[`${top}.json`]) };
  }
  // a design with logic written as gates: its carry chains (adders, comparators: core/carry-chain.js, #77)
  // made $alu cells between two runs of Yosys (up to synth_xilinx's fine step, the netlist rewritten, then on
  // from it); mapped both with and without them, the faster kept (as the depth-oriented mapping: a chain of
  // a comparator that then combines several bits at once, EPFL max, is slower). A design without such a
  // chain is synthesized as before, in one run. At effort Normal only an adder's chains of ADDER_MIN bits at
  // least (with their sums: the EPFL adder, 98 ns as gates, 17 ns on the carry chain), the usual run at once
  // beside the first one (#377): a design without them costs no more time (the EPFL multiplier's chains,
  // slower, kept out by the rule: 13 s more beside its usual run's 300).
  // (with machines to try one-hot, the usual netlist's messages are said once the choice is made)
  const fsmFound = probe && await probe;
  const machines = fsmFound?.machines.length ? fsmFound.machines : null;
  const linesU = [];
  const emit = machines ? l => { if (!quiet(l)) linesU.push(l); } : line;
  let res = null, chains = [];
  if (lut4 && gates) {
    // (Normal, not deep: an adder's chains only, its first run started beside the usual one, #377)
    const adders = !highMappings;
    const [, rest] = splitCommands(top, family, opts);
    // (at Normal, not deep, the usual run's netlist when the first one fails)
    const pre = await (preRun || coarse()).catch(e => { if (adders) return {}; throw e; });
    const rw = pre[CHAIN_FILE] ? rewriteCarryChains(asText(pre[CHAIN_FILE]), { top, ...(adders && { adders: true, minChain: ADDER_MIN }) }) : { chains: [] };
    if (rw.chains.length) {
      const linesC = [], linesN = [];
      // (both at once, #86)
      const [resC, resN] = await Promise.all([
        run(['-q', '-p', `read_verilog -lib -specify +/xilinx/cells_sim.v; read_verilog -lib +/xilinx/cells_xtra.v; read_verilog -lib ${SRL_CELLS_FILE}; read_json ${CHAIN_FILE}; hierarchy -top ${top}; ${rest}; ${outputs(top)}`],
          { ...yosysFiles(top, text), [CHAIN_FILE]: JSON.stringify(rw.json) }, l => { if (!quiet(l)) linesC.push(l); }).then(outC => withDepth(outC, () => {}, linesC)),
        usualRun(l => { if (!quiet(l)) linesN.push(l); }).then(outN => withDepth(outN, () => {}, linesN)),
      ]);
      const measure = r => ({ ns: r.ns, luts: utilization(r.cells).luts, slices: r.slices() });
      const withChains = keepChains(measure(resN), measure(resC), { linesN, linesC });
      if (withChains) { chains = rw.chains; for (const l of [...lines1, ...linesC]) emit(l); res = resC; }
      else { for (const l of linesN) emit(l); res = resN; }
    }
  }
  if (!res) res = machines ? await withDepth(await usualRun(emit), () => {}, linesU) : await withDepth(await usualRun(line), line, [...log]);
  if (machines) {
    // the machines one-hot (#539): marked, extracted and re-encoded, their new power-up codes written back, the
    // rest of the script and High's mappings from that netlist; kept when better than the usual one by DEPTH_RULE
    const linesF = [...linesP];
    const say = l => { if (!quiet(l)) linesF.push(l); };
    let resF = null, failed = null;
    try {
      const { il } = markWires(asText(fsmFound.out[FSM_PRE_FILE]), machines.map(m => m.wire), 'one-hot');
      const out2 = await run(['-q', '-p', fsmExtractCommands()], { [FSM_MARKED_FILE]: il }, say);
      const inits = fsmInits(machines, asText(out2[FSM_ENC_FILE]));
      const cmds = synthCommands(top, family, opts), first = `${synth} -run :fine; `;
      if (inits && cmds.startsWith(first)) {
        const out3 = await run(['-q', '-p', `${fsmRestCommands(synth, cmds.slice(first.length))}; ${outputs(top)}`],
          { ...yosysFiles(top, text), [FSM_POST_FILE]: setInits(asText(out2[FSM_POST_FILE]), inits) }, say);
        resF = await withDepth(out3, () => {}, linesF);
      }
    } catch (e) { failed = e.message; }
    const lutsOf = r => utilization(r.cells).luts;
    const kept = !!resF && (withFsm === 'always' || keepDepth([res.ns, resF.ns], [lutsOf(res), lutsOf(resF)], DEPTH_RULE, [res.slices(), resF.slices()]));
    const fsmInfo = { machines: machines.map(({ wire, states }) => ({ wire, states })), ns: resF?.ns ?? null, luts: resF ? lutsOf(resF) : null, slices: resF ? resF.slices() : null, kept };
    if (kept) { res = resF; chains = []; }
    for (const l of kept ? linesF : linesU) line(l);
    if (failed) {
      fsmInfo.failed = failed;
      line(`Warning: the one-hot encoding of the state machines failed (${failed}): the usual encoding is kept`);
    }
    res.info.fsm = fsmInfo;
  }
  const { chosen, cells, info } = res;
  if (deep) Object.assign(info, { levels: deep.levels, auto: deep.deep });
  const files = { [`${top}_syn.v`]: text, [`${top}.json`]: chosen[`${top}.json`], [`${top}_yosys.v`]: chosen[`${top}_yosys.v`] || '', [`${top}_stat.txt`]: chosen[`${top}_stat.txt`] || '' };
  // (a shift-chain array read at a variable tap is made flip-flops on purpose, then SRL16Es: Yosys's
  // "Replacing memory \m with list of registers" says nothing to the user there, #5)
  const expected = l => shiftArrays.some(n => l.startsWith(`Warning: Replacing memory ${n} with list of registers.`));
  const result = { top, files, cells, util: utilization(cells), warnings: [...warnings, ...log.filter(l => /^Warning:/.test(l) && !expected(l))], log, depth: info, chains };
  // (Normal, a deep design: High's mappings kept only when DEEP_RULE.gain faster than Normal's own netlist, #611;
  // else that one, its levels and the time High's took said)
  if (deep?.deep) {
    const plain = await synthesizeOpen(design, { family, run, depth: false, effort, abc9: withAbc9 });
    const ns = [criticalDelay(plain.files[`${top}.json`], top), criticalDelay(files[`${top}.json`], top)];
    info.normal = { ns: ns[0], luts: plain.util.luts, kept: !(ns[1] <= ns[0] * (1 - deepRule.gain)) };
    if (info.normal.kept) return { ...plain, depth: { ...plain.depth, levels: deep.levels, auto: true, high: { ns: ns[1], luts: result.util.luts }, normal: info.normal } };
  }
  return result;
}

/**
 * What a failed Yosys run says (#153): { message, code, crash }. Yosys's own error exit has an exit
 * code; anything else is a crash of its WebAssembly module, e.g. a C++ exception it does not catch
 * (std::bad_alloc when the browser gives it no more memory), which reaches JavaScript as a
 * WebAssembly.Exception, or a RangeError, without a usable message.
 */
export function yosysError(e) {
  if (e?.code !== undefined) return { message: `Yosys failed (exit code ${e.code})`, code: e.code, crash: false };
  const wasmException = typeof WebAssembly !== 'undefined' && WebAssembly.Exception && e instanceof WebAssembly.Exception;
  const what = wasmException ? 'an exception inside its WebAssembly module that it does not handle (out of memory?)'
    : typeof e?.message === 'string' && e.message ? e.message
    : e?.name || (e != null && typeof e !== 'object' ? String(e) : `an error without a message (${Object.prototype.toString.call(e)})`);
  return { message: `Yosys failed: ${what}`, code: undefined, crash: true };
}

/** Text of a Yosys output file (YoWASP gives strings, or bytes for binary files). */
export const asText = v => (typeof v === 'string' ? v : v instanceof Uint8Array ? new TextDecoder().decode(v) : '');

/**
 * Line splitter for Yosys's stdout / stderr byte streams: feed(bytes) calls onLine for each complete
 * line, feed.end() (the end of the run) flushes the rest. YoWASP 0.70 calls the stream with null after
 * each write (a flush, even in the middle of a line: "Warning: " then the message): not the end. The
 * lines are plain text: Yosys 0.70 colours its log (ANSI escapes, "\x1b[93mWarning: \x1b[0m…") even
 * when it is not a terminal, and its option --no-color is unknown to the earlier versions; the escapes
 * are dropped here (one place for every run).
 */
export function lineStream(onLine) {
  const dec = new TextDecoder();
  const plain = l => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  let buf = '';
  const feed = bytes => {
    if (!bytes) return;
    buf += dec.decode(bytes, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { onLine(plain(buf.slice(0, i).replace(/\r$/, ''))); buf = buf.slice(i + 1); }
  };
  // (the rest: a last line with no newline; not the escapes alone that end Yosys 0.70's output)
  feed.end = () => { buf = plain(buf + dec.decode()); if (buf) onLine(buf); buf = ''; };
  return feed;
}

/**
 * Blobs readable in a worker of a page with an opaque origin (#556): in WebKit (Safari), a worker of a page
 * opened from file:// (the single-file edition) cannot read any Blob, whatever started it: every read fails
 * (NotReadableError, "Cannot load blob:null/…"), YoWASP's own among them (it reads Yosys's resources with
 * `new Blob(chunks).arrayBuffer()`), so that Yosys could not start. There (self.origin 'null': in Chrome and
 * Firefox too, where it changes nothing) Blob is replaced by one that keeps its bytes and reads them in
 * JavaScript. Self-contained: yosysWorkerSource puts its text into the Yosys workers. Returns whether it did.
 */
export function readableBlobs(scope = globalThis) {
  const Native = scope.Blob;
  if (!Native || scope.origin !== 'null' || Native.readable) return false;
  // (the bytes of each Blob made here; null when a part is a Blob made elsewhere, which only the
  // browser can read: such a Blob is read as before)
  const kept = new WeakMap();
  const bytesOf = p => p instanceof ArrayBuffer ? new Uint8Array(p)
    : ArrayBuffer.isView(p) ? new Uint8Array(p.buffer, p.byteOffset, p.byteLength)
    : p instanceof Native ? kept.get(p) ?? null
    : new TextEncoder().encode(String(p));
  class ReadableBlob extends Native {
    constructor(parts = [], options) {
      super(parts, options);
      const chunks = [...parts].map(bytesOf);
      if (chunks.includes(null)) { kept.set(this, null); return; }
      const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of chunks) { all.set(c, at); at += c.length; }
      kept.set(this, all);
    }
    async arrayBuffer() { const b = kept.get(this); return b ? b.slice().buffer : super.arrayBuffer(); }
    async text() { const b = kept.get(this); return b ? new TextDecoder().decode(b) : super.text(); }
    async bytes() { const b = kept.get(this); return b ? b.slice() : super.bytes(); }
    stream() {
      const b = kept.get(this);
      return b ? new ReadableStream({ start(c) { if (b.length) c.enqueue(b.slice()); c.close(); } }) : super.stream();
    }
    slice(start, end, type) {
      const b = kept.get(this);
      return b ? new ReadableBlob([b.slice(start, end)], { type: type ?? '' }) : super.slice(start, end, type);
    }
  }
  ReadableBlob.readable = true;
  scope.Blob = ReadableBlob;
  return true;
}

/**
 * The code of a Yosys worker (as web/js/yosys-worker.js) that loads Yosys from bundleUrl (YoWASP's
 * gen/bundle.js): for a worker started from a Blob, with no file of its own. A classic worker's code
 * (Yosys by a dynamic import, which a classic worker may do, a static one not): a page opened from
 * file:// (the single-file edition, an opaque origin) cannot start a module worker from a Blob (#512);
 * its Blobs made readable first (readableBlobs: WebKit, #556).
 */
export function yosysWorkerSource(bundleUrl) {
  return `(${readableBlobs})(self);
const yosys = import(${JSON.stringify(String(bundleUrl))});
const lineStream = ${lineStream};
const asText = ${asText};
const yosysError = ${yosysError};
const runYosysOnce = (${yosysRunner})(lineStream, asText, yosysError);
self.onmessage = async ({ data: { id, args, files } }) => {
  try { const { runYosys } = await yosys; self.postMessage({ id, files: await runYosysOnce(runYosys, args, files, line => self.postMessage({ id, line })) }); }
  catch (e) { self.postMessage({ id, error: e.message, code: e.code, crash: e.crash }); }
};
`;
}

/**
 * One run of Yosys, for every place that runs it (Node, its worker threads, the page's workers, the
 * browser edition's flow worker and its Blob workers, #403): runYosys (YoWASP's) with args and files;
 * Yosys's lines to onLine (lineStream); its output files as text (asText); an error as yosysError
 * says ({ message, code, crash }: the pools run a crashed one again). opts: more options of runYosys
 * (fetchProgress).
 */
export const runYosysOnce = yosysRunner(lineStream, asText, yosysError);

/** runYosysOnce made from its three helpers, given as arguments: yosysWorkerSource writes this
 *  function's text into a Blob worker's code, where only what it is given exists (a bundler renames
 *  the module's own names, #403). */
function yosysRunner(lineStream, asText, yosysError) {
  return async (runYosys, args, files, onLine = () => {}, opts = {}) => {
    const out = lineStream(onLine);
    try {
      const res = await runYosys(args, files, { stdout: out, stderr: out, ...opts });
      out.end();
      return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, asText(v)]));
    } catch (e) {
      out.end();
      const { message, code, crash } = yosysError(e);
      throw Object.assign(new Error(message), { code, crash });
    }
  };
}
