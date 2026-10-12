// Project storage of the browser (single-file) edition, behind one interface (web/js/api-local.js):
// - browserStore: every project in the browser's localStorage (one JSON value), as before;
// - folderStore: the projects in a folder on the disk that the user picked (File System Access API,
//   Chrome / Edge: a FileSystemDirectoryHandle), each one a normal project folder in the full
//   application's format (silinx.json, src/, sim/, constraints/, build/… as server/projects.js
//   writes them), so the same folder opens in the full application and zips for a submission.
// projectOps(getStore, examples): the project operations of the API (list, create, open, save,
// read / write / rename / delete files, delete a project) on the store in use.
// No browser global is touched at import time: the unit tests run this in Node with an in-memory
// FileSystemDirectoryHandle (test/fixtures/fs-access-fake.js).

export const PROJECT_FILE = 'silinx.json';
export const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const DEFAULT_DEVICE = { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' };
// the site's development edition (https://pmnmalo.github.io/Silinx-ISE/dev/, built from main): its
// own browser storage, so that a development build never touches the stable edition's projects
// (a workspace folder on the disk can still be opened by both)
export const DEV_SITE = typeof location !== 'undefined' && /\/dev\//.test(location.pathname || '');
const BROWSER_KEY = DEV_SITE ? 'silinx.dev.standalone.fs' : 'silinx.standalone.fs';

const clone = o => JSON.parse(JSON.stringify(o));
const fail = msg => { throw new Error(msg); };
export const langOf = p => (/\.(v|vh|sv)$/i.test(p) ? 'verilog' : /\.(vhd|vhdl)$/i.test(p) ? 'vhdl' : /\.ucf$/i.test(p) ? 'ucf' : 'text');
export function cleanPath(p) {
  if (!p || typeof p !== 'string' || p.startsWith('/') || p.split('/').includes('..')) fail('invalid path');
  return p.replace(/\\/g, '/');
}
/** silinx.json's text, as server/projects.js writes it (2-space JSON, a final newline, no fileTree). */
export function projectJsonText(name, pj) {
  const clean = { ...pj, name };
  delete clean.fileTree;
  return JSON.stringify(clean, null, 2) + '\n';
}
/** A new empty project's silinx.json (server/projects.js createProject). */
export const emptyProjectJson = (name, { device, board } = {}) => ({
  name, version: 1, device: device || DEFAULT_DEVICE, board: board ?? null, top: '', simTop: '', files: [],
  constraints: 'constraints/top.ucf', stimuli: {}, impl: { optMode: 'Speed', optLevel: 1, startupClk: 'JtagClk' },
});
const under = (k, dir) => k === dir || k.startsWith(`${dir}/`);

// ------------------------------------------------------------------ the browser's storage
/** Projects in localStorage (`storage`): { [name]: { json, files: { path: text } } }. */
export function browserStore(storage = () => globalThis.localStorage) {
  let mem = null;
  const ls = () => (typeof storage === 'function' ? storage() : storage);
  const all = () => {
    if (mem) return mem;
    try { mem = JSON.parse(ls().getItem(BROWSER_KEY) || '{}'); } catch { mem = {}; }
    return mem;
  };
  const persist = () => {
    try { ls().setItem(BROWSER_KEY, JSON.stringify(mem)); }
    catch (e) { throw new Error(`browser storage is full or unavailable (${e.message}); download your project bundle to keep it`); }
  };
  const get = name => all()[name] || fail(`project '${name}' not found`);
  return {
    kind: 'browser', label: null,
    list: async () => Object.values(all()).map(p => p.json).sort((a, b) => a.name.localeCompare(b.name)),
    exists: async name => !!all()[name],
    load: async name => get(name),
    create: async (name, json, files = {}) => {
      if (all()[name]) fail(`project '${name}' already exists`);
      mem[name] = { json: { ...clone(json), name }, files: { ...files } };
      persist();
    },
    saveJson: async (name, json) => { const p = get(name); p.json = { ...clone(json), name }; delete p.json.fileTree; persist(); },
    writeFile: async (name, path, text) => { get(name).files[path] = text; persist(); },
    // a file, or a folder (everything under it)
    removePath: async (name, path) => {
      const p = get(name);
      for (const k of Object.keys(p.files)) if (under(k, path)) delete p.files[k];
      persist();
    },
    renamePath: async (name, from, to) => {
      const p = get(name);
      for (const k of Object.keys(p.files).filter(x => under(x, from))) { const v = p.files[k]; delete p.files[k]; p.files[to + k.slice(from.length)] = v; }
      persist();
    },
    deleteProject: async name => { get(name); delete mem[name]; persist(); },
    // the build's outputs stay in memory in this storage (too large for localStorage)
    writeBuild: async () => {},
    readBinary: async () => null,
    readText: async () => null,
  };
}

// ------------------------------------------------------------------ a folder on the disk
const notFound = e => e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');
async function dirAt(root, parts, create = false) {
  let d = root;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d;
}
const split = path => { const parts = path.split('/').filter(Boolean); return { parts, last: parts.pop() }; };
async function writeAt(root, path, data) {
  const { parts, last } = split(path);
  const fh = await (await dirAt(root, parts, true)).getFileHandle(last, { create: true });
  const w = await fh.createWritable();   // written to a temporary file, swapped in at close (atomic)
  try { await w.write(data); await w.close(); } catch (e) { await w.abort?.().catch(() => {}); throw e; }
}
async function entryAt(root, path) {
  const { parts, last } = split(path);
  let dir;
  try { dir = await dirAt(root, parts); } catch (e) { if (notFound(e)) return null; throw e; }
  try { return { dir, name: last, handle: await dir.getFileHandle(last) }; } catch (e) { if (!notFound(e)) throw e; }
  try { return { dir, name: last, handle: await dir.getDirectoryHandle(last) }; } catch (e) { if (!notFound(e)) throw e; }
  return null;
}
async function copyDir(src, dst) {
  for await (const [name, h] of src.entries()) {
    if (h.kind === 'directory') await copyDir(h, await dst.getDirectoryHandle(name, { create: true }));
    else await writeAt(dst, name, new Uint8Array(await (await h.getFile()).arrayBuffer()));
  }
}
// the project's files (server/projects.js fileTree: no hidden entries, no build/ at the top, no silinx.json)
async function walk(dir, base = '', out = {}) {
  for await (const [name, h] of dir.entries()) {
    if (name.startsWith('.') || (base === '' && name === 'build')) continue;
    const rel = base ? `${base}/${name}` : name;
    if (h.kind === 'directory') await walk(h, rel, out);
    else if (rel !== PROJECT_FILE) out[rel] = await (await h.getFile()).text();
  }
  return out;
}

/** Projects in the folder `root` (a FileSystemDirectoryHandle): <root>/<name>/silinx.json + files. */
export function folderStore(root) {
  const cache = new Map();   // name -> { json, files } (read when first used, again when opened)
  const locks = new Map();   // one operation at a time per project (autosave, several calls)
  const locked = (name, fn) => {
    const key = name.toLowerCase();
    const run = (locks.get(key) || Promise.resolve()).then(fn);
    const tail = run.catch(() => {});
    locks.set(key, tail);
    tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
    return run;
  };
  const projectDir = async (name, create = false) => {
    if (!NAME_RE.test(name || '')) fail(`invalid project name '${name}'`);
    try { return await root.getDirectoryHandle(name, { create }); } catch (e) { if (notFound(e)) fail(`project '${name}' not found`); throw e; }
  };
  const readJson = async dir => JSON.parse(await (await (await dir.getFileHandle(PROJECT_FILE)).getFile()).text());
  async function read(name) {
    const dir = await projectDir(name);
    let json;
    try { json = await readJson(dir); } catch { fail(`project '${name}' not found`); }
    json.name = name;
    json.files ||= [];
    const p = { json, files: await walk(dir) };
    cache.set(name, p);
    return p;
  }
  const get = name => cache.get(name) || read(name);
  const store = {
    kind: 'folder', label: root.name, handle: root,
    list: async () => {
      const out = [];
      for await (const [name, h] of root.entries()) {
        if (h.kind !== 'directory' || name.startsWith('.') || !NAME_RE.test(name)) continue;
        try { out.push({ ...await readJson(h), name }); } catch { /* not a project */ }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
    exists: async name => { try { await root.getDirectoryHandle(name); return true; } catch (e) { if (notFound(e)) return false; throw e; } },
    // fresh: read again from the disk (the folder may have been changed by another program)
    load: (name, { fresh = false } = {}) => locked(name, () => (fresh ? read(name) : get(name))),
    // dirs: empty folders to make (a new empty project: src, sim, constraints, as the server does)
    create: (name, json, files = {}, { dirs = [] } = {}) => locked(name, async () => {
      if (await store.exists(name)) fail(`project '${name}' already exists`);
      const dir = await projectDir(name, true);
      for (const d of dirs) await dirAt(dir, d.split('/'), true);
      for (const [path, data] of Object.entries(files)) await writeAt(dir, path, data);
      await writeAt(dir, PROJECT_FILE, projectJsonText(name, json));
      return read(name);
    }),
    saveJson: (name, json) => locked(name, async () => {
      const p = await get(name);
      await writeAt(await projectDir(name), PROJECT_FILE, projectJsonText(name, json));
      p.json = JSON.parse(projectJsonText(name, json));
    }),
    writeFile: (name, path, text) => locked(name, async () => {
      const p = await get(name);
      await writeAt(await projectDir(name), path, text);
      p.files[path] = text;
    }),
    removePath: (name, path) => locked(name, async () => {
      const p = await get(name);
      const e = await entryAt(await projectDir(name), path);
      if (e) await e.dir.removeEntry(e.name, { recursive: true });
      for (const k of Object.keys(p.files)) if (under(k, path)) delete p.files[k];
    }),
    // a file or a folder (copied, then the original removed: a folder handle cannot be moved)
    renamePath: (name, from, to) => locked(name, async () => {
      const p = await get(name);
      const dir = await projectDir(name);
      const e = await entryAt(dir, from) || fail(`file '${from}' not found`);
      if (e.handle.kind === 'directory') {
        const { parts, last } = split(to);
        await copyDir(e.handle, await (await dirAt(dir, parts, true)).getDirectoryHandle(last, { create: true }));
      } else await writeAt(dir, to, new Uint8Array(await (await e.handle.getFile()).arrayBuffer()));
      await e.dir.removeEntry(e.name, { recursive: true });
      for (const k of Object.keys(p.files).filter(x => under(x, from))) { const v = p.files[k]; delete p.files[k]; p.files[to + k.slice(from.length)] = v; }
    }),
    // as the server: the project folder goes to <folder>/.trash/<name>-<time> (recoverable)
    deleteProject: name => locked(name, async () => {
      const dir = await projectDir(name);
      const trash = await root.getDirectoryHandle('.trash', { create: true });
      await copyDir(dir, await trash.getDirectoryHandle(`${name}-${Date.now()}`, { create: true }));
      await root.removeEntry(name, { recursive: true });
      cache.delete(name);
    }),
    // the build's outputs (build/…), as the full application writes them
    writeBuild: (name, path, data) => locked(name, async () => writeAt(await projectDir(name), path, data)),
    readBinary: async (name, path) => {
      const e = await entryAt(await projectDir(name), path);
      return e && e.handle.kind === 'file' ? new Uint8Array(await (await e.handle.getFile()).arrayBuffer()) : null;
    },
    // a file of the project as text, also in build/ (not among the project's files): null if none
    readText: async (name, path) => {
      const e = await entryAt(await projectDir(name), path);
      return e && e.handle.kind === 'file' ? (await e.handle.getFile()).text() : null;
    },
  };
  return store;
}

// ------------------------------------------------------------------ a build's results in build/
// The full application keeps them in the project's build/ folder (server/open-flow.js: reports.json,
// for the Design Summary; server/impl-routes.js: open/fpga-view.json, the FPGA view's model of
// open/routed.xdl). In a workspace folder the browser edition writes and reads back the same files,
// so a build is still there after a reload (in the browser's storage: this session only).
export const BUILD_REPORTS = 'build/reports.json';
export const BUILD_VIEW = 'build/open/fpga-view.json';
// the FPGA view's cache: the browser edition's key, or the full application's (open:<version>:…)
const viewKey = version => `browser:${version}`;
const viewUsable = (c, version) => !!c?.model?.available && (c.key === viewKey(version) || String(c.key).startsWith(`open:${version}:`));

/** Writes a build's results into the project's build/ folder (a store without one: nothing).
 *  report: build/reports.json; view: the FPGA view's model (null: the cache of an earlier one removed). */
export async function saveBuildResults(store, name, { report, view, modelVersion }) {
  if (store.kind !== 'folder') return;
  if (report) await store.writeBuild(name, BUILD_REPORTS, JSON.stringify(report, null, 2) + '\n');
  if (view) await store.writeBuild(name, BUILD_VIEW, JSON.stringify({ key: viewKey(modelVersion), model: view }));
  else await store.removePath(name, BUILD_VIEW);
}

/** The build's results read back from the project's build/ folder: { report, view } (null: none).
 *  The FPGA view only of the Silinx toolchain's routed design (reports.json of an ISE run: none)
 *  and of this model format (modelVersion: core/xdl.js MODEL_VERSION). */
export async function readBuildResults(store, name, { modelVersion }) {
  const json = async path => { try { return JSON.parse(await store.readText(name, path)); } catch { return null; } };
  const report = await json(BUILD_REPORTS);
  if (!report || typeof report !== 'object') return { report: null, view: null };
  let view = null;
  if (report.source === 'open' && report.summary?.routed) {
    const c = await json(BUILD_VIEW);
    if (viewUsable(c, modelVersion)) view = c.model;
  }
  return { report, view };
}

// ------------------------------------------------------------------ the project operations
/** The API's project calls on the store `getStore()` returns (the one in use). */
export function projectOps(getStore, examples = {}) {
  const S = () => getStore();
  const ops = {
    list: async () => (await S().list()).map(j => ({ name: j.name, device: j.device, top: j.top, board: j.board })),
    load: name => S().load(name),
    create: async ({ name, template = 'empty', device, board }) => {
      if (!NAME_RE.test(name || '')) fail(`invalid project name '${name}'`);
      if (await S().exists(name)) fail(`project '${name}' already exists`);
      if (template && template !== 'empty') {
        const ex = examples[template] || fail(`unknown template '${template}'`);
        const json = { ...clone(ex.json), name };
        if (device) json.device = device;
        if (board !== undefined) json.board = board;
        json.files ||= [];
        await S().create(name, json, clone(ex.files));
        return clone(json);
      }
      const json = emptyProjectJson(name, { device, board });
      await S().create(name, json, {}, { dirs: ['src', 'sim', 'constraints'] });
      return clone(json);
    },
    /** A whole project at once (imports, bundles, copies): { json, files }. */
    put: async (name, json, files) => { await S().create(name, { ...json, name }, files); return clone({ ...json, name }); },
    project: async name => {
      const p = await S().load(name, { fresh: true });
      return { ...clone(p.json), fileTree: Object.keys(p.files).sort() };
    },
    saveProject: async (name, pj) => {
      await S().load(name);
      const clean = { ...clone(pj), name };
      delete clean.fileTree;
      await S().saveJson(name, clean);
      return clone(clean);
    },
    readFile: async (name, path) => {
      const t = (await S().load(name)).files[path];
      if (t === undefined) fail(`file '${path}' not found`);
      return t;
    },
    writeFile: async (name, path, text) => {
      const p = await S().load(name);
      let json = null;
      // written again: back in the project
      if ((p.json.excluded || []).includes(path)) { json = clone(p.json); json.excluded = json.excluded.filter(f => f !== path); }
      path = cleanPath(path);
      await S().writeFile(name, path, text);
      const lang = langOf(path);
      if ((lang === 'vhdl' || lang === 'verilog') && !/^build\//.test(path) && !p.json.files.some(f => f.path === path)) {   // not the generated files in build/
        json ||= clone(p.json);
        const role = /^(sim|tb|test)\//.test(path) || /(^|\/)tb_|_tb\.|_tb$/.test(path) ? 'sim' : 'design';
        json.files.push({ path, lang, role });
      }
      if (json) await S().saveJson(name, json);
      return { ok: true };
    },
    renameFile: async (name, from, to) => {
      const p = await S().load(name);
      const json = clone(p.json);
      const inside = Object.keys(p.files).filter(k => k.startsWith(`${from}/`));
      if (p.files[from] === undefined && inside.length) {
        // a folder: every file under it moves, registrations and the constraints path follow
        if (to.startsWith(`${from}/`)) fail(`cannot move '${from}' into itself`);
        if (Object.keys(p.files).some(k => under(k, to))) fail(`'${to}' already exists`);
        const remap = k => (k.startsWith(`${from}/`) ? to + k.slice(from.length) : k);
        await S().renamePath(name, from, to);
        json.files = json.files.map(f => ({ ...f, path: remap(f.path) }));
        if (json.constraints) json.constraints = remap(json.constraints);
        await S().saveJson(name, json);
        return clone(json);
      }
      if (p.files[from] === undefined) fail(`file '${from}' not found`);
      if (from !== to && p.files[to] !== undefined) fail(`'${to}' already exists`);
      if (from !== to) await S().renamePath(name, from, to);
      const lang = /\.vhdl?$/i.test(to) ? 'vhdl' : /\.(v|sv)$/i.test(to) ? 'verilog' : null;
      json.files = json.files.map(f => (f.path === from ? { ...f, path: to, lang: lang || f.lang } : f));
      if (json.constraints === from) json.constraints = to;
      await S().saveJson(name, json);
      return clone(json);
    },
    deleteFile: async (name, path) => {
      const p = await S().load(name);
      await S().removePath(name, path);
      const json = clone(p.json);
      json.files = json.files.filter(f => !under(f.path, path));
      if (json.constraints && under(json.constraints, path)) json.constraints = null;
      await S().saveJson(name, json);
      return { ok: true };
    },
    deleteProject: async name => { await S().deleteProject(name); return { ok: true }; },
    sources: async name => {
      const p = await S().load(name);
      return p.json.files.map(f => ({ ...f, text: p.files[f.path] ?? '', missing: p.files[f.path] === undefined }));
    },
  };
  return ops;
}

/** Copies every project of store `from` into store `to`; one already there (same name) is not
 *  copied. Returns { copied: [names], skipped: [names] }. */
export async function copyProjects(from, to) {
  const copied = [], skipped = [];
  for (const j of await from.list()) {
    if (await to.exists(j.name)) { skipped.push(j.name); continue; }
    const p = await from.load(j.name);
    await to.create(j.name, p.json, { ...p.files });
    copied.push(j.name);
  }
  return { copied, skipped };
}
