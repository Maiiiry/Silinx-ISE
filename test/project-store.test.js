// Unit tests of the browser edition's project storage (web/js/project-store.js): the browser's
// storage and a workspace folder on the disk (File System Access API, here an in-memory
// FileSystemDirectoryHandle: test/fixtures/fs-access-fake.js), behind the same project operations;
// a project in the folder is written exactly as the full application's server writes it
// (server/projects.js: silinx.json and the files).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { scratchEnv, HERE } from './server-helpers.js';
import { fakeDirectory, dump } from './fixtures/fs-access-fake.js';
import { browserStore, folderStore, projectOps, copyProjects, projectJsonText } from '../web/js/project-store.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-store-test-'); });
after(async () => { await fsp.rm(tmp, { recursive: true, force: true }); });
const P = await import('../server/projects.js');

// the examples as the single-file build embeds them (scripts/build-standalone.mjs)
function readTree(dir, base = '') {
  const out = {};
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    // hidden files (a Mac's .DS_Store) are not part of a project: the server skips them too
    if (e.name.startsWith('.')) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, readTree(dir, rel));
    else if (rel !== 'silinx.json') out[rel] = fs.readFileSync(path.join(dir, rel), 'utf8');
  }
  return out;
}
const EXDIR = path.join(HERE, '..', 'examples');
const EXAMPLES = Object.fromEntries(fs.readdirSync(EXDIR).filter((n) => fs.existsSync(path.join(EXDIR, n, 'silinx.json')))
  .map((n) => [n, { json: JSON.parse(fs.readFileSync(path.join(EXDIR, n, 'silinx.json'), 'utf8')), files: readTree(path.join(EXDIR, n)) }]));

// a project folder of the server's workspace as { 'path': text, 'dir/': null } (dump's shape)
function diskTree(dir, base = '', out = {}) {
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) { out[`${rel}/`] = null; diskTree(dir, rel, out); } else out[rel] = fs.readFileSync(path.join(dir, rel), 'utf8');
  }
  return out;
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const under = (tree, name) => sorted(Object.fromEntries(Object.entries(tree).filter(([k]) => k.startsWith(`${name}/`) && k !== `${name}/`).map(([k, v]) => [k.slice(name.length + 1), v])));
const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const folder = () => { const root = fakeDirectory('Silinx-projects'); const store = folderStore(root); return { root, store, ops: projectOps(() => store, EXAMPLES) }; };

test('folder: a new empty project is the server\'s (silinx.json text, src/ sim/ constraints/)', async () => {
  const { root, ops } = folder();
  const pj = await ops.create({ name: 'Empty', board: 'basys2' });
  await P.createProject({ name: 'Empty', board: 'basys2' });
  const server = diskTree(P.projectDir('Empty'));
  assert.deepEqual(under(await dump(root), 'Empty'), sorted(server));
  assert.deepEqual(Object.keys(server).sort(), ['constraints/', 'silinx.json', 'sim/', 'src/']);
  assert.equal(server['silinx.json'], projectJsonText('Empty', pj));
  assert.deepEqual(await ops.list(), [{ name: 'Empty', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, top: '', board: 'basys2' }]);
});

test('folder: a project from each example is the server\'s, file for file', async () => {
  const { root, ops } = folder();
  for (const t of Object.keys(EXAMPLES)) {
    const name = `Ex_${t}`;
    await ops.create({ name, template: t });
    await P.createProject({ name, template: t });
    assert.deepEqual(under(await dump(root), name), sorted(diskTree(P.projectDir(name))), t);
  }
  assert.deepEqual(Object.keys(EXAMPLES).sort(), ['blinky', 'clock', 'pong', 'stopwatch']);
});

