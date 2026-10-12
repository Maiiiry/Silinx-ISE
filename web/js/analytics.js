// Usage counts of the published site (https://pmnmalo.github.io/Silinx-ISE/, its dev/ edition):
// GoatCounter (goatcounter.com: no cookies, no personal data), loaded only there by the site's build
// (scripts/site-analytics.mjs, .github/workflows/pages.yml). countEvent() counts what was done, never
// its content (no project or file names); elsewhere (the application, the downloaded file, the
// tests) there is no counter and it does nothing.
// the events: the name counted, its title in GoatCounter's dashboard
export const EVENTS = {
  'new-project': 'New project',
  simulate: 'Behavioral simulation',
  implement: 'Implement Design',
  bitstream: 'Bitstream generated',
  program: 'Board programmed',
};
const done = new Set();

/** Count an event (once a page load for each name: how many sessions used it, not how often). */
export function countEvent(name) {
  if (!EVENTS[name] || done.has(name)) return;
  const gc = globalThis.goatcounter;
  if (!gc?.count) return;
  done.add(name);
  try { gc.count({ path: `event/${name}`, title: EVENTS[name], event: true }); } catch { /* never in the way */ }
}
