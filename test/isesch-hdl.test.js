// The HDL of ISE library symbols with no Silinx twin (#405: core/isesch-hdl.js out of core/isesch.js): a gate with
// an inverted input, a flip-flop with reset and enable, a multiplexer with enable, a 4-bit counter, a decoder, a
// toggle flip-flop and a comparator, each one's template wrapped in a module of its pins: compiled and elaborated
// with no error or warning, in VHDL and Verilog; a name with no template, none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libTemplate } from '../core/isesch-hdl.js';
import { compile, elaborate } from '../core/compile.js';

const P = p => `p_${p.toLowerCase()}`, T = s => `t_${s}`, W = () => 1;
// a module of the template's pins: those it assigns are outputs, the others inputs
function wrap(sym, lang) {
  const { code, decls = [] } = libTemplate(sym, () => true)(lang, P, T, W);
  const pins = [...new Set(code.match(/\bp_\w+/g))];
  const outs = new Set(pins.filter(p => new RegExp(lang === 'vhdl' ? `(^|\\n)${p} <=` : `assign ${p} =`).test(code)));
  if (lang === 'vhdl') {
    const ports = pins.map(p => `${p} : ${outs.has(p) ? 'out' : 'in'} std_logic`).join('; ');
    return `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;\nentity m is port (${ports}); end;\narchitecture a of m is\n${decls.join('\n')}\nbegin\n${code}\nend;\n`;
  }
  const ports = pins.map(p => `${outs.has(p) ? 'output' : 'input'} ${p}`).join(', ');
  return `module m(${ports});\n${decls.join('\n')}\n${code}\nendmodule\n`;
}

test('#405 ISE library HDL: each template in a module of its pins, compiled and elaborated, no diagnostic', () => {
  for (const sym of ['and3b1', 'fdre', 'm2_1e', 'cb4ce', 'd2_4e', 'ftce', 'compm4']) {
    for (const lang of ['vhdl', 'verilog']) {
      const text = wrap(sym, lang);
      const lib = compile([{ path: lang === 'vhdl' ? 'm.vhd' : 'm.v', lang, text }]);
      assert.deepEqual(lib.errors.map(e => `${e.severity}: ${e.message}`), [], `${sym} ${lang}\n${text}`);
      assert.deepEqual(elaborate(lib, 'm').diags.map(e => `${e.severity}: ${e.message}`), [], `${sym} ${lang}`);
    }
  }
  assert.equal(libTemplate('nothing_like_it', () => true), null);
});
