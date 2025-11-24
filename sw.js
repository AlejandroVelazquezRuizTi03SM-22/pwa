const CACHE_NAME = 'unistock-v7-fix'; // Cambiamos versión

const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './images/icon.png',
  './images/utsjr_logo.png'
];

// INSTALACIÓN
self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => console.error('Fallo caché', err))
  );
});

// ACTIVACIÓN
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

// INTERCEPCIÓN (FALLBACK DE NAVEGACIÓN)
self.addEventListener('fetch', event => {
  // Ignorar peticiones que no sean GET (como las de Firebase)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 1. Si está en caché, devolverlo
        if (response) {
          return response;
        }
        
        // 2. Intentar red
        return fetch(event.request).catch(() => {
            // 3. SI FALLA LA RED Y ES UNA PÁGINA (HTML)
            // Devolver siempre index.html (Esto arregla el error al recargar)
            if (event.request.headers.get('accept').includes('text/html')) {
                return caches.match('./index.html');
            }
        });
      })
  );
});