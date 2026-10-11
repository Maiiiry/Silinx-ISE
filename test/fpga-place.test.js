// The placer (core/fpga/place.js) and the XDL it is written as (core/xdl.js writeXdl), on a small made-up
// device (test/fixtures/fpga/place-device.xdlrc, from research/s3e-place/gen-test-device.mjs):
// legal placements (one instance per site, LOCs kept, carry chains up one column, wide multiplexers
// in their CLB pattern), wirelength going down, the same seed giving the same placement, and the
// placed XDL reading back through core/xdl.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdlrc, parseXdl } from '../core/xdl.js';
import { packDevice, loadDevice } from '../core/fpga/device.js';
import { readYosysJson } from '../core/fpga/netlist.js';
import { pack } from '../core/fpga/pack.js';
import { deviceSites, place, placedXdl, PlaceError, rng, timingGraph, analyzeTiming, connDelay } from '../core/fpga/place.js';
import { SPEED_4 } from '../core/fpga/timing.js';
import { writeXdl } from '../core/xdl.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fpga');
const load = n => readYosysJson(fs.readFileSync(path.join(FIX, `${n}.json`), 'utf8'));
const dev = deviceSites(parseXdlrc(fs.readFileSync(path.join(FIX, 'place-device.xdlrc'), 'utf8')));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const xy = s => { const m = /^SLICE_X(\d+)Y(\d+)$/.exec(s); return m ? [+m[1], +m[2]] : null; };

test('the device from the routing graph (core/fpga/device.js) gives the same sites as from the report', () => {
  // (the router's small device: the placer's has no connections between tiles)
  const text = fs.readFileSync(path.join(FIX, 'route-device.xdlrc'), 'utf8');
  const fromReport = deviceSites(parseXdlrc(text)), fromGraph = deviceSites(loadDevice(packDevice(text)));
  const ser = x => JSON.stringify({ ...x, slices: [...x.slices], pads: [...x.pads] });
  assert.ok(fromReport.slices.size > 0 && fromReport.pads.size > 0 && fromReport.bufgmux.length > 0);
  assert.equal(ser(fromGraph), ser(fromReport));
});

test('the device: slices with positions, bonded pads, clock buffers', () => {
  assert.equal(dev.slices.size, 140);   // 6 x 6 CLBs, one missing
  assert.ok(dev.slices.has('0,0') && !dev.slices.has('4,6'));
  assert.equal(dev.slices.get('3,5').name, 'SLICE_X3Y5');
  assert.ok(!dev.pads.has('NOPAD20'));
  assert.ok([...dev.pads.values()].some(p => p.inputOnly));
  assert.equal(dev.bufgmux.length, 8);
  // positions: slices of one CLB share the tile; y grows upward
  assert.ok(dev.slices.get('0,1').py > dev.slices.get('0,0').py);
  assert.ok(dev.slices.get('1,0').px > dev.slices.get('0,0').px);
});

function checkLegal(p, r) {
  const used = new Set();
  r.sites.forEach((s, i) => {
    assert.ok(!used.has(s.site), `site ${s.site} used twice`);
    used.add(s.site);
    const inst = p.insts[i];
    if (inst.kind === 'slice') assert.match(s.site, /^SLICE_/);
    if (inst.kind === 'iob') { assert.ok(dev.pads.has(s.site), `${inst.name} on ${s.site}`); if (inst.loc) assert.equal(s.site, inst.loc); if (inst.dir === 'out') assert.ok(!dev.pads.get(s.site).inputOnly); }
    if (inst.kind === 'bufg') assert.match(s.site, /^BUFGMUX_/);
  });
  // every group keeps its shape
  for (const m of p.macros) {
    const [x0, y0] = xy(r.sites[m.members[0].inst].site);
    const ax = x0 - m.members[0].dx, ay = y0 - m.members[0].dy;
    for (const x of m.members) assert.deepEqual(xy(r.sites[x.inst].site), [ax + x.dx, ay + x.dy], `${m.kind} shape`);
    if (m.align) { assert.equal(ax % m.align[0], 0, `${m.kind} column`); assert.equal(ay % m.align[1], 0, `${m.kind} row`); }
  }
}

