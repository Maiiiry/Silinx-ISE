// UI: a drawing whose HDL file name is taken (#230). Every drawn source gets its HDL file
// (src/<module>.vhd, #207); when a file of that name is in the way, the drawing is not left silently
// without it: one console warning per opening of the project (no dialog), a [No HDL] badge on its row
// in the Design pane (its tip says why), and its menu's Generate HDL File… resolves it: the file that
// defines its module already is replaced by the generated HDL once the user says Yes (No: nothing
// changes); a file holding something else is left alone and the HDL goes to <module>_<kind>.vhd. The New
// Source wizards refuse a name whose HDL file is taken. A Petri net (the case reported) and a truth table;
// the Portuguese interface.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { viewHdl } from '../../core/view-hdl.js';
import { newPetri } from '../../core/petri.js';
import { newTable } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// every row of the tree, indented by its depth: "icon label [base*] [badge] (meta)"
const rows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].map((r) => {
  let d = 0;
  for (let u = r.parentElement.parentElement; u && u.id !== 'hier'; u = u.parentElement) if (u.tagName === 'UL') d++;
  const b = [...r.querySelectorAll('.badge')].map((x) => `[${x.textContent}${x.classList.contains('base') ? '*' : ''}${x.classList.contains('warn') ? '!' : ''}]`);
  return `${'  '.repeat(d - 1)}${r.querySelector('.ico')?.dataset.ico} ${r.querySelector('.lbl').textContent}${b.length ? ` ${b.join(' ')}` : ''}${r.querySelector('.meta') ? ` ${r.querySelector('.meta').textContent}` : ''}`;
}));
const warnTip = (page) => page.eval(() => document.querySelector('#hier .badge.warn')?.title ?? null);
const menuLabels = (page) => page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return m.length ? m : null; }, [], { what: 'the context menu' });
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));
const topText = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().innerText);

const PN = JSON.stringify(newPetri('ctl', 'vhdl'), null, 2);
// an earlier HDL of the net (its module, ctl), written by hand
const OLD_CTL = 'library ieee;\nuse ieee.std_logic_1164.all;\n\n-- my earlier controller\nentity ctl is\n  port (clk : in std_logic; busy : out std_logic);\nend ctl;\n\narchitecture rtl of ctl is\nbegin\n  busy <= \'0\';\nend rtl;\n';
const TT = JSON.stringify({ ...newTable('maj', ['a', 'b', 'c'], ['f']), lang: 'vhdl', table: { f: '00010111' } }, null, 2);
// a file named as the table's HDL, holding another module
const OTHER = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity parity is\n  port (a, b : in std_logic; p : out std_logic);\nend parity;\n\narchitecture rtl of parity is\nbegin\n  p <= a xor b;\nend rtl;\n';

const W_PN = 'WARNING: src/ctl.pn.json has no HDL file: src/ctl.vhd exists already and defines its module ctl. Generate HDL File… (its right-click menu in the Design pane) replaces src/ctl.vhd with the HDL generated from it.';
const TIP_PN = 'No HDL file: src/ctl.vhd defines its module ctl already. Generate HDL File… (right-click) replaces it with the HDL generated from the drawing.';
const W_TT = 'WARNING: src/maj.tt.json has no HDL file: src/maj.vhd exists already and holds something else. Generate HDL File… (its right-click menu in the Design pane) writes its HDL to src/maj_tt.vhd.';
const TIP_TT = 'No HDL file: src/maj.vhd holds something else. Generate HDL File… (right-click) writes its HDL to src/maj_tt.vhd.';

