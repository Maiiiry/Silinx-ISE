// Silinx FSM diagrams' HDL (#405: out of core/fsm.js): the VHDL or Verilog of a diagram, in three or two processes,
// its states encoded as binary, Gray, one-hot or an enumeration, with the conditions and outputs written.
import { portExprCoder } from './asm.js';
import {
  analyzeFsm, constValue, fsmEncoding, fsmErrors, mask, nameOf, normalizeFsm, pad, stateById, transitionsFrom
} from './fsm.js';

// ---------------------------------------------------------------------------------------
// HDL generation
// ---------------------------------------------------------------------------------------

export function sortedOutputs(m, outs) { return m.outputs.filter((o) => outs[o.name] != null).map((o) => [o, outs[o.name]]); }
/** Statements (printed later) for one language. */
function printIf(chain, ind, lang, out, elseBody = null) {
  // chain: [{ cond, body: [lines] }]; elseBody: [lines] | null
  const I = '    '.repeat(ind);
  chain.forEach((br, i) => {
    if (lang === 'vhdl') out.push(`${I}${i ? 'elsif' : 'if'} ${br.cond} then`);
    else out.push(`${I}${i ? 'end else if' : 'if'} (${br.cond}) begin`);
    if (br.body.length) for (const l of br.body) out.push(`${I}    ${l}`);
    else if (lang === 'vhdl') out.push(`${I}    null;`);
  });
  if (elseBody) {
    out.push(lang === 'vhdl' ? `${I}else` : `${I}end else begin`);
    for (const l of elseBody) out.push(`${I}    ${l}`);
  }
  out.push(lang === 'vhdl' ? `${I}end if;` : `${I}end`);
}

/**
 * Generate the HDL module of the diagram: { lang, filename, code }. Throws if it has errors.
 * `source`: file name of the diagram, for the header.
 */