test('counter: a legal placement, LOCs kept, wirelength reduced, same seed same result', () => {
  const ucf = 'NET "clk" LOC = "P3";\nNET "q<0>" LOC = "P10";\nNET "rst" LOC = "P5";';
  const p = pack(load('counter'), { ucf });
  const r = place(p, dev, { seed: 3 });
  checkLegal(p, r);
  assert.ok(r.cost < r.stats.initialCost, `cost ${r.stats.initialCost} -> ${r.cost}`);
  assert.equal(r.sites[p.insts.findIndex(i => i.name === 'clk')].site, 'P3');
  // the clock buffer: on the edge of the pad that drives it (P3 is on the top edge)
  assert.equal(r.sites[p.insts.findIndex(i => i.kind === 'bufg')].site, 'BUFGMUX_X2Y11');
  const again = place(p, dev, { seed: 3 });
  assert.deepEqual(again.sites, r.sites);
  assert.equal(again.cost, r.cost);
  const other = place(p, dev, { seed: 4 });
  checkLegal(p, other);
});

test('mux64: the two-CLB F8 group and the F7 / F6 groups keep their pattern; chains avoid the hole', () => {
  const p = pack(load('mux64'));
  const r = place(p, dev, { seed: 1, effort: 0.3 });
  checkLegal(p, r);
  const q = pack(load('counter'));
  for (let s = 1; s <= 4; s++) checkLegal(q, place(q, dev, { seed: s, effort: 0.2 }));
});

test('clockSites: the flip-flops of a clock stay on the slices its global buffer reaches', () => {
  const ucf = 'NET "clk" LOC = "P3";\nNET "q<0>" LOC = "P10";\nNET "rst" LOC = "P5";';
  const p = pack(load('counter'), { ucf });
  const asked = [];
  // the clock reaches only the slices of the left columns (x < 4)
  const reach = new Set([...dev.slices.values()].filter(s => s.x < 4).map(s => s.name));
  const clocked = new Set(p.nets.filter(n => n.outpins.length && p.insts[n.outpins[0].inst].kind === 'bufg').flatMap(n => n.inpins.filter(q => q.pin === 'CLK').map(q => q.inst)));
  assert.ok(clocked.size > 0);
  for (const seed of [1, 2]) {
    const r = place(p, dev, { seed, effort: 0.3, clockSites: site => { asked.push(site); return reach; } });
    checkLegal(p, r);
    for (const i of clocked) assert.ok(reach.has(r.sites[i].site), `${p.insts[i].name} on ${r.sites[i].site}`);
  }
  assert.deepEqual([...new Set(asked)], ['BUFGMUX_X2Y11']);
  // null: anywhere
  checkLegal(p, place(p, dev, { seed: 1, effort: 0.2, clockSites: () => null }));
});

test('placement timing: delays of core/fpga/timing.js (ns), flip-flop to flip-flop, growing with the distance', () => {
  const p = pack(load('counter'), { ucf: 'NET "clk" LOC = "P3";' });
  const tg = timingGraph(p);
  const r = place(p, dev, { seed: 1, effort: 0.3 });
  const pos = r.sites.map(s => { const x = dev.slices.get([...dev.slices.keys()].find(k => dev.slices.get(k).name === s.site)) || dev.pads.get(s.site) || dev.bufgmux.find(b => b.name === s.site); return [x.px, x.py]; });
  const t = analyzeTiming(tg, pos);
  close(t.dmax, r.delay);
  // at least a flip-flop's clock-to-out, a connection and a setup
  assert.ok(t.dmax > SPEED_4.slice.TckoX[0] + SPEED_4.dist.base + SPEED_4.slice.Tdick[0], `${t.dmax}`);
  assert.ok(t.conns.some(c => c.crit > 0.999));
  // dedicated connections (the carry chain) take no time; others grow with the distance
  for (const c of t.conns) if (c.dedicated) assert.equal(c.delay, 0);
  const near = t.conns.map(c => c.delay);
  const far = analyzeTiming(tg, pos.map(([x, y]) => [x * 3, y * 3]));
  assert.ok(far.dmax >= t.dmax);
  assert.ok(far.conns.every((c, i) => c.delay >= near[i]) && far.conns.some((c, i) => c.delay > near[i]));
});

