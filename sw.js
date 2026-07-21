const CACHE_NAME = 'kotomedic-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Установка: кэшируем базовые файлы
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Активация: удаляем старый кэш при обновлении
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

// Перехват запросов: сначала ищем в кэше, потом в сети
self.addEventListener('fetch', event => {
  // Не кэшируем запросы к API (если бы они были), только статику
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Если есть в кэше — отдаем из кэша
        if (response) {
          return response;
        }
        // Иначе идем в сеть
        return fetch(event.request).then(
          response => {
            // Проверяем, что ответ валидный
            if(!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
              return response;
            }
            // Клонируем и сохраняем в кэш на будущее
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return response;
          }
        ).catch(() => {
          // Если интернета нет и в кэше нет — можно отдать заглушку (опционально)
        });
      })
  );
});