test('folder: writing, renaming (files and folders), deleting and saving keep silinx.json as the server does', async () => {
  const { root, ops, store } = folder();
  await ops.create({ name: 'Edit' });
  await P.createProject({ name: 'Edit' });
  const both = async (fn, sfn) => { await fn(); await sfn(); };
  await both(() => ops.writeFile('Edit', 'src/a.vhd', 'entity a is end;\n'), () => P.writeFile('Edit', 'src/a.vhd', 'entity a is end;\n'));
  await both(() => ops.writeFile('Edit', 'sim/tb_a.vhd', '-- tb\n'), () => P.writeFile('Edit', 'sim/tb_a.vhd', '-- tb\n'));
  await both(() => ops.writeFile('Edit', 'notes.txt', 'n'), () => P.writeFile('Edit', 'notes.txt', 'n'));
  await both(() => ops.writeFile('Edit', 'ip/deep/er/x.v', 'module x; endmodule\n'), () => P.writeFile('Edit', 'ip/deep/er/x.v', 'module x; endmodule\n'));
  await both(() => ops.writeFile('Edit', 'constraints/top.ucf', 'NET "a" LOC = "P1";\n'), () => P.writeFile('Edit', 'constraints/top.ucf', 'NET "a" LOC = "P1";\n'));
  await both(() => ops.renameFile('Edit', 'src/a.vhd', 'src/b.vhd'), () => P.renameFile('Edit', 'src/a.vhd', 'src/b.vhd'));
  await both(() => ops.renameFile('Edit', 'ip', 'lib'), () => P.renameFile('Edit', 'ip', 'lib'));
  await both(() => ops.renameFile('Edit', 'constraints', 'ucf'), () => P.renameFile('Edit', 'constraints', 'ucf'));
  await both(() => ops.deleteFile('Edit', 'sim/tb_a.vhd'), () => P.deleteFile('Edit', 'sim/tb_a.vhd'));
  const pj = await ops.project('Edit');
  assert.deepEqual(pj.fileTree, ['lib/deep/er/x.v', 'notes.txt', 'src/b.vhd', 'ucf/top.ucf']);
  await both(() => ops.saveProject('Edit', { ...pj, top: 'b' }), async () => P.writeProject('Edit', { ...await P.readProject('Edit'), top: 'b' }));
  const tree = under(await dump(root), 'Edit');
  assert.deepEqual(tree, sorted(diskTree(P.projectDir('Edit'))));
  assert.deepEqual(JSON.parse(tree['silinx.json']).files, [{ path: 'src/b.vhd', lang: 'vhdl', role: 'design' }, { path: 'lib/deep/er/x.v', lang: 'verilog', role: 'design' }]);
  assert.equal(JSON.parse(tree['silinx.json']).constraints, 'ucf/top.ucf');
  assert.equal(await ops.readFile('Edit', 'lib/deep/er/x.v'), 'module x; endmodule\n');
  assert.deepEqual((await ops.sources('Edit')).map((s) => [s.path, s.text, !!s.missing]), [['src/b.vhd', 'entity a is end;\n', false], ['lib/deep/er/x.v', 'module x; endmodule\n', false]]);
  // a file written again leaves the excluded list; a folder deleted with everything in it
  await ops.saveProject('Edit', { ...await ops.project('Edit'), excluded: ['notes.txt'] });
  await ops.writeFile('Edit', 'notes.txt', 'again');
  assert.equal((await ops.project('Edit')).excluded.length, 0);
  await ops.deleteFile('Edit', 'lib');
  assert.deepEqual((await ops.project('Edit')).fileTree, ['notes.txt', 'src/b.vhd', 'ucf/top.ucf']);
  assert.deepEqual((await ops.project('Edit')).files, [{ path: 'src/b.vhd', lang: 'vhdl', role: 'design' }]);
  assert.equal(Object.keys(await dump(root)).some((k) => k.startsWith('Edit/lib')), false);
  // the build's files: in build/, not in the project's files; read back as bytes
  await store.writeBuild('Edit', 'build/top.bit', new Uint8Array([0, 9, 255]));
  assert.deepEqual([...await store.readBinary('Edit', 'build/top.bit')], [0, 9, 255]);
  assert.equal(await store.readBinary('Edit', 'build/none.bit'), null);
  assert.deepEqual((await ops.project('Edit')).fileTree, ['notes.txt', 'src/b.vhd', 'ucf/top.ucf']);
});

