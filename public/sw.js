/*
 * Service worker: keeps the screens working when the network drops, so a
 * controller on a site with poor signal still gets the app to load.
 * Asset data itself always comes from the server - never from the cache,
 * because a stale asset register would be worse than an honest error.
 */

const VERSION = 'v1';
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

  // Everything else: serve the cached copy at once, refresh it in the background
  // so the next load picks up an update on its own.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
