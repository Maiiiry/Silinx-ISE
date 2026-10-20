// The open-flow fixtures of the hard blocks (test/fixtures/open-flow: block RAMs, multipliers, DCMs (two of
// them on clock pads' dedicated paths of their own, #92), their control pins tied to constants, #50; a pad's global
// buffer into a DCM's CLKIN, #94; twelve clocks, #95; shift registers, fixed and read at a variable tap, #5; a manual clock, a button
// through the general routing into a global buffer, #347) with Xilinx ISE 14.7 (opt-in, as
// test/ise/examples.test.js: it needs ISE's Docker image): the Silinx toolchain's routed design of
// each passes ISE's design rule check with no error and no warning, and Silinx's bitstream is
// byte-identical to ISE's bitgen of it, CRC on and off (scripts/check-open-flow.mjs).
//
//   SILINX_ISE_TESTS=1 SILINX_ISE_HOST=user@host node --test test/ise/open-flow.test.js
//   SILINX_ISE_HOST=local: the image on this machine (the self-hosted runner, .github/workflows/ise.yml)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../examples-lib.mjs';

const enabled = process.env.SILINX_ISE_TESTS === '1';
// the host only from the environment (never written in a file)
const skip = !enabled ? 'set SILINX_ISE_TESTS=1 to run the ISE tests' : !process.env.SILINX_ISE_HOST ? 'set SILINX_ISE_HOST=user@host (the machine with the ISE Docker image), or local (the image here)' : false;
const FIXTURES = ['feat_bram', 'feat_mult', 'feat_constmult', 'feat_dcm', 'feat_dcm_pads', 'feat_iob_plain', 'feat_dcm_bufgin', 'feat_clocks12', 'hard_prim', 'feat_const_bram', 'feat_const_mult', 'feat_const_dcm', 'feat_srl', 'feat_srl_var', 'feat_manual_clock'];

test('the open-flow fixtures of the hard blocks: Silinx\'s bitstream byte-identical to ISE\'s, ISE\'s DRC clean, no warning', { skip, timeout: 60 * 60000 }, () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), ...FIXTURES.map(f => path.join(ROOT, 'test/fixtures/open-flow', f))], { encoding: 'utf8', env: process.env });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  for (const f of FIXTURES) {
    assert.match(r.stdout, new RegExp(`^${f}: open flow ok; 0 warning\\(s\\)$`, 'm'));
    assert.match(r.stdout, new RegExp(`^${f}: DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \\.bit vs ISE's bitgen: byte-identical \\(CRC on and off\\)$`, 'm'));
  }
});

// The clock fixtures on every device of the Silinx toolchain, with no constraints (the placer's
// choice of pads, DCM sites and global buffers): a pad's global buffer into a DCM's CLKIN (#94), twelve
// global clocks on the top / bottom and side buffers (#95)
const DEVICES = [['xc3s100e', 'cp132'], ['xc3s250e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']];
const CLOCK_FIXTURES = ['feat_dcm_bufgin', 'feat_clocks12'];

test('the clock fixtures on every device: Silinx\'s bitstream byte-identical to ISE\'s, ISE\'s DRC clean, no warning', { skip, timeout: 60 * 60000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ise-clocks-'));
  const names = [];
  for (const f of CLOCK_FIXTURES) for (const [part, pkg] of DEVICES) {
    const name = `${f}-${part}`, dir = path.join(tmp, name);
    fs.mkdirSync(dir);
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/open-flow', f, 'top.vhd'), path.join(dir, 'top.vhd'));
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }] }));
    names.push(name);
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), ...names.map(n => path.join(tmp, n))], { encoding: 'utf8', env: process.env });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  for (const n of names) {
    assert.match(r.stdout, new RegExp(`^${n}: open flow ok; 0 warning\\(s\\)$`, 'm'));
    assert.match(r.stdout, new RegExp(`^${n}: DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \\.bit vs ISE's bitgen: byte-identical \\(CRC on and off\\)$`, 'm'));
  }
});
