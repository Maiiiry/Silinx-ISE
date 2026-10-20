// The reserved words of VHDL and Verilog (#679): one list for every name the app gives (a new source, a
// module, a rename, a port, an I/O marker, a net) and for the checks of the drawings.
//
// A drawing's HDL is generated in VHDL or in Verilog, and VHDL ignores letter case: a new name is refused
// when it is a reserved word of either language in any letter case (AND, Module, wire). An existing name
// that only one language's compiler refuses (as written) is an error of that drawing; the others a warning.
//
// Isomorphic module (browser + Node).

const words = s => new Set(s.trim().split(/\s+/));

// VHDL-93 (IEEE 1076-1993, what XST reads)
export const VHDL93_WORDS = words(`abs access after alias all and architecture array assert attribute begin block body
  buffer bus case component configuration constant disconnect downto else elsif end entity exit file for function generate
  generic group guarded if impure in inertial inout is label library linkage literal loop map mod nand new next nor not null
  of on open or others out package port postponed procedure process pure range record register reject rem report return rol
  ror select severity signal shared sla sll sra srl subtype then to transport type unaffected units until use variable wait
  when while with xnor xor`);
// VHDL-2008 (IEEE 1076-2008 §15.10, with PSL's)
export const VHDL_WORDS = new Set([...VHDL93_WORDS, ...words(`assume assume_guarantee context cover default fairness force
  parameter property protected release restrict restrict_guarantee sequence strong vmode vprop vunit`)]);
// Verilog-2005 (IEEE 1364-2005 Annex B, Verilog-2001's and uwire)
export const VERILOG_WORDS = words(`always and assign automatic begin buf bufif0 bufif1 case casex casez cell cmos config
  deassign default defparam design disable edge else end endcase endconfig endfunction endgenerate endmodule endprimitive
  endspecify endtable endtask event for force forever fork function generate genvar highz0 highz1 if ifnone incdir include
  initial inout input instance integer join large liblist library localparam macromodule medium module nand negedge nmos nor
  noshowcancelled not notif0 notif1 or output parameter pmos posedge primitive pull0 pull1 pulldown pullup pulsestyle_ondetect
  pulsestyle_onevent rcmos real realtime reg release repeat rnmos rpmos rtran rtranif0 rtranif1 scalared showcancelled signed
  small specify specparam strong0 strong1 supply0 supply1 table task time tran tranif0 tranif1 tri tri0 tri1 triand trior
  trireg unsigned use uwire vectored wait wand weak0 weak1 while wire wor xnor xor`);
// SystemVerilog (IEEE 1800-2017 Annex B), beyond Verilog-2005's
export const SV_WORDS = words(`accept_on alias always_comb always_ff always_latch assert assume before bind bins binsof bit
  break byte chandle checker class clocking const constraint context continue cover covergroup coverpoint cross dist do
  endchecker endclass endclocking endgroup endinterface endpackage endprogram endproperty endsequence enum eventually expect
  export extends extern final first_match foreach forkjoin global iff ignore_bins illegal_bins implements implies import
  inside int interconnect interface intersect join_any join_none let local logic longint matches modport nettype new nexttime
  null package packed priority program property protected pure rand randc randcase randsequence ref reject_on restrict return
  s_always s_eventually s_nexttime s_until s_until_with sequence shortint shortreal soft solve static string strong struct
  super sync_accept_on sync_reject_on tagged this throughout timeprecision timeunit type typedef union unique unique0 until
  until_with untyped var virtual void wait_order weak wildcard with within`);

/** The languages of which `name` is a reserved word, in any letter case: [] or some of 'VHDL', 'Verilog',
 *  'SystemVerilog' (a word of Verilog is one of SystemVerilog too: only 'Verilog' is said). sv: false leaves
 *  SystemVerilog's own words out (an existing name: XST and Yosys read Verilog-2005, where cross or bit are
 *  good names; only a new name is refused for them). */
export function reservedIn(name, { sv = true } = {}) {
  const w = String(name ?? '').toLowerCase();
  const out = [];
  if (VHDL_WORDS.has(w)) out.push('VHDL');
  if (VERILOG_WORDS.has(w)) out.push('Verilog');
  else if (sv && SV_WORDS.has(w)) out.push('SystemVerilog');
  return out;
}

/** Is `name` a reserved word of VHDL or of (System)Verilog, in any letter case? */
export const isReservedWord = name => reservedIn(name).length > 0;

/** Does the HDL of `lang` (as generated: the name written as is) not compile with `name`? VHDL: a
 *  VHDL-93 word in any case; Verilog: a Verilog-2005 word as written (Verilog's words are lower case). */
export function breaksHdl(name, lang) {
  const n = String(name ?? '');
  return lang === 'verilog' ? VERILOG_WORDS.has(n) : VHDL93_WORDS.has(n.toLowerCase());
}

/** `'and' is a reserved word of VHDL and Verilog` (no full stop: callers add their own), or null. opts: reservedIn's. */
export function reservedError(name, opts) {
  const r = reservedIn(name, opts);
  return r.length ? `'${name}' is a reserved word of ${r.join(' and ')}` : null;
}

/**
 * Warnings for the modules of a project named with a reserved word (a project made before #679, or an
 * imported one): [{ severity: 'warning', file, line, col, tool, message }], one per module.
 * @param {Array<{name, file, line?}>} modules
 */
export function reservedModuleDiags(modules) {
  const out = [];
  const seen = new Set();
  for (const m of modules || []) {
    const r = reservedIn(m.name, { sv: false });
    const k = String(m.name).toLowerCase();
    if (!r.length || seen.has(k)) continue;
    seen.add(k);
    out.push({ severity: 'warning', file: m.file, line: m.line || 1, col: 1, tool: 'Silinx',
      message: `The module name '${m.name}' is a reserved word of ${r.join(' and ')}: rename it (Rename in the Design pane), or its HDL may not compile.` });
  }
  return out;
}
