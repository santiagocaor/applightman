// Cambiar la versión solo sirve para limpiar la caché: los archivos de la app se piden primero a la red,
// de modo que cada despliegue llega a los dispositivos instalados sin tocar este archivo.
const CACHE_NAME = 'lightman-cache-v101';

// Con mala señal no se espera a la red más de este tiempo si hay una copia guardada
const NETWORK_TIMEOUT_MS = 3000;

const CORE_URLS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/utils.js',
  './js/store.js',
  './js/ui.js',
  './js/charts.js',
  './js/api.js',
  './manifest.json',
  './assets/img/lightman_car.png',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png'
];

// [FIX M-3] CDNs externos ahora también se guardan en caché para modo offline completo
const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.6.1',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Los archivos core deben guardarse sí o sí
      return cache.addAll(CORE_URLS).then(() => {
        // Los CDNs son best-effort: si fallan, el SW se instala igual
        return Promise.allSettled(CDN_URLS.map(url => cache.add(url)));
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('ServiceWorker: Borrando caché antigua:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Archivos de la app: primero la red, para que las actualizaciones lleguen; sin red, la copia guardada
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const network = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS));

  const quickResponse = await Promise.race([network.catch(() => null), timeout]);
  if (quickResponse) return quickResponse;

  const cached = await cache.match(request)
    || (request.mode === 'navigate' ? await cache.match('./index.html') : undefined);
  // Sin copia guardada solo queda esperar a la red, aunque tarde o termine en error
  return cached || network;
}

// Librerías y fuentes externas: no cambian, primero la copia guardada
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  // Las peticiones a Google Apps Script (y cualquier escritura) las maneja directamente el navegador
  if (request.method !== 'GET'
    || request.url.includes('script.google.com')
    || request.url.includes('script.googleusercontent.com')) {
    return;
  }

  const isSameOrigin = new URL(request.url).origin === self.location.origin;
  event.respondWith(isSameOrigin ? networkFirst(request) : cacheFirst(request));
});
