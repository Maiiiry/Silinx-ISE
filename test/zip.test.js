import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createZip, readZip, textOf } from '../core/zip.js';

const codec = { deflate: d => zlib.deflateRawSync(d), inflate: d => zlib.inflateRawSync(d) };

test('zip round trip (stored + deflated, UTF-8 names, binary)', async () => {
  const files = [
    { path: 'blinky.xise', data: '<?xml version="1.0"?>\n' + '<project>'.repeat(50) },
    { path: 'src/top.vhd', data: 'entity top is end;\n'.repeat(40) },
    { path: 'src/é.v', data: 'x' },
    { path: 'build/top.bit', data: new Uint8Array([0, 9, 15, 240, 255, 1, 2, 3]) },
  ];
  const z = await createZip(files, codec);
  const back = await readZip(z, codec);
  assert.deepEqual(back.map(e => e.path), files.map(f => f.path));
  assert.equal(textOf(back[1]), files[1].data);
  assert.deepEqual([...back[3].data], [...files[3].data]);
});

test('zip is readable by the system unzip and reads system zip output', async () => {
  let hasUnzip = true;
  try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); execFileSync('zip', ['-v'], { stdio: 'ignore' }); } catch { hasUnzip = false; }
  if (!hasUnzip) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xlzip-'));
  const z = await createZip([{ path: 'a/b.txt', data: 'hello '.repeat(100) }], codec);
  fs.writeFileSync(path.join(dir, 'x.zip'), z);
  assert.equal(execFileSync('unzip', ['-p', path.join(dir, 'x.zip'), 'a/b.txt']).toString(), 'hello '.repeat(100));
  fs.mkdirSync(path.join(dir, 'p/src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'p/src/m.v'), 'module m; endmodule\n'.repeat(20));
  execFileSync('zip', ['-qr', '../y.zip', '.'], { cwd: path.join(dir, 'p') });
  const back = await readZip(fs.readFileSync(path.join(dir, 'y.zip')), codec);
  assert.equal(textOf(back.find(e => e.path === 'src/m.v')), 'module m; endmodule\n'.repeat(20));
  fs.rmSync(dir, { recursive: true, force: true });
});

// the central directory's declared uncompressed size of entry k, rewritten (a zip that lies)
function declare(zip, k, usize) {
  const z = new Uint8Array(zip), dv = new DataView(z.buffer);
  let eocd = z.length - 22;
  while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < k; n++) p += 46 + dv.getUint16(p + 28, true) + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  dv.setUint32(p + 24, usize, true);
  return z;
}
const nodeCodec = { deflate: d => zlib.deflateRawSync(d), inflate: (d, limit) => zlib.inflateRawSync(d, limit === undefined ? {} : { maxOutputLength: Math.max(1, limit) }) };

test('zip limits: an entry or an archive too large is refused before it is inflated', async () => {
  const big = 'a'.repeat(1 << 20);   // 1 MB of one byte: deflates to about 1 kB
  const z = await createZip([{ path: 'a.txt', data: big }, { path: 'b.txt', data: big }], nodeCodec);
  assert.equal((await readZip(z, nodeCodec)).length, 2);
  await assert.rejects(readZip(z, nodeCodec, { maxEntry: 1 << 19 }), /zip entry too large \(a\.txt: 1048576 bytes, at most 524288\)/);
  await assert.rejects(readZip(z, nodeCodec, { maxTotal: (1 << 20) + 10 }), /zip too large once uncompressed \(more than 1048586 bytes\)/);
  // a declared size of 4 GB is refused without inflating anything
  let inflated = 0;
  const counting = { ...nodeCodec, inflate: (d, l) => { inflated++; return nodeCodec.inflate(d, l); } };
  await assert.rejects(readZip(declare(z, 0, 0xffffffff), counting), /zip entry too large \(a\.txt/);
  assert.equal(inflated, 0);
});

test('zip limits: an entry that inflates past its declared size is stopped (zip bomb)', async () => {
  const z = await createZip([{ path: 'bomb.txt', data: 'a'.repeat(1 << 20) }], nodeCodec);
  await assert.rejects(readZip(declare(z, 0, 1000), nodeCodec), /zip entry larger than it declares or corrupt \(bomb\.txt\)/);
  // the browser codec stops its stream too (Node 18+ has CompressionStream)
  const { browserCodec } = await import('../core/zip.js');
  await assert.rejects(readZip(declare(z, 0, 1000), browserCodec()), /zip entry larger than it declares or corrupt \(bomb\.txt\): output above the declared size/);
  assert.equal(textOf((await readZip(z, browserCodec()))[0]).length, 1 << 20);
});
