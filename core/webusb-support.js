// Silinx - why the browser edition cannot program the board here (#1079): programming goes through WebUSB, which
// Chrome and Edge have on a computer and on Android, from a page opened from https:// or http://localhost. An iPad
// or an iPhone has it in no browser: there every browser, Chrome and Edge too, runs on Safari's engine (WebKit),
// so its message does not send the user to a browser they already have. An iPad may say it is a Mac: a Mac with
// a touch screen.
//
// Isomorphic ES module (browser + Node), no DOM.

export const NO_WEBUSB = 'programming from the browser needs Chrome or Edge (WebUSB), with the page opened from https:// or http://localhost (not from a file); or program the downloaded .bit with the full Silinx application, Digilent Adept or iMPACT';
export const NO_WEBUSB_APPLE = 'an iPad or iPhone cannot program the board: every browser there, Chrome and Edge too, runs on Safari\'s engine, which has no WebUSB; program the downloaded .bit from a computer (Chrome or Edge, the full Silinx application, Digilent Adept or iMPACT) or from an Android tablet in Chrome';

/** Whether the device is an iPad or an iPhone (an iPad that says it is a Mac: a touch screen). `nav`: the navigator. */
export function appleTouchDevice(nav = globalThis.navigator) {
  const ua = typeof nav?.userAgent === 'string' ? nav.userAgent : '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
}

/** Why the board cannot be programmed from this browser, or null when it has WebUSB. */
export function noWebUsb(nav = globalThis.navigator) {
  if (nav?.usb) return null;
  return appleTouchDevice(nav) ? NO_WEBUSB_APPLE : NO_WEBUSB;
}
