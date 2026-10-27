// UI (#1619): two documents side by side. A schematic (the example gates) and its generated VHDL: Show Generated HDL
// Beside (its tab's right-click menu) opens the HDL in the other pane, read-only, the schematic kept in front; an edit of
// the schematic reaches the HDL beside it; a click in a pane brings its document to the front; the divider dragged; a
// document opened takes the place of the one in front; kept with the project (a reload comes back split); closing one
// leaves the other alone. Open to the Side and Close Split (the View menu); a narrow workspace stacks the panes; a C
// source's HDL beside it, made again as the C is saved; Portuguese; the Tasks interface. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the documents shown: their ids, panes and boxes; the divider's
const shown = (page) => page.eval(() => {
  const ws = document.getElementById('workspace');
  const docs = window.Silinx.docs.filter((d) => d.el.getClientRects().length).map((d) => {
    const r = d.el.getBoundingClientRect();
    return { id: d.id, pane: d.el.classList.contains('pane-a') ? 'a' : d.el.classList.contains('pane-b') ? 'b' : null, front: d === window.Silinx.active,
      left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
  }).sort((x, y) => (x.pane || '').localeCompare(y.pane || ''));
  const dv = document.getElementById('split-divider');
  return { docs, split: ws.classList.contains('split'), vertical: ws.classList.contains('split-v'), divider: !!dv && !!dv.getClientRects().length };
});
const ids = async (page) => (await shown(page)).docs.map((d) => `${d.pane || '-'}:${d.id}${d.front ? '*' : ''}`);
// a document's tab, by its title (a point on it)
const tab = (page, title) => page.eval((t) => {
  const r = [...document.querySelectorAll('#doc-tabs .tab')].find((x) => x.querySelector('.tlabel')?.textContent === t && x.getClientRects().length).getBoundingClientRect();
  return { x: r.left + r.width / 3, y: r.top + r.height / 2 };
}, title);
const tabMenu = async (page, title) => {
  await page.rightClick(await tab(page, title));
  const m = await page.waitFor(() => { const l = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return l.length ? l : null; }, [], { what: 'the tab menu' });
  return m;
};
const noWarnings = async (page) => {
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
};
const SCH = 'sch:src/gates.sch.json', VHD = 'file:src/gates.vhd';

uiTest('#1619 a schematic and its generated VHDL side by side: the HDL follows the schematic, a pane clicked, the divider dragged, kept, closed', E, async (page) => {
  await makeProject(env, { name: 'Split', template: 'gates' });
  await page.openProject('Split');
  await page.eval(() => window.SilinxApp.openSch('src/gates.sch.json'));
  await page.waitFor((id) => window.Silinx.active?.id === id && window.Silinx.active.schEditor, [SCH], { what: 'the schematic' });
  assert.deepEqual(await ids(page), [`-:${SCH}*`]);

  // its tab's menu: Open to the Side, Show Generated HDL Beside (no Close Split: not split)
  const m = await tabMenu(page, 'gates.sch.json');
  assert.deepEqual(m.slice(-2), ['Open to the Side', 'Show Generated HDL Beside']);
  await page.click('body > .menu-popup .mi', { text: 'Show Generated HDL Beside' });
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split') && window.Silinx.docs.find((d) => d.id === 'file:src/gates.vhd')?.editor, [], { what: 'split' });
  // the schematic left, in front; its VHDL right, read-only; the divider between them
  let s = await shown(page);
  assert.deepEqual(await ids(page), [`a:${SCH}*`, `b:${VHD}`]);
  assert.equal(s.vertical, false);
  assert.equal(s.divider, true);
  assert.ok(s.docs[0].right <= s.docs[1].left && s.docs[1].left - s.docs[0].right <= 8, JSON.stringify(s.docs));
  assert.ok(Math.abs(s.docs[0].width - s.docs[1].width) <= 4, 'halves');
  assert.equal(await page.eval(() => window.Silinx.docs.find((d) => d.id === 'file:src/gates.vhd').editor.readOnly()), true);
  // (the Design Summary, opened with the project, behind them)
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#doc-tabs .tab')].map((t) => `${t.querySelector('.tlabel').textContent}${t.classList.contains('active') ? '*' : ''}${t.classList.contains('beside') ? '+' : ''}`)),
    ['Design Summary', 'gates.sch.json*', 'gates.vhd+']);
  assert.match(await page.eval(() => window.Silinx.docs.find((d) => d.id === 'file:src/gates.vhd').editor.getValue()), /entity gates is/);

  // an edit of the schematic (its description) reaches the HDL beside it
  await page.waitFor(() => document.querySelector('.doc.pane-a .se-props textarea'), [], { what: 'the sheet properties' });
  await page.fill('.doc.pane-a .se-props textarea', 'Side by side.');
  await page.waitFor(() => /^-- Side by side\.$/m.test(window.Silinx.docs.find((d) => d.id === 'file:src/gates.vhd').editor.getValue()), [], { what: 'the HDL beside updated', timeout: 15000 });
  assert.deepEqual(await ids(page), [`a:${SCH}*`, `b:${VHD}`]);
  assert.equal(!!(await page.eval(() => window.Silinx.docs.find((d) => d.id === 'file:src/gates.vhd').dirty)), false);

  // a click in the HDL's pane: it is in front, both still shown
  await page.click('.doc.pane-b .cm-content');
  await page.waitFor((id) => window.Silinx.active?.id === id, [VHD], { what: 'the HDL in front' });
  assert.deepEqual(await ids(page), [`a:${SCH}`, `b:${VHD}*`]);

  // the divider dragged to a third: the panes follow
  const ws = await page.eval(() => { const r = document.getElementById('workspace').getBoundingClientRect(); return { x: r.left, w: r.width, y: r.top + r.height / 2 }; });
  await page.drag('#split-divider', { x: ws.x + ws.w / 3, y: ws.y });
  s = await shown(page);
  assert.ok(Math.abs(s.docs[0].width - ws.w / 3) <= 8, JSON.stringify(s.docs));
  assert.ok(s.docs[1].width > s.docs[0].width * 1.8);

  // kept with the project: a reload comes back split, the HDL in front
  await page.reload();
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split') && window.Silinx.docs.some((d) => d.id === 'file:src/gates.vhd'), [], { what: 'split again after a reload', timeout: 20000 });
  assert.deepEqual(await ids(page), [`a:${SCH}`, `b:${VHD}*`]);
  s = await shown(page);
  assert.ok(Math.abs(s.docs[0].width - ws.w / 3) <= 8, 'the divider where it was');

  // a document opened takes the place of the one in front (the HDL's pane)
  await page.eval(() => window.SilinxApp.openFile('sim/tb_gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_gates.vhd', [], { what: 'the test bench' });
  assert.deepEqual(await ids(page), [`a:${SCH}`, 'b:file:sim/tb_gates.vhd*']);
  await page.click(await tab(page, 'gates.vhd'));
  await page.waitFor((id) => window.Silinx.active?.id === id, [VHD]);
  assert.deepEqual(await ids(page), [`a:${SCH}`, `b:${VHD}*`]);
  await page.eval(() => window.SilinxApp.closeDoc(window.Silinx.docs.find((d) => d.id === 'file:sim/tb_gates.vhd')));

  // the HDL closed: the schematic alone, in front
  await page.click('#doc-tabs .tab.active .tclose');
  await page.waitFor(() => !window.Silinx.docs.some((d) => d.id === 'file:src/gates.vhd'), [], { what: 'the HDL closed' });
  s = await shown(page);
  assert.deepEqual(await ids(page), [`-:${SCH}*`]);
  assert.equal(s.split, false);
  assert.equal(s.divider, false);
  const w = await page.eval(() => document.getElementById('workspace').getBoundingClientRect().width);
  assert.ok(Math.abs(s.docs[0].width - w) <= 2, 'the whole workspace');
  await noWarnings(page);
});

uiTest('#1619 Open to the Side and Close Split (the View menu), any two documents; a narrow workspace stacks them; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'SplitAny', template: 'gates' });
  await page.openProject('SplitAny');
  await page.eval(() => window.SilinxApp.openFile('sim/tb_gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_gates.vhd' && window.Silinx.active.editor);
  // (a test bench: no HDL generated from it; not split)
  const viewItems = () => page.eval(() => window.SilinxApp.S.menus.find((m) => m.label === 'View').items().filter((x) => x && x !== '-' && /Split|Beside/.test(x.label)).map((x) => `${x.label}${x.disabled() ? ' (disabled)' : ''}`));
  assert.deepEqual(await viewItems(), ['Split Editor', 'Show Generated HDL Beside (disabled)', 'Close Split (disabled)']);
  await page.eval(() => window.SilinxApp.openFile('src/gates.vhd'));
  await page.waitFor((id) => window.Silinx.active?.id === id, [VHD]);
  // Split Editor: the one in front beside the other
  await page.menu('View', 'Split Editor');
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split'), [], { what: 'split' });
  assert.deepEqual(await ids(page), ['a:file:sim/tb_gates.vhd', `b:${VHD}*`]);
  // the tab menu while split: Close Split
  assert.deepEqual((await tabMenu(page, 'gates.vhd')).slice(-2), ['Open to the Side', 'Close Split']);
  await page.closeMenus();

  // a narrow workspace: one above the other
  await page.setViewport(600, 900);
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split-v'), [], { what: 'stacked' });
  await page.eval(() => { if (document.body.classList.contains('drawer-open')) document.getElementById('drawer-btn')?.click(); });
  const s = await shown(page);
  if (s.docs.length === 2) {   // (a narrow screen's drawer can cover the workspace: its documents still split)
    assert.ok(s.docs[0].bottom <= s.docs[1].top && s.docs[0].width === s.docs[1].width, JSON.stringify(s.docs));
  }
  await page.setViewport(1400, 900);
  await page.waitFor(() => !document.getElementById('workspace').classList.contains('split-v'), [], { what: 'side by side again' });

  // Portuguese: the commands
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.deepEqual((await tabMenu(page, 'gates.vhd')).slice(-2), ['Abrir ao Lado', 'Fechar a Divisão']);
  await page.closeMenus();
  const pt = await page.openMenu('Ver');
  for (const l of ['Dividir o Editor', 'Mostrar o HDL Gerado ao Lado', 'Fechar a Divisão']) assert.ok(pt.some((i) => i.label === l), `${l}: ${pt.map((i) => i.label).join(' | ')}`);
  await page.closeMenus();
  assert.equal(await page.eval(() => document.getElementById('split-divider').title), 'Arraste para mudar o tamanho dos painéis (duplo clique: metades)');
  await page.menu('Ver', 'Fechar a Divisão');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.waitFor(() => !document.getElementById('workspace').classList.contains('split'), [], { what: 'one document' });
  assert.deepEqual(await ids(page), [`-:${VHD}*`]);
  await noWarnings(page);
});

const C = 'int mac(int a, int b, int *acc) {\n  int p = a * b;\n  *acc = *acc + p;\n  return p;\n}\n';
uiTest('#1619 a C source and its generated VHDL side by side: made again as the C is saved', E, async (page) => {
  await makeProject(env, { name: 'SplitC', top: '', files: { 'src/mac.c': C } });
  await page.openProject('SplitC');
  await page.waitFor(() => window.SilinxApp.S.modules.some((m) => m.name === 'mac'), [], { what: 'the module mac' });
  await page.eval(() => window.SilinxApp.openFile('src/mac.c'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/mac.c' && window.Silinx.active.editor);
  await page.menu('View', 'Show Generated HDL Beside');
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split') && window.Silinx.docs.find((d) => d.id === 'chdl:src/mac.c')?.editor, [], { what: 'the C and its VHDL' });
  assert.deepEqual(await ids(page), ['a:file:src/mac.c*', 'b:chdl:src/mac.c']);
  const hdl = () => page.eval(() => window.Silinx.docs.find((d) => d.id === 'chdl:src/mac.c').editor.getValue());
  assert.match(await hdl(), /entity mac is/);
  // the C edited and saved: its VHDL beside it made again
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace('int mac(', 'int mac2(')); });
  await page.eval(() => window.SilinxApp.saveAll());
  await page.waitFor(async () => /entity mac2 is/.test(await (window.Silinx.docs.find((d) => d.id === 'chdl:src/mac.c')?.editor.getValue() || '')), [], { what: 'the VHDL beside made again', timeout: 15000 });
  assert.deepEqual(await ids(page), ['a:file:src/mac.c*', 'b:chdl:src/mac.c']);
  await noWarnings(page);
});

