// The Block Memory wizard's modules (#794, core/blockram.js): the primitives' shapes against the data sheets
// (DS312, UG383), the shape with the fewest blocks against brute force, the .mem / .coe files read, and the modules in
// VHDL and Verilog, of each family, as primitives and as inferable HDL, compiled, elaborated with no warnings and
// simulated: the initial contents read, words written then read back (on each port, through the other one), the
// word read during a write as the write mode says, against a model of the memory written here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { readWizardSpec } from '../core/clocking.js';
import { addrBits, bramShapes, memoryModule, planMemory, readInitFile } from '../core/blockram.js';

const memSpec = (o = {}) => ({ wizard: 'memory', version: 1, name: 'bram', lang: 'vhdl', family: 'spartan3e', kind: 'ram', ports: 'single', width: 8, depth: 1024,
  writeMode: 'READ_FIRST', style: 'primitive', init: '', ...o });

test('the block RAMs\' shapes: DS312 (RAMB16: 16K x 1 to 512 x 36, the parity bits used as data) and UG383 (RAMB8BWER: 8K x 1 to 512 x 18)', () => {
  const t = f => bramShapes(f).map(s => `${s.prim} ${s.depth}x${s.width} (${s.data}+${s.parity}) ${s.halves}`);
  assert.deepEqual(t('spartan3e'), ['RAMB16 16384x1 (1+0) 1', 'RAMB16 8192x2 (2+0) 1', 'RAMB16 4096x4 (4+0) 1', 'RAMB16 2048x9 (8+1) 1', 'RAMB16 1024x18 (16+2) 1', 'RAMB16 512x36 (32+4) 1']);
  assert.deepEqual(t('spartan6'), ['RAMB8BWER 8192x1 (1+0) 1', 'RAMB8BWER 4096x2 (2+0) 1', 'RAMB8BWER 2048x4 (4+0) 1', 'RAMB8BWER 1024x9 (8+1) 1', 'RAMB8BWER 512x18 (16+2) 1',
    'RAMB16BWER 16384x1 (1+0) 2', 'RAMB16BWER 8192x2 (2+0) 2', 'RAMB16BWER 4096x4 (4+0) 2', 'RAMB16BWER 2048x9 (8+1) 2', 'RAMB16BWER 1024x18 (16+2) 2', 'RAMB16BWER 512x36 (32+4) 2']);
  assert.deepEqual(bramShapes('spartan3'), []);
  assert.deepEqual([addrBits(2), addrBits(1024), addrBits(1025), addrBits(3000)], [1, 10, 11, 12]);
});

test('a memory\'s blocks: the fewest (Spartan-6: in 9 Kbit halves), then the fewest rows, against brute force', () => {
  const p = o => { const x = planMemory(memSpec(o)); return `${x.primName} ${x.cols}x${x.rows}=${x.blocks} (${x.halves})`; };
  assert.equal(p({}), 'RAMB16_S9 1x1=1 (1)');
  assert.equal(p({ width: 16, depth: 1024, ports: 'dual' }), 'RAMB16_S18_S18 1x1=1 (1)');
  assert.equal(p({ width: 32, depth: 512 }), 'RAMB16_S36 1x1=1 (1)');
  assert.equal(p({ width: 1, depth: 16384 }), 'RAMB16_S1 1x1=1 (1)');
  assert.equal(p({ width: 1, depth: 32768 }), 'RAMB16_S1 1x2=2 (2)');
  assert.equal(p({ width: 20, depth: 3000 }), 'RAMB16_S4 5x1=5 (5)');
  assert.equal(p({ width: 64, depth: 4096 }), 'RAMB16_S4 16x1=16 (16)');
  assert.equal(p({ family: 'spartan6', width: 8, depth: 1024 }), 'RAMB8BWER 1x1=1 (1)');
  assert.equal(p({ family: 'spartan6', width: 8, depth: 2048 }), 'RAMB16BWER 1x1=1 (2)');
  assert.equal(p({ family: 'spartan6', width: 36, depth: 512 }), 'RAMB16BWER 1x1=1 (2)');
  assert.equal(p({ family: 'spartan6', width: 12, depth: 5000 }), 'RAMB8BWER 3x3=9 (9)');
  for (const family of ['spartan3e', 'spartan6']) {
    for (const [W, D] of [[1, 2], [3, 100], [7, 9000], [13, 777], [24, 2048], [40, 1500], [72, 512], [100, 300], [5, 20000], [9, 4097]]) {
      const x = planMemory(memSpec({ family, width: W, depth: D }));
      const least = Math.min(...bramShapes(family).map(s => Math.ceil(W / s.width) * Math.ceil(D / s.depth) * s.halves));
      assert.equal(x.halves, least, `${family} ${W} x ${D}`);
      assert.ok(x.cols * x.shape.width >= W && x.rows * x.shape.depth >= D, `${family} ${W} x ${D}: it holds the memory`);
    }
  }
  const errs = o => planMemory(memSpec(o)).errors;
  assert.deepEqual(errs({ width: 0 }), ['The width is a whole number of bits from 1 to 256.']);
  assert.deepEqual(errs({ width: 2.5 }), ['The width is a whole number of bits from 1 to 256.']);
  assert.deepEqual(errs({ depth: 1 }), ['The depth is a whole number of words from 2 to 1048576.']);
  assert.deepEqual(errs({ writeMode: 'NO_CHANGE' }), ['The write mode is READ_FIRST, WRITE_FIRST.']);
  assert.deepEqual(errs({ family: 'spartan3' }), ['The Block Memory wizard makes block RAMs of the Spartan-3E and the Spartan-6.']);
});

