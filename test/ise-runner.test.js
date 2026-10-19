// The ISE runner's protections (#482, scripts/ise-runner/): the job-started hook that refuses every job but
// ise.yml's and quality.yml's of main, the on-line window, and that only those two workflows use the
// runner's "ise" label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REPO, WORKFLOWS, OPEN, HARD_CLOSE, lastOpening, needs, decide, runs, run } from '../scripts/ise-runner/window.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'scripts/ise-runner');
const WF = path.join(ROOT, '.github/workflows');
const HOUR = 3600e3;
const posix = process.platform !== 'win32';

/** The jobs of a workflow: { name: [its lines] } (as test/workflows.test.js reads them). */
function jobs(yml) {
  const out = {};
  let name = null;
  for (const line of yml.slice(yml.indexOf('\njobs:\n') + 7).split('\n')) {
    const m = line.match(/^  ([\w-]+):$/);
    if (m) out[name = m[1]] = [];
    else if (name && /^ {4}/.test(line)) out[name].push(line);
  }
  return out;
}

// ---------------------------------------------------------------- the hook

function hook(env) {
  const r = spawnSync('sh', [path.join(DIR, 'job-started.sh')], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const OK = { GITHUB_REPOSITORY: REPO, GITHUB_EVENT_NAME: 'schedule', GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ise.yml@refs/heads/main` };

test('hook: the ISE and Quality workflows of main, on schedule or by hand, run', { skip: !posix }, () => {
  for (const wf of WORKFLOWS) for (const ev of ['schedule', 'workflow_dispatch']) {
    const r = hook({ ...OK, GITHUB_EVENT_NAME: ev, GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/${wf}@refs/heads/main` });
    assert.equal(r.code, 0, `${wf} ${ev}: ${r.err}`);
    assert.equal(r.out, `Silinx ISE runner: ${REPO}/.github/workflows/${wf}@refs/heads/main (${ev}) allowed\n`);
    assert.equal(r.err, '');
  }
});

