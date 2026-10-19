// UI: the stimuli drawn on the waveforms of ISim (#336), as the HDL Bencher of the old ISE — a module simulated
// without a test bench: Edit Stimuli, its timing (the clock found), clicks on the cycles of the inputs (the
// simulation runs again at once), a bus value typed in, an expected output wrong (the mismatch in red, in the
// bar and the console) then filled in from the simulation, saved in the project and run again when ISim opens,
// Save as Test Bench (a simulation source that passes), and the texts in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const CTR = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity ctr is
  port (clk, rst, en : in std_logic; d : in std_logic_vector(3 downto 0); load : in std_logic; q : out std_logic_vector(3 downto 0); tc : out std_logic);
end ctr;
architecture rtl of ctr is
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0'); elsif load = '1' then c <= unsigned(d); elsif en = '1' then c <= c + 1; end if;
    end if;
  end process;
  q <= std_logic_vector(c);
  tc <= '1' when c = "1111" else '0';
end rtl;
`;
const DOC = '.doc:not([hidden])';
const simTime = (page, ps) => page.waitFor((re) => new RegExp(re).test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || '') && !window.Silinx.active.view.state.running, [`Sim Time: ${ps} ps`], { what: `sim time ${ps} ps`, timeout: 20000 });
// client point of time t (ps) on the wave canvas, in row `row`
const waveAt = (page, t, row) => page.eval((tt, r) => {
  const s = window.Silinx.active.view.state, c = document.querySelector('.doc:not([hidden]) .isim-waves').getBoundingClientRect();
  return { x: c.left + (tt - s.t0) / s.scale, y: c.top + 30 + r * 20 + 10 - s.scrollY };
}, t, row);
const rowOf = (page, name) => page.eval((n) => window.Silinx.active.view.state.rows.findIndex((r) => r.sig?.name === n), name);
const stim = (page) => page.eval(() => JSON.parse(JSON.stringify(window.Silinx.active.view.state.stim.m)));
const status = (page) => page.eval((d) => document.querySelector(`${d} .isim-stim-st`).textContent, DOC);
const value = (page, name) => page.eval((n) => { const s = window.Silinx.active.view.state.rows.find((r) => r.sig?.name === n).sig; return [...Array(s.val.w)].map((_, i) => { const b = BigInt(s.val.w - 1 - i); return (s.val.x >> b) & 1n ? ((s.val.v >> b) & 1n ? 'z' : 'x') : String((s.val.v >> b) & 1n); }).join(''); }, name);
const consoleText = (page) => page.eval((d) => document.querySelector(`${d} .isim-console`).innerText, DOC);
const saved = async (pj) => (await env.server.api('GET', `/api/projects/${pj}`)).stimuli?.ctr;
// a click on cycle k of a port (P = the cycle in ps)
const clickCycle = async (page, name, k, P) => page.click(await waveAt(page, k * P + P / 2, await rowOf(page, name)));
// (a new ISim window: not the one open before)
const simulate = async (page, mod) => {
  await page.eval(() => { window.__oldView = window.Silinx.active?.view || null; });
  await page.treeRow('#hier', mod);
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor((m) => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && window.Silinx.active.view !== window.__oldView
    && document.querySelector('.doc:not([hidden]) .isim-title-text')?.textContent === m, [mod], { what: `ISim of ${mod}`, timeout: 20000 });
};

uiTest('ISim stimuli (#336): Edit Stimuli, timing, clicks on the inputs, a bus value, expected outputs checked and filled in, saved, Save as Test Bench, Portuguese', E, async (page) => {
  await makeProject(env, { name: 'StimPj', top: 'ctr', files: { 'src/ctr.vhd': CTR } });
  await page.openProject('StimPj');
  await page.click('input[name=view][value=sim]');
  await simulate(page, 'ctr');
  await simTime(page, '1,000,000');

  // ---- Edit Stimuli: the timing dialog, its clock found (clk); 8 cycles of 20 ns
  await page.click(`${DOC} .isim-toolbar .tb-btn[title^="Edit Stimuli"]`);
  await page.waitFor((d) => document.querySelector(`${d} .isim-stim-dlg [name=cycles]`), [DOC], { what: 'Stimulus Timing' });
  assert.deepEqual(await page.eval((d) => { const q = (n) => document.querySelector(`${d} .isim-stim-dlg [name=${n}]`); return [q('clock').value, [...q('clock').options].map((o) => o.value), q('period').value, q('step').disabled]; }, DOC),
    ['clk', ['', 'clk', 'rst', 'en', 'load'], '20', true]);
  await page.fill(`${DOC} .isim-stim-dlg [name=cycles]`, '8');
  await page.click(`${DOC} .isim-stim-dlg [data-a=ok]`);
  await simTime(page, '160,000');
  assert.equal(await status(page), '8 cycles (clock clk, period 20 ns): no expected outputs');
  assert.ok(!await page.eval((d) => document.querySelector(`${d} .isim-stimbar`).hidden, DOC));
  const P = 20000;

  // ---- clicks: en from cycle 2 (0 → 1, up to the end); rst 1 in cycle 0 then 0 from cycle 1 (from cycle 1: 1 → Z → X → 0);
  // the simulation runs again after each
  await clickCycle(page, 'en', 2, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.en.join('') === '00111111', [], { what: 'en painted' });
  await simTime(page, '160,000');
  await clickCycle(page, 'rst', 0, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.rst.join('') === '11111111', [], { what: 'rst 1' });
  await clickCycle(page, 'rst', 1, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.rst.join('') === '1ZZZZZZZ', [], { what: 'rst Z from cycle 1' });
  await clickCycle(page, 'rst', 1, P);
  await clickCycle(page, 'rst', 1, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.rst.join('') === '10000000', [], { what: 'rst 1 then 0' });
  await simTime(page, '160,000');
  // reset in cycle 0, then counting in cycles 2..7: 6
  assert.equal(await value(page, 'q'), '0110');
  // ---- a bus: d = h9 from cycle 4, load 1 in cycle 4 only: q = 9 + 3 = 12 at the end
  await clickCycle(page, 'd', 4, P);
  await page.waitFor((d) => document.querySelector(`${d} .isim-stim-dlg [name=value]`), [DOC], { what: 'Input Value' });
  assert.deepEqual(await page.eval((d) => [document.querySelector(`${d} .isim-dlg-title`).textContent, document.querySelector(`${d} .isim-stim-dlg [name=sig]`).value, document.querySelector(`${d} .isim-stim-dlg [name=k]`).value], DOC), ['Input Value✕', 'd', '4']);
  await page.fill(`${DOC} .isim-stim-dlg [name=value]`, '2z0q');
  await page.click(`${DOC} .isim-stim-dlg [data-a=ok]`);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .isim-stim-dlg .isim-dlg-err`).textContent, DOC), "'2z0q' is not a value (bits 0 1 Z X, h… hexadecimal or d… decimal)");
  await page.fill(`${DOC} .isim-stim-dlg [name=value]`, 'h9');
  await page.click(`${DOC} .isim-stim-dlg [data-a=ok]`);
  await clickCycle(page, 'load', 4, P);
  await clickCycle(page, 'load', 5, P);
  await clickCycle(page, 'load', 5, P);
  await clickCycle(page, 'load', 5, P);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.load.join('') === '00001000', [], { what: 'load in cycle 4' });
  await simTime(page, '160,000');
  assert.equal(await value(page, 'q'), '1100');
  const m = await stim(page);
  assert.deepEqual([m.inputs.d.join(' '), m.clock, m.cycles], ['0000 0000 0000 0000 1001 1001 1001 1001', 'clk', 8]);

  // ---- expected: tc 1 in cycle 7 (wrong: q is 12) → a mismatch, then Fill Expected Outputs → all right.
  // The saves of the project before Fill held 1 s on their way (a loaded machine, #593): the save of Fill must
  // still be the one written last (the saves one at a time, in order), not overwritten by an older one
  await page.eval(() => {
    const f = window.fetch;
    window.fetch = async (url, o) => {
      if (o?.method === 'PUT' && /\/api\/projects\/StimPj$/.test(String(url)) && JSON.parse(o.body).stimuli?.ctr?.expected?.q?.[7] !== '1100') await new Promise((r) => setTimeout(r, 1000));
      return f(url, o);
    };
    window.__fetch = f;
  });
  await clickCycle(page, 'tc', 7, P);
  await clickCycle(page, 'tc', 7, P);
  await page.waitFor((d) => /1 mismatch\(es\)$/.test(document.querySelector(`${d} .isim-stim-st`).textContent), [DOC], { what: 'the mismatch' });
  assert.ok(await page.eval((d) => document.querySelector(`${d} .isim-stim-st`).classList.contains('bad'), DOC));
  assert.deepEqual(await page.eval(() => window.Silinx.active.view.state.stim.bad), [{ port: 'tc', k: 7, expected: '1', got: '0' }]);
  await page.click(`${DOC} .isim-stimbar [data-stim=fill]`);
  await page.waitFor((d) => /expected outputs OK$/.test(document.querySelector(`${d} .isim-stim-st`).textContent), [DOC], { what: 'expected OK' });
  assert.deepEqual((await stim(page)).expected.q, ['0000', '0000', '0001', '0010', '1001', '1010', '1011', '1100']);
  assert.match(await consoleText(page), /Stimuli: the expected outputs filled in from the simulation/);
  // saved in the project
  await page.waitFor(async () => { const r = await fetch('/api/projects/StimPj'); const j = await r.json(); return j.stimuli?.ctr?.expected?.q?.[7] === '1100'; }, [], { what: 'stimuli saved' });
  assert.deepEqual((await saved('StimPj')).inputs.en, ['0', '0', '1', '1', '1', '1', '1', '1']);
  // (no save left on its way: the one written last is Fill's)
  await new Promise((r) => setTimeout(r, 1500));
  assert.deepEqual((await saved('StimPj')).expected.q, ['0000', '0000', '0001', '0010', '1001', '1010', '1011', '1100']);
  await page.eval(() => { window.fetch = window.__fetch; });

  // ---- in Portuguese: the bar and the timing dialog
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const texts = () => page.eval((d) => window.__uiTexts(document.querySelector(`${d} .isim-stimbar`)).concat(window.__uiTexts(document.querySelector(`${d} .isim-toolbar`))), DOC);
  const en = await texts();
  await setLang('pt');
  const pt = await texts();
  assert.deepEqual(untranslated(en, pt), []);
  assert.ok(pt.includes('Preencher Saídas Esperadas') && pt.includes('8 ciclos (relógio clk, período 20 ns): saídas esperadas certas'), pt.join(' | '));
  await page.click(`${DOC} .isim-stimbar [data-stim=timing]`);
  await page.waitFor((d) => document.querySelector(`${d} .isim-stim-dlg`), [DOC], { what: 'timing dialog' });
  await setLang('en');
  const enD = await page.eval((d) => window.__uiTexts(document.querySelector(`${d} .isim-stim-dlg`)), DOC);
  await setLang('pt');
  const ptD = await page.eval((d) => window.__uiTexts(document.querySelector(`${d} .isim-stim-dlg`)), DOC);
  assert.deepEqual(untranslated(enD, ptD, [/^@?(clk|rst|en|load)$/]), []);
  assert.ok(ptD.includes('Temporização dos Estímulos'), ptD.join(' | '));
  await setLang('en');
  await page.click(`${DOC} .isim-stim-dlg [data-a=cancel]`);

  // ---- ISim opened again: the saved stimuli run at once
  await simulate(page, 'ctr');
  await simTime(page, '160,000');
  assert.equal(await value(page, 'q'), '1100');

  // ---- Save as Test Bench: tb_ctr.vhd, a simulation source; simulated, it passes
  await page.click(`${DOC} .isim-toolbar .tb-btn[title^="Edit Stimuli"]`);
  await page.click(`${DOC} .isim-stimbar [data-stim=save]`);
  await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay')].pop()?.querySelector('input'), [], { what: 'test bench name' });
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('input').value), 'tb_ctr');
  await page.click('.dlg-overlay .dlg-buttons button', { text: 'OK' });
  await page.waitFor(async () => (await (await fetch('/api/projects/StimPj')).json()).files.some((f) => f.path === 'src/tb_ctr.vhd' && f.role === 'sim'), [], { what: 'tb_ctr.vhd, simulation', timeout: 20000 });
  await simulate(page, 'tb_ctr');
  await page.waitFor((d) => /TEST PASSED: 8 vector/.test(document.querySelector(`${d} .isim-console`)?.innerText || ''), [DOC], { what: 'TEST PASSED', timeout: 20000 });
  assert.doesNotMatch(await consoleText(page), /Error|Warning/);
  assert.deepEqual(page.dialogs, []);
});

