// Silinx - the device primitives (#791, core/primitives.js) as ISE's own library symbols (#1694): BUFG, BUFGMUX, IBUFG,
// DCM_SP, the block RAMs, MULT18X18SIO (and Spartan-6's), written in an ISE schematic as the library symbol of the
// UNISIM primitive with the symbol's parameters as the block's attributes, and read back as the same Silinx symbol.
// The pins' positions are those of ISE 14.7's schematic libraries (spartan3e, spartan6; the same in both). Isomorphic.
import { DEVICE_PRIMITIVES, RAMB16_PORTS, primitiveOf, initWords } from './primitives.js';

// pin positions (x, y) of each library symbol by the pin's name (its bus range left out)
const POS_TEXT = {
  bufg: 'I 0 -32 O 224 -32',
  bufgmux: 'I0 0 -160 I1 0 -96 S 0 -32 O 320 -128',
  ibufg: 'I 0 -32 O 224 -32',
  dcm_sp: 'CLKFB 0 -896 CLKIN 0 -960 DSSEN 0 -832 PSCLK 0 -128 PSEN 0 -192 PSINCDEC 0 -256 RST 0 -384 CLK0 384 -960 CLK180 384 -832 CLK270 384 -768 CLK2X 384 -704 CLK2X180 384 -640 CLK90 384 -896 CLKDV 384 -576 CLKFX 384 -512 CLKFX180 384 -448 LOCKED 384 -384 PSDONE 384 -128 STATUS 384 -320',
  mult18x18sio: 'A 0 -320 B 0 -288 CEA 0 -256 CEB 0 -224 CEP 0 -192 CLK 0 -160 RSTA 0 -128 RSTB 0 -96 RSTP 0 -64 BCIN 0 -32 P 384 -320 BCOUT 384 -32',
  // (a single port with parity bits, RAMB16_S9 / S18 / S36; without them, S1 / S2 / S4, every pin 48 lower)
  ramb16_s: 'ADDR 0 -240 CLK 0 -304 DI 0 -176 DIP 0 -112 EN 0 -432 SSR 0 -368 WE 0 -496 DO 480 -336 DOP 480 -400',
  ramb16_s_s: 'ADDRA 0 -768 ADDRB 0 -256 CLKA 0 -832 CLKB 0 -320 DIA 0 -704 DIB 0 -192 DIPA 0 -1088 DIPB 0 -128 ENA 0 -960 ENB 0 -448 SSRA 0 -896 SSRB 0 -384 WEA 0 -1024 WEB 0 -512 DOA 608 -864 DOB 608 -352 DOPA 608 -944 DOPB 608 -416',
  ramb8bwer: 'ADDRAWRADDR 0 -992 ADDRBRDADDR 0 -928 DIADI 0 -864 DIBDI 0 -800 DIPADIP 0 -736 DIPBDIP 0 -672 WEAWEL 0 -608 WEBWEU 0 -544 CLKAWRCLK 0 -480 CLKBRDCLK 0 -416 ENAWREN 0 -352 ENBRDEN 0 -288 REGCEA 0 -224 REGCEBREGCE 0 -160 RSTA 0 -96 RSTBRST 0 -32 DOADO 592 -992 DOBDO 592 -672 DOPADOP 592 -352 DOPBDOP 592 -32',
  ramb16bwer: 'ADDRA 0 -992 ADDRB 0 -928 DIA 0 -864 DIB 0 -800 DIPA 0 -736 DIPB 0 -672 WEA 0 -608 WEB 0 -544 CLKA 0 -480 CLKB 0 -416 ENA 0 -352 ENB 0 -288 REGCEA 0 -224 REGCEB 0 -160 RSTA 0 -96 RSTB 0 -32 DOA 384 -992 DOB 384 -672 DOPA 384 -352 DOPB 384 -32',
  dsp48a1: 'A 0 -1504 B 0 -1440 C 0 -1376 D 0 -1312 OPMODE 0 -1248 PCIN 0 -1184 CARRYIN 0 -1120 CEA 0 -1056 CEB 0 -992 CEC 0 -928 CECARRYIN 0 -864 CED 0 -800 CEM 0 -736 CEOPMODE 0 -672 CEP 0 -608 CLK 0 -544 RSTA 0 -480 RSTB 0 -416 RSTC 0 -352 RSTCARRYIN 0 -288 RSTD 0 -224 RSTM 0 -160 RSTOPMODE 0 -96 RSTP 0 -32 BCOUT 464 -1504 M 464 -1216 PCOUT 464 -928 P 464 -640 CARRYOUT 464 -352 CARRYOUTF 464 -64',
  pll_base: 'CLKIN 0 -256 CLKFBIN 0 -144 RST 0 -32 CLKOUT0 384 -256 CLKOUT1 384 -224 CLKOUT2 384 -192 CLKOUT3 384 -160 CLKOUT4 384 -128 CLKOUT5 384 -96 CLKFBOUT 384 -64 LOCKED 384 -32',
  bufio2: 'I 0 -160 DIVCLK 384 -160 IOCLK 384 -96 SERDESSTROBE 384 -32',
};
const POS = Object.fromEntries(Object.entries(POS_TEXT).map(([k, t]) => {
  const a = t.split(' '), m = {};
  for (let i = 0; i < a.length; i += 3) m[a[i]] = [+a[i + 1], +a[i + 2]];
  return [k, m];
}));
const WIDTHS = Object.keys(RAMB16_PORTS);

