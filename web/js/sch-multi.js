// The schematic editor's Properties panel for several objects selected (#1471, core/schmulti.js): the properties they
// have in common, a value set for all of them in one edit; one that differs between them, mixed (empty, "(mixed)"),
// left as it is until a value is given. mountMultiProps(ctx) is called by mountProps (sch-props.js).
import { commonProps, applyProp } from '/core/schmulti.js';
import { h } from './dom.js';

/** multiProps(items) of the Properties panel (doc(): its current document; field, keepFocus: sch-props.js's). */
export function mountMultiProps({ propBody, doc, edit, field, keepFocus }) {
  return function multiProps(items) {
    for (const f of commonProps(doc(), items)) {
      const apply = v => edit(() => { applyProp(doc(), items, f.key, v); });
      let el;
      if (f.kind === 'bool') {
        el = h('input', { type: 'checkbox', checked: !!f.value });
        el.indeterminate = f.mixed;
        el.addEventListener('change', () => apply(el.checked));
      } else if (f.kind === 'select') {
        el = h('select', {}, ...(f.mixed ? [h('option', { value: '', text: '(mixed)' })] : []),
          ...f.options.map(o => h('option', { value: Array.isArray(o) ? o[0] : o, text: Array.isArray(o) ? o[1] : o })));
        el.value = f.mixed ? '' : String(f.value);
        el.addEventListener('change', () => { if (el.value !== '') keepFocus(el, () => apply(el.value)); });
      } else {
        el = h('input', { type: f.kind === 'int' ? 'number' : 'text', value: f.value ?? '', ...(f.kind === 'int' ? { min: f.min, max: f.max } : {}),
          ...(f.mixed ? { placeholder: '(mixed)' } : {}) });
        el.addEventListener('change', () => { if (!(f.mixed && el.value === '')) keepFocus(el, () => apply(el.value)); });
      }
      el.dataset.multi = f.key;
      propBody.append(field(f.label, el));
    }
  };
}
