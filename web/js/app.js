// Silinx Project Navigator — main application shell (ISE-like).
import { api, followJob } from './api.js';
import { icons, icon } from './icons.js';
import { h, dialog, alertDlg, confirmDlg, promptDlg, popupMenu, menuBar, splitter, toast, downloadText } from './ui.js';
import { createEditor, instTemplate, SNIPPETS, typeText } from './editor.js';
import { renameSymbolAtCursor, applyEdits } from './refactor.js';
import { compile, elaborate, topCandidates } from '/core/compile.js';
import { primitiveSources } from '/core/unisim.js';
import { Simulator } from '/core/simulator.js';
import * as wiz from './wizards.js';
import { PRODUCT, VERSION_LABEL } from '/core/version.js';
import { startI18n, setLanguage, getLanguage, LOCALES, t } from './i18n.js';
import { lintEnabled, setLintEnabled } from './diaghelp.js';
import { applyPrefs, getInterface, setInterface, getTheme, setTheme, toggleTheme, menuCommands } from './modern.js';
import { openPalette } from './palette.js';
import { initDrawer, drawerGiveWay, leftTabClicked } from './narrow.js';
import { createHistory } from './history.js';
import { viewHdl } from '/core/view-hdl.js';
import { modulesFromLibrary } from '/core/schdoc.js';
import { countEvent } from './analytics.js';
import { setActionRunner, runAction, longPressMenu } from './ui.js';
import { log, logLine, showConsolePage, setDiagnostics, renderDiagnostics, clearConsole } from './console.js';
import { openProject, closeProject, reloadProject, updateTitle, recent, clearRecent, renderStartPage, storageMenuItems,
  updateStorageStatus } from './project.js';
import { FLOW_UP_TO, checkUcfFile, generateSimModel, readBuildFile, regenerateUcf, runImpl, stepTracker, stopProcesses,
  ucfDiagnostics } from './implement.js';
import { adoptDrawnHdl, drawnHdlClashes, freshHdl, isAsm, isFsm, isPn, isTt, openAsm, openFsm, openPetri, openSch,
  openTt, openView, schModules, setViewAsTop, staleHdl, syncAsmFromHdl, syncBanner, syncFsmFromHdl, syncHdlFromAsm,
  syncHdlFromFsm, syncHdlFromSchematic, syncHdlFromTt, syncSchematicFromHdl, syncTtFromHdl, topOfView, ucfPort,
  viewNoun, viewSel, viewTitle } from './drawings.js';
import { EXTRA_STEPS, ISE_ONLY, SIM_MODEL_NAMES, checkFileSyntax, checkSyntax, diagsFor, hdlDiagnostics, loadUcfText,
  markStale, openMode, renderProcesses, runProcess, saveAll, setStatus, topConfirmed } from './processes.js';
import { fileContextMenu, inView, renderHierarchy, saveProjectJson, select, serialOp, setTop, treeItem } from './design.js';

// ------------------------------------------------------------------ state
export const S = {
  project: null, devices: null, toolchain: null,
  view: 'impl', sources: [], lib: null, modules: [],
  sel: null, docs: [], active: null, status: {}, diags: [], busy: false,
  diagsCleared: 0,            // how many times the Errors / Warnings tabs were cleared (a project opened or closed)
  procCollapsed: new Set(),   // ids of the collapsed groups of the Processes panel
  treeOpen: new Map(),        // Design hierarchy / Files trees: key -> expanded? (as the user left it)
};
window.Silinx = S; // handy for debugging from the console

const $ = id => document.getElementById(id);

export { log, setDiagnostics };   // (web/js/console.js)

// the messages of one file checked again (after a quick fix), when the tabs list some of them
function recheckFile(path) {
  if (!S.project || !S.diags.some(x => x.file === path)) return;
  const doc = S.docs.find(o => o.path === path && o.editor);
  let fresh;
  try { fresh = hdlDiagnostics(path, doc ? doc.editor.getValue() : null).filter(x => x.file === path); } catch { return; }
  S.diags = [...S.diags.filter(x => x.file !== path), ...fresh];
  renderDiagnostics();
  doc?.editor.setDiagnostics(fresh);
}

export function status(text) { $('status-text').textContent = text; }

// ------------------------------------------------------------------ compile
// Sources plus Silinx's UNISIM models when they instantiate Xilinx primitives (VHDL `library
// UNISIM`, a Verilog BUFG / FDCE … instance, #17), for elaborating a design. The project's module
// list (compileProject) is compiled without them: the primitives are not project modules.
export const withPrimitives = srcs => [...primitiveSources(srcs), ...srcs];
// whether a drawing's HDL file (generatedFile) is there, in the project (#231: else it has none)
export const hdlInProject = f => (S.fileTree || []).includes(f);
export function compileProject() {
  if (!S.project) return;
  const srcs = S.sources.filter(s => !s.view && (s.lang === 'vhdl' || s.lang === 'verilog'));
  // the drawn sources without an HDL file (#177): their HDL, made here, compiled with the rest (a module
  // of the project, which can be the top, be simulated and implemented, with no file)
  S.viewSources = [];
  S.viewElsewhere = {};
  const views = Object.entries(S.viewTexts || {}).filter(([f]) => !S.schOwners?.[f]);
  // the modules of the HDL files, compiled once for the drawings below (#402)
  let hdlModules = null;
  if (views.length) {
    let mods = {}, lib0 = null;
    try { lib0 = compile(srcs); mods = modulesFromLibrary(lib0, { sources: Object.fromEntries(srcs.map(s => [s.path, s.text])) }); } catch { /* none */ }
    hdlModules = mods;
    // (a drawn source whose module an HDL file of the project already defines: that file, not a second
    // one; the drawing then has no HDL file, said, #230)
    const hdlMods = new Set(Object.keys(mods).map(n => n.toLowerCase()));
    // (a drawing whose HDL file is gone, deleted or removed from the project, is one without it: #231)
    for (const [f, t] of views) {
      const r = viewHdl(f, t, { modules: mods, linked: hdlInProject });
      if (!r?.text) continue;
      if (!hdlMods.has(String(r.module).toLowerCase())) { S.viewSources.push({ path: f, lang: r.lang, text: r.text, role: 'design', view: true, module: r.module, errors: r.errors.length, lost: r.lost || null }); continue; }
      const m = !r.errors.length && [...(lib0?.modules.values() || [])].find(x => x.name.toLowerCase() === String(r.module).toLowerCase());
      if (m) S.viewElsewhere[f] = { module: r.module, lang: r.lang, file: m.archFile || m.file, lost: r.lost || null };
    }
  }
  // the linked drawings that cannot generate their HDL file (errors: a project opened with one, #303), each
  // text once (an edit in its editor says it as it syncs)
  let lazyMods = hdlModules;
  for (const [f, t] of Object.entries(S.viewTexts || {})) {
    if (S.staleSeen?.get(f) === t) continue;
    let m;
    try { m = JSON.parse(t); } catch { continue; }
    if (!m.generatedFile || !hdlInProject(m.generatedFile)) continue;
    (S.staleSeen ||= new Map()).set(f, t);
    if (!lazyMods) { try { lazyMods = modulesFromLibrary(compile(srcs), { sources: Object.fromEntries(srcs.map(s => [s.path, s.text])) }); } catch { lazyMods = {}; } }
    let r = null;
    try { r = viewHdl(f, t, { modules: lazyMods, linked: () => false }); } catch { /* not a drawing */ }
    if (r?.errors?.length) staleHdl(m.generatedFile, f, `it has errors: ${r.errors.map(e => e.replace(`${f}: `, '')).join('; ')}`);
    else if (r) freshHdl(m.generatedFile);
  }
  // (in S.sources too, so that every compile of the project (simulation, checks, RTL views) has them)
  S.sources = [...S.sources.filter(s => !s.view), ...S.viewSources];
  S.lib = compile([...srcs, ...S.viewSources]);
  // open schematics: their palette (Project modules) and module symbols follow the sources
  if (S.docs.some(d => d.schEditor)) schModules().then(mods => { for (const d of S.docs) d.schEditor?.setModules(mods); }).catch(() => {});
  // module info for editor completion / templates
  const fileOf = new Map();
  for (const p of S.lib.parsed) for (const u of p.units) if (u.kind === 'module' || u.kind === 'package') fileOf.set(u.name, p);
  S.modules = [...S.lib.modules.values()].map(m => ({
    name: m.name, lang: m.lang, file: m.archFile || m.file, line: m.loc?.line || 1, kind: m.lang === 'vhdl' ? 'entity' : 'module',
    role: S.project.files.find(f => f.path === m.file)?.role || 'design',
    portList: m.ports.map(p => ({ name: p.name, dir: p.dir, type: typeText(p.type, m.lang) })),
    paramList: m.params.filter(p => !p.local).map(p => p.name),
    ports: m.ports.map(p => `${p.dir.padEnd(5)} ${p.name} : ${typeText(p.type, m.lang)}`).join('\n'),
    mod: m,
  }));
  return S.lib;
}

// The project's board with the variant (pin overrides) that matches the selected part.
export function projectBoard(pj = S.project) {
  const b = S.devices?.boards.find(x => x.id === pj?.board);
  if (!b) return null;
  const v = b.variants?.find(x => x.device.part === pj.device.part) || b.variants?.find(x => x.default) || null;
  const ov = v?.resourceOverrides || {};
  return { ...b, device: { ...(v?.device || b.device) }, resources: b.resources.map(r => (ov[r.name] ? { ...r, ...ov[r.name] } : r)) };
}

export function moduleInfo(name) { return S.modules.find(m => m.name === name) || S.modules.find(m => m.name.toLowerCase() === String(name).toLowerCase()); }

// The modules at the root of a view's hierarchy: those of its role no module of it instantiates (in the
// Implementation view, a module instantiated only from a test bench is a root too)
export function viewRoots(sim) {
  const lib = S.lib;
  if (!lib) return [];
  const visible = name => inView(moduleInfo(name)?.role || 'design', sim);
  if (sim) return topCandidates(lib).filter(visible);
  const used = new Set();
  for (const m of lib.modules.values()) if (visible(m.name)) for (const i of instancesOf(m)) used.add(i.module.toLowerCase());
  return [...lib.modules.values()].filter(m => visible(m.name) && !used.has(m.name.toLowerCase())).map(m => m.name);
}

// A top-level module the project no longer has (its source removed from the project, #253): the
// top becomes the one root of its view left, else none (several: the user chooses, a warning); true
// when it changed. (Not while a source of the project still declares it: one being edited.)
export async function fixMissingTops() {
  const pj = S.project;
  const declared = name => (S.sources || []).some(f => new RegExp(`\\b(entity|module)\\s+${String(name).replace(/[^\w$]/g, '')}\\b`, 'i').test(f.text || ''));
  let changed = false;
  for (const sim of [false, true]) {
    const key = sim ? 'simTop' : 'top';
    const old = pj[key];
    if (!old || moduleInfo(old) || declared(old)) continue;
    const roots = viewRoots(sim);
    pj[key] = roots.length === 1 ? roots[0] : '';
    changed = true;
    const what = `The top-level ${sim ? 'simulation ' : ''}module '${old}' is no longer in the project`;
    if (pj[key]) log(`${what}: the top is now '${pj[key]}' (another one: Set as Top Module).`, 'info');
    else if (roots.length) log(`${what}: set the top module (a module's right-click menu: Set as Top Module).`, 'warn');
    else log(`${what}, nor any other module.`, 'info');
  }
  if (changed) { await saveProjectJson(); markStale(); renderHierarchy(); }
  return changed;
}

// Static hierarchy (from instances in the source, like ISE's Design view).
export function instancesOf(mod) {
  const out = [];
  const visit = (items, prefix) => {
    for (const it of items || []) {
      if (it.kind === 'instance') out.push({ name: prefix + it.name, module: it.module, loc: it.loc });
      if (it.kind === 'generate_for') visit(it.items, `${prefix}${it.label}.`);
      if (it.kind === 'generate_if') { visit(it.then, prefix + (it.label ? it.label + '.' : '')); visit(it.else, prefix); }
    }
  };
  visit(mod.items, '');
  return out;
}

// ------------------------------------------------------------------ the Design pane: hierarchy panel (web/js/design.js)

// ---- Undo / Redo of the project's commands (web/js/history.js): every menu, context menu and
// command palette command is recorded (what it changes in the project folder and settings); the
// processes (runs, simulations) are not commands that change the project
const NOT_RECORDED = /^(Implement|Generate Programming File|Synthesize|Simulate|Run|Rerun|Re-run|Emulate|Configure Target|Program|Initialize Chain|Check Syntax|View RTL|Analyze|Undo|Redo|Open|Find|Replace|Go to|Print|Download|Export|Help|About|Check for Updates|Language|Theme|Interface|Zoom|Close|New Project|Open Project|Recent)/;
const docPath = d => d.path || (/^(file|sch|asm|tt|fsm):/.test(String(d.id || '')) ? String(d.id).replace(/^[a-z]+:/, '') : null);
export const history = createHistory(api, {
  project: () => S.project?.name,
  files: () => S.diskTree || S.fileTree || [],
  settings: () => { if (!S.project) return null; const pj = { ...S.project }; delete pj.fileTree; return JSON.stringify(pj); },
  flush: () => saveAll(),
  before: (changed) => confirmDlg('Undo / Redo', `Changed since:\n${changed.slice(0, 12).join('\n')}${changed.length > 12 ? '\n…' : ''}\n\nUndo / Redo anyway (those changes are lost)?`),
  restored: async (e, paths) => {
    // the documents of the files it changed: closed (without saving), opened again from the files
    const reopen = [];
    for (const d of [...S.docs]) {
      const p = docPath(d);
      if (p && paths.includes(p)) { if (S.active === d) reopen.unshift(p); else reopen.push(p); d.dirty = false; clearTimeout(d._autosave); await closeDoc(d); }
    }
    await reloadProject();
    for (const p of reopen.reverse()) if ((S.diskTree || []).includes(p)) await openFile(p).catch(() => {});
  },
});
setActionRunner((label, fn) => (NOT_RECORDED.test(String(label || '')) ? fn() : history.run(label, fn)));

