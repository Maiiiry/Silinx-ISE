// The browser edition's service worker (#1051): the site's sw.js, bundled by scripts/pwa.mjs (from
// scripts/build-standalone.mjs --site), SILINX_SW_BUILD the build's label (a new build: a new worker,
// which keeps its own copy of the page). Registered by web/js/pwa.js, scoped to the edition's folder.
// What it does with each request: web/js/sw-policy.js.
/* global SILINX_SW_BUILD */
import { ASSET_CACHE } from './asset-cache.js';
import { SHELL, pageCacheName, route, staleCaches } from './sw-policy.js';

const scope = self.registration.scope;
const CACHE = pageCacheName(scope, SILINX_SW_BUILD);

// installed: the page and SHELL kept (from the network, not the HTTP cache), then this worker in place of
// the last one at once (the open pages' next requests are its own)
self.addEventListener('install', e => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll([scope, ...SHELL.map(f => new URL(f, scope).href)].map(u => new Request(u, { cache: 'reload' })));
  await self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const n of staleCaches(await caches.keys(), scope, CACHE)) await caches.delete(n);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const how = route(e.request, scope);
  if (how === 'page') e.respondWith(page(e.request));
  else if (how === 'shell') e.respondWith(kept(CACHE, e.request, false));
  else if (how === 'asset') e.respondWith(kept(ASSET_CACHE, e.request, true));
});

// the page: the network's (kept for next time), the kept one when there is no network
async function page(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200) await cache.put(scope, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(scope);
    if (hit) return hit;
    throw err;
  }
}
// from the cache, else from the network (put into the cache: fill)
async function kept(name, req, fill) {
  const cache = await caches.open(name);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  if (fill && res.ok && res.status === 200) cache.put(req.url, res.clone()).catch(() => {});
  return res;
}
