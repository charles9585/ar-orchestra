// Simple offline cache: cache-first for bundled files, refreshed in the background.
const CACHE = 'ar-orchestra-v9';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'photos-config.js', 'vendor/qrcode.js', 'instruments.js', 'frames.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-512.png',
  ...['violin','viola','cello','doublebass','flute','clarinet','oboe','bassoon','trumpet','trombone','frenchhorn','tuba','bassdrum','triangle','castanets','guiro'].map(n => `assets/${n}.png`), 'assets/crest.png', 'fonts/huninn-frame.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  // Only cache same-origin GET of the static app. Never cache the photo Worker (other origin, or /upload).
  const reqUrl = new URL(e.request.url);
  if (e.request.method !== 'GET' || reqUrl.origin !== location.origin) return;
  if (reqUrl.pathname.indexOf('/upload') !== -1 || /\/([pi])\/[0-9a-f]{32}/i.test(reqUrl.pathname)) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
