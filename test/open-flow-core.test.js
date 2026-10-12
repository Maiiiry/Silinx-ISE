// The Silinx toolchain's flow (core/open-flow-core.js) as the browser edition runs it
// (web/js/open-flow-worker.js: the device description and the bit database given as JSON, the
// build in memory) makes the same bitstream as the application's runner (server/open-flow-run.js:
// the files on disk): blinky on the Basys2 (XC3S250E-CP132).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runOpenFlow } from '../core/open-flow-core.js';
import { loadDevice } from '../core/fpga/device.js';
import { dbFileNames, dbFilesFrom, makeBitDb } from '../core/fpga/bitdb.js';
import { yosysNode } from '../core/synth-open-node.js';
import { shippedDevicePath } from '../core/fpga/device-node.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_DIR = path.join(ROOT, 'research/s3e-bitstream/db');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-open-flow-core-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const PJ = path.join(ROOT, 'examples/blinky');
const project = JSON.parse(fs.readFileSync(path.join(PJ, 'silinx.json'), 'utf8'));
const sources = project.files.filter(f => (f.role || 'design') === 'design' && /^(vhdl|verilog)$/.test(f.lang));
const spec = {
  top: 'top', part: 'xc3s250ecp132-4', device: 'xc3s250e', pkg: 'cp132', family: 'spartan3e', graph: shippedDevicePath('xc3s250ecp132-4'),
  steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'], seed: 1, effort: 1, startupClk: 'JtagClk',
};

test('the browser edition\'s flow (in memory, the database as JSON) writes the bitstream of the application\'s runner', { timeout: 300000 }, async () => {
  // the application: server/open-flow-run.js on files
  const buildDir = path.join(tmp, 'build'), outDir = path.join(buildDir, 'open');
  fs.mkdirSync(outDir, { recursive: true });
  const flow = { ...spec, bitDbDir: DB_DIR, buildDir, outDir, ucf: path.join(PJ, project.constraints),
    sources: sources.map(s => ({ path: s.path, lang: s.lang, file: path.join(PJ, s.path) })) };
  fs.writeFileSync(path.join(outDir, 'flow.json'), JSON.stringify(flow));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'server/open-flow-run.js'), path.join(outDir, 'flow.json')], { cwd: buildDir, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /=== SILINX DONE ===/);
  const serverBit = fs.readFileSync(path.join(buildDir, 'top.bit'));

  // the browser edition: what its worker does with the fetched assets
  const device = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(spec.graph)).toString('utf8')));
  const json = {};
  for (const [k, f] of Object.entries(dbFileNames(spec.device, spec.pkg))) {
    const p = path.join(DB_DIR, f);
    json[k] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }
  const db = makeBitDb(dbFilesFrom(json, spec.pkg), device, spec.part);
  const store = {}, lines = [], reports = [];
  const io = {
    log: l => lines.push(l),
    sources: () => sources.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(path.join(PJ, s.path), 'utf8') })),
    ucf: fs.readFileSync(path.join(PJ, project.constraints), 'utf8'), ucfName: path.basename(project.constraints),
    device: () => device, bitDb: () => db, yosys: yosysNode,
    write: (name, data) => { store[name] = data; return `build/${name}`; },
    read: name => (typeof store[name] === 'string' ? store[name] : null),
    save: rep => reports.push(rep),
  };
  const res = await runOpenFlow(spec, io);
  assert.ok(res.ok, `${res.error}\n${lines.join('\n')}`);
  assert.deepEqual(lines.filter(l => /^=== SILINX/.test(l)), [...spec.steps.map(s => `=== SILINX STEP ${s} ===`), '=== SILINX DONE ===']);
  assert.deepEqual(lines.filter(l => /warning/i.test(l)), [], 'no warnings on blinky');
  assert.ok(lines.some(l => /^Bitstream: build\/top\.bit/.test(l)), lines.join('\n'));
  assert.ok(Buffer.from(store['top.bit']).equals(serverBit), 'the same bitstream');
  assert.equal(store['open/routed.xdl'], fs.readFileSync(path.join(outDir, 'routed.xdl'), 'utf8'));
  assert.ok(reports.at(-1).bit && reports.at(-1).timing?.met !== undefined, 'the report has the bitstream and the timing');
});