uiTest('#1619 Tasks interface: the schematic and its VHDL side by side in Design; another task\'s document alone', E, async (page) => {
  await makeProject(env, { name: 'SplitTasks', template: 'gates' });
  const ui = await page.eval(() => localStorage.getItem('silinx.ui'));
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  try {
    await page.reload();
    await page.openProject('SplitTasks');
    await page.eval(() => window.SilinxApp.openSch('src/gates.sch.json'));
    await page.waitFor((id) => window.Silinx.active?.id === id && window.Silinx.active.schEditor, [SCH], { what: 'the schematic' });
    await page.menu('View', 'Show Generated HDL Beside');
    await page.waitFor(() => document.getElementById('workspace').classList.contains('split'), [], { what: 'split' });
    assert.deepEqual(await ids(page), [`a:${SCH}*`, `b:${VHD}`]);
    // the Design Summary (Implement's): alone, the pair kept for Design
    await page.eval(() => window.SilinxApp.openSummary());
    await page.waitFor(() => window.Silinx.active?.id === 'summary', [], { what: 'the summary' });
    assert.deepEqual(await ids(page), ['-:summary*']);
    await page.eval(() => window.SilinxApp.openSch('src/gates.sch.json'));
    await page.waitFor(() => document.getElementById('workspace').classList.contains('split'), [], { what: 'split again in Design' });
    assert.deepEqual(await ids(page), [`a:${SCH}*`, `b:${VHD}`]);
    await noWarnings(page);
  } finally {
    await page.eval((u) => (u ? localStorage.setItem('silinx.ui', u) : localStorage.removeItem('silinx.ui')), ui);
  }
});
