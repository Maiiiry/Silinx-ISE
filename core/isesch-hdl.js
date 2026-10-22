// Silinx - ISE schematics' library symbols as exact HDL (#405: out of core/isesch.js): the gates, multiplexers,
// decoders, comparators, adders, counters, flip-flops, tri-states and multipliers of the Xilinx libraries written
// as the HDL Silinx generates for them.
import { GATE_RE } from './isesch.js';

// ===================================================================== exact HDL for library symbols without a Silinx twin
// Each template gets (lang, P, T, W): P(isePin) -> pin identifier, T(suffix) -> fresh temp identifier,
// W(isePin) -> pin width. Returns { code, decls } (decls go to doc.hdl.decls).
function vecV(P, names) { return `{${names.map(P).join(', ')}}`; }
function vecVh(P, names) { return names.map(P).join(' & '); }
const bitV = (x, i) => `${x}[${i}]`;
const bitVh = (x, i) => `${x}(${i})`;

function gateTpl(op, n, b) {
  const bop = op === 'nand' ? 'and' : op === 'nor' ? 'or' : op === 'xnor' ? 'xor' : op;
  const inv = op === 'nand' || op === 'nor' || op === 'xnor';
  return (lang, P) => {
    const ins = [];
    for (let k = 0; k < n; k++) ins.push(k < b ? (lang === 'vhdl' ? `(not ${P(`I${k}`)})` : `~${P(`I${k}`)}`) : P(`I${k}`));
    if (lang === 'vhdl') { const e = ins.join(` ${bop} `); return { code: `${P('O')} <= ${inv ? `not (${e})` : e};` }; }
    const o = { and: '&', or: '|', xor: '^' }[bop];
    const e = ins.join(` ${o} `);
    return { code: `assign ${P('O')} = ${inv ? `~(${e})` : e};` };
  };
}
// n:1 multiplexer with select bits S0..S(k-1), optional enable E, optional inverted data inputs
function muxTpl(n, { en = false, invert = 0 } = {}) {
  const k = Math.log2(n);
  return (lang, P) => {
    const d = i => (i < invert ? (lang === 'vhdl' ? `(not ${P(`D${i}`)})` : `~${P(`D${i}`)}`) : P(`D${i}`));
    if (lang === 'vhdl') {
      const val = i => (en ? `(${P('E')} and ${d(i).replace(/^\((.*)\)$/, '$1')})` : d(i));
      const parts = [];
      for (let i = 0; i < n - 1; i++) {
        const cond = [];
        for (let j = k - 1; j >= 0; j--) cond.push(`${P(`S${j}`)} = '${(i >> j) & 1}'`);
        parts.push(`${val(i)} when ${cond.join(' and ')} else`);
      }
      return { code: `${P('O')} <=\n  ${[...parts, `${val(n - 1)};`].join('\n  ')}` };
    }
    const tree = (lo, hi, j) => (j < 0 ? d(lo) : `(${P(`S${j}`)} ? ${tree(lo + ((hi - lo + 1) >> 1), hi, j - 1)} : ${tree(lo, lo + ((hi - lo + 1) >> 1) - 1, j - 1)})`);
    const e = tree(0, n - 1, k - 1);
    return { code: `assign ${P('O')} = ${en ? `${P('E')} & ${e}` : e};` };
  };
}
function decoderTpl(n) {
  return (lang, P) => {
    const L = [];
    for (let i = 0; i < 1 << n; i++) {
      const t = [P('E')];
      for (let j = n - 1; j >= 0; j--) t.push((i >> j) & 1 ? P(`A${j}`) : (lang === 'vhdl' ? `(not ${P(`A${j}`)})` : `~${P(`A${j}`)}`));
      L.push(lang === 'vhdl' ? `${P(`D${i}`)} <= ${t.join(' and ')};` : `assign ${P(`D${i}`)} = ${t.join(' & ')};`);
    }
    return { code: L.join('\n') };
  };
}
// comparators with separate bit pins (COMP2/4, COMPM2/4) or buses (COMPM8/16 with both outputs)
function compTpl(w, bits, outs) {
  return (lang, P) => {
    const vh = lang === 'vhdl';
    const A = i => (bits ? P(`A${i}`) : (vh ? bitVh(P(`A(${w - 1}:0)`), i) : bitV(P(`A(${w - 1}:0)`), i)));
    const B = i => (bits ? P(`B${i}`) : (vh ? bitVh(P(`B(${w - 1}:0)`), i) : bitV(P(`B(${w - 1}:0)`), i)));
    const L = [];
    const not = x => (vh ? `(not ${x})` : `~${x}`);
    const and = (...x) => x.join(vh ? ' and ' : ' & ');
    const or = (...x) => x.join(vh ? ' or ' : ' | ');
    const xnor = (a, b) => (vh ? `(${a} xnor ${b})` : `(${a} ~^ ${b})`);
    const gt = (i, swap) => { const a = swap ? B(i) : A(i), b = swap ? A(i) : B(i); const here = `(${and(a, not(b))})`; return i === 0 ? here : `(${or(here, `(${and(xnor(A(i), B(i)), gt(i - 1, swap))})`)})`; };
    const asg = (o, e) => L.push(vh ? `${P(o)} <= ${e};` : `assign ${P(o)} = ${e};`);
    if (!bits && outs.some(o => o !== 'EQ')) {
      const a = P(`A(${w - 1}:0)`), b = P(`B(${w - 1}:0)`);
      if (outs.includes('GT')) L.push(vh ? `${P('GT')} <= '1' when unsigned(${a}) > unsigned(${b}) else '0';` : `assign ${P('GT')} = ${a} > ${b};`);
      if (outs.includes('LT')) L.push(vh ? `${P('LT')} <= '1' when unsigned(${a}) < unsigned(${b}) else '0';` : `assign ${P('LT')} = ${a} < ${b};`);
      return { code: L.join('\n') };
    }
    for (const o of outs) {
      if (o === 'EQ') asg(o, [...Array(w).keys()].map(i => xnor(A(i), B(i))).join(vh ? ' and ' : ' & '));
      else asg(o, gt(w - 1, o === 'LT'));
    }
    return { code: L.join('\n') };
  };
}
// ADD4/8/16 and ADSU4/8/16: S = A + B + CI (ADD = 1) or A + not B + CI (ADD = 0), CO carry out, OFL two's complement overflow
function adderTpl(w, bits, adsu) {
  return (lang, P, T) => {
    const vh = lang === 'vhdl';
    const an = [...Array(w).keys()].reverse().map(i => `A${i}`), bn = an.map(x => 'B' + x.slice(1)), sn = an.map(x => 'S' + x.slice(1));
    const a = T('a'), b = T('b'), s = T('s');
    const L = [];
    const msb = w - 1;
    if (vh) {
      const decls = [`signal ${a}, ${b} : std_logic_vector(${msb} downto 0);`, `signal ${s} : unsigned(${w} downto 0);`];
      L.push(`${a} <= ${bits ? vecVh(P, an) : P(`A(${msb}:0)`)};`);
      const bv = bits ? vecVh(P, bn) : P(`B(${msb}:0)`);
      L.push(adsu ? `${b} <= ${bv} when ${P('ADD')} = '1' else not (${bv});` : `${b} <= ${bv};`);
      const sum = `resize(unsigned(${a}), ${w + 1}) + resize(unsigned(${b}), ${w + 1})`;
      L.push(`${s} <= ${sum} + 1 when ${P('CI')} = '1' else ${sum};`);
      if (bits) sn.forEach((x, i) => L.push(`${P(x)} <= ${s}(${msb - i});`)); else L.push(`${P(`S(${msb}:0)`)} <= std_logic_vector(${s}(${msb} downto 0));`);
      L.push(`${P('CO')} <= ${s}(${w});`);
      L.push(`${P('OFL')} <= (${a}(${msb}) xnor ${b}(${msb})) and (${a}(${msb}) xor ${s}(${msb}));`);
      return { code: L.join('\n'), decls };
    }
    const decls = [`wire [${msb}:0] ${a}, ${b};`, `wire [${w}:0] ${s};`];
    L.push(`assign ${a} = ${bits ? vecV(P, an) : P(`A(${msb}:0)`)};`);
    const bv = bits ? vecV(P, bn) : P(`B(${msb}:0)`);
    L.push(`assign ${b} = ${adsu ? `${P('ADD')} ? ${bv} : ~${bv}` : bv};`);
    L.push(`assign ${s} = ${a} + ${b} + ${P('CI')};`);
    if (bits) sn.forEach((x, i) => L.push(`assign ${P(x)} = ${s}[${msb - i}];`)); else L.push(`assign ${P(`S(${msb}:0)`)} = ${s}[${msb}:0];`);
    L.push(`assign ${P('CO')} = ${s}[${w}];`);
    L.push(`assign ${P('OFL')} = (${a}[${msb}] ~^ ${b}[${msb}]) & (${a}[${msb}] ^ ${s}[${msb}]);`);
    return { code: L.join('\n'), decls };
  };
}
// CB2CE..CB16CE / CB..RE counters with all outputs (Q bits or bus, CEO, TC)
function counterTpl(w, bits, sync) {
  return (lang, P, T, has) => {
    const vh = lang === 'vhdl';
    const q = T('q'), msb = w - 1, rst = sync ? P('R') : P('CLR');
    const L = [];
    const outs = bits ? [...Array(w).keys()].map(i => [`Q${i}`, i]) : [[`Q(${msb}:0)`, null]];
    if (vh) {
      const decls = [`signal ${q} : unsigned(${msb} downto 0) := (others => '0');`];
      if (sync) L.push(`process (${P('C')})`, 'begin', `  if rising_edge(${P('C')}) then`, `    if ${rst} = '1' then`, `      ${q} <= (others => '0');`, `    elsif ${P('CE')} = '1' then`, `      ${q} <= ${q} + 1;`, '    end if;', '  end if;', 'end process;');
      else L.push(`process (${P('C')}, ${rst})`, 'begin', `  if ${rst} = '1' then`, `    ${q} <= (others => '0');`, `  elsif rising_edge(${P('C')}) then`, `    if ${P('CE')} = '1' then`, `      ${q} <= ${q} + 1;`, '    end if;', '  end if;', 'end process;');
      for (const [o, i] of outs) if (has(o)) L.push(i == null ? `${P(o)} <= std_logic_vector(${q});` : `${P(o)} <= ${q}(${i});`);
      const all = `${q} = to_unsigned(${2 ** w - 1}, ${w})`;
      if (has('TC')) L.push(`${P('TC')} <= '1' when ${all} else '0';`);
      if (has('CEO')) L.push(`${P('CEO')} <= '1' when ${all} and ${P('CE')} = '1' else '0';`);
      return { code: L.join('\n'), decls };
    }
    const decls = [`reg [${msb}:0] ${q} = ${w}'b0;`];
    L.push(sync ? `always @(posedge ${P('C')})` : `always @(posedge ${P('C')} or posedge ${rst})`, `  if (${rst}) ${q} <= ${w}'b0;`, `  else if (${P('CE')}) ${q} <= ${q} + 1'b1;`);
    for (const [o, i] of outs) if (has(o)) L.push(i == null ? `assign ${P(o)} = ${q};` : `assign ${P(o)} = ${q}[${i}];`);
    if (has('TC')) L.push(`assign ${P('TC')} = &${q};`);
    if (has('CEO')) L.push(`assign ${P('CEO')} = ${P('CE')} & (&${q});`);
    return { code: L.join('\n'), decls };
  };
}
// generic flip-flop / toggle flip-flop: { w, bits, ce, clr, pre, r, s, neg, toggle, init }
function ffTpl(o) {
  return (lang, P, T, has) => {
    const vh = lang === 'vhdl';
    const q = T('q'), w = o.w || 1, msb = w - 1;
    const din = o.bits ? [...Array(w).keys()].reverse().map(i => `D${i}`) : null;
    const C = P(o.clk || 'C');
    const dv = o.toggle ? null : (din ? (vh ? vecVh(P, din) : vecV(P, din)) : P('D'));
    const ones = vh ? (w > 1 ? "(others => '1')" : "'1'") : `${w}'b${'1'.repeat(w)}`;
    const zeros = vh ? (w > 1 ? "(others => '0')" : "'0'") : `${w}'b0`;
    const iv = o.init === '1' ? ones : zeros;
    const L = [];
    let next = o.toggle ? (vh ? `not ${q}` : `~${q}`) : dv;
    const en = [o.ce && P('CE'), o.toggle && P('T')].filter(Boolean);
    if (vh) {
      const decls = [`signal ${q} : ${w > 1 ? `std_logic_vector(${msb} downto 0)` : 'std_logic'} := ${iv};`];
      const sens = [C, o.clr && P('CLR'), o.pre && P('PRE')].filter(Boolean);
      L.push(`process (${sens.join(', ')})`, 'begin');
      const asyn = [];
      if (o.clr) asyn.push([P('CLR'), zeros]);
      if (o.pre) asyn.push([P('PRE'), ones]);
      let first = true;
      for (const [sig, v] of asyn) { L.push(`  ${first ? 'if' : 'elsif'} ${sig} = '1' then`, `    ${q} <= ${v};`); first = false; }
      L.push(`  ${first ? 'if' : 'elsif'} ${o.neg ? 'falling_edge' : 'rising_edge'}(${C}) then`);
      const body = [];
      const syn = [];
      if (o.r) syn.push([P('R'), zeros]);
      if (o.s) syn.push([P('S'), ones]);
      let f2 = true;
      for (const [sig, v] of syn) { body.push(`${f2 ? 'if' : 'elsif'} ${sig} = '1' then`, `  ${q} <= ${v};`); f2 = false; }
      if (en.length) body.push(`${f2 ? 'if' : 'elsif'} ${en.map(e => `${e} = '1'`).join(' and ')} then`, `  ${q} <= ${next};`, 'end if;');
      else if (!f2) body.push('else', `  ${q} <= ${next};`, 'end if;');
      else body.push(`${q} <= ${next};`);
      L.push(...body.map(l => '    ' + l), '  end if;', 'end process;');
      if (o.bits) for (let i = 0; i < w; i++) L.push(`${P(`Q${i}`)} <= ${q}(${i});`); else L.push(`${P(o.qName || 'Q')} <= ${q};`);
      return { code: L.join('\n'), decls };
    }
    const decls = [`reg ${w > 1 ? `[${msb}:0] ` : ''}${q} = ${iv};`];
    const ev = [`${o.neg ? 'negedge' : 'posedge'} ${C}`, o.clr && `posedge ${P('CLR')}`, o.pre && `posedge ${P('PRE')}`].filter(Boolean);
    L.push(`always @(${ev.join(' or ')})`);
    const ch = [];
    if (o.clr) ch.push([P('CLR'), zeros]);
    if (o.pre) ch.push([P('PRE'), ones]);
    if (o.r) ch.push([P('R'), zeros]);
    if (o.s) ch.push([P('S'), ones]);
    ch.forEach(([sig, v], i) => L.push(`  ${i ? 'else if' : 'if'} (${sig}) ${q} <= ${v};`));
    const upd = `${en.length ? `if (${en.join(' && ')}) ` : ''}${q} <= ${next};`;
    L.push(ch.length ? `  else ${upd}` : `  ${upd}`);
    if (o.bits) for (let i = 0; i < w; i++) L.push(`assign ${P(`Q${i}`)} = ${q}[${i}];`); else L.push(`assign ${P(o.qName || 'Q')} = ${q};`);
    return { code: L.join('\n'), decls };
  };
}
function triTpl(kind) {
  return (lang, P) => {
    const vh = lang === 'vhdl';
    if (kind === 'e') return { code: vh ? `${P('O')} <= ${P('I')} when ${P('E')} = '1' else 'Z';` : `assign ${P('O')} = ${P('E')} ? ${P('I')} : 1'bz;` };
    return { code: vh ? `${P('O')} <= 'Z' when ${P('T')} = '1' else ${P('I')};` : `assign ${P('O')} = ${P('T')} ? 1'bz : ${P('I')};` };
  };
}
function multiTpl(n, inv) {
  return (lang, P) => {
    const L = [];
    for (let k = 0; k < n; k++) {
      const i = P(`I${k}`), o = P(`O${k}`);
      L.push(lang === 'vhdl' ? `${o} <= ${inv ? 'not ' : ''}${i};` : `assign ${o} = ${inv ? '~' : ''}${i};`);
    }
    return { code: L.join('\n') };
  };
}
// template for a library symbol (lower-case name), or null
export function libTemplate(s, conn) {
  let m = GATE_RE.exec(s);
  if (m) return gateTpl(m[1], +m[2], +(m[3] || 0));
  if (s === 'm2_1b1' || s === 'm2_1b2') return muxTpl(2, { invert: s === 'm2_1b1' ? 1 : 2 });
  if (s === 'm2_1e') return muxTpl(2, { en: true });
  if (s === 'm4_1e') return muxTpl(4, { en: true });
  if (s === 'm8_1e') return muxTpl(8, { en: true });
  if ((m = /^d(2|3|4)_(4|8|16)e$/.exec(s))) return decoderTpl(+m[1]);
  if ((m = /^comp(m)?(2|4|8|16)$/.exec(s))) { const w = +m[2]; return compTpl(w, w <= 4, m[1] ? ['GT', 'LT'].filter(conn) : ['EQ']); }
  if ((m = /^(add|adsu)(4|8|16)$/.exec(s))) return adderTpl(+m[2], m[2] === '4', m[1] === 'adsu');
  if ((m = /^cb(2|4|8|16)(ce|re)$/.exec(s))) return counterTpl(+m[1], +m[1] <= 4, m[2] === 're');
  if ((m = /^fd(4)(ce|re)$/.exec(s))) return ffTpl({ w: 4, bits: true, ce: true, clr: m[2] === 'ce', r: m[2] === 're' });
  if ((m = /^fd(c|ce|e|p|pe|r|re|s|se|cp|cpe|rs|rse)?(_1)?$/.exec(s))) {
    const f = m[1] || '';
    return ffTpl({ ce: f.includes('e'), clr: /^c/.test(f), pre: /p/.test(f), r: /^r/.test(f), s: /s/.test(f), neg: !!m[2], init: /p|^s|rs/.test(f) ? '1' : '0' });
  }
  if ((m = /^ft(c|ce|p|pe)$/.exec(s))) return ffTpl({ toggle: true, ce: m[1].includes('e'), clr: m[1][0] === 'c', pre: m[1][0] === 'p', init: m[1][0] === 'p' ? '1' : '0' });
  if (s === 'obufe') return triTpl('e');
  if (s === 'obuft') return triTpl('t');
  if (s === 'inv4' || s === 'buf4') return multiTpl(4, s === 'inv4');
  if ((m = /^(muxcy|xorcy|mult_and|muxf[5-8])(_l|_d)?$/.exec(s))) {
    const outs = m[1] === 'mult_and' ? ['LO'] : [...(m[2] !== '_l' ? ['O'] : []), ...(m[2] ? ['LO'] : [])];
    return (lang, P) => {
      const vh = lang === 'vhdl';
      const e = m[1] === 'muxcy' ? (vh ? `${P('CI')} when ${P('S')} = '1' else ${P('DI')}` : `${P('S')} ? ${P('CI')} : ${P('DI')}`)
        : m[1] === 'xorcy' ? (vh ? `${P('CI')} xor ${P('LI')}` : `${P('CI')} ^ ${P('LI')}`)
          : m[1] === 'mult_and' ? (vh ? `${P('I0')} and ${P('I1')}` : `${P('I0')} & ${P('I1')}`)
            : (vh ? `${P('I1')} when ${P('S')} = '1' else ${P('I0')}` : `${P('S')} ? ${P('I1')} : ${P('I0')}`);
      return { code: outs.map(o => (vh ? `${P(o)} <= ${e};` : `assign ${P(o)} = ${e};`)).join('\n') };
    };
  }
  return null;
}
