// UI: ISim's context menu (web/js/isim-menu.js, #405: out of mountISim), mounted alone in the page: its items (checked,
// disabled, separators), a submenu, an action run and the menu closed, a click elsewhere, Escape (the dialog closed
// too), the menu kept inside the window, and its cleanup.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#405 ISim context menu: items, a submenu, an action, a click elsewhere, Escape, the window\'s edge, the cleanup', E, async (page) => {
  const out = await page.eval(async () => {
    const { mountMenu } = await import('/js/isim-menu.js');
    const cleanups = [], calls = [];
    const { showMenu, closeMenu } = mountMenu({ cleanups, closeDialog: () => calls.push('closeDialog') });
    const root = () => document.querySelector('.isim-menu-root');
    const items = (m) => [...m.querySelectorAll(':scope > .isim-menu-item, :scope > .isim-menu-sep')].map((el) => (el.classList.contains('isim-menu-sep') ? '-'
      : `${el.querySelector('.chk').textContent}${el.querySelector('.lbl').textContent}${el.querySelector('.arr').textContent}${el.classList.contains('dis') ? ' (disabled)' : ''}`));
    const down = (el) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const r = {};
    const menu = [
      { label: 'One', action: () => calls.push('one') },
      { label: 'Two', disabled: true, action: () => calls.push('two') },
      { sep: true },
      { label: 'Radix', sub: [{ label: 'Binary', checked: true, action: () => calls.push('bin') }, { label: 'Hex', action: () => calls.push('hex') }] },
    ];
    showMenu(10, 20, menu);
    r.items = items(root());
    r.at = [root().style.left, root().style.top];
    // a disabled item does nothing; the submenu on hover, its action run, the menu closed
    down(root().children[1]);
    r.afterDisabled = [calls.length, !!root()];
    root().children[3].dispatchEvent(new MouseEvent('mouseenter'));
    const sub = root().querySelector(':scope > .isim-menu');
    r.sub = items(sub);
    down(sub.children[1]);
    r.afterSub = [calls.splice(0), !!root()];
    // an action on the first level
    showMenu(10, 20, menu);
    down(root().children[0]);
    r.afterOne = [calls.splice(0), !!root()];
    // a click elsewhere closes it; one inside does not
    showMenu(10, 20, menu);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    r.elsewhere = !!root();
    // Escape: the menu and the dialog closed
    showMenu(10, 20, menu);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    r.escape = [!!root(), calls.splice(0)];
    // past the window's edge: inside it
    showMenu(window.innerWidth + 100, window.innerHeight + 100, menu);
    const b = root().getBoundingClientRect();
    r.inside = b.right <= window.innerWidth && b.bottom <= window.innerHeight;
    closeMenu();
    r.closed = !!root();
    // the cleanup: the menu removed, Escape no longer heard
    showMenu(10, 20, menu);
    for (const c of cleanups.splice(0)) c();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    r.cleaned = [!!root(), calls.splice(0)];
    return r;
  });
  assert.deepEqual(out.items, ['One', 'Two (disabled)', '-', 'Radix▸']);
  assert.deepEqual(out.at, ['10px', '20px']);
  assert.deepEqual(out.afterDisabled, [0, true]);
  assert.deepEqual(out.sub, ['✓Binary', 'Hex']);
  assert.deepEqual(out.afterSub, [['hex'], false]);
  assert.deepEqual(out.afterOne, [['one'], false]);
  assert.equal(out.elsewhere, false);
  assert.deepEqual(out.escape, [false, ['closeDialog']]);
  assert.equal(out.inside, true);
  assert.equal(out.closed, false);
  assert.deepEqual(out.cleaned, [false, []]);
});
