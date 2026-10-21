// ISim's context menu (#405: out of mountISim): a menu of items ({ label, action, disabled, checked, sub } or
// { sep: true }) at a point of the page, its submenus kept in the window, closed by a click elsewhere or Escape (which
// closes the dialog too). mountMenu(ctx) is called by mountISim where this code was.
import { esc, h } from './dom.js';
import { clamp } from './isim.js';

/** { showMenu, closeMenu } of an ISim window. */
export function mountMenu(ctx) {
  const { cleanups, closeDialog } = ctx;

  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function buildMenu(items, x, y) {
    const m = h('div', { class: 'isim-menu' });
    for (const it of items) {
      if (it.sep) { m.appendChild(h('div', { class: 'isim-menu-sep' })); continue; }
      const r = h('div', { class: 'isim-menu-item' + (it.disabled ? ' dis' : ''), html: `<span class="chk">${it.checked ? '✓' : ''}</span><span class="lbl">${esc(it.label)}</span><span class="arr">${it.sub ? '▸' : ''}</span>` });
      if (it.sub && !it.disabled) {
        let subEl = null;
        r.addEventListener('mouseenter', () => {
          m.querySelectorAll(':scope > .isim-menu').forEach(s => s.remove());
          const rr = r.getBoundingClientRect(), mr = m.getBoundingClientRect();
          subEl = buildMenu(it.sub, rr.right - mr.left - 2, rr.top - mr.top - 3);
          m.appendChild(subEl);
          // past the window's edge: to the left of the menu instead, and up as far as needed
          const sr = subEl.getBoundingClientRect();
          if (sr.right > window.innerWidth - 4) subEl.style.left = (rr.left - mr.left - sr.width + 2) + 'px';
          if (sr.bottom > window.innerHeight - 4) subEl.style.top = (rr.top - mr.top - 3 - (sr.bottom - window.innerHeight + 4)) + 'px';
        });
      } else {
        r.addEventListener('mouseenter', () => m.querySelectorAll(':scope > .isim-menu').forEach(s => s.remove()));
      }
      if (!it.disabled && it.action) r.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); closeMenu(); it.action(); });
      m.appendChild(r);
    }
    m.style.left = x + 'px'; m.style.top = y + 'px';
    return m;
  }
  function showMenu(x, y, items) {
    closeMenu();
    menuEl = buildMenu(items, 0, 0);
    menuEl.classList.add('isim-menu-root');
    document.body.appendChild(menuEl);
    const r = menuEl.getBoundingClientRect();
    menuEl.style.left = clamp(x, 0, window.innerWidth - r.width - 4) + 'px';
    menuEl.style.top = clamp(y, 0, window.innerHeight - r.height - 4) + 'px';
  }
  const docDown = (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); };
  const docKey = (e) => { if (e.key === 'Escape') { closeMenu(); closeDialog(); } };
  document.addEventListener('mousedown', docDown, true);
  document.addEventListener('keydown', docKey);
  cleanups.push(() => { document.removeEventListener('mousedown', docDown, true); document.removeEventListener('keydown', docKey); closeMenu(); });

  return { showMenu, closeMenu };
}
