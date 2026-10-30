// Service worker بسيط لنسخة الويب (PWA): يخزّن ملفات الواجهة فقط
const C = 'tamy-shell-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return; // لا نلمس البث أو الـAPI
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
