// ARIA Périscolaire — Service Worker
const CACHE_NAME = 'aria-peri-v1';
const ASSETS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:wght@700;800&display=swap'
];

// Install: cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first with cache fallback
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).then(resp => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return resp;
    }).catch(() => caches.match(e.request))
  );
});

// Push notifications
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'ARIA', body: 'Nouveau message' };
  e.waitUntil(
    self.registration.showNotification(data.title || 'ARIA Périscolaire', {
      body: data.body || 'Notification',
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"%3E%3Crect width="512" height="512" rx="96" fill="%236c63ff"/%3E%3Ctext x="256" y="320" text-anchor="middle" font-family="serif" font-size="240" font-weight="800" fill="white"%3EAR%3C/text%3E%3C/svg%3E',
      badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"%3E%3Crect width="96" height="96" rx="20" fill="%236c63ff"/%3E%3C/svg%3E',
      vibrate: [200, 100, 200],
      tag: 'aria-msg',
      renotify: true
    })
  );
});

// Click notification: open app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) {
        list[0].focus();
        list[0].postMessage({ type: 'open-messages' });
      } else {
        clients.openWindow('./index.html');
      }
    })
  );
});
