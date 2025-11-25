const CACHE_NAME = 'unistock-v11-fix-paths'; // Incrementamos versión

const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/images/icon.png',
  '/images/utsjr.png'
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

  event.respondWith(
    (async () => {
      try {
        // 1. Intentar buscar en caché primero (Cache First)
        const cachedResponse = await caches.match(event.request, { ignoreSearch: true });
        if (cachedResponse) {
          return cachedResponse;
        }

        // 2. Si no está en caché, intentar red
        const networkResponse = await fetch(event.request);
        return networkResponse;

      } catch (error) {
        // 3. FALLBACK OFFLINE
        console.log('[SW] Fallo de red, intentando fallback offline para:', event.request.url);

        // Si es una navegación (HTML)
        if (event.request.mode === 'navigate' ||
          (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {

          // Intentar devolver index.html desde caché
          const cache = await caches.open(CACHE_NAME);
          const cachedIndex = await cache.match('/index.html');
          return cachedIndex || cache.match('/');
        }

        // Para otros recursos, devolver un error 404 o una respuesta vacía válida para evitar "Failed to convert value to 'Response'"
        return new Response('Offline', { status: 404, statusText: 'Offline' });
      }
    })()
  );
});