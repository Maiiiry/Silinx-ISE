// Any HDL module made a schematic (#225): Convert to Schematic (editable). The schematic becomes the
// module's base and its HDL file is generated from it (#220), so the conversion must keep the design
// as it is: what can be drawn becomes gates, multiplexers, slices, constants and module instances;
// everything else (processes, always blocks, generates, FSMs, memories, functions, records…) stays
// as HDL blocks inside the schematic, with its text; the declarations, generics / parameters and the
// context clause are kept in the schematic too (schdoc.js, schematicFromHdl).
//
// Here: the files the conversion writes, and the check that the design did not change.
//   - the module's file holds only it: that file becomes the HDL generated from the schematic;
//   - the file holds other design units too (a package, other entities or modules): the module is
//     taken out of it and its HDL generated into a file of its own, named after it; the other units
//     stay in the file (or, when the file is named after the module, it stays the module's and they
//     go to a file named after the first of them): nothing of them is lost when the schematic later
//     rewrites its HDL;
//   - a VHDL entity and its architecture in two files: both are taken out (a file left with nothing
//     else is removed, its content being in the generated file).
// The project is compiled again with those files: a conversion that would bring an error is refused
// (nothing written); a new warning is returned (the app shows it).
//
//   import { convertModuleToSchematic, moduleUnitRanges } from '/core/hdl-to-sch.js';
import { compile, elaborate, langOfPath } from './compile.js';
import { schematicFromHdl, generateHdl, normalizeDoc, modulesFromLibrary, tokenize } from './schdoc.js';
import { designChecks } from './lint.js';

const lineStart = (text, off) => text.lastIndexOf('\n', off - 1) + 1;
// the offset after the end of the line of `off` when the rest of that line is blank or a comment
function lineEndAfter(text, off, lang) {
  const nl = text.indexOf('\n', off);
  const rest = text.slice(off, nl < 0 ? text.length : nl);
  const blank = lang === 'vhdl' ? /^\s*(--.*)?$/ : /^\s*(\/\/.*)?$/;
  return blank.test(rest) ? (nl < 0 ? text.length : nl + 1) : off;
}
// back from the start of a line over the comment lines just above it (a unit's leading comment):
// the blank lines before that comment stay
function withLeadingComment(text, start, lang) {
  const cm = lang === 'vhdl' ? /^\s*--/ : /^\s*\/\//;
  let s = start;
  for (;;) {
    if (s === 0) break;
    const p = lineStart(text, s - 1);
    const line = text.slice(p, s - 1);
    if (cm.test(line)) s = p; else break;
  }
  return s;
}

/**
 * The design units of an HDL text, each with its text range [start, end) (its leading comment and
 * VHDL context clause included): [{ kind, name, of?, start, end }]. kind: VHDL 'entity',
 * 'architecture' (of: its entity), 'package', 'package body', 'configuration', 'context'; Verilog
 * 'module' (also macromodule / primitive), 'package', 'interface', 'program'. Names lower-cased in
 * VHDL. What lies outside every range (blank lines, comments between units, Verilog compiler
 * directives) belongs to the file.
 */
export function designUnits(text, lang) {
  const toks = tokenize(text, lang);
  const units = [];
  if (lang === 'vhdl') {
    const heads = [];
    for (let k = 0; k < toks.length; k++) {
      if (k > 0 && toks[k - 1].v !== ';') continue;
      const v = toks[k].v, n1 = toks[k + 1], n2 = toks[k + 2];
      let u = null;
      if (v === 'entity' && n1?.k === 'id' && n2?.v === 'is') u = { kind: 'entity', name: n1.v };
      else if (v === 'architecture' && n1?.k === 'id' && n2?.v === 'of' && toks[k + 3]?.k === 'id' && toks[k + 4]?.v === 'is') u = { kind: 'architecture', name: n1.v, of: toks[k + 3].v };
      else if (v === 'package' && n1?.v === 'body' && n2?.k === 'id' && toks[k + 3]?.v === 'is') u = { kind: 'package body', name: n2.v };
      else if (v === 'package' && n1?.k === 'id' && n2?.v === 'is') u = { kind: 'package', name: n1.v };
      else if (v === 'configuration' && n1?.k === 'id' && n2?.v === 'of') u = { kind: 'configuration', name: n1.v, of: toks[k + 3]?.v };
      else if (v === 'context' && n1?.k === 'id' && n2?.v === 'is') u = { kind: 'context', name: n1.v };
      if (u) heads.push({ ...u, as: toks[k + (u.kind === 'package body' ? 2 : 1)].raw, tok: k });
    }
    // each unit's context clause: the library / use / context statements just before it
    for (const h of heads) {
      let s = h.tok;
      for (;;) {
        if (s === 0 || toks[s - 1].v !== ';') break;
        let p = s - 1;
        while (p > 0 && toks[p - 1].v !== ';') p--;
        const w = toks[p].v;
        if (w === 'library' || w === 'use' || (w === 'context' && toks[p + 2]?.v !== 'is')) s = p; else break;
      }
      h.first = s;
    }
    heads.forEach((h, i) => {
      const next = heads[i + 1];
      // its last ';' before the next unit's first token
      let e = (next ? next.first : toks.length) - 1;
      while (e > h.tok && toks[e].v !== ';') e--;
      const start = withLeadingComment(text, lineStart(text, toks[h.first].s), lang);
      units.push({ kind: h.kind, name: h.name, as: h.as, ...(h.of ? { of: h.of } : {}), start, end: lineEndAfter(text, toks[e].e, lang) });
    });
  } else {
    const ENDS = { module: 'endmodule', macromodule: 'endmodule', primitive: 'endprimitive', package: 'endpackage', interface: 'endinterface', program: 'endprogram' };
    for (let k = 0; k < toks.length; k++) {
      const v = toks[k].v;
      if (!ENDS[v] || toks[k + 1]?.k !== 'id') continue;
      let e = k + 1;
      while (e < toks.length && toks[e].v !== ENDS[v]) e++;
      if (e >= toks.length) e = toks.length - 1;
      if (toks[e + 1]?.v === ':' && toks[e + 2]?.k === 'id') e += 2;   // (SystemVerilog: endmodule : name)
      // (a lifetime: module automatic m)
      const name = ['automatic', 'static'].includes(toks[k + 1].v) && toks[k + 2]?.k === 'id' ? toks[k + 2].v : toks[k + 1].v;
      units.push({ kind: v === 'macromodule' ? 'module' : v, name, as: name, start: withLeadingComment(text, lineStart(text, toks[k].s), lang), end: lineEndAfter(text, toks[e].e, lang) });
      k = e;
    }
  }
  return units;
}