uiTest('#230 regression, a Petri net whose HDL file exists and defines its module: warned once (no dialog), [No HDL] on its row; Generate HDL File… asks, No keeps the file, Yes replaces and links it', E, async (page) => {
  await makeProject(env, { name: 'C_pn', top: 'ctl', files: { 'src/ctl.pn.json': PN, 'src/ctl.vhd': OLD_CTL } });
  await page.openProject('C_pn');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  assert.deepEqual(await warnings(page), [W_PN]);
  assert.equal(await page.dialogCount(), 0);
  assert.deepEqual(await rows(page), [
    'project C_pn',
    '  chip xc3s250e-4-cp132',
    '    moduleTop ctl [VHDL*] (ctl.vhd)',
    '    petri ctl.pn.json [No HDL!]',
  ]);
  assert.equal(await warnTip(page), TIP_PN);
  // nothing written; loaded again (e.g. after a save): not said again
  assert.equal(await readWs(env, 'C_pn', 'src/ctl.vhd'), OLD_CTL);
  assert.equal(await readWs(env, 'C_pn', 'src/ctl.pn.json'), PN);
  await page.eval(() => window.SilinxApp.reloadProject());
  assert.deepEqual(await warnings(page), [W_PN]);
  // its menu: Generate HDL File…; No: nothing changes
  await page.treeRow('#hier', 'ctl.pn.json', { right: true, exact: true });
  assert.deepEqual(await menuLabels(page), ['Open', 'Set as Top Module', 'Rename…', 'Generate HDL File…', 'Remove from Project']);
  await page.click('body > .menu-popup .mi', { text: 'Generate HDL File…' });
  await page.waitDialog('Generate HDL File');
  assert.match(await topText(page), /src\/ctl\.vhd defines the module ctl already\.\n\nReplace it with the HDL generated from ctl\.pn\.json\? Its current contents will be lost\./);
  await page.dialogButton('No');
  await page.waitNoDialog();
  assert.equal(await readWs(env, 'C_pn', 'src/ctl.vhd'), OLD_CTL);
  assert.equal(await readWs(env, 'C_pn', 'src/ctl.pn.json'), PN);
  // the badge does the same; Yes: replaced by the net's HDL, linked
  await page.click('#hier .badge.warn');
  await page.waitDialog('Generate HDL File');
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitConsole(/src\/ctl\.vhd replaced by the HDL generated from src\/ctl\.pn\.json, linked to it/);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/ctl.vhd'] === 'src/ctl.pn.json', [], { what: 'linked' });
  const d = JSON.parse(await readWs(env, 'C_pn', 'src/ctl.pn.json'));
  assert.equal(d.generatedFile, 'src/ctl.vhd');
  assert.equal(await readWs(env, 'C_pn', 'src/ctl.vhd'), viewHdl('src/ctl.pn.json', PN).text);
  await page.waitFor(() => !document.querySelector('#hier .badge.warn'), [], { what: 'no [No HDL] badge' });
  assert.deepEqual(await rows(page), [
    'project C_pn',
    '  chip xc3s250e-4-cp132',
    '    moduleTop ctl [Petri*] [VHDL] (ctl.pn.json)',
  ]);
  assert.deepEqual(await warnings(page), [W_PN]);
  // opened again: nothing to say
  await page.openProject('C_pn');
  assert.deepEqual(await warnings(page), [W_PN]);
  assert.equal(await page.eval(() => Object.keys(window.Silinx.hdlClash).length), 0);
});

uiTest('#230 regression, a truth table whose HDL file name holds another module: warned once, [No HDL] after [Table]; Generate HDL File… writes src/maj_tt.vhd and links it, the other file untouched', E, async (page) => {
  await makeProject(env, { name: 'C_tt', top: '', files: { 'src/maj.tt.json': TT, 'src/maj.vhd': OTHER } });
  await page.openProject('C_tt');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  assert.deepEqual(await warnings(page), [W_TT]);
  assert.deepEqual(await rows(page), [
    'project C_tt',
    '  chip xc3s250e-4-cp132',
    '    truthtable maj [Table*] [No HDL!] (maj.tt.json)',
    '    vhdl parity [VHDL*] (maj.vhd)',
  ]);
  assert.equal(await warnTip(page), TIP_TT);
  await page.treeRow('#hier', 'maj', { right: true, exact: true });
  assert.deepEqual(await menuLabels(page), ['Open', 'Set as Top Module', 'Rename…', 'Generate HDL File…', 'Remove from Project']);
  await page.click('body > .menu-popup .mi', { text: 'Generate HDL File…' });
  // (nothing lost: no question)
  await page.waitConsole(/src\/maj_tt\.vhd generated from src\/maj\.tt\.json \(src\/maj\.vhd holds something else\)/);
  assert.equal(await page.dialogCount(), 0);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/maj_tt.vhd'] === 'src/maj.tt.json', [], { what: 'linked' });
  assert.equal(JSON.parse(await readWs(env, 'C_tt', 'src/maj.tt.json')).generatedFile, 'src/maj_tt.vhd');
  assert.equal(await readWs(env, 'C_tt', 'src/maj_tt.vhd'), viewHdl('src/maj.tt.json', TT).text);
  assert.equal(await readWs(env, 'C_tt', 'src/maj.vhd'), OTHER);
  await page.waitFor(() => !document.querySelector('#hier .badge.warn'), [], { what: 'no [No HDL] badge' });
  assert.deepEqual(await rows(page), [
    'project C_tt',
    '  chip xc3s250e-4-cp132',
    '    truthtable maj [Table*] [VHDL] (maj.tt.json)',
    '    vhdl parity [VHDL*] (maj.vhd)',
  ]);
  assert.deepEqual(await warnings(page), [W_TT]);
});

