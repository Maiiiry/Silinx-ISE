// UI tests' helpers for printing (#1509): the print page captured instead of opened in a new window, Print's state.

// the print page is written into a frame of the page instead of a new window (window.open stubbed), its print() counted
export const capturePrints = (page) => page.eval(() => {
  window.__prints = [];
  window.open = () => {
    const f = document.createElement('iframe');
    f.className = 'test-print';
    f.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:700px;z-index:99999;background:#fff';
    document.body.append(f);
    const w = { document: f.contentDocument, print() { window.__prints.push(f.contentDocument.documentElement.outerHTML); f.remove(); } };
    return w;
  };
});
export const printed = async (page, n) => {
  await page.waitFor((k) => window.__prints.length >= k, [n], { what: `print #${n}`, timeout: 15000 });
  return page.eval((k) => window.__prints[k - 1], n);
};
// (the toolbar's buttons follow the document in front within a second)
export const printOn = (page) => page.waitFor(() => !document.querySelector('#toolbar .tb-btn[data-cmd=print]').disabled, [], { what: 'Print enabled' }).then(() => true);
export const fileMenuPrint = async (page) => (await page.openMenu('File').finally(() => page.closeMenus())).find((i) => i.label === 'Print…');
