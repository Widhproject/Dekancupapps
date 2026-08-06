// Service worker sederhana untuk Dekan Cup FST — Live Score
// Tujuannya cuma dua:
// 1) Supaya Chrome di Android bisa menampilkan prompt "Install App" otomatis
//    (syaratnya: ada service worker + manifest dengan icon PNG 192/512).
// 2) Cache "app shell" (HTML/CSS/JS/icon) biar loading kedua-dst lebih cepat.
//
// PENTING: data pertandingan/skor (permintaan ke /api/... dan koneksi socket.io)
// SENGAJA tidak di-cache sama sekali — selalu ambil langsung dari server, supaya
// skor live tidak pernah menampilkan data basi.

const CACHE_NAME = 'dekancup-shell-v8';

const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './assets/dekancup-logo.svg',
  './assets/logos/icon-192.png',
  './assets/logos/icon-512.png',
  './assets/logos/icon-512-maskable.png',
  './assets/logos/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Data live (API & socket.io) & permintaan lintas-origin: jangan pernah di-cache.
  const isApiOrSocket = url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/');
  if (isApiOrSocket || url.origin !== self.location.origin) {
    return; // biarkan browser fetch seperti biasa (network-only)
  }

  // App shell: cache-first, lalu update cache di belakang layar (stale-while-revalidate)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // offline & tidak ada di cache -> biarkan gagal secara wajar

      return cached || networkFetch;
    })
  );
});

// ---- Web Push: fitur "🔔 Notify Me" per-HIMA ----
// Server (backend/src/lib/push.js) mengirim payload JSON: { title, body, url }.
self.addEventListener('push', (event) => {
  let data = { title: 'Dekan Cup FST 2026', body: 'Ada update baru!', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // kalau payload bukan JSON valid, tetap tampilkan notifikasi generik daripada gagal total
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './assets/logos/icon-192.png',
      badge: './assets/logos/icon-192.png',
      data: { url: data.url || '/' },
      tag: data.url, // notifikasi baru utk match yg sama akan menimpa yg lama, bukan menumpuk
    })
  );
});

// Klik notifikasi -> buka (atau fokuskan) tab aplikasi ke halaman terkait.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
