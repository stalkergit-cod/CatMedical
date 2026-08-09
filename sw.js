const CACHE_NAME = 'dvahvosta-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
  // Добавьте сюда пути к вашим CSS/JS, если они локальные
];

// Установка SW
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // Активировать сразу
});

// Активация и очистка старого кэша
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Обработка запросов
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});

// --- ГЛАВНОЕ: Обработка уведомлений ---
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, tag } = event.data;
    
    self.registration.showNotification(title, {
      body: body,
      icon: icon || '/icon-192.png', // Иконка в строке состояния
      badge: '/icon-192.png',       // Маленькая иконка в статус-баре Android
      vibrate: [200, 100, 200],     // Вибрация
      tag: tag,                     // Группировка уведомлений
      renotify: true,
      requireInteraction: false,    // Чтобы уведомление исчезало само (опционально)
      data: { url: '/' }            // Данные при клике
    });
  }
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
