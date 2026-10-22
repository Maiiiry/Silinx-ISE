// Whose failure is it (#997): the page's handler of unhandled promise rejections (app.js, #408) reports
// in the Console only Silinx's own; the page also runs scripts that are not Silinx's (a browser extension's
// content script, code a host application injects), whose failures are left to the browser's console.
//
// Decided by the reason's stack: Silinx's when one of its frames is a script of the app — on the page's
// origin (the server, the published site), the page and its folder when it has no origin (the standalone
// single file from file://), a blob: of the page (its workers). An Error whose stack names only other
// scripts (chrome-extension://…, an injected script with no URL) is foreign; so is a reason that is not
// an Error (Silinx rejects with Errors). An Error with no frames at all (one the browser makes, a failed
// fetch in some browsers) is reported, as before.

// the URLs a stack's frames name: Chrome's "at f (url:1:2)" / "at url:1:2", Firefox's and Safari's "f@url:1:2"
const URL_RE = /(?:blob|data):[^\s()@]*|[a-z][a-z0-9+.-]*:\/\/[^\s()@]*/gi;
// a frame with no URL: Chrome's "at <anonymous>", Firefox's "debugger eval code", Safari's "global code"
const FRAME_RE = /^\s*at\s|@|^\s*(global code|eval code|module code)\s*$/;

/** The frames' URLs of a stack (without their :line:column), and whether it has frames at all. */
export function stackFrames(err) {
  let stack = typeof err?.stack === 'string' ? err.stack : '';
  // Chrome's stack starts with "Name: message" (the message may hold URLs, and lines)
  const head = (() => { try { return String(err); } catch { return ''; } })();
  if (head && stack.startsWith(head)) stack = stack.slice(head.length);
  const lines = stack.split('\n').filter(l => l.trim() && FRAME_RE.test(l));
  const urls = lines.flatMap(l => l.match(URL_RE) || []).map(u => u.replace(/(:\d+){1,2}$/, ''));
  return { frames: lines.length, urls };
}

/** Whether a script URL is the app's, for the page at `page` (location: { href, origin }). */
export function isOwnUrl(url, page) {
  const origin = page.origin && page.origin !== 'null' ? page.origin : null;
  if (origin) return url.startsWith(`${origin}/`) || url.startsWith(`blob:${origin}/`);
  // no origin (file://): the page itself, the files of its folder, its blobs
  const dir = page.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  return url.startsWith(dir) || url.startsWith('blob:null/');
}

const isError = r => r instanceof Error || (typeof DOMException === 'function' && r instanceof DOMException);

/** Whether a rejection's reason (or an error) comes from Silinx's own code, for the page at `page`. */
export function isOwnFailure(reason, page = globalThis.location) {
  if (!isError(reason)) return false;
  const { frames, urls } = stackFrames(reason);
  if (!frames) return true;
  return urls.some(u => isOwnUrl(u, page));
}
