// UI: the schematic editor's symbols as ISE draws them: the type of a gate under it (AND2, OR3, INV…),
// no automatic instance id (inst_n, XLXI_n, Un) on the sheet unless Names is checked (#311), a name given by the user shown (#172); the
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
  // the palette: one AND (its Inputs 2, 3 or 4, #330), no AND5 (wider gates through Width / buses)
  const palette = await page.eval((ed) => [...document.querySelectorAll(`${ed} .se-symrow`)].map((e) => e.textContent.trim()), ED);
  assert.ok(palette.includes('AND'), palette.slice(0, 20).join(', '));
  assert.ok(!palette.some((t) => /^X?N?(AND|OR)\d/.test(t)), 'no AND2 … AND5 entries');
});

uiTest('schematic: a bus takes the name of its input (A(5:0) on its wires), a bus tap dropped on it connects and reads A(0) (#170, #173, #174)', E, async (page) => {
  const { normalizeDoc, symbolPins } = await import('../../core/schdoc.js');
  const doc = newDoc('bus', 'vhdl');
  doc.ports.push({ id: 'P1', name: 'A', dir: 'in', width: 6, x: 100, y: 200 });
  doc.wires.push({ id: 'W1', points: [{ x: 100, y: 200 }, { x: 500, y: 200 }] });
  const tap = { id: 'S1', type: 'slice', x: 0, y: 0, rot: 0, mirror: false, name: 'XLXI_1', params: { msb: 0, lsb: 0 } };
  const ip = symbolPins(normalizeDoc({ ...doc, symbols: [tap] }).symbols[0], {}).find((p) => p.name === 'I');
  tap.x = 300 - ip.x; tap.y = 200 - ip.y; doc.symbols.push(tap);   // its input in the middle of the bus
  const g = { id: 'S2', type: 'and2', x: 300, y: 300, rot: 0, mirror: false, name: 'XLXI_2', params: { width: 6 } };
  doc.symbols.push(g);
  const gp = symbolPins(normalizeDoc({ ...doc, symbols: [g] }).symbols[0], {}).find((p) => p.name === 'I0');
  doc.wires.push({ id: 'W2', points: [{ x: 200, y: 200 }, { x: 200, y: gp.y }, { x: gp.x, y: gp.y }] });
  await makeProject(env, { name: 'BusPj', files: { 'src/bus.sch.json': JSON.stringify(doc) } });
  await page.openProject('BusPj');
  await page.eval(() => window.SilinxApp.openSch('src/bus.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} svg .busname`)].map((t) => t.textContent), ED), ['A(5:0)', 'A(5:0)']);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} svg .sym .stext`)].map((t) => t.textContent), ED), ['A(0)']);
  // the tap is connected: no unconnected-pin marker on its input, a junction dot where it sits
  assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} svg .junction`)].some((c) => c.getAttribute('cx') === '300' && c.getAttribute('cy') === '200'), ED));
});

uiTest('schematic: a wire dragged with Keep connections keeps its ends on the markers and wires they touch; without it, it moves whole (#206)', E, async (page) => {
  const doc = newDoc('mv', 'vhdl');
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 400, y: 200 }, { id: 'P3', name: 'z', dir: 'out', width: 1, x: 400, y: 300 });
  doc.wires.push({ id: 'W1', points: [{ x: 100, y: 100 }, { x: 250, y: 100 }, { x: 250, y: 200 }, { x: 400, y: 200 }] });
  doc.wires.push({ id: 'W2', points: [{ x: 250, y: 150 }, { x: 320, y: 150 }, { x: 320, y: 300 }, { x: 400, y: 300 }] });   // a T on W1
  await makeProject(env, { name: 'MvPj', files: { 'src/mv.sch.json': JSON.stringify(doc) } });
  await page.openProject('MvPj');
  await page.eval(() => window.SilinxApp.openSch('src/mv.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .port`).length === 3, [ED], { what: 'drawn' });
  const at = (x, y) => page.eval((ed, px, py) => { const l = document.querySelector(`${ed} svg [data-kind=wire] .whit`); const p = l.ownerSVGElement.createSVGPoint(); p.x = px; p.y = py; const q = p.matrixTransform(l.getScreenCTM()); return { x: q.x, y: q.y }; }, ED, x, y);
  const wire = (id) => page.eval((i) => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === i).points.map((p) => [p.x, p.y]), id);
  const keep = (on) => page.eval((ed, v) => { const c = [...document.querySelectorAll(`${ed} input[type=checkbox]`)].find((x) => x.parentElement.textContent.includes('Keep connections')); if (c.checked !== v) c.click(); }, ED, on);
  // Keep connections: W1 dragged 40 to the right by its vertical segment: its ends stay on a and y
  await keep(true);
  await page.drag(await at(250, 180), await at(290, 180));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W1').points[1].x === 290, [], { what: 'moved' });
  assert.deepEqual(await wire('W1'), [[100, 100], [290, 100], [290, 200], [400, 200]]);
  // dragged down 20: still on both markers (jogs at the ends)
  await page.drag(await at(290, 180), await at(290, 200));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W1').points.length > 4, [], { what: 'moved down' });
  const w1 = await wire('W1');
  assert.deepEqual([w1[0], w1.at(-1)], [[100, 100], [400, 200]], 'its ends on a and y: ' + JSON.stringify(w1));
  // W2: its start on W1 (a T) stays there too
  await page.menu('Edit', 'Undo'); await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W1').points[1].x === 250, [], { what: 'undone' });
  await page.drag(await at(320, 250), await at(340, 250));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W2').points.some((p) => p.x === 340), [], { what: 'W2 moved' });
  assert.deepEqual(await wire('W2'), [[250, 150], [340, 150], [340, 300], [400, 300]]);
  // without Keep connections: the wire moves whole
  await page.menu('Edit', 'Undo');
  await keep(false);
  await page.drag(await at(250, 180), await at(290, 180));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find((w) => w.id === 'W1').points[0].x === 140, [], { what: 'moved whole' });
  assert.deepEqual(await wire('W1'), [[140, 100], [290, 100], [290, 200], [440, 200]]);
  await keep(true);
});

