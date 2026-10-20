// UI (#689): a wire named with a name another net has: the editor asks whether to connect them by name.
// Cancel: nothing changes, the nets stay apart; Connect by name: one net (the HDL one signal). In
// English and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, netlist, generateHdl } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const P = (x, y) => ({ x, y });
const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });

uiTest('#689 schematic: a net name another net has asks to connect them by name; Cancel keeps them apart, Connect makes one net (English, Portuguese)', E, async (page) => {
  // a -> U1 -> W2 named s; W3 (unnamed) -> U2 -> y
  const doc = newDoc('byname', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 100, 90), inv('S2', 'U2', 100, 290));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 220, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(100, 100)] }, { id: 'W2', points: [P(160, 100), P(220, 100)] },
    { id: 'W3', points: [P(40, 300), P(100, 300)] }, { id: 'W4', points: [P(160, 300), P(220, 300)] });
  doc.labels.push({ id: 'L1', x: 200, y: 100, net: 's' });
  await makeProject(env, { name: 'ByNamePj', files: { 'src/byname.sch.json': JSON.stringify(doc) } });
  await page.openProject('ByNamePj');
  await page.eval(() => window.SilinxApp.openSch('src/byname.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  const at = (x, y) => page.eval((ed, px, py) => { const l = document.querySelector(`${ed} svg [data-kind=wire] .whit`); const p = l.ownerSVGElement.createSVGPoint(); p.x = px; p.y = py; const q = p.matrixTransform(l.getScreenCTM()); return { x: q.x, y: q.y }; }, ED, x, y);
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const joined = async () => { const nl = netlist(await getDoc()); return nl.wireNet.get('W2') === nl.wireNet.get('W3'); };
  // the Add Net Name tool, the name s typed in its box, a click on W3
  const nameW3 = async () => {
    await page.click(`${ED} .se-btn[data-act=net]`);
    await page.eval((ed) => { const i = [...document.querySelectorAll(`${ed} .se-optin`)].find((e) => e.getClientRects().length); i.value = 's'; i.dispatchEvent(new Event('input', { bubbles: true })); }, ED);
    await page.click(await at(70, 300));
  };
  const dialogText = () => page.eval(() => { const d = [...document.querySelectorAll('.dlg-overlay')].pop(); return { title: d.querySelector('.dlg-title span').textContent, body: d.querySelector('.dlg-body').innerText.trim(), buttons: [...d.querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent.trim()) }; });

  for (const lang of ['en', 'pt']) {
    await page.eval(async (l) => (await import('/js/i18n.js')).setLanguage(l), lang);
    const T = lang === 'en'
      ? { title: 'Net name already used', body: "Another net is already named 's'.\nConnect this net to it by name? They become one net, without a wire drawn between them.", yes: 'Connect by name', no: 'Cancel' }
      : { title: 'Nome de rede já usado', body: "Já há outra rede chamada 's'.\nLigar esta rede a ela pelo nome? Passam a ser uma só rede, sem um fio desenhado entre elas.", yes: 'Ligar pelo nome', no: 'Cancelar' };
    // No: nothing added, the nets apart
    await nameW3();
    await page.waitDialog(T.title);
    assert.deepEqual(await dialogText(), { title: T.title, body: T.body, buttons: [T.yes, T.no] }, lang);
    await page.dialogButton(T.no);
    await page.waitNoDialog();
    assert.equal((await getDoc()).labels.length, 1, `${lang}: Cancel: no name added`);
    assert.equal(await joined(), false, `${lang}: Cancel: two nets`);
    // Yes: one net, connected by name
    await nameW3();
    await page.waitDialog(T.title);
    await page.dialogButton(T.yes);
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().labels.length === 2, [], { what: 'the name added' });
    const d = await getDoc();
    assert.equal(await joined(), true, `${lang}: Connect: one net`);
    assert.deepEqual(d.labels.map((l) => [l.x, l.y, l.net]), [[200, 100, 's'], [70, 300, 's']]);
    const nl = netlist(d);
    assert.deepEqual(nl.diagnostics.map((x) => x.message), [], `${lang}: no warnings`);
    assert.equal((generateHdl(d, { lang: 'vhdl' }).code.match(/signal s\b[^;]*;/g) || []).length, 1, 'one signal s');
    await page.key('Escape');
    await page.menu(lang === 'en' ? 'Edit' : 'Editar', lang === 'en' ? 'Undo' : 'Anular');
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().labels.length === 1, [], { what: 'undone' });
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});