// Undo / Redo (Edit menu, toolbar, Ctrl+Z / Ctrl+Y outside an editor): the project's last command
// when it is newer than the last edit of the active document, else the document's own undo
const docEditor = d => d && (d.editor ? { undo: () => d.editor.exec('undo'), redo: () => d.editor.exec('redo') } : d.schEditor || d.asmEditor || d.fsmEditor || d.ttEditor || d.petriEditor || d.pinPlanner || null);
const undoesProject = () => history.canUndo() && !(S.active?._editedAt > history.lastAt() && docEditor(S.active));
const redoesProject = () => history.canRedo() && !(S.active?._editedAt > history.redoAt() && docEditor(S.active));
export async function projectUndo() {
  const e = await history.undo();
  if (e) log(`Undo: ${e.label}.`, 'ok');
}
async function projectRedo() {
  const e = await history.redo();
  if (e) log(`Redo: ${e.label}.`, 'ok');
}
const undoAny = () => (undoesProject() ? projectUndo() : docEditor(S.active)?.undo());
const redoAny = () => (redoesProject() ? projectRedo() : docEditor(S.active)?.redo());

// put a file of the project folder (back) into the project
export function addToProject(file) { return serialOp(() => addNow(file)); }
async function addNow(file) {
  const pj = S.project;
  pj.excluded = (pj.excluded || []).filter(f => f !== file);
  const lang = /\.vhdl?$/i.test(file) ? 'vhdl' : /\.(v|sv)$/i.test(file) ? 'verilog' : null;
  if (lang && !pj.files.some(f => f.path === file)) pj.files.push({ path: file, lang, role: /^(sim|tb|test)\//.test(file) || /(^|\/)tb_|_tb\./.test(file) ? 'sim' : 'design' });
  if (/\.ucf$/i.test(file) && !pj.constraints) pj.constraints = file;
  await saveProjectJson();
  await reloadProject();
}

// ------------------------------------------------------------------ processes panel, Check Syntax, process status (web/js/processes.js)

// ------------------------------------------------------------------ implementation (web/js/implement.js)

// ------------------------------------------------------------------ documents
function docTab(doc) {
  const tab = h('div', { class: 'tab', title: doc.tooltip || doc.title }, icon(doc.icon || 'file'), h('span', { class: 'tlabel' }, doc.title),
    h('span', { class: 'tclose', title: 'Close' }, '✕'));
  tab.addEventListener('mousedown', e => { if (e.button === 0 && !e.target.closest('.tclose')) activateDoc(doc); });
  tab.querySelector('.tclose').addEventListener('click', e => { e.stopPropagation(); closeDoc(doc); });
  tab.addEventListener('auxclick', e => { if (e.button === 1) closeDoc(doc); });
  tab.addEventListener('contextmenu', e => {
    e.preventDefault();
    popupMenu([
      { label: 'Close', action: () => closeDoc(doc) },
      { label: 'Close Others', action: () => S.docs.filter(d => d !== doc).forEach(closeDoc) },
      { label: 'Close All', action: () => [...S.docs].forEach(closeDoc) },
    ], e.clientX, e.clientY);
  });
  longPressMenu(tab);
  return tab;
}

export function findDoc(id) { return S.docs.find(d => d.id === id); }

// doc: { id, title, icon, create(el) -> controller }, controller: { onActivate, save, destroy, editor }
// (a diagram editor fits its view once, when its canvas first has a size, never on activation: the
// view is the user's, and a late fit moved the drawing under the pointer, #233, #244)
export function openDoc(spec) {
  let doc = findDoc(spec.id);
  if (doc) { activateDoc(doc, spec); return doc; }
  doc = { ...spec, el: h('div', { class: 'doc' }), project: S.project?.name };
  // the user's own actions in the document (Edit ▸ Undo: was the last change an edit of theirs?)
  for (const ev of ['keydown', 'pointerdown', 'input', 'paste', 'drop']) doc.el.addEventListener(ev, () => { doc._userAt = Date.now(); }, true);
  $('workspace').append(doc.el);
  doc.tab = docTab(doc);
  $('doc-tabs').append(doc.tab);
  S.docs.push(doc);
  activateDoc(doc, spec);
  Object.assign(doc, spec.create(doc.el, doc) || {});
  doc.onActivate?.();
  saveViewState();
  return doc;
}

// background: opened with the project, not by the user (a narrow screen's drawer stays open)
export function activateDoc(doc, { background = false } = {}) {
  S.active = doc;
  for (const d of S.docs) { d.el.hidden = d !== doc; d.tab.classList.toggle('active', d === doc); }
  doc.onActivate?.();
  $('status-pos').textContent = '';
  if (!keepView && !background) drawerGiveWay();   // a narrow screen: the drawer gives way to the document (#266)
  updateTitle();
  saveViewState();
}

// Editing always saves: a document with changes is written ~0.8 s after the last edit.
// user (the text editor says it, #534): true, the change is the user's own in the editor; false, written
// by the application; undefined (the other editors), judged by the timing below.
export function setDirty(doc, dirty, { user } = {}) {
  doc.dirty = dirty;
  // (an edit of the user: a change right after their action in the document, while no command,
  // Undo or Redo writes; a document opened or updated by a command is not edited by the user. The text
  // editor knows: typing while a command's tail still runs after its Rename is the user's edit, #534)
  if (dirty) { if (user === true || (user === undefined && !history.busy() && Date.now() - (doc._userAt || 0) < 2000)) doc._editedAt = Date.now(); doc._edits = (doc._edits || 0) + 1; }   // (Edit ▸ Undo: the last action was an edit or a removal?)
  doc.tab.classList.toggle('dirty', dirty);
  clearTimeout(doc._autosave);
  if (dirty && doc.save) doc._autosave = setTimeout(() => flushDoc(doc, { auto: true }), 800);
}
export async function flushDoc(doc, opts) {
  clearTimeout(doc._autosave);
  // one save at a time per document: two at once could reach the server in the wrong order
  while (doc._saving) await doc._saving.catch(() => {});
  if (!doc.dirty || !doc.save) return true;
  // never write a document into another project (e.g. a retry after the project was switched)
  if (doc.project && S.project?.name !== doc.project) return false;
  const edits = doc._edits;
  try {
    doc._saving = history.unrecorded(() => doc.save(opts));
    await doc._saving;
    if (doc._saveFailed) { doc._saveFailed = false; log(`${doc.path || doc.title} saved.`, 'ok'); }
    // edited while it was being saved (the save marked it clean): those edits are saved next
    if (doc._edits !== edits) setDirty(doc, true);
    // a drawn source without an HDL file: its module follows (#177), and it gets its HDL file as soon
    // as it has no errors (#207)
    const vp = docPath(doc);
    if (vp && /\.(sch|asm|tt|fsm|pn)\.json$/.test(vp) && !S.schOwners?.[vp] && S.project) {
      try {
        S.viewTexts = { ...(S.viewTexts || {}), [vp]: await api.readFile(S.project.name, vp) }; compileProject();
        if (await adoptDrawnHdl()) { await reloadProject(false); markStale(); } else { await drawnHdlClashes(); renderHierarchy(); }
      } catch { /* read later */ }
    }
  } catch (e) {
    // keep the changes and retry; report once until it works again
    if (!doc._saveFailed) log(`ERROR: cannot save ${doc.path || doc.title}: ${e.message}. Your changes are kept and saved as soon as it is possible again.`, 'err');
    doc._saveFailed = true;
    doc.dirty = true; doc.tab.classList.add('dirty');
    clearTimeout(doc._autosave);
    doc._autosave = setTimeout(() => flushDoc(doc, opts), 3000);
    return false;
  } finally { doc._saving = null; }
  return true;
}

export async function closeDoc(doc) {
  if (!await flushDoc(doc) && doc.dirty && !await confirmDlg('Close', `${doc.path || doc.title} could not be saved. Close it and lose the unsaved changes?`)) return false;
  clearTimeout(doc._autosave);
  doc.closed = true;
  doc.destroy?.();
  doc.el.remove(); doc.tab.remove();
  S.docs = S.docs.filter(d => d !== doc);
  if (S.active === doc) { const last = S.docs[S.docs.length - 1]; if (last) activateDoc(last); else S.active = null; }
  saveViewState();
  return true;
}

// ---- where the user was (#160, #163): the open documents of a project, the one in front, the left pane
// and the Design view, kept in this browser (per project) so that a reload of the page, or opening
// the project again, comes back to them instead of the Design Summary. The documents that open as
// they were: the sources and their editors, the RTL schematic, the summary, the pin planner, iMPACT,
// and the simulation (ISim) and the board emulator, run again for the same module and model (a
// netlist model only while it exists); not a report or a technology schematic (a run's output).
const VIEW_KEY = name => `silinx.view.${name}`;
const inProject = p => S.fileTree?.includes(p);
const REOPEN = [
  [/^file:(.+)$/, p => inProject(p) && openFile(p)], [/^sch:(.+)$/, p => inProject(p) && openSch(p)],
  [/^asm:(.+)$/, p => inProject(p) && openAsm(p)], [/^tt:(.+)$/, p => inProject(p) && openTt(p)],
  [/^fsm:(.+)$/, p => inProject(p) && openFsm(p)], [/^pn:(.+)$/, p => inProject(p) && openPetri(p)], [/^rtl:(.+)$/, m => moduleInfo(m) && openSchematic(m)],
  [/^isim:([^@]+)(?:@(\w+))?$/, async (mod, model) => await reopenable(mod, model) && runSimulation(mod, model || undefined)],
  [/^emulator:([^@]+)(?:@(\w+))?$/, async (mod, model) => await reopenable(mod, model) && openEmulator(mod, { model: model || null })],
  [/^summary$/, () => openSummary()], [/^pins$/, () => S.project.top && openPinPlanner()], [/^impact$/, () => openImpact()],
];
// a module of the project, and its netlist model when one is asked for (no message when it is gone)
async function reopenable(mod, model) {
  if (!moduleInfo(mod)) return false;
  if (!model) return true;
  const rep = await api.reports(S.project.name).catch(() => null);
  return !!(rep?.simModels?.[model] && rep.top === S.project.top);
}
const reopenKey = d => d.reopen || d.id;
let keepView = false;   // while documents are closed or reopened together (a project closed, restored)
// every document closed, the view state kept as it was (a project closed or another opened): false when one stays open
export async function closeAllDocs() {
  keepView = true;
  try { for (const d of [...S.docs]) if (!await closeDoc(d)) return false; } finally { keepView = false; }
  return true;
}
function saveViewState() {
  if (keepView || !S.project) return;
  const open = S.docs.filter(d => d.project === S.project.name && REOPEN.some(([re]) => re.test(reopenKey(d)))).map(reopenKey);
  const active = S.active && reopenKey(S.active);
  const state = { open, active: open.includes(active) ? active : null, page: S.leftPage || null, view: S.view };
  try { localStorage.setItem(VIEW_KEY(S.project.name), JSON.stringify(state)); } catch { /* storage unavailable */ }
}
function savedViewState(name) {
  try { const v = JSON.parse(localStorage.getItem(VIEW_KEY(name)) || 'null'); return v && Array.isArray(v.open) ? v : null; } catch { return null; }
}
/** Reopens the project's documents as they were; false when nothing was kept (a first opening). */
export async function restoreViewState(name) {
  const v = savedViewState(name);
  if (!v) return false;
  keepView = true;
  try {
    if (v.view === 'sim' || v.view === 'impl') { if (v.view !== S.view) setView(v.view); }
    if (['design', 'files', 'libs'].includes(v.page)) showLeftPage(v.page);
    for (const id of v.open) {
      const [re, open] = REOPEN.find(([r]) => r.test(id)) || [];
      if (!re) continue;
      try { await open(...re.exec(id).slice(1)); } catch { /* a document that cannot open any more */ }
    }
    const active = v.active && S.docs.find(d => reopenKey(d) === v.active);
    if (active) activateDoc(active);
  } finally { keepView = false; }
  saveViewState();
  return true;
}
export function closeDocByPath(path) { for (const d of [...S.docs]) if (d.path === path) { d.dirty = false; closeDoc(d); } }

// ---- HDL / text editor
export async function openFile(path, line, col) {
  if (!S.project) return;
  if (path.endsWith('.asm.json')) return openAsm(path);
  if (path.endsWith('.sch.json')) return openSch(path);
  if (path.endsWith('.tt.json')) return openTt(path);
  if (path.endsWith('.fsm.json')) return openFsm(path);
  if (path.endsWith('.pn.json')) return openPetri(path);
  const id = `file:${path}`;
  let doc = findDoc(id);
  if (!doc) {
    let text;
    try { text = await api.readFile(S.project.name, path); }
    catch (e) { toast(`Cannot open ${path}: ${e.message}`, 'error'); return; }
    const lang = /\.(vhd|vhdl)$/i.test(path) ? 'vhdl' : /\.(v|vh|sv)$/i.test(path) ? 'verilog' : /\.ucf$/i.test(path) ? 'ucf' : 'text';
    doc = openDoc({
      id, path, title: path.split('/').pop(), tooltip: path, icon: lang === 'vhdl' ? 'vhdl' : lang === 'verilog' ? 'verilog' : lang === 'ucf' ? 'ucf' : 'file',
      create(el, d) {
        const tplBtn = h('button', { class: 'btn', style: { minWidth: '0' }, title: 'Language Templates' }, 'Templates ▾');
        const bar = h('div', { class: 'editor-bar' },
          h('button', { class: 'tb-btn', title: 'Undo', html: icons.undo, onclick: () => d.editor.exec('undo') }),
          h('button', { class: 'tb-btn', title: 'Redo', html: icons.redo, onclick: () => d.editor.exec('redo') }),
          h('div', { class: 'tb-sep' }),
          h('button', { class: 'tb-btn', title: 'Find (Ctrl+F)', html: icons.find, onclick: () => d.editor.exec('findPersistent') }),
          (lang === 'vhdl' || lang === 'verilog') ? tplBtn : null,
          (lang === 'vhdl' || lang === 'verilog' || lang === 'ucf') ? h('button', { class: 'btn', style: { minWidth: '0' }, title: 'Check Syntax of this file', onclick: () => (lang === 'ucf' ? checkUcfFile(path) : checkFileSyntax(path)) }, h('span', { class: 'ico-inline', html: icons.ok }), ' Check Syntax') : null,
          h('span', { class: 'path' }, path),
          ...Object.entries(S.schOwners || {}).filter(([, gen]) => gen === path).map(([sch]) => syncBanner(path, sch)));
        tplBtn.addEventListener('click', e => {
          const r = tplBtn.getBoundingClientRect();
          popupMenu([
            ...SNIPPETS[lang].map(s => ({ label: s.name, action: () => d.editor.insertText(s.text) })),
            '-',
            { label: 'Instantiate module', submenu: S.modules.filter(m => m.file !== path).map(m => ({ label: m.name, action: () => d.editor.insertText(instTemplate(m, lang) + '$0') })) },
          ], r.left, r.bottom);
        });
        const host = h('div', { class: 'editor-host' });
        el.append(bar, host);
        d.editor = createEditor(host, {
          text, lang, path,
          project: () => ({ modules: S.modules }),
          onChange: (info) => { setDirty(d, !d.editor.isClean(), info); if (lang === 'ucf') liveUcf(); else if (lang === 'vhdl' || lang === 'verilog') liveHdl(); },
          onSave: () => flushDoc(d),
          onGotoDefinition: ({ file, line: ln }) => openFile(file, ln),
          onCursor: (l, c) => { if (S.active === d) $('status-pos').textContent = `Ln ${l}  Col ${c}`; },
          onRename: () => renameSymbolIn(d, lang, path),
          onFix: () => recheckFile(path),
        });
        d.editor.setDiagnostics(S.diags.filter(x => x.file === path));
        let ucfTimer = null;
        const liveUcf = () => { clearTimeout(ucfTimer); ucfTimer = setTimeout(async () => { if (d.editor) d.editor.setDiagnostics(await ucfDiagnostics(d.editor.getValue(), path)); }, 400); };
        if (lang === 'ucf') liveUcf();
        // HDL: full check (parse + elaboration against the rest of the project) as you type
        let hdlTimer = null;
        const liveHdl = () => {
          clearTimeout(hdlTimer);
          hdlTimer = setTimeout(() => {
            if (!d.editor || !S.project) return;
            try { d.editor.setDiagnostics(hdlDiagnostics(path, d.editor.getValue()).filter(x => x.file === path)); } catch { /* keep the parser markers */ }
          }, 600);
        };
        if (lang === 'vhdl' || lang === 'verilog') liveHdl();
        d.liveCheck = lang === 'ucf' ? liveUcf : (lang === 'vhdl' || lang === 'verilog') ? liveHdl : null;
        const ed = d.editor;
        ed.view.dom.addEventListener('contextmenu', e => {
          e.preventDefault();
          const hdl = lang === 'vhdl' || lang === 'verilog';
          const hasSel = ed.somethingSelected();
          const sch = S.hdlToSch?.[path];
          const at = ed.posAt(e.clientX, e.clientY);
          popupMenu([
            { label: 'Undo', action: () => ed.exec('undo'), disabled: !ed.historySize().undo },
            { label: 'Redo', action: () => ed.exec('redo'), disabled: !ed.historySize().redo },
            '-',
            { label: 'Cut', action: () => { navigator.clipboard?.writeText(ed.getSelection()); ed.replaceSelection(''); }, disabled: !hasSel },
            { label: 'Copy', action: () => navigator.clipboard?.writeText(ed.getSelection()), disabled: !hasSel },
            { label: 'Paste', action: async () => { try { ed.replaceSelection(await navigator.clipboard.readText()); ed.focus(); } catch { toast('Use Ctrl+V to paste', 'info'); } } },
            { label: 'Select All', action: () => ed.exec('selectAll') },
            '-',
            hdl ? { label: 'Toggle Comment', action: () => ed.exec('toggleComment') } : null,
            { label: 'Find…', action: () => ed.exec('findPersistent') },
            hdl ? { label: 'Rename Symbol…', shortcut: 'F2', action: () => { if (!hasSel) ed.setCursor(at); renameSymbolIn(d, lang, path); } } : null,
            hdl ? { label: 'Quick Fix…', shortcut: 'Ctrl+.', action: () => { ed.setCursor(at); d.editor.showFixMenu(at.line); }, disabled: !d.editor.fixesOnLine(at.line).length } : null,
            hdl ? '-' : null,
            hdl ? { label: 'Language Templates', submenu: SNIPPETS[lang].map(sn => ({ label: sn.name, action: () => d.editor.insertText(sn.text) })) } : null,
            hdl ? { label: 'Instantiate module', submenu: S.modules.filter(m => m.file !== path).map(m => ({ label: m.name, action: () => d.editor.insertText(instTemplate(m, lang) + '$0') })) } : null,
            hdl ? '-' : null,
            hdl ? { label: 'Check Syntax', action: () => checkFileSyntax(path) } : null,
            lang === 'ucf' ? '-' : null,
            lang === 'ucf' ? { label: 'Check Syntax', action: () => checkUcfFile(path) } : null,
            lang === 'ucf' ? { label: 'I/O Pin Planning', action: () => openPinPlanner() } : null,
            sch ? { label: `Open ${viewTitle(sch)}`, action: () => openView(sch) } : null,
          ].filter(Boolean), e.clientX, e.clientY);
        });
        longPressMenu(ed.view.dom, { select: true });
        return {
          lang,
          onActivate: () => setTimeout(() => d.editor?.refresh(), 0),
          save: async ({ auto = false } = {}) => {
            const text = d.editor.getValue();
            await api.writeFile(S.project.name, path, text);
            // (only the text written is clean: an edit made meanwhile is saved next, see flushDoc)
            if (d.editor.getValue() === text) d.editor.markClean();
            setDirty(d, false);
            const src = S.sources.find(s => s.path === path);
            if (src) src.text = text;
            else await reloadProject(false);
            compileProject(); renderHierarchy(); markStale();
            status(`Saved ${path}`);
            // the other open editors depend on this file (ports, instances): check them again
            for (const od of S.docs) if (od !== d) od.liveCheck?.();
            // the drawing it is generated from follows the edit (not a Petri net: its HDL follows it only, #222)
            if (S.hdlToSch?.[path] && !isPn(S.hdlToSch[path]) && !S.syncing) (isAsm(S.hdlToSch[path]) ? syncAsmFromHdl : isTt(S.hdlToSch[path]) ? syncTtFromHdl : isFsm(S.hdlToSch[path]) ? syncFsmFromHdl : syncSchematicFromHdl)(path, { quiet: auto }).catch(e => log(`WARNING: ${viewNoun(S.hdlToSch[path])} not synchronized: ${e.message}`, 'warn'));
          },
          destroy: () => d.editor.destroy(),
        };
      },
    });
  } else activateDoc(doc);
  if (line) {
    // jump once the editor is laid out, unless the user has already moved the cursor (a delayed
    // timer, e.g. in a background tab, must not pull the cursor away from where they type)
    const ed = doc.editor, at = ed && JSON.stringify(ed.getCursor());
    setTimeout(() => { if (!ed || JSON.stringify(ed.getCursor()) === at) doc.editor?.gotoLine(line, col); }, 30);
  }
  return doc;
}

export async function openUcf() {
  const pj = S.project;
  if (!pj.constraints) { pj.constraints = 'constraints/top.ucf'; await saveProjectJson(); }
  if (!S.fileTree.includes(pj.constraints)) {
    const { ucfTemplate } = await import('./templates.js');
    await api.writeFile(pj.name, pj.constraints, ucfTemplate(pj));
    await reloadProject(false);
  }
  openFile(pj.constraints);
}

export function openInstTemplate(mod) {
  const m = moduleInfo(mod);
  if (!m) return;
  const lang = m.lang;
  const txt = (lang === 'vhdl'
    ? `-- Instantiation template for ${m.name} (copy into the architecture body)\n\n`
    : `// Instantiation template for ${m.name}\n\n`) + instTemplate(m, lang) + '\n';
  openDoc({
    id: `tpl:${mod}`, title: `${mod}.${lang === 'vhdl' ? 'vhi' : 'tfi'}`, icon: 'template',
    create(el, d) {
      const host = h('div', { class: 'editor-host' });
      el.append(host);
      d.editor = createEditor(host, { text: txt, lang, readOnly: true, path: '' });
      return { onActivate: () => setTimeout(() => d.editor.refresh(), 0) };
    },
  });
}

// ---- schematic
// Netlist written by netgen for `step` (postsynth / posttrans / postmap / postpar) with the
// Silinx primitive models, ready to compile. When it is not generated yet, the user is offered to
// generate it (the process of the Processes pane, with the steps before it) and the caller goes on
// with it (#490); null when it is not generated (cancelled, failed, or it cannot run here).
// `action`: what the caller does with it ('Simulate', 'Emulate', 'Show'), `title` its dialog's title.
async function netlistSources(step, { hier = false, action = 'Simulate', title = `${action} ${SIM_MODEL_NAMES[step]} Model` } = {}) {
  const name = SIM_MODEL_NAMES[step];
  const modelOf = async () => {
    const rep = await api.reports(S.project.name).catch(() => null);
    return rep?.simModels?.[step] && rep.top === S.project.top ? rep.simModels[step] : null;
  };
  let m = await modelOf();
  if (!m) {
    if (!await offerSimModel(step, action, title)) return null;
    m = await modelOf();
    if (!m) return null;
  }
  const stage = { postsynth: 'synth', posttrans: 'translate', postmap: 'map', postpar: 'par' }[step];
  if (S.status[stage] === 'stale' || S.status[step] === 'stale') log(`WARNING: the ${name.toLowerCase()} model is older than the sources (run "${EXTRA_STEPS[step]}" again to update it).`, 'warn');
  let raw = await api.readFile(S.project.name, m.path);
  // the post-place & route model simulated with its timing (#122; ISE's, with netgen's SDF: #558): the delays and
  // setup checks of its SDF built in (core/sdf.js); the emulator runs it without
  if (m.sdf && action === 'Simulate') {
    try {
      const { parseSdf, annotateSdf } = await import('/core/sdf.js');
      const a = annotateSdf(raw, 'vhdl', parseSdf(await api.readFile(S.project.name, m.sdf)));
      raw = a.text;
      log(`Timing: ${m.sdf} (${a.annotated} instances with their delays).`);
    } catch (e) { log(`WARNING: the model is simulated without its timing (${m.sdf}: ${e.message}).`, 'warn'); }
  }
  const { scalarizeNetlist, regroupNetlist } = await import('/core/netlist-hier.js');
  // single-bit nets simulate several times faster than netgen's vector signals (same behaviour);
  // the technology schematic regroups the flat netlist by the design's own instances
  let text = scalarizeNetlist(raw);
  if (hier) {
    try {
      const design = elaborate(compile(S.sources.filter(x => inView(x.role, false) && (x.lang === 'vhdl' || x.lang === 'verilog'))), S.project.top);
      text = regroupNetlist(raw, (design.top?.children || []).map(c => c.name)).text;
    } catch (e) { log(`WARNING: technology schematic shown flat (${e.message})`, 'warn'); }
  }
  const net = { path: m.path, lang: 'vhdl', text, role: 'design', netlist: step };
  return [...primitiveSources([net]), net];
}
// The dialog of a model not generated yet (#490): "Generate and <action>" runs its process when the
// toolchain can (the Silinx toolchain, or ISE in an ISE mode), else it
// says why. true when the process ran and ended without errors.
const SIM_MODEL_THEN = { Simulate: 'the simulation starts', Emulate: 'the emulator opens', Show: 'the technology schematic opens' };
async function offerSimModel(step, action, title) {
  const proc = EXTRA_STEPS[step];
  let why = null;
  if (openMode()) {
    if (ISE_ONLY.has(step)) why = `"${proc}" needs the Xilinx ISE toolchain: it is not available with the Silinx toolchain (choose an ISE mode in Toolchain Settings).`;
  } else {
    const tc = S.toolchain || await api.toolchain().catch(() => null);
    if (!tc?.ise?.available) why = `"${proc}" needs the Xilinx ISE toolchain, which is not available (configure it in Tools ▸ Toolchain Settings).`;
  }
  const p = (text, first) => h('div', { style: first ? {} : { marginTop: '8px' } }, text);
  const text = h('div', { class: 'msg-text' }, p(`There is no ${SIM_MODEL_NAMES[step].toLowerCase()} simulation model of '${S.project.top}' yet.`, true),
    p(why || `Generate it now with "${proc}"? When it ends without errors, ${SIM_MODEL_THEN[action]}.`));
  const go = await dialog({
    title, width: 440, className: 'sim-model-dlg',
    body: h('div', { class: `msg msg-${why ? 'info' : 'question'}` }, h('div', { class: 'msg-icon' }, why ? 'i' : '?'), text),
    buttons: why ? [{ label: 'OK', value: null, primary: true }] : [{ label: `Generate and ${action}`, value: true, primary: true }, { label: 'Cancel', value: null }],
  });
  if (!go) return false;
  return !!await generateSimModel(S.project.top, step);
}
const isPrimitive = inst => /^<silinx>\//.test(inst?.mod?.file || inst?.file || '');

// View Technology Schematic: the post-synthesis netlist (LUTs, flip-flops, carry chain…)
export async function openTechSchematic(mod) {
  if (openMode()) return openSilinxTechSchematic(mod);
  const srcs = await netlistSources('postsynth', { hier: true, action: 'Show', title: 'View Technology Schematic' });
  if (srcs) return openSchematic(mod, { netlist: srcs });
}

// …in the Silinx toolchain: the netlist of its synthesis (Yosys's JSON, build/open/<top>.json; Synthesize
// runs first when there is none or the sources changed since), drawn by core/fpga/techview.js
async function openSilinxTechSchematic(mod) {
  let top = S.project.top;
  const netlistOf = async () => {
    const rep = await api.reports(S.project.name).catch(() => null);
    return rep && rep.top === top && rep.files?.netlist ? rep.files.netlist : null;
  };
  let file = ['ok', 'warn'].includes(S.status.synth) && mod === top ? await netlistOf() : null;
  if (!file) {
    if (!await runImpl(mod, ['synth'])) return;
    top = S.project.top;
    file = await netlistOf();
  }
  let json;
  try { json = await readBuildFile(file || `build/open/${top}.json`); } catch (e) { log(`ERROR: Technology Schematic: no netlist of '${top}' (${e.message}): run Synthesize.`, 'err'); return; }
  setStatus('tech', 'running');
  status(`Reading the netlist of ${top}…`);
  let groups;
  try {
    const design = elaborate(compile(S.sources.filter(x => inView(x.role, false) && (x.lang === 'vhdl' || x.lang === 'verilog'))), top);
    groups = (design.top?.children || []).map(c => c.name);
  } catch { /* the instances from the netlist's names */ }
  const { technologyNetlist } = await import('/core/fpga/techview.js');
  let r;
  try { r = technologyNetlist(json, { groups }); } catch (e) { setStatus('tech', 'err'); log(`ERROR: Technology Schematic: ${e.message}`, 'err'); status('Ready'); return; }
  const blocks = Object.entries(r.groups);
  log(`Technology Schematic of '${top}': the netlist of the Silinx toolchain's synthesis (${file || `build/open/${top}.json`}), ${r.cells} cells${blocks.length ? ` in ${blocks.length} block(s): ${blocks.map(([g, n]) => `${g} (${n})`).join(', ')}` : ''}.`, 'info');
  const net = { path: (file || `build/open/${top}.json`).replace(/\.json$/, '_tech.vhd'), lang: 'vhdl', text: r.text, role: 'design', netlist: 'open' };
  return openSchematic(r.name, { netlist: [...primitiveSources([net]), net] });
}

export async function openSchematic(mod, { netlist = null } = {}) {
  await saveAll();
  const sim = S.view === 'sim';
  const srcs = netlist || S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, sim));
  const all = withPrimitives(srcs);
  const lib = compile(all);
  const design = elaborate(lib, mod);
  const diags = diagsFor(lib, design);
  setDiagnostics(diags);
  if (!design.top) { log(`ERROR: cannot elaborate '${mod}'`, 'err'); showConsolePage('errors'); return; }
  if (diags.some(d => d.severity === 'error')) log(`Schematic of '${mod}' generated with errors (see Errors tab).`, 'warn');
  setStatus(netlist ? 'tech' : sim ? 'rtl-sim' : 'rtl', diags.some(d => d.severity === 'error') ? 'warn' : 'ok');
  const kindName = netlist ? 'Technology' : 'RTL';
  const { mountSchEditor } = await import('./sch-editor.js');
  const { schematicFromHdl, modulesFromLibrary } = await import('/core/schdoc.js');
  const sources = Object.fromEntries(srcs.map(x => [x.path, x.text]));
  // the names as written in the sources (VHDL is lower-cased by the elaborator, #131), the primitives' too (LUT4, FDRE)
  const modules = modulesFromLibrary(lib, { sources: Object.fromEntries(all.map(x => [x.path, x.text])), asWritten: true });
  const modName = name => Object.values(modules).find(m => m.name.toLowerCase() === String(name).toLowerCase())?.name || name;
  const elk = window.ELK ? new window.ELK() : null;
  const id = `${netlist ? 'tech' : 'rtl'}:${mod}`;
  const existing = findDoc(id);
  if (existing) await closeDoc(existing);
  openDoc({
    id, title: `${mod} (${kindName})`, icon: 'schematic',
    create(el, docRef) {
      const bar = h('div', { class: 'doc-toolbar rtl-crumbs' });
      const host = h('div', { class: 'doc-body' });
      el.append(bar, host);
      let ed = null, cur = null;
      const crumbs = inst => { const out = []; for (let i = inst; i; i = i.parent) out.unshift(i); return out; };
      // an instance or a module by its name in the schematic (as written: VHDL names match in any case)
      const sameName = (a, b, vhdl) => a === b || (vhdl && String(a).toLowerCase() === String(b).toLowerCase());
      const shown = new Map();    // instance -> its name as the schematic writes it
      const label = i => `${shown.get(i) || (i.parent ? i.name : modName(i.name))} : ${modName(i.module)}`;
      // ISE-style hierarchy navigation: up to the parent, push into the selected instance
      const upBtn = h('button', { class: 'btn rtl-nav', title: 'Up to the parent module (Backspace)', onclick: () => cur?.parent && show(cur.parent) }, '⬆ Up');
      const intoBtn = h('button', { class: 'btn rtl-nav', title: 'Push into the selected instance (Enter, or double-click it)', onclick: () => ed?.openSelected() }, '⬇ Push into');
      const canEnter = s => !!(s && cur?.children.some(c => (sameName(c.name, s.name, cur.mod?.lang === 'vhdl') || sameName(c.module, s.params.module, c.mod?.lang === 'vhdl')) && !c.blackbox && !isPrimitive(c)));
      // the bar (Up, the crumbs) says the instance drawn: it changes with the drawing, once that is laid
      // out, not before (a click meanwhile went to the drawing left, its properties then replaced, #346)
      const drawBar = (inst, info) => {
        bar.innerHTML = '';
        upBtn.disabled = !inst.parent; intoBtn.disabled = true;
        bar.append(upBtn, intoBtn, h('span', { class: 'rtl-ro' }, netlist ? 'Technology Schematic (read-only): the post-synthesis netlist' : 'RTL Schematic (read-only)'));
        crumbs(inst).forEach((i, k, all) => {
          bar.append(h('span', { class: 'sep' }, k ? ' › ' : ' — '));
          bar.append(k === all.length - 1 ? h('b', {}, label(i)) : h('a', { onclick: () => show(i) }, label(i)));
        });
        if (info) bar.append(h('span', { class: 'spacer' }), h('a', { onclick: () => openFile(info.file, info.line) }, `Open ${info.file.split('/').pop()}`));
      };
      let want = null;   // the instance asked for last (its drawing being laid out)
      const show = async inst => {
        want = inst;
        const info = moduleInfo(inst.module);
        status(`Drawing ${kindName} schematic of ${inst.module}…`);
        try {
          const doc = await schematicFromHdl(inst, { sources, modules, layout: elk ? g => elk.layout(g) : undefined, lang: info?.lang || 'vhdl' });
          if (want !== inst || docRef.closed) return;
          cur = inst;
          if (!ed) {
            ed = mountSchEditor(host, {
              doc, modules, readOnly: true,
              onSelect: s => { intoBtn.disabled = !canEnter(s); },
              onUp: () => cur?.parent && show(cur.parent),
              onOpenModule: (name, { instance } = {}) => {
                const child = cur.children.find(c => sameName(c.name, instance, cur.mod?.lang === 'vhdl')) || cur.children.find(c => sameName(c.module, name, c.mod?.lang === 'vhdl'));
                if (child && !child.blackbox && !isPrimitive(child)) { if (instance) shown.set(child, instance); show(child); }
              },
            });
            docRef.viewer = ed;   // (the read-only editor of the view: tests)
          } else ed.setDoc(doc);
          drawBar(inst, info);
          setTimeout(() => ed.fit?.(), 50);
        } catch (e) { log(`ERROR: ${kindName} schematic of ${inst.module}: ${e.message}`, 'err'); }
        finally { status('Ready'); }
      };
      show(design.top);
      return { destroy: () => ed?.destroy?.() };
    },
  });
}

