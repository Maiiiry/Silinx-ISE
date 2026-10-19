// The SHA-256 checksums of a release's files (scripts/checksums.mjs, #485): the format of sha256sum, checked
// against the standard's test vectors and against the system's own sha256sum / shasum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256sums, parseSums, SUMS_FILE } from '../scripts/checksums.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-sums-'));

// FIPS 180-2's examples, and the empty message
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const LONG = '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1';

test('checksums: one "<sha-256>  <name>" line per file, sorted by name, the standard\'s values', () => {
  const d = tmp();
  try {
    fs.writeFileSync(path.join(d, 'b.zip'), 'abc');
    fs.writeFileSync(path.join(d, 'a.html'), '');
    fs.mkdirSync(path.join(d, 'sub'));
    fs.writeFileSync(path.join(d, 'sub', 'C.zip'), 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq');
    const text = sha256sums([path.join(d, 'b.zip'), path.join(d, 'sub', 'C.zip'), path.join(d, 'a.html')]);
    assert.equal(text, `${LONG}  C.zip\n${EMPTY}  a.html\n${ABC}  b.zip\n`);
    assert.deepEqual(parseSums(text), [{ sha256: LONG, name: 'C.zip' }, { sha256: EMPTY, name: 'a.html' }, { sha256: ABC, name: 'b.zip' }]);
    assert.equal(SUMS_FILE, 'SHA256SUMS');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('checksums: errors (two files of one name, a missing file, a malformed line)', () => {
  const d = tmp();
  try {
    fs.mkdirSync(path.join(d, 'x'));
    for (const p of ['a.zip', 'x/a.zip']) fs.writeFileSync(path.join(d, p), p);
    assert.throws(() => sha256sums([path.join(d, 'a.zip'), path.join(d, 'x', 'a.zip')]), /two files named a\.zip/);
    assert.throws(() => sha256sums([path.join(d, 'none.zip')]), /ENOENT/);
    assert.throws(() => parseSums(`${ABC}  b.zip\nnot a sum\n`), /line 2: not "<sha-256>  <name>"/);
    assert.throws(() => parseSums(`${ABC.slice(1)}  b.zip\n`), /line 1/);
    // (the binary mark of sha256sum -b is read too)
    assert.deepEqual(parseSums(`${ABC} *b.zip\n`), [{ sha256: ABC, name: 'b.zip' }]);
    assert.deepEqual(parseSums(''), []);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('checksums: the file checks with the system\'s sha256sum / shasum, and the command line prints it', (t) => {
  const tool = [['sha256sum', ['-c']], ['shasum', ['-a', '256', '-c']]].find(([cmd]) => {
    try { execFileSync(cmd, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
  });
  const d = tmp();
  try {
    const files = ['one.zip', 'two.html'].map((f, i) => { const p = path.join(d, f); fs.writeFileSync(p, Buffer.alloc(100000 + i, i + 1)); return p; });
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/checksums.mjs'), ...files], { encoding: 'utf8' });
    assert.equal(out, sha256sums(files));
    fs.writeFileSync(path.join(d, SUMS_FILE), out);
    if (!tool) return t.skip('no sha256sum or shasum');
    assert.equal(execFileSync(tool[0], [...tool[1], SUMS_FILE], { cwd: d, encoding: 'utf8' }), 'one.zip: OK\ntwo.html: OK\n');
    // a changed file fails the check
    fs.appendFileSync(files[0], 'x');
    assert.throws(() => execFileSync(tool[0], [...tool[1], SUMS_FILE], { cwd: d, stdio: 'pipe', encoding: 'utf8' }), e => /one\.zip: FAILED/.test(e.stdout));
    assert.throws(() => execFileSync(process.execPath, [path.join(ROOT, 'scripts/checksums.mjs')], { stdio: 'pipe' }), /usage: node scripts\/checksums\.mjs/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
