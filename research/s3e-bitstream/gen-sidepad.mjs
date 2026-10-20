// #641: designs whose side clock pads (the GCLK pins of the left and right sides, in the CLK_PCI I/O tiles) each drive
// a global buffer of their side on the dedicated path (IOIS_Yk -> IOIS_Fk_B3, then the side clock tile's input),
// to be implemented by ISE from HDL (ise-impl.sh, impl-remote.sh) and measured with gen-pipdrop.mjs. The pads and the
// side buffers each reaches come from the device's graph (route.js bufgReach, every switch allowed); round r gives each
// pad its r-th buffer, no buffer twice in a round. Each buffer clocks a counter, one output bit each.
//   PART=xc3s500efg320-4 node gen-sidepad.mjs outdir      (folders s0, s1, …)
import fs from 'node:fs';
import { loadDeviceCache } from '../../core/fpga/device-node.js';
import { bufgReach } from '../../core/fpga/route.js';
import { deviceSites } from '../../core/fpga/place.js';
import { PART } from './db.mjs';

const out = process.argv[2];
const dev = loadDeviceCache(PART);
const side = s => /^BUFGMUX_X[03]Y/.test(s);
const bonded = deviceSites(dev).pads;   // the package's pins
const reach = new Map();
for (const t of ['IOB', 'IBUF', 'DIFFM', 'DIFFS', 'DIFFMI', 'DIFFSI']) for (const s of dev.sites(t)) {
  if (!bonded.has(s.name)) continue;
  const b = bufgReach(dev, s.name, 'I').filter(side);
  if (b.length) reach.set(s.name, b.sort());
}
const pads = [...reach.keys()].sort();
const rounds = [];
for (let r = 0; r < Math.max(...reach.values().map(v => v.length)); r++) {
  const used = new Set(), round = [];
  for (const p of pads) { const b = reach.get(p).find((x, i) => i >= r && !used.has(x)) ?? reach.get(p).find(x => !used.has(x)); if (b && !rounds.some(rd => rd.some(([q, c]) => q === p && c === b))) { used.add(b); round.push([p, b]); } }
  if (round.length) rounds.push(round);
}
rounds.forEach((round, r) => {
  const n = round.length;
  const vhd = `-- ${PART} round ${r}: ${n} side clock pads, each on a side global buffer on its dedicated path (#641)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in std_logic_vector(${n - 1} downto 0);
        q   : out std_logic_vector(${n - 1} downto 0));
end top;

architecture rtl of top is
  signal ci, gc : std_logic_vector(${n - 1} downto 0);
${round.map((_, k) => `  signal cnt${k} : unsigned(7 downto 0) := (others => '0');`).join('\n')}
begin
${round.map((_, k) => `  u_ib${k} : IBUFG port map (I => clk(${k}), O => ci(${k}));
  u_bg${k} : BUFG port map (I => ci(${k}), O => gc(${k}));
  process (gc(${k})) begin if rising_edge(gc(${k})) then cnt${k} <= cnt${k} + 1; end if; end process;
  q(${k}) <= cnt${k}(7);`).join('\n')}
end rtl;
`;
  const ucf = round.flatMap(([p, b], k) => [`NET "clk<${k}>" LOC = "${p}" ;`, `INST "u_bg${k}" LOC = "${b}" ;`]).join('\n') + '\n';
  fs.mkdirSync(`${out}/s${r}`, { recursive: true });
  fs.writeFileSync(`${out}/s${r}/top.vhd`, vhd);
  fs.writeFileSync(`${out}/s${r}/top.ucf`, ucf);
  console.log(`s${r}: ${round.map(([p, b]) => `${p}->${b}`).join(' ')}`);
});
