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
module SRL16E_1 (output Q, input A0, input A1, input A2, input A3, input CE, input CLK, input D);
  parameter [15:0] INIT = 16'h0000;
endmodule
`;
export const SRL_MAP = `// Silinx: $__XILINX_SHREG_ (xilinx_srl) as SRL16E for the 4-input-LUT families
module \\$__XILINX_SHREG_ (input C, input D, input [31:0] L, input E, output Q, output SO);
  parameter DEPTH = 0;
  parameter [DEPTH-1:0] INIT = 0;
  parameter CLKPOL = 1;
  parameter ENPOL = 2;
  // xilinx_srl's INIT shifts out its least significant bit first; SRL16E's INIT[a] is stage a
  function [DEPTH-1:0] brev;
    input [DEPTH-1:0] din;
    integer i;
    begin
      for (i = 0; i < DEPTH; i = i + 1) brev[i] = din[DEPTH-1-i];
    end
  endfunction
  localparam [DEPTH-1:0] INIT_R = brev(INIT);
  wire CE;
  generate
    if (ENPOL == 0) assign CE = ~E;
    else if (ENPOL == 1) assign CE = E;
    else assign CE = 1'b1;
    if (DEPTH == 1) begin
      if (CLKPOL) FDRE #(.INIT(INIT_R)) _TECHMAP_REPLACE_ (.D(D), .Q(Q), .C(C), .CE(CE), .R(1'b0));
      else FDRE_1 #(.INIT(INIT_R)) _TECHMAP_REPLACE_ (.D(D), .Q(Q), .C(C), .CE(CE), .R(1'b0));
    end else if (DEPTH <= 16) begin
      if (CLKPOL) SRL16E #(.INIT(INIT_R)) _TECHMAP_REPLACE_ (.A0(L[0]), .A1(L[1]), .A2(L[2]), .A3(L[3]), .CE(CE), .CLK(C), .D(D), .Q(Q));
      else SRL16E_1 #(.INIT(INIT_R)) _TECHMAP_REPLACE_ (.A0(L[0]), .A1(L[1]), .A2(L[2]), .A3(L[3]), .CE(CE), .CLK(C), .D(D), .Q(Q));
    end else begin
      wire T;
      if (CLKPOL) SRL16E #(.INIT(INIT_R[15:0])) fpga_srl (.A0(1'b1), .A1(1'b1), .A2(1'b1), .A3(1'b1), .CE(CE), .CLK(C), .D(D), .Q(T));
      else SRL16E_1 #(.INIT(INIT_R[15:0])) fpga_srl (.A0(1'b1), .A1(1'b1), .A2(1'b1), .A3(1'b1), .CE(CE), .CLK(C), .D(D), .Q(T));
      \\$__XILINX_SHREG_ #(.DEPTH(DEPTH-16), .INIT(INIT[DEPTH-17:0]), .CLKPOL(CLKPOL), .ENPOL(ENPOL)) fpga_srl_rest (.C(C), .D(T), .L(DEPTH-17), .E(E), .Q(Q));
    end
  endgenerate
endmodule
`;

/**
 * The Yosys commands that map the module `top` onto the cells of the family (synth_xilinx, with
 * the LUT mapping of the 4-input-LUT families replaced: synth_xilinx up to its map_ffs step, the
 * fixed-length shift registers as SRL16E (SRL_MAP: the file `silinx_srl_map.v` given to Yosys), up
 * to its map_luts step, then the steps of map_luts with ABC on LUT4_COSTS, then synth_xilinx from
 * its finalize step). srl: false leaves the shift registers in flip-flops.
 */
export function synthCommands(top, family, { srl = true } = {}) {
  const fam = YOSYS_FAMILY[family];
  if (!fam) throw new Error(`open synthesis: no Yosys mapping for the device family '${family}'`);
  const synth = `synth_xilinx -family ${fam} -ise -flatten -top ${top}`;
  if (!LUT4_FAMILIES.has(fam)) return synth;
  const shreg = srl ? `${synth} -run :map_ffs; xilinx_srl -fixed -minlen 3; techmap -map ${SRL_MAP_FILE}; ${synth} -run map_ffs:map_luts` : `${synth} -run :map_luts`;
  return `${shreg}; opt_expr -mux_undef -noclkinv; abc -luts ${LUT4_COSTS}; clean; `
    + 'techmap -map +/xilinx/ff_map.v; techmap -map +/xilinx/lut_map.v -map +/xilinx/cells_map.v -D LUT_WIDTH=4; '
    + `xilinx_dffopt -lut4; opt_lut_ins -tech xilinx; ${synth} -run finalize:`;
}

/** The Yosys script: read the flat module, map it, write the netlist and its statistics. */
export function yosysScript(top, family, opts = {}) {
  // $scopeinfo cells (kept hierarchy names) are not cells of the device: deleted before writing
  const cells = LUT4_FAMILIES.has(YOSYS_FAMILY[family]) && opts.srl !== false ? `read_verilog -lib ${SRL_CELLS_FILE}; ` : '';
  return `${cells}read_verilog -sv ${top}_syn.v; ${synthCommands(top, family, opts)}; delete t:$scopeinfo; `
    + `write_json ${top}.json; write_verilog -noattr ${top}_yosys.v; tee -q -o ${top}_stat.txt stat`;
}

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

/**
 * Synthesize an elaborated design (core/elaborate.js). run(args, files, onLine) runs Yosys and
 * resolves with its output files ({ name: text }), or rejects with an error whose `lines` holds
 * Yosys's messages. onLine receives Yosys's output line by line.
 */
export async function synthesizeOpen(design, { family = 'spartan3e', run, onLine = () => {} } = {}) {
  const { text, top, warnings } = toVerilog(design);
  const script = yosysScript(top, family);
  const log = [];
  const line = l => { if (!QUIET.some(re => re.test(l))) { log.push(l); onLine(l); } };
  const out = await run(['-q', '-p', script], yosysFiles(top, text), line);
  const json = out[`${top}.json`];
  if (!json) throw Object.assign(new Error('Yosys wrote no netlist'), { lines: log });
  const files = { [`${top}_syn.v`]: text, [`${top}.json`]: json, [`${top}_yosys.v`]: out[`${top}_yosys.v`] || '', [`${top}_stat.txt`]: out[`${top}_stat.txt`] || '' };
  const cells = cellCounts(json, top);
  return { top, files, cells, util: utilization(cells), warnings: [...warnings, ...log.filter(l => /^Warning:/.test(l))], log };
}

/** Text of a Yosys output file (YoWASP gives strings, or bytes for binary files). */
export const asText = v => (typeof v === 'string' ? v : v instanceof Uint8Array ? new TextDecoder().decode(v) : '');

/**
 * Line splitter for Yosys's stdout / stderr byte streams: feed(bytes | null) calls onLine for each
 * complete line; null (end of stream) flushes the rest.
 */
export function lineStream(onLine) {
  const dec = new TextDecoder();
  let buf = '';
  return bytes => {
    buf += bytes ? dec.decode(bytes, { stream: true }) : dec.decode();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i).replace(/\r$/, '')); buf = buf.slice(i + 1); }
    if (!bytes && buf) { onLine(buf); buf = ''; }
  };
}
