// A scheduled workflow's failure as an issue (scripts/report-failure.mjs, #251): the lines of a job's log
// that say what failed (as the nightly of 15 October's designs job wrote them), cleaned of what must
// not be public; the issue's title and body; the workflows' last job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clean, failureLines, issueText } from '../scripts/report-failure.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const LOG = `2026-10-15T08:13:55.1002295Z   fail-on-cache-miss: false
2026-10-15T08:31:21.2439754Z  21/38 secworks-sha256          frontend pass, tb pass, synth pass, diff pass, flow fail
2026-10-15T08:31:22.0000000Z  22/38 secworks-sha1            frontend pass, tb pass, synth pass, diff pass, flow complete
2026-10-15T08:49:15.9403547Z   flow: fail: routing check: node CLB_X10Y14/W2END5 used by dut.c_reg<21> and dut.a<0>
2026-10-15T08:49:15.9403547Z   flow: fail: routing check: node CLB_X10Y14/W2END5 used by dut.c_reg<21> and dut.a<0>
2026-10-15T08:49:15.9410327Z VANISHED WARNINGS (1):
2026-10-15T08:49:15.9500000Z not ok 12 - ISE: blinky's bitstream is byte-identical
2026-10-15T08:49:15.9500001Z   AssertionError [ERR_ASSERTION]: ssh dev@192.0.2.3 failed in /Users/you/work/x.bit
2026-10-15T08:49:15.9721719Z ##[error]Process completed with exit code 1.
`;

test('report-failure: the lines that say what failed, each once, their timestamps off, cleaned', () => {
  assert.deepEqual(failureLines(LOG), [
    ' 21/38 secworks-sha256          frontend pass, tb pass, synth pass, diff pass, flow fail',
    '  flow: fail: routing check: node CLB_X10Y14/W2END5 used by dut.c_reg<21> and dut.a<0>',
    'VANISHED WARNINGS (1):',
    'not ok 12 - ISE: blinky\'s bitstream is byte-identical',
    '  AssertionError [ERR_ASSERTION]: ssh <user>@<host> failed in /Users/<user>/work/x.bit',
    '##[error]Process completed with exit code 1.',
  ]);
  assert.equal(failureLines(LOG, 2).length, 2);
  assert.deepEqual(failureLines('all fine\n ok 1 - x\n'), []);
});

test('report-failure: clean takes off home folders, logins, addresses and e-mails, not loopback', () => {
  assert.equal(clean('/home/you/x and C:\\Users\\you\\y'), '/home/<user>/x and C:\\Users/<user>\\y');
  assert.equal(clean('mail someone@uni.example, ssh me@203.0.113.9 or me@mini.test'), 'mail <e-mail>, ssh <user>@<host> or <e-mail>');
  assert.equal(clean('listening on 127.0.0.1:8080, peer 198.51.100.7'), 'listening on 127.0.0.1:8080, peer <address>');
  assert.equal(clean('module foo(input a); // v1.2'), 'module foo(input a); // v1.2');
});

test('report-failure: the issue of a failed job, its title one per workflow and job', () => {
  const t = issueText({ workflow: 'Nightly', job: 'designs', runUrl: 'https://github.com/o/r/actions/runs/1', sha: '359c48a0123456', lines: ['flow: fail: x'] });
  assert.equal(t.title, 'Nightly failed: designs');
  assert.equal(t.body, ['The scheduled run https://github.com/o/r/actions/runs/1 failed in the job **designs**, on 359c48a.', '',
    'What its log says:', '', '```', 'flow: fail: x', '```', '',
    '(Opened by the workflow, scripts/report-failure.mjs: a later failure of this job is added here while the issue is open.)'].join('\n'));
  assert.match(issueText({ workflow: 'ISE', job: 'ise', runUrl: 'u', sha: 'abcdef0', lines: [] }).body, /Its log says nothing more \(see the run\)\./);
});

test('report-failure: the scheduled workflows end with the job that reports a failure (#251)', () => {
  for (const [file, jobs] of [['nightly.yml', ['changes', 'corpus', 'vloghammer', 'designs']], ['ise.yml', ['changes', 'ise']], ['quality.yml', ['changes', 'compare']]]) {
    const yml = fs.readFileSync(path.join(ROOT, '.github/workflows', file), 'utf8');
    const job = yml.slice(yml.indexOf('\n  report:\n'));
    assert.ok(yml.includes('\n  report:\n'), file);
    assert.match(job, new RegExp(`needs: \\[${jobs.join(', ')}\\]`), file);
    assert.match(job, /if: failure\(\) && github\.event_name == 'schedule'/, file);
    assert.match(job, /runs-on: ubuntu-latest/, file);
    assert.match(job, /issues: write/, file);
    assert.match(job, /node scripts\/report-failure\.mjs/, file);
  }
});