// a test bench simulated: Edit Stimuli draws its unit under test's inputs (its signals forced over what the bench
// drives), the stimuli saved for the test bench; Save as Test Bench writes another one for the module
const TB = `library ieee; use ieee.std_logic_1164.all;
entity tb_ctr is end tb_ctr;
architecture sim of tb_ctr is
  signal clk, rst, en, load : std_logic := '0';
  signal d, q : std_logic_vector(3 downto 0);
  signal tc : std_logic;
begin
  uut : entity work.ctr port map (clk => clk, rst => rst, en => en, d => d, load => load, q => q, tc => tc);
  clk <= not clk after 5 ns;
  d <= "0000";
end sim;
`;
uiTest('ISim stimuli (#336) of a test bench: the inputs of its unit under test, forced over the bench, saved for the bench', E, async (page) => {
  await makeProject(env, { name: 'StimTb', top: 'ctr', files: { 'src/ctr.vhd': CTR, 'sim/tb_ctr.vhd': TB }, roles: { 'sim/tb_ctr.vhd': 'sim' } });
  await page.openProject('StimTb');
  await page.click('input[name=view][value=sim]');
  await simulate(page, 'tb_ctr');
  await simTime(page, '1,000,000');
  await page.click(`${DOC} .isim-toolbar .tb-btn[title^="Edit Stimuli"]`);
  await page.waitFor((d) => document.querySelector(`${d} .isim-stim-dlg [name=cycles]`), [DOC], { what: 'Stimulus Timing' });
  // the unit under test's inputs (ctr: clk rst en d load), its clock found
  assert.deepEqual(await page.eval((d) => { const q = (n) => document.querySelector(`${d} .isim-stim-dlg [name=${n}]`); return [q('clock').value, [...q('clock').options].map((o) => o.value)]; }, DOC), ['clk', ['', 'clk', 'rst', 'en', 'load']]);
  assert.match(await page.eval((d) => document.querySelector(`${d} .isim-stim-dlg .isim-dlg-hint`).textContent, DOC), /^The inputs of ctr \(tb_ctr\.uut\) as a grid of cycles/);
  await page.fill(`${DOC} .isim-stim-dlg [name=cycles]`, '6');
  await page.click(`${DOC} .isim-stim-dlg [data-a=ok]`);
  await simTime(page, '120,000');
  // en from cycle 1 (the bench leaves it 0): q counts 5; the clock is the stimuli's (period 20 ns), not the bench's 10 ns
  await clickCycle(page, 'en', 1, 20000);
  await page.waitFor(() => window.Silinx.active.view.state.stim.m.inputs.en.join('') === '011111', [], { what: 'en painted' });
  await simTime(page, '120,000');
  assert.equal(await value(page, 'q'), '0101');
  await page.waitFor(async () => { const j = await (await fetch('/api/projects/StimTb')).json(); return j.stimuli?.tb_ctr?.inputs?.en?.[1] === '1' && !j.stimuli?.ctr; }, [], { what: 'saved for tb_ctr' });
  // Save as Test Bench: for ctr, tb_ctr exists: tb_ctr_2
  await page.click(`${DOC} .isim-stimbar [data-stim=fill]`);
  await page.click(`${DOC} .isim-stimbar [data-stim=save]`);
  await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay')].pop()?.querySelector('input'), [], { what: 'test bench name' });
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('input').value), 'tb_ctr_2');
  await page.click('.dlg-overlay .dlg-buttons button', { text: 'OK' });
  await page.waitFor(async () => (await (await fetch('/api/projects/StimTb')).json()).files.some((f) => f.path === 'src/tb_ctr_2.vhd' && f.role === 'sim'), [], { what: 'tb_ctr_2.vhd', timeout: 20000 });
  await simulate(page, 'tb_ctr_2');
  await page.waitFor((d) => /TEST PASSED: 6 vector/.test(document.querySelector(`${d} .isim-console`)?.innerText || ''), [DOC], { what: 'TEST PASSED', timeout: 20000 });
  assert.deepEqual(page.dialogs, []);
});
