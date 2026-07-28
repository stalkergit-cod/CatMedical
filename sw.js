const CACHE_NAME = 'dva_hvosta-cache-v1'; // Новая версия кэша!
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    })
  );
  return self.clients.claim();
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      // Если приложение уже открыто, просто фокусируемся на нем
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      // Если закрыто - открываем
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request).then(
          response => {
            if(!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, responseToCache));
            return response;
          }
        ).catch(() => {
           if (event.request.mode === 'navigate') {
               return caches.match('./index.html');
           }
        });
      })
  );
});
