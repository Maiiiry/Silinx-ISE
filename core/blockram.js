// Silinx - the Block Memory wizard's modules (#794, part of #787): a RAM or a ROM of the target device's block RAMs,
// width x depth, one port or two, its initial contents from a .mem / .coe file of the project. The wizard
// (web/js/bram-wizard.js) keeps its settings in a line of the module's header (`-- silinx-wizard: {...}`, as the
// Clocking Wizard's, core/clocking.js): the module is generated from them and the file's contents.
//
// The primitives: Spartan-3E's RAMB16_Sw (one port) and RAMB16_Sw_Sw (two), 16 Kbit of data and 2 Kbit of parity,
// each port 16K x 1, 8K x 2, 4K x 4, 2K x 9, 1K x 18 or 512 x 36 (DS312 "Block RAM", UG331 "Using Block RAM": the
// parity bits used as data bits); Spartan-6's RAMB16BWER (the same shapes) and RAMB8BWER (half of one: 8K x 1 to
// 512 x 18, in TDP mode), UG383. A memory wider than a port is several blocks side by side (columns), deeper than a
// block several rows of them, the address's high bits choosing the row (its write enable, and the output
// multiplexer by the address read, registered: the read takes one clock as a block's does). The shape with the
// fewest blocks is chosen (on Spartan-6 counted in 9 Kbit halves), then the fewest rows. Or the inferable HDL:
// an array read on the clock edge, which XST and the Silinx toolchain map to the same block RAMs.
//
// Isomorphic ES module (browser + Node), no DOM.
//
// API:
//   bramShapes(family)            the port shapes of the family's primitives: [{ prim, width, depth, data, parity, halves }]
//   planMemory(spec)              the primitive, the blocks (columns x rows), their count, or the errors
//   memoryModule(spec, words)     { code, plan } (words: the initial contents, BigInts, from readInitFile)
//   readInitFile(text, path, width, depth)   a .mem / .coe file's words: { words, errors }

import { wizardLine } from './clocking.js';

// a port of `width` bits: its data and parity bits (DS312 / UG383), its address bits below the word on Spartan-6
const WIDTHS = { 1: [1, 0, 0], 2: [2, 0, 1], 4: [4, 0, 2], 9: [8, 1, 3], 18: [16, 2, 4], 36: [32, 4, 5] };
const PRIMS = {
  spartan3e: [{ prim: 'RAMB16', bits: 16384, widths: [1, 2, 4, 9, 18, 36], halves: 1 }],
  spartan6: [{ prim: 'RAMB8BWER', bits: 8192, widths: [1, 2, 4, 9, 18], halves: 1 }, { prim: 'RAMB16BWER', bits: 16384, widths: [1, 2, 4, 9, 18, 36], halves: 2 }],
};
export const MEMORY_FAMILIES = Object.keys(PRIMS);
// (NO_CHANGE is left out: over several rows of blocks the word kept would be the row's, not the memory's)
export const WRITE_MODES = ['READ_FIRST', 'WRITE_FIRST'];
export const MAX_WIDTH = 256, MAX_DEPTH = 1 << 20;

/** The port shapes of a family's block RAMs: [{ prim, width, depth, data, parity, halves }] (halves: the 9 Kbit
 *  halves one block takes on Spartan-6; 1 on Spartan-3E, whose blocks are counted whole). */
export function bramShapes(family) {
  return (PRIMS[family] || []).flatMap(p => p.widths.map(w => {
    const [data, parity] = WIDTHS[w];
    return { prim: p.prim, width: w, depth: p.bits / data, data, parity, halves: p.halves };
  }));
}

const log2 = n => { let k = 0; while ((1 << k) < n) k++; return k; };
export const addrBits = depth => Math.max(1, log2(depth));

/**
 * The memory's blocks. spec: { family, kind: 'ram' | 'rom', ports: 'single' | 'dual', width, depth, writeMode,
 *   style: 'primitive' | 'inferred' } -> { family, prim, shape, cols, rows, blocks, halves, aw, primName, errors }.
 * halves: the 9 Kbit halves (Spartan-6) or the blocks (Spartan-3E) it takes, the device's count to compare with.
 */
