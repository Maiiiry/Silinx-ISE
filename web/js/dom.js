// The client's HTML helpers, the one copy every module imports (#489). No side effects when loaded:
// a page that shows a drawing alone (web/schematic-demo.html) imports it without ui.js's listeners.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// A text as HTML, safe in an element's content and in a quoted attribute; null / undefined: ''
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ENTITIES[c]);