// ---- simulation (ISim)
async function readDataFiles() {
  const map = new Map(S.sources.map(s => [s.path, s.text]));
  for (const f of S.fileTree.filter(f => /\.(mem|hex|txt|dat|coe|bin)$/i.test(f))) {
    try { map.set(f, await api.readFile(S.project.name, f)); } catch { /* ignore */ }
  }
  return map;
}

// model: undefined = behavioural (the HDL sources); postsynth / posttrans / postmap / postpar =
// the testbench against that netgen netlist (compiled after the sources: its entity replaces the RTL one)
export async function runSimulation(mod, model) {
  countEvent('simulate');
  try { return await runSimulationInner(mod, model); }
  catch (e) { setStatus(model ? `sim-${model}` : 'sim-run', 'err'); log(`ERROR: simulation: ${e.message}`, 'err'); }
}
async function runSimulationInner(mod, model) {
  await saveAll();
  if (!await checkSyntax(mod, true)) return;
  const net = model ? await netlistSources(model) : null;
  if (model && !net) return;
  const procId = model ? `sim-${model}` : 'sim-run';
  const title = model ? `Simulate ${SIM_MODEL_NAMES[model]} Model` : 'Simulate Behavioral Model';
  setStatus(procId, 'running');
  log(`\nStarted : "${title}".\n\nBuilding simulation model for top '${mod}'${model ? ` with the ${SIM_MODEL_NAMES[model].toLowerCase()} netlist of '${S.project.top}'` : ''}...`, 'hdr');
  const srcs = [...S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, true)), ...(net || [])];   // no implementation-only files
  const lib = compile(withPrimitives(srcs));
  if (model) lib.errors = lib.errors.filter(e => !/redefined/.test(e.message));
  const design = elaborate(lib, mod);
  const files = await readDataFiles();
  const sim = new Simulator(design, { files });
  if (!design.top) { setStatus(procId, 'err'); log(`ERROR: cannot elaborate '${mod}': ${design.diags.map(d => d.message).join('; ')}`, 'err'); return; }
  if (!await confirmElabErrors(title, lib, design)) { setStatus(procId, 'err'); return; }
  log(`Simulation model ready: ${design.signals.length} signals, ${design.procs.length} processes. Launching ISim view.`, 'ok');
  setStatus(procId, 'ok');
  const { mountISim } = await import('./isim.js');
  const id = 'isim';
  const old = findDoc(id);
  if (old) await closeDoc(old);
  openDoc({
    id, title: `ISim (${mod}${model ? `, ${SIM_MODEL_NAMES[model]}` : ''})`, icon: 'wave', reopen: `isim:${mod}${model ? `@${model}` : ''}`,
    create(el) {
      // ISim runs 1000 ns at start-up, or the module's drawn stimuli (#336), saved in the project: of the module's
      // inputs, or (a test bench, no ports) of its unit under test's, forced over what the bench drives them with
      const inst = (design.top.ports || []).some(p => p.dir === 'in') ? design.top
        : (design.top.children || []).find(c => (c.ports || []).some(p => p.dir === 'in')) || design.top;
      const stimuli = {
        model: S.project.stimuli?.[mod] || null, inst,
        ports: (inst.ports || []).map(p => ({ name: p.name, dir: p.dir, width: p.sig.t.w || 1 })),
        onChange: m => { S.project.stimuli = { ...(S.project.stimuli || {}), [mod]: m }; saveProjectJson().catch(e => toast(`Cannot save the stimuli: ${e.message}`, 'error')); },
        onSaveTestbench: m => saveStimTestbench(inst === design.top ? mod : inst.module, inst, m),
      };
      const view = mountISim(el, { design, sim, title: mod, initialRun: 1_000_000, stimuli, onOpenSource: ref => ref?.file && openFile(ref.file, ref.line) });
      return { destroy: () => view.destroy?.(), view, onActivate: () => setTimeout(() => view.refresh?.(), 0) };
    },
  });
}