test('folder: the exact errors (as the browser storage\'s)', async () => {
  for (const make of [() => folder(), () => { const s = browserStore(memStorage()); return { ops: projectOps(() => s, EXAMPLES) }; }]) {
    const { ops } = make();
    await ops.create({ name: 'Err' });
    await ops.writeFile('Err', 'src/a.vhd', 'a');
    await ops.writeFile('Err', 'src/b.vhd', 'b');
    await ops.writeFile('Err', 'lib/x.v', 'x');
    const errs = [
      [() => ops.create({ name: 'Err' }), "project 'Err' already exists"],
      [() => ops.create({ name: '1bad' }), "invalid project name '1bad'"],
      [() => ops.create({ name: 'T', template: 'nope' }), "unknown template 'nope'"],
      [() => ops.project('Nope'), "project 'Nope' not found"],
      [() => ops.readFile('Err', 'src/zz.vhd'), "file 'src/zz.vhd' not found"],
      [() => ops.renameFile('Err', 'src/zz.vhd', 'src/y.vhd'), "file 'src/zz.vhd' not found"],
      [() => ops.renameFile('Err', 'src/a.vhd', 'src/b.vhd'), "'src/b.vhd' already exists"],
      [() => ops.renameFile('Err', 'lib', 'lib/inner'), "cannot move 'lib' into itself"],
      [() => ops.renameFile('Err', 'lib', 'src'), "'src' already exists"],
      [() => ops.writeFile('Err', '../out.v', 'x'), 'invalid path'],
    ];
    for (const [fn, msg] of errs) await assert.rejects(fn, { message: msg });
  }
});

test('folder: listing (no hidden folders, no folders without silinx.json), reading again what changed on the disk, delete to .trash', async () => {
  const { root, ops } = folder();
  await ops.create({ name: 'Bbb' });
  await ops.create({ name: 'Aaa', template: 'blinky' });
  await root.getDirectoryHandle('not-a-project', { create: true });
  await (await root.getDirectoryHandle('.hidden', { create: true })).getDirectoryHandle('Ccc', { create: true });
  assert.deepEqual((await ops.list()).map((p) => p.name), ['Aaa', 'Bbb']);
  // another program changed a file: opening the project reads it again
  await ops.readFile('Aaa', 'src/top.vhd');
  const w = await (await (await (await root.getDirectoryHandle('Aaa')).getDirectoryHandle('src')).getFileHandle('top.vhd')).createWritable();
  await w.write('-- changed outside\n'); await w.close();
  await ops.project('Aaa');
  assert.equal(await ops.readFile('Aaa', 'src/top.vhd'), '-- changed outside\n');
  // deleted: into .trash/<name>-<time>, as the server does
  await ops.deleteProject('Aaa');
  assert.deepEqual((await ops.list()).map((p) => p.name), ['Bbb']);
  const tree = await dump(root);
  const trashed = Object.keys(tree).find((k) => /^\.trash\/Aaa-\d+\/$/.test(k));
  assert.ok(trashed, Object.keys(tree).join(' '));
  assert.equal(tree[`${trashed}src/top.vhd`], '-- changed outside\n');
  assert.ok(tree[`${trashed}silinx.json`].includes('"name": "Aaa"'));
  await assert.rejects(() => ops.project('Aaa'), { message: "project 'Aaa' not found" });
});