export function planMemory(spec) {
  const errors = [];
  const W = Math.trunc(+spec.width), D = Math.trunc(+spec.depth);
  const plan = { family: spec.family, prim: null, shape: null, cols: 0, rows: 0, blocks: 0, halves: 0, aw: 0, primName: null, errors };
  if (!PRIMS[spec.family]) { errors.push('The Block Memory wizard makes block RAMs of the Spartan-3E and the Spartan-6.'); return plan; }
  if (!(W >= 1 && W <= MAX_WIDTH && W === +spec.width)) errors.push(`The width is a whole number of bits from 1 to ${MAX_WIDTH}.`);
  if (!(D >= 2 && D <= MAX_DEPTH && D === +spec.depth)) errors.push(`The depth is a whole number of words from 2 to ${MAX_DEPTH}.`);
  if (!WRITE_MODES.includes(spec.writeMode || 'READ_FIRST')) errors.push(`The write mode is ${WRITE_MODES.join(', ')}.`);
  if (errors.length) return plan;
  plan.aw = addrBits(D);
  let best = null;
  for (const s of bramShapes(spec.family)) {
    const cols = Math.ceil(W / s.width), rows = Math.ceil(D / s.depth);
    const key = [cols * rows * s.halves, cols * rows, rows, s.width];
    const i = best ? key.findIndex((x, j) => x !== best.key[j]) : -1;
    if (!best || (i >= 0 && key[i] < best.key[i])) best = { key, s, cols, rows };
  }
  Object.assign(plan, { shape: best.s, prim: best.s.prim, cols: best.cols, rows: best.rows, blocks: best.cols * best.rows, halves: best.cols * best.rows * best.s.halves });
  plan.primName = spec.family === 'spartan3e' ? `RAMB16_S${best.s.width}${spec.ports === 'dual' ? `_S${best.s.width}` : ''}` : best.s.prim;
  return plan;
}

// ------------------------------------------------------------------ initial contents
/**
 * The words of a .mem file ($readmemh's format: hexadecimal words separated by blanks, // and /* *\/ comments,
 * @address to jump) or a .coe file (memory_initialization_radix = 2 | 10 | 16; memory_initialization_vector = the
 * words separated by commas or blanks, ending with ;), for a memory of width x depth: { words: [BigInt] (depth of
 * them, 0 where the file says nothing), errors: [message] }.
 */
export function readInitFile(text, path, width, depth) {
  const errors = [];
  const words = Array(depth).fill(0n);
  const max = (1n << BigInt(width)) - 1n;
  const put = (a, v, what) => {
    if (a >= depth) { errors.push(`${path}: ${what} is beyond the memory's ${depth} words.`); return false; }
    if (v > max) { errors.push(`${path}: ${what} (${v.toString(16)}) is wider than ${width} bits.`); return false; }
    words[a] = v;
    return true;
  };
  const src = String(text ?? '');
  if (/\.coe$/i.test(path)) {
    // (a comment: a line that starts with ;)
    const t = src.replace(/^\s*;.*$/gm, '');
    const radix = /memory_initialization_radix\s*=\s*(\d+)\s*;/i.exec(t);
    const vec = /memory_initialization_vector\s*=\s*([^;]*);?/i.exec(t);
    const r = radix ? +radix[1] : 0;
    if (![2, 10, 16].includes(r)) { errors.push(`${path}: memory_initialization_radix must be 2, 10 or 16.`); return { words, errors }; }
    if (!vec) { errors.push(`${path}: no memory_initialization_vector.`); return { words, errors }; }
    const toks = vec[1].split(/[\s,]+/).filter(Boolean);
    const digits = { 2: /^[01]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i }[r];
    toks.forEach((tk, a) => {
      if (!digits.test(tk)) { errors.push(`${path}: '${tk}' is not a number of radix ${r}.`); return; }
      put(a, r === 10 ? BigInt(tk) : BigInt(`0${r === 16 ? 'x' : 'b'}${tk}`), `word ${a}`);
    });
    return { words, errors };
  }
  let a = 0;
  const t = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  for (const tk of t.split(/\s+/).filter(Boolean)) {
    if (tk.startsWith('@')) {
      if (!/^@[0-9a-f]+$/i.test(tk)) { errors.push(`${path}: '${tk}' is not an address.`); continue; }
      a = parseInt(tk.slice(1), 16);
      continue;
    }
    const h = tk.replace(/_/g, '');
    if (!/^[0-9a-f]+$/i.test(h)) { errors.push(`${path}: '${tk}' is not a hexadecimal word.`); a++; continue; }
    put(a, BigInt(`0x${h}`), `word ${a}`);
    a++;
  }
  return { words, errors };
}