// The stimuli drawn in ISim saved as a self-checking test bench (#336, core/stimuli.js -> core/testbench.js): next
// to the module's file, in the project's language, a simulation source
async function saveStimTestbench(mod, inst, m) {
  const { tbPorts, generateTestbench } = await import('/core/testbench.js');
  const { testbenchOptions } = await import('/core/stimuli.js');
  const title = 'Save as Test Bench';
  const info = moduleInfo(mod);
  // (tb_<module>, or tb_<module>_2… when the project has that test bench already)
  let dft = `tb_${mod}`;
  for (let k = 2; moduleInfo(dft); k++) dft = `tb_${mod}_${k}`;
  const name = String(await promptDlg(title, 'Test bench name:', dft) ?? '').trim();
  if (!name) return;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return alertDlg(title, `'${name}' is not a valid name (a letter, then letters, digits or _).`, 'error');
  const lang = (S.project.preferredLanguage || info?.lang) === 'verilog' ? 'verilog' : 'vhdl';
  const dir = String(info?.file || 'src/x').replace(/\/[^/]*$/, '');
  const path = `${dir}/${name}.${lang === 'verilog' ? 'v' : 'vhd'}`;
  const other = wiz.moduleElsewhere(name, path);
  if (other) return alertDlg(title, `The project already has a module '${other.name}' (${other.file}).`, 'error');
  if (S.fileTree?.includes(path) && !await confirmDlg(title, `${path} exists. Replace it?`)) return;
  let text;
  try {
    const types = Object.fromEntries((info?.portList || []).map(p => [p.name, p.type]));
    text = generateTestbench(testbenchOptions(m, { name, lang, uut: { name: mod }, ports: tbPorts({ top: inst }, types) }));
  } catch (e) { return alertDlg(title, e.message, 'error'); }
  await wiz.closeBeforeReplace(path);
  await api.writeFile(S.project.name, path, text);
  await reloadProject();
  // (a simulation source, whatever its name)
  const f = S.project.files?.find(x => x.path === path);
  if (f && f.role !== 'sim') { f.role = 'sim'; await saveProjectJson(); await reloadProject(); }
  log(`Save as Test Bench: created ${path} from the stimuli of '${mod}' (${m.cycles} cycle(s)); run Simulate Behavioral Model on ${name} to check the design.`, 'ok');
  toast(`Test bench ${path} created`, 'ok');
}

