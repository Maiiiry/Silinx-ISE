// Standalone (server-less) backend: same interface as api.js, with projects kept in the
// browser's localStorage. Used by the single-file build (dist/Silinx-ISE.html, on GitHub Pages).
// Implement Design / Generate Programming File run the Silinx toolchain in the browser
// (web/js/open-flow-browser.js: no server, no Xilinx tool); the build's files are kept in memory
// (they are too large for localStorage) and the bitstream is downloaded. XST (Xilinx ISE) and
// programming a board need the full application.
import { getDeviceDb } from '../../server/devices.js';
import { exportXise, importXise, importIseSchematics, exportIseSchematics } from '../../server/xise.js';
import EXAMPLES from 'silinx-examples';
import { createZip, readZip, browserCodec, textOf } from '../../core/zip.js';
import { runBrowserFlow, browserOpenStatus } from './open-flow-browser.js';

const KEY = 'silinx.standalone.fs';
const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const DEFAULT_DEVICE = { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' };

let mem = null;
function load() {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { mem = {}; }
  return mem;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); }
  catch (e) { throw new Error(`browser storage is full or unavailable (${e.message}); download your project bundle to keep it`); }
}
const clone = o => JSON.parse(JSON.stringify(o));
const fail = msg => { throw new Error(msg); };
function proj(name) { return load()[name] || fail(`project '${name}' not found`); }
function cleanPath(p) {
  if (!p || typeof p !== 'string' || p.startsWith('/') || p.split('/').includes('..')) fail('invalid path');
  return p.replace(/\\/g, '/');
}
const langOf = p => (/\.(v|vh|sv)$/i.test(p) ? 'verilog' : /\.(vhd|vhdl)$/i.test(p) ? 'vhdl' : /\.ucf$/i.test(p) ? 'ucf' : 'text');

function writeFileSync(name, path, text) {
  { const pp = proj(name); if ((pp.json.excluded || []).includes(path)) pp.json.excluded = pp.json.excluded.filter(f => f !== path); }   // written again: back in the project
  const pj = proj(name);
  path = cleanPath(path);
  pj.files[path] = text;
  const lang = langOf(path);
  if ((lang === 'vhdl' || lang === 'verilog') && !/^build\//.test(path) && !pj.json.files.some(f => f.path === path)) {   // not the generated files in build/
    const role = /^(sim|tb|test)\//.test(path) || /(^|\/)tb_|_tb\.|_tb$/.test(path) ? 'sim' : 'design';
    pj.json.files.push({ path, lang, role });
  }
  persist();
}

function createProjectSync({ name, template = 'empty', device, board }) {
  if (!NAME_RE.test(name || '')) fail(`invalid project name '${name}'`);
  if (load()[name]) fail(`project '${name}' already exists`);
  if (template && template !== 'empty') {
    const ex = EXAMPLES[template] || fail(`unknown template '${template}'`);
    const json = { ...clone(ex.json), name };
    if (device) json.device = device;
    if (board !== undefined) json.board = board;
    mem[name] = { json, files: clone(ex.files) };
  } else {
    mem[name] = {
      json: { name, version: 1, device: device || DEFAULT_DEVICE, board: board ?? null, top: '', simTop: '', files: [], constraints: 'constraints/top.ucf', stimuli: {}, impl: { optMode: 'Speed', optLevel: 1, startupClk: 'JtagClk' } },
      files: {},
    };
  }
  persist();
  return clone(mem[name].json);
}

// ---- jobs: the Silinx toolchain's runs in the browser, and the operations that need the server
const jobs = new Map();
let jobSeq = 0;
function fakeJob(kind, lines, status = 'error', error) {
  const id = `local-${++jobSeq}`;
  jobs.set(id, { id, kind, status, lines, next: lines.length, error });
  return { job: id };
}
const FULL_APP = 'the full Silinx application (run `npm start` in the Silinx folder and open http://127.0.0.1:8642; File > Download Project Bundle moves a project there)';
const NEED_SERVER = [
  'This is the browser (single HTML file) edition of Silinx.',
  `Programming a board needs ${FULL_APP}.`,
];
// the job's error (the end of "<operation> failed: …")
const NO_PROGRAMMER = 'the browser edition cannot reach the board\'s USB programmer: program it with the full Silinx application, or with Digilent Adept / iMPACT and the downloaded .bit';
const NEED_ISE = [
  'This project synthesizes with XST, which needs Xilinx ISE 14.7: not available in the browser edition.',
  'Choose Silinx as the synthesis tool (Project > Design Properties) to implement it here, with no Xilinx tool,',
  `or open it in ${FULL_APP} with ISE.`,
];
// the build of each project (this session only): { files: { 'build/…': text | bytes }, report, view }
const builds = new Map();
const buildOf = name => { if (!builds.has(name)) builds.set(name, { files: {}, report: null, view: null }); return builds.get(name); };
// build/reports.json's shape (server/open-flow.js openReports) from the flow's report
function reportsOf(pj, r) {
  const out = { top: pj.top, device: pj.device || null, source: 'open', synthesis: r.synthesis, map: r.map, par: r.par, timing: r.timing,
    bit: r.bit ? { ...r.bit, header: { design: `${pj.top}.ncd`, part: `${String(pj.device.part).replace(/^xc/i, '')}${pj.device.package}` } } : undefined,
    prom: r.prom, simModels: {}, files: r.files || {} };
  out.summary = { synthesized: !!out.synthesis, mapped: !!out.map, routed: out.par ? out.par.routed : null, timingMet: out.timing ? out.timing.met : null,
    maxFreqMHz: out.timing?.maxFreqMHz ?? null, utilization: out.map?.summary || null, bitstream: !!out.bit };
  return out;
}