// the INIT_xx / INITP_xx strings of one block (column c, row r): word k of the block is the memory's word
// r * depth + k, its bits c * width .. (the data bits first, then the parity bits)
function blockInits(plan, words, c, r) {
  const s = plan.shape;
  const bits = (plan.prim === 'RAMB8BWER' ? 8192 : 16384), pbits = bits / 8;
  const data = new Uint8Array(bits), par = new Uint8Array(pbits);
  for (let k = 0; k < s.depth; k++) {
    const w = words[r * s.depth + k];
    if (!w) continue;
    const v = w >> BigInt(c * s.width);
    for (let i = 0; i < s.data; i++) data[k * s.data + i] = Number((v >> BigInt(i)) & 1n);
    for (let j = 0; j < s.parity; j++) par[k * s.parity + j] = Number((v >> BigInt(s.data + j)) & 1n);
  }
  const hex = (arr, n) => Array.from({ length: arr.length / 256 }, (_, i) => {
    let x = '';
    for (let q = 63; q >= 0; q--) { let d = 0; for (let b = 3; b >= 0; b--) d = d * 2 + arr[i * 256 + q * 4 + b]; x += d.toString(16).toUpperCase(); }
    return [`${n}_${i.toString(16).toUpperCase().padStart(2, '0')}`, x];
  });
  return { init: hex(data, 'INIT'), initp: s.parity ? hex(par, 'INITP') : [] };
}

// ------------------------------------------------------------------ the module
/** The module of a memory spec ({ name, lang, …planMemory's }), with its initial contents `words` (BigInts,
 *  readInitFile's; none: zeros): { code, plan }; code '' when the plan has errors. */
export function memoryModule(spec, words = []) {
  const plan = planMemory(spec);
  if (plan.errors.length) return { code: '', plan };
  const all = Array.from({ length: +spec.depth }, (_, a) => BigInt(words[a] ?? 0n));
  const code = spec.style === 'inferred' ? inferred(spec, plan, all) : primitives(spec, plan, all);
  return { code, plan };
}

const portList = spec => {
  const W = +spec.width, aw = addrBits(+spec.depth), rom = spec.kind === 'rom';
  return ['a', ...(spec.ports === 'dual' ? ['b'] : [])].flatMap(x => [
    { name: `clk${x}`, dir: 'in', width: 0 }, ...(rom ? [] : [{ name: `we${x}`, dir: 'in', width: 0 }]),
    { name: `addr${x}`, dir: 'in', width: aw }, ...(rom ? [] : [{ name: `din${x}`, dir: 'in', width: W }]), { name: `dout${x}`, dir: 'out', width: W }]);
};
const describe = (spec, plan, c, init) => [
  `${c} Block Memory (Silinx): a ${spec.kind === 'rom' ? 'ROM' : 'RAM'} of ${spec.depth} words of ${spec.width} bits, ${spec.ports === 'dual' ? 'two ports (A and B, each its own clock)' : 'one port'}${spec.kind === 'rom' ? '' : `, ${spec.writeMode || 'READ_FIRST'}`};`,
  spec.style === 'inferred'
    ? `${c} written as an array read on the clock edge, which synthesis maps to ${plan.blocks} block RAM(s) (${plan.primName}, ${plan.shape.depth} x ${plan.shape.width}).`
    : `${c} ${plan.blocks} block RAM(s) ${plan.primName} of ${plan.shape.depth} x ${plan.shape.width}: ${plan.cols} side by side${plan.rows > 1 ? ` x ${plan.rows} deep (the high address bits choose the row)` : ''}.`,
  `${c} Do not edit: the module is generated from the line above${init ? ` and ${init}` : ''}; open it from the Design pane to change it.`,
  `${c} A read takes one clock: dout has the word of the address of the previous rising edge.`,
];

