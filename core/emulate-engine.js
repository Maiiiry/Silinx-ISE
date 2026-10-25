// Silinx - the Board Emulator's engine by default (#952): the compiled engine (its netlist by Yosys, at the
// board's speed) takes long to compile on a slow device (a phone, a tablet, a low-end laptop), where the
// event-driven one, which starts at once, is the default. The user's own choice (remembered) wins.
//
// A slow device is told by what the browser says of it, never by a timing probe (which a busy moment would
// fool): a phone or a tablet (User-Agent Client Hints' `mobile`, a mobile User-Agent, or an iPad that says it is
// a Mac but has a touch screen), fewer than 4 processor cores, or less than 4 GB of memory (Chromium's
// deviceMemory). An API the browser does not have says nothing: the device is then not slow.
//
// Isomorphic ES module (browser + Node), no DOM.

export const ENGINE_KEY = 'silinx.emulator.engine';
const MIN_CORES = 4;
const MIN_MEMORY_GB = 4;

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Tablet/i;

/** Why the device is slow (e.g. 'a phone or tablet, 2 processor cores'), or null. `nav`: the browser's navigator. */
export function slowDevice(nav = globalThis.navigator) {
  if (!nav) return null;
  const why = [];
  const ua = typeof nav.userAgent === 'string' ? nav.userAgent : '';
  if (nav.userAgentData?.mobile === true || MOBILE_UA.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)) why.push('a phone or tablet');
  const cores = nav.hardwareConcurrency;
  if (Number.isFinite(cores) && cores > 0 && cores < MIN_CORES) why.push(`${cores} processor core${cores === 1 ? '' : 's'}`);
  const mem = nav.deviceMemory;
  if (Number.isFinite(mem) && mem > 0 && mem < MIN_MEMORY_GB) why.push(`${mem} GB of memory`);
  return why.length ? why.join(', ') : null;
}

/**
 * The engine the emulator starts on: { engine: 'compiled' | 'event', auto: why the event-driven one by default
 * (a slow device) | null }. `saved`: the user's last choice ('compiled' | 'event'), which wins.
 */
export function defaultEngine({ saved = null, nav = globalThis.navigator } = {}) {
  if (saved === 'compiled' || saved === 'event') return { engine: saved, auto: null };
  const why = slowDevice(nav);
  return why ? { engine: 'event', auto: why } : { engine: 'compiled', auto: null };
}
