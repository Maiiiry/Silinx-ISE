// Why the browser edition cannot program the board here (#1079, core/webusb-support.js): a browser with WebUSB can;
// an iPad or iPhone (any browser, Chrome too: Safari's engine) is told so, not to use Chrome or Edge; others are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noWebUsb, appleTouchDevice, NO_WEBUSB, NO_WEBUSB_APPLE } from '../core/webusb-support.js';

// real browsers' navigators (the parts the rule reads)
const UA = {
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  androidChrome: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadChrome: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  // an iPad's Safari or Chrome asking for the desktop site: it says it is a Mac
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};
const usb = { getDevices: async () => [] };

test('#1079 a browser with WebUSB can program the board: no reason', () => {
  assert.equal(noWebUsb({ userAgent: UA.winChrome, maxTouchPoints: 0, usb }), null);
  assert.equal(noWebUsb({ userAgent: UA.androidChrome, maxTouchPoints: 5, usb }), null);
});

test('#1079 an iPad or iPhone: no browser has WebUSB there, the message says so (not "Chrome or Edge")', () => {
  for (const [ua, touch] of [[UA.ipadChrome, 5], [UA.iphoneSafari, 5], [UA.ipadDesktop, 5]]) {
    assert.equal(appleTouchDevice({ userAgent: ua, maxTouchPoints: touch }), true, ua);
    assert.equal(noWebUsb({ userAgent: ua, maxTouchPoints: touch }), NO_WEBUSB_APPLE, ua);
  }
  assert.match(NO_WEBUSB_APPLE, /^an iPad or iPhone cannot program the board: every browser there, Chrome and Edge too, runs on Safari's engine, which has no WebUSB; program the downloaded \.bit from a computer/);
  assert.doesNotMatch(NO_WEBUSB_APPLE, /needs Chrome or Edge/);
});

test('#1079 a computer\'s browser without WebUSB (Firefox, Safari on a Mac, a page from a file): use Chrome or Edge', () => {
  for (const [ua, touch] of [[UA.linuxFirefox, 0], [UA.macSafari, 0], [UA.winChrome, 0], [UA.macSafari, undefined]]) {
    assert.equal(appleTouchDevice({ userAgent: ua, maxTouchPoints: touch }), false, ua);
    assert.equal(noWebUsb({ userAgent: ua, maxTouchPoints: touch }), NO_WEBUSB, ua);
  }
  assert.match(NO_WEBUSB, /^programming from the browser needs Chrome or Edge \(WebUSB\)/);
});

test('no navigator (Node), or one without a User-Agent: the general reason', () => {
  assert.equal(noWebUsb(undefined), NO_WEBUSB);
  assert.equal(noWebUsb({}), NO_WEBUSB);
  assert.equal(appleTouchDevice(undefined), false);
});
