// The HDL editor's completion (#405: out of createEditor in editor.js): the words offered at the cursor (the file's
// symbols, the project's modules with their instantiation templates, the language's keywords, types, functions and
// system tasks, its templates), ranked; their kind letters; a template inserted with its placeholders.
import { syntaxTree } from '@codemirror/language';
import { SNIPPETS, instTemplate } from './editor.js';

// ------------------------------------------------------------------ vocabulary
const VHDL_KW = `abs access after alias all and architecture array assert attribute begin block body buffer bus case component
configuration constant disconnect downto else elsif end entity exit file for function generate generic group guarded if impure in
inertial inout is label library linkage literal loop map mod nand new next nor not null of on open or others out package port
postponed procedure process pure range record register reject rem report return rol ror select severity signal shared sla sll sra srl
subtype then to transport type unaffected units until use variable wait when while with xnor xor`.split(/\s+/);
const VHDL_TYPES = `std_logic std_logic_vector std_ulogic std_ulogic_vector unsigned signed integer natural positive boolean bit bit_vector
time string real character`.split(/\s+/);
const VHDL_FUNCS = `rising_edge falling_edge to_unsigned to_signed to_integer resize std_logic_vector shift_left shift_right rotate_left
rotate_right conv_integer conv_std_logic_vector to_stdlogicvector now`.split(/\s+/);
const VHDL_LIBS = ['ieee', 'ieee.std_logic_1164.all', 'ieee.numeric_std.all', 'ieee.std_logic_unsigned.all', 'work', 'std.env.all'];

const VLOG_KW = `always and assign automatic begin buf case casex casez default defparam else end endcase endfunction endgenerate endmodule
endtask for forever function generate genvar if initial inout input integer localparam module nand negedge nor not or output parameter
posedge real reg repeat signed task time tri wait while wire xnor xor always_ff always_comb logic`.split(/\s+/);
const VLOG_SYS = `$display $write $monitor $strobe $finish $stop $time $realtime $random $urandom $signed $unsigned $clog2 $readmemh
$readmemb $dumpfile $dumpvars $error $warning $info $fatal`.split(/\s+/);

/** { completions, insertSnippet, renderKind } of createEditor (syms(), view(): its current values). */
export function mountCompletion(ctx) {
  const {
    lang, path, project, syms, view
  } = ctx;

  // ---- completion
  function completions(ctx) {
    const line = ctx.state.doc.lineAt(ctx.pos), text = line.text, ch = ctx.pos - line.from;
    let start = ch, end = ch, word0 = ch;
    while (start > 0 && /[\w$.]/.test(text[start - 1])) start--;
    while (end < text.length && /[\w$]/.test(text[end])) end++;
    while (word0 > 0 && /[\w$]/.test(text[word0 - 1])) word0--;
    // while typing: from the second letter of a word (or a '$'), not in a comment or a string
    if (!ctx.explicit) {
      if (ch - word0 < 2 && text[ch - 1] !== '$') return null;
      if (/comment|string/.test(syntaxTree(ctx.state).resolveInner(ctx.pos, -1).name)) return null;
    }
    const word = text.slice(start, ch);
    const lw = word.toLowerCase();
    const list = [];
    const seen = new Set();
    const push = (label, kind, detail) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      if (lw && !key.startsWith(lw) && !(lw.length >= 2 && key.includes(lw))) return;
      seen.add(key);
      list.push({ label, type: kind, detail });
    };
    const from = line.from + start, to = line.from + end;
    const snippet = (label, body, detail) => ({ label, type: 'snippet', detail, apply: v => insertSnippet(body, from, to) });
    // project symbols in this file first
    for (const s of syms().values()) push(s.name, s.kind, s.detail);
    // modules/entities of the project
    const pj = project();
    for (const m of pj?.modules || []) {
      push(m.name, 'module', `${m.lang} ${m.kind || 'module'} (${m.file})`);
      if (lw && m.name.toLowerCase().startsWith(lw)) list.push(snippet(`${m.name} — instantiate`, instTemplate(m, lang), 'instantiation template'));
    }
    if (lang === 'vhdl') {
      for (const k of VHDL_KW) push(k, 'keyword', '');
      for (const k of VHDL_TYPES) push(k, 'type', 'type');
      for (const k of VHDL_FUNCS) push(k, 'function', 'built-in');
      if (/use\s+[\w.]*$/i.test(text.slice(0, ch))) for (const k of VHDL_LIBS) push(k, 'library', '');
    } else {
      for (const k of VLOG_KW) push(k, 'keyword', '');
      for (const k of VLOG_SYS) push(k, 'system', 'system task/function');
    }
    for (const s of SNIPPETS[lang] || []) {
      if (!lw || s.name.toLowerCase().startsWith(lw) || s.name.toLowerCase().split(/[\s(]/)[0].startsWith(lw)) list.push(snippet(s.name, s.text, 'template'));
    }
    // Ranking: exact prefix, then symbols, keywords, snippets
    const rank = { port: 0, signal: 0, variable: 0, constant: 1, generic: 1, enum: 1, type: 2, function: 2, module: 2, process: 3, instance: 3, genvar: 1, keyword: 4, system: 4, library: 4, snippet: 5, task: 2 };
    list.sort((a, b) => {
      const pa = a.label.toLowerCase().startsWith(lw) ? 0 : 1, pb = b.label.toLowerCase().startsWith(lw) ? 0 : 1;
      return pa - pb || (rank[a.type] ?? 9) - (rank[b.type] ?? 9) || a.label.localeCompare(b.label);
    });
    return { from, to, options: list.slice(0, 200), filter: false };
  }

  const KIND_LETTER = { port: 'P', signal: 'S', variable: 'V', constant: 'C', generic: 'G', enum: 'E', type: 'T', function: 'f', task: 't', module: 'M', process: 'p', instance: 'I', keyword: 'k', system: '$', library: 'L', snippet: '❏', genvar: 'g' };
  function renderKind(c) {
    const k = document.createElement('span');
    k.className = `xl-hint-kind k-${c.type}`;
    k.textContent = KIND_LETTER[c.type] || '·';
    return k;
  }

  function insertSnippet(text, from, to) {
    const name = (path.split('/').pop() || 'top').replace(/\.\w+$/, '');
    let s = text.replace(/\$\{name\}/g, name);
    const baseIndent = (view().state.doc.lineAt(from).text.match(/^\s*/) || [''])[0];
    s = s.split('\n').map((l, i) => (i ? baseIndent + l : l)).join('\n');
    // placeholders ${1:text} … (the Device Primitives' templates, #792): their texts, the first one selected
    let first = null, out = '', last = 0;
    for (const m of s.matchAll(/\$\{(\d+):([^}]*)\}/g)) {
      out += s.slice(last, m.index);
      if (m[1] === '1' && !first) first = { at: out.length, len: m[2].length };
      out += m[2];
      last = m.index + m[0].length;
    }
    s = out + s.slice(last);
    const idx = s.indexOf('$0');
    s = s.replace('$0', '');
    const selection = first ? { anchor: from + first.at, head: from + first.at + first.len } : { anchor: from + (idx >= 0 ? idx : s.length) };
    view().dispatch({ changes: { from, to, insert: s }, selection, userEvent: 'input.complete', scrollIntoView: true });
  }

  return { completions, insertSnippet, renderKind };
}
