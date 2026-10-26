// UI (#1555): the comparator COMP's comparisons in the schematic editor's Properties panel, a tick box each (EQ NE LT
// LE GT GE), each one ticked an output pin: ticking GT makes O the pin EQ, its wire following it, and adds GT; the
// HDL regenerated; unticking a connected output asks first (Cancel keeps it), then drops its wires; the last one
// cannot be unticked; one undo step a tick; Try it with the new pins. In English and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, netlist, generateHdl, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const P = (x, y) => ({ x, y });
const COMPARE_ALL = 'eq,ne,lt,le,gt,ge';

uiTest('#1555 schematic COMP: its comparisons ticked, an output pin each; wires kept or dropped after asking; the last one kept; Try it (English, Portuguese)', E, async (page) => {
  // a, b (2 bits) -> U1 (COMP2, =) -> y
  const doc = newDoc('top', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'compare', name: 'U1', x: 300, y: 100, rot: 0, mirror: false, params: { width: 2, op: 'eq', signed: false, bits: false } });
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 2, x: 200, y: 110 }, { id: 'P2', name: 'b', dir: 'in', width: 2, x: 200, y: 130 },
    { id: 'P3', name: 'y', dir: 'out', width: 1, x: 500, y: 120 });
  doc.wires.push({ id: 'W1', points: [P(200, 110), P(300, 110)], bus: true }, { id: 'W2', points: [P(200, 130), P(300, 130)], bus: true },
    { id: 'W3', points: [P(380, 120), P(500, 120)] });
  await makeProject(env, { name: 'CmpPj', top: 'top', files: { 'src/top.sch.json': JSON.stringify(doc) } });
  await page.openProject('CmpPj');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 1, [ED], { what: 'drawn' });
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const op = async () => (await getDoc()).symbols[0].params.op;
  const pins = async () => symbolPins((await getDoc()).symbols[0]).map((q) => q.name);
  const ticks = () => page.eval((ed) => [...document.querySelectorAll(`${ed} .se-props .se-ticks input`)].map((i) => `${i.dataset.op}${i.checked ? '+' : ''}`).join(' '), ED);
  const tick = (o) => page.click(`${ED} .se-props .se-ticks input[data-op=${o}]`);
  const conn = async (pin) => netlist(await getDoc()).pinNet.get(`S1/${pin}`)?.name;
  // the warnings of Check Schematic and of the HDL generated, in VHDL and in Verilog
  const warnings = async (want, what, hdl = []) => {
    const d = await getDoc();
    assert.deepEqual(netlist(d).diagnostics.map((x) => x.message), want, `${what}: Check Schematic`);
    for (const lang of ['vhdl', 'verilog']) assert.deepEqual(generateHdl(d, { lang }).diagnostics.map((x) => x.message), hdl, `${what}: ${lang} warnings`);
  };
  const hdlHas = (re, what) => page.waitFor(async (src) => new RegExp(src).test(await (await fetch('/api/projects/CmpPj/file?path=src%2Ftop.vhd')).text()), [re.source], { what, timeout: 15000 });
  const select = async () => {
    await page.click(`${ED} svg .sym[data-id="S1"] .hitbox`);
    await page.waitFor((ed) => document.querySelector(`${ed} .se-props .se-ticks`), [ED], { what: 'the tick boxes' });
  };
  await warnings([], 'as opened');
  await select();
  // the field: Comparisons, EQ ticked (a comparator saved with one comparison), no selection box any more
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-props .se-ticks`).closest('.se-field').querySelector('label').textContent, ED), 'Comparisons');
  assert.equal(await ticks(), 'eq+ ne lt le gt ge');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-props select[data-param=op]`), ED), null);
  assert.deepEqual(await pins(), ['A', 'B', 'O']);

  // GT ticked: the pins EQ and GT, y following O to EQ; the HDL with both
  await tick('gt');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[0].params.op === 'eq,gt', [], { what: 'GT ticked' });
  assert.deepEqual(await pins(), ['A', 'B', 'EQ', 'GT']);
  assert.equal(await conn('EQ'), 'y');
  assert.equal(await ticks(), 'eq+ ne lt le gt+ ge');
  assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} svg .sym[data-id="S1"] text`)].map((t) => t.textContent).includes('GT'), ED), 'GT drawn');
  await warnings([], 'EQ and GT');
  // (GT open: computed in the comparator's block, on no port)
  await hdlHas(/EQ <= '1' when unsigned\(A\) = unsigned\(B\) else '0';\s+\w+ <= '1' when unsigned\(A\) > unsigned\(B\) else '0';[^]*EQ => y/, 'the HDL with EQ and GT');

  // EQ unticked, connected: asked first; Cancel keeps it
  await tick('eq');
  await page.waitDialog('Remove connected outputs');
  assert.match(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-body').textContent), /^Unticking EQ removes the output EQ of U1 and the wires connected to it\.$/);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.equal(await op(), 'eq,gt');
  assert.equal(await ticks(), 'eq+ ne lt le gt+ ge');
  // … then removed: GT becomes O, y's wire dropped
  await tick('eq');
  await page.waitDialog('Remove connected outputs');
  await page.dialogButton('Remove the outputs and their wires');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[0].params.op === 'gt', [], { what: 'EQ unticked' });
  assert.deepEqual(await pins(), ['A', 'B', 'O']);
  assert.equal((await getDoc()).wires.some((w) => w.id === 'W3'), false, 'the wire of EQ dropped');
  await warnings(["I/O marker 'y' is not connected"], 'GT only', ["I/O marker 'y' is not connected", 'U1: no output connected, skipped']);

  // the last one: unticking it is refused, said in the status
  await tick('gt');
  await page.waitFor((ed) => document.querySelector(`${ed} .se-hint`)?.textContent === 'At least one comparison stays ticked', [ED], { what: 'refused' });
  assert.equal(await op(), 'gt');
  assert.equal(await ticks(), 'eq ne lt le gt+ ge');

  // one undo step a tick: back to EQ and GT, y on EQ again; then to EQ alone, on O
  await page.key('Escape');
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[0].params.op === 'eq,gt', [], { what: 'undone' });
  assert.equal(await conn('EQ'), 'y');
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols[0].params.op === 'eq', [], { what: 'undone again' });
  assert.equal(await conn('O'), 'y');
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.canUndo()), false);

  // all six: an output each, y on EQ
  await select();
  for (const o of ['ne', 'lt', 'le', 'gt', 'ge']) {
    await tick(o);
    await page.waitFor((x) => window.Silinx.active.schEditor.getDoc().symbols[0].params.op.includes(x), [o], { what: `${o} ticked` });
  }
  assert.deepEqual(await pins(), ['A', 'B', 'EQ', 'NE', 'LT', 'LE', 'GT', 'GE']);
  assert.equal(await conn('EQ'), 'y');
  await warnings([], 'all six');

  // Symbol Info (F1): its tick boxes, the pin table following them; the last one kept; the schematic unchanged
  const DLG = `${ED} .se-symdoc`;
  await select();
  await page.key('F1');
  await page.waitFor((d) => document.querySelector(d)?.dataset.type === 'compare', [DLG], { what: 'COMP datasheet' });
  const infoTicks = () => page.eval((d) => [...document.querySelectorAll(`${d} [data-param=op] input`)].map((i) => `${i.dataset.op}${i.checked ? '+' : ''}`).join(' '), DLG);
  const infoPins = () => page.eval((d) => [...document.querySelectorAll(`${d} .sd-pins tbody tr td:first-child`)].map((c) => c.textContent).join(' '), DLG);
  assert.equal(await infoTicks(), 'eq+ ne+ lt+ le+ gt+ ge+');
  assert.equal(await infoPins(), 'A B EQ NE LT LE GT GE');
  for (const o of ['eq', 'ne', 'lt', 'le', 'ge']) await page.click(`${DLG} [data-param=op] input[data-op=${o}]`);
  await page.waitFor((d) => document.querySelectorAll(`${d} .sd-pins tbody tr`).length === 3, [DLG], { what: 'GT alone: A B O' });
  assert.equal(await infoPins(), 'A B O');
  await page.click(`${DLG} [data-param=op] input[data-op=gt]`);
  assert.equal(await infoTicks(), 'eq ne lt le gt+ ge', 'the last one kept');
  await page.click(`${DLG} [data-act=close]`);
  await page.waitFor((d) => !document.querySelector(d), [DLG]);
  assert.equal(await op(), COMPARE_ALL);

  // Try it: y (EQ) follows a and b
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((ed) => document.querySelector(`${ed} .se-simlayer .lv-ctl`), [ED], { what: 'Try it' });
  const led = `${ED} .se-simlayer .lv-out[data-port="P3"]`;
  await page.waitFor((s) => document.querySelector(s)?.classList.contains('lv-1'), [led], { what: 'y = 1 (0 = 0)' });
  await page.click(`${ED} .lv-ctl[data-port="P1"]`);
  await page.waitFor(() => document.activeElement?.matches('.lv-edit-in'), [], { what: 'the editor of a' });
  await page.click(`${ED} .lv-editor .btn`, { text: '+1' });
  await page.click(`${ED} .lv-editor .lv-x`);
  await page.waitFor((s) => document.querySelector(s)?.classList.contains('lv-0'), [led], { what: 'y = 0 (1 ≠ 0)' });
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((ed) => !document.querySelector(`${ed} .se-simlayer .lv-ctl`), [ED], { what: 'Try it ended' });

  // Portuguese: the field, the question, the refusal
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await select();
    assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-props .se-ticks`).closest('.se-field').querySelector('label').textContent, ED), 'Comparações');
    await tick('eq');
    await page.waitDialog('Remover saídas ligadas');
    assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-body').textContent), 'Desmarcar EQ remove a saída EQ de U1 e os fios ligados a ela.');
    assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent.trim())), ['Remover as saídas e os seus fios', 'Cancelar']);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    for (const o of ['ne', 'lt', 'le', 'gt', 'ge']) {
      await tick(o);
      await page.waitFor((x) => !window.Silinx.active.schEditor.getDoc().symbols[0].params.op.includes(x), [o], { what: `${o} unticked` });
    }
    await tick('eq');
    await page.waitFor((ed) => document.querySelector(`${ed} .se-hint`)?.textContent === 'Pelo menos uma comparação fica marcada', [ED], { what: 'refused (pt)' });
    assert.equal(await op(), 'eq');
    assert.equal(await conn('O'), 'y');
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
