const CACHE_NAME = 'unistock-v9-offline-fix'; // Incrementamos versión para forzar actualización

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

// INTERCEPCIÓN DE RED (MEJORADA)
self.addEventListener('fetch', event => {
  // Ignoramos peticiones que no sean GET
  if (event.request.method !== 'GET') return;

  // Estrategia: Cache First, falling back to Network, falling back to Offline Page
  event.respondWith(
    (async () => {
      try {
        // 1. Intentar buscar en caché
        const cachedResponse = await caches.match(event.request, { ignoreSearch: true });
        if (cachedResponse) {
          return cachedResponse;
        }

        // 2. Si no está en caché, intentar red
        const networkResponse = await fetch(event.request);
        return networkResponse;

      } catch (error) {
        // 3. FALLBACK OFFLINE: Si falla la red (y no estaba en caché)
        console.log('[SW] Fallo de red, intentando fallback offline para:', event.request.url);

        // Si la petición es una navegación a una página (HTML)
        if (event.request.mode === 'navigate' || 
            (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
            // Devolver siempre el index.html (App Shell)
            const indexCache = await caches.match('./index.html');
            return indexCache || caches.match('./'); // Intento doble por seguridad
        }
        
        // Aquí podrías retornar una imagen placeholder si falla una imagen, etc.
      }
    })()
  );
});