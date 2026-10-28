// The toolchain's package, silinx-fpga (#1677, step 6 of the toolchain's separation, #1651): an npm workspace of this
// repository, packages/silinx-fpga/, private until it is published (#1681), Apache-2.0 for its code and its data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'packages', 'silinx-fpga');
const read = (f) => fs.readFileSync(f, 'utf8');
const pkg = JSON.parse(read(path.join(DIR, 'package.json')));
const root = JSON.parse(read(path.join(ROOT, 'package.json')));
const lock = JSON.parse(read(path.join(ROOT, 'package-lock.json')));

test('#1677 silinx-fpga: a private workspace package of this repository, Apache-2.0, its own version', () => {
  assert.deepEqual(root.workspaces, ['packages/*']);
  assert.equal(pkg.name, 'silinx-fpga');
  assert.equal(pkg.private, true, 'private until it is published (#1681)');
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.type, 'module');
  assert.match(pkg.version, /^0\.\d+\.\d+$/, 'its own semver, 0.x');
  assert.notEqual(pkg.version, root.version);
  // the lock knows it, as npm writes it
  assert.deepEqual(lock.packages['node_modules/silinx-fpga'], { resolved: 'packages/silinx-fpga', link: true });
  assert.equal(lock.packages['packages/silinx-fpga'].version, pkg.version);
  assert.deepEqual(lock.packages['packages/silinx-fpga'].dependencies, pkg.dependencies);
});

test('#1677 silinx-fpga: its LICENSE is the Apache License 2.0, unchanged', () => {
  const text = read(path.join(DIR, 'LICENSE'));
  assert.ok(text.startsWith('                                 Apache License\n                           Version 2.0, January 2004\n'));
  assert.ok(!text.includes('\r'));
  assert.equal(text.split('\n').length, 202);
  assert.match(text, /\n {3}END OF TERMS AND CONDITIONS\n/);
  assert.match(text, /\n {3}Copyright \[yyyy\] \[name of copyright owner\]\n/);
});

test('#1677 silinx-fpga: its dependencies are the toolchain\'s npm packages, at the versions the IDE pins', () => {
  // (test/toolchain-boundary.test.js: the toolchain imports @yowasp/yosys alone)
  assert.deepEqual(Object.keys(pkg.dependencies), ['@yowasp/yosys']);
  for (const [name, version] of Object.entries(pkg.dependencies)) assert.equal(version, root.dependencies[name], name);
});