// #311: Names shows every instance's name (the automatic ones too) and every net's name; remembered; no View
// HDL button; a symbol placed is named inst_n
uiTest('#311 schematic: Names shows every instance and net name (also the automatic ones), remembered; no View HDL; new instances inst_n', E, async (page) => {
  const { normalizeDoc, symbolPins } = await import('../../core/schdoc.js');
  const doc = newDoc('nm', 'vhdl');
  const g1 = { id: 'S1', type: 'inv', x: 100, y: 100, rot: 0, mirror: false, name: 'XLXI_1', params: { width: 1 } };
  const g2 = { id: 'S2', type: 'inv', x: 300, y: 100, rot: 0, mirror: false, name: 'my_inv', params: { width: 1 } };
  doc.symbols.push(g1, g2);
  const pin = (s, n) => symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0], {}).find((p) => p.name === n);
  const o = pin(g1, 'O'), i = pin(g2, 'I');
  doc.wires.push({ id: 'W1', points: [o, { x: (o.x + i.x) / 2, y: o.y }, { x: (o.x + i.x) / 2, y: i.y }, i] });
  await makeProject(env, { name: 'NamesPj', files: { 'src/nm.sch.json': JSON.stringify(doc) } });
  await page.openProject('NamesPj');
  await page.eval(() => { try { localStorage.removeItem('xl.sch.names'); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openSch('src/nm.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  const names = () => page.eval((ed) => ({ inst: [...document.querySelectorAll(`${ed} svg .sym .iname`)].map((t) => t.textContent).sort(), nets: [...document.querySelectorAll(`${ed} svg .netname`)].map((t) => t.textContent) }), ED);
  assert.deepEqual(await names(), { inst: ['my_inv'], nets: [] }, 'unchecked: as before');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-btn[data-act=view]`), ED), null, 'no View HDL');
  // the checkbox before Check
  assert.deepEqual(await page.eval((ed) => { const n = document.querySelector(`${ed} .se-names`); return [n.textContent, n.nextElementSibling?.dataset.act]; }, ED), ['Names', 'check']);
  await page.click(`${ED} .se-names input`);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .netname`).length === 1, [ED], { what: 'the net names' });
  const shown = await names();
  assert.deepEqual(shown.inst, ['XLXI_1', 'my_inv']);
  assert.equal(shown.nets.length, 1);
  assert.match(shown.nets[0], /^net_\d+$/);
  assert.equal(await page.eval(() => localStorage.getItem('xl.sch.names')), '1');
  // a new inverter: inst_n
  await page.fill(`${ED} .se-search`, 'INV');
  await page.click(`${ED} .se-symrow`, { text: 'INV' });
  const c = await page.eval((ed) => { const r = document.querySelector(`${ed} .se-svg`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height - 80 }; }, ED);
  await page.click(c);
  await page.key('Escape');
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/NamesPj/file?path=src%2Fnm.sch.json')).text()).symbols.length === 3, [], { what: 'saved' });
  const saved = await page.eval(async () => JSON.parse(await (await fetch('/api/projects/NamesPj/file?path=src%2Fnm.sch.json')).text()));
  assert.equal(saved.symbols[2].name, 'inst_2', 'after XLXI_1: inst_2');
  await page.click(`${ED} .se-names input`);
  await page.eval(() => { try { localStorage.removeItem('xl.sch.names'); } catch { /* none */ } });
});