test('placement timing with the device\'s delay table: connections by their offset, SLICEL / SLICEM arcs by the site, the timing cost follows the table', () => {
  const p = pack(load('counter'), { ucf: 'NET "clk" LOC = "P3";' });
  const tg = timingGraph(p);
  // a made-up table: rows cost much more than columns (dr: tile rows, down; the placer's y is up)
  const table = (col, row) => ({ at: (dc, dr) => 0.2 + col * Math.abs(dc) + row * Math.abs(dr) });
  const rows = table(0.05, 0.5), cols = table(0.5, 0.05);
  close(connDelay([1.5, 4], [3, 2.5], SPEED_4, rows), 0.2 + 0.05 * 2 + 0.5 * 2);
  close(connDelay([1, 4], [3, 2], SPEED_4), SPEED_4.dist.base + 4 * SPEED_4.dist.perTile);
  const posOf = r => r.sites.map(s => { const x = [...dev.slices.values()].find(v => v.name === s.site) || dev.pads.get(s.site) || dev.bufgmux.find(b => b.name === s.site); return [x.px, x.py]; });
  const r = place(p, dev, { seed: 1, effort: 0.3, delays: rows });
  checkLegal(p, r);
  const pos = posOf(r);
  const t = analyzeTiming(tg, pos, rows);
  close(t.dmax, r.delay);
  for (const c of t.conns) close(c.delay, c.dedicated ? 0 : connDelay(pos[c.src], pos[c.dst], SPEED_4, rows));
  assert.deepEqual(place(p, dev, { seed: 1, effort: 0.3, delays: rows }).sites, r.sites, 'deterministic');
  // the critical connections span fewer rows when rows are slow, fewer columns when columns are
  // (srmux: registers and multiplexers spread over several CLBs)
  const q = pack(load('srmux')), tq = timingGraph(q);
  const spread = (x, k) => { const ps = posOf(x), a = analyzeTiming(tq, ps, rows).conns.filter(c => !c.dedicated); return a.reduce((s, c) => s + c.crit * Math.abs(Math.floor(ps[c.src][k]) - Math.floor(ps[c.dst][k])), 0) / a.reduce((s, c) => s + c.crit, 0); };
  const qr = place(q, dev, { seed: 1, effort: 0.3, delays: rows }), qc = place(q, dev, { seed: 1, effort: 0.3, delays: cols });
  checkLegal(q, qr);
  assert.ok(spread(qr, 1) < spread(qc, 1), `rows: ${spread(qr, 1)} vs ${spread(qc, 1)}`);
  assert.ok(spread(qc, 0) < spread(qr, 0), `columns: ${spread(qc, 0)} vs ${spread(qr, 0)}`);
  // the arcs of a slice on a SLICEM (an even column of slices, a whole x) are slower: the same
  // placement moved to the SLICEM of each CLB is no faster
  const f1x = (i, k) => tg.arcs[i][k].deps.X?.find(([q]) => q === 'F1')?.[1];
  const xor = tg.arcs.findIndex((a, i) => p.insts[i].cfg.some(c => c.attr === 'FXMUX' && c.value === 'FXOR'));
  assert.ok(xor >= 0);
  assert.deepEqual([f1x(xor, 0), f1x(xor, 1)], [SPEED_4.slice.Topx[0], SPEED_4.slice.Topx[1]]);
  assert.ok(f1x(xor, 1) > f1x(xor, 0));
  const asL = pos.map(([x, y], i) => (p.insts[i].kind === 'slice' ? [Math.floor(x) + 0.5, y] : [x, y]));
  const asM = pos.map(([x, y], i) => (p.insts[i].kind === 'slice' ? [Math.floor(x), y] : [x, y]));
  assert.ok(analyzeTiming(tg, asM, rows).dmax > analyzeTiming(tg, asL, rows).dmax);
});

