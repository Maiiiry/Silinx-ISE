// Shared by the tests of Rename Symbol and the quick fixes with drawn sources (#178, #179, #177): a
// schematic without an HDL file of its own that instances an HDL module, and that module.
// Not a test file itself (the runner only picks up *.test.js).
import { newDoc, normalizeDoc, symbolPins } from '../core/schdoc.js';

export const COUNTER = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter is
  port (clk : in std_logic;
        q   : out std_logic_vector(3 downto 0));
end counter;

architecture rtl of counter is
  signal cnt : unsigned(3 downto 0) := (others => '0');
begin
  process (clk)
  begin
    if rising_edge(clk) then
      cnt <= cnt + 1;
    end if;
  end process;
  q <= std_logic_vector(cnt);
end rtl;
`;
export const COUNTER_PORTS = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'q', dir: 'out', width: 4 }];

/** A schematic `name` (VHDL) of one instance u1 of `module` (its ports), every pin to a port of the
 *  sheet (q to `leds`). No generatedFile: its HDL is made in memory (core/view-hdl.js). */
export function schematicOf(name, module, ports = COUNTER_PORTS) {
  const doc = newDoc(name, 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'module', x: 300, y: 100, rot: 0, mirror: false, name: 'u1', params: { module, ports } });
  for (const p of symbolPins(normalizeDoc({ ...doc }).symbols[0], { [module]: { name: module, ports } })) {
    const at = { x: p.x + (p.dir === 'in' ? -60 : 60), y: p.y };
    doc.ports.push({ id: `P${doc.ports.length + 1}`, name: p.name === 'q' ? 'leds' : p.name, dir: p.dir, width: p.width || 1, x: at.x, y: at.y });
    doc.wires.push({ id: `W${doc.wires.length + 1}`, points: [at, { x: p.x, y: p.y }] });
  }
  return doc;
}