/** An ISE library symbol's name (lower case) -> the Silinx primitive it is: { type, params } (the block RAMs' port
 *  widths), or null. RAMB16_Sa_Sb only with port A not wider than port B (ISE's library has no other). */
export function primOfIseName(name) {
  const s = String(name || '').toLowerCase();
  let m;
  if ((m = /^ramb16_s(\d+)$/.exec(s)) && WIDTHS.includes(m[1])) return { type: 'ramb16_s', params: { portWidth: m[1] } };
  if ((m = /^ramb16_s(\d+)_s(\d+)$/.exec(s)) && WIDTHS.includes(m[1]) && WIDTHS.includes(m[2]) && +m[1] <= +m[2]) return { type: 'ramb16_s_s', params: { widthA: m[1], widthB: m[2] } };
  if (POS[s] && DEVICE_PRIMITIVES[s] && !s.startsWith('ramb16_s')) return { type: s, params: {} };
  return null;
}

// an ISE pin's name: its bus range when it is a vector (a vector of one bit too, DI(0:0))
const isePin = q => (q.width > 1 || q.vec ? `${q.name}(${q.width - 1}:0)` : q.name);

/** The pins of the library symbol of a primitive ({ isePin: [dir, x, y] }, as libPins), or null. */
export function primLibPins(name) {
  const k = primOfIseName(name);
  if (!k) return null;
  const r = primitiveOf(k.type, k.params);
  const pos = POS[k.type], low = k.type === 'ramb16_s' && !RAMB16_PORTS[k.params.portWidth][1] ? 48 : 0;
  const out = {};
  for (const q of r.pins) out[isePin(q)] = [q.dir, pos[q.name][0], pos[q.name][1] + low];
  return out;
}