export const api = {
  standalone: true,
  projects: async () => Object.values(load()).map(p => ({ name: p.json.name, device: p.json.device, top: p.json.top, board: p.json.board })).sort((a, b) => a.name.localeCompare(b.name)),
  templates: async () => Object.keys(EXAMPLES),
  createProject: async p => createProjectSync(p),
  project: async name => {
    const p = proj(name);
    return { ...clone(p.json), fileTree: Object.keys(p.files).sort() };
  },
  saveProject: async (name, pj) => {
    const p = proj(name);
    const clean = { ...clone(pj), name };
    delete clean.fileTree;
    p.json = clean;
    persist();
    return clone(clean);
  },
  renameFile: async (name, from, to) => {
    const p = proj(name);
    const under = Object.keys(p.files).filter(k => k.startsWith(`${from}/`));
    if (p.files[from] === undefined && under.length) {
      // a folder: every file under it moves, registrations and the constraints path follow
      if (to.startsWith(`${from}/`)) fail(`cannot move '${from}' into itself`);
      if (Object.keys(p.files).some(k => k === to || k.startsWith(`${to}/`))) fail(`'${to}' already exists`);
      const remap = k => (k.startsWith(`${from}/`) ? to + k.slice(from.length) : k);
      for (const k of under) { p.files[remap(k)] = p.files[k]; delete p.files[k]; }
      p.json.files = p.json.files.map(f => ({ ...f, path: remap(f.path) }));
      if (p.json.constraints) p.json.constraints = remap(p.json.constraints);
      persist();
      return clone(p.json);
    }
    if (p.files[from] === undefined) fail(`file '${from}' not found`);
    if (from !== to && p.files[to] !== undefined) fail(`'${to}' already exists`);
    const t = p.files[from]; delete p.files[from]; p.files[to] = t;
    const lang = /\.vhdl?$/i.test(to) ? 'vhdl' : /\.(v|sv)$/i.test(to) ? 'verilog' : null;
    p.json.files = p.json.files.map(f => (f.path === from ? { ...f, path: to, lang: lang || f.lang } : f));
    if (p.json.constraints === from) p.json.constraints = to;
    persist();
    return clone(p.json);
  },
  deleteProject: async name => { proj(name); delete mem[name]; persist(); return { ok: true }; },
  readFile: async (name, path) => {
    const t = proj(name).files[path];
    if (t === undefined) fail(`file '${path}' not found`);
    return t;
  },
  writeFile: async (name, path, text) => { writeFileSync(name, path, text); return { ok: true }; },
  deleteFile: async (name, path) => {
    const p = proj(name);
    // a folder: everything under it
    const gone = k => k === path || k.startsWith(`${path}/`);
    for (const k of Object.keys(p.files)) if (gone(k)) delete p.files[k];
    p.json.files = p.json.files.filter(f => !gone(f.path));
    if (p.json.constraints && gone(p.json.constraints)) p.json.constraints = null;
    persist();
    return { ok: true };
  },
  sources: async name => {
    const p = proj(name);
    return p.json.files.map(f => ({ ...f, text: p.files[f.path] ?? '', missing: p.files[f.path] === undefined }));
  },
  devices: async () => getDeviceDb(),
  toolchain: async () => ({
    platform: 'browser', configPath: '(browser edition)',
    config: { mode: 'silinx', local: { settings: '' }, docker: { image: '', settings: '' }, ssh: { host: '', user: '', port: 22, remoteDir: '', settings: '' }, programmer: { tool: '', cable: '' }, open: { iseMode: 'docker' } },
    // the Silinx toolchain runs in the browser (Spartan-3E); XST (Xilinx ISE) does not
    ise: { mode: 'silinx', available: true, reason: 'the Silinx toolchain, in the browser (no Xilinx tool)', help: NEED_ISE.join(' ') },
    programmers: {}, helpers: {},
  }),
  saveToolchain: async () => api.toolchain(),
  openStatus: async name => browserOpenStatus(proj(name).json.device || {}),
  implement: async (name, { steps } = {}) => {
    const p = proj(name);
    if (p.json.synthTool === 'xst') return fakeJob('implement', NEED_ISE, 'error', 'XST needs Xilinx ISE 14.7 (choose Silinx as the synthesis tool in Design Properties)');
    const id = `local-${++jobSeq}`;
    const job = { id, kind: 'implement', status: 'running', lines: [], next: 0, error: null };
    jobs.set(id, job);
    const b = buildOf(name);
    const push = l => { job.lines.push(l); job.next = job.lines.length; };
    // the outputs of a previous run no longer match the design (a failure must not leave a bitstream)
    for (const k of Object.keys(b.files)) if (/^build\/[^/]+\.bit$|^build\/open\/(placed|routed)\.xdl$|^build\/open\/timing\.txt$/.test(k)) delete b.files[k];
    b.view = null;
    runBrowserFlow({
      project: p.json, files: { ...p.files, ...b.files }, steps,
      onLine: push,
      onWrite: (path, data) => { b.files[path] = data; },
      onReport: r => { b.report = reportsOf(p.json, r); },
    }).then(res => {
      if (res.report) b.report = reportsOf(p.json, res.report);
      if (res.view) b.view = res.view;
      const bit = b.files[`build/${p.json.top}.bit`];
      if (res.ok && bit) job.download = { filename: `${p.json.top}.bit`, url: URL.createObjectURL(new Blob([bit], { type: 'application/octet-stream' })) };
      job.status = res.ok ? 'ok' : 'error';
      job.error = res.ok ? null : `Silinx toolchain failed${res.error ? `: ${res.error}` : ''}`;
    }).catch(e => { push(`ERROR:Silinx - ${e.message}`); job.status = 'error'; job.error = e.message; });
    return { job: id };
  },
  reports: async name => (builds.get(name)?.report || { available: false }),
  fpgaView: async name => (builds.get(name)?.view || { available: false, reason: 'no-ncd' }),
  buildFile: async (name, path) => builds.get(name)?.files[path],
  bitinfo: async () => ({ available: false, reason: 'standalone edition' }),
  program: async () => fakeJob('program', NEED_SERVER, 'error', NO_PROGRAMMER),
  scan: async () => fakeJob('scan', NEED_SERVER, 'error', NO_PROGRAMMER),
  prom: async () => fakeJob('prom', NEED_SERVER, 'error', NO_PROGRAMMER),
  job: async (id, since = 0) => {
    const j = jobs.get(id) || fail(`job '${id}' not found`);
    return { ...j, lines: j.lines.slice(+since), next: j.lines.length };
  },
  cancelJob: async id => jobs.get(id),
  exportXiseUrl: name => {
    const p = proj(name);
    const xml = exportXise(p.json, { sources: p.files });
    return URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  },
  importXise: async ({ name, xise, files = {} }) => {
    const parsed = importXise(xise);
    const lookup = path => files[path] ?? files[path.split('/').pop()];
    createProjectSync({ name, template: 'empty' });
    const p = mem[name];
    const safe = (f, dir) => (f.startsWith('/') || f.includes('..') ? `${dir}/${f.split('/').pop()}` : f);
    const out = [];
    const sources = {};
    for (const f of parsed.files) {
      const target = safe(f.path, f.role === 'sim' ? 'sim' : 'src');
      const text = lookup(f.path);
      if (typeof text === 'string') { p.files[target] = text; sources[target] = text; }
      out.push({ path: target, lang: f.lang, role: f.role });
    }
    const warnings = [...parsed.warnings];
    if (parsed.schematics.length) {
      const schFiles = {}, roles = {};
      for (const x of parsed.schematics) {
        const target = safe(x.path, x.role === 'sim' ? 'sim' : 'src');
        const text = lookup(x.path);
        if (typeof text === 'string') { schFiles[target] = text; roles[target] = x.role; }
      }
      const symbols = {};
      for (const [k, v] of Object.entries(files)) if (/\.sym$/i.test(k)) symbols[k.split('/').pop()] = v;
      for (const r of importIseSchematics(schFiles, { sources, symbols, lang: parsed.lang, existing: k => files[k] })) {
        warnings.push(...r.warnings);
        if (!r.json) continue;
        p.files[r.json] = r.jsonText; p.files[r.hdl] = r.code;
        if (!out.some(f => f.path === r.hdl)) out.push({ path: r.hdl, lang: r.lang, role: roles[r.sch] || 'design' });
      }
    }
    let constraints = 'constraints/top.ucf';
    if (parsed.constraints) {
      constraints = safe(parsed.constraints, 'constraints');
      const text = lookup(parsed.constraints);
      if (typeof text === 'string') p.files[constraints] = text;
    }
    Object.assign(p.json, { device: parsed.device.part ? parsed.device : p.json.device, top: parsed.top || '', simTop: parsed.simTop || '', topSourceType: parsed.topSourceType || 'hdl', files: out, constraints, impl: { ...p.json.impl, ...parsed.impl } });
    persist();
    return { project: clone(p.json), warnings };
  },
  syncXise: async () => fail('not available in the standalone edition (use File > Export Xilinx ISE Project)'),
  exportZip: async (name, kind = 'xilinx') => {
    const p = proj(name);
    if (kind === 'silinx') {   // the whole Silinx project as it is
      const entries = [{ path: 'silinx.json', data: JSON.stringify(p.json, null, 2) + '\n' },
        ...Object.entries(p.files).filter(([k]) => !/\.xise$/i.test(k)).map(([path, data]) => ({ path, data }))];
      return { blob: new Blob([await createZip(entries, browserCodec())], { type: 'application/zip' }), filename: `${name}-silinx.zip`, warnings: [] };
    }
    const docs = {};
    for (const [k, v] of Object.entries(p.files)) if (/\.sch\.json$/i.test(k)) { try { docs[k] = JSON.parse(v); } catch { /* skip */ } }
    const sch = exportIseSchematics(p.json, docs, p.files);
    const xml = exportXise(p.json, { sources: p.files, schematics: sch.schematics, extraFiles: sch.extraFiles });
    const added = new Set(sch.files.map(f => f.path));
    // Xilinx ISE project: no Silinx-only files (silinx.json, ASM charts, Silinx schematics)
    const entries = [{ path: `${name}.xise`, data: xml },
      ...sch.files.map(f => ({ path: f.path, data: f.text })),
      ...Object.entries(p.files).filter(([k]) => k !== `${name}.xise` && !added.has(k) && !/(^|\/)[^/]+\.(asm|sch|tt|fsm)\.json$/i.test(k)).map(([path, data]) => ({ path, data }))];
    return { blob: new Blob([await createZip(entries, browserCodec())], { type: 'application/zip' }), filename: `${name}.zip`, warnings: sch.warnings };
  },
  importZip: async (name, file) => {
    const entries = await readZip(new Uint8Array(await file.arrayBuffer()), browserCodec());
    const xe = entries.filter(e => /\.xise$/i.test(e.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
    const pe = entries.find(e => /(^|\/)silinx\.json$/.test(e.path));
    if (!xe && !pe) fail('the zip contains no .xise (ISE project) and no silinx.json');
    const root = (xe || pe).path.includes('/') ? (xe || pe).path.replace(/\/[^/]*$/, '') : '';
    const rel = p => (!root ? p : p.startsWith(root + '/') ? p.slice(root.length + 1) : null);
    const files = {};
    for (const e of entries) { const r = rel(e.path); if (r !== null && !/^build\//.test(r)) files[r] = textOf(e); }
    let warnings = [];
    if (xe) warnings = (await api.importXise({ name, xise: textOf(xe), files })).warnings || [];
    else createProjectSync({ name, template: 'empty' });
    const p = mem[name];
    const known = new Set(p.json.files.map(f => f.path).concat(p.json.constraints));
    for (const [k, v] of Object.entries(files)) if (!known.has(k) && !/\.xise$/i.test(k) && k !== 'silinx.json') p.files[k] = v;
    if (pe) {
      try {
        const saved = JSON.parse(textOf(pe));
        p.json = xe ? { ...p.json, board: saved.board ?? p.json.board, stimuli: saved.stimuli || {}, preferredLanguage: saved.preferredLanguage, impl: { ...p.json.impl, ...saved.impl } } : { ...saved, name };
      } catch { /* ignore */ }
    }
    persist();
    return { project: clone(p.json), missing: [], warnings };
  },

  // standalone-only: project bundles (one JSON file with every project file)
  exportBundle: name => {
    const p = proj(name);
    return JSON.stringify({ format: 'silinx-bundle', version: 1, project: p.json, files: p.files }, null, 1);
  },
  importBundle: async text => {
    const b = JSON.parse(text);
    if (b.format !== 'silinx-bundle') fail('not a Silinx project bundle');
    let name = b.project.name;
    while (load()[name]) name = `${b.project.name}_${Math.floor(Math.random() * 1000)}`;
    mem[name] = { json: { ...b.project, name }, files: b.files };
    persist();
    return name;
  },
};

// as api.js's: the lines as they come, until the job ends (the browser flow runs in a Web Worker)
export async function followJob(id, onLine) {
  let since = 0;
  for (;;) {
    const j = await api.job(id, since);
    for (const l of j.lines) onLine(l);
    since = j.next;
    if (j.status !== 'running') return j;
    await new Promise(r => setTimeout(r, 150));
  }
}