// Elaboration errors of a design about to be simulated (e.g. a netlist cell without a model, which
// would run as an empty black box): listed in the console and the Errors tab; true = run anyway.
async function confirmElabErrors(title, lib, design) {
  const errs = diagsFor(lib, design).filter(d => (d.severity || 'error') === 'error');
  if (!errs.length) return true;
  setDiagnostics(diagsFor(lib, design));
  for (const d of errs.slice(0, 20)) log(`ERROR: ${d.file ? `${d.file}${d.line ? `:${d.line}` : ''}: ` : ''}${d.message}`, 'err');
  if (errs.length > 20) log(`… ${errs.length - 20} more error(s) in the Errors tab.`, 'err');
  const missing = errs.filter(d => /not found/.test(d.message)).length;
  return !!await confirmDlg(title, `The design has ${errs.length} elaboration error(s)${missing ? `, ${missing} of them instances of cells or entities that have no model (they would do nothing)` : ''}:\n\n`
    + `${errs.slice(0, 5).map(d => `• ${d.message}`).join('\n')}${errs.length > 5 ? '\n• …' : ''}\n\nThe results will not match the hardware. Run anyway?`);
}

// ---- Board emulator: the design (behavioural RTL) on a virtual board, wired by the UCF
export async function openEmulator(mod, { scale, model = null, engine = null } = {}) {
  if (!mod) { toast('Select the top module first'); return; }
  await saveAll();
  const board = projectBoard();
  if (!board) { alertDlg('Board Emulator', 'The project has no board. Choose one in Project ▸ Design Properties (e.g. Digilent Basys2).'); return; }
  if (!await checkSyntax(mod)) return;
  await loadUcfText();   // the pins as they are now (pin planner / editor changes)
  // the design to run: the HDL (RTL) or a netlist generated by netgen (post-synthesis …)
  // (the model first: it may be generated now, #490)
  const net = model ? await netlistSources(model, { action: 'Emulate' }) : null;
  if (model && !net) return;
  let rep = null;
  try { rep = await api.reports(S.project.name); } catch { /* standalone / no build */ }
  const models = Object.keys(SIM_MODEL_NAMES).filter(k => rep?.simModels?.[k] && rep.top === mod);
  const srcs = net || S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, false));   // the implemented design
  const { timingGenerics, autoTimeScale, scaledGenerics } = await import('/core/emulate.js');
  let design, lib, gens = [];
  try {
    lib = compile(withPrimitives(srcs));
    design = elaborate(lib, mod);
    if (!design.top) throw new Error(design.diags.map(d => d.message).join('; ') || `cannot elaborate '${mod}'`);
    gens = model ? [] : timingGenerics(design.top?.params);   // a netlist has its constants built in
  } catch (e) { alertDlg('Board Emulator', `Cannot build the design: ${e.message}`, 'error'); return; }
  if (!await confirmElabErrors('Board Emulator', lib, design)) return;
  const { parseUcf } = await import('/core/ucf.js');
  const assignments = S.ucfText ? parseUcf(S.ucfText, { ports: design.top.ports.map(ucfPort) }).assignments : {};
  if (!S.ucfText) log('WARNING: the project has no UCF: the ports are not connected to the board (use I/O Pin Planning).', 'warn');
  const files = await readDataFiles();
  const { mountEmulator, emulatorYosys } = await import('./emulator.js');
  // the engine (#418): the design compiled (its netlist by Yosys, at the timing generics' real values unless
  // divided), else (it cannot be, or the event-driven engine is chosen) the event-driven simulator, with the
  // large timing generics (dividers, debouncers) divided so that the design visibly runs. The document opens
  // at once, the board once the design is compiled (Yosys may take seconds to load the first time).
  async function start() {
    let netlist = null, reason = null, d = design, k = scale;
    if (engine !== 'event') {
      const s1 = k ?? 1;
      const d1 = s1 > 1 && gens.length ? elaborate(lib, mod, { generics: scaledGenerics(gens, s1) }) : design;
      try {
        const { netlistOf } = await import('/core/compiled-sim.js');
        netlist = await netlistOf(d1, { run: await emulatorYosys(api.standalone) });
        d = d1;
        k = s1;
      } catch (e) { reason = e.message; }
    }
    k ??= autoTimeScale(gens);
    if (!netlist && k > 1 && gens.length) d = elaborate(lib, mod, { generics: scaledGenerics(gens, k) });
    return { netlist, reason, design: d, scale: k };
  }
  const id = 'emulator';
  const old = findDoc(id);
  if (old) await closeDoc(old);
  openDoc({
    id, title: `Board Emulator (${mod}${model ? `, ${SIM_MODEL_NAMES[model]}` : ''})`, icon: 'board', reopen: `emulator:${mod}${model ? `@${model}` : ''}`,
    create(el, doc) {
      let closed = false;
      const wait = document.createElement('div');
      wait.className = 'emu-hint';
      wait.style.padding = '12px';
      wait.textContent = engine === 'event' ? 'Starting the Board Emulator…' : 'Compiling the design for the Board Emulator (Yosys)…';
      el.append(wait);
      start().then((r) => {
        if (closed) return;
        wait.remove();
        const view = mountEmulator(el, { design: r.design, board, assignments, title: `${mod}${model ? ` — ${SIM_MODEL_NAMES[model]} netlist` : ''}`, files,
          timing: { gens, scale: r.scale, onChange: (k) => setTimeout(() => openEmulator(mod, { scale: k, model, engine }), 0) },
          model: { current: model, available: models, names: SIM_MODEL_NAMES,
            onChange: (m) => setTimeout(() => openEmulator(mod, { model: m || null, engine }), 0) },
          engine: { netlist: r.netlist, reason: r.reason, onChange: (e) => setTimeout(() => openEmulator(mod, { model, engine: e }), 0) } });
        doc.view = view;
        log(`Board Emulator: '${mod}' (${model ? `${SIM_MODEL_NAMES[model]} netlist` : 'RTL'}, ${view.engine === 'compiled' ? 'compiled' : 'event-driven'}) on ${board.name} — ${view.wiring.bits.length} port bit(s) on board resources${view.wiring.unmapped.length ? `, ${view.wiring.unmapped.length} not connected` : ''}.`, 'ok');
      }).catch((e) => { if (!closed) { wait.textContent = `Cannot build the design: ${e.message}`; log(`ERROR: Board Emulator: ${e.message}`, 'err'); } });
      return { destroy: () => { closed = true; doc.view?.destroy(); } };
    },
  });
}

// ------------------------------------------------------------------ drawings and their HDL (web/js/drawings.js)

// ---- Rename Symbol (F2) in an HDL editor: the name under the cursor, everywhere it means the same
// object in the file; a port / generic also in the instances of its module in the other files
function renameSymbolIn(d, lang, path) {
  if (!d.editor) return;
  const findModule = name => S.modules.find(m => m.name.toLowerCase() === String(name).toLowerCase());
  return renameSymbolAtCursor({
    editor: d.editor, lang, path,
    // (not the HDL generated from a drawing without a file of its own: it follows the drawing)
    sources: () => S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && !s.view).map(s => ({ ...s, text: S.docs.find(o => o.path === s.path && o.editor)?.editor.getValue() ?? s.text })),
    drawings: () => S.sources.filter(s => s.view),
    isModule: name => !!findModule(name),
    renameModule: name => renameDialog(findModule(name)?.file || path, findModule(name)?.name || name),
    // an open file is edited in its editor (its own Undo); the others are written
    writeSource: async (p, text, edits, name) => {
      const od = S.docs.find(o => o.path === p && o.editor);
      if (od) { applyEdits(od.editor, edits, name); return; }
      await api.writeFile(S.project.name, p, text);
      const src = S.sources.find(x => x.path === p);
      if (src) src.text = text;
      compileProject();
    },
  });
}

// ---- rename a source (file and/or the module it defines), updating everything that refers to it
const extOf = p => (/\.(sch|asm|tt|fsm|pn)\.json$/i.exec(p) || /\.[^./]+$/.exec(p) || [''])[0];
const dirOf = p => (p.includes('/') ? p.replace(/\/[^/]*$/, '/') : '');

export async function renameDialog(file, mod = null) {
  if (!S.project) return;
  await saveAll();
  const mods = S.modules.filter(m => m.file === file && m.kind !== 'package').map(m => m.name);
  const modName = mod || (mods.length === 1 ? mods[0] : null);
  const base = file.slice(dirOf(file).length, file.length - extOf(file).length);
  const fIn = h('input', { type: 'text', value: file, style: { width: '100%' } });
  const mIn = modName ? h('input', { type: 'text', value: modName, style: { width: '100%' } }) : null;
  const follow = h('input', { type: 'checkbox', checked: !!modName && base.toLowerCase() === modName.toLowerCase() });
  if (mIn) mIn.addEventListener('input', () => { if (follow.checked) fIn.value = dirOf(file) + mIn.value.trim() + extOf(file); });
  const err = h('div', { class: 'hint', style: { color: 'var(--error-fg)', minHeight: '16px' } });
  const r = await dialog({
    title: 'Rename', width: 520,
    body: h('div', {},
      h('div', { class: 'form-grid' },
        ...(mIn ? [h('label', {}, modName && S.modules.find(m => m.name === modName)?.lang === 'vhdl' ? 'Entity:' : 'Module:'), mIn] : []),
        h('label', {}, 'File:'), fIn,
        ...(mIn ? [h('span'), h('label', {}, follow, ' File name follows the module name')] : [])),
      h('div', { class: 'hint', style: { marginTop: '8px' } }, mIn
        ? 'Renaming the module also updates its instances in the other sources, schematics, linked charts and the project top.'
        : 'References to this file in the project (synchronized schematics/charts, constraints) are updated.'),
      err),
    buttons: [{ label: 'Rename', primary: true, value: true, validate: () => { const m = check(); err.textContent = m || ''; return !m; } }, { label: 'Cancel', value: null }],
  });
  function check() {
      const to = fIn.value.trim(), nm = mIn?.value.trim();
      if (!to || to.startsWith('/') || to.split('/').includes('..')) return 'Enter a file path inside the project.';
      if (to !== file && S.fileTree.some(f => f.toLowerCase() === to.toLowerCase()) && to.toLowerCase() !== file.toLowerCase()) return `${to} already exists.`;
      if (mIn) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(nm)) return 'The module name must start with a letter and contain only letters, digits and _.';
        if (nm.toLowerCase() !== modName.toLowerCase() && S.modules.some(m => m.name.toLowerCase() === nm.toLowerCase())) return `A module named '${nm}' already exists.`;
      }
      return null;
  }
  if (!r) return;
  await renameSource(file, fIn.value.trim(), modName, mIn ? mIn.value.trim() : null);
}