test('the initial contents: a .mem file ($readmemh: hexadecimal words, @address, comments), a .coe file (radix 2, 10, 16), their errors', () => {
  const m = readInitFile('// a table\n00 1F\n@4 a_b /* x */ 0f\n', 'src/t.mem', 8, 8);
  assert.deepEqual(m, { words: [0n, 31n, 0n, 0n, 0xabn, 15n, 0n, 0n], errors: [] });
  assert.deepEqual(readInitFile('memory_initialization_radix=16;\nmemory_initialization_vector=\n1, 2,\nff;\n', 'src/t.coe', 8, 4), { words: [1n, 2n, 255n, 0n], errors: [] });
  assert.deepEqual(readInitFile('; a comment\nmemory_initialization_radix = 10;\nmemory_initialization_vector = 9 10 255;', 'src/t.coe', 8, 4).words, [9n, 10n, 255n, 0n]);
  assert.deepEqual(readInitFile('memory_initialization_radix=2;memory_initialization_vector=101,11;', 'a.coe', 3, 2).words, [5n, 3n]);
  assert.deepEqual(readInitFile('1FF 0 0', 'src/t.mem', 8, 2).errors, ['src/t.mem: word 0 (1ff) is wider than 8 bits.', 'src/t.mem: word 2 is beyond the memory\'s 2 words.']);
  assert.deepEqual(readInitFile('zz @q', 'src/t.mem', 8, 2).errors, ['src/t.mem: \'zz\' is not a hexadecimal word.', 'src/t.mem: \'@q\' is not an address.']);
  assert.deepEqual(readInitFile('memory_initialization_vector=1;', 'a.coe', 8, 2).errors, ['a.coe: memory_initialization_radix must be 2, 10 or 16.']);
  assert.deepEqual(readInitFile('memory_initialization_radix=16;', 'a.coe', 8, 2).errors, ['a.coe: no memory_initialization_vector.']);
  assert.deepEqual(readInitFile('memory_initialization_radix=10;memory_initialization_vector=1a;', 'a.coe', 8, 2).errors, ['a.coe: \'1a\' is not a number of radix 10.']);
});

test('the spec in the module\'s header, read back; the module\'s ports', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const spec = memSpec({ lang, ports: 'dual', init: 'src/t.mem' });
    const { code } = memoryModule(spec, []);
    assert.deepEqual(readWizardSpec(code), spec);
    const ports = lang === 'vhdl' ? /clka +: in  std_logic;\n +wea +: in  std_logic;\n +addra +: in  std_logic_vector\(9 downto 0\);\n +dina +: in  std_logic_vector\(7 downto 0\);\n +douta +: out std_logic_vector\(7 downto 0\);\n +clkb/
      : /input  wire clka,\n {2}input  wire wea,\n {2}input  wire \[9:0\] addra,\n {2}input  wire \[7:0\] dina,\n {2}output wire \[7:0\] douta,\n {2}input  wire clkb/;
    assert.match(code, ports);
  }
  assert.match(memoryModule(memSpec({ kind: 'rom', lang: 'verilog' })).code, /module bram \(\n {2}input  wire clka,\n {2}input  wire \[9:0\] addra,\n {2}output wire \[7:0\] douta\n\);/);
});

