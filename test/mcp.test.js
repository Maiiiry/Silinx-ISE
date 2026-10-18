// The MCP server (#134): `silinx-ise mcp` spoken to over stdin / stdout as an MCP client does
// (JSON-RPC 2.0, one message a line): the handshake, the tools and their schemas, each tool on the
// examples with the exact results (Check Syntax's errors and warnings, a simulation, the power process
// and its report), the protocol's errors, the paths kept inside their project (symbolic links too) and
// the ISE machine's address never in a result.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_ORDER } from '../core/examples.js';
import { VERSION } from '../core/version.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let tmp, ws, srv;

// a client of `silinx-ise mcp`: send(msg) -> its answer (by id); call(tool, args) -> the result
function startMcp(env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'bin/silinx-ise.js'), 'mcp'], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map(), lines = [];
  let buf = '', stderr = '', id = 0;
  p.stdout.on('data', d => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      lines.push(line);
      const m = JSON.parse(line);   // (every line of stdout is a JSON-RPC message)
      waiting.get(m.id)?.(m); waiting.delete(m.id);
    }
  });
  p.stderr.on('data', d => { stderr += d; });
  const raw = (text, key) => new Promise(resolve => { waiting.set(key, resolve); p.stdin.write(`${text}\n`); });
  const send = (method, params) => { const k = ++id; return raw(JSON.stringify({ jsonrpc: '2.0', id: k, method, ...(params ? { params } : {}) }), k); };
  const call = async (name, args = {}) => { const m = await send('tools/call', { name, arguments: args }); assert.ok(m.result, JSON.stringify(m)); return m.result; };
  const close = () => new Promise(resolve => { p.on('close', resolve); p.stdin.end(); });
  return { p, send, call, raw, close, lines, stderr: () => stderr };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-mcp-'));
  ws = path.join(tmp, 'ws');
  fs.mkdirSync(path.join(tmp, 'cfg'), { recursive: true });
  // the Silinx toolchain, and an ISE machine configured (its address never in a result)
  fs.writeFileSync(path.join(tmp, 'cfg', 'config.json'), JSON.stringify({ mode: 'silinx', ssh: { user: 'someone', host: 'ise-host.example.test' } }));
  srv = startMcp({ SILINX_WORKSPACE: ws, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') });
});
after(async () => { await srv?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('the handshake: the protocol version, the server, its tools with their schemas; ping', async () => {
  const init = await srv.send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.result.serverInfo, { name: 'silinx-ise', title: 'Silinx ISE', version: VERSION });
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  assert.match(init.result.instructions, /The Silinx toolchain needs no Xilinx ISE\./);
  // an older client's version is answered with it; an unknown one with the newest
  assert.equal((await srv.send('initialize', { protocolVersion: '2024-11-05' })).result.protocolVersion, '2024-11-05');
  assert.equal((await srv.send('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-06-18');
  srv.p.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');   // (a notification: no answer)
  const { tools } = (await srv.send('tools/list')).result;
  assert.deepEqual(tools.map(t => t.name), ['list_examples', 'list_projects', 'new_project_from_example', 'project_info', 'read_file', 'write_file', 'check_syntax', 'simulate', 'run_process', 'get_report']);
  for (const t of tools) {
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.ok(t.description.length > 40 && t.title, t.name);
    assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name);
    for (const r of t.inputSchema.required || []) assert.ok(t.inputSchema.properties[r], `${t.name}: ${r}`);
  }
  assert.deepEqual(tools.find(t => t.name === 'run_process').inputSchema.properties.process.enum, ['synthesize', 'implement', 'bitstream', 'timing', 'power', 'pins']);
  assert.deepEqual((await srv.send('ping')).result, {});
});

test('the protocol\'s errors: a line that is not JSON, an unknown method, an unknown tool; a tool\'s wrong arguments are its result', async () => {
  assert.deepEqual(await srv.raw('{not json', null), { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
  assert.deepEqual((await srv.send('resources/list')).error, { code: -32601, message: 'method not found: resources/list' });
  assert.deepEqual((await srv.send('tools/call', { name: 'format_disk', arguments: {} })).error, { code: -32602, message: 'unknown tool \'format_disk\'' });
  assert.deepEqual(await srv.call('read_file', { project: 'x' }), { content: [{ type: 'text', text: 'read_file: missing path' }], isError: true });
  assert.deepEqual(await srv.call('list_projects', { verbose: true }), { content: [{ type: 'text', text: 'list_projects: unknown verbose' }], isError: true });
});

test('the examples, a new project from one (for another board too), the projects, a project\'s settings', async () => {
  const ex = await srv.call('list_examples');
  assert.deepEqual(ex.structuredContent.examples.map(e => e.name), EXAMPLE_ORDER);
  assert.deepEqual(ex.structuredContent.examples.find(e => e.name === 'blinky'), { name: 'blinky', top: 'top', simTop: 'tb_top', board: 'basys2', device: 'xc3s250ecp132-4', files: 5 });
  assert.equal((await srv.call('list_projects')).content[0].text, 'No project in the workspace (new_project_from_example makes one).');
  const made = await srv.call('new_project_from_example', { name: 'Blinky', example: 'blinky' });
  assert.equal(made.content[0].text, 'Project \'Blinky\' made from the example blinky: top top, basys2 (xc3s250ecp132-4).');
  assert.ok(fs.existsSync(path.join(ws, 'Blinky', 'silinx.json')));
  // for the Nexys2-500: its device and its pins
  const nx = await srv.call('new_project_from_example', { name: 'TrafficN', example: 'traffic', board: 'nexys2', variant: '500' });
  assert.deepEqual(nx.structuredContent.device, { family: 'spartan3e', part: 'xc3s500e', package: 'fg320', speed: '-4' });
  assert.match(fs.readFileSync(path.join(ws, 'TrafficN', 'constraints', 'traffic.ucf'), 'utf8'), /on Digilent Nexys2/);
  // refused: a name taken, an unknown example or board variant
  assert.deepEqual(await srv.call('new_project_from_example', { name: 'Blinky', example: 'gates' }), { content: [{ type: 'text', text: 'new_project_from_example: project \'Blinky\' already exists' }], isError: true });
  assert.equal((await srv.call('new_project_from_example', { name: 'X', example: 'nope' })).content[0].text, 'new_project_from_example: unknown example \'nope\' (list_examples)');
  assert.equal((await srv.call('new_project_from_example', { name: 'X', example: 'gates', board: 'basys2', variant: '500' })).content[0].text, 'new_project_from_example: the Digilent Basys2 has no variant \'500\'');
  assert.deepEqual((await srv.call('list_projects')).structuredContent.projects, [
    { name: 'Blinky', top: 'top', board: 'basys2', device: 'xc3s250ecp132-4' }, { name: 'TrafficN', top: 'top', board: 'nexys2', device: 'xc3s500efg320-4' }]);
  const info = await srv.call('project_info', { project: 'Blinky' });
  assert.equal(info.structuredContent.simTop, 'tb_top');
  assert.deepEqual(info.structuredContent.files.map(f => `${f.path} ${f.lang} ${f.role}`), ['src/counter.v verilog design', 'src/knight.vhd vhdl design', 'src/speed_ctrl.vhd vhdl design', 'src/top.vhd vhdl design', 'sim/tb_top.vhd vhdl sim'].filter(l => info.structuredContent.files.some(f => l.startsWith(f.path))));
  assert.equal((await srv.call('project_info', { project: 'Nope' })).content[0].text, 'project_info: no project \'Nope\' in the workspace');
});

test('read_file / write_file: a source read and written, a new HDL file added to the project; Silinx\'s own files and paths out of the project refused (a symbolic link too)', async () => {
  const top = (await srv.call('read_file', { project: 'Blinky', path: 'src/top.vhd' })).content[0].text;
  assert.equal(top, fs.readFileSync(path.join(ROOT, 'examples/blinky/src/top.vhd'), 'utf8'));
  const w = await srv.call('write_file', { project: 'Blinky', path: 'src/inv.vhd', text: 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture rtl of inv is begin y <= not a; end rtl;\n' });
  assert.equal(w.content[0].text, 'Created src/inv.vhd (164 characters), added to the project.');
  assert.ok(JSON.parse(fs.readFileSync(path.join(ws, 'Blinky', 'silinx.json'), 'utf8')).files.some(f => f.path === 'src/inv.vhd' && f.role === 'design'));
  assert.equal((await srv.call('write_file', { project: 'Blinky', path: 'silinx.json', text: '{}' })).content[0].text, 'write_file: \'silinx.json\' is written by Silinx itself');
  assert.equal((await srv.call('write_file', { project: 'Blinky', path: 'build/top.bit', text: 'x' })).content[0].text, 'write_file: \'build/top.bit\' is written by Silinx itself');
  for (const [tool, args] of [['read_file', { path: '../TrafficN/silinx.json' }], ['read_file', { path: '/etc/hosts' }], ['write_file', { path: '../../escape.vhd', text: 'x' }]]) {
    const r = await srv.call(tool, { project: 'Blinky', ...args });
    assert.deepEqual(r, { content: [{ type: 'text', text: `${tool}: path escapes project` }], isError: true }, `${tool} ${args.path}`);
  }
  // a symbolic link in the project to a folder outside it
  fs.mkdirSync(path.join(tmp, 'outside'));
  fs.writeFileSync(path.join(tmp, 'outside', 'secret.txt'), 'secret');
  fs.symlinkSync(path.join(tmp, 'outside'), path.join(ws, 'Blinky', 'link'), process.platform === 'win32' ? 'junction' : 'dir');   // (a junction: no rights needed on Windows)
  assert.equal((await srv.call('read_file', { project: 'Blinky', path: 'link/secret.txt' })).content[0].text, 'read_file: \'link/secret.txt\' is outside the project \'Blinky\'');
  assert.equal((await srv.call('write_file', { project: 'Blinky', path: 'link/new.vhd', text: 'x' })).content[0].text, 'write_file: \'link/new.vhd\' is outside the project \'Blinky\'');
  assert.equal(fs.readdirSync(path.join(tmp, 'outside')).join(), 'secret.txt');
  fs.rmSync(path.join(ws, 'Blinky', 'link'));
});

test('check_syntax: the design as the application checks it, then an error and a warning with their file and line', async () => {
  const ok = await srv.call('check_syntax', { project: 'Blinky' });
  assert.equal(ok.content[0].text, 'Process "Check Syntax" of <top> completed successfully (38 signals, 15 processes).');
  assert.deepEqual(ok.structuredContent, { project: 'Blinky', top: 'top', ok: true, errors: [], warnings: [] });
  assert.equal((await srv.call('check_syntax', { project: 'Blinky', simulation: true })).structuredContent.top, 'tb_top');
  // a missing ';' and an unused signal
  await srv.call('write_file', { project: 'Blinky', path: 'src/inv.vhd', text: 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture rtl of inv is\n  signal spare : std_logic;\nbegin\n  y <= not a\nend rtl;\n' });
  const bad = await srv.call('check_syntax', { project: 'Blinky', top: 'inv' });
  assert.equal(bad.structuredContent.ok, false);
  assert.deepEqual(bad.structuredContent.errors.map(e => [e.file, e.line, e.message]), [['src/inv.vhd', 6, 'expected \';\' after \'a\'']]);
  assert.match(bad.content[0].text, /^ERROR:HDLCompiler - "src\/inv\.vhd" Line 6: expected ';' after 'a'\n/);
  assert.match(bad.content[0].text, /Process "Check Syntax" of <inv> failed \(1 error\(s\), 0 warning\(s\)\)\.$/);
  // a latch, and a signal assigned but never used: the design checks' warnings
  await srv.call('write_file', { project: 'Blinky', path: 'src/inv.vhd', text: 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture rtl of inv is\n  signal spare : std_logic;\nbegin\n  y <= not a;\n  process (a) begin if a = \'1\' then spare <= a; end if; end process;\nend rtl;\n' });
  const warn = await srv.call('check_syntax', { project: 'Blinky', top: 'inv' });
  assert.deepEqual(warn.structuredContent.warnings.map(w => [w.file, w.line, w.check]), [['src/inv.vhd', 7, 'latch'], ['src/inv.vhd', 4, 'unused-signal']]);
  assert.match(warn.structuredContent.warnings[0].message, /^Found 1-bit latch for signal <spare>\./);
  assert.match(warn.content[0].text, /completed successfully with 2 warning\(s\)/);
  assert.equal((await srv.call('check_syntax', { project: 'Blinky', top: 'nothere' })).structuredContent.ok, false);
});

test('simulate: the test bench\'s signals, their last changes, its messages; a design that does not compile does not start; unknown signals refused', async () => {
  const s = await srv.call('simulate', { project: 'Blinky', time_ns: 2000, max_changes: 3 });
  assert.equal(s.isError, false);
  const d = s.structuredContent;
  assert.equal(d.top, 'tb_top');
  assert.equal(d.stoppedAtNs, 2000);
  assert.deepEqual(Object.keys(d.signals), ['clk', 'sw', 'btn', 'led']);
  assert.equal(d.signals.clk.width, 1);
  assert.equal(d.signals.clk.changes.length, 3);
  assert.equal(d.signals.clk.totalChanges, 201);   // 20 ns period from 0: a change every 10 ns
  assert.match(s.content[0].text, /^Simulation of <tb_top> stopped at 2000 ns\.\nclk = [01] \(201 changes\)\nsw = "0000"/m);
  // a signal inside the design, by its path
  const inner = await srv.call('simulate', { project: 'Blinky', time_ns: 100, signals: ['uut/led'] });
  assert.deepEqual(Object.keys(inner.structuredContent.signals), ['uut/led']);
  assert.equal((await srv.call('simulate', { project: 'Blinky', signals: ['nosuch'] })).content[0].text, 'simulate: no signal \'nosuch\' in <tb_top> (names of the top, or paths as uut/count)');
  assert.equal((await srv.call('simulate', { project: 'Blinky', time_ns: 0 })).content[0].text, 'simulate: time_ns: from 0 to 1e9 ns');
  // the test bench of stopwatch: its own report messages
  await srv.call('new_project_from_example', { name: 'Stopwatch', example: 'stopwatch' });
  const sw = await srv.call('simulate', { project: 'Stopwatch', time_ns: 5e6 });
  assert.ok(sw.structuredContent.log.length > 0, sw.content[0].text);
  assert.equal(sw.structuredContent.failed, false, sw.content[0].text);
  // does not compile: no simulation, the errors
  await srv.call('write_file', { project: 'Stopwatch', path: 'src/stopwatch.vhd', text: 'entity broken is end' });
  const no = await srv.call('simulate', { project: 'Stopwatch' });
  assert.equal(no.isError, true);
  assert.equal(no.structuredContent.started, false);
  assert.match(no.content[0].text, /The simulation of <tb_stopwatch> did not start: \d+ error\(s\) \(check_syntax with simulation\)\.$/);
});

test('run_process and get_report: the power estimate of blinky with the Silinx toolchain, its report and the Design Summary; refused without a project; the ISE machine\'s address redacted', { timeout: 300000 }, async () => {
  assert.equal((await srv.call('get_report', { project: 'TrafficN' })).content[0].text, 'No report yet for \'TrafficN\': run a process (run_process).');
  const r = await srv.call('run_process', { project: 'Blinky', process: 'power', log_lines: 5 });
  assert.equal(r.isError, false, r.content[0].text);
  assert.equal(r.structuredContent.toolchain, 'silinx');
  assert.equal(r.structuredContent.ok, true);
  assert.deepEqual(r.structuredContent.errors, []);
  assert.match(r.content[0].text, /Estimated power: [\d.]+ mW \(dynamic [\d.]+ mW, static [\d.]+ mW\), junction [\d.]+ C: build\/top\.pwr \(an estimate, not Xilinx XPower\)/);
  assert.match(r.content[0].text, /Process "power" of <top> completed successfully( with \d+ warning\(s\))? \(Silinx toolchain\)\.$/);
  assert.equal(r.structuredContent.log.length, 5);
  const pwr = await srv.call('get_report', { project: 'Blinky', report: 'power' });
  assert.match(pwr.content[0].text, /^Silinx toolchain - estimated power \(not Xilinx XPower\)\n/);
  assert.equal(pwr.structuredContent.path, 'build/top.pwr');
  const sum = await srv.call('get_report', { project: 'Blinky' });
  assert.equal(sum.structuredContent.summary.source, 'open');
  assert.equal(sum.structuredContent.summary.par.routed, true);
  assert.equal((await srv.call('get_report', { project: 'Blinky', report: 'synthesis' })).content[0].text, 'No synthesis report for \'Blinky\' yet (build/top.syr): run_process first.');
  assert.equal((await srv.call('run_process', { project: 'Nope', process: 'implement' })).content[0].text, 'run_process: no project \'Nope\' in the workspace');
  assert.equal((await srv.call('run_process', { project: 'Blinky', process: 'erase' })).content[0].text, 'run_process: process: one of synthesize, implement, bitstream, timing, power, pins');
  // a report that names the ISE machine (as an ISE run's log would): its address replaced
  fs.writeFileSync(path.join(ws, 'Blinky', 'build', 'top.pwr'), 'ssh someone@ise-host.example.test: done on ise-host.example.test\n');
  assert.equal((await srv.call('get_report', { project: 'Blinky', report: 'power' })).content[0].text, 'ssh <ISE host>: done on <ISE host>\n');
  // nothing on stdout but the protocol's messages; the server's own lines (if any) on stderr
  for (const l of srv.lines) assert.equal(JSON.parse(l).jsonrpc, '2.0');
  assert.ok(!srv.lines.some(l => l.includes('ise-host.example.test')), 'the ISE host never in a result');
});