// #734: a net connected by name renamed by one of its net names: the whole set takes the new name (its other net
// names, its I/O marker of that name), said in the status line, undone in one step; in English and Portuguese
uiTest('#734 schematic: renaming a net name renames the whole net connected by name, its I/O marker too; one Undo (English, Portuguese)', E, async (page) => {
  // a -> U1 -> W2 named s; W3 named s too (one net, by name) -> U2 -> y; a second wire W5 named a: the input marker's net
  const doc = newDoc('rename', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 100, 90), inv('S2', 'U2', 100, 290));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 220, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(100, 100)] }, { id: 'W2', points: [P(160, 100), P(220, 100)] },
    { id: 'W3', points: [P(40, 300), P(100, 300)] }, { id: 'W4', points: [P(160, 300), P(220, 300)] }, { id: 'W5', points: [P(300, 100), P(360, 100)] });
  doc.labels.push({ id: 'L1', x: 200, y: 100, net: 's' }, { id: 'L2', x: 60, y: 300, net: 'S' }, { id: 'L3', x: 320, y: 100, net: 'a' });
  await makeProject(env, { name: 'RenamePj', files: { 'src/rename.sch.json': JSON.stringify(doc) } });
  await page.openProject('RenamePj');
  await page.eval(() => window.SilinxApp.openSch('src/rename.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  // a net name selected, its Name field set (as typed, then Enter)
  const rename = async (id, name) => {
    await page.click(`${ED} [data-kind=label][data-id=${id}] .hitbox`);
    await page.waitFor((ed) => document.querySelector(`${ed} .se-field input`), [ED], { what: 'the net name\'s properties' });
    await page.eval((ed, v) => { const i = document.querySelector(`${ed} .se-field input`); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }, ED, name);
  };
  // the status line's note (shown a moment, translated in Portuguese)
  const hint = (t) => page.waitFor((ed, x) => { const e = document.querySelector(`${ed} .se-hint`); return !!e && !e.hidden && e.textContent === x; }, [ED, t], { what: `the note: ${t}` });
  for (const lang of ['en', 'pt']) {
    await page.eval(async (l) => (await import('/js/i18n.js')).setLanguage(l), lang);
    // s (and S: VHDL) renamed q from L1: L2 too, the two still one net
    await rename('L1', 'q');
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().labels.map((l) => l.net).join() === 'q,q,a', [], { what: `${lang}: the set renamed` });
    const nl = netlist(await getDoc());
    assert.equal(nl.wireNet.get('W2'), nl.wireNet.get('W3'), `${lang}: one net`);
    await hint(lang === 'en' ? "Renamed to 'q' with the net: 1 other net name" : "Mudado para 'q' com a rede: outro nome de rede");
    // one Undo: both back
    await page.key('Escape');
    await page.menu(lang === 'en' ? 'Edit' : 'Editar', lang === 'en' ? 'Undo' : 'Anular');
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().labels.map((l) => l.net).join() === 's,S,a', [], { what: `${lang}: undone in one step` });
    // the net named a (W5) renamed b: the input marker a with it, the module's port
    await rename('L3', 'b');
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.map((p) => p.name).join() === 'b,y', [], { what: `${lang}: the marker renamed` });
    assert.deepEqual((await getDoc()).labels.map((l) => l.net), ['s', 'S', 'b']);
    assert.match(generateHdl(await getDoc(), { lang: 'vhdl' }).code, /\bb\s*:\s*in\b/i);
    await hint(lang === 'en' ? "Renamed to 'b' with the net: the I/O marker 'b' (a port of the module)" : "Mudado para 'b' com a rede: o marcador de E/S 'b' (um porto do módulo)");
    await page.key('Escape');
    await page.menu(lang === 'en' ? 'Edit' : 'Editar', lang === 'en' ? 'Undo' : 'Anular');
    await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.map((p) => p.name).join() === 'a,y', [], { what: `${lang}: the marker undone` });
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});
