// Simple offline cache: cache-first for bundled files, refreshed in the background.
const CACHE = 'ar-orchestra-v7';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'instruments.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-512.png',
  ...['violin','viola','cello','doublebass','flute','clarinet','oboe','bassoon','trumpet','trombone','frenchhorn','tuba','bassdrum','triangle','castanets','guiro'].map(n => `assets/${n}.png`), 'assets/crest.png', 'fonts/huninn-frame.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
