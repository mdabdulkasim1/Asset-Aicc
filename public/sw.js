/*
 * Service worker: keeps the screens working when the network drops, so a
 * controller on a site with poor signal still gets the app to load.
 * Asset data itself always comes from the server - never from the cache,
 * because a stale asset register would be worse than an honest error.
 */

const VERSION = 'v2';
const CACHE = `asset-register-${VERSION}`;

const SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/barcode.js',
  '/js/api.js',
  '/js/labels.js',
  '/js/app.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function offlineJson() {
  return new Response(
    JSON.stringify({ error: 'No connection to the register. Check the network and try again.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Live data only.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(offlineJson));
    return;
  }

  // Opening the app: try the server, fall back to the cached page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || offlineJson()))
    );
    return;
  }

  // Pictures never change once published, so they come from the cache.
  if (/\.(png|svg|jpg|jpeg|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return (
          cached ||
          fetch(request).then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
        );
      })
    );
    return;
  }

  // The screens themselves come from the server whenever it can be reached, so
  // an update is in use the moment it is deployed. The cached copy is the
  // fallback for when there is no network, not the first choice - serving a
  // saved copy first meant people kept seeing the previous version of the app.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || offlineJson()))
  );
});
