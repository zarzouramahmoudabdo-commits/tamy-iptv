// Service worker: network-first (always tries the live site, falls back to cache offline)
const C = 'tamy-shell-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return; // never touch streams/APIs
  e.respondWith((async () => {
    const c = await caches.open(C);
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(e.request.url, { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch (err) {
      const m = await c.match(e.request) || (e.request.mode === 'navigate' ? await c.match('index.html') : null);
      return m || fetch(e.request);
    }
  })());
});
