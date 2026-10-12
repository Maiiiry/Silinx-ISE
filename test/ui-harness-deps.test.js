// The UI harness's check of the npm dependencies (test/ui/harness.js missingDependencies): without
// node_modules (a fresh clone or worktree) the UI tests fail with "run npm ci", not with the page's
// "Cannot read properties of undefined (reading 'fold')" (no CodeMirror) (#64).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { missingDependencies, dependenciesMessage, setupUi, ROOT } from './ui/harness.js';

test('missingDependencies: the package.json dependencies not in node_modules', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-deps-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { codemirror: '^5', elkjs: '^0.9', '@yowasp/yosys': '1' }, devDependencies: { playwright: '1' } }));
    assert.deepEqual(missingDependencies(root), ['codemirror', 'elkjs', '@yowasp/yosys']);
    // a package is there when its package.json is (an empty folder is not an installed package)
    fs.mkdirSync(path.join(root, 'node_modules', 'codemirror'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', 'codemirror', 'package.json'), '{}');
    fs.mkdirSync(path.join(root, 'node_modules', '@yowasp', 'yosys'), { recursive: true });
    assert.deepEqual(missingDependencies(root), ['elkjs', '@yowasp/yosys']);
    fs.writeFileSync(path.join(root, 'node_modules', '@yowasp', 'yosys', 'package.json'), '{}');
    fs.mkdirSync(path.join(root, 'node_modules', 'elkjs'));
    fs.writeFileSync(path.join(root, 'node_modules', 'elkjs', 'package.json'), '{}');
    assert.deepEqual(missingDependencies(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(dependenciesMessage(['codemirror', 'elkjs']), 'UI tests: npm dependencies missing from node_modules (codemirror, elkjs): run npm ci');
});

test('setupUi fails with "run npm ci" when the dependencies are missing (before any browser or server)', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-deps-'));
  try {
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(root, 'package.json'));
    await assert.rejects(setupUi({ root }), { message: dependenciesMessage(['@yowasp/yosys', 'codemirror', 'elkjs', 'express']) });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
