// Silinx HLS (#1598): the C library of the C simulation's test bench (core/c-interp.js's Machine): printf and its kin, the
// files of stdio.h in memory (fopen / fprintf / fscanf / fgets / feof / fclose: the design's data files readable, those
// written kept), system("diff [--brief] [-w | -b] a b") comparing two of them as diff does, exit, abs. What AMD's Vitis
// HLS examples' test benches use: they write their results to a file and compare it with a golden one. Isomorphic.
import { convert } from './c-interp-expr.js';

const INT = { w: 32, s: true };
const num = (v) => ({ v: BigInt(v), t: INT });
export class Exit { constructor(code) { this.code = code; } }

/** A file of the test bench: { name, text, pos, w: written }. */
const handle = (fh) => ({ fh, v: fh ? 1n : 0n, t: INT });

export const libMethods = {
  /** The file `name` names, as the test bench opens it: one written by the run, else one of the design's files
   *  (by its path, else by its name alone). */
  fileText(name) {
    if (this.fs.has(name)) return this.fs.get(name);
    const files = this.files || {};
    const k = name in files ? name : Object.keys(files).find((f) => f.split('/').pop() === name.split('/').pop());
    return k === undefined ? null : files[k];
  },
  library(name, e) {
    const A = () => e.args.map((a) => this.eval(a));
    switch (name) {
      case 'printf': case 'fprintf': {
        const args = A();
        const at = name === 'fprintf' ? 1 : 0;
        const fmt = args[at]?.str;
        if (fmt === undefined) this.fail(e, `${name}: its format must be a string`);
        const s = this.format(fmt, args.slice(at + 1), e);
        const fh = name === 'fprintf' ? args[0].fh : { std: 'out' };
        if (!fh) this.fail(e, 'fprintf: its file is not open (NULL)');
        this.write(fh, s, e);
        return num(s.length);
      }
      case 'puts': { const a = this.eval(e.args[0]); this.out.push(`${a.str ?? ''}\n`); return num(0); }
      case 'fputs': { const [a, f] = A(); this.write(f.fh, a.str ?? '', e); return num(0); }
      case 'putchar': { const a = this.eval(e.args[0]); this.out.push(String.fromCharCode(Number(this.intOf(a, e) & 255n))); return a; }
      case 'fputc': case 'putc': { const [a, f] = A(); this.write(f.fh, String.fromCharCode(Number(this.intOf(a, e) & 255n)), e); return a; }
      case 'fopen': {
        const [n, m] = A();
        if (n.str === undefined || m.str === undefined) this.fail(e, 'fopen: its name and mode must be strings');
        if (/^[wa]/.test(m.str)) {
          const fh = { name: n.str, text: m.str[0] === 'a' ? (this.fileText(n.str) ?? '') : '', pos: 0, w: true };
          this.fs.set(n.str, fh.text);
          return handle(fh);
        }
        const text = this.fileText(n.str);
        return handle(text === null ? null : { name: n.str, text, pos: 0, w: false });
      }
      case 'fclose': { const [f] = A(); if (f.fh?.w) this.fs.set(f.fh.name, f.fh.text); return num(0); }
      case 'feof': { const [f] = A(); return num(f.fh && f.fh.pos >= f.fh.text.length ? 1 : 0); }
      case 'fscanf': return this.scan(e);
      case 'fgets': {
        const [buf, n, f] = A();
        if (!buf.arr || !f.fh) this.fail(e, 'fgets: a char array and an open file');
        const fh = f.fh;
        if (fh.pos >= fh.text.length) return handle(null);
        const max = Number(this.intOf(n, e)) - 1;
        let s = '';
        while (s.length < max && fh.pos < fh.text.length) { const ch = fh.text[fh.pos++]; s += ch; if (ch === '\n') break; }
        [...s, '\0'].forEach((ch, k) => { if (k < buf.arr.length) buf.arr[k].v = BigInt(ch.charCodeAt(0)); });
        return { ...buf, v: 1n };   // (not NULL: compared with it)
      }
      case 'system': {
        const [c] = A();
        return num(this.system(c.str ?? '', e));
      }
      case 'exit': { const [c] = A(); throw new Exit(Number(convert(this.intOf(c, e), INT))); }
      case 'abs': case 'labs': case 'llabs': { const [x] = A(); const v = this.intOf(x, e); return { v: v < 0n ? -v : v, t: x.t }; }
      case 'fflush': return num(0);
      default: this.fail(e, `${name}() cannot be run in Silinx's C simulation`);
    }
    return null;
  },
  write(fh, s, e) {
    if (fh.std) { this.out.push(s); return; }
    if (!fh.w) this.fail(e, `the file '${fh.name}' is open for reading`);
    fh.text += s;
    this.fs.set(fh.name, fh.text);
  },
  /** fscanf(f, format, &x, …): the conversions %d %i %u %x %o %c %s (h, l, ll), the format's spaces any space. */
  scan(e) {
    const [f, fmtA, ...ptrs] = e.args.map((a) => this.eval(a));
    if (!f.fh || fmtA.str === undefined) this.fail(e, 'fscanf: an open file and a format');
    const fh = f.fh, fmt = fmtA.str;
    let got = 0, k = 0;
    const skip = () => { while (fh.pos < fh.text.length && /\s/.test(fh.text[fh.pos])) fh.pos++; };
    for (let i = 0; i < fmt.length; i++) {
      const ch = fmt[i];
      if (/\s/.test(ch)) { skip(); continue; }
      if (ch !== '%') { if (fh.text[fh.pos] !== ch) break; fh.pos++; continue; }
      const m = /^(hh|h|ll|l)?([diuxoc s%])/.exec(fmt.slice(i + 1).replace(/^ /, 's'));
      if (!m) this.fail(e, `fscanf: the conversion '${fmt.slice(i, i + 3)}' is not supported`);
      i += m[0].length;
      const conv = m[2];
      if (conv === '%') { if (fh.text[fh.pos] !== '%') break; fh.pos++; continue; }
      if (conv !== 'c') skip();
      if (fh.pos >= fh.text.length) return num(got || -1);
      const p = ptrs[k++];
      if (conv === 'c') { p.ptr?.set({ v: BigInt(fh.text.charCodeAt(fh.pos++)), t: INT }); got++; continue; }
      if (conv === 's') {
        let s = '';
        while (fh.pos < fh.text.length && !/\s/.test(fh.text[fh.pos])) s += fh.text[fh.pos++];
        [...s, '\0'].forEach((c, j) => { if (p.arr && j < p.arr.length) p.arr[j].v = BigInt(c.charCodeAt(0)); });
        got++;
        continue;
      }
      const re = conv === 'x' ? /^[-+]?(0[xX])?[0-9a-fA-F]+/ : conv === 'o' ? /^[-+]?[0-7]+/ : conv === 'i' ? /^[-+]?(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9]\d*)/ : /^[-+]?\d+/;
      const t = re.exec(fh.text.slice(fh.pos));
      if (!t) break;
      fh.pos += t[0].length;
      const neg = t[0].startsWith('-'), digits = t[0].replace(/^[-+]/, '');
      let v = conv === 'x' ? BigInt(`0x${digits.replace(/^0[xX]/, '')}`) : conv === 'o' ? BigInt(`0o${digits}`) : conv === 'i' ? BigInt(/^0[xX]/.test(digits) ? digits : /^0\d/.test(digits) ? `0o${digits.slice(1)}` : digits) : BigInt(digits);
      if (neg) v = -v;
      if (!p?.ptr) this.fail(e, 'fscanf: its values are read through pointers (&x)');
      p.ptr.set({ v, t: INT });
      got++;
    }
    return num(got);
  },
  /** system(cmd): only `diff [--brief | -q] [-w | -b | -B …] a b` (the examples' check of their results): 0 when the
   *  two files are the same (with -w: whatever their spaces; -b: their amounts of space; -B: blank lines), else 1. */
  system(cmd, e) {
    const w = cmd.trim().split(/\s+/);
    if (w[0] !== 'diff') this.fail(e, `system("${cmd}") cannot be run in Silinx's C simulation (only diff)`);
    const opts = w.slice(1).filter((x) => x.startsWith('-')), names = w.slice(1).filter((x) => !x.startsWith('-'));
    if (names.length !== 2) this.fail(e, `system("${cmd}"): diff compares two files`);
    const [a, b] = names.map((n) => this.fileText(n));
    if (a === null || b === null) { this.out.push(`diff: ${a === null ? names[0] : names[1]}: No such file or directory\n`); return 2; }
    const flags = opts.flatMap((o) => (o.startsWith('--') ? [o] : [...o.slice(1)].map((c) => `-${c}`)));
    const norm = (t) => {
      let L = t.split('\n');
      if (L.at(-1) === '') L = L.slice(0, -1);
      if (flags.includes('-w') || flags.includes('--ignore-all-space')) L = L.map((l) => l.replace(/\s+/g, ''));
      else if (flags.includes('-b') || flags.includes('--ignore-space-change')) L = L.map((l) => l.replace(/\s+/g, ' ').replace(/ $/, ''));
      if (flags.includes('-B') || flags.includes('--ignore-blank-lines')) L = L.filter((l) => l.trim() !== '');
      return L.join('\n');
    };
    const same = norm(a) === norm(b);
    if (!same && (flags.includes('--brief') || flags.includes('-q'))) this.out.push(`Files ${names[0]} and ${names[1]} differ\n`);
    return same ? 0 : 1;
  },
};
