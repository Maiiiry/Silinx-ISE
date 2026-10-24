// The viewer's settings kept in the browser's localStorage (the interface, the theme, the language, the recent
// projects, the panes' sizes, the editors' options…), each under its key: prefKey(key).
// The site serves the stable edition at its root and the development edition (built from main) under dev/: the
// same origin, one localStorage. The development edition keeps its settings under keys of its own
// ('silinx.dev.' and the key without its 'silinx.'), so that one changed there does not change the stable
// edition's (#1243); its projects and workspace folder are kept apart too (web/js/project-store.js, api-local.js).
// The stable edition and the application keep the keys as they are. index.html's early script (the interface
// and the theme before the first paint) names its keys the same way.

/** Is this page the site's development edition (a page under dev/)? */
export const DEV_SITE = typeof location !== 'undefined' && /\/dev\//.test(location.pathname || '');

/** The localStorage key of a setting in this edition (dev: the development edition's). */
export const prefKey = (key, dev = DEV_SITE) => (dev ? `silinx.dev.${String(key).replace(/^silinx\./, '')}` : key);
