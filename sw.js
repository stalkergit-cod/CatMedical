const CACHE_NAME = 'dvahvosta-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/app.js',
  '/icon-192.png',
  '/icon-512.png'
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

// Хранилище лекарств для фоновых уведомлений
let medsData = [];
let petsData = [];

// --- ГЛАВНОЕ: Обработка сообщений от приложения ---
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, tag } = event.data;
    
    self.registration.showNotification(title, {
      body: body,
      icon: icon || '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      tag: tag,
      renotify: true,
      requireInteraction: false,
      data: { url: '/' },
      silent: false // Звук уведомления (системный)
    });
  }
  
  // Синхронизация данных о лекарствах
  if (event.data && event.data.type === 'SYNC_MEDS') {
    medsData = event.data.meds || [];
    petsData = event.data.pets || [];
    console.log('SW: Получены данные о лекарствах', medsData.length);
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

// Фоновая проверка уведомлений (периодическая синхронизация)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'med-check') {
    event.waitUntil(checkAndSendNotifications());
  }
});

// Проверка и отправка уведомлений
async function checkAndSendNotifications() {
  const now = new Date();
  const currentTimeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
  
  medsData.forEach(med => {
    if (med.days.includes(dayOfWeek) && med.time === currentTimeStr) {
      const pet = petsData.find(p => p.id === med.petId);
      const petName = pet ? pet.name : 'Питомец';
      
      const title = `💊 Время лекарства: ${med.name}`;
      const body = `Для ${petName}: ${med.dosage || ''} ${med.notes ? '(' + med.notes + ')' : ''}`;
      
      self.registration.showNotification(title, {
        body: body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'med-' + med.id,
        renotify: true,
        requireInteraction: false,
        data: { url: '/' },
        silent: false
      });
    }
  });
}
