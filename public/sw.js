const CACHE_NAME = 'gb-cache-v5';
const ASSETS = [
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/dexie/dist/dexie.js',
  './js/app.js',
  './js/core/db.js',
  './js/core/event-bus.js',
  './js/core/sync.js',
  './js/core/utils.js',
  './js/views/products-view.js',
  './js/views/sales-view.js',
  './js/views/purchases-view.js',
  './js/views/members-view.js',
  './js/modals/modal-product.js',
  './js/modals/modal-customer.js',
  './js/modals/modal-supplier.js',
  './js/modals/modal-sales.js',
  './js/modals/modal-purchase.js',
  './js/modals/modal-receive.js',
  './js/modals/modal-shipment.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => {
            return key !== CACHE_NAME;
          })
          .map((key) => {
            return caches.delete(key);
          }),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request);
    }),
  );
});
