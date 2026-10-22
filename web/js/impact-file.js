// The programming file of Program FPGA (iMPACT, web/js/impact.js, #1024): is it there and up to date with the
// sources, from the implementation processes' state (S.status)? When it is not, Program FPGA asks whether to
// implement the design first and programs once it is built (as Generate and Simulate, #490). No DOM: unit tested
// (test/impact-file.test.js).

// (the processes of Implement Top Module: Synthesize, Translate, Map, Place & Route, Generate Programming File)
const IMPL = ['synth', 'translate', 'map', 'par', 'bitgen'];

/** The programming file's state: 'ok' (built, up to date), 'running' (being implemented), 'err' (the last
 *  implementation failed), 'stale' (older than the sources), 'none' (not built yet) or 'gone' (built, but the file
 *  is not there: `there` false; the browser edition keeps a build for the browser session only, while the
 *  processes' state comes back with the project after a reload, #1084). */
export function programFileState(status = {}, there = true) {
  const st = IMPL.map(id => status[id]);
  if (st.includes('running')) return 'running';
  if (st.includes('err')) return 'err';
  if (st.includes('stale')) return 'stale';
  if (!['ok', 'warn'].includes(status.bitgen)) return 'none';
  return there === false ? 'gone' : 'ok';
}

/** The question of Program FPGA when the file is not up to date (`state` from programFileState, `top` the
 *  top module, `browser`: the browser edition): its lines; null when it is up to date or being built (nothing to ask). */
export function implementFirstText(state, top, browser = false) {
  const why = {
    none: `There is no programming file of '${top}' yet.`,
    stale: `The programming file of '${top}' is older than the sources.`,
    err: `The last implementation of '${top}' failed.`,
    gone: browser ? `The programming file of '${top}' is not in this browser any more (a build is kept for the browser session only).`
      : `The programming file of '${top}' is not in the project's build folder any more.`,
  }[state];
  return why ? [why, 'Implement the design first? When it ends without errors, the FPGA is programmed.'] : null;
}
