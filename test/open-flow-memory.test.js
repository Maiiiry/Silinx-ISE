// The Silinx toolchain's process and memory (#156): its JavaScript heap is three quarters of the RAM
// (Node's default, about 2 GB on an 8 GB computer, is too little for the large designs), and a run
// that runs out of memory says so in plain words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { flowHeapMb } from '../server/open-flow.js';
import { exampleProject, silinxFlow } from './examples-lib.mjs';

test('Silinx toolchain memory: the heap of its process from the RAM, unless NODE_OPTIONS sets it', () => {
  const GB = 2 ** 30;
  assert.equal(flowHeapMb(8 * GB, ''), 6144);
  assert.equal(flowHeapMb(16 * GB, ''), 12288);
  assert.equal(flowHeapMb(2 * GB, ''), 2048, 'at least 2 GB');
  assert.equal(flowHeapMb(64 * GB, ''), 16384, 'at most 16 GB');
  assert.equal(flowHeapMb(8 * GB, '--max-old-space-size=3000'), null);
  assert.equal(flowHeapMb(8 * GB, '--trace-warnings'), 6144);
});

test('Silinx toolchain memory: a run out of memory says so', { timeout: 300000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-oom-'));
  const saved = process.env.NODE_OPTIONS;
  // the flow's process (it inherits NODE_OPTIONS) with far too little memory for Yosys and the placer
  process.env.NODE_OPTIONS = '--max-old-space-size=24';
  try {
    const { dir, project } = exampleProject('blinky', { board: 'basys2', variant: '250' }, tmp);
    const job = await silinxFlow(dir, project);
    assert.equal(job.status, 'error');
    const oom = job.lines.filter((l) => /^ERROR:Silinx - out of memory/.test(l));
    assert.equal(oom.length, 1, job.lines.slice(-8).join('\n'));
    assert.match(oom[0], /^ERROR:Silinx - out of memory( in step '\w+')?: the design needs more than the memory the Silinx toolchain may use on this computer \(\d+ GB of RAM\)\. Close other programs, or use a computer with more memory; NODE_OPTIONS=--max-old-space-size=<MB> sets the limit\.$/);
  } finally {
    if (saved === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = saved;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
