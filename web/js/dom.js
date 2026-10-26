// The client's HTML helpers, esc and the element builder h, the one copy every module imports (#489).
// No side effects when loaded: a page that shows a drawing alone (web/schematic-demo.html) imports it
// without ui.js's listeners.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// A text as HTML, safe in an element's content and in a quoted attribute; null / undefined: ''
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ENTITIES[c]);

// An element: h(tag, attrs, ...children). attrs: class; style (a string or an object of properties);
// on<event>: a listener (onclick, onchange…); text: its text; html: its HTML (escape what goes in it);
// value / checked: the attribute and the property (a <textarea> shows it, an edited field takes it);
// true: an empty attribute; null / undefined / false: left out; anything else: an attribute.
// children, nested arrays flattened: nodes as they are, null / undefined / false left out, the rest as text.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') { el.setAttribute('value', v); el.value = v; }
    else if (k === 'checked') { el.toggleAttribute('checked', !!v); el.checked = !!v; }
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** An SVG element: attributes (null / false left out) and children (nodes, or text) (#1406: the drawing editors'). */
export const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  for (const c of kids) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};