async function renameSource(from, to, oldMod, newMod) {
  const pj = structuredClone(S.project);           // project settings to save (only if everything worked)
  const { renameModuleInSource, renameModuleInSchematic } = await import('/core/rename.js');
  const changed = new Map();                      // path -> new text
  const moved = new Map();                        // old path -> new path
  const views = {};                               // .sch.json / .asm.json -> parsed
  for (const f of S.fileTree.filter(f => /\.(sch|asm|tt|fsm|pn)\.json$/i.test(f))) {
    try { views[f] = JSON.parse(await api.readFile(pj.name, f)); } catch { /* skip */ }
  }
  S.syncing = true;
  try {
    if (newMod && oldMod && newMod !== oldMod) {
      for (const src of S.sources.filter(x => x.lang === 'vhdl' || x.lang === 'verilog')) {
        const t = renameModuleInSource(src.text, src.lang, oldMod, newMod);
        if (t !== src.text) changed.set(src.path, t);
      }
      for (const [f, d] of Object.entries(views)) {
        const linked = d.generatedFile === from;
        let ch = false;
        if (/\.sch\.json$/i.test(f)) ch = renameModuleInSchematic(d, oldMod, newMod, { linked });
        else if (linked && String(d.name).toLowerCase() === oldMod.toLowerCase()) { d.name = newMod; ch = true; }
        if (ch) changed.set(f, JSON.stringify(d, null, /\.(asm|tt|fsm)\.json$/i.test(f) ? 2 : 1));
        // a synchronized view named after the module follows it
        const vb = f.slice(dirOf(f).length, f.length - extOf(f).length);
        if (linked && vb.toLowerCase() === oldMod.toLowerCase()) moved.set(f, dirOf(f) + newMod + extOf(f));
      }
      const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
      if (eq(pj.top, oldMod)) pj.top = newMod;
      if (eq(pj.simTop, oldMod)) pj.simTop = newMod;
      if (pj.stimuli && pj.stimuli[oldMod]) { pj.stimuli[newMod] = pj.stimuli[oldMod]; delete pj.stimuli[oldMod]; }
    }
    if (to && to !== from) {
      moved.set(from, to);
      for (const [f, d] of Object.entries(views)) {
        if (d.generatedFile === from) { d.generatedFile = to; changed.set(f, JSON.stringify(d, null, /\.(asm|tt|fsm)\.json$/i.test(f) ? 2 : 1)); }
      }
    }
    // close the editors of files that move or change (reopened below)
    const reopen = [];
    for (const d of [...S.docs]) {
      if (d.path && (changed.has(d.path) || moved.has(d.path))) {
        if (S.active === d) reopen.unshift(moved.get(d.path) || d.path); else reopen.push(moved.get(d.path) || d.path);
        d.dirty = false; clearTimeout(d._autosave); await closeDoc(d);
      }
    }
    // 1. move the files (all or nothing: a failure undoes the moves already done)
    const done = [];
    try {
      for (const [a, b] of moved) { await api.renameFile(pj.name, a, b); done.push([a, b]); }
    } catch (e) {
      for (const [a, b] of done.reverse()) await api.renameFile(pj.name, b, a).catch(() => {});
      throw new Error(`could not rename ${[...moved].map(([a, b]) => `${a} → ${b}`).join(', ')}: ${e.message}. Nothing was changed.`);
    }
    // 2. the updated contents, at their new paths
    for (const [p, text] of changed) await api.writeFile(pj.name, moved.get(p) || p, text);
    // 3. project settings (top, sim top, stimuli) on top of the file list the moves produced
    const fresh = await api.project(pj.name);
    delete fresh.fileTree;
    Object.assign(fresh, { top: pj.top, simTop: pj.simTop, stimuli: pj.stimuli });
    S.project = await api.saveProject(pj.name, fresh);
    await reloadProject(false);
    // synchronized HDL of a renamed chart/schematic: regenerate it so its header names match
    if (newMod && newMod !== oldMod) {
      S.syncing = false;
      for (const [f, d] of Object.entries(views)) {
        if (!changed.has(f) || !d.generatedFile) continue;
        const vp = moved.get(f) || f;
        if (/\.asm\.json$/i.test(vp)) await syncHdlFromAsm(vp, d).catch(() => {});
        else if (isTt(vp)) await syncHdlFromTt(vp, d).catch(() => {});
        else if (isFsm(vp)) await syncHdlFromFsm(vp, d).catch(() => {});
        else await syncHdlFromSchematic(vp, d).catch(() => {});
      }
    }
    markStale();
    const parts = [];
    if (newMod && newMod !== oldMod) parts.push(`module '${oldMod}' renamed to '${newMod}' (${[...changed.keys()].length} file(s) updated)`);
    for (const [a, b] of moved) parts.push(`${a} → ${b}`);
    log(`Rename: ${parts.join('; ')}.`, 'ok');
    for (const p of reopen.reverse()) await openFile(p);
  } catch (e) {
    alertDlg('Rename', e.message, 'error');
    await reloadProject(false);
  } finally { S.syncing = false; }
}

// ---- summary, pin planner, impact
// ---- View Implemented Design (FPGA): web/js/fpgaview.js over the XDL of the routed design
// The hierarchy paths of the design as XST names them ('Inst_data/u1', from the top's instance
// labels) -> entity / module name, for the legend of the view.
function hierarchyEntities(top) {
  const out = new Map();
  const walk = (modName, prefix, depth) => {
    const info = moduleInfo(modName);
    if (!info || depth > 30) return;
    for (const k of instancesOf(info.mod)) {
      const p = prefix ? `${prefix}/${k.name}` : k.name;
      out.set(p.toLowerCase(), k.module);
      walk(k.module, p, depth + 1);
    }
  };
  if (top) walk(top, '', 0);
  return out;
}
export async function openFpgaView(mod = S.project?.top) {
  if (!S.project || !mod) return;
  const title = 'View Implemented Design (FPGA)';
  let m = await api.fpgaView(S.project.name).catch(e => ({ available: false, reason: 'error', error: e.message }));
  if (!m.available) {
    if (m.reason === 'error') { alertDlg(title, m.error, 'error'); return; }
    if (m.reason === 'no-top') { alertDlg(title, 'Set the top module of the project first.'); return; }
    // placed and routed and up to date: only the XDL export; otherwise the flow up to Place & Route first
    const routed = m.reason !== 'no-ncd' && ['ok', 'warn'].includes(S.status.par);
    if (!routed && !await confirmDlg(title, 'The FPGA view shows the design after Place & Route. Run Implement Design (Synthesize, Translate, Map, Place & Route) now?')) return;
    if (!await runImpl(mod, routed ? ['fpgaview'] : [...FLOW_UP_TO.par, 'fpgaview'])) return;
    m = await api.fpgaView(S.project.name).catch(e => ({ available: false, error: e.message }));
    if (!m.available) { alertDlg(title, `The implemented design could not be read${m.error ? `: ${m.error}` : ''}.`, 'error'); return; }
  }
  const { mountFpgaView } = await import('./fpgaview.js');
  const old = findDoc('fpgaview');
  if (old) await closeDoc(old);
  const top = S.project.top;
  openDoc({ id: 'fpgaview', title: `FPGA (${top})`, icon: 'chip', tooltip: `${title}: ${m.device.part}`,
    create: el => {
      const view = mountFpgaView(el, { model: m, top, entities: hierarchyEntities(top), stale: S.status.par === 'stale',
        onSelectModule: path => selectHierarchyPath(path) });
      return { view, destroy: () => view.destroy() };
    } });
  syncFpgaView(S.sel);
}
// stage 4: the Design hierarchy and the FPGA view select each other's modules
export function syncFpgaView(sel) {
  const v = findDoc('fpgaview')?.view;
  if (!v || S.fpgaSyncing) return;
  const top = S.project?.top;
  if (sel?.type !== 'module' || !sel.path) return;
  const [root, ...rest] = sel.path.split('/');
  if (root !== top) return;
  v.highlightModule(rest.length ? rest.join('/') : null);
}
function selectHierarchyPath(path) {
  const top = S.project?.top;
  if (!top) return;
  const want = `m:${top}${path ? `/${path}` : ''}`.toLowerCase();
  const row = [...document.querySelectorAll('#hier .row[data-key^="m:"]')].find(r => r.dataset.key.toLowerCase() === want);
  if (!row) return;
  // show it: expand its ancestors
  for (let ul = row.parentElement.parentElement; ul && ul.id !== 'hier'; ul = ul.parentElement) if (ul.tagName === 'UL' && ul.hidden) { ul.hidden = false; const tw = ul.previousElementSibling?.querySelector('.twisty'); if (tw) tw.textContent = '▾'; }
  S.fpgaSyncing = true;
  try { row.click(); } finally { S.fpgaSyncing = false; }
  row.scrollIntoView({ block: 'nearest' });
}

export async function openSummary({ background = false } = {}) {
  const was = S.active;
  const { mountSummary } = await import('./summary.js');
  // opened with the project (background): if the user opened another document meanwhile, keep it in front
  const keep = background && S.active && S.active !== was && S.active.id !== 'summary' ? S.active : null;
  const d = openDoc({ id: 'summary', title: 'Design Summary', icon: 'summary', background, create: el => mountSummary(el) });
  d.refresh?.();
  if (keep && S.docs.includes(keep)) activateDoc(keep);
}
export function refreshSummary() { const d = findDoc('summary'); d?.refresh?.(); }

export async function openPinPlanner(mod) {
  const { mountPinPlanner } = await import('./pinplanner.js');
  const top = mod || S.project.top;
  if (!top) { alertDlg('I/O Pin Planning', 'Select a top-level module first.', 'warn'); return; }
  const old = findDoc('pins');
  if (old) await closeDoc(old);
  openDoc({ id: 'pins', title: 'I/O Pin Planning', icon: 'pins', create: (el, d) => mountPinPlanner(el, d, top) });
}

export async function openImpact() {
  const { mountImpact } = await import('./impact.js');
  openDoc({ id: 'impact', title: 'iMPACT', icon: 'impact', create: (el, d) => mountImpact(el, d) });
}

// ------------------------------------------------------------------ project lifecycle (web/js/project.js)
export { openProject, closeProject, reloadProject };

// ------------------------------------------------------------------ left pages
export function showLeftPage(page) {
  S.leftPage = page;
  saveViewState();
  document.querySelectorAll('#left-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.left-page').forEach(p => { p.hidden = p.dataset.page !== page; });
  if (page === 'start') renderStartPage();
}

export function renderFilesPage() {
  const host = $('files-page');
  host.innerHTML = '';
  if (!S.project) return;
  const tbl = h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'File Name'), h('th', {}, 'Association'), h('th', {}, 'Language')));
  // files sorted by path, each folder as a row of its own (right-click: rename / delete the folder)
  const reg = new Map(S.project.files.map(f => [f.path, f]));
  const inProject = new Set(S.fileTree);
  const paths = [...new Set([...S.project.files.map(f => f.path), ...(S.diskTree || S.fileTree)])].sort((a, b) => a.localeCompare(b));
  const shown = new Set();
  for (const path of paths) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (shown.has(dir)) continue;
      shown.add(dir);
      tbl.append(h('tr', { class: 'folder-row', 'data-folder': dir, oncontextmenu: e => { e.preventDefault(); folderContextMenu(e, dir); } },
        h('td', { style: { fontWeight: 'bold', paddingLeft: `${4 + (i - 1) * 14}px` } }, `📁 ${parts[i - 1]}/`), h('td', {}), h('td', {})));
    }
    const f = reg.get(path);
    const pad = { paddingLeft: `${4 + (parts.length - 1) * 14}px` };
    tbl.append(h('tr', { 'data-file': path, ondblclick: () => openFile(path), oncontextmenu: e => { e.preventDefault(); fileContextMenu(e, path); } },
      h('td', { style: pad }, path),
      h('td', {}, !inProject.has(path) ? 'Not in project' : f ? (f.role === 'sim' ? 'Simulation' : f.role === 'impl' ? 'Implementation' : 'All') : path === S.project.constraints ? 'Implementation' : '—'),
      h('td', {}, f ? f.lang : path.split('.').pop())));
  }
  longPressMenu(tbl);   // (each row's menu, on touch)
  host.append(tbl);
}

function folderContextMenu(e, dir) {
  popupMenu([
    { label: 'Rename Folder…', action: () => renameFolder(dir) },
    { label: 'Delete Folder…', action: () => deleteFolder(dir) },
  ], e.clientX, e.clientY);
}

// files of the project under folder `dir`
const filesUnder = dir => [...new Set([...S.fileTree, ...S.project.files.map(f => f.path)])].filter(f => f.startsWith(`${dir}/`));