test('browser storage: the same operations, kept in localStorage under silinx.standalone.fs (the format of earlier versions)', async () => {
  const ls = memStorage();
  ls.setItem('silinx.standalone.fs', JSON.stringify({ Old: { json: { name: 'Old', version: 1, files: [], top: 'x' }, files: { 'src/x.vhd': '-- x' } } }));
  const s = browserStore(ls);
  const ops = projectOps(() => s, EXAMPLES);
  assert.deepEqual((await ops.list()).map((p) => p.name), ['Old']);
  await ops.create({ name: 'New', template: 'pong' });
  await ops.writeFile('New', 'src/extra.v', 'module extra; endmodule');
  await ops.renameFile('New', 'src', 'rtl');
  const saved = JSON.parse(ls.getItem('silinx.standalone.fs'));
  assert.deepEqual(Object.keys(saved), ['Old', 'New']);
  assert.ok(saved.New.json.files.every((f) => f.path.startsWith('rtl/') || f.path.startsWith('sim/')));
  assert.equal(saved.New.files['rtl/extra.v'], 'module extra; endmodule');
  await ops.deleteProject('Old');
  assert.deepEqual(Object.keys(JSON.parse(ls.getItem('silinx.standalone.fs'))), ['New']);
  // a full localStorage: why, and what to do
  const full = browserStore({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } });
  await assert.rejects(() => projectOps(() => full).create({ name: 'Big' }),
    { message: 'browser storage is full or unavailable (QuotaExceededError); download your project bundle to keep it' });
});

test('copying the browser\'s projects into the folder: the same projects; one of the same name already there is not copied', async () => {
  const ls = memStorage();
  const b = browserStore(ls);
  const bops = projectOps(() => b, EXAMPLES);
  await bops.create({ name: 'One', template: 'blinky' });
  await bops.writeFile('One', 'src/mine.vhd', '-- mine\n');
  await bops.create({ name: 'Two' });
  const { root, store, ops } = folder();
  await ops.create({ name: 'Two' });
  assert.deepEqual(await copyProjects(b, store), { copied: ['One'], skipped: ['Two'] });
  assert.deepEqual((await ops.list()).map((p) => p.name), ['One', 'Two']);
  const one = await bops.project('One');
  assert.deepEqual(await ops.project('One'), one);
  const tree = await dump(root);
  assert.equal(tree['One/silinx.json'], projectJsonText('One', (await b.load('One')).json));
  assert.equal(tree['One/src/mine.vhd'], '-- mine\n');
  // the browser's projects stay
  assert.deepEqual((await bops.list()).map((p) => p.name), ['One', 'Two']);
});

test('the fake folder: kept in a Storage and read back (a page reload), its permission asked again', async () => {
  const ls = memStorage();
  const a = fakeDirectory('Silinx-projects', { storage: ls, key: 'k' });
  await projectOps(() => folderStore(a), EXAMPLES).create({ name: 'Kept', template: 'clock' });
  const b = fakeDirectory('Silinx-projects', { storage: ls, key: 'k', permission: 'prompt' });
  assert.equal(await b.queryPermission({ mode: 'readwrite' }), 'prompt');
  assert.deepEqual((await projectOps(() => folderStore(b)).list()).map((p) => p.name), ['Kept']);
  await assert.rejects(() => projectOps(() => folderStore(b)).create({ name: 'No' }), { name: 'NotAllowedError' });
  assert.equal(await b.requestPermission({ mode: 'readwrite' }), 'granted');
  await projectOps(() => folderStore(b)).create({ name: 'Yes' });
  assert.deepEqual(Object.keys(await dump(fakeDirectory('x', { storage: ls, key: 'k' }))).filter((k) => k.endsWith('silinx.json')), ['Kept/silinx.json', 'Yes/silinx.json']);
});

// a hidden file in an example's folder (a Mac's .DS_Store, left by the Finder) is not copied into a
// project, neither by the server nor by the single-file edition's build (scripts/build-standalone.mjs)
test('hidden files of an example (.DS_Store) are not part of the projects made from it', async () => {
  const hidden = path.join(EXDIR, 'pong', '.silinx-hidden-test');
  fs.writeFileSync(hidden, 'not a project file\n');
  try {
    await P.createProject({ name: 'HiddenPong', template: 'pong' });
    assert.deepEqual(Object.keys(diskTree(P.projectDir('HiddenPong'))).filter((k) => k.split('/').some((s) => s.startsWith('.'))), []);
    const build = fs.readFileSync(path.join(HERE, '..', 'scripts', 'build-standalone.mjs'), 'utf8');
    assert.match(build, /if \(e\.name\.startsWith\('\.'\)\) continue;/, 'the single-file edition skips hidden files too');
  } finally { fs.rmSync(hidden, { force: true }); }
});