// an attribute's value as ISE writes it (no quotes; a real with its decimal point; hexadecimal digits), null: not valid
function attrText(g, v) {
  const s = String(v ?? '').trim();
  switch (g.kind) {
    case 'int': return /^-?\d+$/.test(s) ? String(+s) : null;
    case 'real': return /^-?(\d+(\.\d*)?|\.\d+)$/.test(s) ? (Number.isInteger(+s) ? (+s).toFixed(1) : String(+s)) : null;
    case 'bool': return v === true || /^true$/i.test(s) ? 'TRUE' : v === false || /^false$/i.test(s) ? 'FALSE' : null;
    case 'hex': {
      const h = s.replace(/^(0x|x")/i, '').replace(/"$/, '').replace(/_/g, '');
      return /^[0-9A-Fa-f]+$/.test(h) && BigInt(`0x${h}`) < 1n << BigInt(g.bits) ? BigInt(`0x${h}`).toString(16).toUpperCase().padStart(Math.ceil(g.bits / 4), '0') : null;
    }
    default: return s || null;
  }
}
// its value type, as ISE's library symbols declare it (sch2hdl writes the generic map by it: a Float unquoted, a
// real of a list too, CLKDV_DIVIDE; an integer of a list, DATA_WIDTH_A, an IntegerList)
function valueType(g) {
  if (g.kind === 'hex') return `BitVector ${g.bits} h`;
  if (g.kind === 'int') return `Integer ${g.min} ${g.max}`;
  if (g.kind === 'real') return g.options ? `Float ${Math.min(...g.options)} ${Math.max(...g.options)}` : `Float ${g.min} ${g.max}`;
  if (g.kind === 'bool') return 'Boolean';
  if (g.num) return `IntegerList ${g.options.join(' ')}`;
  return g.options ? `StringValList ${g.options.join(' ')}` : 'String';
}

// the library symbols' timestamps (ISE takes a block whose blockdef has another as out of date); the others' 2000-1-1T10:10:10
const STAMPS = { dcm_sp: '2007-4-11T22:49:47', ramb8bwer: '2009-3-13T20:29:23', ramb16bwer: '2010-7-30T0:52:59', dsp48a1: '2009-3-18T18:2:30',
  pll_base: '2005-6-1T10:10:10', bufio2: '2009-3-13T19:47:30' };
const STAMPS6 = { ibufg: '2009-3-20T10:10:10', bufgmux: '2009-3-13T19:46:5' };
/** The timestamp of a primitive's library symbol in ISE's library of `family`, or null (not a primitive's). */
export function primTimestamp(name, family = 'spartan3e') {
  const s = String(name || '').toLowerCase();
  if (!primOfIseName(s)) return null;
  return (family === 'spartan6' && STAMPS6[s]) || STAMPS[s] || '2000-1-1T10:10:10';
}

/**
 * A Silinx primitive symbol as ISE's library symbol: { lib: true, name, pins: { pin: isePin }, attrs: [[name, value,
 * valueType]] } (every attribute at the symbol's value, a block RAM's contents as its INIT_xx), or null (no library
 * symbol: RAMB16_Sa_Sb with port A wider, an attribute not valid).
 */
export function primIseSymbol(s) {
  const r = primitiveOf(s.type, s.params || {});
  if (!r || r.error) return null;
  const name = r.name.toLowerCase();
  if (!primOfIseName(name)) return null;
  const attrs = [];
  for (const g of r.generics) {
    const v = attrText(g, s.params?.[g.name] ?? g.default);
    if (v == null) return null;
    attrs.push([g.name, v, valueType(g)]);
  }
  for (const [k, v] of r.fixed || []) attrs.push([k, v, 'String']);
  if (r.contents && String(s.params?.contents || '').trim()) {
    try {
      for (const [k, h] of Object.entries(initWords(s.params.contents, r.contents.width, r.contents.inits))) attrs.push([k, h, 'BitVector 256 h']);
    } catch { return null; }
  }
  return { lib: true, name, pins: Object.fromEntries(r.pins.map(q => [q.name, isePin(q)])), attrs };
}

/** An ISE block of a primitive's library symbol -> the Silinx symbol: { type, params } (its attributes read back as
 *  the symbol's parameters, the INIT_xx as its contents), or null. */
export function primFromIse(symbol, attrs = {}) {
  const k = primOfIseName(symbol);
  if (!k) return null;
  const params = { ...k.params };
  const at = n => attrs[Object.keys(attrs).find(a => a.toUpperCase() === n)];
  const r = primitiveOf(k.type, params);
  for (const g of r.generics) {
    const v = at(g.name);
    if (v == null || v === '') continue;
    params[g.name] = g.kind === 'int' && /^-?\d+$/.test(v.trim()) ? +v : g.kind === 'bool' ? /^true$/i.test(v.trim()) : v.trim();
  }
  const c = primitiveOf(k.type, params).contents;
  if (c) {
    let bits = 0n;
    for (let j = 0; j < c.inits; j++) {
      const v = at(`INIT_${j.toString(16).toUpperCase().padStart(2, '0')}`);
      if (v && /^[0-9A-Fa-f]+$/.test(v.trim())) bits |= BigInt(`0x${v.trim()}`) << BigInt(j * 256);
    }
    const words = [], mask = (1n << BigInt(c.width)) - 1n;
    for (let i = 0; bits >> BigInt(i * c.width); i++) words.push(((bits >> BigInt(i * c.width)) & mask).toString(16).toUpperCase());
    if (words.length) params.contents = words.join(' ');
  }
  return { type: k.type, params };
}
