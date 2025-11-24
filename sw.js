const CACHE_NAME = 'unistock-v8-offline-fix'; // Incrementamos versión para forzar actualización

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
  self.skipWaiting(); // Fuerza al SW a activarse de inmediato
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando archivos críticos...');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('[SW] Error en instalación:', err))
  );
});

// ACTIVACIÓN
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
  return self.clients.claim(); // Toma control de la página inmediatamente
});

// INTERCEPCIÓN DE RED (LA CORRECCIÓN ESTÁ AQUÍ)
self.addEventListener('fetch', event => {
  // Ignoramos peticiones que no sean GET (como las de Firebase o POST)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 1. Si está en caché, devolverlo (Rápido y Offline)
        if (response) {
          return response;
        }
        
        // 2. Si no está en caché, intentar red
        return fetch(event.request).catch(() => {
            // 3. FALLBACK OFFLINE: Si falla la red...
            
            // Si la petición es una navegación a una página (HTML)
            if (event.request.mode === 'navigate' || 
                (event.request.method === 'GET' && event.request.headers.get('accept').includes('text/html'))) {
                // Devolver siempre el index.html (App Shell)
                return caches.match('./index.html');
            }
        });
      })
  );
});