async function renameFolder(dir) {
  if (!S.project) return;
  const to = (await promptDlg('Rename Folder', `New path of the folder '${dir}':`, dir))?.trim().replace(/\/+$/, '');
  if (!to || to === dir) return;
  if (to.startsWith('/') || to.split('/').some(x => !x || x === '..' || x === '.')) return alertDlg('Rename Folder', 'Enter a folder path inside the project.');
  if (to.startsWith(`${dir}/`)) return alertDlg('Rename Folder', 'A folder cannot be moved into itself.');
  if (S.fileTree.some(f => f === to || f.startsWith(`${to}/`))) return alertDlg('Rename Folder', `'${to}' already exists.`);
  await saveAll();
  const remap = p => (p && p.startsWith(`${dir}/`) ? to + p.slice(dir.length) : p);
  const views = S.fileTree.filter(f => /\.(sch|asm|tt|fsm|pn)\.json$/i.test(f));
  // the editors of moved files are closed and reopened at their new paths
  const reopen = [];
  for (const d of [...S.docs]) if (d.path && d.path.startsWith(`${dir}/`)) { reopen.push(remap(d.path)); d.dirty = false; clearTimeout(d._autosave); await closeDoc(d); }
  try {
    await api.renameFile(S.project.name, dir, to);
    // synchronized charts / schematics refer to their HDL file by path: follow the move
    for (const v of views) {
      const at = remap(v);
      let d;
      try { d = JSON.parse(await api.readFile(S.project.name, at)); } catch { continue; }
      if (d.generatedFile && d.generatedFile.startsWith(`${dir}/`)) {
        d.generatedFile = remap(d.generatedFile);
        await api.writeFile(S.project.name, at, JSON.stringify(d, null, /\.(asm|tt|fsm)\.json$/i.test(at) ? 2 : 1));
      }
    }
    log(`Folder ${dir} renamed to ${to}.`, 'ok');
  } catch (e) { log(`ERROR: cannot rename folder ${dir}: ${e.message}`, 'err'); }
  await reloadProject();
  for (const p of reopen) if (S.fileTree.includes(p)) await openFile(p);
}

async function deleteFolder(dir) {
  if (!S.project) return;
  const files = filesUnder(dir);
  if (!await confirmDlg('Delete Folder', `Delete the folder '${dir}' and the ${files.length} file(s) in it from the project?\n\n${files.slice(0, 12).join('\n')}${files.length > 12 ? '\n…' : ''}`)) return;
  for (const d of [...S.docs]) if (d.path && d.path.startsWith(`${dir}/`)) { d.dirty = false; clearTimeout(d._autosave); await closeDoc(d); }
  try {
    await api.deleteFile(S.project.name, dir);
    log(`Folder ${dir} deleted (${files.length} file(s)).`, 'ok');
  } catch (e) { log(`ERROR: cannot delete folder ${dir}: ${e.message}`, 'err'); }
  await reloadProject();
}

export function renderLibsPage() {
  const host = $('libs-page');
  host.innerHTML = '';
  if (!S.lib) return;
  const tree = h('ul', { class: 'tree' });
  const work = treeItem({ label: 'work', ico: 'folder', open: true, key: 'lib:work' });
  tree.append(work.li);
  for (const m of S.modules) {
    const it = treeItem({ label: m.name, meta: `(${m.file})`, ico: m.lang === 'vhdl' ? 'vhdl' : 'verilog', key: `lib:${m.name}`, onOpen: () => openFile(m.file, m.line) });
    it.setLeaf(); work.ul.append(it.li);
  }
  for (const p of S.lib.packages.values()) {
    const it = treeItem({ label: p.name, meta: '(package)', ico: 'vhdl', key: `lib:p:${p.name}`, onOpen: () => openFile(p.file, p.loc?.line) });
    it.setLeaf(); work.ul.append(it.li);
  }
  host.append(tree);
}

// ------------------------------------------------------------------ menus & toolbar
function setupMenus() {
  const hasPj = () => !S.project;
  menuBar($('menubar'), S.menus = [
    { label: 'File', items: () => [
      { label: 'New Project…', icon: icon('newProject'), action: () => wiz.newProjectWizard() },
      { label: 'Open Project…', icon: icon('open'), action: () => wiz.openProjectDialog() },
      '-',
      { label: 'Import Silinx ISE Project (.zip)…', action: () => wiz.importSilinxDialog() },
      { label: 'Export Silinx ISE Project (.zip)…', action: () => exportProjectZip('silinx'), disabled: hasPj },
      '-',
      { label: 'Import Xilinx ISE Project (.zip)…', action: () => wiz.importXiseDialog() },
      { label: 'Export Xilinx ISE Project (.zip)…', action: () => exportProjectZip('xilinx'), disabled: hasPj },
      '-',
      api.standalone ? { label: 'Download Project Bundle…', action: async () => downloadText(`${S.project.name}.silinx.json`, await api.exportBundle(S.project.name), 'application/json'), disabled: hasPj } : null,
      api.standalone ? { label: 'Open Project Bundle…', action: () => openBundle() } : null,
      api.standalone ? '-' : null,
      ...(api.standalone ? storageMenuItems() : []),
      { label: 'Close Project', action: () => closeProject(), disabled: hasPj },
      '-',
      { label: 'Print…', action: () => printActive(), shortcut: 'Ctrl+P', disabled: () => !(S.active?.asmEditor || S.active?.schEditor || S.active?.fsmEditor) },
      '-',
      { label: 'Recent Projects', submenu: [
        ...recent().map(r => ({ label: r, action: () => openProject(r) })),
        recent().length ? '-' : null,
        { label: 'Clear Recent Projects', action: () => clearRecent(), disabled: !recent().length },
      ].filter(Boolean) },
    ].filter(Boolean) },
    { label: 'Edit', items: () => [
      // one Undo: the last removal from the project when that was the last action, else the editor's undo
      undoesProject()
        ? { label: `Undo ${history.undoLabel()}`, icon: icon('undo'), action: () => projectUndo(), shortcut: 'Ctrl+Z' }
        : { label: 'Undo', icon: icon('undo'), action: () => undoAny(), shortcut: 'Ctrl+Z', disabled: () => !docEditor(S.active) },
      redoesProject()
        ? { label: `Redo ${history.redoLabel()}`, icon: icon('redo'), action: () => projectRedo(), shortcut: 'Ctrl+Y' }
        : { label: 'Redo', icon: icon('redo'), action: () => redoAny(), shortcut: 'Ctrl+Y', disabled: () => !docEditor(S.active) },
      '-',
      { label: 'Find…', icon: icon('find'), action: () => S.active?.editor?.exec('findPersistent'), shortcut: 'Ctrl+F', disabled: () => !S.active?.editor },
      { label: 'Replace…', action: () => S.active?.editor?.exec('replace'), disabled: () => !S.active?.editor },
      { label: 'Go to Line…', action: () => S.active?.editor?.exec('jumpToLine'), shortcut: 'Ctrl+G', disabled: () => !S.active?.editor },
      '-',
      { label: 'Language Templates', submenu: [...(SNIPPETS[S.active?.lang] || SNIPPETS.vhdl)].map(s => ({ label: s.name, action: () => S.active?.editor?.insertText(s.text), disabled: () => !S.active?.editor })) },
      '-',
      { label: 'Design Checks (Lint Warnings)', checked: lintEnabled(), action: () => { setLintEnabled(!lintEnabled()); toast(lintEnabled() ? 'Design checks on: Check Syntax and the editor show the lint warnings' : 'Design checks off: only errors are shown'); for (const d of S.docs) d.liveCheck?.(); } },
    ] },
    { label: 'View', items: () => [
      { label: 'Implementation', checked: S.view === 'impl', action: () => setView('impl') },
      { label: 'Simulation', checked: S.view === 'sim', action: () => setView('sim') },
      '-',
      { label: 'Design Summary', icon: icon('summary'), action: () => openSummary(), disabled: hasPj },
      '-',
      { label: 'Language', submenu: Object.entries(LOCALES).map(([id, l]) => ({ label: l.name, checked: getLanguage() === id, action: () => setLanguage(id) })) },
      { label: 'Interface', submenu: [
        { label: 'Modern', checked: getInterface() === 'modern', action: () => setInterface('modern') },
        { label: 'Xilinx ISE (Classic)', checked: getInterface() === 'classic', action: () => setInterface('classic') },
      ] },
      // the classic ISE look is light only
      getInterface() === 'modern' ? { label: 'Theme', submenu: [
        { label: 'System', checked: getTheme() === 'system', action: () => setTheme('system') },
        { label: 'Light', checked: getTheme() === 'light', action: () => setTheme('light') },
        { label: 'Dark', checked: getTheme() === 'dark', action: () => setTheme('dark') },
      ] } : null,
      '-',
      { label: 'Command Palette…', action: () => showPalette(), shortcut: 'Ctrl+K' },
    ].filter(Boolean) },
    { label: 'Project', items: () => [
      { label: 'New Source…', action: () => wiz.newSourceWizard(), disabled: hasPj },
      { label: 'Add Copy of Source…', action: () => wiz.addSourceDialog(), disabled: hasPj },
      '-',
      // the implementation top (the Simulation view has none: Simulate runs the selected module)
      S.view === 'sim' ? null : { label: 'Set as Top Module', action: () => (S.sel?.module ? setTop(S.sel.module, false) : viewSel() && setViewAsTop(viewSel())),
        disabled: () => (S.sel?.module ? S.sel.module === S.project?.top : !viewSel() || (topOfView(viewSel()) && topOfView(viewSel()) === S.project?.top)) },
      { label: 'Design Properties…', action: () => wiz.projectProperties(), disabled: hasPj },
      api.standalone ? null : { label: 'Sync with .xise', action: () => api.syncXise(S.project.name, 'export').then(() => toast('Exported .xise', 'ok')).catch(e => alertDlg('Sync with .xise', e.message, 'error')), disabled: hasPj },
    ] },
    { label: 'Process', items: () => [
      { label: 'Implement Top Module', icon: icon('run'), action: () => S.project?.top && runImpl(S.project.top, ['synth', 'translate', 'map', 'par', 'bitgen']), disabled: () => !S.project?.top || S.busy },
      { label: 'Stop', icon: icon('stop'), action: () => stopProcesses(), disabled: () => !S.currentJob },
      { label: 'Run', action: () => S.selProc && runProcess(S.selProc), disabled: () => !S.selProc?.run },
      { label: 'Check Syntax', action: () => S.sel?.module && checkSyntax(S.sel.module, S.view === 'sim'), disabled: () => !S.sel?.module },
      { label: 'Simulate Behavioral Model', icon: icon('wave'), action: () => S.sel?.module && runSimulation(S.sel.module), disabled: () => !S.sel?.module },
    ] },
    { label: 'Tools', items: () => [
      { label: 'ASM State Machine Editor…', icon: icon('asm'), action: () => wiz.newSourceWizard({ type: 'asm' }), disabled: hasPj },
      { label: 'Truth Table / Karnaugh Map…', icon: icon('truthtable'), action: () => wiz.newSourceWizard({ type: 'tt' }), disabled: hasPj },
      { label: 'FSM State Diagram Editor…', icon: icon('fsm'), action: () => wiz.newSourceWizard({ type: 'fsm' }), disabled: hasPj },
      { label: 'Petri Net Editor…', icon: icon('petri'), action: () => wiz.newSourceWizard({ type: 'petri' }), disabled: hasPj },
      { label: 'I/O Pin Planning', icon: icon('pins'), action: () => openPinPlanner(S.sel?.module), disabled: hasPj },
      { label: 'iMPACT (Configure Target Device)', icon: icon('impact'), action: () => openImpact() },
      { label: 'Board Emulator', icon: icon('board'), action: () => openEmulator(S.project.top), disabled: hasPj },
      { label: 'RTL Schematic', icon: icon('schematic'), action: () => S.sel?.module && openSchematic(S.sel.module), disabled: () => !S.sel?.module },
      { label: 'Implemented Design (FPGA View)', icon: icon('chip'), action: () => openFpgaView(), disabled: () => !S.project?.top },
      '-',
      { label: 'Toolchain Settings (ISE / Programmers)…', icon: icon('gear'), action: () => wiz.toolchainDialog() },
    ] },
    { label: 'Window', items: () => [
      ...S.docs.map(d => ({ label: d.title, checked: d === S.active, action: () => activateDoc(d) })),
      S.docs.length ? '-' : null,
      { label: 'Close All Documents', action: () => [...S.docs].forEach(closeDoc), disabled: () => !S.docs.length },
    ].filter(Boolean) },
    { label: 'Help', items: () => [
      { label: 'About Silinx ISE', icon: icon('help'), action: () => wiz.aboutDialog() },
      { label: 'Keyboard Shortcuts', action: () => wiz.shortcutsDialog() },
      '-',
      { label: 'Check for Updates…', action: () => wiz.checkUpdatesDialog() },
      // the start-up check (#488): off, the app asks GitHub nothing until Check for Updates… is used
      { label: 'Check for Updates at Start-up', checked: wiz.updateCheckEnabled(), action: () => { wiz.setUpdateCheckEnabled(!wiz.updateCheckEnabled()); toast(wiz.updateCheckEnabled() ? 'Check for updates at start-up on: the latest release is asked of GitHub when the app starts' : 'Check for updates at start-up off: Help > Check for Updates… checks by hand'); } },
      '-',
      { label: 'Tell Us Who You Are…', action: () => wiz.whoAreYou() },
    ] },
  ]);
}

