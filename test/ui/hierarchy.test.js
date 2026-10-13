// UI: the Design pane's hierarchy (#207): one row per module / instance, its base's icon on the left
// and a badge for each of its views after its name ([HDL] [Schematic] [ASM] [FSM] [Table] [Petri],
// the base's marked), no child rows for the views. The examples in both views (Implementation /
// Simulation); a badge opens its view, its right-click shows that view's commands; a schematic's
// block (#175) is a plain HDL module; every source has its HDL: a new drawing of every kind gets its
// HDL file at once, a project with a drawing without one gets it when it is opened; the keyboard;
// Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';
import { viewHdl } from '../../core/view-hdl.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// every row of the tree (the collapsed ones too), indented by its depth: "icon label (meta) [badge] [base*]"
const rows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].map((r) => {
  let d = 0;
  for (let u = r.parentElement.parentElement; u && u.id !== 'hier'; u = u.parentElement) if (u.tagName === 'UL') d++;
  const b = [...r.querySelectorAll('.badge')].map((x) => `[${x.textContent}${x.classList.contains('base') ? '*' : ''}]`);
  return `${'  '.repeat(d - 1)}${r.querySelector('.ico')?.dataset.ico} ${r.querySelector('.lbl').textContent}${b.length ? ` ${b.join(' ')}` : ''}${r.querySelector('.meta') ? ` ${r.querySelector('.meta').textContent}` : ''}`;
}));
const view = async (page, v) => { await page.click(`input[name=view][value=${v}]`); await page.waitFor((x) => window.Silinx.view === x, [v]); };
// the badge `text` of the row `label` (a click, a right-click)
const badge = async (page, label, text, opts = {}) => {
  const at = await page.waitFor((l, t) => {
    const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl').textContent === l && x.getClientRects().length);
    const b = r && [...r.querySelectorAll('.badge')].find((x) => x.textContent === t);
    if (!b) return null;
    const k = b.getBoundingClientRect();
    return { x: k.left + k.width / 2, y: k.top + k.height / 2 };
  }, [label, text], { what: `badge ${text} of ${label}` });
  return page.click(at, opts);
};
const menuLabels = (page) => page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return m.length ? m : null; }, [], { what: 'the context menu' });

const EXAMPLES = {
  gates: {
    impl: [
      'project H_gates',
      '  chip xc3s250e-4-cp132',
      '    moduleTop gates [HDL] [Schematic*] (gates.sch.json)',
      '    ucf gates.ucf',
    ],
    sim: [
      'project H_gates',
      '  sim Behavioral',
      '    vhdl tb_gates [HDL*] (tb_gates.vhd)',
      '      schematic uut - gates [HDL] [Schematic*] (gates.sch.json)',
    ],
  },
  traffic: {
    impl: [
      'project H_traffic',
      '  chip xc3s250e-4-cp132',
      '    moduleTop top [HDL*] (top.vhd)',
      '      fsm u_fsm - traffic [HDL] [FSM*] (traffic.fsm.json)',
      '      vhdl u_timer - timer [HDL*] (timer.vhd)',
      '      truthtable u_lamps - lamps [HDL] [Table*] (lamps.tt.json)',
      '      verilog u_display - sevenseg [HDL*] (sevenseg.v)',
      '    ucf traffic.ucf',
    ],
    sim: [
      'project H_traffic',
      '  sim Behavioral',
      '    vhdl tb_traffic [HDL*] (tb_traffic.vhd)',
      '      vhdl uut - top [HDL*] (top.vhd)',
      '        fsm u_fsm - traffic [HDL] [FSM*] (traffic.fsm.json)',
      '        vhdl u_timer - timer [HDL*] (timer.vhd)',
      '        truthtable u_lamps - lamps [HDL] [Table*] (lamps.tt.json)',
      '        verilog u_display - sevenseg [HDL*] (sevenseg.v)',
    ],
  },
  blinky: {
    impl: [
      'project H_blinky',
      '  chip xc3s250e-4-cp132',
      '    moduleTop top [HDL*] (top.vhd)',
      '      verilog u_pre - prescaler [HDL*] (counter.v)',
      '      asm u_speed - speed_ctrl [HDL] [ASM*] (speed_ctrl.asm.json)',
      '      vhdl u_knight - knight [HDL*] (knight.vhd)',
      '    ucf top.ucf',
    ],
    sim: [
      'project H_blinky',
      '  sim Behavioral',
      '    vhdl tb_top [HDL*] (tb_top.vhd)',
      '      vhdl uut - top [HDL*] (top.vhd)',
      '        verilog u_pre - prescaler [HDL*] (counter.v)',
      '        asm u_speed - speed_ctrl [HDL] [ASM*] (speed_ctrl.asm.json)',
      '        vhdl u_knight - knight [HDL*] (knight.vhd)',
    ],
  },
};

