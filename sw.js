const CACHE_NAME = 'unistock-offline-v6'; // Versión actualizada

// Archivos críticos para el App Shell
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
  self.skipWaiting(); // Forzar activación inmediata
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando archivos críticos...');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('[SW] Error en instalación:', err))
  );
});

// ACTIVACIÓN (Limpieza)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Borrando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Tomar control inmediatamente
});

// INTERCEPCIÓN (Offline First)
self.addEventListener('fetch', event => {
  // Ignorar peticiones no-GET (como subidas a Firebase)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 1. Si está en caché, devolverlo
        if (response) {
          return response;
        }
        
        // 2. Si no, ir a la red
        return fetch(event.request).catch(() => {
            // 3. Si falla la red y es una navegación (HTML), devolver index.html
            // Esto soluciona el "error de conexión" al recargar
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        });
      })
  );
});