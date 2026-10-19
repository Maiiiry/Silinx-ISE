// The HDL highlighter of the drawing editors' code panels (the ASM chart's and the state diagram's
// generated HDL, the schematic symbols' HDL in Symbol Information), the one copy (#489). The HDL
// editor itself highlights with CodeMirror (editor.js).
import { esc } from './dom.js';

const words = s => new Set(s.split(/\s+/));
const VHDL = words(`library use entity is port generic map in out inout end architecture of signal constant type subtype
  attribute component begin process if then elsif else case when others null for generate loop downto to with select
  wait variable function return and or not xor nand nor xnor all std_logic std_logic_vector unsigned signed integer
  rising_edge resize shift_left shift_right to_integer to_unsigned`);
const VERILOG = words(`module endmodule input output inout wire reg integer signed parameter localparam assign always
  initial posedge negedge or if else begin end case endcase default for generate endgenerate genvar`);
const BOTH = new Set([...VHDL, ...VERILOG]);
export const KEYWORDS = { vhdl: VHDL, verilog: VERILOG };

// comments; string, bit and sized literals; Verilog attributes (* … *); words
const TOKEN = /(--[^\n]*|\/\/[^\n]*)|("[^"\n]*"|'[01]'|\b\d+'[bdhoBDHO][0-9a-fA-F_]+\b)|(\(\*[^\n]*?\*\))|\b([A-Za-z_]\w*)\b/g;

/** HDL code as escaped HTML, its tokens in spans: tk-com (comments), tk-lit (literals), tk-attr
 *  (attributes), tk-kw (keywords of `lang`, 'vhdl' or 'verilog'; either's when not given) and tk-st
 *  (a state's constant, S_…). A keyword is written in lower case (the generators' style): a word
 *  starting with a capital is a name. */
export function highlightHdl(code, lang) {
  const kw = KEYWORDS[lang] || BOTH;
  const comment = lang === 'vhdl' ? '--' : lang === 'verilog' ? '//' : null;
  let out = '', last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(code))) {
    out += esc(code.slice(last, m.index));
    last = TOKEN.lastIndex;
    if (m[1] && (!comment || m[1].startsWith(comment))) out += `<span class="tk-com">${esc(m[1])}</span>`;
    else if (m[1]) { out += esc(m[1][0]); last = m.index + 1; TOKEN.lastIndex = last; }
    else if (m[2]) out += `<span class="tk-lit">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="tk-attr">${esc(m[3])}</span>`;
    else if (kw.has(m[4].toLowerCase()) && !/^[A-Z]/.test(m[4])) out += `<span class="tk-kw">${esc(m[4])}</span>`;
    else if (/^S_/.test(m[4])) out += `<span class="tk-st">${esc(m[4])}</span>`;
    else out += esc(m[4]);
  }
  return out + esc(code.slice(last));
}