// a text with the ranges taken out
const cut = (text, ranges) => {
  let out = '', at = 0;
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) { out += text.slice(at, r.start); at = Math.max(at, r.end); }
  return out + text.slice(at);
};
// whether a text (what is left of a file) still holds design units: anything but comments, blank
// lines, Verilog compiler directives and VHDL library / use clauses
function holdsUnits(text, lang) {
  if (lang === 'vhdl') return designUnits(text, lang).length > 0;
  const noDirectives = text.split('\n').filter(l => !/^\s*`/.test(l)).join('\n');
  return tokenize(noDirectives, lang).length > 0;
}

/**
 * The ranges of a module's text in the files that hold it: { [path]: { ranges, rest, others } }
 * (rest: the file without the module; others: whether it holds other design units). VHDL: the
 * entity and every architecture of it.
 */
export function moduleUnitRanges(texts, mod) {
  const out = {};
  const lang = mod.lang;
  const ci = lang === 'vhdl';
  const name = ci ? mod.name.toLowerCase() : mod.name;
  for (const path of [...new Set([mod.file, mod.archFile].filter(Boolean))]) {
    const text = texts[path];
    if (typeof text !== 'string') continue;
    const ranges = designUnits(text, lang).filter(u => (ci ? (u.kind === 'entity' && u.name === name) || (u.kind === 'architecture' && u.of === name)
      : u.kind === 'module' && u.name === name));
    if (!ranges.length) continue;
    const rest = cut(text, ranges).replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '\n');
    out[path] = { ranges, rest, others: holdsUnits(rest, lang) };
  }
  return out;
}

const msgKey = d => `${d.severity}: ${String(d.message).replace(/\s+/g, ' ')}`;
// the messages of b that a does not have (as many times as b has them more)
function added(a, b) {
  const n = new Map();
  for (const x of a) n.set(x, (n.get(x) || 0) + 1);
  const out = [];
  for (const x of b) { const k = n.get(x) || 0; if (k > 0) n.set(x, k - 1); else out.push(x); }
  return out;
}
// what the project says of a module: the compiler's errors and warnings, the elaboration's and the
// design checks' (lint and rules) of the module
function verdict(sources, module) {
  const lib = compile(sources);
  const d = elaborate(lib, module);
  let checks = [];
  try { checks = designChecks(lib, d); } catch { /* none */ }
  return { lib, design: d, msgs: [...lib.errors, ...(d.diags || []), ...checks].map(msgKey) };
}

/**
 * Convert a module of the project to a schematic. sources: the project's HDL sources
 * [{ path, text, lang?, role? }]; module: its name; layout: an ELK-style layout function (optional);
 * exists(path): whether a file of the project folder exists (for the new files' names).
 * Returns { doc, schPath, hdlPath, writes: { [path]: text | null (removed) }, newFiles: { [path]: role },
 * kept: [the files that keep other design units], moved (kept is not empty), warnings: [message],
 * counts: { blocks, drawn } }. Throws an Error (nothing to write) when the module cannot be
 * converted: it does not elaborate, or its HDL generated from the schematic would not compile as it
 * did (the error said).
 */
export async function convertModuleToSchematic({ sources, module, layout, exists = () => false }) {
  const texts = Object.fromEntries(sources.map(s => [s.path, s.text]));
  const before = verdict(sources, module);
  const lib = before.lib;
  const mod = [...lib.modules.values()].find(m => m.name === module) || [...lib.modules.values()].find(m => m.name.toLowerCase() === String(module).toLowerCase());
  if (!mod) throw new Error(`No module '${module}' in the project.`);
  if (mod.lang !== 'vhdl' && mod.lang !== 'verilog') throw new Error(`'${module}' is not an HDL module.`);
  const design = before.design;
  const errs = [...lib.errors.filter(e => e.severity === 'error' && (e.file === mod.file || e.file === mod.archFile)), ...(design.diags || []).filter(e => e.severity === 'error')];
  if (!design.top || errs.length) throw new Error(`'${module}' does not elaborate${errs.length ? ` (${errs.slice(0, 3).map(e => e.message).join('; ')})` : ''}: correct it first.`);
  const modules = modulesFromLibrary(lib, { sources: texts });
  const doc = await schematicFromHdl(design.top, { sources: texts, modules, layout, lang: mod.lang });
  const gen = generateHdl(normalizeDoc(JSON.parse(JSON.stringify(doc))), { lang: doc.lang, modules });
  const gerrs = gen.diagnostics.filter(x => x.severity === 'error');
  if (gerrs.length) throw new Error(`The schematic of '${module}' cannot make its HDL: ${gerrs.map(x => x.message).join('; ')}`);

  // the files: the module's own file becomes its generated HDL, unless it holds other units
  const file = mod.archFile || mod.file;
  // (next to the module's file)
  const at = n => (file.includes('/') ? `${file.replace(/\/[^/]*$/, '')}/${n}` : n);
  const ext = mod.lang === 'verilog' ? (/\.sv$/i.test(file) ? 'sv' : 'v') : (/\.vhdl$/i.test(file) ? 'vhdl' : 'vhd');
  const where = moduleUnitRanges(texts, mod);
  if (!where[file]) throw new Error(`The text of '${module}' is not found in ${file}.`);
  const writes = {};
  const newFiles = {};          // the files made: path -> role (the role of the file they come from)
  const roleOf = p => sources.find(s => s.path === p)?.role || 'design';
  const taken = p => exists(p) || p in texts || p in writes;
  const freeName = base => { let p = at(`${base}.${ext}`); for (let k = 2; taken(p); k++) p = at(`${base}_${k}.${ext}`); return p; };
  const warnings = [];
  let hdlPath = file;
  if (where[file].others) {
    const own = file.split('/').pop().replace(/\.[^.]*$/, '').toLowerCase() === mod.name.toLowerCase();
    if (own) {
      // the file is named after the module: it stays the module's (its HDL generated); the other
      // units go to a file named after the first of them
      const first = designUnits(where[file].rest, mod.lang)[0];
      const restPath = freeName(first?.as || first?.name || `${mod.name}_units`);
      writes[restPath] = where[file].rest; newFiles[restPath] = roleOf(file);
    } else {
      // the other units stay in the file; the module's HDL in a file of its own, named after it
      hdlPath = freeName(mod.name);
      writes[file] = where[file].rest; newFiles[hdlPath] = roleOf(file);
    }
  }
  for (const [p, w] of Object.entries(where)) {
    if (mod.lang === 'vhdl') {
      const extra = w.ranges.filter(u => u.kind === 'architecture' && mod.arch && u.name !== String(mod.arch).toLowerCase());
      for (const u of extra) warnings.push(`architecture '${u.name}' of '${mod.name}' (not the one used) is not kept: it was in ${p}`);
    }
    // (an entity in a file of its own, its architecture in another one: that file goes, the entity
    // being in the generated HDL)
    if (p !== file) writes[p] = w.others ? w.rest : null;
  }
  writes[hdlPath] = gen.code;
  doc.generatedFile = hdlPath;
  const schPath = at(`${mod.name}.sch.json`);

  // the design with them: no new error, the new warnings said
  const after = [];
  for (const s of sources) if (!(s.path in writes)) after.push(s); else if (writes[s.path] != null) after.push({ ...s, text: writes[s.path] });
  for (const [p, r] of Object.entries(newFiles)) after.push({ path: p, text: writes[p], lang: langOfPath(p) || mod.lang, role: r });
  const now = verdict(after, mod.name);
  const news = added(before.msgs, now.msgs);
  const newErrs = news.filter(m => m.startsWith('error'));
  if (newErrs.length || !now.design.top) throw new Error(`Not converted: the HDL generated from the schematic of '${module}' would not compile as the module does (${newErrs.slice(0, 4).join('; ') || 'it does not elaborate'}).`);
  for (const m of news) warnings.push(m.replace(/^warning: /, ''));
  for (const d of doc.importDiagnostics || []) warnings.push(d.message || String(d));
  for (const d of gen.diagnostics) if (d.severity !== 'error') warnings.push(d.message);
  const blocks = doc.symbols.filter(s => s.type === 'hdlblock').length;
  const kept = Object.keys(where).filter(p => where[p].others);
  return { doc, schPath, hdlPath, writes, newFiles, kept, moved: kept.length > 0, warnings, counts: { blocks, drawn: doc.symbols.length - blocks } };
}
