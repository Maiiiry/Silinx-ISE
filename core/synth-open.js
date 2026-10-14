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
 * its finalize step). srl: false leaves the shift registers in flip-flops; premap: a file name to
 * write the design to just before the LUT mapping (RTLIL), for remapCommands.
 */
export function synthCommands(top, family, { srl = true, premap = null } = {}) {
  const fam = YOSYS_FAMILY[family];
  if (!fam) throw new Error(`open synthesis: no Yosys mapping for the device family '${family}'`);
  const synth = `synth_xilinx -family ${fam} -ise -flatten -top ${top}`;
  if (!LUT4_FAMILIES.has(fam)) return synth;
  const shreg = srl ? `${synth} -run :map_ffs; xilinx_srl -fixed -minlen 3; techmap -map ${SRL_MAP_FILE}; ${synth} -run map_ffs:map_luts` : `${synth} -run :map_luts`;
  return `${shreg}; opt_expr -mux_undef -noclkinv; ${premap ? `write_rtlil ${premap}; ` : ''}abc -luts ${LUT4_COSTS}; ${lutsToCells(synth)}`;
}
const lutsToCells = synth => 'clean; techmap -map +/xilinx/ff_map.v; techmap -map +/xilinx/lut_map.v -map +/xilinx/cells_map.v -D LUT_WIDTH=4; '
  + `xilinx_dffopt -lut4; opt_lut_ins -tech xilinx; ${synth} -run finalize:`;

// The depth-oriented LUT mapping (the 4-input-LUT families), tried after the usual one: ABC's
// default script for LUTs (strash; …; dch -f; if; mfs2) maps the logic as its structure is: a
// comparator written as a chain of gates stays a chain (the EPFL max benchmark: 45 levels of LUTs,
// 69.9 ns where ISE's XST gets 25.7, #52). This one first balances the logic as sums of products
// (if -g: SOP balancing), then maps it again for area as the default does. The open synthesis
// keeps whichever netlist is faster by its estimate (criticalDelay), when it is not much larger
// (DEPTH_RULE); research/synth-quality/README.md, "Logic depth".
export const DEPTH_ABC = 'strash; dc2; balance; dch -f; if -g; strash; dc2; dch -f; if; mfs2';
export const DEPTH_ABC_FILE = 'silinx_depth.abc';
export const PREMAP_FILE = 'silinx_premap.il';
// the depth-oriented netlist is kept when its critical path is at least `gain` shorter and it has
// no more LUTs in proportion than it gains in speed, `luts` (10 %) more at least (or it is no slower
// and no larger, and better in one); tried on designs of up to `maxLuts` LUTs (ABC's SOP balancing
// of the largest, AES's 10 000 LUTs, takes minutes and gigabytes)
export const DEPTH_RULE = { gain: 0.03, luts: 0.1, maxLuts: 5000 };
/** Is the depth-oriented mapping kept? ns, luts: [usual, depth-oriented]. */
export function keepDepth(ns, luts, rule = DEPTH_RULE) {
  const faster = ns[1] <= ns[0] * (1 - rule.gain) && luts[1] <= luts[0] * (1 + Math.max(rule.luts, 1 - ns[1] / ns[0]));
  const better = ns[1] <= ns[0] && luts[1] <= luts[0] && (ns[1] < ns[0] || luts[1] < luts[0]);
  return faster || better;
}

/** The commands that map the design written by synthCommands(…, { premap: PREMAP_FILE }) again,
 *  with the depth-oriented ABC script (DEPTH_ABC, in the file DEPTH_ABC_FILE given to Yosys). */
export function remapCommands(top, family) {
  const synth = `synth_xilinx -family ${YOSYS_FAMILY[family]} -ise -flatten -top ${top}`;
  return `read_rtlil ${PREMAP_FILE}; abc -luts ${LUT4_COSTS} -script ${DEPTH_ABC_FILE}; ${lutsToCells(synth)}`;
}

// $scopeinfo cells (kept hierarchy names) are not cells of the device: deleted before writing
const outputs = top => `delete t:$scopeinfo; write_json ${top}.json; write_verilog -noattr ${top}_yosys.v; tee -q -o ${top}_stat.txt stat`;

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
export function criticalDelay(json, top) {
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
  const worst = () => {
    let w = 0;
    for (const c of cells) for (const [p, bits] of ins(c)) { const s = setup(c, p); if (s !== null) for (const b of bits) w = Math.max(w, arrIn(c, p, b) + s); }
    return w;
  };
  const ff = worst();
  if (ff > 0) return ff;
  withIO = true;
  memo.clear();
  return worst();
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
 * Yosys's messages. onLine receives Yosys's output line by line. depth (true): on the
 * 4-input-LUT families the design is mapped a second time for logic depth (DEPTH_ABC), and that
 * netlist is kept when it is faster (DEPTH_RULE); r.depth says what happened: { tried, kept,
 * ns: [usual, depth-oriented] (criticalDelay), luts: [usual, depth-oriented] }.
 */
export async function synthesizeOpen(design, { family = 'spartan3e', run, onLine = () => {}, depth = true } = {}) {
  const { text, top, warnings } = toVerilog(design);
  const tryDepth = depth && LUT4_FAMILIES.has(YOSYS_FAMILY[family]);
  const script = yosysScript(top, family, tryDepth ? { premap: PREMAP_FILE } : {});
  const log = [];
  const line = l => { if (!QUIET.some(re => re.test(l))) { log.push(l); onLine(l); } };
  const out = await run(['-q', '-p', script], yosysFiles(top, text), line);
  const json = out[`${top}.json`];
  if (!json) throw Object.assign(new Error('Yosys wrote no netlist'), { lines: log });
  let chosen = out, cells = cellCounts(json, top);
  const info = { tried: false, kept: false, ns: null, luts: null };
  if (tryDepth && out[PREMAP_FILE] && utilization(cells).luts <= DEPTH_RULE.maxLuts) {
    // the design as it was before the LUT mapping, mapped again for depth; its messages are kept
    // apart (the first run printed them), only a warning of its own joins the log when it is kept
    const lines2 = [];
    const out2 = await run(['-q', '-p', `${remapCommands(top, family)}; ${outputs(top)}`],
      { [PREMAP_FILE]: asText(out[PREMAP_FILE]), [DEPTH_ABC_FILE]: DEPTH_ABC }, l => { if (!QUIET.some(re => re.test(l))) lines2.push(l); });
    const json2 = out2[`${top}.json`];
    if (json2) {
      const cells2 = cellCounts(json2, top);
      const ns = [criticalDelay(json, top), criticalDelay(json2, top)], luts = [utilization(cells).luts, utilization(cells2).luts];
      Object.assign(info, { tried: true, kept: keepDepth(ns, luts), ns, luts });
      if (info.kept) {
        chosen = out2;
        cells = cells2;
        for (const l of lines2) if (/^Warning:/.test(l) && !log.includes(l)) line(l);
      }
    }
  }
  const files = { [`${top}_syn.v`]: text, [`${top}.json`]: chosen[`${top}.json`], [`${top}_yosys.v`]: chosen[`${top}_yosys.v`] || '', [`${top}_stat.txt`]: chosen[`${top}_stat.txt`] || '' };
  return { top, files, cells, util: utilization(cells), warnings: [...warnings, ...log.filter(l => /^Warning:/.test(l))], log, depth: info };
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
