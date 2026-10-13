// UI: the schematic editor's symbols as ISE draws them: the type of a gate under it (AND2, OR3, INV…),
// no automatic instance id (XLXI_n, Un) on the sheet, a name given by the user shown (#172); the
// palette offers gates of at most 4 inputs (#171).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

uiTest('schematic: gates labelled with their type, no automatic instance ids, the user\'s names kept; no 5-input gates in the palette', E, async (page) => {
  const doc = newDoc('lbl', 'vhdl');
  const add = (type, x, y, params = {}, name) => doc.symbols.push({ id: `S${doc.symbols.length + 1}`, type, x, y, rot: 0, mirror: false, name: name || `XLXI_${doc.symbols.length + 1}`, params: { width: 1, ...params } });
  add('and2', 100, 60); add('or3', 260, 60); add('nand2b1', 420, 60); add('inv', 100, 200); add('xor2', 260, 200, { width: 4 }); add('and2', 420, 200, {}, 'my_gate'); add('fdce', 100, 300, {}, 'U7');
  await makeProject(env, { name: 'Lbl', files: { 'src/lbl.sch.json': JSON.stringify(doc) } });
  await page.openProject('Lbl');
  await page.eval(() => window.SilinxApp.openSch('src/lbl.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 7, [ED], { what: 'the symbols drawn' });
  const texts = (cls) => page.eval((ed, c) => [...document.querySelectorAll(`${ed} svg .sym .${c}`)].map((t) => t.textContent), ED, cls);
  assert.deepEqual((await texts('stype')).sort(), ['AND2', 'AND2', 'FDCE', 'INV', 'NAND2B1', 'OR3', 'XOR2']);
  assert.deepEqual(await texts('iname'), ['my_gate'], 'only the name the user gave');
  // the palette: AND4 yes, no AND5 (wider gates through Width / buses)
  const palette = await page.eval((ed) => [...document.querySelectorAll(`${ed} .se-symrow`)].map((e) => e.textContent.trim()), ED);
  assert.ok(palette.some((t) => /^AND4$/.test(t)), palette.slice(0, 20).join(', '));
  assert.ok(!palette.some((t) => /^(AND|OR|NAND|NOR)5/.test(t)), 'no 5-input gates');
});
