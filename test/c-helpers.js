// Helpers of the Silinx HLS tests (test/c-hdl.test.js, test/c-seq.test.js): the host's C compiler (the reference),
// edge and random input values, and a C program's outputs on vectors.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { wrap } from '../core/c-types.js';

export const CC = (() => { for (const c of ['cc', 'gcc', 'clang']) { try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return c; } catch { /* next */ } } return null; })();
export const noCC = CC ? false : 'no C compiler on this machine';

export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }
export const mask = (w) => (1n << BigInt(w)) - 1n;

/** Edge and random values of an input of w bits, signed or not, as BigInt. */
export function values(w, s, n, r) {
  const lo = s ? -(1n << BigInt(w - 1)) : 0n, hi = s ? (1n << BigInt(w - 1)) - 1n : mask(w);
  const out = [0n, 1n, hi, lo, s ? -1n : hi - 1n, 2n, 100n, -100n].map((v) => wrap(v, { w, s }));
  while (out.length < n) {
    let v = 0n;
    for (let k = 0; k < w; k += 32) v = (v << 32n) | BigInt(r());
    const small = r() % 3 === 0;
    out.push(wrap(small ? BigInt(r() % 512) - 256n : v, { w, s }));
  }
  return out;
}

/** The C program's outputs on the vectors: lines "ap_return p p_written …" in hex of their widths. */
export function runC(src, top, ins, outs, ret, vectors) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-c-'));
  // (the arguments' own C types: a pointer to another type is an error for some compilers, GCC on Windows: #1577)
  const ctype = (w, s) => (w === 1 ? 'bool' : `${s ? 'signed ' : 'unsigned '}${w <= 8 ? 'char' : w <= 16 ? 'short' : w <= 32 ? 'int' : 'long long'}`);
  const lit = (v, w, s) => (w > 32 ? `${v}LL` : `${v}`).replace(/^(-?)(\d+)LL$/, (m, sg, d) => (BigInt(`${sg}${d}`) === -(1n << 63n) ? '(-9223372036854775807LL - 1)' : m)) + (s || w <= 31 ? '' : 'u');
  const calls = vectors.map((v) => {
    const decl = outs.map((o) => `${ctype(o.w, o.s)} ${o.name} = (${ctype(o.w, o.s)})0x5A5A5A5A5A5A5A5ALL; ${ctype(o.w, o.s)} ${o.name}_0 = ${o.name};`).join(' ');
    const args = [...ins.map((i) => (i.ptrIn ? `&${i.name}` : `(${ctype(i.w, i.s)})${lit(v[i.name], i.w, i.s)}`))];
    const pre = ins.filter((i) => i.ptrIn).map((i) => `${ctype(i.w, i.s)} ${i.name} = (${ctype(i.w, i.s)})${lit(v[i.name], i.w, i.s)};`).join(' ');
    const call = `${top}(${[...args, ...outs.map((o) => `&${o.name}`)].join(', ')})`;
    const prints = [ret ? `(unsigned long long)(r & 0x${mask(ret.w).toString(16)}ULL)` : null,
      ...outs.flatMap((o) => [`(unsigned long long)(${o.name} & 0x${mask(o.w).toString(16)}ULL)`, `(unsigned long long)(${o.name} != ${o.name}_0)`]),
      ...ins.filter((i) => i.ptrIn).map((i) => `(unsigned long long)(${i.name} & 0x${mask(i.w).toString(16)}ULL)`)].filter(Boolean);
    return `  { ${pre} ${decl} ${ret ? `${ctype(ret.w, ret.s)} r = ` : ''}${call}; printf("${prints.map(() => '%llx').join(' ')}\\n", ${prints.join(', ')}); }`;
  });
  const prog = `#include <stdio.h>\n#include <stdbool.h>\n${src}\nint main(void) {\n${calls.join('\n')}\n  return 0;\n}\n`;
  fs.writeFileSync(path.join(dir, 't.c'), prog);
  execFileSync(CC, ['-std=c99', '-w', '-Werror=incompatible-pointer-types', '-fsigned-char', '-fwrapv', '-O0', '-o', path.join(dir, 't'), path.join(dir, 't.c')]);
  const out = execFileSync(path.join(dir, 't'), { encoding: 'utf8' }).trim().split('\n');
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}


/** A whole program's output and exit code, compiled with cc (-fsigned-char -fwrapv). */
export function compiledRun(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-cr-'));
  try {
    fs.writeFileSync(path.join(dir, 't.c'), src);
    const exe = path.join(dir, process.platform === 'win32' ? 't.exe' : 't');
    execFileSync(CC, ['-std=c99', '-w', '-fsigned-char', '-fwrapv', '-O0', '-o', exe, path.join(dir, 't.c')]);
    try { return { output: execFileSync(exe, { encoding: 'utf8' }), exitCode: 0 }; }
    catch (e) { return { output: e.stdout, exitCode: e.status }; }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