for (const [ex, want] of Object.entries(EXAMPLES)) {
  uiTest(`Design pane (#207), the example ${ex}: one row per module, its views as badges after its name, in the Implementation and Simulation views`, E, async (page) => {
    await makeProject(env, { name: `H_${ex}`, template: ex });
    await page.openProject(`H_${ex}`);
    await page.waitFor((n) => document.querySelectorAll('#hier .row').length === n, [want.impl.length], { what: 'the Implementation hierarchy' });
    assert.deepEqual(await rows(page), want.impl);
    await view(page, 'sim');
    await page.waitFor((n) => document.querySelectorAll('#hier .row').length === n, [want.sim.length], { what: 'the Simulation hierarchy' });
    assert.deepEqual(await rows(page), want.sim);
    await view(page, 'impl');
    // the base's badge tells what it is
    const titles = await page.eval(() => [...document.querySelectorAll('#hier .badge')].map((b) => `${b.textContent}: ${b.title}`));
    assert.equal(titles.includes('HDL: Open'), ex !== 'gates', titles.join(' | '));   // a module with its HDL only (gates has none)
    assert.ok(titles.some((t) => / Base: edits here update the others$/.test(t)) && titles.some((t) => /^HDL: Synchronized with the base$/.test(t)), titles.join(' | '));
    assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR|generated from/);
  });
}

uiTest('Design pane (#207): a badge opens its view, its right-click shows that view\'s commands; Convert to HDL from the badge moves the base', E, async (page) => {
  await makeProject(env, { name: 'H_badges', template: 'gates' });
  await page.openProject('H_badges');
  await badge(page, 'gates', 'HDL');
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gates.vhd', [], { what: 'the HDL opened by its badge' });
  await badge(page, 'gates', 'Schematic');
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/gates.sch.json', [], { what: 'the schematic opened by its badge' });
  // the row stays selected: its processes
  assert.equal(await page.eval(() => document.querySelector('#hier .row.sel .lbl').textContent), 'gates');
  // the schematic's commands
  await badge(page, 'gates', 'Schematic', { button: 'right' });
  assert.deepEqual(await menuLabels(page), ['Open', 'Convert to HDL (HDL as base)', 'Export as ISE Schematic (.sch)…', 'Remove Synchronized Schematic…']);
  await page.closeMenus();
  // the HDL's: the module's
  await badge(page, 'gates', 'HDL', { button: 'right' });
  const hdlMenu = await menuLabels(page);
  assert.deepEqual(hdlMenu.slice(0, 9), ['Set as Top Module', 'Open', 'Rename…', 'Check Syntax', 'View RTL Schematic', 'Create Test Bench (Wizard)…', 'Truth Table / Karnaugh Map of this Module…', 'Convert to HDL (HDL as base)', 'Export as ISE Schematic (.sch)…']);
  await page.closeMenus();
  // Convert to HDL (HDL as base) from the schematic's badge: the HDL is the base, the schematic stays, synchronized
  await badge(page, 'gates', 'Schematic', { button: 'right' });
  await page.click('body > .menu-popup .mi', { text: 'Convert to HDL (HDL as base)' });
  await page.waitConsole(/src\/gates\.vhd is now the base of 'gates'; src\/gates\.sch\.json stays synchronized with it\./);
  await page.waitFor(() => document.querySelector('#hier [data-key="m:gates"] .meta')?.textContent === '(gates.vhd)', [], { what: 'the HDL the base' });
  assert.deepEqual(await rows(page), [
    'project H_badges',
    '  chip xc3s250e-4-cp132',
    '    moduleTop gates [HDL*] [Schematic] (gates.vhd)',
    '    ucf gates.ucf',
  ]);
  await badge(page, 'gates', 'Schematic', { button: 'right' });
  assert.deepEqual(await menuLabels(page), ['Open', 'Convert to Schematic (schematic as base)', 'Export as ISE Schematic (.sch)…', 'Remove Synchronized Schematic…']);
  await page.closeMenus();
});