// ------------------------------------------------------------------ simulation
// the addresses a bench reads and writes: both ends, each row's first and last, some between
const samples = (D, rowDepth) => [...new Set([0, 1, D - 1, Math.floor(D / 2), Math.floor(D / 3) + 1,
  ...Array.from({ length: Math.ceil(D / rowDepth) }, (_, r) => [r * rowDepth, Math.min(D, (r + 1) * rowDepth) - 1]).flat()])].filter(a => a >= 0 && a < D).sort((x, y) => x - y);
// the writes: each sample address gets a value from it (not its initial one)
const valueOf = (a, W) => (BigInt(a) * 2654435761n + 12345n) & ((1n << BigInt(W)) - 1n);
// a test bench: on port A (and B), at each rising edge, an address; the outputs read 1 ns after the edge, reported
//   "I a v": the initial word of a (port A); "W a v": the word read while a is written (port A);
//   "R a v": the word of a after the writes (port A), "B a v": the same through port B
function bench(spec, plan, addrs, lang) {
  const W = +spec.width, aw = plan.aw, rom = spec.kind === 'rom', dual = spec.ports === 'dual';
  const steps = [];   // [kind, address, write value | null, port]
  for (const a of addrs) steps.push(['I', a, null, 'a']);
  if (!rom) for (const a of addrs) steps.push(['W', a, valueOf(a, W), 'a']);
  for (const a of addrs) steps.push(['R', a, null, 'a']);
  if (dual) for (const a of addrs) steps.push(['B', a, null, 'b']);
  const bin = (x, n) => x.toString(2).padStart(n, '0');
  if (lang === 'vhdl') {
    return `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity tb is end tb;
architecture sim of tb is
  signal clka, clkb : std_logic := '0';
  signal wea, web : std_logic := '0';
  signal addra, addrb : std_logic_vector(${aw - 1} downto 0) := (others => '0');
  signal dina, dinb, douta, doutb : std_logic_vector(${W - 1} downto 0) := (others => '0');
  function bits(v : std_logic_vector) return string is
    variable s : string(1 to v'length);
  begin
    for i in v'range loop if v(i) = '1' then s(v'high - i + 1) := '1'; elsif v(i) = '0' then s(v'high - i + 1) := '0'; else s(v'high - i + 1) := 'x'; end if; end loop;
    return s;
  end function;
begin
  uut : entity work.${spec.name} port map (clka => clka, ${rom ? '' : 'wea => wea, '}addra => addra, ${rom ? '' : 'dina => dina, '}douta => douta${dual ? `, clkb => clkb, ${rom ? '' : 'web => web, '}addrb => addrb, ${rom ? '' : 'dinb => dinb, '}doutb => doutb` : ''});
  process begin
${steps.map(([k, a, w, x]) => `    addr${x} <= "${bin(BigInt(a), aw)}"; we${x} <= '${w === null ? 0 : 1}';${w === null ? '' : ` din${x} <= "${bin(w, W)}";`}
    wait for 4 ns; clk${x} <= '1'; wait for 1 ns; report "${k} ${a} " & bits(dout${x}); wait for 4 ns; clk${x} <= '0'; wait for 1 ns;`).join('\n')}
    wait;
  end process;
end sim;`;
  }
  return `\`timescale 1ns / 1ps
module tb;
  reg clka = 0, clkb = 0, wea = 0, web = 0;
  reg [${aw - 1}:0] addra = 0, addrb = 0;
  reg [${W - 1}:0] dina = 0, dinb = 0;
  wire [${W - 1}:0] douta, doutb;
  ${spec.name} uut (.clka(clka), ${rom ? '' : '.wea(wea), '}.addra(addra), ${rom ? '' : '.dina(dina), '}.douta(douta)${dual ? `, .clkb(clkb), ${rom ? '' : '.web(web), '}.addrb(addrb), ${rom ? '' : '.dinb(dinb), '}.doutb(doutb)` : ''});
  initial begin
${steps.map(([k, a, w, x]) => `    addr${x} = ${aw}'b${bin(BigInt(a), aw)}; we${x} = ${w === null ? 0 : 1};${w === null ? '' : ` din${x} = ${W}'b${bin(w, W)};`}
    #4 clk${x} = 1; #1 $display("${k} ${a} %b", dout${x}); #4 clk${x} = 0; #1;`).join('\n')}
  end