function setupToolbar() {
  const tb = $('toolbar');
  const btn = (ico, title, fn, enabled = () => true) => {
    const b = h('button', { class: 'tb-btn', title, 'data-cmd': ico, html: icons[ico], onclick: () => enabled() && runAction(title, fn) });
    b.dataset.enabled = '1';
    b._enabled = enabled;
    return b;
  };
  tb.append(
    btn('newProject', 'New Project', () => wiz.newProjectWizard()),
    btn('open', 'Open Project', () => wiz.openProjectDialog()),
    h('div', { class: 'tb-sep' }),
    btn('undo', 'Undo', () => undoAny()),   // as Edit ▸ Undo
    btn('redo', 'Redo', () => redoAny()),   // as Edit ▸ Redo
    h('div', { class: 'tb-sep' }),
    btn('cut', 'Cut', () => document.execCommand('cut')),
    btn('copy', 'Copy', () => document.execCommand('copy')),
    btn('paste', 'Paste', () => navigator.clipboard?.readText().then(t => S.active?.editor?.replaceSelection(t))),
    btn('find', 'Find', () => S.active?.editor?.exec('findPersistent')),
    h('div', { class: 'tb-sep' }),
    btn('summary', 'Design Summary', () => S.project && openSummary()),
    btn('schematic', 'View RTL Schematic', () => S.sel?.module && openSchematic(S.sel.module)),
    btn('pins', 'I/O Pin Planning', () => S.project && openPinPlanner(S.sel?.module)),
    btn('asm', 'New ASM State Diagram', () => S.project && wiz.newSourceWizard({ type: 'asm' })),
    h('div', { class: 'tb-sep' }),
    btn('run', 'Implement Top Module', () => S.project?.top && !S.busy && runImpl(S.project.top, ['synth', 'translate', 'map', 'par', 'bitgen'])),
    btn('stop', 'Stop the running process', () => stopProcesses()),
    btn('wave', 'Simulate Behavioral Model', () => S.sel?.module && runSimulation(S.sel.module)),
    btn('impact', 'Configure Target Device (iMPACT)', () => openImpact()),
    h('div', { class: 'tb-sep' }),
    btn('gear', 'Toolchain Settings', () => wiz.toolchainDialog()),
    btn('help', 'About', () => wiz.aboutDialog()),
  );
  // the modern interface: the main steps of the design flow as labelled buttons
  const step = (ico, label, title, fn, enabled) => {
    const b = h('button', { class: 'm-step', title, onclick: () => enabled() && fn() }, h('span', { class: 'ico-inline', html: icons[ico] }), h('span', {}, label));
    b._enabled = enabled;
    return b;
  };
  const mod = () => S.sel?.module || (S.view === 'sim' ? null : S.project?.top);
  // only Implement waits for a running implementation (one ISE build at a time); checking,
  // simulating, emulating and programming run in the browser or independently of it
  tb.append(h('div', { class: 'm-steps', role: 'group', 'aria-label': 'Design flow' },
    step('mCheck', 'Check', 'Check Syntax of the selected module', () => checkSyntax(mod(), S.view === 'sim'), () => !!S.project && !!mod()),
    step('mWave', 'Simulate', 'Simulate Behavioral Model of the selected module', () => runSimulation(mod()), () => !!S.project && !!mod()),
    step('mBolt', 'Implement', 'Implement Top Module', async () => await topConfirmed('Implement', 'implements') && runImpl(S.project.top, ['synth', 'translate', 'map', 'par', 'bitgen']), () => !!S.project?.top && !S.busy),
    step('mBoard', 'Emulate', 'Board Emulator', async () => await topConfirmed('Emulate', 'emulates') && openEmulator(S.project.top), () => !!S.project?.top),
    step('mUpload', 'Program', 'Configure Target Device (iMPACT)', () => openImpact(), () => true),
  ));
  refreshSteps();
}

// enable / disable the labelled buttons of the modern toolbar (cheap: run on clicks and changes)
function refreshSteps() {
  for (const b of document.querySelectorAll('#toolbar .m-step')) b.disabled = !b._enabled();
}

// Command palette: every enabled menu command and every project file
function showPalette() {
  const files = S.project ? [...new Set(S.project.files.map(f => f.path))].sort().map(path => ({ path, open: () => openFile(path) })) : [];
  return openPalette({ commands: menuCommands(S.menus), files });
}

// Print the diagram of the active document (ASM chart or schematic)
function printActive() {
  const d = S.active;
  if (d?.asmEditor) d.asmEditor.print();
  else if (d?.fsmEditor) d.fsmEditor.print();
  else if (d?.schEditor) d.schEditor.print(`Schematic ${d.path || ''}`.trim());
}

export function downloadUrl(url, filename) {
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
}

// kind 'xilinx': a Xilinx ISE 14.7 project (.xise + sources, opens in ISE);
// kind 'silinx': the whole Silinx project (silinx.json + every file, ASM charts and schematics included)
async function exportProjectZip(kind = 'xilinx') {
  await saveAll();
  const title = kind === 'silinx' ? 'Export Silinx ISE Project' : 'Export Xilinx ISE Project';
  try {
    const { blob, filename, warnings = [] } = await api.exportZip(S.project.name, kind);
    const url = URL.createObjectURL(blob);
    downloadUrl(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    log(kind === 'silinx'
      ? `Exported ${filename}: the whole Silinx project (silinx.json + all project files, ${Math.round(blob.size / 1024)} KB).`
      : `Exported ${filename}: Xilinx ISE project ${S.project.name}.xise + its sources (${Math.round(blob.size / 1024)} KB).`, 'ok');
    for (const w of warnings) log(`WARNING: ${w}`, 'warn');
  } catch (e) { alertDlg(title, e.message, 'error'); }
}

function openBundle() {
  const inp = h('input', { type: 'file', accept: '.json' });
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const name = await api.importBundle(await f.text()); await openProject(name); showLeftPage('design');
      for (const w of api.lastImportWarnings || []) log(`WARNING: ${w}`, 'warn');
    }
    catch (e) { alertDlg('Open Project Bundle', e.message, 'error'); }
  });
  inp.click();
}

// ------------------------------------------------------------------ browser edition: where projects are kept
// the Simulation view with module `mod` selected (e.g. a test bench just created): Simulate runs it
export function showInSim(mod) {
  setView('sim');
  const row = document.querySelector(`#hier [data-key="${CSS.escape(`m:${mod}`)}"]`);
  if (row) row.dispatchEvent(new MouseEvent('click'));
}

function setView(v) {
  S.view = v;
  document.querySelectorAll('input[name=view]').forEach(r => { r.checked = r.value === v; });
  S.selKey = null;
  renderHierarchy();
  renderProcesses();
  saveViewState();
}

// ------------------------------------------------------------------ boot
async function boot() {
  applyPrefs();
  startI18n();
  document.querySelectorAll('.ico-inline[data-icon]').forEach(e => { e.innerHTML = icons[e.dataset.icon] || ''; });
  setupMenus();
  setupToolbar();
  splitter($('v-split'), $('left'), { dir: 'h', min: 180, max: 700, storageKey: 'xl.leftW' });
  splitter($('left-split'), $('proc-panel'), { dir: 'v', min: 80, max: 900, invert: true, storageKey: 'xl.procH' });
  splitter($('h-split'), $('console-wrap'), { dir: 'v', min: 60, max: 700, invert: true, storageKey: 'xl.consoleH' });
  initDrawer();
  document.querySelectorAll('#left-tabs .tab').forEach(t => t.addEventListener('click', () => { leftTabClicked(t.dataset.page, document.querySelector('#left-tabs .tab.active')?.dataset.page); showLeftPage(t.dataset.page); }));
  document.querySelectorAll('#console-tabs .tab').forEach(t => t.addEventListener('click', () => showConsolePage(t.dataset.page)));
  document.querySelectorAll('input[name=view]').forEach(r => r.addEventListener('change', () => setView(r.value)));
  // Clear: the console and the Warnings and Errors tabs, their counts too (#302; the editors' marks stay,
  // checked again at the next edit)
  $('console-clear').addEventListener('click', clearConsole);
  // modern interface: header search / theme / project, keyboard access to the activity bar
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  for (const k of [$('palette-kbd'), ...document.querySelectorAll('.pal-key')]) k.textContent = mac ? '⌘ K' : 'Ctrl K';
  $('palette-btn').addEventListener('click', () => showPalette());
  $('theme-btn').addEventListener('click', () => toggleTheme());
  $('title-project').addEventListener('click', () => wiz.openProjectDialog());
  document.querySelectorAll('#left-tabs .tab').forEach(t => t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.click(); } }));
  for (const ev of ['click', 'keyup']) addEventListener(ev, () => setTimeout(refreshSteps), true);
  setInterval(refreshSteps, 1000);
  addEventListener('keydown', e => {
    // Ctrl/Cmd+K, Ctrl/Cmd+Shift+P: the command palette (not while a dialog is open)
    if ((e.metaKey || e.ctrlKey) && !e.altKey && ((e.key === 'k' || e.key === 'K') && !e.shiftKey || (e.shiftKey && (e.key === 'p' || e.key === 'P')))
      && !document.querySelector('.dlg-overlay')) { e.preventDefault(); showPalette(); return; }
    if (!e.defaultPrevented && (e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P') && (S.active?.asmEditor || S.active?.schEditor || S.active?.fsmEditor)) { e.preventDefault(); printActive(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (S.active) flushDoc(S.active); }  // nothing to do: edits are saved automatically
    // Ctrl/Cmd+Z outside an editor or text field (the diagram editors handle their own keys): undo the
    // project's last command when it is newer than the active document's last edit
    const outside = !e.defaultPrevented && !e.target.closest?.('.cm-editor, input, textarea, select, [contenteditable], .sch-editor, .asm-editor, .fsm-editor, .tt-editor, .petri-editor, .pin-planner') && !document.querySelector('.dlg-overlay');
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && outside && undoesProject()) { e.preventDefault(); projectUndo(); }
    // Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z outside an editor: redo it
    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z'))) && outside && redoesProject()) { e.preventDefault(); projectRedo(); }
  });
  addEventListener('beforeunload', e => { if (S.docs.some(d => d.dirty)) { e.preventDefault(); e.returnValue = ''; } });

  updateTitle();
  log(`${PRODUCT} ${VERSION_LABEL} Project Navigator — HDL design, schematics, behavioural simulation and Xilinx FPGA implementation/programming.`, 'info');
  if (api.standalone) {
    const st = await api.initStorage().catch(() => api.storage());
    const where = st.kind === 'folder' ? `in the folder '${st.folder}' on the disk (File > Use Browser Storage to keep them in this browser)`
      : `in this browser (File > Download Project Bundle to keep a copy${st.supported ? '; File > Open Workspace Folder… keeps them in a folder on the disk' : ''})`;
    log(`Browser edition: projects are stored ${where}. Implement Design and Generate Programming File run the Silinx toolchain here (Spartan-3E); Configure Target Device programs the FPGA of the board and its Platform Flash over USB (Chrome / Edge).`, 'info');
    if (st.needsPermission) log(`The workspace folder '${st.remembered}' needs the browser's permission again: Start page > Reopen ${st.remembered}.`, 'warn');
    if (api.devSite) log(`Development edition (built from main, not a release): its projects are kept apart from the stable edition's, ${new URL('../', location).href} (a workspace folder on the disk can be opened by both).`, 'warn');
    updateStorageStatus();
  }
  try { S.devices = await api.devices(); } catch (e) { log(`ERROR: cannot reach the Silinx server: ${e.message}`, 'err'); }
  // the start-up checks' warnings are in the Warnings tab until a project opens, as the lines written before
  // them: when their answer comes after a project was opened (the last one, reopened while the checks run),
  // they are in the console only; they were in the tabs or not by which came first (#339)
  const cleared = S.diagsCleared;
  api.toolchain().then(tc => {
    S.toolchain = tc;
    const opts = { diag: S.diagsCleared === cleared };
    if (tc.ise.mode === 'silinx') log(`Toolchain: ${tc.ise.reason}.`, 'ok', opts);
    else log(`Toolchain: ISE ${tc.ise.available ? 'available' : 'not available'} (${tc.ise.mode}: ${tc.ise.reason}).`, tc.ise.available ? 'ok' : 'warn', opts);
    renderProcesses();
    // (the browser edition reaches no programmer: it says so in its own startup line)
    if (api.standalone) return;
    const progs = Object.entries(tc.programmers).filter(([, v]) => v.found).map(([k]) => k);
    log(`Programmers found: ${progs.length ? progs.join(', ') : 'none (install openFPGALoader, xc3sprog, Digilent Adept or ISE iMPACT)'}`, progs.length ? 'ok' : 'warn', opts);
  }).catch(() => {}).finally(() => { S.startupChecked = true; });   // (the start-up lines all written: the UI tests wait for it)
  renderHierarchy();
  renderProcesses();
  let last = null;
  try { last = localStorage.getItem('silinx.lastProject'); } catch { /* ignore */ }
  const projects = await api.projects().catch(() => []);
  // (a workspace folder waiting for its permission: its last project is not the browser's one of that name)
  if (last && projects.some(p => p.name === last) && !(api.standalone && api.storage().needsPermission)) await openProject(last);
  else showLeftPage('start');
  // check for updates at start-up (a newer release opens the update dialog) unless the setting is off; not awaited
  if (!window.SILINX_NO_UPDATE_CHECK) wiz.checkUpdatesOnStart().catch(() => {});
}

export const app = { showInSim, saveAll, openTt, openFsm, openPetri, openSch, stepTracker, projectBoard, regenerateUcf, openFile, openAsm, openProject, reloadProject, closeProject, openDoc, log, setDiagnostics, compileProject, renderHierarchy, renderProcesses, saveProjectJson, setTop, openSummary, showLeftPage, setDirty, findDoc, closeDoc, runSimulation, openPinPlanner, openImpact, followJob, logLine, openMode, S };
window.SilinxApp = app;
// a promise nobody waits for that fails (a menu's action, the start-up's project): said in the
// Console and the Errors tab, not lost (#408); the browser's console keeps its stack
window.addEventListener('unhandledrejection', e => log(`ERROR: ${e.reason?.message || e.reason}`, 'err'));
boot();