test('a clock with no LOC goes on a GCLK pin: the free pad whose known dedicated path reaches the best global buffer, kept there (#49)', () => {
  // made-up GCLK pins: P73 (bottom, input-only) reaches BUFGMUX_X2Y1, P70 reaches BUFGMUX_X1Y0,
  // P30 (left) reaches BUFGMUX_X1Y10; no other pad has a dedicated path
  const gclk = { P73: ['BUFGMUX_X2Y1'], P70: ['BUFGMUX_X1Y0'], P30: ['BUFGMUX_X1Y10'] };
  const asked = [];
  const bufgSites = (site, pin) => { asked.push(`${site}.${pin}`); return pin === 'I' ? gclk[site] || [] : []; };
  const p = pack(load('counter'));
  const clk = p.insts.findIndex(i => i.name === 'clk'), buf = p.insts.findIndex(i => i.kind === 'bufg');
  for (const seed of [1, 2, 3]) {
    const r = place(p, dev, { seed, effort: 0.3, bufgSites });
    checkLegal(p, r);
    // BUFGMUX_X1Y10 comes before the bottom buffers in BUFG_ORDER (ISE's B8 -> BUFGMUX_X2Y11 first)
    assert.equal(r.sites[clk].site, 'P30', `seed ${seed}`);
    assert.equal(r.sites[buf].site, 'BUFGMUX_X1Y10', `seed ${seed}`);
  }
  // only the pads' pin I is asked (no DCM in the design)
  assert.ok(asked.length > 0 && asked.every(a => /^P\d+\.I$/.test(a)), asked.join());
  // that pin taken by another port's LOC: the next GCLK pin
  const taken = place(pack(load('counter'), { ucf: 'NET "en" LOC = "P30";' }), dev, { seed: 1, effort: 0.2, bufgSites });
  assert.equal(taken.sites[clk].site, 'P73');
  assert.equal(taken.sites[buf].site, 'BUFGMUX_X2Y1');
  // a clock with a LOC stays on it (a pin with no dedicated path: the buffer by the pad's edge, as before)
  const fixed = place(pack(load('counter'), { ucf: 'NET "clk" LOC = "P3";' }), dev, { seed: 1, effort: 0.2, bufgSites });
  assert.equal(fixed.sites[clk].site, 'P3');
  assert.equal(fixed.sites[buf].site, 'BUFGMUX_X2Y11');
  // no GCLK pin known: any free pad, as before
  const none = place(p, dev, { seed: 1, effort: 0.2, bufgSites: () => [] });
  checkLegal(p, none);
  assert.deepEqual(none.sites, place(p, dev, { seed: 1, effort: 0.2 }).sites);
});

test('placement errors: unknown LOC, input-only pad for an output, too many slices', () => {
  assert.throws(() => place(pack(load('sw'), { ucf: 'NET "sw" LOC = "Z99";' }), dev), e => e instanceof PlaceError && /Z99/.test(e.message));
  const inOnly = [...dev.pads.values()].find(p => p.inputOnly).name;
  assert.throws(() => place(pack(load('sw'), { ucf: `NET "led" LOC = "${inOnly}";` }), dev), /input-only/);
  const big = pack(load('mux64'));
  const small = deviceSites(parseXdlrc(fs.readFileSync(path.join(FIX, 'place-device.xdlrc'), 'utf8')));
  for (const k of [...small.slices.keys()].slice(0, 100)) small.slices.delete(k);
  assert.throws(() => place(big, small), /slices needed|no room/);
});

test('placed XDL: written, read back by core/xdl.js with the same instances, sites, settings and nets', () => {
  const p = pack(load('counter'), { ucf: 'NET "clk" LOC = "P3";' });
  const r = place(p, dev, { seed: 2, effort: 0.2 });
  const d = placedXdl(p, r);
  const text = writeXdl(d);
  assert.match(text, /^design "counter" xc3s250ecp132-4 v3\.2 ,$/m);
  const back = parseXdl(text);
  assert.equal(back.name, 'counter');
  assert.equal(back.part, 'xc3s250ecp132-4');
  assert.deepEqual(back.insts.map(i => [i.name, i.type, i.placed, i.tile, i.site]), d.insts.map(i => [i.name, i.type, true, i.tile, i.site]));
  assert.deepEqual(back.insts.map(i => i.cfg), d.insts.map(i => i.cfg.map(c => ({ attr: c.attr, name: c.name, value: c.value }))));
  assert.deepEqual(back.nets.map(n => [n.name, n.type, n.outpins, n.inpins]), d.nets.map(n => [n.name, n.type, n.outpins, n.inpins]));
  // the ports' bus information in the design's cfg (raw XDL text: the parser reads it unescaped)
  assert.match(text, /_DESIGN_PROP::PIN_INFO:q<0>:\/counter\/PACKED\/counter\/q<0>\/q<0>\/PAD:OUTPUT:7:q<7\\:0>/);
  assert.equal(back.cfg, d.cfg.replace(/\\:/g, ':'));
  // and written again: the same text
  assert.equal(writeXdl({ ...back, cfg: d.cfg }), text);
});

test('the random generator is deterministic and uniform enough', () => {
  const a = rng(5), b = rng(5);
  const xs = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, () => b()));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05);
  assert.ok(xs.every(x => x >= 0 && x < 1));
});
