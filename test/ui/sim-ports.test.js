// UI: the wave window of a simulation as it opens (#1519): a design module simulated with no test bench gets its inputs
// and outputs only, in the port order (its internal signals added from the Objects panel, Add to Wave Window); a test
// bench (no ports) gets its top-level signals, as ISE adds them.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const CTR = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity ctr is
  port (clk, rst : in std_logic; q : out std_logic_vector(3 downto 0); en : in std_logic; tc : out std_logic);
end ctr;
architecture rtl of ctr is
  signal c : unsigned(3 downto 0) := (others => '0');
  signal full : std_logic;
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0'); elsif en = '1' then c <= c + 1; end if;
    end if;
  end process;
  full <= '1' when c = "1111" else '0';
  q <= std_logic_vector(c);
  tc <= full;
end rtl;
`;
const TB = `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture sim of tb is
  signal clk : std_logic := '0';
  signal rst, en, tc : std_logic := '0';
  signal q : std_logic_vector(3 downto 0);
begin
  u : entity work.ctr port map (clk => clk, rst => rst, q => q, en => en, tc => tc);
  clk <= not clk after 5 ns;
end sim;
`;
const DOC = '.doc:not([hidden])';
const rows = (page) => page.eval(() => window.Silinx.active.view.state.rows.map((r) => (r.kind === 'div' ? `-- ${r.name}` : r.sig.path.replace(/\./g, '/'))));
const menuItem = (page, label) => page.click('.isim-menu-item', { text: label });
const simulate = async (page, mod) => {
  await page.eval(() => { window.__oldView = window.Silinx.active?.view || null; });
  await page.treeRow('#hier', mod);
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor((m) => /^isim:/.test(window.Silinx.active?.id || '') && window.Silinx.active.view && window.Silinx.active.view !== window.__oldView
    && document.querySelector('.doc:not([hidden]) .isim-title-text')?.textContent === m, [mod], { what: `ISim of ${mod}`, timeout: 20000 });
  await page.waitFor(() => /Sim Time: 1,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || '') && !window.Silinx.active.view.state.running, [], { what: 'initial 1 us run', timeout: 20000 });
};

uiTest('#1519 Simulate a design module with no test bench: the wave window gets its ports only, in their order; more from Objects; a test bench its signals', E, async (page) => {
  await makeProject(env, { name: 'PortsPj', top: 'ctr', files: { 'src/ctr.vhd': CTR } });
  await page.openProject('PortsPj');
  await page.setView('sim');
  await simulate(page, 'ctr');
  // the inputs and outputs, in the port order: not the internal signals c and full
  assert.deepEqual(await rows(page), ['ctr/clk', 'ctr/rst', 'ctr/q', 'ctr/en', 'ctr/tc']);
  // the Objects panel lists them all, the ports checked
  await page.showSide();
  const objects = () => page.eval((d) => [...document.querySelectorAll(`${d} .isim-objs tbody tr`)].map((tr) => [tr.querySelector('.c-name').textContent, tr.querySelector('input').checked]), DOC);
  assert.deepEqual(await objects(), [['clk', true], ['rst', true], ['q', true], ['en', true], ['tc', true], ['c', false], ['full', false]]);
  // Add to Wave Window from the Objects panel: c at the end, with its waveform
  await page.rightClick(`${DOC} .isim-objs tbody tr`, { index: 5 });
  await menuItem(page, 'Add to Wave Window');
  assert.deepEqual(await rows(page), ['ctr/clk', 'ctr/rst', 'ctr/q', 'ctr/en', 'ctr/tc', 'ctr/c']);
  assert.ok(await page.eval(() => window.Silinx.active.view.state.rows.at(-1).sig.wave.t.length) >= 1, 'c has a waveform');
  assert.deepEqual((await objects())[5], ['c', true]);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);

  // a test bench (no ports): its top-level signals, as before
  await makeProject(env, { name: 'PortsTb', top: 'ctr', files: { 'src/ctr.vhd': CTR, 'sim/tb.vhd': TB }, roles: { 'sim/tb.vhd': 'sim' } });
  await page.openProject('PortsTb');
  await page.setView('sim');
  await simulate(page, 'tb');
  assert.deepEqual(await rows(page), ['tb/clk', 'tb/rst', 'tb/en', 'tb/tc', 'tb/q']);
});
