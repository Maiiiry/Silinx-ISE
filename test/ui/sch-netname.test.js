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
