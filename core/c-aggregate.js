// Silinx HLS (#1628): a struct argument or result of the top function one port, as Vitis HLS aggregates it (UG1399,
// Structs in the Interface, the Vivado IP flow): its members packed in their order, the first at the LSB, each the
// size of its C type (bool and char 8 bits, an ap_int<W> rounded up to 8, 16, 32 or 64 bits…, 1-byte alignment), the
// padding bits 0. The module's ports are the struct's; its members' ports (core/c-dataflow.js, core/c-fsmd.js) become
// signals inside it, their slices of the port:
//   read only: the input <name>;
//   written: <name>_i, <name>_o and <name>_o_ap_vld (1 when one of its members is written), each member not written
//   its value read (a sequential module reads them all at the start of a call: core/c-fsmd.js);
//   returned: ap_return.
// A stream of structs and an array of structs keep a stream or a memory per member for now (a warning, #1668).
// Isomorphic ES module: no DOM and no Node APIs.
//
//   aggregate(structArgs, params, ports, { seq, rn }) ->
//     { ports: the module's, inner: the members' ports as signals, vhdl: [lines], verilog: [lines], groups }
//   cBits(bits) -> the size of a C integer of that width, in bits

/** The size of a C integer of `bits` bits: whole bytes, a power of 2 of them. */
export function cBits(bits) {
  let b = 8;
  while (b < bits) b *= 2;
  return b;
}

/** The fields of a struct's port: [{ param, off, w (the member's bits), size (its C size) }] and its width. */
export function layout(members, params) {
  const fields = [];
  let off = 0;
  for (const m of members) {
    const pa = params.find((p) => p.name === m);
    const t = pa?.type.kind === 'ptr' ? pa.type.to : pa?.type;
    if (!t || t.bits == null) return null;
    fields.push({ param: m, off, w: t.bits, size: cBits(t.bits) });
    off += cBits(t.bits);
  }
  return { fields, w: off };
}

/** Whether a struct argument is made one port: its members scalars (an array or a stream of structs: not yet). */
export const aggregable = (a, params) => !a.stream && a.members.every((m) => {
  const pa = params.find((p) => p.name === m);
  return pa && pa.type.kind !== 'array' && pa.type.kind !== 'stream' && !(pa.type.kind === 'ptr' && pa.type.to.kind === 'array');
});

export function aggregate(structArgs, params, ports, { seq = false, rn = (n) => n } = {}) {
  const inner = [], vhdl = [], verilog = [], groups = [];
  let outer = ports;
  for (const a of structArgs) {
    if (!aggregable(a, params)) continue;
    const lay = layout(a.members, params);
    const own = ports.filter((p) => a.members.includes(p.param));
    if (!lay || !own.length) continue;
    const ins = own.filter((p) => p.dir === 'in'), outs = own.filter((p) => p.dir === 'out' && p.role === 'arg'), vlds = own.filter((p) => p.role === 'arg_vld');
    const ret = a.name === 'return';
    const name = rn(a.name);
    const pIn = ret ? null : { name: outs.length ? `${name}_i` : name, dir: 'in', w: lay.w, role: 'arg', param: a.name, fields: lay.fields };
    const pOut = !ret && !outs.length ? null
      : { name: ret ? 'ap_return' : `${name}_o`, dir: 'out', w: lay.w, role: ret ? 'return' : 'arg', param: a.name, fields: lay.fields };
    const pVld = pOut && !ret && vlds.length ? { name: `${pOut.name}_ap_vld`, dir: 'out', w: 1, role: 'arg_vld', param: a.name } : null;
    const made = [pIn, pOut, pVld].filter(Boolean);
    // (the struct's ports where its first member's were)
    const at = outer.indexOf(own[0]);
    outer = [...outer.slice(0, at).filter((p) => !own.includes(p)), ...made, ...outer.slice(at).filter((p) => !own.includes(p))];
    // the returned struct's members' _ap_vld: not needed (ap_return is valid with ap_done)
    // (the members' ports signals named ap_s_<port>: none meets the struct's ports, a_i, a member i's a_i too)
    const sn = (p) => `ap_s_${p.name}`;
    inner.push(...own.filter((p) => !(ret && p.role === 'arg_vld')).map((p) => ({ ...p, name: sn(p), from: p.name })));
    groups.push({ name: a.name, ports: made, drop: ret ? vlds.map((p) => p.name) : [], renamed: new Map(own.map((p) => [p.name, sn(p)])) });
    const VS = (p, hi, lo) => (hi === lo ? `${p}(${lo})` : `${p}(${hi} downto ${lo})`);
    const LS = (p, hi, lo) => (hi === lo ? `${p}[${lo}]` : `${p}[${hi}:${lo}]`);
    for (const f of lay.fields) {
      const top = f.off + f.w - 1, pad = f.off + f.size - 1;
      const mi = ins.find((p) => p.param === f.param), mo = outs.find((p) => p.param === f.param), mv = vlds.find((p) => p.param === f.param);
      if (mi) { vhdl.push(`  ${sn(mi)} <= ${VS(pIn.name, top, f.off)};`); verilog.push(`  assign ${sn(mi)} = ${LS(pIn.name, top, f.off)};`); }
      if (!pOut) continue;
      // (a member given back: its value; written now and then (a combinational module), its value when written, else
      // the one read; not written, the one read; the returned struct's not set, 0)
      const keep = (S) => (pIn ? S(pIn.name, top, f.off) : null);
      if (mo && (seq || !mv || ret)) { vhdl.push(`  ${VS(pOut.name, top, f.off)} <= ${sn(mo)};`); verilog.push(`  assign ${LS(pOut.name, top, f.off)} = ${sn(mo)};`); }
      else if (mo) {
        vhdl.push(`  ${VS(pOut.name, top, f.off)} <= ${sn(mo)} when ${sn(mv)} = '1' else ${keep(VS)};`);
        verilog.push(`  assign ${LS(pOut.name, top, f.off)} = ${sn(mv)} ? ${sn(mo)} : ${keep(LS)};`);
      } else if (pIn) { vhdl.push(`  ${VS(pOut.name, top, f.off)} <= ${keep(VS)};`); verilog.push(`  assign ${LS(pOut.name, top, f.off)} = ${keep(LS)};`); }
      else { vhdl.push(`  ${VS(pOut.name, top, f.off)} <= ${f.w === 1 ? "'0'" : '(others => \'0\')'};`); verilog.push(`  assign ${LS(pOut.name, top, f.off)} = ${f.w}'b0;`); }
      if (pad > top) { vhdl.push(`  ${VS(pOut.name, pad, top + 1)} <= ${pad === top + 1 ? "'0'" : '(others => \'0\')'};`); verilog.push(`  assign ${LS(pOut.name, pad, top + 1)} = ${pad - top}'b0;`); }
    }
    if (pVld) {
      vhdl.push(`  ${pVld.name} <= ${vlds.map(sn).join(' or ')};`);
      verilog.push(`  assign ${pVld.name} = ${vlds.map(sn).join(' | ')};`);
    }
  }
  return { ports: outer, inner, vhdl, verilog, groups };
}
