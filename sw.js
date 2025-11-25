const CACHE_NAME = 'unistock-v15-final'; // Versión final

const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/images/icon.png',
  '/images/utsjr.png',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando...');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('[SW] Error:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      try {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;

        return await fetch(event.request);
      } catch (error) {
        if (event.request.mode === 'navigate') {
          const cache = await caches.open(CACHE_NAME);
          const index = await cache.match('/index.html');
          return index || cache.match('/');
        }
      }
    })()
  );
});