uiTest('#230 two drawings of the same module: the second has no HDL file, warned once, [No HDL]; nothing to generate (one of them is renamed)', E, async (page) => {
  const linked = JSON.stringify({ ...JSON.parse(PN), generatedFile: 'src/ctl.vhd' }, null, 2);
  const TT2 = JSON.stringify({ ...newTable('ctl', ['a', 'b'], ['f']), lang: 'vhdl', table: { f: '0110' } }, null, 2);
  await makeProject(env, { name: 'C_two', top: 'ctl', files: { 'src/ctl.pn.json': linked, 'src/ctl.vhd': viewHdl('src/ctl.pn.json', PN).text, 'src/other.tt.json': TT2 } });
  await page.openProject('C_two');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  assert.deepEqual(await warnings(page), ['WARNING: src/other.tt.json has no HDL file: its module ctl is the module of src/ctl.pn.json (src/ctl.vhd). Rename one of them.']);
  assert.deepEqual(await rows(page), [
    'project C_two',
    '  chip xc3s250e-4-cp132',
    '    moduleTop ctl [Petri*] [VHDL] (ctl.pn.json)',
    '    truthtable other.tt.json [No HDL!]',
  ]);
  assert.equal(await warnTip(page), 'No HDL file: its module ctl is the module of src/ctl.pn.json. Rename one of them.');
  await page.treeRow('#hier', 'other.tt.json', { right: true, exact: true });
  assert.deepEqual(await menuLabels(page), ['Open', 'Set as Top Module', 'Rename…', 'Remove from Project']);
  await page.closeMenus();
  // the badge says what to do; nothing written
  await page.click('#hier .badge.warn');
  await page.waitDialog('Generate HDL File');
  assert.match(await topText(page), /No HDL file: its module ctl is the module of src\/ctl\.pn\.json\. Rename one of them\./);
  await page.dialogButton('OK');
  await page.waitNoDialog();
  assert.equal(await readWs(env, 'C_two', 'src/other.tt.json'), TT2);
  assert.equal(await readWs(env, 'C_two', 'src/ctl.vhd'), viewHdl('src/ctl.pn.json', PN).text);
});