export function generateFsm(model, lang, { source } = {}) {
  const m = normalizeFsm(model);
  lang = lang === 'verilog' || (!lang && m.lang === 'verilog') ? 'verilog' : 'vhdl';
  const errs = fsmErrors(m);
  if (errs.length) {
    const e = new Error(`The state diagram '${m.name}' has ${errs.length} error(s):\n${errs.map((d) => `  - ${d.message}`).join('\n')}`);
    e.diagnostics = errs;
    throw e;
  }
  const V = lang === 'vhdl';
  const c = V ? '--' : '//';
  const enc = fsmEncoding(m);
  const W = enc[0].width;
  const encById = new Map(enc.map((e) => [e.id, e]));
  const coderN = portExprCoder(m, lang), coderO = portExprCoder(m, lang);
  const ow = new Map(m.outputs.map((o) => [o.name, o.width]));
  const lit = (text, o) => coderN.lit(mask(constValue(text) ?? 0n, ow.get(o)), ow.get(o), /^\d+$/.test(String(text).trim()) && ow.get(o) > 1 ? 'd' : 'b');
  const asg = (o, text) => (V ? `${o} <= ${lit(text, o)};` : `${o} = ${lit(text, o)};`);
  const setState = (id) => (V ? `state_next <= ${encById.get(id).constName};` : `state_next = ${encById.get(id).constName};`);
  const two = m.style === '2process';
  const states = enc.map((e) => stateById(m, e.id));
  const ts = (id) => transitionsFrom(m, id).filter((t) => stateById(m, t.to));
  const an = analyzeFsm(m);
  const never = an.never;

  // ---- header
  const rule = c + '='.repeat(78);
  const L = [rule];
  const kindText = m.type === 'mealy' ? 'Mealy' : 'Moore';
  L.push(`${c} ${V ? 'Entity' : 'Module'}      : ${m.name}`);
  L.push(`${c} Description : ${kindText} finite state machine generated from the state diagram ${source || `${m.name}.fsm.json`}`);
  if (m.description) for (const line of m.description.split(/\r?\n/)) L.push(`${c}               ${line}`.trimEnd());
  L.push(`${c} Generator   : Silinx FSM editor, kept in sync with the diagram (edit either one).`);
  L.push(`${c} Style       : ${two ? '2 processes: state register + next-state and output logic' : '3 processes: state register, next-state logic, output logic'}`);
  L.push(`${c} Clock       : ${m.clock} (rising edge)`);
  L.push(`${c} Reset       : ${m.reset.name}, active-${m.reset.active}, ${m.reset.sync ? 'synchronous' : 'asynchronous'} (goes to ${nameOf(m, m.initial)})`);
  L.push(`${c} Encoding    : ${m.encoding}${m.encoding === 'enum' ? '' : ` (${W} state bit${W === 1 ? '' : 's'})`}`);
  L.push(c);
  L.push(`${c} States${m.encoding === 'enum' && V ? '' : ' and codes'}${m.type === 'moore' || states.some((s) => Object.keys(s.outputs).length) ? ' (Moore outputs)' : ''}:`);
  const nw = Math.max(4, ...states.map((s) => s.name.length));
  for (const s of states) {
    const e = encById.get(s.id);
    const code = m.encoding === 'enum' && V ? '' : ` = ${e.bits}`;
    const mo = sortedOutputs(m, s.outputs).map(([o, v]) => `${o.name} = ${v}`).join(', ');
    L.push(`${c}   ${pad(s.name, nw)}${code}${s.id === m.initial ? '  (reset)' : '         '}${mo ? `  ${mo}` : ''}`.trimEnd());
  }
  L.push(c);
  L.push(`${c} Transitions (state : condition -> next state${m.type === 'mealy' ? ' / Mealy outputs' : ''}); the first true condition is taken:`);
  for (const s of states) {
    for (const t of ts(s.id)) {
      const mo = sortedOutputs(m, t.outputs).map(([o, v]) => `${o.name} = ${v}`).join(', ');
      L.push(`${c}   ${pad(s.name, nw)} : ${t.cond || '1'} -> ${nameOf(m, t.to)}${mo ? ` / ${mo}` : ''}${never.has(t.id) ? '   (never taken)' : ''}`);
    }
    const st = an.states.find((x) => x.id === s.id);
    if (!ts(s.id).length) L.push(`${c}   ${pad(s.name, nw)} : (no transition: stays in ${s.name})`);
    else if (st.stay.count) L.push(`${c}   ${pad(s.name, nw)} : otherwise -> ${s.name} (stays)`);
  }
  L.push(rule);
  L.push('');

  // ---- per state logic
  // next-state chain: [{ cond, t }], until an always-true transition (the else of the chain)
  const chainOf = (s) => {
    const chain = [];
    let otherwise = null;
    for (const t of ts(s.id)) {
      if (!t.cond) { otherwise = t; break; }
      chain.push({ cond: coderN.cond(t.cond), t });
    }
    return { chain, otherwise };
  };
  const mooreLines = (s) => sortedOutputs(m, s.outputs).map(([o, v]) => asg(o.name, v));
  const mealyLines = (t) => sortedOutputs(m, t.outputs).map(([o, v]) => asg(o.name, v));
  const nextStmts = (s, withMealy) => {
    const { chain, otherwise } = chainOf(s);
    const body = (t) => [setState(t.to), ...(withMealy ? mealyLines(t) : [])];
    if (!chain.length && !otherwise) return [];
    if (!chain.length) return body(otherwise);
    const out = [];
    printIf(chain.map((b) => ({ cond: b.cond, body: body(b.t) })), 0, lang, out, otherwise ? body(otherwise) : null);
    return out;
  };
  // Mealy outputs alone (3-process style): the branches with outputs; earlier branches without
  // outputs are kept (empty) only when their conditions can overlap a later one
  const mealyStmts = (s) => {
    const all = ts(s.id);
    const last = all.map((t) => Object.keys(t.outputs).length > 0).lastIndexOf(true);
    if (last < 0) return [];
    const st = an.states.find((x) => x.id === s.id);
    const ids = new Set(all.slice(0, last + 1).map((t) => t.id));
    const overlapping = st.overlaps.some((o) => ids.has(o.a) && ids.has(o.b));
    const use = all.slice(0, last + 1).filter((t) => overlapping || Object.keys(t.outputs).length);
    const chain = [];
    let otherwise = null;
    for (const t of use) {
      if (!t.cond) { otherwise = t; break; }
      chain.push({ cond: coderO.cond(t.cond), body: mealyLines(t) });
    }
    if (!chain.length) return otherwise ? mealyLines(otherwise) : [];
    const out = [];
    printIf(chain, 0, lang, out, otherwise ? mealyLines(otherwise) : null);
    return out;
  };

  const rstOn = m.reset.active === 'high' ? '1' : '0';
  const sens = (coder) => [...m.inputs.map((i) => i.name).filter((n) => coder.reads.has(n))];
  const emitCase = (I, items, others) => {
    const out = [];
    if (V) {
      out.push(`${I}case state_reg is`);
      for (const [s, body] of items) {
        out.push(`${I}    when ${encById.get(s.id).constName} =>`);
        if (body.length) for (const l of body) out.push(`${I}        ${l}`);
        else out.push(`${I}        null;`);
      }
      out.push(`${I}    when others =>`);
      out.push(`${I}        ${others || 'null;'}`);
      out.push(`${I}end case;`);
    } else {
      out.push(`${I}case (state_reg)`);
      for (const [s, body] of items) {
        const cn = encById.get(s.id).constName;
        if (!body.length) { out.push(`${I}    ${cn}: ;`); continue; }
        if (body.length === 1) { out.push(`${I}    ${cn}: ${body[0]}`); continue; }
        out.push(`${I}    ${cn}: begin`);
        for (const l of body) out.push(`${I}        ${l}`);
        out.push(`${I}    end`);
      }
      out.push(`${I}    default: ${others || ';'}`);
      out.push(`${I}endcase`);
    }
    return out;
  };

  // bodies first (they fill the sensitivity lists)
  const nextItems = states.map((s) => [s, two ? [...mooreLines(s), ...nextStmts(s, true)] : nextStmts(s, false)]);
  const outItems = two ? [] : states.map((s) => [s, [...mooreLines(s), ...mealyStmts(s)]]).filter(([, b]) => b.length);
  const resetState = encById.get(m.initial).constName;
  const defaults = m.outputs.map((o) => asg(o.name, o.default));

  if (V) {
    const typ = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
    L.push('library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '');
    L.push(`entity ${m.name} is`, '    port (');
    const ports = [[m.clock, 'in ', 'std_logic'], [m.reset.name, 'in ', 'std_logic'],
      ...m.inputs.map((p) => [p.name, 'in ', typ(p.width)]), ...m.outputs.map((p) => [p.name, 'out', typ(p.width)])];
    const pw = Math.max(...ports.map((p) => p[0].length));
    ports.forEach((p, i) => L.push(`        ${pad(p[0], pw)} : ${p[1]} ${p[2]}${i < ports.length - 1 ? ';' : ''}`));
    L.push('    );', `end entity ${m.name};`, '', `architecture rtl of ${m.name} is`, '', '    -- state encoding');
    if (m.encoding === 'enum') L.push(`    type state_t is (${enc.map((e) => e.constName).join(', ')});`);
    else {
      L.push(`    subtype state_t is std_logic_vector(${W - 1} downto 0);`);
      const cw = Math.max(...enc.map((e) => e.constName.length));
      for (const e of enc) L.push(`    constant ${pad(e.constName, cw)} : state_t := "${e.bits}";`);
    }
    L.push('', `    signal state_reg  : state_t := ${resetState};   -- present state`, '    signal state_next : state_t;                -- next state');
    if (m.encoding !== 'enum') L.push('', '    attribute fsm_encoding : string;', '    attribute fsm_encoding of state_reg : signal is "user";');
    L.push('', 'begin', '');
    L.push('    -- ------------------------------------------------------------------ state register');
    if (m.reset.sync) {
      L.push(`    state_register : process (${m.clock})`, '    begin', `        if rising_edge(${m.clock}) then`,
        `            if ${m.reset.name} = '${rstOn}' then`, `                state_reg <= ${resetState};`, '            else',
        '                state_reg <= state_next;', '            end if;', '        end if;');
    } else {
      L.push(`    state_register : process (${m.clock}, ${m.reset.name})`, '    begin', `        if ${m.reset.name} = '${rstOn}' then`,
        `            state_reg <= ${resetState};`, `        elsif rising_edge(${m.clock}) then`, '            state_reg <= state_next;', '        end if;');
    }
    L.push('    end process state_register;', '');
    const label = two ? 'fsm_logic' : 'next_state_logic';
    L.push(`    -- ------------------------------------------------------------------ ${two ? 'next-state and output logic' : 'next-state logic'}`);
    L.push(`    ${label} : process (${['state_reg', ...sens(coderN)].join(', ')})`, '    begin');
    L.push('        state_next <= state_reg;   -- no transition taken: stay in the present state');
    if (two && defaults.length) { L.push('        -- default output values (every output is assigned on every path: no latches)'); for (const d of defaults) L.push(`        ${d}`); }
    L.push(...emitCase('        ', nextItems, `state_next <= ${resetState};`));
    L.push(`    end process ${label};`);
    if (!two && m.outputs.length) {
      L.push('', '    -- ------------------------------------------------------------------ output logic');
      L.push(`    output_logic : process (${['state_reg', ...sens(coderO)].join(', ')})`, '    begin');
      L.push('        -- default output values (every output is assigned on every path: no latches)');
      for (const d of defaults) L.push(`        ${d}`);
      L.push(...emitCase('        ', outItems, null));
      L.push('    end process output_logic;');
    }
    L.push('', 'end architecture rtl;', '');
  } else {
    const vec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
    L.push(`module ${m.name} (`);
    const vw = Math.max(0, ...[...m.inputs, ...m.outputs].map((p) => vec(p.width).length));
    const pl = [`    input  wire ${pad('', vw)}${m.clock}`, `    input  wire ${pad('', vw)}${m.reset.name}`,
      ...m.inputs.map((p) => `    input  wire ${pad(vec(p.width), vw)}${p.name}`),
      ...m.outputs.map((p) => `    output reg  ${pad(vec(p.width), vw)}${p.name}`)];
    L.push(pl.map((l, i) => l + (i < pl.length - 1 ? ',' : '')).join('\n'), ');', '');
    L.push('    // ---------------------------------------------------------------- state encoding');
    const cw = Math.max(...enc.map((e) => e.constName.length));
    for (const e of enc) L.push(`    localparam ${vec(W)}${pad(e.constName, cw)} = ${W}'b${e.bits};`);
    L.push('', `    reg ${vec(W)}state_reg = ${resetState};   // present state`);
    if (m.encoding !== 'enum') L.push('    // synthesis attribute fsm_encoding of state_reg is user');
    L.push(`    reg ${vec(W)}state_next;              // next state`, '');
    L.push('    // ---------------------------------------------------------------- state register');
    const edge = m.reset.sync ? `posedge ${m.clock}` : `posedge ${m.clock} or ${m.reset.active === 'high' ? 'posedge' : 'negedge'} ${m.reset.name}`;
    L.push(`    always @(${edge}) begin`, `        if (${m.reset.active === 'high' ? m.reset.name : `!${m.reset.name}`}) begin`,
      `            state_reg <= ${resetState};`, '        end else begin', '            state_reg <= state_next;', '        end', '    end', '');
    L.push(`    // ---------------------------------------------------------------- ${two ? 'next-state and output logic' : 'next-state logic'}`);
    L.push('    always @(*) begin', '        state_next = state_reg;   // no transition taken: stay in the present state');
    if (two && defaults.length) { L.push('        // default output values (every output is assigned on every path: no latches)'); for (const d of defaults) L.push(`        ${d}`); }
    L.push(...emitCase('        ', nextItems, `state_next = ${resetState};`));
    L.push('    end');
    if (!two && m.outputs.length) {
      L.push('', '    // ---------------------------------------------------------------- output logic');
      L.push('    always @(*) begin', '        // default output values (every output is assigned on every path: no latches)');
      for (const d of defaults) L.push(`        ${d}`);
      L.push(...emitCase('        ', outItems, null));
      L.push('    end');
    }
    L.push('', 'endmodule', '');
  }
  return { lang, filename: `${m.name}.${V ? 'vhd' : 'v'}`, code: L.join('\n') };
}
