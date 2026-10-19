// UI: web/js/dom.js's element builder h (#489), the one every module uses, in the browser: its
// attributes, properties, listeners and children as each former copy built them.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#489 h: class, style, text, html, value, checked, listeners, attributes', E, async (page) => {
  const got = await page.eval(async () => {
    const { h } = await import('/js/dom.js');
    const ui = await import('/js/ui.js');
    const out = { same: ui.h === h };
    const d = h('div', { class: 'a b', style: { color: 'red', marginTop: '2px' }, title: 'x"y', 'data-k': 3, hidden: true, skip: false, none: null, gone: undefined });
    out.div = [d.className, d.style.color, d.style.marginTop, d.getAttribute('title'), d.getAttribute('data-k'), d.getAttribute('hidden'), d.getAttributeNames().sort().join(',')];
    out.styleText = h('span', { style: 'font-weight: bold' }).style.fontWeight;
    out.text = h('span', { text: '<b>not bold</b>' }).innerHTML;
    out.html = h('span', { html: '<b>bold</b>' }).firstChild.tagName;
    const ta = h('textarea', { value: 'typed' });
    out.textarea = ta.value;
    const inp = h('input', { value: 'v1' });
    out.input = [inp.value, inp.getAttribute('value'), inp.defaultValue];
    const sel = h('select', {}, h('option', { value: 'a', text: 'A' }), h('option', { value: 'b', text: 'B', selected: true }));
    out.select = [sel.value, sel.options[1].textContent];
    const on = h('input', { type: 'checkbox', checked: true }), off = h('input', { type: 'checkbox', checked: 0 });
    out.checked = [on.checked, on.hasAttribute('checked'), off.checked, off.hasAttribute('checked')];
    let clicks = 0, changes = 0;
    const b = h('button', { onclick: () => clicks++, onChange: () => changes++, onmissing: 'not a function' });
    b.click(); b.dispatchEvent(new Event('change'));
    out.listeners = [clicks, changes, b.getAttribute('onmissing')];
    return out;
  });
  assert.deepEqual(got, {
    same: true,
    div: ['a b', 'red', '2px', 'x"y', '3', '', 'class,data-k,hidden,style,title'],
    styleText: 'bold',
    text: '&lt;b&gt;not bold&lt;/b&gt;',
    html: 'B',
    textarea: 'typed',
    input: ['v1', 'v1', 'v1'],
    select: ['b', 'B'],
    checked: [true, true, false, false],
    listeners: [1, 1, 'not a function'],
  });
});

uiTest('#489 h: children nested in arrays, nodes as they are, text as text, null / undefined / false left out', E, async (page) => {
  const got = await page.eval(async () => {
    const { h } = await import('/js/dom.js');
    const b = document.createElement('b');
    const el = h('p', null, 'a<i>', [1, [0, null, [undefined, false, b]]], '', true);
    return [el.childNodes.length, el.innerHTML, el.querySelector('b') === b, h('p').childNodes.length];
  });
  assert.deepEqual(got, [6, 'a&lt;i&gt;10<b></b>true', true, 0]);
});