// the user's case: a schematic with a block (a 2-to-4 decoder with enable, an entity of its own in
// the schematic's HDL, #175), the schematic alone in the project (no HDL file, #177)
function esqDoc() {
  const doc = newDoc('esq', 'vhdl');
  const s = { id: 'S1', type: 'decoder', x: 200, y: 200, rot: 0, mirror: false, name: 'XLXI_1', params: { n: 2, en: true } };
  doc.symbols.push(s);
  for (const p of symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0], {})) {
    const at = { x: p.x + (p.dir === 'in' ? -40 : 40), y: p.y };
    doc.ports.push({ id: `P${doc.ports.length + 1}`, name: p.name.toLowerCase(), dir: p.dir, width: p.width || 1, x: at.x, y: at.y });
    doc.wires.push({ id: `W${doc.wires.length + 1}`, points: [at, { x: p.x, y: p.y }] });
  }
  return doc;
}

uiTest('every source has its HDL (#207): a schematic without an HDL file gets it when the project is opened; its block is a plain HDL module, never with the schematic\'s badge', E, async (page) => {
  const doc = esqDoc();
  const text = JSON.stringify(doc, null, 1);
  await makeProject(env, { name: 'teste', files: { 'src/esq.sch.json': text }, top: 'esq' });
  await page.openProject('teste');
  await page.waitConsole(/src\/esq\.vhd generated from src\/esq\.sch\.json \(every source has its HDL\)/);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/esq.vhd'] === 'src/esq.sch.json', [], { what: 'linked' });
  // the file: the HDL made for the schematic, linked to it (the schematic the base), in the project
  assert.equal(await readWs(env, 'teste', 'src/esq.vhd'), viewHdl('src/esq.sch.json', text).text);
  const saved = JSON.parse(await readWs(env, 'teste', 'src/esq.sch.json'));
  assert.deepEqual([saved.generatedFile, saved.base], ['src/esq.vhd', undefined]);
  assert.ok((await page.eval(() => window.Silinx.project.files.map((f) => f.path))).includes('src/esq.vhd'));
  // logged once
  assert.equal((await page.consoleText()).match(/generated from src\/esq\.sch\.json/g).length, 1);
  assert.deepEqual(await rows(page), [
    'project teste',
    '  chip xc3s250e-4-cp132',
    '    moduleTop esq [HDL] [Schematic*] (esq.sch.json)',
    '      vhdl xlxi_1 - esq_d2_4e [HDL*] (esq.vhd)',
  ]);
  // the block's commands: the HDL module's, none of the schematic's
  await page.treeRow('#hier', 'xlxi_1 - esq_d2_4e', { right: true });
  const m = await menuLabels(page);
  assert.ok(!m.some((l) => /Schematic…|as base|Convert to/.test(l)), m.join(' | '));
  await page.closeMenus();
  // opened again: nothing more to generate, the same rows
  await page.openProject('teste');
  await page.waitFor(() => document.querySelectorAll('#hier .row').length === 4);
  assert.equal((await page.consoleText()).match(/generated from src\/esq\.sch\.json/g).length, 1);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

// New Source of every drawn type: its HDL file at once, the row with both badges
const KINDS = [
  { type: 'sch', name: 'g1', file: 'src/g1.sch.json', ico: 'schematic', badge: 'Schematic', id: 'sch:src/g1.sch.json' },
  { type: 'asm', name: 'c1', file: 'src/c1.asm.json', ico: 'asm', badge: 'ASM', id: 'asm:src/c1.asm.json' },
  { type: 'fsm', name: 'f1', file: 'src/f1.fsm.json', ico: 'fsm', badge: 'FSM', id: 'fsm:src/f1.fsm.json' },
  { type: 'tt', name: 't1', file: 'src/t1.tt.json', ico: 'truthtable', badge: 'Table', id: 'tt:src/t1.tt.json' },
  { type: 'petri', name: 'p1', file: 'src/p1.pn.json', ico: 'petri', badge: 'Petri', id: 'pn:src/p1.pn.json' },
];
uiTest('every source has its HDL (#207): New Source of a schematic, ASM chart, state diagram, truth table and Petri net creates its HDL file at once; its row: both badges, the drawing the base', E, async (page) => {
  await makeProject(env, { name: 'H_new', top: '' });
  await page.openProject('H_new');
  for (const k of KINDS) {
    await page.eval(async (t) => { (await import('/js/wizards.js')).newSourceWizard({ type: t }); }, k.type);
    await page.waitDialog('New Source Wizard');
    await page.dialogButton('Next >');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', k.name);
    await page.dialogButton('Next >');
    await page.dialogButton('Finish');
    await page.waitNoDialog();
    await page.waitFor((id) => window.Silinx.active?.id === id, [k.id], { what: `the editor of ${k.file}` });
    const hdl = `src/${k.name}.vhd`;
    await page.waitConsole(new RegExp(`${hdl.replace('.', '\\.')} generated from ${k.file.replace(/\./g, '\\.')} \\(every source has its HDL\\)`));
    await page.waitFor((f, h) => window.Silinx.hdlToSch?.[h] === f, [k.file, hdl], { what: `${k.file} linked to ${hdl}` });
    const d = JSON.parse(await readWs(env, 'H_new', k.file));
    assert.equal(d.generatedFile, hdl, k.file);
    assert.equal(await readWs(env, 'H_new', hdl), viewHdl(k.file, JSON.stringify({ ...d, generatedFile: undefined })).text, hdl);
    await page.waitFor((n) => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl').textContent === n), [k.name]);
    const row = (await rows(page)).find((r) => r.trim().startsWith(`${k.ico} ${k.name} `));
    assert.equal(row?.trim(), `${k.ico} ${k.name} [HDL] [${k.badge}*] (${k.file.split('/').pop()})`);
  }
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('Design pane (#207) from the keyboard: ↑ / ↓ select, ← / → collapse / expand, Enter opens the base, Tab reaches the selected row\'s badges, Enter on a badge opens that view', E, async (page) => {
  await makeProject(env, { name: 'H_keys', template: 'traffic' });
  await page.openProject('H_keys');
  await page.treeRow('#hier', 'top', { exact: true });
  await page.eval(() => document.querySelector('#hier .tree').focus());
  const sel = () => page.eval(() => document.querySelector('#hier .row.sel .lbl').textContent);
  await page.key('ArrowDown');
  assert.equal(await sel(), 'u_fsm - traffic');
  await page.key('ArrowDown');
  assert.equal(await sel(), 'u_timer - timer');
  await page.key('ArrowUp');
  assert.equal(await sel(), 'u_fsm - traffic');
  // ←: to the parent, again: collapsed; →: expanded
  await page.key('ArrowLeft');
  assert.equal(await sel(), 'top');
  await page.key('ArrowLeft');
  assert.equal(await page.eval(() => document.querySelector('#hier [data-key="m:top"]').nextElementSibling.hidden), true);
  await page.key('ArrowRight');
  assert.equal(await page.eval(() => document.querySelector('#hier [data-key="m:top"]').nextElementSibling.hidden), false);
  await page.key('ArrowRight');
  assert.equal(await sel(), 'u_fsm - traffic');
  // Enter: the base (the state diagram)
  await page.key('Enter');
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/traffic.fsm.json', [], { what: 'the state diagram opened from the keyboard' });
  // Tab: the badges of the selected row ([HDL] first), Enter opens it
  await page.eval(() => document.querySelector('#hier .tree').focus());
  await page.key('Tab');
  assert.equal(await page.eval(() => document.activeElement.closest('.row')?.querySelector('.lbl').textContent + ' ' + document.activeElement.textContent), 'u_fsm - traffic HDL');
  await page.key('Enter');
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/traffic.vhd', [], { what: 'the HDL opened from its badge' });
  // only the selected row's badges are on the Tab path
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .badge[tabindex="0"]')].map((b) => b.closest('.row').querySelector('.lbl').textContent + ':' + b.textContent)), ['u_fsm - traffic:HDL', 'u_fsm - traffic:FSM']);
});

uiTest('Design pane (#207) in Portuguese: the badges [HDL] [Esquemático] [FSM] [Tabela] and their tips', E, async (page) => {
  await makeProject(env, { name: 'H_pt', template: 'traffic' });
  await page.openProject('H_pt');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.waitFor(() => [...document.querySelectorAll('#hier .badge')].some((b) => b.textContent === 'Tabela'), [], { what: 'the badges in Portuguese' });
    const got = await page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.badge')).map((r) => `${r.querySelector('.lbl').textContent}: ${[...r.querySelectorAll('.badge')].map((b) => `${b.textContent} (${b.title})`).join(' ')}`));
    assert.deepEqual(got, [
      'top: HDL (Abrir)',
      'u_fsm - traffic: HDL (Sincronizado com a base) FSM (Base: o que se edita aqui atualiza as outras)',
      'u_timer - timer: HDL (Abrir)',
      'u_lamps - lamps: HDL (Sincronizado com a base) Tabela (Base: o que se edita aqui atualiza as outras)',
      'u_display - sevenseg: HDL (Abrir)',
    ]);
    await badge(page, 'u_lamps - lamps', 'Tabela', { button: 'right' });
    assert.deepEqual(await menuLabels(page), ['Abrir', 'Converter para HDL (HDL como base)', 'Remover Tabela de Verdade Sincronizada…']);
    await page.closeMenus();
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});
