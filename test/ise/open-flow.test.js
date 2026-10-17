// The open-flow fixtures of the hard blocks (test/fixtures/open-flow: block RAMs, multipliers, DCMs,
// their control pins tied to constants, #50; shift registers, fixed and read at a variable tap, #5; a manual clock, a button
// through the general routing into a global buffer, #347) with Xilinx ISE 14.7 (opt-in, as
// test/ise/examples.test.js: it needs ISE's Docker image): the Silinx toolchain's routed design of
// each passes ISE's design rule check with no error and no warning, and Silinx's bitstream is
// byte-identical to ISE's bitgen of it, CRC on and off (scripts/check-open-flow.mjs).
//
//   SILINX_ISE_TESTS=1 SILINX_ISE_HOST=user@host node --test test/ise/open-flow.test.js
//   SILINX_ISE_HOST=local: the image on this machine (the self-hosted runner, .github/workflows/ise.yml)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../examples-lib.mjs';

const enabled = process.env.SILINX_ISE_TESTS === '1';
// the host only from the environment (never written in a file)
const skip = !enabled ? 'set SILINX_ISE_TESTS=1 to run the ISE tests' : !process.env.SILINX_ISE_HOST ? 'set SILINX_ISE_HOST=user@host (the machine with the ISE Docker image), or local (the image here)' : false;
const FIXTURES = ['feat_bram', 'feat_mult', 'feat_constmult', 'feat_dcm', 'hard_prim', 'feat_const_bram', 'feat_const_mult', 'feat_const_dcm', 'feat_srl', 'feat_srl_var', 'feat_manual_clock'];

test('the open-flow fixtures of the hard blocks: Silinx\'s bitstream byte-identical to ISE\'s, ISE\'s DRC clean, no warning', { skip, timeout: 60 * 60000 }, () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), ...FIXTURES.map(f => path.join(ROOT, 'test/fixtures/open-flow', f))], { encoding: 'utf8', env: process.env });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  for (const f of FIXTURES) {
    assert.match(r.stdout, new RegExp(`^${f}: open flow ok; 0 warning\\(s\\)$`, 'm'));
    assert.match(r.stdout, new RegExp(`^${f}: DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \\.bit vs ISE's bitgen: byte-identical \\(CRC on and off\\)$`, 'm'));
  }
});