uiTest('#230 New Source: a Petri net, a truth table and the Petri Net Wizard refuse a name whose HDL file is taken (or whose module exists); another name goes on', E, async (page) => {
  await makeProject(env, { name: 'C_new', top: '', files: { 'src/maj.vhd': OTHER } });
  await page.openProject('C_new');
  const pickType = (label) => page.eval((t) => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.textContent.trim().endsWith(t)); r.scrollIntoView(); r.click(); }, label);
  const wizText = () => page.eval(() => document.querySelector('.dlg-overlay .wiz').innerText);
  for (const [type, name, msg] of [
    ['Petri Net (Diagram)', 'maj', 'src/maj.vhd already exists: the HDL generated from the new source would be written there. Choose another name.'],
    ['Truth Table', 'maj', 'src/maj.vhd already exists: the HDL generated from the new source would be written there. Choose another name.'],
    ['Truth Table', 'parity', "A module named 'parity' already exists."],
  ]) {
    await page.menu('Project', 'New Source…');
    await page.waitDialog('New Source Wizard');
    await pickType(type);
    await page.dialogButton('Next >');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
    await page.dialogButton('Next >');
    await page.waitFor((m) => document.querySelector('.dlg-overlay .wiz').innerText.includes(m), [msg], { what: msg });
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent), 'File Name and Location');
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  }
  // the Petri Net Wizard (its first page)
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await pickType('Petri Net (Wizard)');
  await page.dialogButton('Finish');
  await page.waitDialog('Petri Net Wizard');
  await page.fill('.dlg-overlay .mw-name', 'maj');
  await page.dialogButton('Next >');
  await page.waitFor(() => /src\/maj\.vhd already exists: the HDL generated from the new source would be written there\. Choose another name\./.test(document.querySelector('.dlg-overlay .wiz').innerText), [], { what: 'refused' });
  assert.match(await wizText(), /Name and Language/);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // another name: created, its HDL file at once, nothing to warn about
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await pickType('Petri Net (Diagram)');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'maj2');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitConsole(/src\/maj2\.vhd generated from src\/maj2\.pn\.json \(every source has its HDL\)/);
  assert.deepEqual(await warnings(page), []);
  assert.equal(await readWs(env, 'C_new', 'src/maj.vhd'), OTHER);
});

uiTest('#230 in Portuguese: the [Sem HDL] badge and its tip, Gerar Ficheiro HDL… in the menu, the question, the New Source refusal', E, async (page) => {
  await makeProject(env, { name: 'C_pt', top: 'ctl', files: { 'src/ctl.pn.json': PN, 'src/ctl.vhd': OLD_CTL, 'src/maj.tt.json': TT, 'src/maj.vhd': OTHER, 'src/notes.vhd': '-- notes\n' } });
  await page.openProject('C_pt');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.waitFor(() => [...document.querySelectorAll('#hier .badge.warn')].filter((b) => b.textContent === 'Sem HDL').length === 2, [], { what: 'the badges in Portuguese' });
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .badge.warn')].map((b) => b.title)), [
      'Sem ficheiro HDL: src/maj.vhd contém outra coisa. Gerar Ficheiro HDL… (botão direito) escreve o seu HDL em src/maj_tt.vhd.',
      'Sem ficheiro HDL: src/ctl.vhd já define o seu módulo ctl. Gerar Ficheiro HDL… (botão direito) substitui-o pelo HDL gerado a partir do desenho.',
    ]);
    await page.treeRow('#hier', 'ctl.pn.json', { right: true, exact: true });
    assert.deepEqual(await menuLabels(page), ['Abrir', 'Definir como Módulo de Topo', 'Mudar o Nome…', 'Gerar Ficheiro HDL…', 'Remover do Projeto']);
    await page.click('body > .menu-popup .mi', { text: 'Gerar Ficheiro HDL…' });
    await page.waitDialog('Gerar Ficheiro HDL');
    assert.match(await topText(page), /src\/ctl\.vhd já define o módulo ctl\.\n\nSubstituí-lo pelo HDL gerado a partir de ctl\.pn\.json\? O conteúdo atual perde-se\./);
    await page.dialogButton('Não');
    await page.waitNoDialog();
    assert.equal(await readWs(env, 'C_pt', 'src/ctl.vhd'), OLD_CTL);
    // New Source: the refusal
    await page.eval(async () => { (await import('/js/wizards.js')).newSourceWizard({ type: 'petri' }); });
    await page.waitDialog();
    await page.dialogButton('Seguinte >');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'notes');
    await page.dialogButton('Seguinte >');
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz').innerText.includes('src/notes.vhd já existe: o HDL gerado a partir da nova fonte seria escrito aí. Escolha outro nome.'), [], { what: 'the refusal in Portuguese' });
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'maj');
    await page.dialogButton('Seguinte >');
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz').innerText.includes("Já existe um módulo chamado 'maj'."), [], { what: 'the module refusal in Portuguese' });
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});