endmodule`;
}
// the reports a bench should print, from a model of the memory: the initial words, a write's read by the mode
function expected(spec, words, addrs) {
  const W = +spec.width, rom = spec.kind === 'rom', dual = spec.ports === 'dual', mode = spec.writeMode;
  const mem = Array.from({ length: +spec.depth }, (_, a) => words[a] ?? 0n);
  const out = [];
  let last = 0n;
  const bin = x => x.toString(2).padStart(W, '0');
  for (const a of addrs) { last = mem[a]; out.push(`I ${a} ${bin(last)}`); }
  if (!rom) {
    for (const a of addrs) {
      const v = valueOf(a, W);
      last = mode === 'WRITE_FIRST' ? v : mem[a];
      mem[a] = v;
      out.push(`W ${a} ${bin(last)}`);
    }
  }
  for (const a of addrs) out.push(`R ${a} ${bin(mem[a])}`);
  if (dual) for (const a of addrs) out.push(`B ${a} ${bin(mem[a])}`);
  return out;
}
function simulateMemory(spec, words) {
  const { code, plan } = memoryModule(spec, words);
  assert.deepEqual(plan.errors, []);
  const v = spec.lang === 'verilog';
  const addrs = samples(+spec.depth, plan.shape.depth);
  const sources = [{ path: `src/${spec.name}.${v ? 'v' : 'vhd'}`, text: code }, { path: `sim/tb.${v ? 'v' : 'vhd'}`, text: bench(spec, plan, addrs, spec.lang) }];
  const r = simulate([...primitiveSources(sources), ...sources], 'tb', { until: 1e9 });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line}: ${e.message}`), [], 'compile errors');
  const warnings = [...(r.lib?.errors || []), ...(r.design?.diags || [])].filter(d => /^(src|sim)\//.test(d.file || '')).map(d => `${d.file}:${d.line}: ${d.message}`);
  assert.deepEqual(warnings, [], 'no warnings');
  assert.deepEqual(r.sim.log.filter(l => /^[IWRB] \d+ /.test(l.text)).map(l => l.text), expected(spec, words, addrs));
}

const CASES = [
  // one block; the parity bits as data (9 bits); two ports; a write mode each
  { width: 9, depth: 2048, writeMode: 'READ_FIRST' },
  { width: 8, depth: 1024, writeMode: 'WRITE_FIRST', ports: 'dual' },
  { width: 16, depth: 1000, writeMode: 'WRITE_FIRST' },
  // columns and rows: 20 x 3000 (Spartan-3E: 5 RAMB16_S4 side by side), 3 x 20000 (rows)
  { width: 20, depth: 3000, writeMode: 'READ_FIRST' },
  { width: 3, depth: 20000, writeMode: 'WRITE_FIRST', ports: 'dual' },
  // a ROM
  { kind: 'rom', width: 12, depth: 5000, ports: 'dual' },
];
for (const family of ['spartan3e', 'spartan6']) {
  for (const lang of ['vhdl', 'verilog']) {
    test(`block RAM primitives simulated (${family}, ${lang}): the initial contents, writes read back on each port, the write mode`, () => {
      for (const c of CASES) {
        const spec = memSpec({ family, lang, ...c });
        const words = Array.from({ length: spec.depth }, (_, a) => (a % 5 ? valueOf(a * 3 + 1, spec.width) : 0n));
        simulateMemory(spec, words);
      }
    });
    test(`inferable HDL simulated (${family}, ${lang}): the same memories as an array`, () => {
      for (const c of CASES.slice(0, 3)) simulateMemory(memSpec({ family, lang, style: 'inferred', ...c }), Array.from({ length: c.depth }, (_, a) => valueOf(a + 7, c.width)));
    });
  }
}