// the primitives' module
function primitives(spec, plan, words) {
  const v = spec.lang === 'verilog';
  const W = +spec.width, aw = plan.aw, s = plan.shape, rom = spec.kind === 'rom', dual = spec.ports === 'dual';
  const xs = ['a', ...(dual ? ['b'] : [])];
  const baw = log2(s.depth);                        // a block's own address bits
  const hi = aw - Math.min(aw, baw);                // the address bits choosing the row
  const k = pinWidths(plan);
  const insts = [], decls = [], body = [];
  const slice = (sig, h, l) => (v ? `${sig}[${h}:${l}]` : `${sig}(${h} downto ${l})`);
  const cat = parts => (parts.length === 1 ? parts[0] : v ? `{${parts.join(', ')}}` : parts.join(' & '));
  const lit = n => (v ? `${n}'b0` : n === 1 ? "'0'" : `"${'0'.repeat(n)}"`);
  // a block's data of column c: the memory's bits c * width .. (the last column padded with 0)
  const colBits = c => [c * s.width, Math.min(W, (c + 1) * s.width) - 1];
  const q = (x, r, c) => `q${x}_${r}_${c}`;
  for (const x of xs) {
    for (let r = 0; r < plan.rows; r++) {
      for (let c = 0; c < plan.cols; c++) {
        // the block's data and parity outputs (all its pins), and its word: the bits of the memory it holds (the data
        // bits, then the parity bits; the last column's only its own, none assigned and unused)
        const [lo, top] = colBits(c), n = top - lo + 1;
        // (parity outputs that carry none of its bits: left open, no signal)
        decls.push({ name: `dd${x}_${r}_${c}`, width: k.dw }, ...(k.pw && n > s.data ? [{ name: `dp${x}_${r}_${c}`, width: k.pw }] : []), { name: q(x, r, c), width: n });
        const word = cat([...(n > s.data ? [slice(`dp${x}_${r}_${c}`, n - s.data - 1, 0)] : []), slice(`dd${x}_${r}_${c}`, Math.min(n, s.data) - 1, 0)]);
        body.push(v ? `  assign ${q(x, r, c)} = ${word};` : `  ${q(x, r, c)} <= ${word};`);
      }
    }
    if (plan.rows > 1) decls.push({ name: `row${x}`, width: hi, reg: true });
    if (plan.rows > 1 && !rom) for (let r = 0; r < plan.rows; r++) decls.push({ name: `we${x}_${r}`, width: 0 });
  }
  for (let r = 0; r < plan.rows; r++) {
    for (let c = 0; c < plan.cols; c++) {
      const { init, initp } = blockInits(plan, words, c, r);
      const [lo, top] = colBits(c);
      const n = top - lo + 1;
      const gens = [], pins = [];
      for (const x of xs) {
        const sfx = dual ? `_${x.toUpperCase()}` : '';
        // the block's address: the memory's low bits, zeros above when the memory is shallower than the block
        const addr = baw <= aw ? slice(`addr${x}`, baw - 1, 0) : cat([lit(baw - aw), slice(`addr${x}`, aw - 1, 0)]);
        // its word in: bits from..from+count-1 of the block's word, the column's bits of din, zeros above the memory's
        const din = rom ? null : (from, count, total) => {
          const have = Math.max(0, Math.min(count, n - from));
          return cat([...(total > have ? [lit(total - have)] : []), ...(have ? [slice(`din${x}`, lo + from + have - 1, lo + from)] : [])]);
        };
        const we = rom ? lit(1) : plan.rows > 1 ? `we${x}_${r}` : `we${x}`;
        for (const [pin, actual, width] of primPins(spec, plan, x, { addr, din, we, clk: `clk${x}`, dd: `dd${x}_${r}_${c}`, dp: n > s.data ? `dp${x}_${r}_${c}` : null }, v)) {
          // (VHDL-93: an expression of signals is not an actual: a signal of its own)
          if (!v && / & /.test(actual) && /[a-z]/.test(actual.replace(/"[01]+"|'[01]'/g, ''))) {
            const name = `${pin.toLowerCase()}_${r}_${c}`;
            decls.push({ name, width });
            body.push(`  ${name} <= ${actual};`);
            pins.push([pin, name]);
          } else pins.push([pin, actual]);
        }
        if (spec.family === 'spartan3e') gens.push([`WRITE_MODE${sfx}`, `"${spec.writeMode || 'READ_FIRST'}"`]);
      }
      if (spec.family === 'spartan6') gens.push(...s6Generics(spec, plan));
      gens.push(...[...init, ...initp].map(([key, h]) => [key, v ? `256'h${h}` : `X"${h}"`]));
      insts.push({ name: `u_ram_${r}_${c}`, gens, pins });
    }
  }
  // the row of each port: its write enable, its output by the row read (registered)
  for (const x of xs) {
    const sel = plan.rows > 1 ? slice(`addr${x}`, aw - 1, aw - hi) : null;
    if (plan.rows > 1 && !rom) for (let r = 0; r < plan.rows; r++) body.push(v ? `  assign we${x}_${r} = we${x} & (${sel} == ${hi}'d${r});` : `  we${x}_${r} <= we${x} when unsigned(${sel}) = ${r} else '0';`);
    if (plan.rows > 1) body.push(v ? `  always @(posedge clk${x}) row${x} <= ${sel};` : `  process (clk${x}) begin if rising_edge(clk${x}) then row${x} <= ${sel}; end if; end process;`);
    const rowOut = r => cat(Array.from({ length: plan.cols }, (_, i) => plan.cols - 1 - i).map(c => q(x, r, c)));
    if (plan.rows === 1) body.push(v ? `  assign dout${x} = ${rowOut(0)};` : `  dout${x} <= ${rowOut(0)};`);
    else if (v) body.push(`  assign dout${x} = ${Array.from({ length: plan.rows }, (_, r) => `row${x} == ${hi}'d${r} ? ${rowOut(r)} : `).join('')}${W}'b0;`);
    else body.push(`  with to_integer(unsigned(row${x})) select dout${x} <=`, ...Array.from({ length: plan.rows }, (_, r) => `    ${rowOut(r)} when ${r},`), '    (others => \'0\') when others;');
  }
  return v ? verilogOf(spec, plan, decls, insts, body) : vhdlOf(spec, plan, decls, insts, body);
}

// the data, parity and write-enable pins of a port of the plan's primitive
const pinWidths = plan => (plan.family === 'spartan3e' ? { dw: plan.shape.data, pw: plan.shape.parity, ww: 1 }
  : plan.prim === 'RAMB16BWER' ? { dw: 32, pw: 4, ww: 4 } : { dw: 16, pw: 2, ww: 2 });

// a primitive's pins for port x (a, b): [pin, signal]
function primPins(spec, plan, x, { addr, din, we, clk, dd, dp }, v) {
  const s = plan.shape, X = x.toUpperCase(), dual = spec.ports === 'dual', k = pinWidths(plan);
  const lit = n => (v ? `${n}'b0` : n === 1 ? "'0'" : `"${'0'.repeat(n)}"`);
  const one = v ? "1'b1" : "'1'";
  const cat = parts => (parts.length === 1 ? parts[0] : v ? `{${parts.join(', ')}}` : parts.join(' & '));
  const P = spec.family === 'spartan3e' ? (p => ({ addr: `ADDR${p}`, clk: `CLK${p}`, di: `DI${p}`, dip: `DIP${p}`, dout: `DO${p}`, dop: `DOP${p}`, en: `EN${p}`, rst: `SSR${p}`, we: `WE${p}` }))(dual ? X : '')
    : plan.prim === 'RAMB16BWER' ? { addr: `ADDR${X}`, clk: `CLK${X}`, di: `DI${X}`, dip: `DIP${X}`, dout: `DO${X}`, dop: `DOP${X}`, en: `EN${X}`, regce: `REGCE${X}`, rst: `RST${X}`, we: `WE${X}` }
      : x === 'a' ? { addr: 'ADDRAWRADDR', clk: 'CLKAWRCLK', di: 'DIADI', dip: 'DIPADIP', dout: 'DOADO', dop: 'DOPADOP', en: 'ENAWREN', regce: 'REGCEA', rst: 'RSTA', we: 'WEAWEL' }
        : { addr: 'ADDRBRDADDR', clk: 'CLKBRDCLK', di: 'DIBDI', dip: 'DIPBDIP', dout: 'DOBDO', dop: 'DOPBDOP', en: 'ENBRDEN', regce: 'REGCEBREGCE', rst: 'RSTBRST', we: 'WEBWEU' };
  // (Spartan-6: the address's bits below the word 0, UG383)
  const low = spec.family === 'spartan6' ? WIDTHS[s.width][2] : 0;
  const aw = spec.family === 'spartan3e' ? log2(s.depth) : plan.prim === 'RAMB16BWER' ? 14 : 13;
  // [pin, actual, width (0: a bit)]
  return [[P.dout, dd, k.dw], ...(k.pw ? [[P.dop, dp ?? (v ? '' : 'open'), k.pw]] : []), [P.addr, low ? cat([addr, lit(low)]) : addr, aw], [P.clk, clk, 0],
    [P.di, din ? din(0, s.data, k.dw) : lit(k.dw), k.dw], ...(k.pw ? [[P.dip, din && s.parity ? din(s.data, s.parity, k.pw) : lit(k.pw), k.pw]] : []),
    [P.en, one, 0], ...(P.regce ? [[P.regce, lit(1), 0]] : []), [P.rst, lit(1), 0], [P.we, k.ww > 1 ? cat(Array(k.ww).fill(we)) : we, k.ww > 1 ? k.ww : 0]];
}

function s6Generics(spec, plan) {
  const s = plan.shape, dual = spec.ports === 'dual', m = `"${spec.writeMode || 'READ_FIRST'}"`;
  return [['DATA_WIDTH_A', String(s.width)], ['DATA_WIDTH_B', dual ? String(s.width) : '0'], ['DOA_REG', '0'], ['DOB_REG', '0'],
    ...(plan.prim === 'RAMB8BWER' ? [['RAM_MODE', '"TDP"']] : []), ['SIM_DEVICE', '"SPARTAN6"'], ['WRITE_MODE_A', m], ['WRITE_MODE_B', m]];
}

function vhdlOf(spec, plan, decls, insts, body) {
  const ports = portList(spec).map(p => `${p.name} : ${p.dir === 'in' ? 'in ' : 'out'} ${p.width ? `std_logic_vector(${p.width - 1} downto 0)` : 'std_logic'}`);
  const w = Math.max(...ports.map(p => p.indexOf(':')));
  const pt = ports.map(p => { const [n, t] = p.split(' : '); return `${n.padEnd(w)} : ${t}`; });
  const sig = d => `  signal ${d.name} : ${d.width ? `std_logic_vector(${d.width - 1} downto 0)` : 'std_logic'}${d.reg ? " := (others => '0')" : ''};`;
  return [
    wizardLine(spec, 'vhdl'), ...describe(spec, plan, '--', spec.init),
    'library IEEE;', 'use IEEE.STD_LOGIC_1164.ALL;', ...(plan.rows > 1 ? ['use IEEE.NUMERIC_STD.ALL;'] : []), 'library UNISIM;', 'use UNISIM.VCOMPONENTS.ALL;', '',
    `entity ${spec.name} is`, `  port (${pt.join(';\n        ')});`, `end ${spec.name};`, '',
    `architecture xilinx of ${spec.name} is`, ...decls.map(sig), 'begin',
    ...insts.flatMap(i => {
      const gw = Math.max(...i.gens.map(([k]) => k.length)), pw = Math.max(...i.pins.map(([k]) => k.length));
      return [`  ${i.name} : ${plan.primName}`, '    generic map (', i.gens.map(([k, h]) => `      ${k.padEnd(gw)} => ${h}`).join(',\n'), '    )',
        '    port map (', i.pins.map(([k, h]) => `      ${k.padEnd(pw)} => ${h}`).join(',\n'), '    );', ''];
    }),
    ...body, 'end xilinx;', '',
  ].join('\n');
}

function verilogOf(spec, plan, decls, insts, body) {
  const ports = portList(spec).map(p => `${p.dir === 'in' ? 'input ' : 'output'} wire ${p.width ? `[${p.width - 1}:0] ` : ''}${p.name}`);
  const sig = d => `  ${d.reg ? 'reg ' : 'wire'} ${d.width ? `[${d.width - 1}:0] ` : ''}${d.name}${d.reg ? ' = 0' : ''};`;
  return [
    wizardLine(spec, 'verilog'), ...describe(spec, plan, '//', spec.init), '`timescale 1ns / 1ps', '',
    `module ${spec.name} (`, `  ${ports.join(',\n  ')}`, ');', '', ...decls.map(sig), '',
    ...insts.flatMap(i => {
      const gw = Math.max(...i.gens.map(([k]) => k.length)), pw = Math.max(...i.pins.map(([k]) => k.length));
      return [`  ${plan.primName} #(`, i.gens.map(([k, h]) => `    .${k.padEnd(gw)} (${h})`).join(',\n'), `  ) ${i.name} (`,
        i.pins.map(([k, h]) => `    .${k.padEnd(pw)} (${h})`).join(',\n'), '  );', ''];
    }),
    ...body, '', 'endmodule', '',
  ].join('\n');
}

// the inferable HDL: an array, its initial contents, each port's process (XST's block RAM templates, UG627)
function inferred(spec, plan, words) {
  const v = spec.lang === 'verilog', W = +spec.width, D = +spec.depth, rom = spec.kind === 'rom', dual = spec.ports === 'dual';
  const mode = spec.writeMode || 'READ_FIRST';
  const xs = ['a', ...(dual ? ['b'] : [])];
  const hexw = Math.ceil(W / 4);
  if (v) {
    const ports = portList(spec).map(p => `${p.dir === 'in' ? 'input ' : 'output'} ${p.name.startsWith('dout') ? 'reg ' : 'wire'} ${p.width ? `[${p.width - 1}:0] ` : ''}${p.name}`);
    const port = x => (rom ? [`  always @(posedge clk${x}) dout${x} <= mem[addr${x}];`] : [
      `  always @(posedge clk${x}) begin`,
      mode === 'WRITE_FIRST' ? `    if (we${x}) begin mem[addr${x}] <= din${x}; dout${x} <= din${x}; end else dout${x} <= mem[addr${x}];`
            : `    if (we${x}) mem[addr${x}] <= din${x};\n    dout${x} <= mem[addr${x}];`,
      '  end']);
    return [wizardLine(spec, 'verilog'), ...describe(spec, plan, '//', spec.init), '`timescale 1ns / 1ps', '',
      `module ${spec.name} (`, `  ${ports.join(',\n  ')}`, ');', '',
      `  reg [${W - 1}:0] mem [0:${D - 1}];`, '  integer i;',
      '  initial begin',
      `    for (i = 0; i < ${D}; i = i + 1) mem[i] = ${W}'h0;`,
      ...words.map((w, a) => (w ? `    mem[${a}] = ${W}'h${w.toString(16).toUpperCase()};` : null)).filter(Boolean),
      '  end', ...xs.flatMap(x => ['', ...port(x)]), '', 'endmodule', ''].join('\n');
  }
  const ports = portList(spec).map(p => `${p.name} : ${p.dir === 'in' ? 'in ' : 'out'} ${p.width ? `std_logic_vector(${p.width - 1} downto 0)` : 'std_logic'}`);
  const w = Math.max(...ports.map(p => p.indexOf(':')));
  const pt = ports.map(p => { const [n, t] = p.split(' : '); return `${n.padEnd(w)} : ${t}`; });
  const lit = x => `X"${x.toString(16).toUpperCase().padStart(hexw, '0')}"`;
  const init = words.some(Boolean) ? `(${words.map((x, a) => (x ? `${a} => ${W % 4 ? `std_logic_vector(to_unsigned(${x.toString()}, ${W}))` : lit(x)}` : null)).filter(Boolean).join(', ')}, others => (others => '0'))` : "(others => (others => '0'))";
  const obj = dual && !rom ? 'shared variable mem' : rom ? 'constant mem' : 'signal mem';
  const rd = x => `mem(to_integer(unsigned(addr${x})))`;
  const asg = dual && !rom ? ':=' : '<=';
  const port = x => (rom ? [`  process (clk${x}) begin if rising_edge(clk${x}) then dout${x} <= ${rd(x)}; end if; end process;`] : [
    `  process (clk${x})`, '  begin', `    if rising_edge(clk${x}) then`,
    mode === 'WRITE_FIRST' ? `      if we${x} = '1' then ${rd(x)} ${asg} din${x}; dout${x} <= din${x}; else dout${x} <= ${rd(x)}; end if;`
        : dual ? `      dout${x} <= ${rd(x)};\n      if we${x} = '1' then ${rd(x)} := din${x}; end if;` : `      if we${x} = '1' then ${rd(x)} <= din${x}; end if;\n      dout${x} <= ${rd(x)};`,
    '    end if;', '  end process;']);
  return [wizardLine(spec, 'vhdl'), ...describe(spec, plan, '--', spec.init), 'library IEEE;', 'use IEEE.STD_LOGIC_1164.ALL;', 'use IEEE.NUMERIC_STD.ALL;', '',
    `entity ${spec.name} is`, `  port (${pt.join(';\n        ')});`, `end ${spec.name};`, '',
    `architecture rtl of ${spec.name} is`, `  type mem_t is array (0 to ${D - 1}) of std_logic_vector(${W - 1} downto 0);`, `  ${obj} : mem_t := ${init};`, 'begin',
    ...xs.flatMap(x => port(x)), 'end rtl;', ''].join('\n');
}