test('hook: every other job is refused before its first step, saying why', { skip: !posix }, () => {
  const cases = [
    // a fork's pull request bringing a workflow of its own, or changing ise.yml
    [{ GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/7/merge', GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/evil.yml@refs/pull/7/merge` }, "event 'pull_request'"],
    [{ GITHUB_EVENT_NAME: 'pull_request_target' }, "event 'pull_request_target'"],
    [{ GITHUB_EVENT_NAME: 'push' }, "event 'push'"],
    [{ GITHUB_EVENT_NAME: 'workflow_run' }, "event 'workflow_run'"],
    // another workflow of main, the two workflows of another branch, another repository
    [{ GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ci.yml@refs/heads/main` }, `workflow '${REPO}/.github/workflows/ci.yml@refs/heads/main'`],
    [{ GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ise.yml@refs/heads/other` }, `workflow '${REPO}/.github/workflows/ise.yml@refs/heads/other'`],
    [{ GITHUB_REF: 'refs/heads/other' }, "ref 'refs/heads/other'"],
    [{ GITHUB_WORKFLOW_REF: `someone/Silinx-ISE/.github/workflows/ise.yml@refs/heads/main` }, "workflow 'someone/Silinx-ISE/.github/workflows/ise.yml@refs/heads/main'"],
    [{ GITHUB_REPOSITORY: 'someone/Silinx-ISE' }, "repository 'someone/Silinx-ISE'"],
    [{ GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ise.yml@refs/heads/main.evil` }, `workflow '${REPO}/.github/workflows/ise.yml@refs/heads/main.evil'`],
    // nothing set (an old runner): refused, not allowed
    [{ GITHUB_REPOSITORY: '', GITHUB_EVENT_NAME: '', GITHUB_REF: '', GITHUB_WORKFLOW_REF: '' }, "repository ''"],
  ];
  for (const [env, why] of cases) {
    const r = hook({ ...OK, ...env });
    assert.equal(r.code, 1, JSON.stringify(env));
    assert.equal(r.out, '');
    assert.equal(r.err, `Silinx ISE runner: refused, ${why} (only ${REPO}'s ise.yml and quality.yml of main, on schedule or by hand, run here)\n`);
  }
});

test('scripts: the shell scripts parse; install.sh sets the hook and the agent', { skip: !posix }, () => {
  for (const f of ['job-started.sh', 'window.sh', 'install.sh']) {
    const r = spawnSync('sh', ['-n', path.join(DIR, f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
  const install = fs.readFileSync(path.join(DIR, 'install.sh'), 'utf8');
  assert.match(install, /echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=\$DEST\/job-started\.sh" >> "\$ENVF"/);
  assert.match(install, /cp "\$SRC\/job-started\.sh" "\$SRC\/window\.sh" "\$SRC\/window\.mjs" "\$DEST\/"/, 'copied out of the checkout');
  assert.match(install, /<key>StartInterval<\/key><integer>900<\/integer>/);
  assert.match(install, /<key>RunAtLoad<\/key><true\/>/);
});

// ---------------------------------------------------------------- the label

test('workflows: only ise.yml and quality.yml reach the ISE runner, as the hook and the window say', () => {
  const hosted = /^(ubuntu|macos|windows)-[\w.]+$/;
  const reach = [];
  for (const f of fs.readdirSync(WF).filter(f => f.endsWith('.yml')).sort()) {
    const yml = fs.readFileSync(path.join(WF, f), 'utf8');
    for (const [name, lines] of Object.entries(jobs(yml))) {
      const at = lines.findIndex(l => /^ {4}runs-on:/.test(l));
      if (at < 0) continue;          // a reusable workflow's call
      const v = lines[at].replace(/^ {4}runs-on:\s*/, '').replace(/\s+#.*/, '');
      assert.notEqual(v, '', `${f}:${name}: runs-on as a group / labels map`);
      if (v === '[self-hosted, ise]') { reach.push(`${f}:${name}`); continue; }
      if (v === '${{ matrix.os }}') {
        // the matrix's operating systems: GitHub's runners only
        const body = lines.join('\n');
        const os = /^ {8}os: (.+)$/m.exec(body)[1];
        for (const label of os.match(/[\w.-]+-latest|[\w.-]+-\d[\w.]*/g)) assert.match(label, hosted, `${f}:${name}`);
        assert.doesNotMatch(os, /self-hosted|\bise\b/, `${f}:${name}`);
        continue;
      }
      assert.match(v, hosted, `${f}:${name}: runs-on ${v}`);
    }
  }
  assert.deepEqual(reach, ['ise.yml:ise', 'quality.yml:compare']);
  assert.deepEqual(WORKFLOWS, [...new Set(reach.map(j => j.split(':')[0]))]);
  const hookText = fs.readFileSync(path.join(DIR, 'job-started.sh'), 'utf8');
  for (const f of WORKFLOWS) assert.ok(hookText.includes(`"$REPO/.github/workflows/${f}@refs/heads/main"`), f);
  assert.match(hookText, /^REPO=pmnmalo\/Silinx-ISE$/m);
  // the window opens before ise.yml's cron in every season (Lisbon: UTC+0 or +1)
  assert.match(fs.readFileSync(path.join(WF, 'ise.yml'), 'utf8'), /cron: '47 21 \* \* \*'/);
  assert.ok(OPEN.hour * 60 + OPEN.minute < 21 * 60 + 47);
  assert.match(fs.readFileSync(path.join(WF, 'quality.yml'), 'utf8'), /cron: '0 23 \* \* 6'/);
});

// ---------------------------------------------------------------- the window

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m);   // October 2026: the 17th a Saturday, the 20th a Tuesday
const state = (opened, n = needs(opened)) => ({ opened: opened.getTime(), needs: n });

test('window: the latest opening, and what a window waits for', () => {
  assert.equal(at(17, 0).getDay(), 6);
  assert.deepEqual(lastOpening(at(20, 21, 15)), at(20, 21, 15));
  assert.deepEqual(lastOpening(at(20, 23, 59)), at(20, 21, 15));
  assert.deepEqual(lastOpening(at(21, 3)), at(20, 21, 15));
  assert.deepEqual(lastOpening(at(20, 21, 14)), at(19, 21, 15));
  assert.deepEqual(lastOpening(at(1, 8)), new Date(2026, 8, 30, 21, 15), 'across a month');
  assert.deepEqual(needs(at(20, 21, 15)), ['ise.yml']);
  assert.deepEqual(needs(at(17, 21, 15)), ['ise.yml', 'quality.yml'], 'Saturdays: Quality too');
  assert.deepEqual(needs(at(18, 21, 15)), ['ise.yml']);
});

test('window: it opens every evening, and closes once its runs are done', () => {
  const o = at(20, 21, 15);
  const idle = { running: true, busy: false, active: 0 };
  // the first tick ever, and the evening's
  assert.deepEqual(decide({ now: at(20, 21, 20), state: null, running: false }), { action: 'start', state: state(o), why: `the window of ${o.toString()} opens` });
  assert.equal(decide({ now: at(20, 21, 20), state: state(at(19, 21, 15)), running: false }).action, 'start');
  assert.equal(decide({ now: at(20, 21, 20), state: state(at(19, 21, 15)), running: true }).action, 'none', 'already on line');
  // the machine off all evening: the window still opens when it starts
  assert.equal(decide({ now: at(21, 9), state: state(at(19, 21, 15)), running: false }).action, 'start');
  // open: waiting for the runs, a run queued, a job on it
  assert.deepEqual(decide({ now: at(20, 22), state: state(o), ...idle, ran: {} }), { action: 'none', state: state(o), why: 'waiting for the runs' });
  assert.deepEqual(decide({ now: at(21, 1), state: state(o), ...idle, active: 1, ran: { 'ise.yml': true } }).why, '1 run(s) queued or running');
  assert.deepEqual(decide({ now: at(21, 1), state: state(o), running: true, busy: true }).why, 'a job is running');
  // done: idle, nothing queued, ISE has run
  assert.deepEqual(decide({ now: at(21, 1), state: state(o), ...idle, ran: { 'ise.yml': true } }), { action: 'stop', state: state(o), why: 'the window\'s runs have finished' });
  // closed: it stays off until the next evening
  assert.deepEqual(decide({ now: at(21, 2), state: state(o), running: false }), { action: 'none', state: state(o), why: 'closed' });
  assert.equal(decide({ now: at(21, 21, 15), state: state(o), running: false }).action, 'start');
});

test('window: on Saturdays it waits for the Quality comparison too', () => {
  const o = at(17, 21, 15);
  const idle = { running: true, busy: false, active: 0 };
  assert.equal(decide({ now: at(17, 23), state: state(o), ...idle, ran: { 'ise.yml': true } }).action, 'none');
  assert.equal(decide({ now: at(18, 10), state: state(o), ...idle, ran: { 'ise.yml': true, 'quality.yml': true } }).action, 'stop');
});

test('window: closed after its hours whatever GitHub says, never under a running job', () => {
  const o = at(20, 21, 15);
  const late = new Date(o.getTime() + HARD_CLOSE * HOUR);
  assert.equal(decide({ now: new Date(late - 60e3), state: state(o), running: true, busy: false, active: null, ran: null }).why, 'GitHub not reached');
  assert.deepEqual(decide({ now: late, state: state(o), running: true, busy: false, active: null, ran: null }).why, `${HARD_CLOSE} hours since the opening`);
  assert.equal(decide({ now: late, state: state(o), running: true, busy: false, active: 3, ran: {} }).action, 'stop', 'a queued run waits for the next evening');
  assert.equal(decide({ now: late, state: state(o), running: true, busy: true }).action, 'none');
  // the runner's service started at log-in after the window closed: stopped again at once
  assert.equal(decide({ now: at(21, 16), state: state(o), running: true, busy: false, active: 0, ran: { 'ise.yml': true } }).action, 'stop');
});

test('window: opened by hand, it closes after a run of either workflow', () => {
  const s = { opened: at(20, 10).getTime(), needs: 'any' };
  const idle = { now: at(20, 12), state: s, running: true, busy: false, active: 0 };
  assert.equal(decide({ ...idle, ran: {} }).action, 'none');
  assert.equal(decide({ ...idle, ran: { 'quality.yml': true } }).action, 'stop');
  assert.equal(decide({ ...idle, ran: { 'ise.yml': true } }).action, 'stop');
  // the evening's window replaces it
  assert.equal(decide({ ...idle, now: at(20, 21, 20), running: false }).action, 'start');
});

test('window: the runs read from GitHub\'s API (both workflows only, the window\'s own)', async () => {
  const asked = [];
  const fetchJson = async url => {
    asked.push(url);
    if (url.includes('/actions/runs?status=queued')) return { workflow_runs: [{ path: '.github/workflows/ise.yml' }, { path: '.github/workflows/ci.yml' }] };
    if (url.includes('/actions/runs?status=')) return { workflow_runs: [] };
    if (url.includes('/workflows/ise.yml/')) return { total_count: 2 };
    return { total_count: 0 };
  };
  assert.deepEqual(await runs(Date.UTC(2026, 9, 20, 20, 15, 0, 123), fetchJson), { active: 1, ran: { 'ise.yml': true, 'quality.yml': false } });
  assert.equal(asked.length, 7, 'a tick makes 7 requests: 28 an hour, under the 60 without a token');
  assert.ok(asked.every(u => u.startsWith(`https://api.github.com/repos/${REPO}/actions/`)));
  assert.ok(asked.includes(`https://api.github.com/repos/${REPO}/actions/workflows/quality.yml/runs?status=completed&created=%3E%3D2026-10-20T20:15:00Z&per_page=1`));
});

test('window: the commands, against a fake machine', async () => {
  const machine = over => {
    const m = { logs: [], svc: [], st: null, now: () => at(20, 21, 20), readState: () => m.st, writeState: s => { m.st = s; },
      running: () => false, busy: () => false, runs: async () => ({ active: 0, ran: { 'ise.yml': true } }),
      service: a => m.svc.push(a), log: msg => m.logs.push(msg), ...over };
    return m;
  };
  // tick: the evening's window opens
  let m = machine();
  assert.equal((await run('tick', m)).action, 'start');
  assert.deepEqual(m.svc, ['start']);
  assert.deepEqual(m.st, state(at(20, 21, 15)));
  // tick, on line, runs done: stops; quiet when there is nothing to do
  m = machine({ running: () => true, now: () => at(21, 2) });
  m.st = state(at(20, 21, 15));
  assert.equal((await run('tick', m)).action, 'stop');
  assert.deepEqual(m.svc, ['stop']);
  assert.deepEqual(m.logs, ['stop: the window\'s runs have finished']);
  m = machine({ now: () => at(21, 2) });
  m.st = state(at(20, 21, 15));
  await run('tick', m);
  assert.deepEqual([m.svc, m.logs], [[], []]);
  // GitHub not reached: logged, nothing changed
  m = machine({ running: () => true, now: () => at(21, 2), runs: async () => { throw new Error('offline'); } });
  m.st = state(at(20, 21, 15));
  assert.equal((await run('tick', m)).action, 'none');
  assert.deepEqual(m.logs, ['GitHub: offline']);
  // open, close, status
  m = machine({ now: () => at(20, 10) });
  m.st = state(at(19, 21, 15));
  await run('open', m);
  assert.deepEqual([m.svc, m.st], [['start'], { opened: at(20, 10).getTime(), needs: 'any' }]);
  m = machine({ running: () => true, busy: () => true });
  await run('close', m);
  assert.deepEqual([m.svc, m.logs], [[], ['none: a job is running: not closed']]);
  m = machine({ running: () => true });
  await run('close', m);
  assert.deepEqual(m.svc, ['stop']);
  m = machine({ running: () => true, now: () => at(21, 2) });
  m.st = state(at(20, 21, 15));
  await run('status', m);
  assert.deepEqual(m.svc, [], 'status changes nothing');
  assert.equal(m.logs.length, 1);
  assert.match(m.logs[0], /^runner on line; window .+; next tick: stop \(the window's runs have finished\)$/);
  await assert.rejects(run('reboot', machine()), /usage: window\.sh tick \| open \| close \| status \(not 'reboot'\)/);
});
