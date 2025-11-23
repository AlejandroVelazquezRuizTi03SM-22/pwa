const CACHE_NAME = 'unistock-offline-final-v1';

// Archivos locales críticos para el funcionamiento offline
const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './images/icon.png',
  './images/utsjr_logo.png'
];

// INSTALACIÓN: Guardamos todo en caché
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cacheando archivos críticos...');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('Error caché:', err))
  );
});

// ACTIVACIÓN: Limpiamos cachés viejos
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
});

// INTERCEPTOR DE RED (Estrategia Cache-First)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 1. Si está en caché, entrégalo (Rápido y Offline)
        if (response) {
          return response;
        }
        
        // 2. Si no, intenta buscarlo en internet
        return fetch(event.request).catch(() => {
            // 3. Si no hay internet y no estaba en caché, y es una navegación
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        });
      })
  );
});