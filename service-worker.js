/* 魔王之女 — service worker. Paths are relative to this file, so it works under any subpath. */
const CACHE = 'maou-otome-1792327288';
const CORE = ['./', './index.html', './renpy-pre.js', './renpy.js', './renpy.wasm', './renpy.data',
              './game.zip', './manifest.json', './web-presplash.jpg',
              './icons/icon-180x180.png', './icons/icon-192x192.png', './icons/icon-512x512.png'];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch((err) => console.log('precache failed', err)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        for (const k of await caches.keys()) {
            if (k !== CACHE) await caches.delete(k);
        }
        await self.clients.claim();
    })());
});

async function handle(request) {
    const cache = await caches.open(CACHE);
    const url = request.url;

    // Ren'Py's own precache protocol (pwa_catalog.json?cached / ?uncached).
    if (url.endsWith('?cached')) {
        const rv = await cache.match(url.replace('?cached', '?uncached'));
        return rv || new Response('Not found in cache.', { status: 404, statusText: 'Not found in cache.' });
    }

    // Navigations: network first (picks up a new deploy), cache fallback (offline / fast).
    if (request.mode === 'navigate') {
        const cached = (await cache.match('./index.html')) || (await cache.match('./'));
        const net = fetch(request).then((resp) => {
            if (resp.ok) cache.put('./index.html', resp.clone());
            return resp;
        });
        if (!cached) return net;
        // Slow or no network: open from cache after 2.5 s.
        const timeout = new Promise((res) => setTimeout(() => res(cached), 2500));
        return Promise.race([net.catch(() => cached), timeout]);
    }

    // Everything else: cache first, then network (and store).
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    const resp = await fetch(request);
    if (resp.status === 200 && resp.type !== 'opaque') {
        cache.put(request, resp.clone());
    }
    return resp;
}

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET' || !req.url.startsWith(self.location.origin) || req.headers.has('range')) return;
    e.respondWith(handle(req));
});

self.addEventListener('message', (e) => {
    if (e.data && e.data[0] === 'clearCache') caches.delete(CACHE);
});
